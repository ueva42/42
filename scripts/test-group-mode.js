/**
 * Smoke-Tests für Gruppenmodus-Hilfslogik (ohne DB).
 * Ausführen: node scripts/test-group-mode.js
 */
import {
  allRolesCovered,
  clampGroupSize,
  joinGoalTexts,
  memberGoalsComplete,
  normalizeGoalList,
  parseRoleGoalsCsv,
  roleGoalDedupeKey,
  sessionProgress,
  suggestRoleAssignment,
  toIsoDateOnly,
  validateMemberCount
} from "../lib/group-mode.js";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function testClamp() {
  assert(clampGroupSize(2, 4).maxMembers === 4, "default max");
  assert(clampGroupSize(1, 3).minMembers === 2, "min at least 2");
  assert(clampGroupSize(3, 2).maxMembers >= 3, "max >= min");
}

function testDates() {
  assert(toIsoDateOnly("2026-09-07") === "2026-09-07", "iso string");
  assert(toIsoDateOnly(new Date(Date.UTC(2026, 8, 7))) === "2026-09-07", "date object");
  const bad = String(new Date(Date.UTC(2026, 8, 7)));
  assert(bad.slice(0, 10) !== "2026-09-07", "native string is not iso");
  assert(toIsoDateOnly(bad) === "2026-09-07", "parses native date string");
}

function testMemberCount() {
  const ok = validateMemberCount(3, { minMembers: 2, maxMembers: 4 });
  assert(ok.ok, "3 members ok");
  const low = validateMemberCount(1, { minMembers: 2, maxMembers: 4 });
  assert(!low.ok, "1 member rejected");
  const high = validateMemberCount(5, { minMembers: 2, maxMembers: 4 });
  assert(!high.ok, "5 members rejected");
}

function testSuggestRoles() {
  const roles = [
    { id: "a", name: "Versuch", active: true },
    { id: "b", name: "Protokoll", active: true },
    { id: "c", name: "Ergebnis", active: true },
    { id: "d", name: "Produkt", active: true }
  ];
  const three = suggestRoleAssignment([1, 2, 3], roles);
  assert(three.length === 4, "4 roles assigned");
  const counts = {};
  for (const a of three) counts[a.userId] = (counts[a.userId] || 0) + 1;
  assert(Object.values(counts).some((n) => n > 1), "someone gets multi role");
}

function testCover() {
  const roles = [
    { id: "a", name: "Versuch", active: true },
    { id: "b", name: "Protokoll", active: true }
  ];
  const bad = allRolesCovered([{ userId: 1, roleId: "a" }], roles, true);
  assert(!bad.ok, "missing role");
  const good = allRolesCovered(
    [
      { userId: 1, roleId: "a" },
      { userId: 1, roleId: "b" }
    ],
    roles,
    true
  );
  assert(good.ok, "multi role allowed");
  const blocked = allRolesCovered(
    [
      { userId: 1, roleId: "a" },
      { userId: 1, roleId: "b" }
    ],
    roles,
    false
  );
  assert(!blocked.ok, "multi role blocked");
}

function testGoals() {
  assert(
    !memberGoalsComplete({ what_goal_id: null }, { enableWhatGoals: true }),
    "missing what"
  );
  assert(
    memberGoalsComplete(
      {
        what_goal_id: "g1",
        how_goal_text: "Ich beobachte.",
        goals_confirmed_at: "2026-01-01"
      },
      { enableWhatGoals: true, enableHowGoals: true }
    ),
    "complete"
  );
  const prog = sessionProgress(
    [
      { goals_confirmed_at: "x", what_goal_id: "1", how_goal_text: "y" },
      { what_goal_id: null }
    ],
    { enableWhatGoals: true, enableHowGoals: true }
  );
  assert(prog.goalsDone === 1 && prog.total === 2, "progress counts");
}

function testCsvImport() {
  const sample = `Fach;Rolle;Rollenbeschreibung;Zielart;Zieltext;Reihenfolge;Aktiv
Physik;Versuch;Plant;WAS;Ich plane einen Versuch.;1;ja
Physik;Versuch;Plant;WIE;Ich beachte die Regeln.;1;ja
Physik;Versuch;Plant;XYZ;Ungültig;1;ja
Sport;Coaching;Hilft;WAS;Ich beobachte.;1;ja
`;
  const parsed = parseRoleGoalsCsv(sample);
  assert(parsed.rows.length === 3, "3 valid rows");
  assert(parsed.errors.some((e) => String(e.message).includes("WAS oder WIE")), "invalid type");
  const key = roleGoalDedupeKey({
    subject: "Physik",
    roleName: "Versuch",
    type: "WAS",
    text: "Ich plane einen Versuch."
  });
  assert(parsed.rows[0].key === key, "dedupe key");

  const noSubject = parseRoleGoalsCsv(
    `Rolle;Rollenbeschreibung;Zielart;Zieltext;Reihenfolge;Aktiv
Protokoll;Dok;WAS;Ich notiere.;1;ja`,
    { defaultSubject: "Physik" }
  );
  assert(noSubject.rows.length === 1 && noSubject.rows[0].subject === "Physik", "default subject");
}

function testMultiGoals() {
  const list = normalizeGoalList([
    { id: "1", text: "A" },
    { id: "2", text: "B" },
    null
  ]);
  assert(list.length === 2, "normalize two goals");
  assert(joinGoalTexts(list) === "A · B", "join texts");
  assert(
    memberGoalsComplete(
      {
        whatGoals: list,
        howGoals: [{ id: "h", text: "Sorgfältig" }],
        goals_confirmed_at: "x"
      },
      { enableWhatGoals: true, enableHowGoals: true }
    ),
    "multi goals complete"
  );
}

testClamp();
testDates();
testMemberCount();
testSuggestRoles();
testCover();
testGoals();
testCsvImport();
testMultiGoals();
console.log("OK – group-mode helper tests passed");
