/**
 * Tests für Zwischencheck-Regel (Einzel-/Doppelstunde vs. getrennte Blöcke).
 * Ausführen: node scripts/test-student-day-checks.js
 */
import {
  TIMETABLE_FREE_SUBJECT,
  isTimetableFreeSubject,
  countTimetableSlotsBySubject,
  countLessonGroupsBySubject,
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

function testLessonGroups() {
  const doppel = [
    { subject: "Mathe", timeslot: "7.50-8.35" },
    { subject: "Mathe", timeslot: "8.40-9.25" },
    { subject: "Deutsch", timeslot: "9.30-10.15" }
  ];
  const doppelGroups = countLessonGroupsBySubject(doppel);
  assert(doppelGroups.Mathe === 1, `Doppelstunde Mathe groups=${doppelGroups.Mathe}`);
  assert(doppelGroups.Deutsch === 1, "Deutsch single group");
  assert(!subjectNeedsMidCheck(doppelGroups.Mathe), "Doppelstunde skips Zwischencheck");
  assert(!subjectNeedsMidCheck(doppelGroups.Deutsch), "Einzelstunde skips Zwischencheck");

  const split = [
    { subject: "Mathe", timeslot: "7.50-8.35" },
    { subject: "Deutsch", timeslot: "8.40-9.25" },
    { subject: "Mathe", timeslot: "11.25-12.10" }
  ];
  const splitGroups = countLessonGroupsBySubject(split);
  assert(splitGroups.Mathe === 2, `split Mathe groups=${splitGroups.Mathe}`);
  assert(subjectNeedsMidCheck(splitGroups.Mathe), "two separate Mathe lessons keep Zwischencheck");

  assert(!subjectNeedsMidCheck(0), "zero skips");
  assert(!subjectNeedsMidCheck(1), "one skips");
  assert(subjectNeedsMidCheck(2), "two groups keep");
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
testLessonGroups();
testPracticePercentReuse();
testPlannedWorkEmpty();
console.log("OK – student day / check helper tests passed");
