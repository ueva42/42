/**
 * Tests für Zwischencheck-Regel (Einzelstunde vs. Doppelstunde).
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

function testLessonGroupsAndMidCheck() {
  const doppel = [
    { subject: "Mathe", timeslot: "7.50-8.35" },
    { subject: "Mathe", timeslot: "8.40-9.25" },
    { subject: "Deutsch", timeslot: "9.30-10.15" }
  ];
  const doppelCounts = countTimetableSlotsBySubject(doppel);
  const doppelGroups = countLessonGroupsBySubject(doppel);
  const doppelRun = maxConsecutiveSlotsBySubject(doppel);
  assert(doppelCounts.Mathe === 2, `Doppelstunde Mathe slots=${doppelCounts.Mathe}`);
  assert(doppelGroups.Mathe === 1, `Doppelstunde Mathe groups=${doppelGroups.Mathe}`);
  assert(doppelRun.Mathe === 2, `Doppelstunde Mathe consecutive=${doppelRun.Mathe}`);
  assert(subjectNeedsMidCheck(doppelCounts.Mathe), "Doppelstunde needs Zwischencheck");
  assert(!subjectNeedsMidCheck(doppelCounts.Deutsch), "Einzelstunde skips Zwischencheck");

  const acrossBigBreak = [
    { subject: "Mathe", timeslot: "9.30-10.15" },
    { subject: "Mathe", timeslot: "10.35-11.20" }
  ];
  const bigBreakCounts = countTimetableSlotsBySubject(acrossBigBreak);
  const bigBreakRun = maxConsecutiveSlotsBySubject(acrossBigBreak);
  assert(bigBreakCounts.Mathe === 2, "Mathe über große Pause = 2 Slots");
  assert(bigBreakRun.Mathe === 1, "große Pause trennt enge Consecutive-Serie");
  assert(
    subjectNeedsMidCheck(bigBreakCounts.Mathe),
    "Doppelstunde über große Pause braucht trotzdem Zwischencheck"
  );

  const split = [
    { subject: "Mathe", timeslot: "7.50-8.35" },
    { subject: "Deutsch", timeslot: "8.40-9.25" },
    { subject: "Mathe", timeslot: "11.25-12.10" }
  ];
  const splitCounts = countTimetableSlotsBySubject(split);
  assert(splitCounts.Mathe === 2, `split Mathe slots=${splitCounts.Mathe}`);
  assert(
    subjectNeedsMidCheck(splitCounts.Mathe),
    "zwei Mathe-Slots am Tag → Zwischencheck (auch wenn getrennt)"
  );

  assert(!subjectNeedsMidCheck(0), "zero skips");
  assert(!subjectNeedsMidCheck(1), "one skips");
  assert(subjectNeedsMidCheck(2), "two slots keep");
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
testLessonGroupsAndMidCheck();
testPracticePercentReuse();
testPlannedWorkEmpty();
console.log("OK – student day / check helper tests passed");
