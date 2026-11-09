/**
 * Demo-Mathe: Potenzen und Wurzeln, ohne Datenbank.
 * Ausführen: node scripts/test-demo-seed.js
 */
import assert from "node:assert/strict";
import {
  DEMO_CLASS_NAME,
  DEMO_MATHE_DAY_GOAL,
  DEMO_MATHE_TARGET_GRADE,
  DEMO_MATHE_TOPIC,
  DEMO_STUDENT,
  demoMatheCatalogDefinition
} from "../lib/demo-seed.js";
import {
  POTENZEN_ASSIGN_TOPIC,
  POTENZEN_CITY,
  POTENZEN_GOAL_ASSIGNMENTS,
  POTENZEN_THEMA,
  cityMapLabel,
  cityUrl,
  haltForStoredWz,
  loadHalte,
  normalizeGoalName,
  stationUrl,
  trainingOpenUrl
} from "../lib/training-merge.js";

const TOKEN = "demoTokenPotenzen1234567890abcd";
const demo = demoMatheCatalogDefinition();
const halte = loadHalte(POTENZEN_THEMA);
const names = POTENZEN_GOAL_ASSIGNMENTS.map(([, name]) => name);

assert.equal(DEMO_STUDENT, "lina.demo");
assert.equal(DEMO_CLASS_NAME, "9a Demo");
assert.equal(demo.name, "Potenzen und Wurzeln");
assert.equal(normalizeGoalName(demo.name), POTENZEN_ASSIGN_TOPIC);
assert.equal(normalizeGoalName(DEMO_MATHE_TOPIC), POTENZEN_ASSIGN_TOPIC);
assert.equal(demo.gradeLevel, "9");
assert.equal(demo.dayGoal, "Potenzen");
assert.equal(DEMO_MATHE_DAY_GOAL, "Potenzen");
assert.equal(demo.targetGrade, "3");
assert.equal(DEMO_MATHE_TARGET_GRADE, "3");
assert.deepEqual(
  demo.rows.map((row) => row.unterthema),
  names
);
assert.equal(demo.rows.length, 7);

for (const row of demo.rows) {
  assert.equal(row.thema, DEMO_MATHE_TOPIC);
  assert.equal(row.fach, "Mathe");
  assert.equal(row.materialType, "none");
  assert.equal(row.practiceUrl, null);
  assert.equal(/forschendphaenomenal/i.test(JSON.stringify(row)), false);
}

const dayWz = POTENZEN_GOAL_ASSIGNMENTS.find(([, name]) => name === demo.dayGoal)?.[0];
assert.equal(dayWz, "pw-01");
const dayHalt = haltForStoredWz(halte, dayWz);
assert.equal(dayHalt.n, 1);
assert.equal(dayHalt.url, "potenzen/potenzen/");

const note = demo.targetGrade;
const todayUrl = cityUrl(TOKEN, note, dayHalt.n, POTENZEN_CITY);
assert.equal(
  todayUrl,
  `https://trainingscenter.streetsoflogic.de/?t=${TOKEN}&note=3&k=9&d=potenzen&h=1`
);
assert.equal(todayUrl.includes("h="), true);
assert.equal(todayUrl.includes("lina"), false);
assert.equal(todayUrl.includes("name="), false);
assert.equal(cityMapLabel(POTENZEN_THEMA), "Trainingscenter öffnen");

const topicUrl = cityUrl(TOKEN, note, undefined, POTENZEN_CITY);
assert.equal(
  topicUrl,
  `https://trainingscenter.streetsoflogic.de/?t=${TOKEN}&note=3&k=9&d=potenzen`
);
assert.equal(topicUrl.includes("h="), false);

for (const [wz, name] of POTENZEN_GOAL_ASSIGNMENTS) {
  const halt = haltForStoredWz(halte, wz);
  assert.equal(halt.name, name);
  const open = trainingOpenUrl(halt, TOKEN, note);
  assert.equal(open, stationUrl(halt.url, TOKEN, note));
  assert.match(open, /^https:\/\/trainingscenter\.streetsoflogic\.de\/potenzen\/[a-z0-9-]+\/\?t=/);
  assert.equal(open.includes("h="), false);
  assert.equal(open.includes("lina"), false);
}

console.log("demo-seed ok");
