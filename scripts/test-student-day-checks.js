/**
 * Tests für Zwischencheck-Regel (Einzelstunde vs. Doppelstunde hintereinander).
 * Ausführen: node scripts/test-student-day-checks.js
 */
import {
  TIMETABLE_FREE_SUBJECT,
  isTimetableFreeSubject,
  countTimetableSlotsBySubject,
  countLessonGroupsBySubject,
  maxConsecutiveSlotsBySubject,
  subjectNeedsMidCheck,
  midCheckFlagsForTimetable,
  plannedWorkIsEmpty
} from "../lib/logbuch-day.js";

const DEFAULT_TIMES = [
  "7.50-8.35",
  "8.40-9.25",
  "9.30-10.15",
  "10.35-11.20",
  "11.25-12.10",
  "12.15-13.00",
  "13.05-13.50"
];

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function testFreeSlotsIgnored() {
  assert(isTimetableFreeSubject("Frei"), "Frei is free");
  assert(isTimetableFreeSubject(" Frei "), "trimmed Frei");
  assert(!isTimetableFreeSubject("Mathe"), "Mathe is not free");
  assert(TIMETABLE_FREE_SUBJECT === "Frei", "constant");
}

function testSlotCounts() {
  const rows = [
    { subject: "Mathe", timeslot: "7.50-8.35" },
    { subject: "Mathe", timeslot: "8.40-9.25" },
    { subject: "Deutsch", timeslot: "9.30-10.15" },
    { subject: "Frei", timeslot: "10.35-11.20" },
    { subject: "", timeslot: "11.25-12.10" },
    { subject: "Englisch", timeslot: "12.15-13.00" }
  ];
  const counts = countTimetableSlotsBySubject(rows);
  assert(counts.Mathe === 2, `Mathe=${counts.Mathe}`);
  assert(counts.Deutsch === 1, `Deutsch=${counts.Deutsch}`);
  assert(counts.Englisch === 1, `Englisch=${counts.Englisch}`);
  assert(counts.Frei == null, "Frei ignored");
}

function testDoppelstundeVsEinzel() {
  const doppel = [
    { subject: "Mathe", timeslot: "7.50-8.35" },
    { subject: "Mathe", timeslot: "8.40-9.25" },
    { subject: "Deutsch", timeslot: "9.30-10.15" }
  ];
  const doppelRun = maxConsecutiveSlotsBySubject(doppel, DEFAULT_TIMES);
  const doppelGroups = countLessonGroupsBySubject(doppel, DEFAULT_TIMES);
  assert(doppelRun.Mathe === 2, `Doppelstunde consecutive=${doppelRun.Mathe}`);
  assert(doppelGroups.Mathe === 1, `Doppelstunde groups=${doppelGroups.Mathe}`);
  assert(subjectNeedsMidCheck(doppelRun.Mathe), "Doppelstunde needs Zwischencheck");
  assert(!subjectNeedsMidCheck(doppelRun.Deutsch || 0), "Einzelstunde skips Zwischencheck");

  const acrossBigBreak = [
    { subject: "Mathe", timeslot: "9.30-10.15" },
    { subject: "Mathe", timeslot: "10.35-11.20" }
  ];
  const bigBreakRun = maxConsecutiveSlotsBySubject(acrossBigBreak, DEFAULT_TIMES);
  assert(bigBreakRun.Mathe === 2, "Mathe+Mathe über große Pause = Doppelstunde");
  assert(subjectNeedsMidCheck(bigBreakRun.Mathe), "Doppelstunde über Pause needs check");

  const freiBreaks = [
    { subject: "Mathe", timeslot: "7.50-8.35" },
    { subject: "Frei", timeslot: "8.40-9.25" },
    { subject: "Mathe", timeslot: "9.30-10.15" }
  ];
  const freiRun = maxConsecutiveSlotsBySubject(freiBreaks, DEFAULT_TIMES);
  assert(freiRun.Mathe === 1, "Frei unterbricht Doppelstunde");
  assert(!subjectNeedsMidCheck(freiRun.Mathe), "Mathe–Frei–Mathe = keine Doppelstunde");

  // Lücke (nicht genutzter Slot) unterbricht – auch wenn nur 2 Mathe-Zeilen in der DB stehen
  const gap = [
    { subject: "Mathe", timeslot: "7.50-8.35" },
    { subject: "Mathe", timeslot: "9.30-10.15" }
  ];
  const gapRun = maxConsecutiveSlotsBySubject(gap, DEFAULT_TIMES);
  assert(gapRun.Mathe === 1, `Lücke unterbricht consecutive=${gapRun.Mathe}`);
  assert(!subjectNeedsMidCheck(gapRun.Mathe), "Mathe–[leer]–Mathe = keine Doppelstunde");

  const split = [
    { subject: "Mathe", timeslot: "7.50-8.35" },
    { subject: "Deutsch", timeslot: "8.40-9.25" },
    { subject: "Mathe", timeslot: "11.25-12.10" }
  ];
  const splitRun = maxConsecutiveSlotsBySubject(split, DEFAULT_TIMES);
  const splitCounts = countTimetableSlotsBySubject(split);
  assert(splitCounts.Mathe === 2, "zwei Mathe-Slots am Tag");
  assert(splitRun.Mathe === 1, "getrennt → consecutive 1");
  assert(!subjectNeedsMidCheck(splitRun.Mathe), "getrennte Einzelstunden → kein Zwischencheck");
  assert(!subjectNeedsMidCheck(0), "zero skips");
  assert(!subjectNeedsMidCheck(1), "one skips");
  assert(subjectNeedsMidCheck(2), "two consecutive keep");
}

function testForcedMidCheck() {
  const rows = [
    { subject: "Deutsch", timeslot: "7.50-8.35", requiresMidCheck: true }
  ];
  const flags = midCheckFlagsForTimetable(rows, DEFAULT_TIMES);
  assert(flags.Deutsch?.needsMidCheck === true, "manuell erzwingt Zwischencheck");
  assert(flags.Deutsch?.forced === true, "forced flag");
}

function testPlannedWorkEmpty() {
  assert(plannedWorkIsEmpty(null), "null empty");
  assert(plannedWorkIsEmpty({}), "empty object");
  assert(!plannedWorkIsEmpty({ whatGoalText: "x" }), "has what");
}

testFreeSlotsIgnored();
testSlotCounts();
testDoppelstundeVsEinzel();
testForcedMidCheck();
testPlannedWorkEmpty();
console.log("OK – student day / check helper tests passed");
