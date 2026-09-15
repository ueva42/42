/**
 * Parser für Copy-&-Paste-Levelpläne (Fach / Thema / Unterthema / Rookie / Operator / Street Legend).
 */

function defaultNormalizeSubject(raw) {
  const trimmed = String(raw || "").trim();
  return { subject: trimmed, known: Boolean(trimmed) };
}

export function parseLevelplanImportText(raw, normalizeImportSubject = defaultNormalizeSubject) {
  const lines = String(raw || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const isNumberOnly = (line) => /^\d+\.?$/.test(line);
  const isTierKeyword = (line) => /^(Rookie|Operator|Street[\s-]?Legend)[:\s]*$/i.test(line);
  const nextMeaningful = (fromIndex) => {
    for (let i = fromIndex; i < lines.length; i++) {
      if (!isNumberOnly(lines[i])) return lines[i];
    }
    return null;
  };

  let currentFach = "";
  let currentThema = "";
  let current = null;
  let pendingTier = null;
  const rows = [];

  const pushCurrent = () => {
    if (!current) return;
    rows.push({ ...current });
    current = null;
    pendingTier = null;
  };

  const startUnterthema = (name) => {
    pushCurrent();
    current = {
      fach: currentFach,
      thema: currentThema,
      unterthema: name,
      rookieZiel: "",
      operatorZiel: "",
      streetLegendZiel: ""
    };
    pendingTier = null;
  };

  const setTierText = (tier, text) => {
    if (!current) return;
    if (tier === "rookie") current.rookieZiel = text;
    if (tier === "operator") current.operatorZiel = text;
    if (tier === "legend") current.streetLegendZiel = text;
    pendingTier = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isNumberOnly(line)) continue;

    if (pendingTier) {
      setTierText(pendingTier, line);
      continue;
    }

    const fachMatch = line.match(/^Fach[:\s]+(.+)$/i);
    if (fachMatch) {
      pushCurrent();
      currentFach = normalizeImportSubject(fachMatch[1].trim()).subject;
      currentThema = "";
      continue;
    }

    const themaMatch = line.match(/^Thema[:\s]+(.+)$/i);
    if (themaMatch) {
      pushCurrent();
      currentThema = themaMatch[1].trim();
      continue;
    }

    const unterMatch = line.match(/^Unterthema[:\s]+(.+)$/i);
    if (unterMatch) {
      startUnterthema(unterMatch[1].trim());
      continue;
    }

    const rookieMatch = line.match(/^Rookie[:\s]+(.+)$/i);
    if (rookieMatch) {
      if (!current) startUnterthema(currentThema || "Unbenannt");
      setTierText("rookie", rookieMatch[1].trim());
      continue;
    }
    if (/^Rookie[:\s]*$/i.test(line)) {
      if (!current) startUnterthema(currentThema || "Unbenannt");
      pendingTier = "rookie";
      continue;
    }

    const operatorMatch = line.match(/^Operator[:\s]+(.+)$/i);
    if (operatorMatch) {
      if (!current) startUnterthema(currentThema || "Unbenannt");
      setTierText("operator", operatorMatch[1].trim());
      continue;
    }
    if (/^Operator[:\s]*$/i.test(line)) {
      if (!current) startUnterthema(currentThema || "Unbenannt");
      pendingTier = "operator";
      continue;
    }

    const legendMatch = line.match(/^Street[\s-]?Legend[:\s]+(.+)$/i);
    if (legendMatch) {
      if (!current) startUnterthema(currentThema || "Unbenannt");
      setTierText("legend", legendMatch[1].trim());
      continue;
    }
    if (/^Street[\s-]?Legend[:\s]*$/i.test(line)) {
      if (!current) startUnterthema(currentThema || "Unbenannt");
      pendingTier = "legend";
      continue;
    }

    const bareBlock = [];
    for (let j = i; j < lines.length; j++) {
      if (isNumberOnly(lines[j])) continue;
      if (isTierKeyword(lines[j])) break;
      if (/^(Fach|Thema|Unterthema)\b/i.test(lines[j])) break;
      bareBlock.push(lines[j]);
    }

    if (bareBlock.length && isTierKeyword(nextMeaningful(i + bareBlock.length))) {
      if (bareBlock.length === 1) {
        // Häufiges Paste-Format: nur die Überschrift, dann Rookie/Operator/Street Legend.
        if (!currentThema) currentThema = bareBlock[0];
        startUnterthema(bareBlock[0]);
      } else {
        if (!currentThema) currentThema = bareBlock[0];
        startUnterthema(bareBlock[1]);
      }
      i += bareBlock.length - 1;
      continue;
    }

    if (!currentThema) {
      currentThema = line;
    } else {
      startUnterthema(line);
    }
  }

  pushCurrent();

  return normalizeLevelplanImportRows(rows, null, normalizeImportSubject);
}

/** Status/Missing neu berechnen; optional Fach aus Dropdown überschreiben. */
export function normalizeLevelplanImportRows(
  rows,
  subjectOverride = null,
  normalizeImportSubject = defaultNormalizeSubject
) {
  const override = subjectOverride ? normalizeImportSubject(subjectOverride) : null;

  return (Array.isArray(rows) ? rows : []).map((row) => {
    const rawFach = override?.subject || row.fach || row.subject || "";
    const normalizedFach = normalizeImportSubject(rawFach);
    const fach = normalizedFach.subject;
    let thema = String(row.thema || row.topic || "").trim();
    let unterthema = String(row.unterthema || row.goal || row.goal_text || "").trim();
    const rookieZiel = String(row.rookieZiel || row.rookie_goal_text || "").trim();
    const operatorZiel = String(row.operatorZiel || row.operator_goal_text || "").trim();
    const streetLegendZiel = String(
      row.streetLegendZiel || row.street_legend_goal_text || ""
    ).trim();

    if (!thema && unterthema && unterthema !== "Unbenannt") thema = unterthema;
    if (!unterthema && thema) unterthema = thema;

    const missing = [];
    if (!fach) missing.push("fach");
    if (!thema) missing.push("thema");
    if (!unterthema) missing.push("unterthema");
    if (!rookieZiel) missing.push("rookie");
    if (!operatorZiel) missing.push("operator");
    if (!streetLegendZiel) missing.push("streetLegend");

    let status = "OK";
    if (missing.length) status = "Unvollständig";
    else if (fach && !normalizedFach.known && !override?.known) status = "Unbekanntes Fach";

    return {
      fach,
      thema,
      unterthema,
      rookieZiel,
      operatorZiel,
      streetLegendZiel,
      status,
      missing
    };
  });
}
