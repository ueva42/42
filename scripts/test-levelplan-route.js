/**
 * Pin-Regel und Straßen-Layout der Lernstand-Route.
 * Ausführen: node scripts/test-levelplan-route.js
 */
import route from "../public/js/levelplan-route.js";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const NOTE2 = { rookie: 1, operator: 1, street_legend: 0.5 };

function goals(n) {
  return Array.from({ length: n }, (_, i) => ({ id: `g${i + 1}` }));
}

function statusFrom(map) {
  return (goal, tier) => map[goal.id]?.[tier] || "offen";
}

function allSecure(ids, extra = {}) {
  const map = {};
  for (const id of ids) {
    map[id] = { rookie: "sicher", operator: "sicher", street_legend: "sicher", ...extra[id] };
  }
  return map;
}

function testNextLevelcheckIsLastLinkedMission() {
  const list = goals(7);
  const plan = route.planState({
    goalIds: list.map((g) => g.id),
    levelchecks: [
      { date: "2026-10-02", linkedGoalIds: ["g2", "g1"] },
      { date: "2026-10-13", linkedGoalIds: ["g4", "g3"] },
      { date: "2026-11-03", linkedGoalIds: ["g7"] }
    ],
    today: "2026-10-01",
    kaDate: "2026-11-13",
    currentIndex: 0
  });
  assert(plan.showPin === true, "pin on");
  assert(plan.showPace === true, "pace on");
  assert(plan.planIndex === 1, `next check ends at mission 2, got ${plan.planIndex}`);
  assert(plan.pinLabel === "bis Fr., 02.10.", `label=${plan.pinLabel}`);
  assert(plan.paceLabel === "−1 Mission", `pace=${plan.paceLabel}`);
}

function testUpcomingKeepsLaterChecksWaiting() {
  const plan = route.planState({
    goalIds: goals(7).map((g) => g.id),
    levelchecks: [
      { date: "2026-10-13", linkedGoalIds: ["g5", "g3"] },
      { date: "2026-11-03", linkedGoalIds: ["g7"] }
    ],
    today: "2026-10-13",
    kaDate: "2026-11-13",
    currentIndex: 1
  });
  assert(plan.planIndex === 4, `last linked of the check on today, got ${plan.planIndex}`);
  assert(plan.pinLabel === "bis Di., 13.10.", `label=${plan.pinLabel}`);
  assert(plan.paceLabel === "−3 Missionen", `pace=${plan.paceLabel}`);
}

function testAllLevelchecksPastUsesKa() {
  const plan = route.planState({
    goalIds: goals(7).map((g) => g.id),
    levelchecks: [
      { date: "2026-09-01", linkedGoalIds: ["g2"] },
      { date: "2026-10-13", linkedGoalIds: ["g5"] }
    ],
    today: "2026-11-09",
    kaDate: "2026-11-13",
    currentIndex: 6
  });
  assert(plan.planIndex === 6, `last mission, got ${plan.planIndex}`);
  assert(plan.pinLabel === "bis KA, Fr., 13.11.", `label=${plan.pinLabel}`);
  assert(plan.paceLabel === "im Plan", `pace=${plan.paceLabel}`);
}

function testAllPastWithoutKaDate() {
  const plan = route.planState({
    goalIds: goals(3).map((g) => g.id),
    levelchecks: [{ date: "2026-10-01", linkedGoalIds: ["g1"] }],
    today: "2026-11-09",
    kaDate: "",
    currentIndex: 0
  });
  assert(plan.planIndex === 2, `3 missions end at index 2, got ${plan.planIndex}`);
  assert(plan.pinLabel === "bis KA", `label=${plan.pinLabel}`);
  assert(plan.paceLabel === "−2 Missionen", `pace=${plan.paceLabel}`);
}

function testNoLevelchecksHidesPinAndPace() {
  const plan = route.planState({
    goalIds: goals(7).map((g) => g.id),
    levelchecks: [],
    today: "2026-11-09",
    kaDate: "2026-11-13",
    currentIndex: 2
  });
  assert(plan.showPin === false, "no pin");
  assert(plan.showPace === false, "no pace");
  assert(plan.planIndex === null, "no plan index");
}

function testUnlinkedUpcomingDoesNotInventAMission() {
  const plan = route.planState({
    goalIds: goals(3).map((g) => g.id),
    levelchecks: [{ date: "2026-12-01", linkedGoalIds: [] }],
    today: "2026-11-09",
    kaDate: "2026-12-15",
    currentIndex: 0
  });
  assert(plan.showPin === false, "no invented pin");
  assert(plan.showPace === false, "pace stays hidden");
}

function testAheadOfPlanReadsImPlan() {
  const plan = route.planState({
    goalIds: goals(7).map((g) => g.id),
    levelchecks: [{ date: "2026-12-01", linkedGoalIds: ["g2"] }],
    today: "2026-11-09",
    kaDate: "",
    currentIndex: 4
  });
  assert(plan.planIndex === 1, "plan mission 2");
  assert(plan.paceLabel === "im Plan", `pace=${plan.paceLabel}`);
}

function testCurrentMissionFollowsGradeRules() {
  const list = goals(7);
  const openSl = allSecure(list.map((g) => g.id), { g1: { street_legend: "offen" } });
  assert(
    route.currentMissionIndex(list, NOTE2, statusFrom(openSl)) === 0,
    "Note 2: Street Legend fehlt auf Mission 1, also bleibt DU dort"
  );
  const later = allSecure(list.map((g) => g.id), { g5: { operator: "offen" } });
  assert(
    route.currentMissionIndex(list, NOTE2, statusFrom(later)) === 4,
    "erste offene Pflichtstufe weiter hinten"
  );
  const finished = allSecure(list.map((g) => g.id), {
    g6: { street_legend: "offen" },
    g7: { street_legend: "offen" }
  });
  assert(
    route.currentMissionIndex(list, NOTE2, statusFrom(finished)) === 6,
    "alles Nötige sicher, DU auf der letzten Mission"
  );
  const onlyRookieOperator = { rookie: 1, operator: 1, street_legend: 0 };
  const slOpen = allSecure(list.map((g) => g.id), { g1: { street_legend: "offen" } });
  assert(
    route.currentMissionIndex(list, onlyRookieOperator, statusFrom(slOpen)) === 6,
    "ohne Street-Legend-Pflicht zählt nur Rookie und Operator"
  );
  assert(
    route.requiredTiersForMission(0, 7, NOTE2).join() === "rookie,operator,street_legend",
    "Note 2, Mission 1: R, O und SL"
  );
  assert(
    route.requiredTiersForMission(6, 7, NOTE2).join() === "rookie,operator",
    "Note 2, letzte Mission: R und O"
  );
}

function assertReadableRoad(n) {
  const layout = route.routeLayout(n);
  assert(layout.missions.length === n, `${n} missions`);
  assert((layout.path.match(/ C/g) || []).length === n + 1, `${n} curves from start through flag`);
  const ys = new Set(layout.missions.map((m) => m.y));
  if (n > 1) assert(ys.size > 1, `${n} missions wave`);
  for (let i = 1; i < n; i++) {
    assert(layout.missions[i].x > layout.missions[i - 1].x, `${n} x grows`);
  }
  const gap = layout.missions[1].x - layout.missions[0].x;
  assert(gap >= 120, `${n} gap ${gap} too tight`);
  assert(layout.flag.x > layout.missions[n - 1].x, "flag after last mission");
  assert(layout.start.x < layout.missions[0].x, "start before first mission");
  const first = route.missionFraction(layout, 0);
  const mid = route.missionFraction(layout, Math.floor((n - 1) / 2));
  const last = route.missionFraction(layout, n - 1);
  assert(first > 0 && first < mid && mid < last && last < 100, `${n} glow fractions ${first},${mid},${last}`);
  return layout;
}

function testRoadsForThreeSevenAndMany() {
  const three = assertReadableRoad(3);
  assert(three.missions[2].x - three.missions[0].x > 500, "3 missions spread across the card");
  const seven = assertReadableRoad(7);
  const copied = [160, 300, 450, 600, 750, 900, 1040].join();
  assert(seven.missions.map((m) => m.x).join() !== copied, "7 coordinates are generated");
  assertReadableRoad(24);
  const ahead = route.planDash(30, 70);
  assert(ahead.startsWith("0 30.0 "), `dotted plan line, got ${ahead}`);
  assert(route.planDash(70, 30) === "0 200", "no plan line backwards");
}

function testSelectedMissionFallsBackToDu() {
  const ids = goals(5).map((g) => g.id);
  assert(route.selectedMissionIndex(ids, null, 2) === 2, "ohne Wahl gilt DU");
  assert(route.selectedMissionIndex(ids, "g5", 2) === 4, "frei gewählte Mission 5");
  assert(route.selectedMissionIndex(ids, "g1", 3) === 0, "auch zurück zu Mission 1");
  assert(route.selectedMissionIndex(ids, "fremd", 1) === 1, "fremde Kennung fällt auf DU zurück");
  assert(route.selectedMissionIndex(ids, 3, 0) === 0, "Zahl ohne passende Kennung bleibt bei DU");
}

function testFocusTierForAnyMission() {
  const list = goals(7);
  const all = list.map((g) => g.id);
  const status = statusFrom(allSecure(all, { g3: { operator: "offen" } }));
  const pick = (i, allowed) =>
    route.focusTier({ goal: list[i], index: i, total: 7, rules: NOTE2, statusOf: status, allowed });
  assert(pick(2).id === "operator" && pick(2).extra === false, "Mission 3: Operator ist Pflicht und offen");
  assert(pick(0) === null, "Mission 1 komplett sicher");
  const late = statusFrom(allSecure(all, { g7: { street_legend: "offen" } }));
  const bonus = route.focusTier({ goal: list[6], index: 6, total: 7, rules: NOTE2, statusOf: late });
  assert(bonus.id === "street_legend" && bonus.extra === true, "SL auf Mission 7 nur als Bonus");
  const noSl = route.focusTier({
    goal: list[6],
    index: 6,
    total: 7,
    rules: NOTE2,
    statusOf: late,
    allowed: ["rookie", "operator"]
  });
  assert(noSl === null, "ohne aktive SL-Stufe kein Bonus");
}

function testNodeArcsAndCity() {
  const arc = route.nodeArc(21, ...route.TIER_ARCS.rookie);
  assert(/^M-?\d+\.\d+ -?\d+\.\d+A21 21 0 0 1 /.test(arc), `arc ${arc}`);
  for (const [n, opts] of [[3, null], [7, null], [7, { direction: "up" }], [24, null]]) {
    const layout = route.routeLayout(n, opts);
    const city = route.cityBackdrop(layout, layout.height + 40);
    assert(city.streets.length > 4, `${n} streets`);
    assert(city.blocks.length > 4, `${n} blocks`);
    for (const b of city.blocks) {
      assert(b.x >= city.pad && b.y >= city.pad, `${n} block inside`);
      assert(b.x + b.w <= city.width - city.pad + 0.5 && b.y + b.h <= city.height - city.pad + 0.5, `${n} block fits`);
    }
    const again = route.cityBackdrop(layout, layout.height + 40);
    assert(JSON.stringify(again) === JSON.stringify(city), `${n} city stays the same on re-render`);
  }
}

testNextLevelcheckIsLastLinkedMission();
testSelectedMissionFallsBackToDu();
testFocusTierForAnyMission();
testNodeArcsAndCity();
testUpcomingKeepsLaterChecksWaiting();
testAllLevelchecksPastUsesKa();
testAllPastWithoutKaDate();
testNoLevelchecksHidesPinAndPace();
testUnlinkedUpcomingDoesNotInventAMission();
testAheadOfPlanReadsImPlan();
testCurrentMissionFollowsGradeRules();
testRoadsForThreeSevenAndMany();
console.log("OK – levelplan route tests passed");
