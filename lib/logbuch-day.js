/**
 * Mein-Tag / Stundenplan-Helfer.
 * Zwischencheck nur bei Doppelstunde: gleiches Fach steht im Stundenplan
 * direkt hintereinander (zwei aufeinanderfolgende Slots).
 * Einzelstunde (Fach nur einmal / nicht direkt hintereinander) → kein Zwischencheck.
 * „Frei“ unterbricht eine Serie; leere Slots zählen nicht.
 */

export const TIMETABLE_FREE_SUBJECT = "Frei";

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

function sortTimetableRows(rows) {
  return [...(rows || [])].sort((a, b) => {
    const ta = parseTimeslotMinutes(a?.timeslot)?.start ?? 99999;
    const tb = parseTimeslotMinutes(b?.timeslot)?.start ?? 99999;
    if (ta !== tb) return ta - tb;
    return String(a?.timeslot || "").localeCompare(String(b?.timeslot || ""));
  });
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

/**
 * Anzahl getrennter Stundenblöcke pro Fach.
 * Direkt hintereinander = ein Block; anderes Fach oder „Frei“ trennt.
 */
export function countLessonGroupsBySubject(rows) {
  const sorted = sortTimetableRows(rows);
  const groups = {};
  let prevSubject = null;

  for (const slot of sorted) {
    const subject = String(slot?.subject || "").trim();
    if (!subject) continue;
    if (isTimetableFreeSubject(subject)) {
      prevSubject = null;
      continue;
    }
    if (subject !== prevSubject) {
      groups[subject] = (groups[subject] || 0) + 1;
    }
    prevSubject = subject;
  }
  return groups;
}

/**
 * Längste Serie desselben Fachs direkt hintereinander im Stundenplan.
 * Doppelstunde Mathe+Mathe → 2; Mathe … Deutsch … Mathe → je 1.
 * „Frei“ unterbricht; große Pause ohne Zwischenslot zählt weiter als hintereinander.
 */
export function maxConsecutiveSlotsBySubject(rows) {
  const sorted = sortTimetableRows(rows);
  const maxRun = {};
  let prevSubject = null;
  let curRun = 0;

  for (const slot of sorted) {
    const subject = String(slot?.subject || "").trim();
    if (!subject) continue;
    if (isTimetableFreeSubject(subject)) {
      prevSubject = null;
      curRun = 0;
      continue;
    }
    if (subject === prevSubject) {
      curRun += 1;
    } else {
      prevSubject = subject;
      curRun = 1;
    }
    maxRun[subject] = Math.max(maxRun[subject] || 0, curRun);
  }
  return maxRun;
}

/**
 * Zwischencheck nötig, wenn das Fach heute als Doppelstunde
 * (mindestens zwei Slots direkt hintereinander) vorkommt.
 */
export function subjectNeedsMidCheck(consecutiveSlotCount) {
  return Number(consecutiveSlotCount) >= 2;
}

export function plannedWorkIsEmpty(work) {
  if (!work || typeof work !== "object") return true;
  return ![work.whatGoalText, work.howGoalText, work.levelGoalText, work.detailsText].some(
    (v) => String(v || "").trim()
  );
}
