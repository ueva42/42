/**
 * Mein-Tag / Stundenplan-Helfer: Zwischencheck nur bei 2+ Stunden desselben Fachs.
 * „Frei“ und leere Slots zählen nicht.
 */

export const TIMETABLE_FREE_SUBJECT = "Frei";

export function isTimetableFreeSubject(subject) {
  return String(subject || "").trim() === TIMETABLE_FREE_SUBJECT;
}

export function countTimetableSlotsBySubject(rows) {
  const counts = {};
  for (const slot of rows || []) {
    const subject = String(slot?.subject || "").trim();
    if (!subject || isTimetableFreeSubject(subject)) continue;
    counts[subject] = (counts[subject] || 0) + 1;
  }
  return counts;
}

export function subjectNeedsMidCheck(slotCount) {
  return Number(slotCount) >= 2;
}

export function plannedWorkIsEmpty(work) {
  if (!work || typeof work !== "object") return true;
  return ![work.whatGoalText, work.howGoalText, work.levelGoalText, work.detailsText].some(
    (v) => String(v || "").trim()
  );
}
