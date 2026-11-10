/**
 * Lehrer-Cockpit und Klassen-Spiel: Rechenlogik und Routen mit Fake-Pool.
 * Ausführen: node scripts/test-teacher-cockpit.js
 */
import assert from "node:assert/strict";
import express from "express";
import {
  classMissionDone,
  classMissionTitle,
  ghostDone,
  lessonsUntil,
  missionNumbersText,
  normalizeGameXp,
  paceStatus,
  paceText,
  pickWinner,
  planTarget,
  raffleEligible,
  studentPosition,
  teamStats,
  trainingBoard,
  unitTimeline
} from "../lib/teacher-cockpit.js";
import { registerTeacherCockpitRoutes } from "../lib/teacher-cockpit-api.js";

const TODAY = "2026-11-10";
const goalIds = ["g1", "g2", "g3", "g4", "g5"].map((g) => `00000000-0000-4000-8000-0000000000${g.slice(1).padStart(2, "0")}`);
const CHECK = {
  id: "lc-1",
  name: "Potenzen und Wurzeln",
  subject: "Mathe",
  createdAt: "2026-10-26",
  checkpoints: [
    { checkpointDate: "2026-11-17", checkpointType: "levelcheck", linkedSubtopicIds: goalIds.slice(0, 4) },
    { checkpointDate: "2026-11-30", checkpointType: "klassenarbeit", linkedSubtopicIds: [] }
  ],
  goals: goalIds.map((id, i) => ({ id, text: `Mission ${i + 1}`, sortOrder: i, trainingWz: `pw-0${i + 1}` }))
};

/* ---------- Rechenlogik ---------- */

assert.equal(missionNumbersText([1, 2]), "Mission 1–2");
assert.equal(missionNumbersText([3]), "Mission 3");
assert.equal(missionNumbersText([1, 3, 5]), "Mission 1, 3 und 5");
assert.equal(
  classMissionTitle({ numbers: [1, 2], tier: "rookie", dueDate: "2026-11-17" }),
  "Bis Di., 17.11. haben alle Mission 1–2 auf Rookie sicher."
);

const unit = unitTimeline(CHECK, TODAY);
assert.equal(unit.start, "2026-10-26");
const target = planTarget(goalIds, unit);
assert.deepEqual(
  { kind: target.kind, planIndex: target.planIndex, date: target.date },
  { kind: "levelcheck", planIndex: 3, date: "2026-11-17" }
);
const ghost = ghostDone(goalIds, unit, target);
assert.ok(ghost > 2.5 && ghost < 3.2, `Plan-Geist liegt zwischen Mission 3 und 4 (${ghost})`);
assert.equal(paceStatus(3, ghost), "ok");
assert.equal(paceStatus(2, ghost), "ok", "arbeitet an der Mission, an der der Plan-Geist steht");
assert.equal(paceStatus(1, ghost), "mid");
assert.equal(paceStatus(0, ghost), "low");
assert.equal(paceStatus(1, null), "none");
assert.equal(paceText(2, target), "noch 2 Missionen");
assert.equal(paceText(4, target), "Levelcheck-Missionen geschafft");
assert.equal(planTarget(goalIds, unitTimeline({ ...CHECK, checkpoints: [] }, TODAY)), null);

const allRookie = (goal, tier) => (tier === "rookie" ? "sicher" : "offen");
assert.equal(studentPosition(CHECK.goals, { rookie: 1, operator: 0, street_legend: 0 }, allRookie).done, 5);
assert.equal(studentPosition(CHECK.goals, null, allRookie).current, 0, "ohne Zielnote zählen alle Stufen wie auf der Route");

assert.equal(classMissionDone(["a"], "rookie", (g, t) => (t === "operator" ? "sicher" : "offen")), true, "höhere Stufe zählt mit");
assert.equal(classMissionDone(["a"], "operator", (g, t) => (t === "rookie" ? "sicher" : "offen")), false);

const small = teamStats([1, 2], new Set([1, 2]), new Map([[1, 1]]));
const big = teamStats([3, 4, 5, 6], new Set([3, 4, 5]), new Map([[3, 2], [4, 2]]));
assert.equal(small.goalReached, true);
assert.equal(small.share, 1);
assert.equal(small.avgNewSicher, 0.5);
assert.equal(big.goalReached, false, "großes Team gewinnt nicht durch die Summe");
assert.equal(big.share, 0.75);
assert.equal(big.avgNewSicher, 1);

assert.deepEqual(raffleEligible([1, 2, 3], new Set([2, 3, 9])), [2, 3]);
assert.equal(pickWinner([7, 8, 9], () => 2), 9);
assert.equal(pickWinner([], () => 0), null);
assert.equal(normalizeGameXp(15), 15);
assert.equal(normalizeGameXp(999), 10, "nur feste XP-Stufen");

assert.deepEqual(lessonsUntil([{ weekday: 1 }, { weekday: 4 }, { weekday: 5 }], TODAY, "2026-11-17"), {
  count: 3,
  days: ["2026-11-12", "2026-11-13", "2026-11-16"]
});

const board = trainingBoard(
  [{ id: "g1", trainingWz: "pw-01" }],
  [1, 2, 3],
  (sid) =>
    ({
      1: { merged: { levels: { rookie: { solved: 6, safe: true } }, ichKann: { rookie: "sicher" } }, updatedAt: TODAY },
      2: { merged: { levels: { rookie: { solved: 3 } }, ichKann: { rookie: "sicher" } }, updatedAt: "2026-11-02" },
      3: null
    })[sid],
  TODAY
);
assert.deepEqual(board.missions[0].tiers.rookie, { sicher: 1, teilweise: 1, nochNicht: 0, offen: 2 - 1 });
assert.equal(board.self.passt, 1);
assert.equal(board.self["überschätzt"], 1);
assert.equal(board.over[0].studentId, 2);
assert.equal(board.idle[0].studentId, 2);
assert.equal(board.idle[0].days, 8);

/* ---------- Routen ---------- */

const db = {
  students: [
    { id: 11, name: "Zoe", xp: 120, rang: "Scout" },
    { id: 12, name: "Amir", xp: 40, rang: "Rookie" },
    { id: 13, name: "Mila", xp: 220, rang: "Fixer" }
  ],
  reflected: [],
  marks: [
    { user_id: 11, goal_id: goalIds[0], tier: "rookie", status: "sicher", updated_at: new Date(`${TODAY}T09:40:00`) },
    { user_id: 11, goal_id: goalIds[1], tier: "rookie", status: "sicher", updated_at: new Date("2026-11-05T10:00:00") },
    { user_id: 13, goal_id: goalIds[0], tier: "operator", status: "sicher", updated_at: new Date("2026-11-04T10:00:00") },
    { user_id: 13, goal_id: goalIds[1], tier: "rookie", status: "sicher", updated_at: new Date("2026-11-04T10:00:00") }
  ],
  rosters: [
    { id: "r-1", subject: "Mathe", group_name: "Team Blau" },
    { id: "r-2", subject: "Mathe", group_name: "Team Grün" }
  ],
  members: [
    { session_id: "r-1", user_id: 11, display_name_snapshot: "Zoe" },
    { session_id: "r-1", user_id: 12, display_name_snapshot: "Amir" },
    { session_id: "r-2", user_id: 13, display_name_snapshot: "Mila" }
  ],
  missions: [],
  draws: [],
  awards: []
};
const awarded = [];
let user = { id: 5, role: "teacher", school_id: 1 };

const pool = {
  async query(sql, params = []) {
    const s = sql.replace(/\s+/g, " ");
    if (s.includes("teacher_class_assignments")) return { rows: Number(params[1]) === 1 ? [{ x: 1 }] : [] };
    if (s.includes("FROM classes WHERE id")) return { rows: [{ id: 1, name: "9b" }] };
    if (s.includes("LEFT JOIN levels l")) return { rows: db.students };
    if (s.includes("UNION")) return { rows: db.reflected.map((id) => ({ id })) };
    if (s.includes("FROM level_check_marks") && s.includes("GROUP BY user_id")) {
      const counts = new Map();
      for (const m of db.marks) {
        if (m.status === "sicher" && m.updated_at.toISOString().slice(0, 10) === params[1]) {
          counts.set(m.user_id, (counts.get(m.user_id) || 0) + 1);
        }
      }
      return { rows: [...counts].map(([user_id, n]) => ({ user_id, n })) };
    }
    if (s.includes("FROM level_check_marks")) {
      return { rows: db.marks.filter((m) => params[0].includes(m.user_id) && params[1].includes(m.goal_id)) };
    }
    if (s.includes("FROM group_sessions gs")) return { rows: db.rosters };
    if (s.includes("FROM group_session_members")) return { rows: db.members };
    if (s.includes("FROM class_reward_rounds")) {
      return { rows: [{ id: 1, title: "Kinonachmittag", target_xp: 1500, is_active: true, fixed_option_id: null }] };
    }
    if (s.includes("FROM xp_transactions") && s.includes("SUM(amount)")) return { rows: [{ xp: 30, people: 2 }] };
    if (s.includes("FROM xp_transactions")) return { rows: [{ people: 3 }] };
    if (s.startsWith(" SELECT * FROM class_learning_missions") || s.includes("SELECT * FROM class_learning_missions")) {
      const rows = [...db.missions].sort((a, b) => Number(b.active) - Number(a.active) || b.seq - a.seq);
      return { rows: rows.slice(0, 1) };
    }
    if (s.includes("UPDATE class_learning_missions SET active = FALSE, closed_at = NOW() WHERE class_id")) {
      for (const m of db.missions) if (m.class_id === params[0]) m.active = false;
      return { rows: [] };
    }
    if (s.includes("INSERT INTO class_learning_missions")) {
      const row = {
        id: `m-${db.missions.length + 1}`,
        seq: db.missions.length + 1,
        school_id: params[0],
        class_id: params[1],
        level_check_id: params[2],
        title: params[3],
        goal_ids: JSON.parse(params[4]),
        mission_numbers: JSON.parse(params[5]),
        tier: params[6],
        due_date: params[7],
        active: true
      };
      db.missions.push(row);
      return { rows: [{ id: row.id }] };
    }
    if (s.includes("SELECT id, class_id FROM class_learning_missions")) {
      return { rows: db.missions.filter((m) => m.id === params[0]) };
    }
    if (s.includes("UPDATE class_learning_missions SET active = FALSE, closed_at = COALESCE")) {
      for (const m of db.missions) if (m.id === params[0]) m.active = false;
      return { rows: [] };
    }
    if (s.includes("FROM class_raffle_draws d")) {
      const row = db.draws.find((d) => d.class_id === params[0] && d.draw_date === params[1]);
      return { rows: row ? [{ ...row, winner_name: db.students.find((x) => x.id === row.winner_id)?.name }] : [] };
    }
    if (s.includes("INSERT INTO class_raffle_draws")) {
      if (db.draws.some((d) => d.class_id === params[1] && d.draw_date === params[2])) return { rows: [] };
      const row = { id: `d-${db.draws.length + 1}`, class_id: params[1], draw_date: params[2], winner_id: params[3], eligible_count: params[4], xp: params[5] };
      db.draws.push(row);
      return { rows: [{ id: row.id }] };
    }
    if (s.includes("FROM class_team_awards")) {
      return { rows: db.awards.filter((a) => a.class_id === params[0] && a.award_date === params[1]) };
    }
    if (s.includes("INSERT INTO class_team_awards")) {
      if (db.awards.some((a) => a.class_id === params[1] && a.award_date === params[2])) return { rows: [] };
      const row = {
        id: `a-${db.awards.length + 1}`,
        class_id: params[1],
        award_date: params[2],
        roster_id: params[3],
        group_name: params[4],
        subject: params[5],
        member_ids: JSON.parse(params[6]),
        member_count: params[7],
        reflected_count: params[8],
        goal_reached: params[9],
        xp_each: params[10]
      };
      db.awards.push(row);
      return { rows: [{ id: row.id }] };
    }
    if (s.includes("FROM level_check_targets")) return { rows: [{ user_id: 11, target_grade_key: "3" }] };
    if (s.includes("FROM training_results")) {
      return {
        rows: [
          {
            student_id: 12,
            wz: "pw-01",
            merged: { levels: { rookie: { solved: 4 } }, ichKann: { rookie: "sicher" } },
            updated_at: new Date("2026-11-01T10:00:00")
          }
        ]
      };
    }
    if (s.includes("GROUP BY le.date")) return { rows: [{ date: TODAY, planned: 2, reflected: 1 }] };
    if (s.includes("FROM log_entries le")) {
      return {
        rows: [
          {
            id: "e1",
            user_id: 11,
            what_goal_id: goalIds[2],
            selected_level: "rookie",
            confidence_before: 3,
            created_at: new Date(`${TODAY}T09:35:00`),
            check_created_at: null,
            reflection_created_at: new Date(`${TODAY}T10:10:00`)
          }
        ]
      };
    }
    if (s.includes("FROM timetables")) return { rows: [{ weekday: 1, timeslot: "9.30-10.15" }, { weekday: 4, timeslot: "9.30-10.15" }] };
    if (s.includes("FROM teacher_coaching_state")) return { rows: [] };
    if (s.includes("DELETE FROM")) return { rows: [] };
    throw new Error(`Unerwartete Abfrage: ${s.slice(0, 120)}`);
  }
};

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  req.session = { user };
  next();
});
const roleGate = (role) => (req, res, next) => (req.session.user?.role === role ? next() : res.status(403).json({ error: "Forbidden" }));
registerTeacherCockpitRoutes(app, {
  pool,
  isTeacher: roleGate("teacher"),
  isStudent: roleGate("student"),
  getLevelChecksForClass: async () => [CHECK],
  getGradeRequirements: (key) => (key === "3" ? { rookie: 1, operator: 0, street_legend: 0 } : null),
  resolveSchoolDate: async () => TODAY,
  todayIsoDate: () => TODAY,
  awardXp: async (id, amount, source) => {
    awarded.push({ id, amount, source });
  },
  getClassTotalXP: async () => 1240,
  randomInt: (n) => n - 1
});

const server = app.listen(0);
const base = `http://127.0.0.1:${server.address().port}`;
async function call(method, path, body) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined
  });
  return { status: res.status, body: await res.json() };
}

try {
  let r = await call("GET", "/api/teacher/cockpit?classId=99");
  assert.equal(r.status, 403, "fremde Klasse");

  r = await call("POST", "/api/teacher/cockpit/raffle", { classId: 1, xp: 15 });
  assert.equal(r.status, 400, "leerer Lostopf");
  assert.equal(awarded.length, 0);

  db.reflected = [11, 13];
  r = await call("GET", "/api/teacher/cockpit?classId=1");
  assert.equal(r.status, 200);
  const d = r.body;
  assert.equal(d.goals.length, 5);
  assert.equal(d.unit.target.kind, "levelcheck");
  assert.equal(d.unit.target.planIndex, 3);
  assert.equal(d.unit.lessonsUntilTarget, 2, "Do 12.11. und Mo 16.11.");
  assert.deepEqual(
    d.studentsDetail.map((s) => s.name),
    ["Zoe", "Amir", "Mila"],
    "Reihenfolge wie aus der Datenbank (alphabetisch), keine Sortierung nach Leistung"
  );
  const zoe = d.studentsDetail.find((s) => s.id === 11);
  assert.equal(zoe.targetGrade, "3");
  assert.equal(zoe.done, 2);
  assert.equal(zoe.today.goalId, goalIds[2]);
  assert.equal(zoe.today.reflected, true);
  assert.equal(d.shares[0].rookie, 1);
  assert.equal(d.shares[0].operator, 1);
  assert.equal(d.training.missions.length, 5, "Trainingscenter für jede verknüpfte Mission, nicht nur Funktionen");
  assert.equal(d.training.over[0].studentId, 12);
  assert.equal(d.game.raffle.eligibleCount, 2);
  assert.equal(d.game.klassenziel.total, 1240);
  assert.equal(d.game.klassenziel.target, 1500);
  const blau = d.teams.find((t) => t.name === "Team Blau");
  const gruen = d.teams.find((t) => t.name === "Team Grün");
  assert.equal(blau.share, 0.5);
  assert.equal(blau.goalReached, false);
  assert.equal(gruen.goalReached, true, "Ein-Personen-Team mit Tagesabschluss erreicht das Ziel");
  assert.ok(d.events.some((e) => e.kind === "ziel"));
  assert.ok(d.events.some((e) => e.kind === "sicher"));

  r = await call("POST", "/api/teacher/cockpit/raffle", { classId: 1, xp: 15 });
  assert.equal(r.status, 200);
  assert.equal(r.body.winner.id, 13, "Gewinner:in kommt aus dem Lostopf");
  assert.equal(r.body.eligibleCount, 2);
  assert.deepEqual(awarded, [{ id: 13, amount: 15, source: "klassenspiel_ziehung" }]);

  r = await call("POST", "/api/teacher/cockpit/raffle", { classId: 1, xp: 15 });
  assert.equal(r.status, 409, "nur eine Ziehung pro Tag");
  assert.equal(awarded.length, 1);

  r = await call("POST", "/api/teacher/cockpit/team-award", { classId: 1, rosterId: "r-1", xp: 999 });
  assert.equal(r.status, 200);
  assert.deepEqual(
    awarded.slice(1),
    [
      { id: 11, amount: 10, source: "klassenspiel_team" },
      { id: 12, amount: 10, source: "klassenspiel_team" }
    ],
    "gleiche XP für jedes Mitglied, unbekannte XP-Menge fällt auf 10 zurück"
  );
  r = await call("POST", "/api/teacher/cockpit/team-award", { classId: 1, rosterId: "r-2", xp: 10 });
  assert.equal(r.status, 409, "ein Team des Tages pro Tag");

  r = await call("POST", "/api/teacher/cockpit/class-mission", { classId: 1, levelCheckId: "lc-1", goalIds: [] });
  assert.equal(r.status, 400);
  r = await call("POST", "/api/teacher/cockpit/class-mission", {
    classId: 1,
    levelCheckId: "lc-1",
    goalIds: [goalIds[1], goalIds[0]],
    tier: "rookie",
    dueDate: "2026-11-17"
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.title, "Bis Di., 17.11. haben alle Mission 1–2 auf Rookie sicher.");
  r = await call("POST", "/api/teacher/cockpit/class-mission", {
    classId: 1,
    levelCheckId: "lc-1",
    goalIds: [goalIds[0]],
    tier: "operator",
    title: "Alle Mission 1 auf Operator"
  });
  assert.equal(db.missions.filter((m) => m.active).length, 1, "immer nur eine aktive Klassen-Mission");

  r = await call("GET", "/api/teacher/cockpit?classId=1");
  assert.equal(r.body.game.mission.title, "Alle Mission 1 auf Operator");
  assert.equal(r.body.game.mission.done, 1, "nur Mila hat Mission 1 auf Operator sicher");
  assert.equal(r.body.game.mission.total, 3);
  assert.equal(r.body.game.raffle.drawn.winnerId, 13);
  assert.equal(r.body.game.team.name, "Team Blau");

  user = { id: 12, role: "student", school_id: 1, class_id: 1 };
  r = await call("GET", "/api/student/class-game");
  assert.equal(r.status, 200);
  const g = r.body.game;
  assert.equal(g.mission.done, 1);
  assert.equal(g.mission.mine, false);
  assert.equal(JSON.stringify(g.mission).includes("Mila"), false, "Klassen-Mission ohne Namen");
  assert.equal(g.raffle.inPot, false);
  assert.equal(g.raffle.drawn.youWon, false);
  assert.equal(g.raffle.drawn.winnerShort, "Mila");
  assert.equal(g.team.yours, true);
  assert.equal(g.team.xpEach, 10);

  r = await call("POST", "/api/teacher/cockpit/raffle", { classId: 1 });
  assert.equal(r.status, 403, "Schüler:innen können nicht ziehen");

  console.log("✔ teacher-cockpit: alle Prüfungen bestanden");
} finally {
  server.close();
}
