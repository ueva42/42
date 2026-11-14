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
  buildRespectWeek,
  starsFilledCount,
  weekBoundsBerlin,
  learningDaysThisWeek,
  seasonProgress,
  seasonTrack,
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

function testWeekBoundsBerlin() {
  // 2026-11-14 = Samstag → Mo 09.11. … So 15.11.
  const w = weekBoundsBerlin("2026-11-14");
  assert(w.start === "2026-11-09", `week start ${w.start}`);
  assert(w.end === "2026-11-15", `week end ${w.end}`);
  const mon = weekBoundsBerlin("2026-11-09");
  assert(mon.start === "2026-11-09" && mon.end === "2026-11-15", "Montag bleibt in derselben Woche");
}

function testRespectWeek() {
  const days = [
    { date: "2026-11-09", plannedCount: 9, reflectedCount: 8, classSize: 10 },
    { date: "2026-11-10", plannedCount: 8, reflectedCount: 7, classSize: 10 },
    { date: "2026-11-11", plannedCount: 9, reflectedCount: 6, classSize: 10 }
  ];
  const stars = buildRespectWeek({
    learningDaysThisWeek: days,
    assessment: { basis: 10, passed: 7 },
    helpedCount: 0,
    helpedAvailable: true,
    config: CONFIG
  });
  assert(stars.length === 5, "5 Sterne");
  assert(stars.every((s) => ["erreicht", "offen", "keine_daten"].includes(s.status)), "status enum");
  assert(stars.every((s) => s.filled === (s.status === "erreicht")), "filled nur bei erreicht");

  const geplant = stars.find((s) => s.id === "geplant");
  assert(geplant?.einheit === "%", "geplant einheit %");
  assert(geplant?.ziel === 80, "geplant ziel 80");
  assert(typeof geplant?.wert === "number" && geplant.wert >= 80, "geplant wert %");
  assert(geplant?.text === "Ziel 80 %", "geplant text");
  assert(geplant?.status === "erreicht", "geplant erreicht");

  const reflektiert = stars.find((s) => s.id === "reflektiert");
  assert(reflektiert?.einheit === "%", "reflektiert einheit %");
  assert(reflektiert?.ziel === 70, "reflektiert ziel 70");

  const gut = stars.find((s) => s.id === "gutEingeschätzt");
  assert(gut?.status === "erreicht", "gut 70% erreicht");
  assert(gut?.einheit === "%", "gut einheit %");
  assert(gut?.wert === 70, "gut wert 70");

  const streak = stars.find((s) => s.id === "drangeblieben");
  assert(streak?.einheit === "Lerntage", "streak einheit");
  assert(streak?.ziel === respectStars.drangebliebenDays, "streak ziel");
  assert(streak?.text === "3 / 3 Lerntage", `streak text ${streak?.text}`);
  assert(streak?.status === "erreicht", "streak erreicht");
  assert(streak?.wert === 3, "streak wert 3");

  const help = stars.find((s) => s.id === "geholfen");
  assert(help?.status === "offen", "helped 0 → offen");
  assert(help?.einheit === "Hilfen", "helped einheit");
  assert(help?.wert === 0, "helped wert 0");
  assert(help?.text === "0 / 10 Hilfen", "helped text");
  assert(help?.comingSoon !== true, "helped verfügbar");
  assert(starsFilledCount(stars) === 4, "4 Sterne gefüllt (ohne Hilfe)");

  // 0/0 assessment → keine_daten, nicht erreicht
  const emptyAssess = buildRespectWeek({
    learningDaysThisWeek: days,
    assessment: { basis: 0, passed: 0 },
    helpedCount: 4,
    config: CONFIG
  }).find((s) => s.id === "gutEingeschätzt");
  assert(emptyAssess?.status === "keine_daten", "0/0 → keine_daten");
  assert(emptyAssess?.filled === false, "0/0 nicht filled");
  assert(emptyAssess?.text === "noch kein Levelcheck", "0/0 text");
  assert(emptyAssess?.wert == null, "0/0 wert null");

  // Keine Lerntage
  const noDays = buildRespectWeek({
    learningDaysThisWeek: [],
    assessment: { basis: 0, passed: 0 },
    helpedCount: 0,
    config: CONFIG
  });
  assert(noDays.find((s) => s.id === "geplant")?.status === "keine_daten", "ohne Lerntag geplant");
  assert(noDays.find((s) => s.id === "drangeblieben")?.status === "keine_daten", "ohne Lerntag streak");
  assert(noDays.find((s) => s.id === "geholfen")?.status === "offen", "0 Hilfen bleibt offen");

  // helpedAvailable false
  const soon = respectWeek({
    learningDaysThisWeek: days,
    assessment: { basis: 1, passed: 1 },
    helpedCount: 0,
    helpedAvailable: false,
    config: CONFIG
  }).find((s) => s.id === "geholfen");
  assert(soon?.status === "keine_daten", "Hilfe inaktiv → keine_daten");
  assert(soon?.comingSoon === true, "comingSoon Kompatibilität");

  // Streak-Zählung: Lücke unterbricht
  const broken = buildRespectWeek({
    learningDaysThisWeek: [
      { date: "2026-11-09", plannedCount: 9, reflectedCount: 5, classSize: 10 },
      { date: "2026-11-10", plannedCount: 5, reflectedCount: 5, classSize: 10 }, // < 80 %
      { date: "2026-11-11", plannedCount: 9, reflectedCount: 5, classSize: 10 },
      { date: "2026-11-12", plannedCount: 9, reflectedCount: 5, classSize: 10 }
    ],
    assessment: { basis: 1, passed: 0 },
    helpedCount: 12,
    config: CONFIG
  });
  const brokenStreak = broken.find((s) => s.id === "drangeblieben");
  assert(brokenStreak?.wert === 2, `streak nach Lücke max 2, got ${brokenStreak?.wert}`);
  assert(brokenStreak?.status === "offen", "streak 2 < 3 → offen");
  assert(broken.find((s) => s.id === "geholfen")?.status === "erreicht", "12 Hilfen erreicht");
}

function testLearningDays() {
  // Mit Stundenplan Mo+Mi (1,3), heute Fr 13.11.
  const withTt = learningDaysThisWeek({
    isoToday: "2026-11-13",
    classSize: 10,
    timetableWeekdays: [1, 3],
    dayCounts: [
      { date: "2026-11-09", planned: 2, reflected: 1 },
      { date: "2026-11-11", planned: 0, reflected: 0 },
      { date: "2026-11-12", planned: 8, reflected: 4 }
    ]
  });
  assert(
    withTt.map((d) => d.date).join(",") === "2026-11-09,2026-11-11",
    `timetable learning days ${withTt.map((d) => d.date)}`
  );
  assert(withTt.find((d) => d.date === "2026-11-11")?.plannedCount === 0, "Lerntag auch ohne Plan");

  // Ohne Stundenplan: nur Tage mit ≥1 geplant
  const noTt = learningDaysThisWeek({
    isoToday: "2026-11-13",
    classSize: 10,
    timetableWeekdays: [],
    dayCounts: [
      { date: "2026-11-10", planned: 3, reflected: 1 },
      { date: "2026-11-11", planned: 0, reflected: 0 },
      { date: "2026-11-12", planned: 1, reflected: 0 }
    ]
  });
  assert(
    noTt.map((d) => d.date).join(",") === "2026-11-10,2026-11-12",
    `fallback learning days ${noTt.map((d) => d.date)}`
  );
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

function testSeasonTrack() {
  const track = seasonTrack(2433, [
    { xp: 1000, label: "A" },
    { xp: 2000, label: "B" },
    { xp: 3000, label: "C" }
  ]);
  assert(Math.abs(track.fillRatio - 2433 / 3000) < 1e-9, `fillRatio ${track.fillRatio}`);
  assert(Math.abs(track.segmentFill - 0.433) < 1e-9, `segmentFill ${track.segmentFill}`);
  assert(track.markers[0].state === "erreicht", "marker 1000 erreicht");
  assert(track.markers[1].state === "erreicht", "marker 2000 erreicht");
  assert(track.markers[2].state === "naechste", "marker 3000 nächste");
  assert(track.markers[2].remaining === 567, "noch 567");

  const below = seasonTrack(400, [{ xp: 1000, label: "A" }, { xp: 2000, label: "B" }]);
  assert(Math.abs(below.segmentFill - 0.4) < 1e-9, "unter erster Stufe segmentFill");
  assert(below.markers[0].state === "naechste", "erste ist nächste");
  assert(below.markers[1].state === "spaeter", "zweite später");

  const done = seasonTrack(5000, seasonTiers);
  assert(done.fillRatio === 1, "oben fillRatio 1");
  assert(done.segmentFill === 1, "oben segmentFill 1");
  assert(done.markers.every((m) => m.state === "erreicht"), "alle erreicht");
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
      plannedToday: true,
      reflectedToday: true,
      gutEingeschätzt7d: true,
      helpedTodayCount: 0
    }) === 4,
    "Lose 1+1+2"
  );
  assert(
    raffleTicketCount({
      plannedToday: true,
      reflectedToday: true,
      gutEingeschätzt7d: true,
      helpedTodayCount: 3
    }) === 5,
    "Lose mit Hilfe cap maxPerPerson 5 (1+1+2+2)"
  );
  assert(
    raffleTicketCount({
      plannedToday: false,
      reflectedToday: false,
      gutEingeschätzt7d: false,
      helpedTodayCount: 5
    }) === 2,
    "Hilfe allein max geholfenMax 2"
  );
  assert(CONFIG.raffleTickets.geholfenMax === 2, "config geholfenMax");
  assert(CONFIG.raffleTickets.maxPerPerson === 5, "config maxPerPerson");

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
  testWeekBoundsBerlin();
  testRespectWeek();
  testLearningDays();
  testPickHighlightsUniqueness();
  testSeasonProgress();
  testSeasonTrack();
  testExtras();
  console.log("ok — cockpit-season tests passed");
}

main();
