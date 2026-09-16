/**
 * Tests für Zwischencheck-Regel (2+ Stunden) und Lerncheck-Prozent.
 * Ausführen: node scripts/test-student-day-checks.js
 */
import {
  TIMETABLE_FREE_SUBJECT,
  isTimetableFreeSubject,
  countTimetableSlotsBySubject,
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
  assert(subjectNeedsMidCheck(counts.Mathe), "Mathe keeps Zwischencheck");
  assert(!subjectNeedsMidCheck(counts.Deutsch), "Deutsch skips Zwischencheck");
  assert(!subjectNeedsMidCheck(0), "zero skips");
  assert(!subjectNeedsMidCheck(1), "one skips");
  assert(subjectNeedsMidCheck(2), "two keeps");
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
testPracticePercentReuse();
testPlannedWorkEmpty();
console.log("OK – student day / check helper tests passed");
