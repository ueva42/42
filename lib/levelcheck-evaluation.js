export const LEVELCHECK_PASS_PERCENT = 70;

export const LEVELCHECK_EVAL_STATUSES = [
  "not_evaluated",
  "passed",
  "failed"
];

export const LEVELCHECK_EVAL_STATUS_LABELS = {
  not_evaluated: "Noch nicht bewertet",
  passed: "Bestanden",
  failed: "Nicht bestanden"
};

export function normalizeLevelcheckEvalStatus(raw) {
  const key = String(raw ?? "").trim().toLowerCase();
  if (key === "bestanden" || key === "pass") return "passed";
  if (key === "nicht_bestanden" || key === "failed" || key === "fail") return "failed";
  if (key === "offen" || key === "pending" || key === "not_evaluated") return "not_evaluated";
  return LEVELCHECK_EVAL_STATUSES.includes(key) ? key : null;
}

/**
 * Prozent optional; null/undefined = kein Wert.
 * Ganze Zahl 0–100, sonst Fehlerobjekt.
 */
export function parseLevelcheckPercent(raw) {
  if (raw === null || raw === undefined || raw === "") {
    return { ok: true, value: null };
  }
  const n = typeof raw === "number" ? raw : Number(String(raw).trim());
  if (!Number.isInteger(n) || n < 0 || n > 100) {
    return { ok: false, error: "Prozentwert muss eine ganze Zahl zwischen 0 und 100 sein." };
  }
  return { ok: true, value: n };
}

/** Bestanden wird bewusst gesetzt – nie aus Prozent abgeleitet (Lehrkraft-Status). */
export function resolveLevelcheckEvalStatus(statusRaw, _percent) {
  const status = normalizeLevelcheckEvalStatus(statusRaw);
  if (!status) {
    return { ok: false, error: "Ungültiger Bewertungsstatus." };
  }
  return { ok: true, status };
}

/** Schüler-Selbstangabe: ab 70 % nächstes Thema freischalten. */
export function isLevelcheckPassPercent(percent) {
  return Number.isInteger(percent) && percent >= LEVELCHECK_PASS_PERCENT;
}

/**
 * Themen einer Klasse/Fach-Liste mit Unlock-Status anreichern (sortOrder).
 * Erstes Thema immer offen; Folgethemen erst nach ≥70 % beim Vorgänger.
 */
export function applyLevelcheckTopicUnlocks(topics, passPercent = LEVELCHECK_PASS_PERCENT) {
  const list = Array.isArray(topics) ? [...topics] : [];
  list.sort((a, b) => {
    const so = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
    if (so !== 0) return so;
    return String(a.name || "").localeCompare(String(b.name || ""), "de");
  });

  let prevPassed = true;
  return list.map((topic, index) => {
    const percent =
      topic.levelcheckPercent == null || topic.levelcheckPercent === ""
        ? null
        : Number(topic.levelcheckPercent);
    const passed = Number.isInteger(percent) && percent >= passPercent;
    const locked = index > 0 && !prevPassed;
    prevPassed = passed;
    return {
      ...topic,
      levelcheckPercent: Number.isInteger(percent) ? percent : null,
      levelcheckPassed: passed,
      locked,
      unlockThreshold: passPercent,
      unlockHint: locked
        ? `Freigeschaltet ab ${passPercent} % im vorherigen Thema.`
        : null
    };
  });
}
