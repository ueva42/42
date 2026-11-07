/**
 * Trainingscenter-Verbindung, nur Thema Funktionen.
 * Ausführen: node scripts/test-training.js
 */
import assert from "node:assert/strict";
import { once } from "node:events";
import express from "express";
import {
  TRAINING_ORIGIN,
  applyTrainingCors,
  bandFromSolved,
  formatZielnote,
  BINOM_ASSIGN_TOPIC,
  BINOM_GOAL_ASSIGNMENTS,
  POTENZEN_ASSIGN_TOPIC,
  POTENZEN_CITY,
  POTENZEN_GOAL_ASSIGNMENTS,
  POTENZEN_LEVEL_TEXTS,
  POTENZEN_THEMA,
  QG_ASSIGN_TOPIC,
  QG_CITY,
  QG_GOAL_ASSIGNMENTS,
  QG_LEVEL_TEXTS,
  QG_THEMA,
  TRAINING_ASSIGN_TOPIC,
  TRAINING_GOAL_ASSIGNMENTS,
  TRIG_ASSIGN_TOPIC,
  TRIG_CITY,
  TRIG_GOAL_ASSIGNMENTS,
  TRIG_LEVEL_TEXTS,
  TRIG_PRACTICE_MARKER,
  TRIG_THEMA,
  cityMapLabel,
  cityUrl,
  haltForStoredWz,
  isCityMapTopic,
  loadHalte,
  normalizeDashGoalName,
  pruefungsarchivUrl,
  matchHalteToGoals,
  makeProofCode,
  mergeTraining,
  normalizeGoalName,
  parseProofCode,
  proofToPayload,
  pensumText,
  stationUrl,
  statusFromTraining,
  trainingOpenUrl,
  storedTrainingWz,
  topicIsFunktionen,
  trainingAllowOrigin,
  validatePayload,
  vergleich,
  wzForThema
} from "../lib/training-merge.js";
import {
  allowTrainingMessage,
  assignPotenzenGoalIds,
  assignPotenzenLevelTexts,
  applyTrigPracticeLinks,
  assignQuadratischeGoalIds,
  assignQuadratischeLevelTexts,
  assignTrainingGoalIds,
  assignTrigonometrieGoalIds,
  assignTrigonometrieLevelTexts,
  assignTrigonometriePracticeLinks,
  captureTrainingResultBody,
  cityMapsForGoals,
  registerTrainingRoutes,
  resetTrainingRateLimit
} from "../lib/training-api.js";

const TOKEN = "aaaaaaaaaaaaaaaa";
const POT = "eeeeeeeeeeeeeeee";
const QG = "ffffffffffffffff";
const TRIG = "gggggggggggggggg";
const REVOKED = "bbbbbbbbbbbbbbbb";
const RATE = "cccccccccccccccc";
const UNKNOWN = "dddddddddddddddd";

function levels(rookie, operator, streetLegend) {
  return { rookie, operator, streetLegend };
}

function body(extra = {}) {
  return {
    v: 1,
    token: TOKEN,
    wz: "9-05b",
    levels: levels(
      { solved: 6, first: 5, safe: true },
      { solved: 4, first: 1, safe: false },
      { solved: 1, first: 0, safe: false }
    ),
    kontrolle: true,
    problem: true,
    ichKann: { rookie: "sicher", operator: "noch nicht", streetLegend: null },
    pensumErfuellt: true,
    ...extra
  };
}

const halte = loadHalte();
assert.equal(halte.length, 26);
assert.equal(halte.find((item) => item.n === 7).wz, "9-05b");
assert.equal(halte.some((item) => item.wz === "fkt-07"), false);
assert.deepEqual(Object.keys(halte[0]).sort(), ["n", "name", "url", "wz"]);
assert.equal(wzForThema("funktionen").has("9-05b"), true);
assert.equal(wzForThema("funktionen").has("fkt-01"), true);
assert.equal(wzForThema("funktionen").has("fkt-25"), true);
assert.equal(wzForThema("funktionen").has("fkt-26"), true);
assert.equal(wzForThema("brueche").has("9-05b"), false);
assert.equal(wzForThema("funktionen").has("pw-01"), false);
assert.equal(wzForThema("potenzen").has("fkt-01"), false);
assert.equal(wzForThema("potenzen").has("9-05b"), false);

const potenzen = loadHalte("potenzen");
const potenzErwartet = [
  [1, "pw-01", "Potenzen", "potenzen/potenzen/"],
  [2, "pw-02", "Zehnerpotenzen", "potenzen/zehnerpotenzen/"],
  [3, "pw-03", "Quadratwurzeln", "potenzen/quadratwurzeln/"],
  [4, "pw-04", "Quadratwurzeln multiplizieren und dividieren", "potenzen/wurzeln-multiplizieren-dividieren/"],
  [5, "pw-05", "Quadratwurzeln addieren und subtrahieren", "potenzen/wurzeln-addieren-subtrahieren/"],
  [6, "pw-06", "Teilweises Wurzelziehen", "potenzen/teilweises-wurzelziehen/"],
  [7, "pw-07", "Alle Rechenarten zusammen", "potenzen/alle-rechenarten/"]
];
assert.equal(potenzen.length, 7);
assert.deepEqual(
  potenzen.map((item) => [item.n, item.wz, item.name, item.url]),
  potenzErwartet
);
assert.equal(potenzen.some((item) => String(item.url).includes("potenzen/potenzen/potenzen")), false);
assert.equal(wzForThema("potenzen").size, 7);
for (const wz of wzForThema("potenzen")) assert.equal(wzForThema("funktionen").has(wz), false);
for (const wz of wzForThema("funktionen")) assert.equal(wzForThema("potenzen").has(wz), false);

const quadratische = loadHalte("quadratische-gleichungen");
const quadratErwartet = [
  [1, "qg-01", "Binomische Formeln", "quadratische-gleichungen/binomische-formeln/"],
  [2, "qg-02", "Rein quadratische Gleichungen", "quadratische-gleichungen/rein-quadratische-gleichungen/"],
  [3, "qg-03", "Satz vom Nullprodukt", "quadratische-gleichungen/satz-vom-nullprodukt/"],
  [4, "qg-04", "Quadratische Ergänzung", "quadratische-gleichungen/quadratische-ergaenzung/"],
  [5, "qg-05", "Lösungsformel", "quadratische-gleichungen/loesungsformel/"]
];
assert.equal(quadratische.length, 5);
assert.deepEqual(
  quadratische.map((item) => [item.n, item.wz, item.name, item.url]),
  quadratErwartet
);
assert.equal(
  quadratische.some((item) => String(item.url).includes("quadratische-gleichungen/quadratische-gleichungen")),
  false
);
assert.equal(wzForThema("quadratische-gleichungen").size, 5);
assert.equal(QG_THEMA, "quadratische-gleichungen");
for (const wz of wzForThema("quadratische-gleichungen")) {
  assert.equal(wzForThema("funktionen").has(wz), false);
  assert.equal(wzForThema("potenzen").has(wz), false);
}
for (const wz of wzForThema("funktionen")) {
  assert.equal(wzForThema("quadratische-gleichungen").has(wz), false);
}
for (const wz of wzForThema("potenzen")) {
  assert.equal(wzForThema("quadratische-gleichungen").has(wz), false);
}

const trigonometrie = loadHalte("trigonometrie");
const trigErwartet = [
  [1, "trig-01", "Startklar? (Wiederholung)", "trigonometrie/startklar/"],
  [2, "trig-02", "Sinus, Kosinus, Tangens", "trigonometrie/sinus-kosinus-tangens/"],
  [3, "trig-03", "Berechnungen am rechtwinkligen Dreieck", "trigonometrie/rechtwinkliges-dreieck/"],
  [4, "trig-04", "Berechnungen am allgemeinen Dreieck", "trigonometrie/allgemeines-dreieck/"],
  [5, "trig-05", "Trigonometrie in der Ebene", "trigonometrie/trigonometrie-ebene/"],
  [6, "trig-06", "Einheitskreis \u2013 nur Sinus", "trigonometrie/einheitskreis/"],
  [7, "trig-07", "Prüfungsaufgaben", null]
];
assert.equal(trigonometrie.length, 7);
assert.deepEqual(
  trigonometrie.map((item) => [item.n, item.wz, item.name, item.url || null]),
  trigErwartet
);
assert.equal(trigonometrie.find((item) => item.wz === "trig-07").url == null, true);
assert.equal(
  trigonometrie.some((item) => String(item.url || "").includes("pruefungsaufgaben")),
  false
);
assert.equal(
  trigonometrie.some((item) => String(item.url || "").includes("trigonometrie/trigonometrie/")),
  false
);
assert.equal(wzForThema("trigonometrie").size, 7);
assert.equal(TRIG_THEMA, "trigonometrie");
assert.equal(wzForThema("funktionen").has("trig-01"), false);
assert.equal(wzForThema("potenzen").has("trig-01"), false);
assert.equal(wzForThema("quadratische-gleichungen").has("trig-01"), false);
assert.equal(wzForThema("trigonometrie").has("fkt-01"), false);
assert.equal(wzForThema("trigonometrie").has("pw-01"), false);
assert.equal(wzForThema("trigonometrie").has("qg-01"), false);
assert.equal(wzForThema("trigonometrie").has("fkt-26"), false);
for (const wz of wzForThema("trigonometrie")) {
  assert.equal(wzForThema("funktionen").has(wz), false);
  assert.equal(wzForThema("potenzen").has(wz), false);
  assert.equal(wzForThema("quadratische-gleichungen").has(wz), false);
}
assert.equal(
  normalizeDashGoalName("Einheitskreis \u2013 nur Sinus"),
  normalizeDashGoalName("Einheitskreis - nur Sinus")
);
assert.equal(
  normalizeDashGoalName("Einheitskreis \u2014 nur Sinus"),
  "einheitskreis - nur sinus"
);
assert.equal(
  normalizeDashGoalName("Einheitskreis \u2212 nur Sinus"),
  "einheitskreis - nur sinus"
);
assert.notEqual(normalizeDashGoalName("Einheitskreis"), "einheitskreis - nur sinus");
assert.equal(haltForStoredWz(trigonometrie, "trig-02").url, "trigonometrie/sinus-kosinus-tangens/");

assert.equal(trainingAllowOrigin(TRAINING_ORIGIN), TRAINING_ORIGIN);
assert.equal(trainingAllowOrigin("https://evil.example"), "");
assert.equal(trainingAllowOrigin("http://trainingscenter.streetsoflogic.de"), "");

const corsHeaders = {};
applyTrainingCors(
  { headers: { origin: "https://evil.example" } },
  { setHeader(name, value) { corsHeaders[name] = value; } }
);
assert.equal(corsHeaders["Access-Control-Allow-Origin"], undefined);
assert.equal(corsHeaders.Vary, "Origin");

const prior = {
  wz: "9-05b",
  levels: levels(
    { solved: 6, first: 5, safe: true },
    { solved: 2, first: 1, safe: false },
    { solved: 0, first: 0, safe: false }
  ),
  kontrolle: true,
  problem: true,
  ichKann: { rookie: "sicher", operator: "teilweise", streetLegend: null }
};
const checked = validatePayload(
  body({
    levels: levels(
      { solved: 1, first: 0, safe: false },
      { solved: 4, first: 3, safe: true },
      { solved: 0, first: 0, safe: false }
    ),
    kontrolle: false,
    problem: false,
    ichKann: { rookie: null, operator: "noch nicht", streetLegend: "noch-nicht" }
  })
);
assert.equal(checked.ok, true);
assert.equal(checked.value.ichKann.operator, "noch-nicht");
const merged = mergeTraining(prior, checked.value);
assert.equal(merged.levels.rookie.solved, 6);
assert.equal(merged.levels.rookie.first, 5);
assert.equal(merged.levels.rookie.safe, true);
assert.equal(merged.levels.operator.solved, 4);
assert.equal(merged.levels.operator.first, 3);
assert.equal(merged.levels.operator.safe, true);
assert.equal(merged.kontrolle, true);
assert.equal(merged.problem, true);

assert.equal(statusFromTraining("offen", { solved: 6, safe: false }), "sicher");
assert.equal(statusFromTraining("offen", { solved: 4, safe: true }), "sicher");
assert.equal(statusFromTraining("in_arbeit", { solved: 6, safe: true }), "sicher");
assert.equal(statusFromTraining("sicher", { solved: 6, safe: true }), null);
assert.equal(statusFromTraining("offen", { solved: 3, safe: false }), "in_arbeit");
assert.equal(statusFromTraining("in_arbeit", { solved: 3, safe: false }), null);
assert.equal(statusFromTraining("sicher", { solved: 3, safe: false }), null);
assert.equal(statusFromTraining("sicher", { solved: 0, safe: false }), null);
assert.equal(statusFromTraining("offen", { solved: 0, safe: false }), null);
assert.equal(statusFromTraining("in_arbeit", { solved: 0 }), null);
assert.equal(statusFromTraining("offen", { solved: 0, safe: true }), "sicher");

const sampleCode = makeProofCode({
  wz: "9-05b",
  solved: [6, 4, 0],
  first: [5, 3, 0],
  kontrolle: true,
  ichKann: ["sicher", "teilweise", null]
});
assert.match(sampleCode, /^9-05B-R65-OP43-SL00-K1-I320-[A-Z2-9]{2}$/);
const sampleParsed = parseProofCode(sampleCode);
assert.equal(sampleParsed.ok, true);
assert.equal(sampleParsed.wz, "9-05b");
assert.deepEqual(sampleParsed.solved, [6, 4, 0]);
assert.deepEqual(sampleParsed.first, [5, 3, 0]);
assert.equal(sampleParsed.kontrolle, true);
assert.deepEqual(sampleParsed.ichKann, ["sicher", "teilweise", null]);
const samplePayload = proofToPayload(sampleParsed);
assert.equal(samplePayload.levels.rookie.solved, 6);
assert.equal(samplePayload.levels.rookie.safe, true);
assert.equal(samplePayload.levels.operator.solved, 4);
assert.equal(samplePayload.levels.operator.safe, false);
assert.equal(samplePayload.levels.streetLegend.solved, 0);
assert.equal(samplePayload.problem, false);
const nineCode = makeProofCode({
  wz: "9-05b",
  solved: [9, 0, 0],
  first: [1, 0, 0],
  kontrolle: false,
  ichKann: [null, null, null]
});
assert.match(nineCode, /^9-05B-R91-OP00-SL00-K0-I000-/);
const nineParsed = parseProofCode(nineCode);
assert.deepEqual(nineParsed.solved, [9, 0, 0]);
assert.equal(proofToPayload(nineParsed).levels.rookie.solved, 9);
assert.equal(proofToPayload(nineParsed).levels.rookie.safe, true);
assert.equal(parseProofCode("kein-code").ok, false);
assert.equal(parseProofCode(sampleCode.slice(0, -1) + (sampleCode.endsWith("A") ? "B" : "A")).error, "pruefzeichen");

function refChecksum(source) {
  const alph = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let hash = 17;
  for (const ch of `SOL${source}`) hash = (hash * 31 + ch.charCodeAt(0) + 7) % 1021;
  return alph[hash % 32] + alph[Math.floor(hash / 32) % 32];
}
const clashBody = "905BR56OP00SL00K0I000";
const clash = `9-05B-R56-OP00-SL00-K0-I000-${refChecksum(clashBody)}`;
assert.equal(parseProofCode(clash).error, "widerspruch");
assert.equal(merged.ichKann.rookie, "sicher");
assert.equal(merged.ichKann.operator, "noch-nicht");
assert.equal(merged.ichKann.streetLegend, "noch-nicht");
assert.equal(Object.hasOwn(merged, "pensumErfuellt"), false);

assert.equal(validatePayload(body({ v: 2 })).ok, false);
assert.equal(validatePayload(body({ token: "kurz" })).ok, false);
assert.equal(validatePayload(body({ token: "hat leerzeichen!!!!" })).ok, false);
assert.equal(validatePayload(body({ wz: "fremd" })).ok, false);
assert.equal(
  validatePayload(body({
    levels: levels(
      { solved: 1000, first: 0, safe: false },
      { solved: 0, first: 0, safe: false },
      { solved: 0, first: 0, safe: false }
    )
  })).ok,
  false
);
assert.equal(
  validatePayload(body({
    levels: levels(
      { solved: 1.5, first: 0, safe: false },
      { solved: 0, first: 0, safe: false },
      { solved: 0, first: 0, safe: false }
    )
  })).ok,
  false
);
assert.equal(validatePayload(body({ ichKann: { rookie: "vielleicht", operator: null, streetLegend: null } })).ok, false);
assert.equal(formatZielnote("1.5"), "1,5");
assert.equal(formatZielnote("3"), "3");
assert.equal(formatZielnote(""), null);

const pairs = [
  [6, "sicher", "passt"],
  [6, "teilweise", "unterschätzt"],
  [6, "noch-nicht", "unterschätzt"],
  [4, "sicher", "überschätzt"],
  [4, "teilweise", "passt"],
  [4, "noch nicht", "unterschätzt"],
  [1, "sicher", "überschätzt"],
  [1, "teilweise", "überschätzt"],
  [0, "noch-nicht", "passt"],
  [2, null, null]
];
for (const [solved, kann, expected] of pairs) {
  assert.equal(vergleich(solved, kann), expected, `${solved} ${kann}`);
}
assert.equal(bandFromSolved(6), "sicher");
assert.equal(bandFromSolved(5), "teilweise");
assert.equal(bandFromSolved(2), "noch-nicht");

const goals = [
  { id: "g1", text: "Scheitel auf der y-Achse" },
  { id: "g2", text: "  geraden   zeichnen " },
  { id: "g3", text: "Scheitel auf der y-Achse" }
];
const matched = matchHalteToGoals(halte, [
  { id: "g1", text: "Scheitel auf der y-Achse" },
  { id: "g2", text: "Geraden zeichnen" }
]);
assert.equal(matched.matches.length, 2);
assert.equal(matched.abweichungen.some((item) => item.name === "Scheitel auf der y-Achse"), false);
assert.equal(matched.abweichungen.some((item) => item.name === "Prüfungsaufgaben"), true);
const ambiguous = matchHalteToGoals(halte, goals);
assert.equal(
  ambiguous.abweichungen.some((item) => item.wz === "9-05b" && item.grund === "nicht eindeutig"),
  true
);
assert.equal(TRAINING_GOAL_ASSIGNMENTS.length, 26);
const assignWz = TRAINING_GOAL_ASSIGNMENTS.map(([wz]) => wz);
const assignNames = TRAINING_GOAL_ASSIGNMENTS.map(([, name]) => normalizeGoalName(name));
assert.equal(new Set(assignWz).size, assignWz.length);
assert.equal(new Set(assignNames).size, assignNames.length);
assert.equal(assignWz.includes("fkt-25"), true);
assert.equal(assignWz.includes("fkt-26"), true);
assert.equal(assignWz.includes("fkt-07"), false);
assert.equal(assignWz.includes("9-05b"), true);
assert.deepEqual(TRAINING_GOAL_ASSIGNMENTS.slice(0, 24).map(([wz]) => wz), [
  "fkt-01", "fkt-02", "fkt-03", "fkt-04", "fkt-05", "fkt-06", "9-05b",
  "fkt-08", "fkt-09", "fkt-10", "fkt-11", "fkt-12", "fkt-13", "fkt-14",
  "fkt-15", "fkt-16", "fkt-17", "fkt-18", "fkt-19", "fkt-20", "fkt-21",
  "fkt-22", "fkt-23", "fkt-24"
]);
assert.deepEqual(TRAINING_GOAL_ASSIGNMENTS.slice(24), [
  ["fkt-25", "Typische Aufgaben"],
  ["fkt-26", "Prüfungsaufgaben"]
]);
assert.equal(TRAINING_GOAL_ASSIGNMENTS.find(([wz]) => wz === "fkt-01")[1], "Geraden zeichnen");
assert.equal(TRAINING_GOAL_ASSIGNMENTS.find(([wz]) => wz === "9-05b")[1], "Scheitel auf der y-Achse");
assert.equal(halte.find((item) => item.wz === "fkt-01").n, 1);
assert.equal(halte.find((item) => item.wz === "fkt-01").url, "funktionen/geraden-zeichnen/");
assert.equal(halte.find((item) => item.wz === "9-05b").n, 7);
assert.equal(halte.find((item) => item.wz === "9-05b").url, "funktionen/scheitel-auf-der-y-achse/");
assert.equal(halte.find((item) => item.wz === "fkt-25").n, 25);
assert.equal(halte.find((item) => item.wz === "fkt-26").n, 26);
for (const [wz, name] of TRAINING_GOAL_ASSIGNMENTS) {
  const halt = halte.find((item) => item.wz === wz);
  assert.equal(halt.name, name);
  assert.match(halt.url, /^funktionen\/[a-z0-9-]+\/$/);
  assert.equal(haltForStoredWz(halte, wz).url, halt.url);
}
assert.equal(POTENZEN_GOAL_ASSIGNMENTS.length, 7);
const potenzWz = POTENZEN_GOAL_ASSIGNMENTS.map(([wz]) => wz);
const potenzNames = POTENZEN_GOAL_ASSIGNMENTS.map(([, name]) => normalizeGoalName(name));
assert.equal(new Set(potenzWz).size, potenzWz.length);
assert.equal(new Set(potenzNames).size, potenzNames.length);
assert.equal(potenzWz.includes("fkt-01"), false);
assert.equal(assignWz.includes("pw-01"), false);
for (const [wz, name] of POTENZEN_GOAL_ASSIGNMENTS) {
  const halt = potenzen.find((item) => item.wz === wz);
  assert.equal(halt.name, name);
  assert.match(halt.url, /^potenzen\/[a-z0-9-]+\/$/);
  assert.equal(haltForStoredWz(potenzen, wz).url, halt.url);
}
assert.equal(haltForStoredWz(halte, "Geraden zeichnen"), null);
assert.equal(haltForStoredWz(halte, ""), null);
assert.equal(haltForStoredWz(potenzen, "Potenzen"), null);
assert.equal(storedTrainingWz({ text: "Geraden zeichnen" }), "");
assert.equal(storedTrainingWz({ trainingWz: " fkt-01 " }), "fkt-01");
const station = stationUrl(haltForStoredWz(halte, "fkt-01").url, TOKEN, "1,5");
assert.equal(
  station,
  `https://trainingscenter.streetsoflogic.de/funktionen/geraden-zeichnen/?t=${TOKEN}&note=1%2C5`
);
assert.equal(station.includes("funktionen/funktionen/"), false);
assert.equal(
  normalizeGoalName("  LINEARE   und\tquadratische\nFunktionen "),
  TRAINING_ASSIGN_TOPIC
);
assert.equal(isCityMapTopic("Lineare und quadratische Funktionen"), true);
assert.equal(isCityMapTopic("  lineare   und quadratische funktionen "), true);
assert.equal(isCityMapTopic("Funktionen"), false);
assert.equal(isCityMapTopic("Quadratische Funktionen"), false);
assert.equal(isCityMapTopic("Potenzen und Wurzeln"), true);
assert.equal(isCityMapTopic("  POTENZEN   und   Wurzeln "), true);
assert.equal(isCityMapTopic("Potenzen"), false);
assert.equal(isCityMapTopic("Wurzeln"), false);
assert.equal(isCityMapTopic("Potenzen und Wurzeln Plus"), false);
assert.equal(isCityMapTopic("Quadratische Gleichungen"), true);
assert.equal(isCityMapTopic("  QUADRATISCHE   Gleichungen "), true);
assert.equal(isCityMapTopic("Binomische Formeln"), false);
assert.equal(isCityMapTopic("Quadratische"), false);
assert.equal(isCityMapTopic("Gleichungen"), false);
assert.equal(isCityMapTopic("TRIGONOMETRIE"), true);
assert.equal(isCityMapTopic("  trigonometrie "), true);
assert.equal(isCityMapTopic("Trigonometrie in der Ebene"), false);
assert.equal(isCityMapTopic("Einheitskreis"), false);
assert.equal(isCityMapTopic("Einheitskreis \u2013 nur Sinus"), false);
assert.equal(isCityMapTopic("Einheitskreis - nur Sinus"), false);
const city = cityUrl(TOKEN, "1,5");
assert.equal(
  city,
  `https://trainingscenter.streetsoflogic.de/?t=${TOKEN}&note=1%2C5&k=10&d=funktionen`
);
assert.equal(city.includes("h="), false);
assert.equal(cityUrl(TOKEN, null), null);
assert.equal(city.includes("name="), false);
const cityHalt = cityUrl(TOKEN, "1,5", 1);
assert.equal(
  cityHalt,
  `https://trainingscenter.streetsoflogic.de/?t=${TOKEN}&note=1%2C5&k=10&d=funktionen&h=1`
);
assert.equal(cityUrl(TOKEN, "1", haltForStoredWz(halte, "fkt-01").n).endsWith("&h=1"), true);
assert.equal(cityUrl(TOKEN, "6", haltForStoredWz(halte, "9-05b").n).endsWith("&h=7"), true);
assert.equal(cityUrl(TOKEN, "4", haltForStoredWz(halte, "fkt-25").n).endsWith("&h=25"), true);
assert.equal(cityUrl(TOKEN, "4", haltForStoredWz(halte, "fkt-26").n).endsWith("&h=26"), true);
assert.equal(cityUrl(TOKEN, "1,5", "Geraden zeichnen"), null);
assert.equal(cityUrl(TOKEN, "1,5", "fkt-01"), null);
assert.equal(cityHalt.includes("Geraden"), false);
assert.equal(cityHalt.includes("name="), false);
const cityPotenz = cityUrl(TOKEN, "2", undefined, POTENZEN_CITY);
assert.equal(
  cityPotenz,
  `https://trainingscenter.streetsoflogic.de/?t=${TOKEN}&note=2&k=9&d=potenzen`
);
assert.equal(cityPotenz.includes("h="), false);
assert.equal(cityPotenz.includes("k=10"), false);
assert.equal(cityPotenz.includes("d=funktionen"), false);
const cityPotenzHalt = cityUrl(TOKEN, "2", 1, POTENZEN_CITY);
assert.equal(
  cityPotenzHalt,
  `https://trainingscenter.streetsoflogic.de/?t=${TOKEN}&note=2&k=9&d=potenzen&h=1`
);
const pwStation = stationUrl(haltForStoredWz(potenzen, "pw-01").url, TOKEN, "2");
assert.equal(
  pwStation,
  `https://trainingscenter.streetsoflogic.de/potenzen/potenzen/?t=${TOKEN}&note=2`
);
assert.equal(pwStation.includes("potenzen/potenzen/potenzen"), false);
assert.equal(stationUrl("potenzen/potenzen/potenzen/", TOKEN, "2"), null);
assert.equal(stationUrl("potenzen/potenzen/zehnerpotenzen/", TOKEN, "2"), null);
assert.equal(stationUrl("funktionen/funktionen/geraden-zeichnen/", TOKEN, "2"), null);
const cityQuadrat = cityUrl(TOKEN, "2", undefined, QG_CITY);
assert.equal(
  cityQuadrat,
  `https://trainingscenter.streetsoflogic.de/?t=${TOKEN}&note=2&k=9&d=quadratische-gleichungen`
);
assert.equal(cityQuadrat.includes("h="), false);
assert.equal(cityQuadrat.includes("k=10"), false);
assert.equal(cityQuadrat.includes("d=funktionen"), false);
assert.equal(cityQuadrat.includes("d=potenzen"), false);
assert.equal(cityMapLabel(QG_THEMA), "Stadtkarte öffnen");
assert.equal(cityMapLabel(POTENZEN_THEMA), "Trainingscenter öffnen");
assert.equal(cityMapLabel("funktionen"), "Stadtkarte öffnen");
assert.equal(cityMapLabel(TRIG_THEMA), "Stadtkarte öffnen");
const cityTrig = cityUrl(TOKEN, "3", undefined, TRIG_CITY);
assert.equal(
  cityTrig,
  `https://trainingscenter.streetsoflogic.de/?t=${TOKEN}&note=3&k=10&d=trigonometrie`
);
assert.equal(cityTrig.includes("h="), false);
assert.equal(cityTrig.includes("d=funktionen"), false);
assert.equal(cityTrig.includes("d=potenzen"), false);
assert.equal(cityTrig.includes("k=9"), false);
const cityTrigHalt = cityUrl(TOKEN, "3", 1, TRIG_CITY);
assert.equal(
  cityTrigHalt,
  `https://trainingscenter.streetsoflogic.de/?t=${TOKEN}&note=3&k=10&d=trigonometrie&h=1`
);
assert.equal(cityUrl(TOKEN, "3", 7, TRIG_CITY).endsWith("&h=7"), true);
const trigStation = stationUrl(haltForStoredWz(trigonometrie, "trig-02").url, TOKEN, "3");
assert.equal(
  trigStation,
  `https://trainingscenter.streetsoflogic.de/trigonometrie/sinus-kosinus-tangens/?t=${TOKEN}&note=3`
);
assert.equal(trigStation.includes("k="), false);
assert.equal(trigStation.includes("h="), false);
assert.equal(stationUrl("trigonometrie/trigonometrie/startklar/", TOKEN, "3"), null);
assert.equal(stationUrl("trigonometrie/startklar/extra/", TOKEN, "3"), null);
const trigArchiv = pruefungsarchivUrl(TOKEN, "3");
assert.equal(
  trigArchiv,
  `https://trainingscenter.streetsoflogic.de/pruefungsarchiv/?thema=trigonometrie&k=10&d=trigonometrie&h=7&t=${TOKEN}&note=3`
);
assert.equal(trigArchiv.includes("trigonometrie/pruefungsaufgaben"), false);
assert.equal(pruefungsarchivUrl(TOKEN, null), null);
const fkt25Link = trainingOpenUrl(haltForStoredWz(halte, "fkt-25"), TOKEN, "2");
assert.equal(
  fkt25Link,
  `https://trainingscenter.streetsoflogic.de/funktionen/typische-aufgaben/?t=${TOKEN}&note=2`
);
assert.match(fkt25Link, /\/funktionen\/typische-aufgaben\/\?/);
assert.equal(fkt25Link.includes("pruefungsarchiv"), false);
const fkt26Link = trainingOpenUrl(haltForStoredWz(halte, "fkt-26"), TOKEN, "2");
assert.equal(
  fkt26Link,
  `https://trainingscenter.streetsoflogic.de/pruefungsarchiv/?thema=funktionen&k=10&d=funktionen&h=26&t=${TOKEN}&note=2`
);
assert.equal(fkt26Link.includes("funktionen/pruefungsaufgaben"), false);
assert.equal(fkt26Link.includes("h=26"), true);
assert.equal(
  trainingOpenUrl(haltForStoredWz(halte, "fkt-01"), TOKEN, "1,5"),
  station
);
assert.equal(
  trainingOpenUrl(haltForStoredWz(halte, "9-05b"), TOKEN, "1,5"),
  stationUrl("funktionen/scheitel-auf-der-y-achse/", TOKEN, "1,5")
);
assert.equal(
  trainingOpenUrl(haltForStoredWz(trigonometrie, "trig-07"), TOKEN, "3"),
  trigArchiv
);
assert.equal(
  cityUrl(TOKEN, "1,5"),
  `https://trainingscenter.streetsoflogic.de/?t=${TOKEN}&note=1%2C5&k=10&d=funktionen`
);
const qgStation = stationUrl(haltForStoredWz(quadratische, "qg-01").url, TOKEN, "2");
assert.equal(
  qgStation,
  `https://trainingscenter.streetsoflogic.de/quadratische-gleichungen/binomische-formeln/?t=${TOKEN}&note=2`
);
assert.equal(qgStation.includes("k="), false);
assert.equal(qgStation.includes("d="), false);
assert.equal(qgStation.includes("h="), false);
assert.equal(
  stationUrl("quadratische-gleichungen/quadratische-gleichungen/binomische-formeln/", TOKEN, "2"),
  null
);
assert.equal(stationUrl("quadratische-gleichungen/binomische-formeln/extra/", TOKEN, "2"), null);
assert.equal(
  validatePayload(body({ wz: "qg-01" }), { allowedWz: wzForThema("quadratische-gleichungen") }).ok,
  true
);
assert.equal(
  validatePayload(body({ wz: "qg-01" }), { allowedWz: wzForThema("funktionen") }).ok,
  false
);
assert.equal(
  validatePayload(body({ wz: "fkt-01" }), { allowedWz: wzForThema("quadratische-gleichungen") }).ok,
  false
);
assert.equal(
  validatePayload(body({ wz: "pw-01" }), { allowedWz: wzForThema("quadratische-gleichungen") }).ok,
  false
);
assert.equal(validatePayload(body({ wz: "pw-01" })).ok, false);
assert.equal(
  validatePayload(body({ wz: "pw-01" }), { allowedWz: wzForThema("potenzen") }).ok,
  true
);
assert.equal(
  validatePayload(body({ wz: "fkt-01" }), { allowedWz: wzForThema("potenzen") }).ok,
  false
);
assert.equal(validatePayload(body({ wz: "fkt-25" })).ok, true);
assert.equal(validatePayload(body({ wz: "fkt-26" })).ok, true);

const todayMaps = await cityMapsForGoals(
  {
    async query(sql, params = []) {
      const q = sql.replace(/\s+/g, " ").trim();
      if (q.includes("FROM level_check_goals")) {
        const wanted = new Set(params[0]);
        const rows = [
          {
            id: "g-draw",
            training_wz: " fkt-01 ",
            level_check_id: "lc-f",
            name: "Lineare und quadratische Funktionen"
          },
          {
            id: "g-apex",
            training_wz: "9-05b",
            level_check_id: "lc-f",
            name: "Lineare und quadratische Funktionen"
          },
          {
            id: "g-name",
            training_wz: null,
            level_check_id: "lc-f",
            name: "Lineare und quadratische Funktionen"
          },
          {
            id: "g-label",
            training_wz: "Geraden zeichnen",
            level_check_id: "lc-f",
            name: "Lineare und quadratische Funktionen"
          },
          {
            id: "g-other",
            training_wz: "fkt-01",
            level_check_id: "lc-b",
            name: "Brüche"
          },
          {
            id: "g-none",
            training_wz: "fkt-02",
            level_check_id: "lc-empty",
            name: "Lineare und quadratische Funktionen"
          },
          {
            id: "g-typ",
            training_wz: "fkt-25",
            level_check_id: "lc-f",
            name: "Lineare und quadratische Funktionen"
          },
          {
            id: "g-pruef",
            training_wz: "fkt-26",
            level_check_id: "lc-f",
            name: "Lineare und quadratische Funktionen"
          }
        ];
        return { rows: rows.filter((row) => wanted.has(row.id)) };
      }
      if (q.startsWith("SELECT token")) return { rows: [{ token: TOKEN }] };
      if (q.startsWith("SELECT target_grade_key")) {
        if (params[1] === "lc-f") return { rows: [{ target_grade_key: "1.5", target_grade: null }] };
        return { rows: [] };
      }
      throw new Error(`unerwartetes SQL: ${q}`);
    }
  },
  7,
  ["g-draw", "g-apex", "g-name", "g-label", "g-other", "g-none", "g-typ", "g-pruef", "g-draw"]
);
assert.equal(todayMaps.get("g-draw").url, cityHalt);
assert.equal(todayMaps.get("g-draw").beschriftung, "Stadtkarte öffnen");
assert.equal(
  todayMaps.get("g-apex").url,
  `https://trainingscenter.streetsoflogic.de/?t=${TOKEN}&note=1%2C5&k=10&d=funktionen&h=7`
);
assert.equal(todayMaps.has("g-name"), false);
assert.equal(todayMaps.has("g-label"), false);
assert.equal(todayMaps.has("g-other"), false);
assert.equal(todayMaps.get("g-none").url, null);
assert.equal(todayMaps.get("g-none").beschriftung, "Stadtkarte öffnen");
assert.equal(
  todayMaps.get("g-typ").url,
  `https://trainingscenter.streetsoflogic.de/?t=${TOKEN}&note=1%2C5&k=10&d=funktionen&h=25`
);
assert.equal(todayMaps.get("g-typ").beschriftung, "Stadtkarte öffnen");
assert.equal(todayMaps.get("g-typ").url.includes("h=25"), true);
assert.equal(
  todayMaps.get("g-pruef").url,
  `https://trainingscenter.streetsoflogic.de/?t=${TOKEN}&note=1%2C5&k=10&d=funktionen&h=26`
);
assert.equal(todayMaps.get("g-pruef").beschriftung, "Stadtkarte öffnen");
assert.equal(todayMaps.get("g-draw").url.includes("h=1"), true);
assert.equal(todayMaps.get("g-apex").url.includes("h=7"), true);

const potenzThemaGelesen = [];
const potenzMaps = await cityMapsForGoals(
  {
    async query(sql, params = []) {
      const q = sql.replace(/\s+/g, " ").trim();
      if (q.includes("FROM level_check_goals")) {
        return {
          rows: [
            {
              id: "p1",
              training_wz: "pw-01",
              level_check_id: "lc-p",
              name: "Potenzen und Wurzeln"
            },
            {
              id: "p-leer",
              training_wz: null,
              level_check_id: "lc-p",
              name: "Potenzen und Wurzeln"
            },
            {
              id: "p-fkt",
              training_wz: "fkt-01",
              level_check_id: "lc-p",
              name: "Potenzen und Wurzeln"
            }
          ].filter((row) => new Set(params[0]).has(row.id))
        };
      }
      if (q.startsWith("SELECT token")) {
        potenzThemaGelesen.push(params[1]);
        assert.equal(params[1], "potenzen");
        return { rows: [{ token: POT }] };
      }
      if (q.startsWith("SELECT target_grade_key")) {
        if (params[1] === "lc-p") return { rows: [{ target_grade_key: "2", target_grade: null }] };
        return { rows: [] };
      }
      if (q.startsWith("INSERT INTO training_tokens")) {
        throw new Error("vorhandene Potenzen-Kennung soll wiederverwendet werden");
      }
      throw new Error(`unerwartetes SQL: ${q}`);
    }
  },
  7,
  ["p1", "p-leer", "p-fkt"]
);
assert.deepEqual(potenzThemaGelesen, ["potenzen"]);
assert.equal(potenzMaps.get("p1").url, cityPotenzHalt.replaceAll(TOKEN, POT));
assert.equal(potenzMaps.get("p1").beschriftung, "Trainingscenter öffnen");
assert.equal(potenzMaps.get("p1").url.includes("k=9"), true);
assert.equal(potenzMaps.get("p1").url.includes("d=potenzen"), true);
assert.equal(potenzMaps.get("p1").url.endsWith("&h=1"), true);
assert.equal(potenzMaps.has("p-leer"), false);
assert.equal(potenzMaps.has("p-fkt"), false);

const fremdThema = [];
const fremdMaps = await cityMapsForGoals(
  {
    async query(sql, params = []) {
      const q = sql.replace(/\s+/g, " ").trim();
      if (q.includes("FROM level_check_goals")) {
        return {
          rows: [
            {
              id: "f-name",
              training_wz: null,
              level_check_id: "lc-f",
              name: "Lineare und quadratische Funktionen"
            },
            {
              id: "f-pw",
              training_wz: "pw-01",
              level_check_id: "lc-f",
              name: "Lineare und quadratische Funktionen"
            }
          ]
        };
      }
      if (q.startsWith("SELECT token")) {
        fremdThema.push(params[1]);
        return { rows: [{ token: TOKEN }] };
      }
      if (q.startsWith("SELECT target_grade_key")) {
        return { rows: [{ target_grade_key: "1.5", target_grade: null }] };
      }
      throw new Error(`unerwartetes SQL: ${q}`);
    }
  },
  7,
  ["f-name", "f-pw"]
);
assert.deepEqual(fremdThema, ["funktionen"]);
assert.equal(fremdMaps.has("f-name"), false);
assert.equal(fremdMaps.has("f-pw"), false);

const potenzOhneNote = await cityMapsForGoals(
  {
    async query(sql, params = []) {
      const q = sql.replace(/\s+/g, " ").trim();
      if (q.includes("FROM level_check_goals")) {
        return {
          rows: [
            {
              id: "p1",
              training_wz: "pw-01",
              level_check_id: "lc-p",
              name: "Potenzen und Wurzeln"
            }
          ]
        };
      }
      if (q.startsWith("SELECT token")) return { rows: [{ token: POT }] };
      if (q.startsWith("SELECT target_grade_key")) return { rows: [] };
      throw new Error(`unerwartetes SQL: ${q}`);
    }
  },
  7,
  ["p1"]
);
assert.deepEqual(potenzOhneNote.get("p1"), {
  url: null,
  beschriftung: "Trainingscenter öffnen"
});

const qgThemaGelesen = [];
const qgMaps = await cityMapsForGoals(
  {
    async query(sql, params = []) {
      const q = sql.replace(/\s+/g, " ").trim();
      if (q.includes("FROM level_check_goals")) {
        return {
          rows: [
            {
              id: "bin1",
              training_wz: "qg-01",
              level_check_id: "lc-bin",
              name: "Binomische Formeln"
            },
            {
              id: "qg5",
              training_wz: "qg-05",
              level_check_id: "lc-qg",
              name: "Quadratische Gleichungen"
            },
            {
              id: "qg-leer",
              training_wz: null,
              level_check_id: "lc-qg",
              name: "Quadratische Gleichungen"
            },
            {
              id: "bin-fremd",
              training_wz: "fkt-01",
              level_check_id: "lc-bin",
              name: "Binomische Formeln"
            }
          ].filter((row) => new Set(params[0]).has(row.id))
        };
      }
      if (q.startsWith("SELECT token")) {
        qgThemaGelesen.push(params[1]);
        assert.equal(params[1], "quadratische-gleichungen");
        return { rows: [{ token: QG }] };
      }
      if (q.startsWith("SELECT target_grade_key")) {
        if (params[1] === "lc-bin") return { rows: [{ target_grade_key: "2", target_grade: null }] };
        if (params[1] === "lc-qg") return { rows: [{ target_grade_key: "2", target_grade: null }] };
        return { rows: [] };
      }
      if (q.startsWith("INSERT INTO training_tokens")) {
        throw new Error("vorhandene Kennung für quadratische-gleichungen soll wiederverwendet werden");
      }
      throw new Error(`unerwartetes SQL: ${q}`);
    }
  },
  7,
  ["bin1", "qg5", "qg-leer", "bin-fremd"]
);
assert.deepEqual(qgThemaGelesen, ["quadratische-gleichungen"]);
assert.equal(
  qgMaps.get("bin1").url,
  `https://trainingscenter.streetsoflogic.de/?t=${QG}&note=2&k=9&d=quadratische-gleichungen&h=1`
);
assert.equal(qgMaps.get("bin1").beschriftung, "Stadtkarte öffnen");
assert.equal(
  qgMaps.get("qg5").url,
  `https://trainingscenter.streetsoflogic.de/?t=${QG}&note=2&k=9&d=quadratische-gleichungen&h=5`
);
assert.equal(qgMaps.get("qg5").beschriftung, "Stadtkarte öffnen");
assert.equal(qgMaps.get("qg5").url.includes("d=potenzen"), false);
assert.equal(qgMaps.get("qg5").url.includes("d=funktionen"), false);
assert.equal(qgMaps.get("qg5").url.includes("k=10"), false);
assert.equal(qgMaps.has("qg-leer"), false);
assert.equal(qgMaps.has("bin-fremd"), false);

const qgOhneNote = await cityMapsForGoals(
  {
    async query(sql, params = []) {
      const q = sql.replace(/\s+/g, " ").trim();
      if (q.includes("FROM level_check_goals")) {
        return {
          rows: [
            {
              id: "bin1",
              training_wz: "qg-01",
              level_check_id: "lc-bin",
              name: "Binomische Formeln"
            }
          ]
        };
      }
      if (q.startsWith("SELECT token")) {
        assert.equal(params[1], "quadratische-gleichungen");
        return { rows: [{ token: QG }] };
      }
      if (q.startsWith("SELECT target_grade_key")) return { rows: [] };
      throw new Error(`unerwartetes SQL: ${q}`);
    }
  },
  7,
  ["bin1"]
);
assert.deepEqual(qgOhneNote.get("bin1"), {
  url: null,
  beschriftung: "Stadtkarte öffnen"
});

const trigThemaGelesen = [];
const trigMaps = await cityMapsForGoals(
  {
    async query(sql, params = []) {
      const q = sql.replace(/\s+/g, " ").trim();
      if (q.includes("FROM level_check_goals")) {
        return {
          rows: [
            {
              id: "t1",
              training_wz: "trig-01",
              level_check_id: "lc-trig",
              name: "TRIGONOMETRIE"
            },
            {
              id: "t7",
              training_wz: "trig-07",
              level_check_id: "lc-trig",
              name: "Trigonometrie"
            },
            {
              id: "t-ebene",
              training_wz: "trig-05",
              level_check_id: "lc-ebene",
              name: "Trigonometrie in der Ebene"
            },
            {
              id: "t-einheit",
              training_wz: "trig-06",
              level_check_id: "lc-kreis",
              name: "Einheitskreis"
            }
          ].filter((row) => new Set(params[0]).has(row.id))
        };
      }
      if (q.startsWith("SELECT token")) {
        trigThemaGelesen.push(params[1]);
        assert.equal(params[1], "trigonometrie");
        return { rows: [{ token: TRIG }] };
      }
      if (q.startsWith("SELECT target_grade_key")) {
        if (params[1] === "lc-trig") return { rows: [{ target_grade_key: "3", target_grade: null }] };
        return { rows: [] };
      }
      if (q.startsWith("INSERT INTO training_tokens")) {
        throw new Error("vorhandene Kennung für trigonometrie soll wiederverwendet werden");
      }
      throw new Error(`unerwartetes SQL: ${q}`);
    }
  },
  7,
  ["t1", "t7", "t-ebene", "t-einheit"]
);
assert.deepEqual(trigThemaGelesen, ["trigonometrie"]);
assert.equal(trigMaps.get("t1").beschriftung, "Stadtkarte öffnen");
assert.equal(
  trigMaps.get("t1").url,
  `https://trainingscenter.streetsoflogic.de/?t=${TRIG}&note=3&k=10&d=trigonometrie&h=1`
);
assert.equal(trigMaps.get("t7").beschriftung, "Stadtkarte öffnen");
assert.equal(
  trigMaps.get("t7").url,
  `https://trainingscenter.streetsoflogic.de/?t=${TRIG}&note=3&k=10&d=trigonometrie&h=7`
);
assert.equal(trigMaps.get("t7").url.includes("Trainingscenter"), false);
assert.equal(trigMaps.has("t-ebene"), false);
assert.equal(trigMaps.has("t-einheit"), false);

const trigOhneNote = await cityMapsForGoals(
  {
    async query(sql, params = []) {
      const q = sql.replace(/\s+/g, " ").trim();
      if (q.includes("FROM level_check_goals")) {
        return {
          rows: [
            {
              id: "t1",
              training_wz: "trig-01",
              level_check_id: "lc-trig",
              name: "Trigonometrie"
            }
          ]
        };
      }
      if (q.startsWith("SELECT token")) return { rows: [{ token: TRIG }] };
      if (q.startsWith("SELECT target_grade_key")) return { rows: [] };
      throw new Error(`unerwartetes SQL: ${q}`);
    }
  },
  7,
  ["t1"]
);
assert.deepEqual(trigOhneNote.get("t1"), {
  url: null,
  beschriftung: "Stadtkarte öffnen"
});

async function captureAssign(run) {
  const calls = [];
  await run({
    async query(sql, params = []) {
      calls.push({ sql: sql.replace(/\s+/g, " ").trim(), params });
      return { rows: [] };
    }
  });
  return calls;
}
const fktAssign = await captureAssign(assignTrainingGoalIds);
assert.equal(fktAssign.length, 1);
assert.equal(fktAssign[0].params[0], TRAINING_ASSIGN_TOPIC);
assert.equal(fktAssign[0].params.includes("pw-01"), false);
assert.equal(fktAssign[0].params.includes("potenzen"), false);
assert.equal(fktAssign[0].params.includes("fkt-01"), true);
assert.equal(fktAssign[0].params.includes("9-05b"), true);
assert.equal(fktAssign[0].params.includes("fkt-25"), true);
assert.equal(fktAssign[0].params.includes("fkt-26"), true);
assert.equal(fktAssign[0].params.includes(normalizeGoalName("  TYPISCHE   Aufgaben ")), true);
assert.equal(fktAssign[0].params.includes(normalizeGoalName("Prüfungsaufgaben")), true);
assert.equal(fktAssign[0].params.includes("trig-07"), false);
assert.match(fktAssign[0].sql, /training_wz IS NULL/);
assert.match(fktAssign[0].sql, /g\.training_wz = m\.wz/);
assert.match(fktAssign[0].sql, /^UPDATE level_check_goals/);
assert.doesNotMatch(fktAssign[0].sql, /INSERT INTO level_check/);
const pwAssign = await captureAssign(assignPotenzenGoalIds);
assert.equal(pwAssign.length, 1);
assert.equal(pwAssign[0].params[0], POTENZEN_ASSIGN_TOPIC);
assert.equal(pwAssign[0].params.includes("potenzen"), true);
assert.equal(pwAssign[0].params.includes("pw-01"), true);
assert.equal(pwAssign[0].params.includes("fkt-01"), false);
assert.equal(pwAssign[0].params.includes("geraden zeichnen"), false);
assert.equal(pwAssign[0].params.includes("9-05b"), false);
assert.match(pwAssign[0].sql, /training_wz IS NULL/);
const textAssign = await captureAssign(assignPotenzenLevelTexts);
assert.equal(textAssign.length, 1);
assert.equal(textAssign[0].params[0], POTENZEN_ASSIGN_TOPIC);
assert.equal(textAssign[0].params.includes("zehnerpotenzen"), true);
assert.equal(
  textAssign[0].params.includes("quadratwurzeln multiplizieren und dividieren"),
  true
);
assert.equal(textAssign[0].params.includes("potenzen"), false);
assert.equal(textAssign[0].params.includes("quadratwurzeln"), false);
assert.match(textAssign[0].sql, /SET operator_goal_text = m\.operator_text/);
assert.match(textAssign[0].sql, /street_legend_goal_text = m\.street_legend_text/);
assert.doesNotMatch(textAssign[0].sql, /rookie_goal_text/);
assert.doesNotMatch(textAssign[0].sql, /training_wz/);
assert.doesNotMatch(textAssign[0].sql, /level_check_marks/);
for (const row of POTENZEN_LEVEL_TEXTS) {
  assert.equal(textAssign[0].params.includes(row.operator), true);
  assert.equal(textAssign[0].params.includes(row.streetLegend), true);
}
assert.equal(POTENZEN_LEVEL_TEXTS.length, 2);
assert.equal(POTENZEN_THEMA, "potenzen");

const qgAssign = await captureAssign(assignQuadratischeGoalIds);
assert.equal(qgAssign.length, 2);
assert.equal(qgAssign[0].params[0], BINOM_ASSIGN_TOPIC);
assert.equal(qgAssign[0].params.includes("qg-01"), true);
assert.equal(qgAssign[0].params.includes("binomische formeln"), true);
assert.equal(qgAssign[0].params.includes("qg-02"), false);
assert.equal(qgAssign[0].params.includes("qg-05"), false);
assert.equal(qgAssign[0].params.includes("lösungsformel"), false);
assert.equal(qgAssign[0].params.includes("fkt-01"), false);
assert.equal(qgAssign[0].params.includes("pw-01"), false);
assert.equal(qgAssign[0].params.includes("quadratische gleichungen"), false);
assert.match(qgAssign[0].sql, /training_wz IS NULL/);
assert.match(qgAssign[0].sql, /g\.training_wz = m\.wz/);
assert.equal(qgAssign[1].params[0], QG_ASSIGN_TOPIC);
assert.equal(qgAssign[1].params.includes("qg-02"), true);
assert.equal(qgAssign[1].params.includes("qg-03"), true);
assert.equal(qgAssign[1].params.includes("qg-04"), true);
assert.equal(qgAssign[1].params.includes("qg-05"), true);
assert.equal(qgAssign[1].params.includes("rein quadratische gleichungen"), true);
assert.equal(qgAssign[1].params.includes("satz vom nullprodukt"), true);
assert.equal(qgAssign[1].params.includes("quadratische ergänzung"), true);
assert.equal(qgAssign[1].params.includes("lösungsformel"), true);
assert.equal(qgAssign[1].params.includes("qg-01"), false);
assert.equal(qgAssign[1].params.includes("binomische formeln"), false);
assert.equal(qgAssign[1].params.includes("fkt-01"), false);
assert.equal(qgAssign[1].params.includes("pw-01"), false);
assert.match(qgAssign[1].sql, /training_wz IS NULL/);
assert.equal(BINOM_GOAL_ASSIGNMENTS.length, 1);
assert.equal(QG_GOAL_ASSIGNMENTS.length, 4);
const qgWz = [...BINOM_GOAL_ASSIGNMENTS, ...QG_GOAL_ASSIGNMENTS].map(([wz]) => wz);
assert.deepEqual(qgWz, ["qg-01", "qg-02", "qg-03", "qg-04", "qg-05"]);
for (const [wz, name] of BINOM_GOAL_ASSIGNMENTS) {
  assert.equal(quadratische.find((item) => item.wz === wz).name, name);
}
for (const [wz, name] of QG_GOAL_ASSIGNMENTS) {
  assert.equal(quadratische.find((item) => item.wz === wz).name, name);
}

const QG_ROOKIE =
  "Ich kann (a + b)\u00b2 und (a \u2212 b)\u00b2 ausmultiplizieren und bilde dabei das mittlere Glied richtig.";
assert.equal(QG_LEVEL_TEXTS.length, 1);
assert.equal(QG_LEVEL_TEXTS[0].name, "Binomische Formeln");
assert.equal(QG_LEVEL_TEXTS[0].rookie, QG_ROOKIE);
assert.equal(QG_LEVEL_TEXTS[0].operator, undefined);
assert.equal(QG_LEVEL_TEXTS[0].streetLegend, undefined);
const qgText = await captureAssign(assignQuadratischeLevelTexts);
assert.equal(qgText.length, 1);
assert.equal(qgText[0].params[0], BINOM_ASSIGN_TOPIC);
assert.equal(qgText[0].params.includes("binomische formeln"), true);
assert.equal(qgText[0].params.includes(QG_ROOKIE), true);
assert.equal(qgText[0].params.includes("quadratische gleichungen"), false);
assert.equal(qgText[0].params.includes("lösungsformel"), false);
assert.match(qgText[0].sql, /SET rookie_goal_text = m\.rookie_text/);
assert.doesNotMatch(qgText[0].sql, /operator_goal_text/);
assert.doesNotMatch(qgText[0].sql, /street_legend_goal_text/);
assert.doesNotMatch(qgText[0].sql, /training_wz/);
assert.doesNotMatch(qgText[0].sql, /level_check_marks/);

assert.equal(TRIG_GOAL_ASSIGNMENTS.length, 7);
assert.equal(TRIG_ASSIGN_TOPIC, "trigonometrie");
const trigAssign = await captureAssign(assignTrigonometrieGoalIds);
assert.equal(trigAssign.length, 1);
assert.equal(trigAssign[0].params[0], TRIG_ASSIGN_TOPIC);
for (const wz of ["trig-01", "trig-02", "trig-03", "trig-04", "trig-05", "trig-06", "trig-07"]) {
  assert.equal(trigAssign[0].params.includes(wz), true);
}
assert.equal(trigAssign[0].params.includes("startklar? (wiederholung)"), true);
assert.equal(trigAssign[0].params.includes("einheitskreis - nur sinus"), true);
assert.equal(trigAssign[0].params.includes("prüfungsaufgaben"), true);
assert.equal(trigAssign[0].params.includes("trigonometrie in der ebene"), true);
assert.equal(trigAssign[0].params.includes("fkt-01"), false);
assert.equal(trigAssign[0].params.includes("fkt-26"), false);
assert.equal(trigAssign[0].params.includes("pw-01"), false);
assert.equal(trigAssign[0].params.includes("qg-01"), false);
assert.equal(trigAssign[0].params.includes("9-05b"), false);
assert.match(trigAssign[0].sql, /training_wz IS NULL/);
assert.match(trigAssign[0].sql, /g\.training_wz = m\.wz/);
assert.match(trigAssign[0].sql, /\u2013/);
assert.equal(trigAssign[0].sql.includes("LIKE"), false);
for (const [wz, name] of TRIG_GOAL_ASSIGNMENTS) {
  const halt = trigonometrie.find((item) => item.wz === wz);
  assert.equal(normalizeDashGoalName(halt.name), normalizeDashGoalName(name));
  if (wz === "trig-07") assert.equal(halt.url == null, true);
  else assert.match(halt.url, /^trigonometrie\/[a-z0-9-]+\/$/);
}

assert.equal(TRIG_LEVEL_TEXTS.length, 1);
assert.equal(TRIG_LEVEL_TEXTS[0].name, "Startklar? (Wiederholung)");
assert.equal(
  TRIG_LEVEL_TEXTS[0].rookie,
  "Ich benenne im rechtwinkligen Dreieck die Seiten (Katheten, Hypotenuse) und wende den Satz des Pythagoras an, um eine fehlende Seite zu berechnen. Im gleichschenkligen Dreieck erkenne ich die gleich langen Schenkel und die gleich großen Basiswinkel."
);
assert.equal(
  TRIG_LEVEL_TEXTS[0].operator,
  "Ich nutze die Winkelsumme im Dreieck (180°), um fehlende Winkel zu bestimmen, auch die Basiswinkel im gleichschenkligen Dreieck, und stelle meinen Taschenrechner sicher auf DEG (Grad) ein."
);
assert.equal(
  TRIG_LEVEL_TEXTS[0].streetLegend,
  "Ich entscheide bei einer Aufgabe selbst, ob ich den Satz des Pythagoras oder die Winkelsumme brauche, und begründe meine Wahl. Im gleichschenkligen Dreieck zeichne ich die Höhe auf die Basis ein und berechne sie in einem der zwei gleich großen rechtwinkligen Dreiecke."
);
const trigText = await captureAssign(assignTrigonometrieLevelTexts);
assert.equal(trigText.length, 1);
assert.equal(trigText[0].params[0], TRIG_ASSIGN_TOPIC);
assert.equal(trigText[0].params.includes("startklar? (wiederholung)"), true);
assert.equal(trigText[0].params.includes(TRIG_LEVEL_TEXTS[0].rookie), true);
assert.equal(trigText[0].params.includes(TRIG_LEVEL_TEXTS[0].operator), true);
assert.equal(trigText[0].params.includes(TRIG_LEVEL_TEXTS[0].streetLegend), true);
assert.equal(trigText[0].params.includes("sinus, kosinus, tangens"), false);
assert.equal(trigText[0].params.includes("prüfungsaufgaben"), false);
assert.match(trigText[0].sql, /rookie_goal_text = m\.rookie_text/);
assert.match(trigText[0].sql, /operator_goal_text = m\.operator_text/);
assert.match(trigText[0].sql, /street_legend_goal_text = m\.street_legend_text/);
assert.doesNotMatch(trigText[0].sql, /training_wz/);
assert.doesNotMatch(trigText[0].sql, /level_check_marks/);

const trigPractice = await captureAssign(assignTrigonometriePracticeLinks);
assert.equal(trigPractice.length, 1);
assert.equal(trigPractice[0].params[0], TRIG_ASSIGN_TOPIC);
assert.equal(trigPractice[0].params[1], TRIG_PRACTICE_MARKER);
assert.equal(TRIG_PRACTICE_MARKER.includes("http"), false);
assert.equal(TRIG_PRACTICE_MARKER.includes("trainingscenter"), false);
assert.deepEqual(
  trigPractice[0].params[2],
  TRIG_GOAL_ASSIGNMENTS.map(([, name]) => normalizeDashGoalName(name))
);
assert.match(trigPractice[0].sql, /forschendphaenomenal/);
assert.match(trigPractice[0].sql, /practice_url = \$2/);
assert.doesNotMatch(trigPractice[0].sql, /trainingscenter/);
assert.doesNotMatch(trigPractice[0].sql, /training_wz/);
assert.doesNotMatch(trigPractice[0].sql, /level_check_marks/);

const practiceQueries = [];
const practiceGoals = [
  {
    id: "alt-sinus",
    text: "Sinus, Kosinus, Tangens",
    trainingWz: "trig-02",
    practiceUrl: "https://forschendphaenomenal.de/alt-sinus/",
    material: { type: "url", url: "https://forschendphaenomenal.de/alt-sinus/" }
  },
  {
    id: "alt-pruef",
    text: "Prüfungsaufgaben",
    trainingWz: "trig-07",
    practiceUrl: "https://www.forschendphaenomenal.de/pruefung",
    material: { type: "url", url: "https://www.forschendphaenomenal.de/pruefung" }
  },
  {
    id: "alt-strich",
    text: "Einheitskreis - nur Sinus",
    trainingWz: "trig-06",
    practiceUrl: TRIG_PRACTICE_MARKER,
    material: { type: "url", url: TRIG_PRACTICE_MARKER }
  },
  {
    id: "alt-bleibt",
    text: "Startklar? (Wiederholung)",
    trainingWz: "trig-01",
    practiceUrl: "https://example.com/bleibt",
    material: { type: "url", url: "https://example.com/bleibt" }
  },
  {
    id: "alt-kurz",
    text: "Einheitskreis",
    practiceUrl: "https://forschendphaenomenal.de/nur-einheitskreis/",
    material: { type: "url", url: "https://forschendphaenomenal.de/nur-einheitskreis/" }
  }
];
await applyTrigPracticeLinks(
  {
    async query(sql, params = []) {
      const q = sql.replace(/\s+/g, " ").trim();
      practiceQueries.push(q);
      if (q.startsWith("SELECT token")) {
        assert.equal(params[1], "trigonometrie");
        return { rows: [{ token: TRIG }] };
      }
      if (q.startsWith("SELECT target_grade_key")) {
        assert.equal(params[1], "lc-trig");
        return { rows: [{ target_grade_key: "3", target_grade: null }] };
      }
      if (q.startsWith("INSERT") || q.startsWith("UPDATE")) {
        throw new Error("Materiallink darf keine Kennung speichern");
      }
      throw new Error(`unerwartetes SQL: ${q}`);
    }
  },
  7,
  [
    {
      id: "lc-trig",
      name: "Trigonometrie",
      goals: practiceGoals
    },
    {
      id: "lc-optik",
      name: "Optik",
      goals: [
        {
          id: "optik",
          text: "Startklar",
          practiceUrl: "https://forschendphaenomenal.de/9pystart/",
          material: { type: "url", url: "https://forschendphaenomenal.de/9pystart/" }
        }
      ]
    }
  ]
);
assert.equal(
  practiceGoals.find((goal) => goal.id === "alt-sinus").practiceUrl,
  `https://trainingscenter.streetsoflogic.de/trigonometrie/sinus-kosinus-tangens/?t=${TRIG}&note=3`
);
assert.equal(
  practiceGoals.find((goal) => goal.id === "alt-pruef").material.url,
  trigArchiv.replaceAll(TOKEN, TRIG)
);
assert.equal(
  practiceGoals.find((goal) => goal.id === "alt-strich").practiceUrl,
  `https://trainingscenter.streetsoflogic.de/trigonometrie/einheitskreis/?t=${TRIG}&note=3`
);
assert.equal(
  practiceGoals.find((goal) => goal.id === "alt-bleibt").practiceUrl,
  "https://example.com/bleibt"
);
assert.equal(
  practiceGoals.find((goal) => goal.id === "alt-kurz").practiceUrl,
  "https://forschendphaenomenal.de/nur-einheitskreis/"
);
assert.equal(practiceQueries.some((q) => q.startsWith("INSERT")), false);
assert.equal(practiceQueries.some((q) => q.startsWith("UPDATE")), false);
assert.equal(practiceQueries.filter((q) => q.startsWith("SELECT token")).length, 1);

const ohneNoteQueries = [];
const ohneNoteGoal = {
  id: "alt-leer",
  text: "Startklar? (Wiederholung)",
  trainingWz: "trig-01",
  practiceUrl: "https://forschendphaenomenal.de/start/",
  material: { type: "url", url: "https://forschendphaenomenal.de/start/" }
};
await applyTrigPracticeLinks(
  {
    async query(sql, params = []) {
      const q = sql.replace(/\s+/g, " ").trim();
      ohneNoteQueries.push(`${q} ${params.join(",")}`);
      if (q.startsWith("SELECT target_grade_key")) return { rows: [] };
      if (q.startsWith("SELECT token") || q.startsWith("INSERT")) {
        throw new Error("ohne Zielnote keine Kennung");
      }
      throw new Error(`unerwartetes SQL: ${q}`);
    }
  },
  7,
  [{ id: "lc-trig", name: "Trigonometrie", goals: [ohneNoteGoal] }]
);
assert.equal(ohneNoteGoal.practiceUrl, null);
assert.equal(ohneNoteGoal.material.url, null);
assert.equal(ohneNoteQueries.some((q) => q.startsWith("SELECT token")), false);

assert.equal(topicIsFunktionen("Quadratische Funktionen", [{ id: "x", text: "anders" }]), true);
assert.equal(
  topicIsFunktionen("Potenzen und Wurzeln", [
    { id: "p1", text: "Potenzen" },
    { id: "p2", text: "Zehnerpotenzen" }
  ]),
  false
);
assert.equal(
  topicIsFunktionen("Brüche", [
    { id: "g2", text: "Geraden zeichnen" },
    { id: "a", text: "Kürzen" },
    { id: "b", text: "Erweitern" }
  ]),
  false
);

const pensum = pensumText(
  [
    { levels: levels({ safe: true }, { safe: false }, { safe: false }) },
    { levels: levels({ safe: true }, { safe: true }, { safe: false }) }
  ],
  "3",
  (total, key) => {
    assert.equal(key, "3");
    assert.equal(total, 2);
    return { rookie: 2, operator: 2, street_legend: 0 };
  }
);
assert.equal(pensum, "Operator: 1 von 2");
const full = pensumText(
  [{ levels: levels({ safe: true }, { safe: true }, { safe: false }) }],
  "3",
  () => ({ rookie: 1, operator: 1, street_legend: 0 })
);
assert.equal(full, "Pensum erfüllt");

const markWrites = [];
const db = {
  tokens: [
    { token: TOKEN, student_id: 7, thema: "funktionen", revoked_at: null },
    { token: REVOKED, student_id: 7, thema: "funktionen", revoked_at: "2026-01-01" },
    { token: RATE, student_id: 7, thema: "funktionen", revoked_at: null },
    { token: POT, student_id: 7, thema: "potenzen", revoked_at: null }
  ],
  results: []
};

function memoryPool() {
  return {
    async query(sql, params = []) {
      const q = sql.replace(/\s+/g, " ").trim();
      if (q.startsWith("SELECT token, student_id")) {
        const row = db.tokens.find((item) => item.token === params[0]);
        return { rows: row ? [row] : [] };
      }
      if (q.startsWith("SELECT token")) {
        const row = db.tokens.find(
          (item) => item.student_id === params[0] && item.thema === params[1] && !item.revoked_at
        );
        return { rows: row ? [{ token: row.token }] : [] };
      }
      if (q.startsWith("INSERT INTO training_tokens")) {
        db.tokens.push({
          token: params[0],
          student_id: params[1],
          thema: params[2],
          revoked_at: null
        });
        return { rows: [] };
      }
      if (q.startsWith("SELECT merged, updated_at")) {
        const row = db.results.find((item) => item.student_id === params[0] && item.wz === params[1]);
        return { rows: row ? [row] : [] };
      }
      if (q.startsWith("INSERT INTO training_results")) {
        const row = {
          student_id: params[0],
          wz: params[1],
          merged: JSON.parse(params[2]),
          last_raw: JSON.parse(params[3]),
          updated_at: new Date().toISOString()
        };
        const index = db.results.findIndex((item) => item.student_id === row.student_id && item.wz === row.wz);
        if (index >= 0) db.results[index] = row;
        else db.results.push(row);
        return { rows: [] };
      }
      if (q.startsWith("SELECT id, class_id, school_id")) {
        return { rows: [{ id: 7, class_id: 3, school_id: 1 }] };
      }
      if (q.startsWith("SELECT target_grade_key")) {
        if (params[1] === "lc-f") return { rows: [{ target_grade_key: "1.5", target_grade: null }] };
        if (params[1] === "lc-b") return { rows: [{ target_grade_key: "6", target_grade: null }] };
        if (params[1] === "lc-p") return { rows: [{ target_grade_key: "2", target_grade: null }] };
        if (params[1] === "lc-qg") return { rows: [{ target_grade_key: "2", target_grade: null }] };
        if (params[1] === "lc-bin") return { rows: [{ target_grade_key: "5", target_grade: null }] };
        if (params[1] === "lc-trig") return { rows: [{ target_grade_key: "3", target_grade: null }] };
        if (params[1] === "lc-lin") return { rows: [{ target_grade_key: "4", target_grade: null }] };
        return { rows: [] };
      }
      if (q.startsWith("SELECT wz, merged")) {
        return { rows: db.results.filter((item) => item.student_id === params[0]) };
      }
      throw new Error(`unerwartetes SQL: ${q}`);
    }
  };
}

function checks() {
  return [
    {
      id: "lc-f",
      name: "Algebra",
      subject: "Mathematik",
      goals: [
        { id: "g1", text: "anderes unterthema", trainingWz: "9-05b" },
        {
          id: "g2",
          text: "noch etwas",
          trainingWz: "fkt-01",
          mark: { tiers: { rookie: { status: "sicher" } } }
        },
        { id: "g4", text: "drittes", trainingWz: "fkt-08" },
        { id: "g-name", text: "Geraden ablesen" },
        { id: "g-pot-name", text: "Potenzen" }
      ]
    },
    {
      id: "lc-p",
      name: "Potenzen und Wurzeln",
      subject: "Mathematik",
      goals: [
        { id: "p1", text: "Potenzen", trainingWz: "pw-01" },
        { id: "p2", text: "Zehnerpotenzen", trainingWz: "pw-02" },
        { id: "p-offen", text: "Quadratwurzeln" }
      ]
    },
    {
      id: "lc-b",
      name: "Brüche",
      subject: "Mathematik",
      goals: [{ id: "g3", text: "Kürzen" }]
    }
  ];
}

const extraChecks = [];
const app = express();
app.use(captureTrainingResultBody);
app.use(express.json({ limit: "2mb" }));
registerTrainingRoutes(app, {
  pool: memoryPool(),
  isStudent(req, _res, next) {
    req.session = { user: { id: 7, role: "student", class_id: 3, school_id: 1 } };
    next();
  },
  isTeacher(req, _res, next) {
    req.session = { user: { id: 3, role: "teacher", school_id: 1 } };
    next();
  },
  async teacherCanAccessClass() {
    return true;
  },
  async getLevelChecksForClass() {
    return checks().concat(extraChecks);
  },
  recommendedTierCounts(total, key) {
    if (key === "1.5") return { rookie: total, operator: total, street_legend: Math.ceil(total * 0.65) };
    if (key === "3") return { rookie: total, operator: Math.ceil(total * 0.8), street_legend: 0 };
    return null;
  },
  async writeLevelMark(row) {
    markWrites.push(row);
  }
});

const server = app.listen(0);
await once(server, "listening");
const base = `http://127.0.0.1:${server.address().port}`;

async function call(path, options = {}) {
  const res = await fetch(`${base}${path}`, options);
  const text = await res.text();
  let json = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch (_err) {
      json = null;
    }
  }
  return { status: res.status, headers: res.headers, json, text };
}

try {
  const preflight = await call("/api/training/results", {
    method: "OPTIONS",
    headers: { Origin: TRAINING_ORIGIN }
  });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("access-control-allow-origin"), TRAINING_ORIGIN);
  assert.equal(preflight.headers.get("vary"), "Origin");
  assert.match(preflight.headers.get("access-control-allow-methods"), /GET/);
  assert.match(preflight.headers.get("access-control-allow-methods"), /POST/);
  assert.match(preflight.headers.get("access-control-allow-headers"), /Content-Type/);

  const evil = await call("/api/training/status?t=" + TOKEN, {
    headers: { Origin: "https://evil.example" }
  });
  assert.equal(evil.headers.get("access-control-allow-origin"), null);

  const huge = await call("/api/training/results", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: TRAINING_ORIGIN },
    body: JSON.stringify(body({ pad: "x".repeat(5000) }))
  });
  assert.equal(huge.status, 400);
  assert.equal(db.results.length, 0);

  assert.equal((await call("/api/training/results", {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify(body({ token: "kurz" }))
  })).status, 400);
  assert.equal((await call("/api/training/results", {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify(body({ token: UNKNOWN }))
  })).status, 404);
  assert.equal((await call("/api/training/results", {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify(body({ token: REVOKED }))
  })).status, 410);
  assert.equal((await call("/api/training/status?t=" + UNKNOWN)).status, 404);
  assert.equal((await call("/api/training/status?t=" + REVOKED)).status, 410);

  const saved = await call("/api/training/results", {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=UTF-8", Origin: TRAINING_ORIGIN },
    body: JSON.stringify(body())
  });
  assert.equal(saved.status, 200);
  assert.deepEqual(saved.json, { ok: true });
  assert.equal(saved.headers.get("access-control-allow-origin"), TRAINING_ORIGIN);
  const stored = db.results.find((item) => item.wz === "9-05b");
  assert.equal(stored.merged.ichKann.operator, "noch-nicht");
  assert.equal(stored.merged.pensumErfuellt, undefined);
  assert.equal(stored.last_raw.pensumErfuellt, true);
  assert.equal(stored.last_raw.token, undefined);
  assert.deepEqual(
    markWrites.map((row) => `${row.goalId}:${row.tier}:${row.status}`).sort(),
    ["g1:operator:in_arbeit", "g1:rookie:sicher", "g1:street_legend:in_arbeit"]
  );
  assert.equal(markWrites[0].userId, 7);
  assert.equal(markWrites[0].schoolId, 1);

  const lower = await call("/api/training/results", {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify(body({
      levels: levels(
        { solved: 1, first: 0, safe: false },
        { solved: 2, first: 0, safe: false },
        { solved: 0, first: 0, safe: false }
      ),
      kontrolle: false,
      problem: false,
      ichKann: { rookie: null, operator: null, streetLegend: "sicher" }
    }))
  });
  assert.equal(lower.status, 200);
  const again = db.results.find((item) => item.wz === "9-05b");
  assert.equal(again.merged.levels.rookie.solved, 6);
  assert.equal(again.merged.levels.rookie.safe, true);
  assert.equal(again.merged.kontrolle, true);
  assert.equal(again.merged.problem, true);
  assert.equal(again.merged.ichKann.rookie, "sicher");
  assert.equal(again.merged.ichKann.streetLegend, "sicher");

  const unnamed = await call("/api/training/results", {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify(body({ wz: "fkt-02" }))
  });
  assert.equal(unnamed.status, 400);
  assert.equal(db.results.some((item) => item.wz === "fkt-02"), false);

  db.results.push({
    student_id: 7,
    wz: "fkt-02",
    merged: { wz: "fkt-02", levels: {}, kontrolle: false },
    last_raw: {},
    updated_at: new Date().toISOString()
  });
  db.results.push({
    student_id: 7,
    wz: "fremd-wz",
    merged: { wz: "fremd-wz", levels: {}, kontrolle: true },
    last_raw: {},
    updated_at: new Date().toISOString()
  });
  const status = await call("/api/training/status?t=" + TOKEN, {
    headers: { Origin: TRAINING_ORIGIN }
  });
  assert.equal(status.status, 200);
  assert.equal(status.json.zielnote, "1,5");
  assert.deepEqual(Object.keys(status.json.halte), ["9-05b"]);
  assert.deepEqual(Object.keys(status.json.halte["9-05b"]).sort(), [
    "kontrolle",
    "operator",
    "rookie",
    "streetLegend"
  ]);
  assert.deepEqual(Object.keys(status.json.halte["9-05b"].rookie).sort(), ["safe", "solved"]);
  assert.equal(JSON.stringify(status.json).includes("name"), false);
  db.results = db.results.filter((item) => item.wz !== "fkt-02");

  const codeRedeem = await call("/api/student/training/redeem", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: "9-05B-R64-OP21-SL00-K1-I320-AA" })
  });
  assert.equal(codeRedeem.status, 400);
  assert.equal(codeRedeem.json.gespeichert, false);
  assert.equal(codeRedeem.json.hinweis, "Der Code ist nicht gültig.");
  assert.equal(codeRedeem.json.beispiel, undefined);
  assert.equal(db.results.some((item) => item.wz === "fkt-02"), false);

  const jsonRedeem = await call("/api/student/training/redeem", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body({
      token: undefined,
      wz: "fkt-01",
      ichKann: { rookie: "teilweise", operator: null, streetLegend: null }
    }))
  });
  assert.equal(jsonRedeem.status, 400);
  assert.equal(jsonRedeem.json.gespeichert, false);
  assert.equal(jsonRedeem.json.hinweis, "Bitte den Nachweis-Code eintragen.");
  assert.equal(db.results.some((item) => item.wz === "fkt-01"), false);

  const namedOnly = makeProofCode({
    wz: "fkt-02",
    solved: [6, 0, 0],
    first: [1, 0, 0],
    kontrolle: true,
    ichKann: ["sicher", null, null]
  });
  const byName = await call("/api/student/training/redeem", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: namedOnly })
  });
  assert.equal(byName.status, 400);
  assert.equal(byName.json.hinweis, "Dieser Code gehört zu keinem Unterthema.");
  assert.equal(db.results.some((item) => item.wz === "fkt-02"), false);
  assert.equal(markWrites.some((row) => row.goalId === "g-name"), false);

  markWrites.length = 0;
  const partialCode = makeProofCode({
    wz: "fkt-01",
    solved: [3, 0, 6],
    first: [1, 0, 2],
    kontrolle: false,
    ichKann: [null, null, "sicher"]
  });
  const partial = await call("/api/student/training/redeem", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: ` ${partialCode} ` })
  });
  assert.equal(partial.status, 200);
  assert.equal(partial.json.quelle, "code");
  assert.equal(partial.json.gespeichert, true);
  const fkt = db.results.find((item) => item.wz === "fkt-01");
  assert.equal(fkt.merged.levels.rookie.solved, 3);
  assert.equal(fkt.merged.levels.rookie.safe, false);
  assert.equal(fkt.merged.levels.operator.solved, 0);
  assert.equal(fkt.merged.levels.streetLegend.solved, 6);
  assert.equal(fkt.merged.levels.streetLegend.safe, true);
  assert.equal(fkt.merged.problem, false);
  assert.equal(fkt.merged.ichKann.streetLegend, "sicher");
  assert.deepEqual(
    markWrites.map((row) => `${row.goalId}:${row.tier}:${row.status}`),
    ["g2:street_legend:sicher"]
  );

  markWrites.length = 0;
  const quietCode = makeProofCode({
    wz: "fkt-08",
    solved: [0, 0, 0],
    first: [0, 0, 0],
    kontrolle: false,
    ichKann: [null, null, null]
  });
  const quiet = await call("/api/student/training/redeem", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: quietCode })
  });
  assert.equal(quiet.status, 200);
  assert.equal(markWrites.length, 0);
  assert.equal(db.results.find((item) => item.wz === "fkt-08").merged.levels.rookie.solved, 0);

  const nineRedeem = await call("/api/student/training/redeem", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: nineCode })
  });
  assert.equal(nineRedeem.status, 200);
  assert.equal(db.results.find((item) => item.wz === "9-05b").merged.levels.rookie.solved, 9);
  assert.equal(db.results.find((item) => item.wz === "9-05b").merged.problem, true);

  function potenzBody(extra = {}) {
    return body({
      token: POT,
      wz: "pw-01",
      levels: levels(
        { solved: 6, first: 4, safe: true },
        { solved: 2, first: 1, safe: false },
        { solved: 0, first: 0, safe: false }
      ),
      kontrolle: true,
      problem: true,
      ichKann: { rookie: "sicher", operator: "teilweise", streetLegend: null },
      ...extra
    });
  }

  const pwCode = makeProofCode({
    wz: "pw-01",
    solved: [6, 0, 0],
    first: [1, 0, 0],
    kontrolle: true,
    ichKann: ["sicher", null, null]
  });
  assert.equal(parseProofCode(pwCode).wz, "pw-01");
  const pwRedeem = await call("/api/student/training/redeem", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: pwCode })
  });
  assert.equal(pwRedeem.status, 400);
  assert.equal(pwRedeem.json.gespeichert, false);
  assert.equal(db.results.some((item) => item.wz === "pw-01"), false);

  assert.equal((await call("/api/training/results", {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify(body({ wz: "pw-01" }))
  })).status, 400);
  assert.equal(db.results.some((item) => item.wz === "pw-01"), false);

  const fktBefore = db.results.find((item) => item.wz === "fkt-01").merged.levels.rookie.solved;
  assert.equal((await call("/api/training/results", {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify(body({ token: POT, wz: "fkt-01" }))
  })).status, 400);
  assert.equal(db.results.find((item) => item.wz === "fkt-01").merged.levels.rookie.solved, fktBefore);

  assert.equal((await call("/api/training/results", {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify(potenzBody({ wz: "pw-99" }))
  })).status, 400);
  assert.equal((await call("/api/training/results", {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify(potenzBody({ wz: "fremd" }))
  })).status, 400);

  assert.equal((await call("/api/training/results", {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify(potenzBody({ thema: "funktionen" }))
  })).status, 400);
  assert.equal(db.results.some((item) => item.wz === "pw-01"), false);

  const solvedBefore = db.results.find((item) => item.wz === "9-05b").merged.levels.rookie.solved;
  const contra = await call("/api/training/results", {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify(body({
      thema: "potenzen",
      levels: levels(
        { solved: 1, first: 0, safe: false },
        { solved: 0, first: 0, safe: false },
        { solved: 0, first: 0, safe: false }
      )
    }))
  });
  assert.equal(contra.status, 400);
  assert.equal(db.results.find((item) => item.wz === "9-05b").merged.levels.rookie.solved, solvedBefore);

  const savedPotenz = await call("/api/training/results", {
    method: "POST",
    headers: { "Content-Type": "text/plain", Origin: TRAINING_ORIGIN },
    body: JSON.stringify(potenzBody({ thema: "potenzen" }))
  });
  assert.equal(savedPotenz.status, 200);
  assert.equal(savedPotenz.headers.get("access-control-allow-origin"), TRAINING_ORIGIN);
  const pwStored = db.results.find((item) => item.wz === "pw-01");
  assert.equal(pwStored.merged.levels.rookie.solved, 6);
  assert.equal(pwStored.merged.levels.rookie.safe, true);
  assert.equal(pwStored.merged.kontrolle, true);
  assert.equal(pwStored.merged.problem, true);
  assert.equal(pwStored.last_raw.token, undefined);

  const lowerPotenz = await call("/api/training/results", {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify(potenzBody({
      levels: levels(
        { solved: 1, first: 0, safe: false },
        { solved: 0, first: 0, safe: false },
        { solved: 0, first: 0, safe: false }
      ),
      kontrolle: false,
      problem: false,
      ichKann: { rookie: null, operator: null, streetLegend: "noch-nicht" }
    }))
  });
  assert.equal(lowerPotenz.status, 200);
  const pwAgain = db.results.find((item) => item.wz === "pw-01");
  assert.equal(pwAgain.merged.levels.rookie.solved, 6);
  assert.equal(pwAgain.merged.levels.rookie.safe, true);
  assert.equal(pwAgain.merged.levels.operator.solved, 2);
  assert.equal(pwAgain.merged.kontrolle, true);
  assert.equal(pwAgain.merged.problem, true);
  assert.equal(pwAgain.merged.ichKann.rookie, "sicher");
  assert.equal(pwAgain.merged.ichKann.streetLegend, "noch-nicht");

  const potenzStatus = await call("/api/training/status?t=" + POT, {
    headers: { Origin: TRAINING_ORIGIN }
  });
  assert.equal(potenzStatus.status, 200);
  assert.equal(potenzStatus.json.zielnote, "2");
  assert.deepEqual(Object.keys(potenzStatus.json.halte), ["pw-01"]);
  for (const key of Object.keys(potenzStatus.json.halte)) {
    assert.match(key, /^pw-0[1-7]$/);
  }
  assert.equal(potenzStatus.json.halte["fkt-01"], undefined);
  assert.equal(potenzStatus.json.halte["9-05b"], undefined);
  assert.equal(potenzStatus.json.halte["pw-02"], undefined);

  const potenzStatusThema = await call("/api/training/status?t=" + POT + "&thema=potenzen");
  assert.equal(potenzStatusThema.status, 200);
  assert.deepEqual(Object.keys(potenzStatusThema.json.halte), ["pw-01"]);
  assert.equal((await call("/api/training/status?t=" + POT + "&thema=funktionen")).status, 400);
  assert.equal((await call("/api/training/status?t=" + TOKEN + "&thema=potenzen")).status, 400);

  const funktionenWeiter = await call("/api/training/results", {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify(body())
  });
  assert.equal(funktionenWeiter.status, 200);
  assert.equal(db.results.find((item) => item.wz === "9-05b").merged.levels.rookie.solved, 9);
  const funktionenStatus = await call("/api/training/status?t=" + TOKEN);
  assert.equal(funktionenStatus.status, 200);
  assert.equal(funktionenStatus.json.zielnote, "1,5");
  assert.equal(funktionenStatus.json.halte["9-05b"] != null, true);
  assert.equal(Object.keys(funktionenStatus.json.halte).some((key) => key.startsWith("pw-")), false);

  const tokenAnzahl = db.tokens.length;
  const lernstand = await call("/api/student/training");
  assert.equal(lernstand.status, 200);
  assert.equal(db.tokens.length, tokenAnzahl);
  assert.equal(db.tokens.find((item) => item.thema === "potenzen").token, POT);
  const potTopic = lernstand.json.topics.find((topic) => topic.name === "Potenzen und Wurzeln");
  const fTopic = lernstand.json.topics.find((topic) => topic.name === "Algebra");
  assert.equal(potTopic.showStadtkarte, true);
  assert.equal(potTopic.beschriftung, "Trainingscenter öffnen");
  assert.equal(
    potTopic.stadtkarte,
    `https://trainingscenter.streetsoflogic.de/?t=${POT}&note=2&k=9&d=potenzen`
  );
  assert.equal(potTopic.stadtkarte.includes("h="), false);
  assert.equal(potTopic.zielnote, "2");
  assert.equal(
    potTopic.goals.find((goal) => goal.goalId === "p1").trainingUrl,
    `https://trainingscenter.streetsoflogic.de/potenzen/potenzen/?t=${POT}&note=2`
  );
  assert.equal(
    potTopic.goals.find((goal) => goal.goalId === "p2").trainingUrl,
    `https://trainingscenter.streetsoflogic.de/potenzen/zehnerpotenzen/?t=${POT}&note=2`
  );
  assert.equal(potTopic.goals.some((goal) => goal.goalId === "p-offen"), false);
  assert.equal(potTopic.goals.some((goal) => String(goal.wz || "").startsWith("fkt-")), false);
  assert.equal(fTopic.stadtkarte, null);
  assert.equal(fTopic.zielnote, "1,5");
  assert.equal(fTopic.goals.find((goal) => goal.goalId === "g2").trainingUrl, station);
  assert.equal(fTopic.goals.some((goal) => goal.goalId === "g-pot-name"), false);
  assert.equal(fTopic.goals.some((goal) => String(goal.trainingUrl || "").includes("/potenzen/")), false);

  db.tokens.push({
    token: QG,
    student_id: 7,
    thema: "quadratische-gleichungen",
    revoked_at: null
  });
  function kennungenAusserQg() {
    return db.tokens
      .filter((item) => item.thema === "funktionen" || item.thema === "potenzen")
      .map((item) => `${item.token}:${item.thema}:${item.revoked_at || ""}`)
      .sort();
  }
  const kennungenVorher = kennungenAusserQg();
  extraChecks.push(
    {
      id: "lc-qg",
      name: "Quadratische Gleichungen",
      subject: "Mathematik",
      goals: [
        { id: "qg-decoy", text: "Binomische Formeln" },
        { id: "qg2", text: "Rein quadratische Gleichungen", trainingWz: "qg-02" },
        { id: "qg3", text: "Satz vom Nullprodukt", trainingWz: "qg-03" },
        { id: "qg4", text: "Quadratische Ergänzung", trainingWz: "qg-04" },
        { id: "qg5", text: "Lösungsformel", trainingWz: "qg-05" }
      ]
    },
    {
      id: "lc-bin",
      name: "Binomische Formeln",
      subject: "Mathematik",
      goals: [
        {
          id: "bin1",
          text: "Binomische Formeln",
          trainingWz: "qg-01",
          mark: { tiers: { rookie: { status: "offen" } } }
        },
        { id: "bin-decoy", text: "Lösungsformel" },
        { id: "bin-x1", text: "Zusatz 1", trainingWz: "zz-01" },
        { id: "bin-x2", text: "Zusatz 2", trainingWz: "zz-02" },
        { id: "bin-x3", text: "Zusatz 3", trainingWz: "zz-03" },
        { id: "bin-x4", text: "Zusatz 4", trainingWz: "zz-04" },
        { id: "bin-x5", text: "Zusatz 5", trainingWz: "zz-05" }
      ]
    }
  );

  function qgBody(extra = {}) {
    return body({
      token: QG,
      wz: "qg-01",
      thema: "quadratische-gleichungen",
      levels: levels(
        { solved: 6, first: 4, safe: true },
        { solved: 2, first: 1, safe: false },
        { solved: 0, first: 0, safe: false }
      ),
      kontrolle: true,
      problem: true,
      ichKann: { rookie: "sicher", operator: "teilweise", streetLegend: null },
      ...extra
    });
  }

  assert.equal((await call("/api/training/results", {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify(body({ wz: "qg-01" }))
  })).status, 400);
  assert.equal((await call("/api/training/results", {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify(body({ token: POT, wz: "qg-01" }))
  })).status, 400);
  const fktSolved = db.results.find((item) => item.wz === "fkt-01").merged.levels.rookie.solved;
  assert.equal((await call("/api/training/results", {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify(qgBody({ wz: "fkt-01", thema: undefined }))
  })).status, 400);
  assert.equal(db.results.find((item) => item.wz === "fkt-01").merged.levels.rookie.solved, fktSolved);
  const pwSolved = db.results.find((item) => item.wz === "pw-01").merged.levels.rookie.solved;
  assert.equal((await call("/api/training/results", {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify(qgBody({ wz: "pw-01", thema: undefined }))
  })).status, 400);
  assert.equal(db.results.find((item) => item.wz === "pw-01").merged.levels.rookie.solved, pwSolved);
  assert.equal(db.results.some((item) => item.wz === "qg-01"), false);
  assert.equal((await call("/api/training/results", {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify(qgBody({ wz: "qg-99" }))
  })).status, 400);
  assert.equal((await call("/api/training/results", {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify(qgBody({ wz: "binomische-formeln" }))
  })).status, 400);
  assert.equal((await call("/api/training/results", {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify(qgBody({ thema: "funktionen" }))
  })).status, 400);
  assert.equal((await call("/api/training/results", {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify(qgBody({ thema: "potenzen" }))
  })).status, 400);

  markWrites.length = 0;
  const savedQg = await call("/api/training/results", {
    method: "POST",
    headers: { "Content-Type": "text/plain", Origin: TRAINING_ORIGIN },
    body: JSON.stringify(qgBody())
  });
  assert.equal(savedQg.status, 200);
  assert.equal(savedQg.headers.get("access-control-allow-origin"), TRAINING_ORIGIN);
  const qgStored = db.results.find((item) => item.wz === "qg-01");
  assert.equal(qgStored.merged.levels.rookie.solved, 6);
  assert.equal(qgStored.merged.levels.rookie.safe, true);
  assert.equal(qgStored.merged.kontrolle, true);
  assert.equal(qgStored.last_raw.token, undefined);
  assert.equal(
    markWrites.some((row) => row.goalId === "bin1" && row.tier === "rookie" && row.status === "sicher"),
    true
  );
  assert.equal(markWrites.some((row) => row.goalId === "qg-decoy"), false);
  assert.equal(markWrites.some((row) => row.goalId === "bin-decoy"), false);
  assert.equal(markWrites.some((row) => row.goalId === "qg5"), false);

  const lowerQg = await call("/api/training/results", {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify(qgBody({
      thema: undefined,
      levels: levels(
        { solved: 1, first: 0, safe: false },
        { solved: 0, first: 0, safe: false },
        { solved: 0, first: 0, safe: false }
      ),
      kontrolle: false,
      problem: false,
      ichKann: { rookie: null, operator: null, streetLegend: "noch-nicht" }
    }))
  });
  assert.equal(lowerQg.status, 200);
  const qgAgain = db.results.find((item) => item.wz === "qg-01");
  assert.equal(qgAgain.merged.levels.rookie.solved, 6);
  assert.equal(qgAgain.merged.levels.rookie.safe, true);
  assert.equal(qgAgain.merged.levels.operator.solved, 2);
  assert.equal(qgAgain.merged.kontrolle, true);
  assert.equal(qgAgain.merged.problem, true);
  assert.equal(qgAgain.merged.ichKann.rookie, "sicher");
  assert.equal(qgAgain.merged.ichKann.streetLegend, "noch-nicht");

  const savedQg5 = await call("/api/training/results", {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify(qgBody({
      wz: "qg-05",
      thema: undefined,
      levels: levels(
        { solved: 3, first: 1, safe: false },
        { solved: 0, first: 0, safe: false },
        { solved: 0, first: 0, safe: false }
      )
    }))
  });
  assert.equal(savedQg5.status, 200);

  const qgStatus = await call("/api/training/status?t=" + QG, {
    headers: { Origin: TRAINING_ORIGIN }
  });
  assert.equal(qgStatus.status, 200);
  assert.equal(qgStatus.json.zielnote, "2");
  assert.notEqual(qgStatus.json.zielnote, "5");
  assert.deepEqual(Object.keys(qgStatus.json.halte).sort(), ["qg-01", "qg-05"]);
  for (const key of Object.keys(qgStatus.json.halte)) assert.match(key, /^qg-0[1-5]$/);
  assert.equal(qgStatus.json.halte["qg-02"], undefined);
  assert.equal(qgStatus.json.halte["fkt-01"], undefined);
  assert.equal(qgStatus.json.halte["9-05b"], undefined);
  assert.equal(qgStatus.json.halte["pw-01"], undefined);
  assert.equal(qgStatus.json.halte["zz-01"], undefined);
  const qgStatusThema = await call("/api/training/status?t=" + QG + "&thema=quadratische-gleichungen");
  assert.equal(qgStatusThema.status, 200);
  assert.equal(qgStatusThema.json.zielnote, "2");
  assert.equal((await call("/api/training/status?t=" + QG + "&thema=funktionen")).status, 400);
  assert.equal((await call("/api/training/status?t=" + QG + "&thema=potenzen")).status, 400);
  assert.equal((await call("/api/training/status?t=" + TOKEN + "&thema=quadratische-gleichungen")).status, 400);

  assert.deepEqual(kennungenAusserQg(), kennungenVorher);
  assert.equal(db.tokens.filter((item) => item.thema === "quadratische-gleichungen").length, 1);
  assert.equal(db.tokens.some((item) => item.thema === "binomische-formeln"), false);

  const lernstandQg = await call("/api/student/training");
  assert.equal(lernstandQg.status, 200);
  assert.deepEqual(kennungenAusserQg(), kennungenVorher);
  assert.equal(db.tokens.filter((item) => item.thema === "quadratische-gleichungen").length, 1);
  assert.equal(db.tokens.find((item) => item.thema === "potenzen").token, POT);
  const qgTopic = lernstandQg.json.topics.find((topic) => topic.name === "Quadratische Gleichungen");
  const binTopic = lernstandQg.json.topics.find((topic) => topic.name === "Binomische Formeln");
  const potStill = lernstandQg.json.topics.find((topic) => topic.name === "Potenzen und Wurzeln");
  const fStill = lernstandQg.json.topics.find((topic) => topic.name === "Algebra");
  assert.equal(potStill.showStadtkarte, true);
  assert.equal(potStill.beschriftung, "Trainingscenter öffnen");
  assert.equal(
    potStill.stadtkarte,
    `https://trainingscenter.streetsoflogic.de/?t=${POT}&note=2&k=9&d=potenzen`
  );
  assert.equal(fStill.stadtkarte, null);
  assert.equal(fStill.goals.find((goal) => goal.goalId === "g2").trainingUrl, station);
  assert.equal(qgTopic.showStadtkarte, true);
  assert.equal(qgTopic.beschriftung, "Stadtkarte öffnen");
  assert.equal(qgTopic.zielnote, "2");
  assert.equal(
    qgTopic.stadtkarte,
    `https://trainingscenter.streetsoflogic.de/?t=${QG}&note=2&k=9&d=quadratische-gleichungen`
  );
  assert.equal(qgTopic.stadtkarte.includes("h="), false);
  assert.equal(
    qgTopic.goals.find((goal) => goal.goalId === "qg5").trainingUrl,
    `https://trainingscenter.streetsoflogic.de/quadratische-gleichungen/loesungsformel/?t=${QG}&note=2`
  );
  assert.equal(qgTopic.goals.some((goal) => goal.goalId === "qg-decoy"), false);
  assert.equal(binTopic.showStadtkarte, false);
  assert.equal(binTopic.stadtkarte, null);
  assert.equal(binTopic.beschriftung, null);
  assert.equal(binTopic.zielnote, "5");
  assert.equal(
    binTopic.goals.find((goal) => goal.goalId === "bin1").trainingUrl,
    `https://trainingscenter.streetsoflogic.de/quadratische-gleichungen/binomische-formeln/?t=${QG}&note=5`
  );
  assert.equal(binTopic.goals.some((goal) => goal.goalId === "bin-decoy"), false);
  assert.equal(binTopic.goals.some((goal) => String(goal.wz || "").startsWith("zz-")), false);
  assert.equal(binTopic.goals.find((goal) => goal.goalId === "bin1").stufen.rookie.solved, 6);

  extraChecks.length = 0;

  db.tokens.push({
    token: TRIG,
    student_id: 7,
    thema: "trigonometrie",
    revoked_at: null
  });
  const kennungenVorTrig = db.tokens
    .filter((item) => item.thema !== "trigonometrie")
    .map((item) => `${item.token}:${item.thema}:${item.revoked_at || ""}`)
    .sort();
  extraChecks.push({
    id: "lc-trig",
    name: "Trigonometrie",
    subject: "Mathematik",
    goals: [
      {
        id: "t1",
        text: "Startklar? (Wiederholung)",
        trainingWz: "trig-01",
        mark: { tiers: { rookie: { status: "sicher" } } }
      },
      { id: "t2", text: "Sinus, Kosinus, Tangens", trainingWz: "trig-02" },
      { id: "t7", text: "Prüfungsaufgaben", trainingWz: "trig-07" },
      { id: "t-kurz", text: "Einheitskreis" },
      { id: "t-ebene-ohne", text: "Trigonometrie in der Ebene" }
    ]
  });

  function trigBody(extra = {}) {
    return body({
      token: TRIG,
      wz: "trig-01",
      thema: "trigonometrie",
      levels: levels(
        { solved: 6, first: 4, safe: true },
        { solved: 2, first: 1, safe: false },
        { solved: 0, first: 0, safe: false }
      ),
      kontrolle: true,
      problem: true,
      ichKann: { rookie: "sicher", operator: "teilweise", streetLegend: null },
      ...extra
    });
  }

  assert.equal((await call("/api/training/results", {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify(body({ wz: "trig-01" }))
  })).status, 400);
  assert.equal((await call("/api/training/results", {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify(trigBody({ wz: "fkt-01", thema: undefined }))
  })).status, 400);
  assert.equal((await call("/api/training/results", {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify(trigBody({ thema: "funktionen" }))
  })).status, 400);
  assert.equal((await call("/api/training/results", {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify(trigBody({ wz: "trig-99" }))
  })).status, 400);
  assert.equal(db.results.some((item) => item.wz === "trig-01"), false);
  const fktVorTrig = db.results.find((item) => item.wz === "fkt-01").merged.levels.rookie.solved;

  const savedTrig = await call("/api/training/results", {
    method: "POST",
    headers: { "Content-Type": "text/plain", Origin: TRAINING_ORIGIN },
    body: JSON.stringify(trigBody({ thema: undefined }))
  });
  assert.equal(savedTrig.status, 200);
  assert.equal(savedTrig.headers.get("access-control-allow-origin"), TRAINING_ORIGIN);
  const trigStored = db.results.find((item) => item.wz === "trig-01");
  assert.equal(trigStored.merged.levels.rookie.solved, 6);
  assert.equal(trigStored.merged.levels.rookie.safe, true);
  assert.equal(trigStored.last_raw.token, undefined);
  assert.equal(db.results.find((item) => item.wz === "fkt-01").merged.levels.rookie.solved, fktVorTrig);

  const lowerTrig = await call("/api/training/results", {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify(trigBody({
      thema: undefined,
      levels: levels(
        { solved: 1, first: 0, safe: false },
        { solved: 0, first: 0, safe: false },
        { solved: 0, first: 0, safe: false }
      ),
      kontrolle: false,
      problem: false
    }))
  });
  assert.equal(lowerTrig.status, 200);
  const trigAgain = db.results.find((item) => item.wz === "trig-01");
  assert.equal(trigAgain.merged.levels.rookie.solved, 6);
  assert.equal(trigAgain.merged.levels.rookie.safe, true);
  assert.equal(trigAgain.merged.levels.operator.solved, 2);
  assert.equal(trigAgain.merged.kontrolle, true);
  assert.equal(trigAgain.merged.problem, true);

  db.results.push({
    student_id: 7,
    wz: "trig-99",
    merged: { wz: "trig-99", levels: {}, kontrolle: false },
    last_raw: {},
    updated_at: new Date().toISOString()
  });
  const trigStatus = await call("/api/training/status?t=" + TRIG, {
    headers: { Origin: TRAINING_ORIGIN }
  });
  assert.equal(trigStatus.status, 200);
  assert.equal(trigStatus.json.zielnote, "3");
  assert.notEqual(trigStatus.json.zielnote, "1,5");
  assert.notEqual(trigStatus.json.zielnote, "2");
  assert.deepEqual(Object.keys(trigStatus.json.halte), ["trig-01"]);
  for (const key of Object.keys(trigStatus.json.halte)) assert.match(key, /^trig-0[1-7]$/);
  assert.equal(trigStatus.json.halte["fkt-01"], undefined);
  assert.equal(trigStatus.json.halte["pw-01"], undefined);
  assert.equal(trigStatus.json.halte["qg-01"], undefined);
  assert.equal(trigStatus.json.halte["trig-99"], undefined);
  assert.equal(trigStatus.json.halte["trig-02"], undefined);
  assert.deepEqual(Object.keys(trigStatus.json.halte["trig-01"]).sort(), [
    "kontrolle",
    "operator",
    "rookie",
    "streetLegend"
  ]);
  assert.deepEqual(Object.keys(trigStatus.json.halte["trig-01"].rookie).sort(), ["safe", "solved"]);
  const trigStatusThema = await call("/api/training/status?t=" + TRIG + "&thema=trigonometrie");
  assert.equal(trigStatusThema.status, 200);
  assert.equal(trigStatusThema.json.zielnote, "3");
  assert.equal((await call("/api/training/status?t=" + TRIG + "&thema=funktionen")).status, 400);
  assert.equal((await call("/api/training/status?t=" + TOKEN + "&thema=trigonometrie")).status, 400);
  assert.equal((await call("/api/training/status?t=" + POT + "&thema=trigonometrie")).status, 400);
  assert.equal((await call("/api/training/status?t=" + QG + "&thema=trigonometrie")).status, 400);

  assert.deepEqual(
    db.tokens
      .filter((item) => item.thema !== "trigonometrie")
      .map((item) => `${item.token}:${item.thema}:${item.revoked_at || ""}`)
      .sort(),
    kennungenVorTrig
  );
  assert.equal(db.tokens.filter((item) => item.thema === "trigonometrie").length, 1);

  const lernstandTrig = await call("/api/student/training");
  assert.equal(lernstandTrig.status, 200);
  assert.equal(db.tokens.filter((item) => item.thema === "trigonometrie").length, 1);
  assert.equal(db.tokens.find((item) => item.thema === "potenzen").token, POT);
  assert.equal(db.tokens.find((item) => item.thema === "quadratische-gleichungen").token, QG);
  const trigTopic = lernstandTrig.json.topics.find((topic) => topic.name === "Trigonometrie");
  const potNachTrig = lernstandTrig.json.topics.find((topic) => topic.name === "Potenzen und Wurzeln");
  assert.equal(potNachTrig.beschriftung, "Trainingscenter öffnen");
  assert.equal(
    potNachTrig.stadtkarte,
    `https://trainingscenter.streetsoflogic.de/?t=${POT}&note=2&k=9&d=potenzen`
  );
  assert.equal(trigTopic.showStadtkarte, true);
  assert.equal(trigTopic.beschriftung, "Stadtkarte öffnen");
  assert.equal(trigTopic.zielnote, "3");
  assert.equal(
    trigTopic.stadtkarte,
    `https://trainingscenter.streetsoflogic.de/?t=${TRIG}&note=3&k=10&d=trigonometrie`
  );
  assert.equal(trigTopic.stadtkarte.includes("h="), false);
  assert.equal(
    trigTopic.goals.find((goal) => goal.goalId === "t1").trainingUrl,
    `https://trainingscenter.streetsoflogic.de/trigonometrie/startklar/?t=${TRIG}&note=3`
  );
  assert.equal(
    trigTopic.goals.find((goal) => goal.goalId === "t2").trainingUrl,
    `https://trainingscenter.streetsoflogic.de/trigonometrie/sinus-kosinus-tangens/?t=${TRIG}&note=3`
  );
  assert.equal(
    trigTopic.goals.find((goal) => goal.goalId === "t7").trainingUrl,
    `https://trainingscenter.streetsoflogic.de/pruefungsarchiv/?thema=trigonometrie&k=10&d=trigonometrie&h=7&t=${TRIG}&note=3`
  );
  assert.equal(trigTopic.goals.some((goal) => goal.goalId === "t-kurz"), false);
  assert.equal(trigTopic.goals.some((goal) => goal.goalId === "t-ebene-ohne"), false);
  assert.equal(trigTopic.goals.some((goal) => String(goal.wz || "").startsWith("fkt-")), false);

  extraChecks.length = 0;
  db.results = db.results.filter((item) => item.wz !== "trig-99");

  assert.equal((await call("/api/training/results", {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify(body({ wz: "fkt-25" }))
  })).status, 400);
  assert.equal(db.results.some((item) => item.wz === "fkt-25"), false);
  assert.equal((await call("/api/training/results", {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify(body({ wz: "fkt-26" }))
  })).status, 400);

  extraChecks.push({
    id: "lc-lin",
    name: "Lineare und quadratische Funktionen",
    subject: "Mathematik",
    goals: [
      {
        id: "f25",
        text: "Typische Aufgaben",
        trainingWz: "fkt-25",
        mark: { tiers: { rookie: { status: "sicher" } } }
      },
      { id: "f26", text: "Prüfungsaufgaben", trainingWz: "fkt-26" }
    ]
  });
  const statusOhneStand = await call("/api/training/status?t=" + TOKEN);
  assert.equal(statusOhneStand.status, 200);
  assert.equal(statusOhneStand.json.zielnote, "1,5");
  assert.equal(statusOhneStand.json.halte["fkt-25"], undefined);
  assert.equal(statusOhneStand.json.halte["fkt-26"], undefined);
  assert.equal(statusOhneStand.json.halte["9-05b"] != null, true);
  assert.equal(statusOhneStand.json.halte["fkt-01"] != null, true);

  const fkt01Vorher = db.results.find((item) => item.wz === "fkt-01").merged.levels.rookie.solved;
  const apexVorher = db.results.find((item) => item.wz === "9-05b").merged.levels.rookie.solved;
  const markenVorher = markWrites.filter((row) => row.goalId === "f25").length;
  const saved25 = await call("/api/training/results", {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify(body({
      wz: "fkt-25",
      levels: levels(
        { solved: 6, first: 4, safe: true },
        { solved: 2, first: 1, safe: false },
        { solved: 0, first: 0, safe: false }
      )
    }))
  });
  assert.equal(saved25.status, 200);
  const saved26 = await call("/api/training/results", {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify(body({
      wz: "fkt-26",
      levels: levels(
        { solved: 3, first: 1, safe: false },
        { solved: 0, first: 0, safe: false },
        { solved: 1, first: 0, safe: false }
      ),
      kontrolle: false,
      problem: false
    }))
  });
  assert.equal(saved26.status, 200);
  const schlechter = await call("/api/training/results", {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify(body({
      wz: "fkt-25",
      levels: levels(
        { solved: 1, first: 0, safe: false },
        { solved: 0, first: 0, safe: false },
        { solved: 0, first: 0, safe: false }
      ),
      kontrolle: false,
      problem: false
    }))
  });
  assert.equal(schlechter.status, 200);
  const stand25 = db.results.find((item) => item.wz === "fkt-25");
  assert.equal(stand25.merged.levels.rookie.solved, 6);
  assert.equal(stand25.merged.levels.rookie.safe, true);
  assert.equal(stand25.merged.levels.operator.solved, 2);
  assert.equal(markWrites.filter((row) => row.goalId === "f25" && row.tier === "rookie").length, markenVorher);
  assert.equal(db.results.find((item) => item.wz === "fkt-01").merged.levels.rookie.solved, fkt01Vorher);
  assert.equal(db.results.find((item) => item.wz === "9-05b").merged.levels.rookie.solved, apexVorher);
  assert.equal((await call("/api/training/results", {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify(body({ wz: "pw-01" }))
  })).status, 400);
  assert.equal((await call("/api/training/results", {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify(body({ wz: "trig-07" }))
  })).status, 400);

  const statusMitStand = await call("/api/training/status?t=" + TOKEN);
  assert.equal(statusMitStand.status, 200);
  assert.equal(statusMitStand.json.zielnote, "1,5");
  for (const wz of ["fkt-25", "fkt-26"]) {
    assert.deepEqual(Object.keys(statusMitStand.json.halte[wz]).sort(), [
      "kontrolle",
      "operator",
      "rookie",
      "streetLegend"
    ]);
    for (const tier of ["rookie", "operator", "streetLegend"]) {
      assert.deepEqual(Object.keys(statusMitStand.json.halte[wz][tier]).sort(), ["safe", "solved"]);
    }
  }
  assert.equal(statusMitStand.json.halte["fkt-25"].rookie.solved, 6);
  assert.equal(statusMitStand.json.halte["fkt-25"].rookie.safe, true);
  assert.equal(statusMitStand.json.halte["fkt-26"].rookie.solved, 3);
  assert.equal(statusMitStand.json.halte["fkt-26"].rookie.safe, false);
  assert.equal(statusMitStand.json.halte["fkt-01"].rookie.solved, fkt01Vorher);
  assert.equal(statusMitStand.json.halte["9-05b"].rookie.solved, apexVorher);

  const lernstandLin = await call("/api/student/training");
  const linTopic = lernstandLin.json.topics.find(
    (topic) => topic.name === "Lineare und quadratische Funktionen"
  );
  const algebraNoch = lernstandLin.json.topics.find((topic) => topic.name === "Algebra");
  assert.equal(linTopic.showStadtkarte, true);
  assert.equal(linTopic.beschriftung, "Stadtkarte öffnen");
  assert.equal(linTopic.zielnote, "4");
  assert.equal(
    linTopic.stadtkarte,
    `https://trainingscenter.streetsoflogic.de/?t=${TOKEN}&note=4&k=10&d=funktionen`
  );
  assert.equal(linTopic.stadtkarte.includes("h="), false);
  assert.equal(
    linTopic.goals.find((goal) => goal.goalId === "f25").trainingUrl,
    `https://trainingscenter.streetsoflogic.de/funktionen/typische-aufgaben/?t=${TOKEN}&note=4`
  );
  assert.equal(
    linTopic.goals.find((goal) => goal.goalId === "f26").trainingUrl,
    `https://trainingscenter.streetsoflogic.de/pruefungsarchiv/?thema=funktionen&k=10&d=funktionen&h=26&t=${TOKEN}&note=4`
  );
  assert.equal(
    linTopic.goals.find((goal) => goal.goalId === "f26").trainingUrl.includes("funktionen/pruefungsaufgaben"),
    false
  );
  assert.equal(
    algebraNoch.goals.find((goal) => goal.goalId === "g2").trainingUrl,
    station
  );
  assert.equal(
    algebraNoch.goals.find((goal) => goal.goalId === "g1").trainingUrl,
    stationUrl("funktionen/scheitel-auf-der-y-achse/", TOKEN, "1,5")
  );

  extraChecks.length = 0;

  resetTrainingRateLimit();
  for (let i = 0; i < 60; i += 1) {
    const res = await call("/api/training/results", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify(body({ token: RATE, wz: "fkt-08" }))
    });
    assert.equal(res.status, 200, `meldung ${i + 1}`);
  }
  const limited = await call("/api/training/results", {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify(body({ token: RATE, wz: "fkt-08" }))
  });
  assert.equal(limited.status, 429);
  assert.equal(allowTrainingMessage(RATE), false);
} finally {
  await new Promise((resolve) => server.close(resolve));
}

console.log("training tests ok");
