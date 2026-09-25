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
  plannedWorkIsEmpty
} from "../lib/logbuch-day.js";
import { parseLevelcheckPercent } from "../lib/levelcheck-evaluation.js";

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
  const doppelRun = maxConsecutiveSlotsBySubject(doppel);
  const doppelGroups = countLessonGroupsBySubject(doppel);
  assert(doppelRun.Mathe === 2, `Doppelstunde consecutive=${doppelRun.Mathe}`);
  assert(doppelGroups.Mathe === 1, `Doppelstunde groups=${doppelGroups.Mathe}`);
  assert(subjectNeedsMidCheck(doppelRun.Mathe), "Doppelstunde needs Zwischencheck");
  assert(!subjectNeedsMidCheck(doppelRun.Deutsch), "Einzelstunde skips Zwischencheck");

  const acrossBigBreak = [
    { subject: "Mathe", timeslot: "9.30-10.15" },
    { subject: "Mathe", timeslot: "10.35-11.20" }
  ];
  const bigBreakRun = maxConsecutiveSlotsBySubject(acrossBigBreak);
  assert(bigBreakRun.Mathe === 2, "Mathe+Mathe über große Pause = Doppelstunde");
  assert(subjectNeedsMidCheck(bigBreakRun.Mathe), "Doppelstunde über Pause needs check");

  const freiBreaks = [
    { subject: "Mathe", timeslot: "7.50-8.35" },
    { subject: "Frei", timeslot: "8.40-9.25" },
    { subject: "Mathe", timeslot: "9.30-10.15" }
  ];
  const freiRun = maxConsecutiveSlotsBySubject(freiBreaks);
  assert(freiRun.Mathe === 1, "Frei unterbricht Doppelstunde");
  assert(!subjectNeedsMidCheck(freiRun.Mathe), "Mathe–Frei–Mathe = keine Doppelstunde");

  const split = [
    { subject: "Mathe", timeslot: "7.50-8.35" },
    { subject: "Deutsch", timeslot: "8.40-9.25" },
    { subject: "Mathe", timeslot: "11.25-12.10" }
  ];
  const splitRun = maxConsecutiveSlotsBySubject(split);
  const splitCounts = countTimetableSlotsBySubject(split);
  assert(splitCounts.Mathe === 2, "zwei Mathe-Slots am Tag");
  assert(splitRun.Mathe === 1, "aber nicht hintereinander");
  assert(!subjectNeedsMidCheck(splitRun.Mathe), "getrennte Einzelstunden → kein Zwischencheck");

  assert(!subjectNeedsMidCheck(0), "zero skips");
  assert(!subjectNeedsMidCheck(1), "one skips");
  assert(subjectNeedsMidCheck(2), "two consecutive keep");
}

function testPracticePercentReuse() {
  assert(parseLevelcheckPercent(82).ok && parseLevelcheckPercent(82).value === 82, "82 ok");
  assert(parseLevelcheckPercent("").ok && parseLevelcheckPercent("").value === null, "empty clears");
  assert(!parseLevelcheckPercent(101).ok, "101 invalid");
  assert(!parseLevelcheckPercent(12.5).ok, "decimal invalid");
}

function testPlannedWorkEmpty() {
  assert(plannedWorkIsEmpty(null), "null empty");
  assert(plannedWorkIsEmpty({}), "blank empty");
  assert(!plannedWorkIsEmpty({ whatGoalText: "Binomische Formeln" }), "was-ziel present");
}

testFreeSlotsIgnored();
testSlotCounts();
testDoppelstundeVsEinzel();
testPracticePercentReuse();
testPlannedWorkEmpty();
console.log("OK – student day / check helper tests passed");
