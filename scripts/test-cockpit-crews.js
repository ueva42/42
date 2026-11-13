/**
 * Crew-Auslosung (Stufe 2): Größen, Snake-Deal, Avoid-Paare.
 * Ausführen: node scripts/test-cockpit-crews.js
 */
import assert from "node:assert/strict";
import {
  crewSizesFor,
  dealSnake,
  sortStudentsForDraw,
  drawCrews,
  resolveAvoidConflicts,
  normalizeAvoidPairs,
  crewTagVisible,
  seasonKeyFor,
  gradeSortKey
} from "../lib/cockpit-crews.js";
import {
  collapseTickerEvents,
  formatTickerLine,
  buildTickerPayload,
  sideQuestProgressFromEvents
} from "../lib/cockpit-events.js";

function rngSeq(values) {
  let i = 0;
  return () => {
    const v = values[i % values.length];
    i += 1;
    return v;
  };
}

/* Größen */
assert.deepEqual(crewSizesFor(33), [5, 5, 5, 5, 5, 4, 4]);
assert.deepEqual(crewSizesFor(4), [4]);
assert.deepEqual(crewSizesFor(0), []);
assert.equal(crewSizesFor(20).reduce((a, b) => a + b, 0), 20);
assert.ok(crewSizesFor(20).every((s) => s >= 4 && s <= 5));

/* Snake Deal */
{
  const ids = Array.from({ length: 33 }, (_, i) => i + 1);
  const crews = dealSnake(ids, 7);
  assert.equal(crews.length, 7);
  assert.equal(crews.flat().length, 33);
  assert.deepEqual(
    crews.map((c) => c.length).sort((a, b) => b - a),
    [5, 5, 5, 5, 5, 4, 4]
  );
}

/* Sortierung Zielnote: schlechter zuerst */
{
  const sorted = sortStudentsForDraw(
    [
      { id: 1, targetGrade: "2" },
      { id: 2, targetGrade: "5" },
      { id: 3, targetGrade: "5" },
      { id: 4, targetGrade: "1" }
    ],
    rngSeq([0, 0, 0, 0, 0, 0, 0, 0])
  );
  assert.equal(gradeSortKey(sorted[0].targetGrade), 5);
  assert.equal(gradeSortKey(sorted[sorted.length - 1].targetGrade), 1);
}

/* Avoid pairs */
{
  const students = Array.from({ length: 12 }, (_, i) => ({
    id: i + 1,
    targetGrade: String((i % 5) + 1)
  }));
  const avoid = normalizeAvoidPairs([
    { studentA: 3, studentB: 1 },
    { student_a: 2, student_b: 4 }
  ]);
  assert.deepEqual(avoid[0], { studentA: 1, studentB: 3 });
  const drawn = drawCrews(students, avoid, rngSeq([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]));
  assert.equal(drawn.crews.flat().length, 12);
  for (const p of avoid) {
    const crewOf = (id) => drawn.crews.findIndex((c) => c.includes(id));
    if (drawn.ok) {
      assert.notEqual(crewOf(p.studentA), crewOf(p.studentB));
    }
  }
}

/* Force conflict then resolve */
{
  const crews = [
    [1, 2, 3],
    [4, 5, 6]
  ];
  const resolved = resolveAvoidConflicts(crews, [{ studentA: 1, studentB: 2 }], () => 0.2);
  assert.equal(resolved.ok, true);
  const i1 = resolved.crews.findIndex((c) => c.includes(1));
  const i2 = resolved.crews.findIndex((c) => c.includes(2));
  assert.notEqual(i1, i2);
}

assert.equal(crewTagVisible({ crewSize: 5, confirmedOnMission: 4, minMissing: 1 }), true);
assert.equal(crewTagVisible({ crewSize: 5, confirmedOnMission: 3, minMissing: 1 }), false);
assert.equal(seasonKeyFor("lc-1", 9), "lc-1");
assert.equal(seasonKeyFor(null, 9), "class-9");

/* Ticker */
{
  const now = Date.now();
  const rows = [
    { id: "a", typ: "tagesziel_gesetzt", created_at: new Date(now).toISOString(), beamerNameOk: false },
    {
      id: "b",
      typ: "tagesziel_gesetzt",
      created_at: new Date(now + 1000).toISOString(),
      beamerNameOk: false
    },
    {
      id: "c",
      typ: "hilfe_erledigt",
      created_at: new Date(now).toISOString(),
      studentName: "Alex",
      beamerNameOk: true
    }
  ];
  const collapsed = collapseTickerEvents(rows);
  assert.ok(collapsed.some((e) => e.typ === "tagesziel_gesetzt" && e.count === 2));
  const line = formatTickerLine({
    typ: "hilfe_erledigt",
    count: 1,
    studentName: "Alex",
    beamerNameOk: true
  });
  assert.match(line, /Alex/);
  const anon = formatTickerLine({
    typ: "hilfe_erledigt",
    count: 1,
    studentName: "Alex",
    beamerNameOk: false
  });
  assert.match(anon, /Jemand/);
  const ticker = buildTickerPayload(rows, { limit: 6 });
  assert.ok(ticker.length <= 6);
  assert.equal(sideQuestProgressFromEvents(rows, "tagesziel_gesetzt"), 2);
}

console.log("ok – test-cockpit-crews");
