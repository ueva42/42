/**
 * Mein-Tag / Stundenplan-Helfer.
 * Zwischencheck bei Doppelstunden: dasselbe Fach steht heute in mindestens zwei
 * Stundenplan-Slots (auch über die große Pause). Einzelstunde → kein Zwischencheck.
 * „Frei“ und leere Slots zählen nicht.
 */

export const TIMETABLE_FREE_SUBJECT = "Frei";
const MAX_DOUBLE_GAP_MINUTES = 12;

export function isTimetableFreeSubject(subject) {
  return String(subject || "").trim() === TIMETABLE_FREE_SUBJECT;
}

export function parseTimeslotMinutes(timeslot) {
  const m = String(timeslot || "").match(
    /(\d{1,2})[.:](\d{2})\s*[-–—]\s*(\d{1,2})[.:](\d{2})/
  );
  if (!m) return null;
  const start = Number(m[1]) * 60 + Number(m[2]);
  let end = Number(m[3]) * 60 + Number(m[4]);
  if (end <= start) end += 24 * 60;
  return { start, end };
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

/** Anzahl getrennter Stundenblöcke (enge Pause ≤12 Min. hält zusammen). */
export function countLessonGroupsBySubject(rows) {
  const active = [...(rows || [])]
    .filter((slot) => {
      const subject = String(slot?.subject || "").trim();
      return subject && !isTimetableFreeSubject(subject);
    })
    .sort((a, b) => {
      const ta = parseTimeslotMinutes(a?.timeslot)?.start ?? 99999;
      const tb = parseTimeslotMinutes(b?.timeslot)?.start ?? 99999;
      if (ta !== tb) return ta - tb;
      return String(a?.timeslot || "").localeCompare(String(b?.timeslot || ""));
    });

  const groups = {};
  const lastEnd = {};
  for (const slot of active) {
    const subject = String(slot.subject).trim();
    const t = parseTimeslotMinutes(slot.timeslot);
    if (!t) {
      groups[subject] = (groups[subject] || 0) + 1;
      lastEnd[subject] = null;
      continue;
    }
    const prevEnd = lastEnd[subject];
    const continues =
      prevEnd != null && t.start - prevEnd >= 0 && t.start - prevEnd <= MAX_DOUBLE_GAP_MINUTES;
    if (!continues) groups[subject] = (groups[subject] || 0) + 1;
    lastEnd[subject] = t.end;
  }
  return groups;
}

/**
 * Längste zusammenhängende Slot-Serie pro Fach (enge Pause ≤12 Min.).
 * Nur zur Anzeige/Meta – die Zwischencheck-Regel nutzt die Slot-Anzahl.
 */
export function maxConsecutiveSlotsBySubject(rows) {
  const active = [...(rows || [])]
    .filter((slot) => {
      const subject = String(slot?.subject || "").trim();
      return subject && !isTimetableFreeSubject(subject);
    })
    .sort((a, b) => {
      const ta = parseTimeslotMinutes(a?.timeslot)?.start ?? 99999;
      const tb = parseTimeslotMinutes(b?.timeslot)?.start ?? 99999;
      if (ta !== tb) return ta - tb;
      return String(a?.timeslot || "").localeCompare(String(b?.timeslot || ""));
    });

  const maxRun = {};
  const curRun = {};
  const lastEnd = {};
  for (const slot of active) {
    const subject = String(slot.subject).trim();
    const t = parseTimeslotMinutes(slot.timeslot);
    if (!t) {
      curRun[subject] = 1;
      maxRun[subject] = Math.max(maxRun[subject] || 0, 1);
      lastEnd[subject] = null;
      continue;
    }
    const prevEnd = lastEnd[subject];
    const continues =
      prevEnd != null && t.start - prevEnd >= 0 && t.start - prevEnd <= MAX_DOUBLE_GAP_MINUTES;
    curRun[subject] = continues ? (curRun[subject] || 0) + 1 : 1;
    maxRun[subject] = Math.max(maxRun[subject] || 0, curRun[subject]);
    lastEnd[subject] = t.end;
  }
  return maxRun;
}

/**
 * Zwischencheck nötig bei Doppelstunde (= mindestens zwei Stundenplan-Slots
 * desselben Fachs heute). Einzelstunde → false.
 */
export function subjectNeedsMidCheck(subjectSlotCount) {
  return Number(subjectSlotCount) >= 2;
}

export function plannedWorkIsEmpty(work) {
  if (!work || typeof work !== "object") return true;
  return ![work.whatGoalText, work.howGoalText, work.levelGoalText, work.detailsText].some(
    (v) => String(v || "").trim()
  );
}
