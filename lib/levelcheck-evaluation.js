/**
 * Levelcheck-Bewertung – rein fachlich, unabhängig von XP und Freiheitsrang.
 */

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

/** Bestanden wird bewusst gesetzt – nie aus Prozent abgeleitet. */
export function resolveLevelcheckEvalStatus(statusRaw, _percent) {
  const status = normalizeLevelcheckEvalStatus(statusRaw);
  if (!status) {
    return { ok: false, error: "Ungültiger Bewertungsstatus." };
  }
  return { ok: true, status };
}
