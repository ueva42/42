/**
 * Stufe-1 Cockpit-Logik (ohne DB, ohne echte Namen).
 * Ausführen: node scripts/test-cockpit-season.js
 */
import {
  matchCityMap,
  isBestaetigt,
  isGemeldet,
  bossState,
  respectWeek,
  seasonProgress,
  pickHighlights,
  missionRings,
  raffleTicketCount,
  buildRafflePot,
  formatBossShield,
  daysUntil
} from "../lib/cockpit-season.js";
import { CONFIG, seasonTiers, respectStars } from "../lib/cockpit-config.js";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function testMatchCityMap() {
  const mapsIndex = [
    { id: "potenzen", name: "Potenzen", file: "k9-potenzen.json" },
    { id: "quadratische-gleichungen", name: "QG", file: "k9-qg.json" },
    { id: "pythagoras", name: "Pythagoras", file: "k9-py.json" }
  ];
  const mapsDetail = new Map([
    [
      "potenzen",
      { missions: [{ wz: "pw-01" }, { wz: "pw-02" }, { wz: "pw-03" }] }
    ],
    [
      "quadratische-gleichungen",
      {
        missions: [
          { wz: "qg-01" },
          { wz: "qg-02" },
          { wz: "qg-03" },
          { wz: "qg-04" },
          { wz: "qg-05" }
        ]
      }
    ],
    [
      "pythagoras",
      { missions: [{ wz: "py-01" }, { wz: "py-02" }] }
    ]
  ]);

  // Exakte Übereinstimmung gewinnt
  const exact = matchCityMap(
    new Set(["qg-01", "qg-02", "qg-03", "qg-04", "qg-05"]),
    mapsIndex,
    mapsDetail
  );
  assert(exact?.id === "quadratische-gleichungen", "exact match → qg");

  // Teilmenge mit höchster Überlappung (Ziele enthalten Karte + Extra)
  const subset = matchCityMap(
    new Set(["pw-01", "pw-02", "pw-03", "extra-99"]),
    mapsIndex,
    mapsDetail
  );
  assert(subset?.id === "potenzen", "subset with highest overlap → potenzen");

  // Keine passende Karte (Ziele decken Karten-Missionen nicht ab)
  const none = matchCityMap(new Set(["phys-01", "phys-02"]), mapsIndex, mapsDetail);
  assert(none === null, "no subset map → null");

  // Kleinere Teilmenge schlägt keine größere, die nicht Teilmenge ist
  const prefer = matchCityMap(
    new Set(["py-01", "py-02", "pw-01"]),
    mapsIndex,
    mapsDetail
  );
  assert(prefer?.id === "pythagoras", "pythagoras subset preferred over partial potenzen");
}

function testIsBestaetigtPriority() {
  // Levelcheck (checkpointPassed) vor Nachweis vor Training
  assert(
    isBestaetigt({ checkpointPassed: true, hasLevelcheckProof: false, trainingSafe: false }),
    "Levelcheck allein bestätigt"
  );
  assert(
    isBestaetigt({ checkpointPassed: false, hasLevelcheckProof: true, trainingSafe: false }),
    "Nachweis allein bestätigt"
  );
  assert(
    isBestaetigt({ checkpointPassed: false, hasLevelcheckProof: false, trainingSafe: true }),
    "Training allein bestätigt"
  );
  assert(
    !isBestaetigt({ checkpointPassed: false, hasLevelcheckProof: false, trainingSafe: false }),
    "nichts → nicht bestätigt"
  );
  assert(isGemeldet("sicher"), "sicher = gemeldet");
  assert(!isGemeldet("offen"), "offen ≠ gemeldet");
}

function testBossState() {
  const studentIds = ["S1", "S2"];
  const missionGoalIds = ["g1", "g2"];
  // S1 hat g1+g2, S2 hat nur g1
  const confirmed = new Set(["S1:g1", "S1:g2", "S2:g1"]);
  const state = bossState({
    studentIds,
    missionGoalIds,
    tier: "rookie",
    isConfirmed: (sid, gid) => confirmed.has(`${sid}:${gid}`),
    bossName: "Test-Boss",
    dueDate: "2026-11-17",
    forceWin: false
  });
  assert(state.energy === 4, "energy = 2×2");
  assert(state.hits === 3, "hits = 3");
  assert(state.remaining === 1, "remaining = 1");
  assert(!state.defeated, "not defeated");
  assert(state.weakGoalId === "g2", "weak = g2 (1 hit)");
  assert(state.hitByMission.find((r) => r.goalId === "g1")?.hits === 2, "g1 hits 2");
  assert(state.lootUnlocked === false, "loot locked");

  const won = bossState({
    studentIds,
    missionGoalIds,
    tier: "rookie",
    isConfirmed: () => true,
    bossName: "Test-Boss",
    dueDate: "2026-11-17"
  });
  assert(won.defeated && won.remaining === 0 && won.lootUnlocked, "all confirmed → Sieg");

  const forced = bossState({
    studentIds,
    missionGoalIds,
    tier: "rookie",
    isConfirmed: () => false,
    bossName: "Test-Boss",
    dueDate: "2026-11-17",
    forceWin: true
  });
  assert(forced.defeated && forced.lootUnlocked, "forceWin → Sieg");
}

function testRespectWeek() {
  const stars = respectWeek({
    plannedRate: 0.85,
    reflectedRate: 0.5,
    assessmentRate: 0.7,
    streakOk: true,
    helpedCount: 0,
    config: CONFIG
  });
  assert(stars.length === 5, "5 Sterne");
  assert(stars.find((s) => s.id === "geplant")?.filled === true, "geplant filled");
  assert(stars.find((s) => s.id === "reflektiert")?.filled === false, "reflektiert empty");
  assert(stars.find((s) => s.id === "gutEingeschätzt")?.filled === true, "gut eingeschätzt");
  assert(stars.find((s) => s.id === "drangeblieben")?.filled === true, "drangeblieben");
  const help = stars.find((s) => s.id === "geholfen");
  assert(help?.comingSoon !== true, "geholfen verfügbar wenn helpedAvailable default");
  assert(help?.target === respectStars.geholfenCount, "geholfen target");
  const soon = respectWeek({
    plannedRate: 0,
    reflectedRate: 0,
    assessmentRate: 0,
    streakOk: false,
    helpedCount: 0,
    helpedAvailable: false,
    config: CONFIG
  }).find((s) => s.id === "geholfen");
  assert(soon?.comingSoon === true, "geholfen comingSoon wenn nicht verfügbar");
}

function testPickHighlightsUniqueness() {
  // S1 in allen Kategorien → nur einmal global
  const categories = {
    gutEingeschätzt: ["S1", "S2", "S3", "S4"],
    planGeschafft: ["S1", "S2"],
    expert: ["S1"],
    dranbleiber: ["S1", "S5"]
  };
  const namesById = {
    S1: "Alpha",
    S2: "Beta",
    S3: "Gamma",
    S4: "Delta",
    S5: "Epsilon"
  };
  // Deterministisch: feste Folge für Fisher-Yates
  const seq = [0.9, 0.1, 0.5, 0.2, 0.8, 0.3, 0.7, 0.4, 0.6];
  let si = 0;
  const rng = () => seq[si++ % seq.length];

  const out = pickHighlights({
    categories,
    namesById,
    maxPerCat: 3,
    rng
  });
  assert(out.gutEingeschätzt.length === 3, "max 3 gutEingeschätzt");
  const allIds = Object.values(out)
    .flat()
    .map((p) => p.id);
  assert(new Set(allIds).size === allIds.length, "jede Person höchstens einmal");
  // S1 war in allen Kategorien → höchstens in einer
  const s1Cats = Object.entries(out)
    .filter(([, list]) => list.some((p) => p.id === "S1"))
    .map(([k]) => k);
  assert(s1Cats.length <= 1, "S1 höchstens in einer Kategorie");
  assert(
    out.planGeschafft.every((p) => p.id !== "S1" || s1Cats[0] === "planGeschafft"),
    "keine Doppelung planGeschafft"
  );
}

function testSeasonProgress() {
  const mid = seasonProgress(1500, seasonTiers);
  assert(mid.xp === 1500, "xp");
  assert(mid.filledCount === 1, "1 Stufe gefüllt (1000)");
  assert(mid.next?.xp === 2000, "next 2000");
  assert(mid.remaining === 500, "noch 500");

  const top = seasonProgress(5000, seasonTiers);
  assert(top.filledCount === 5, "alle Stufen");
  assert(top.next === null, "kein next");
  assert(top.remaining === 0, "remaining 0");

  const zero = seasonProgress(0, seasonTiers);
  assert(zero.filledCount === 0 && zero.remaining === 1000, "Start");
}

function testExtras() {
  const rings = missionRings({
    classSize: 10,
    confirmedByTier: { rookie: 5, operator: 2, street_legend: 1 },
    reportedByTier: { rookie: 8, operator: 4, street_legend: 2 }
  });
  assert(rings.rookie.confirmed === 0.5, "rookie confirmed 0.5");
  assert(rings.rookie.reported === 0.8, "rookie reported 0.8");

  assert(
    raffleTicketCount({
      planned: true,
      reflected: true,
      gutEingeschätzt: true,
      helped: false
    }) === 4,
    "Lose 1+1+2"
  );

  const pot = buildRafflePot([
    { id: 11, tickets: 2 },
    { id: 12, tickets: 0 },
    { id: 13, tickets: 1 }
  ]);
  assert(pot.length === 3, "Lostopf-Länge = Summe Lose");
  assert(pot.filter((id) => id === 11).length === 2, "ID 11 zweimal");
  assert(pot.filter((id) => id === 13).length === 1, "ID 13 einmal");
  assert(!pot.includes(12), "0 Lose → nicht im Topf");
  assert(buildRafflePot([]).length === 0, "leerer Topf");

  assert(
    formatBossShield("2026-11-17") === "BOSS-FIGHT · DI 17.11.",
    "Boss-Schild Format"
  );
  assert(daysUntil("2026-11-13", "2026-11-17") === 4, "daysUntil 4");
}

function main() {
  testMatchCityMap();
  testIsBestaetigtPriority();
  testBossState();
  testRespectWeek();
  testPickHighlightsUniqueness();
  testSeasonProgress();
  testExtras();
  console.log("ok — cockpit-season tests passed");
}

main();
