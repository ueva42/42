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

/** Schüler-Selbstangabe: ab 70 % gilt der Check als erreicht (ohne Themen zu sperren). */
export function isLevelcheckPassPercent(percent) {
  return Number.isInteger(percent) && percent >= LEVELCHECK_PASS_PERCENT;
}

/**
 * Themen einer Klasse/Fach-Liste mit Check-Status anreichern (sortOrder).
 * Themen bleiben immer offen – 70 % ist nur die visuelle Check-Marke.
 */
export function applyLevelcheckTopicUnlocks(topics, passPercent = LEVELCHECK_PASS_PERCENT) {
  const list = Array.isArray(topics) ? [...topics] : [];
  list.sort((a, b) => {
    const so = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
    if (so !== 0) return so;
    return String(a.name || "").localeCompare(String(b.name || ""), "de");
  });

  return list.map((topic) => {
    const percent =
      topic.levelcheckPercent == null || topic.levelcheckPercent === ""
        ? null
        : Number(topic.levelcheckPercent);
    const passed = Number.isInteger(percent) && percent >= passPercent;
    return {
      ...topic,
      levelcheckPercent: Number.isInteger(percent) ? percent : null,
      levelcheckPassed: passed,
      locked: false,
      unlockThreshold: passPercent,
      unlockHint: null
    };
  });
}

function isoDay(value) {
  const date = String(value || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "";
}

/** Nur echte KA/Test-Nachweise – nicht jedes Levelplan-Thema. */
export function isPastGradedArbeit(topic, todayIso) {
  if (!topic?.hasGradedCheckpoint) return false;
  const date = isoDay(topic.checkpointDate);
  const today = isoDay(todayIso);
  return !!date && !!today && date < today;
}

/**
 * Zielsetzung: anstehende KA + vergangene Arbeiten.
 * Levelplan-Katalogthemen ohne Nachweis erscheinen hier nicht.
 */
export function splitZielsetzungTopics(topics, upcomingId, todayIso) {
  const list = Array.isArray(topics) ? topics : [];
  const upcomingKey = upcomingId == null || upcomingId === "" ? "" : String(upcomingId);

  let upcoming = upcomingKey
    ? list.find((t) => String(t.id) === upcomingKey && t.hasGradedCheckpoint) || null
    : null;
  if (!upcoming) {
    upcoming =
      list.find((t) => t.hasGradedCheckpoint && !isPastGradedArbeit(t, todayIso)) || null;
  }

  const past = list
    .filter(
      (t) => isPastGradedArbeit(t, todayIso) && (!upcoming || String(t.id) !== String(upcoming.id))
    )
    .sort((a, b) => {
      const byDate = isoDay(b.checkpointDate).localeCompare(isoDay(a.checkpointDate));
      if (byDate !== 0) return byDate;
      return (b.sortOrder ?? 0) - (a.sortOrder ?? 0);
    });

  return { upcoming, past };
}
