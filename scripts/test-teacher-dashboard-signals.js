/**
 * Prüft die Musterrechnung ohne Datenbank.
 * Keine Schülernamen, keine Konten.
 */
import assert from "node:assert/strict";
import { TEACHER_DASHBOARD_CONFIG as CFG } from "../lib/teacher-dashboard-config.js";
import {
  achievedGradeFromSicher,
  analyzeStudent,
  schoolDateTime
} from "../lib/teacher-dashboard-signals.js";

const RULES = {
  "1": { rookie: 1, operator: 1, street_legend: 0.8 },
  "1.5": { rookie: 1, operator: 1, street_legend: 0.65 },
  "2": { rookie: 1, operator: 1, street_legend: 0.5 },
  "2.5": { rookie: 1, operator: 1, street_legend: 0.25 },
  "3": { rookie: 1, operator: 0.8, street_legend: 0 },
  "3.5": { rookie: 1, operator: 0.5, street_legend: 0 },
  "4": { rookie: 0.8, operator: 0, street_legend: 0 },
  "4.5": { rookie: 0.6, operator: 0, street_legend: 0 },
  "5": { rookie: 0.4, operator: 0, street_legend: 0 },
  "5.5": { rookie: 0.2, operator: 0, street_legend: 0 },
  "6": { rookie: 0, operator: 0, street_legend: 0 }
};

function req(key) {
  return RULES[key] || null;
}

const TODAY = "2026-10-30";
const goals = Array.from({ length: 10 }, (_, i) => ({
  id: `g${i}`,
  text: `Thema ${i + 1}`,
  sortOrder: i
}));

function base(extra = {}) {
  return {
    config: CFG,
    getGradeRequirements: req,
    now: new Date("2026-10-30T10:40:00Z"),
    today: TODAY,
    timeZone: "Europe/Berlin",
    rangeStart: "2026-10-01",
    rangeEnd: TODAY,
    weekStart: "2026-10-26",
    weekEnd: "2026-11-01",
    subject: "Mathe",
    exam: { date: "2026-11-10", label: "Klassenarbeit", linkedGoalIds: ["g0"], days: 11 },
    goals,
    targetGradeKey: "2",
    marks: [],
    evaluations: [],
    entries: [],
    helpEvents: [],
    coachMessages: [],
    timetable: [{ weekday: 5, timeslot: "11.25-12.10", subject: "Mathe" }],
    ...extra
  };
}

const slotStart = schoolDateTime(TODAY, 11 * 60 + 25, "Europe/Berlin");
assert.equal(slotStart.toISOString(), "2026-10-30T10:25:00.000Z");

assert.equal(achievedGradeFromSicher(10, { rookie: 0, operator: 0, street_legend: 0 }, req), null);

const noChecks = analyzeStudent(
  base({
    marks: goals.map((goal) => ({ goalId: goal.id, tier: "rookie", status: "sicher", updatedAt: "2026-10-20T10:00:00Z" }))
  })
);
assert.equal(noChecks.prognosis, "unknown");
assert.equal(noChecks.signals.some((item) => item.id === "Z1"), false);

const withChecks = analyzeStudent(
  base({
    marks: goals.slice(0, 8).map((goal) => ({
      goalId: goal.id,
      tier: "rookie",
      status: "sicher",
      updatedAt: "2026-10-20T10:00:00Z"
    })),
    evaluations: [
      { type: "levelcheck", status: "passed", date: "2026-10-10", linkedGoalIds: ["g0"] },
      { type: "levelcheck", status: "failed", date: "2026-10-20", linkedGoalIds: ["g1", "g2"] }
    ]
  })
);
assert.equal(withChecks.prognosis, "high");
assert.equal(withChecks.standGrade, "4");
assert.ok(withChecks.signals.some((item) => item.id === "Z1"));
assert.ok(withChecks.signals.some((item) => item.id === "H1"));
assert.ok(withChecks.helpGroups.includes("H1"));

const emptyStand = analyzeStudent(
  base({
    evaluations: [
      { type: "levelcheck", status: "passed", date: "2026-10-10", linkedGoalIds: ["g0"] },
      { type: "levelcheck", status: "passed", date: "2026-10-20", linkedGoalIds: ["g0"] }
    ]
  })
);
assert.equal(emptyStand.prognosis, "unknown");
assert.equal(emptyStand.standGrade, null);

const below = analyzeStudent(
  base({
    entries: [1, 2, 3].map((day) => ({
      id: `e${day}`,
      date: `2026-10-0${day}`,
      createdAt: `2026-10-0${day}T09:00:00Z`,
      whatGoalId: "g0",
      whatGoalText: "Thema 1",
      selectedLevel: "rookie",
      goal: "Rookie",
      confidenceBefore: null,
      reflection: null,
      check: null
    }))
  })
);
assert.ok(below.signals.some((item) => item.id === "Z2"));

const sameGoal = analyzeStudent(
  base({
    entries: [1, 2, 3].map((day) => ({
      id: `s${day}`,
      date: `2026-10-0${day}`,
      createdAt: `2026-10-0${day}T09:00:00Z`,
      whatGoalId: "g3",
      whatGoalText: "Thema 4",
      selectedLevel: "operator",
      goal: "Thema 4",
      reflection: { createdAt: `2026-10-0${day}T10:00:00Z`, goal_achieved: "nein" },
      check: null
    }))
  })
);
assert.ok(sameGoal.signals.some((item) => item.id === "Z4"));

const early = analyzeStudent(
  base({
    entries: [
      {
        id: "start",
        date: "2026-10-06",
        createdAt: "2026-10-06T09:00:00Z",
        whatGoalId: "g0",
        selectedLevel: "operator",
        goal: "Start",
        reflection: null,
        check: null
      }
    ],
    coachMessages: [20, 40, 80].map((sec) => ({
      at: new Date(Date.parse("2026-10-06T09:00:00Z") + sec * 1000).toISOString(),
      rolle: "schueler",
      competenceId: "g0"
    }))
  })
);
assert.ok(early.signals.some((item) => item.id === "H2"));
assert.ok(early.helpGroups.includes("H1") === false || early.helpGroups.includes("H2"));
assert.ok(early.helpGroups.includes("H2"));

const both = analyzeStudent(
  base({
    evaluations: [{ type: "levelcheck", status: "failed", date: "2026-10-08", linkedGoalIds: ["g0"] }],
    entries: [
      {
        id: "start2",
        date: "2026-10-06",
        createdAt: "2026-10-06T09:00:00Z",
        whatGoalId: "g0",
        selectedLevel: "operator",
        goal: "Start",
        reflection: null,
        check: null
      }
    ],
    coachMessages: [20, 40, 80].map((sec) => ({
      at: new Date(Date.parse("2026-10-06T09:00:00Z") + sec * 1000).toISOString(),
      rolle: "schueler",
      competenceId: "g0"
    }))
  })
);
assert.ok(both.helpGroups.includes("H1"));
assert.ok(both.helpGroups.includes("H2"));

const once = analyzeStudent(
  base({
    marks: [{ goalId: "g0", tier: "street_legend", status: "in_arbeit", updatedAt: "2026-10-02T09:00:00Z" }]
  })
);
assert.equal(once.signals.some((item) => item.id === "A3"), false);
assert.equal(once.neutral.length, 1);

const twice = analyzeStudent(
  base({
    marks: [
      { goalId: "g0", tier: "street_legend", status: "in_arbeit", updatedAt: "2026-10-02T09:00:00Z" },
      { goalId: "g1", tier: "street_legend", status: "sicher", updatedAt: "2026-10-03T09:00:00Z" }
    ]
  })
);
assert.ok(twice.signals.some((item) => item.id === "A3"));

const nearExam = analyzeStudent(
  base({
    today: TODAY,
    exam: { date: "2026-11-04", label: "Klassenarbeit", linkedGoalIds: ["g0"], days: 5 }
  })
);
assert.ok(nearExam.signals.some((item) => item.id === "A2"));

const notLinked = analyzeStudent(
  base({
    exam: { date: "2026-11-04", label: "Klassenarbeit", linkedGoalIds: [], days: 5 }
  })
);
assert.equal(notLinked.signals.some((item) => item.id === "A2"), false);

const reflected = [1, 2, 3, 4].map((day) => ({
  id: `r${day}`,
  date: `2026-10-1${day}`,
  createdAt: `2026-10-1${day}T09:00:00Z`,
  whatGoalId: "g0",
  selectedLevel: "operator",
  goal: "Ziel",
  reflection: day === 1 ? { createdAt: `2026-10-1${day}T10:00:00Z`, goal_achieved: "ja" } : null,
  check: null
}));
const lowReflect = analyzeStudent(base({ entries: reflected }));
assert.ok(lowReflect.signals.some((item) => item.id === "A4"));

const fewDays = analyzeStudent(
  base({
    entries: reflected.slice(0, 2).map((entry) => ({ ...entry, reflection: null }))
  })
);
assert.equal(fewDays.signals.some((item) => item.id === "A4"), false);

const liveNow = new Date("2026-10-30T10:50:00Z");
const quiet = analyzeStudent(
  base({
    now: liveNow,
    entries: [
      {
        id: "today",
        date: TODAY,
        createdAt: "2026-10-30T10:20:00Z",
        whatGoalId: "g0",
        selectedLevel: "rookie",
        goal: "Heute",
        confidenceBefore: null,
        reflection: null,
        check: null
      }
    ]
  })
);
assert.ok(quiet.live.visit.some((item) => item.id === "stall"));
assert.ok(!String(quiet.live.visit.map((item) => item.label).join(" ")).toLowerCase().includes("festgefahren"));
assert.equal(quiet.live.visit.some((item) => item.id === "confidence"), false);

const noGoal = analyzeStudent(base({ now: liveNow, entries: [] }));
assert.equal(noGoal.live.noGoal, true);

console.log("teacher-dashboard-signals ok");
