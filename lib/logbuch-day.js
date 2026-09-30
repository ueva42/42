/**
 * Mein-Tag / Stundenplan-Helfer.
 * Zwischencheck nur bei Doppelstunde: gleiches Fach steht im Stundenplan
 * direkt hintereinander (zwei aufeinanderfolgende Stunden-Slots).
 * Einzelstunde (Fach nur einmal / nicht direkt hintereinander) → kein Zwischencheck.
 * „Frei“ und leere / nicht genutzte Slots unterbrechen eine Serie.
 */

export const TIMETABLE_FREE_SUBJECT = "Frei";

export function isTimetableFreeSubject(subject) {
  return String(subject || "").trim() === TIMETABLE_FREE_SUBJECT;
}

export function normalizeSubjectKey(subject) {
  return String(subject || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
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

/**
 * Füllt die festen Stunden-Slots eines Tages (Raster).
 * Leere Positionen bleiben null und unterbrechen Doppelstunden.
 */
export function buildDaySlotGrid(rows, orderedTimeslots = []) {
  const times = Array.isArray(orderedTimeslots) ? orderedTimeslots.filter(Boolean) : [];
  if (!times.length) {
    return sortTimetableRows(rows).map((slot) => ({
      timeslot: slot?.timeslot || "",
      subject: String(slot?.subject || "").trim(),
      requiresMidCheck: !!(slot?.requiresMidCheck ?? slot?.requires_mid_check)
    }));
  }

  const grid = times.map((timeslot) => ({
    timeslot,
    subject: "",
    requiresMidCheck: false
  }));

  for (const slot of rows || []) {
    const timeslot = String(slot?.timeslot || "").trim();
    let idx = times.indexOf(timeslot);
    if (idx < 0) {
      // Fallback: gleiche Startzeit trotz Format-Unterschied (7.50 vs 7:50)
      const want = parseTimeslotMinutes(timeslot)?.start;
      if (want != null) {
        idx = times.findIndex((t) => parseTimeslotMinutes(t)?.start === want);
      }
    }
    if (idx < 0) continue;
    grid[idx] = {
      timeslot: times[idx],
      subject: String(slot?.subject || "").trim(),
      requiresMidCheck: !!(slot?.requiresMidCheck ?? slot?.requires_mid_check)
    };
  }
  return grid;
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
 * Direkt hintereinander = ein Block; anderes Fach, „Frei“ oder Lücke trennt.
 */
export function countLessonGroupsBySubject(rows, orderedTimeslots = []) {
  const grid = buildDaySlotGrid(rows, orderedTimeslots);
  const groups = {};
  let prevKey = null;

  for (const slot of grid) {
    const subject = String(slot?.subject || "").trim();
    if (!subject) {
      prevKey = null;
      continue;
    }
    if (isTimetableFreeSubject(subject)) {
      prevKey = null;
      continue;
    }
    const key = normalizeSubjectKey(subject);
    if (key !== prevKey) {
      groups[subject] = (groups[subject] || 0) + 1;
      // auch unter Original-Label zählen, falls schon vorhanden mit anderer Schreibweise
      const existingLabel = Object.keys(groups).find(
        (s) => normalizeSubjectKey(s) === key && s !== subject
      );
      if (existingLabel) {
        groups[existingLabel] = (groups[existingLabel] || 0) + 0;
      }
    }
    prevKey = key;
  }
  return groups;
}

/**
 * Längste Serie desselben Fachs in direkt aufeinanderfolgenden Raster-Slots.
 * Doppelstunde Mathe+Mathe → 2; Mathe … (Lücke/Frei/anderes Fach) … Mathe → je 1.
 */
export function maxConsecutiveSlotsBySubject(rows, orderedTimeslots = []) {
  const grid = buildDaySlotGrid(rows, orderedTimeslots);
  const maxRun = {};
  let prevKey = null;
  let prevLabel = null;
  let curRun = 0;

  for (const slot of grid) {
    const subject = String(slot?.subject || "").trim();
    if (!subject) {
      prevKey = null;
      prevLabel = null;
      curRun = 0;
      continue;
    }
    if (isTimetableFreeSubject(subject)) {
      prevKey = null;
      prevLabel = null;
      curRun = 0;
      continue;
    }
    const key = normalizeSubjectKey(subject);
    if (key === prevKey) {
      curRun += 1;
    } else {
      prevKey = key;
      prevLabel = subject;
      curRun = 1;
    }
    const label = prevLabel || subject;
    maxRun[label] = Math.max(maxRun[label] || 0, curRun);
    // gleiche Schreibweisen zusammenführen
    for (const [existing, value] of Object.entries(maxRun)) {
      if (existing === label) continue;
      if (normalizeSubjectKey(existing) === key) {
        maxRun[existing] = Math.max(value, curRun);
        maxRun[label] = Math.max(maxRun[label] || 0, value);
      }
    }
  }
  return maxRun;
}

/**
 * Fächer, bei denen ein Slot manuell „Zwischencheck“ markiert hat.
 */
export function subjectsWithForcedMidCheck(rows) {
  const out = new Set();
  for (const slot of rows || []) {
    if (!(slot?.requiresMidCheck ?? slot?.requires_mid_check)) continue;
    const subject = String(slot?.subject || "").trim();
    if (!subject || isTimetableFreeSubject(subject)) continue;
    out.add(subject);
  }
  return out;
}

/**
 * Zwischencheck nötig bei Doppelstunde (2+ Raster-Slots hintereinander)
 * oder bei manueller Markierung im Stundenplan.
 */
export function subjectNeedsMidCheck(consecutiveSlotCount, forced = false) {
  if (forced) return true;
  return Number(consecutiveSlotCount) >= 2;
}

export function midCheckFlagsForTimetable(rows, orderedTimeslots = []) {
  const consecutive = maxConsecutiveSlotsBySubject(rows, orderedTimeslots);
  const forced = subjectsWithForcedMidCheck(rows);
  const bySubject = {};
  const labels = new Set([
    ...Object.keys(consecutive),
    ...forced
  ]);
  for (const subject of labels) {
    const run =
      consecutive[subject] ||
      Object.entries(consecutive).find(
        ([s]) => normalizeSubjectKey(s) === normalizeSubjectKey(subject)
      )?.[1] ||
      0;
    const isForced = [...forced].some(
      (s) => normalizeSubjectKey(s) === normalizeSubjectKey(subject)
    );
    bySubject[subject] = {
      consecutiveSlots: Number(run) || 0,
      forced: isForced,
      needsMidCheck: subjectNeedsMidCheck(run, isForced)
    };
  }
  return bySubject;
}

export function plannedWorkIsEmpty(work) {
  if (!work || typeof work !== "object") return true;
  return ![work.whatGoalText, work.howGoalText, work.levelGoalText, work.detailsText].some(
    (v) => String(v || "").trim()
  );
}
