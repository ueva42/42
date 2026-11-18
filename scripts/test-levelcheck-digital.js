import assert from "node:assert/strict";
import {
  parseRichtig,
  statusAfterRelease,
  personDisplayStatus,
  canStudentEnter,
  serializeTrainingLevelcheck,
  buildConfirmedFromResults,
  tierSatisfiedByCheck,
  isTestAccountName,
  levelToApi,
  DEFAULT_AUFGABEN,
  DEFAULT_SCHWELLE
} from "../lib/levelcheck-digital.js";

assert.equal(DEFAULT_AUFGABEN, 10);
assert.equal(DEFAULT_SCHWELLE, 7);
assert.equal(levelToApi("street_legend"), "streetLegend");
assert.equal(isTestAccountName("T1"), true);
assert.equal(isTestAccountName("Anna"), false);

assert.deepEqual(parseRichtig(7), { ok: true, value: 7 });
assert.equal(parseRichtig(11).ok, false);
assert.equal(parseRichtig(-1).ok, false);
assert.deepEqual(parseRichtig(null), { ok: true, value: null });

assert.equal(statusAfterRelease(7, 7, false), "bestaetigt");
assert.equal(statusAfterRelease(6, 7, false), "nicht_bestanden");
assert.equal(statusAfterRelease(null, 7, false), "nicht_teilgenommen");
assert.equal(statusAfterRelease(9, 7, true), "nicht_teilgenommen");

assert.equal(
  personDisplayStatus({ date: "2099-01-01", today: "2026-11-18", result: null }),
  "geplant"
);
assert.equal(
  personDisplayStatus({ date: "2026-11-01", today: "2026-11-18", result: null }),
  "offen"
);
assert.equal(
  personDisplayStatus({
    date: "2026-11-01",
    today: "2026-11-18",
    result: { richtig: 8, status: "eingetragen" }
  }),
  "eingetragen"
);
assert.equal(
  personDisplayStatus({
    date: "2026-11-01",
    today: "2026-11-18",
    freigegebenAm: "2026-11-10",
    result: { richtig: 8, status: "bestaetigt" }
  }),
  "bestaetigt"
);
assert.equal(canStudentEnter("offen"), true);
assert.equal(canStudentEnter("eingetragen"), true);
assert.equal(canStudentEnter("geplant"), false);
assert.equal(canStudentEnter("bestaetigt"), false);

assert.equal(tierSatisfiedByCheck("rookie", "operator"), true);
assert.equal(tierSatisfiedByCheck("street_legend", "rookie"), false);

const serialized = serializeTrainingLevelcheck(
  {
    id: "abc",
    title: "LC1",
    date: "2026-11-24",
    check_level: "rookie",
    wz: ["qg-01", "qg-02"],
    aufgaben: 10,
    schwelle: 7
  },
  "offen",
  null
);
assert.deepEqual(serialized, {
  id: "abc",
  titel: "LC1",
  datum: "2026-11-24",
  level: "rookie",
  wz: ["qg-01", "qg-02"],
  aufgaben: 10,
  schwelle: 7,
  status: "offen",
  richtig: null,
  bestaetigtAm: null
});

const released = serializeTrainingLevelcheck(
  {
    id: "abc",
    title: "LC1",
    date: "2026-11-24",
    check_level: "rookie",
    wz: ["qg-01"],
    aufgaben: 10,
    schwelle: 7,
    freigegeben_am: "2026-11-20T10:00:00.000Z"
  },
  "bestaetigt",
  8
);
assert.equal(released.status, "bestätigt");
assert.equal(released.bestaetigtAm, "2026-11-20");
assert.equal(released.richtig, 8);

const cps = [
  {
    id: "cp1",
    freigegeben_am: "2026-11-10",
    check_level: "operator",
    linkedGoalIds: ["g1", "g2"]
  }
];
const results = new Map([
  ["cp1|5", { status: "bestaetigt", richtig: 8 }],
  ["cp1|6", { status: "nicht_bestanden", richtig: 4 }]
]);
const confirmed = buildConfirmedFromResults(cps, results);
assert.equal(confirmed.has("5|g1|rookie"), true);
assert.equal(confirmed.has("5|g1|operator"), true);
assert.equal(confirmed.has("5|g2|operator"), true);
assert.equal(confirmed.has("5|g1|street_legend"), false);
assert.equal(confirmed.has("6|g1|rookie"), false);

console.log("test-levelcheck-digital: ok");
