/**
 * Cockpit-Event-Hooks: Lookup + Record mit Mock-Pool.
 * Ausführen: node scripts/test-cockpit-event-hooks.js
 */
import assert from "node:assert/strict";
import {
  lookupStudentClassContext,
  onPlanSaved,
  onCheckSaved,
  onReflectSaved,
  onLevelConfirmed,
  onLogicCoachMessage
} from "../lib/cockpit-event-hooks.js";

function mockPool(handlers) {
  return {
    async query(sql, params) {
      const text = String(sql || "");
      for (const h of handlers) {
        if (h.match(text)) return h.run(params, text);
      }
      throw new Error(`unexpected query: ${text.slice(0, 120)}`);
    }
  };
}

{
  const pool = mockPool([
    {
      match: (s) => /FROM users u/i.test(s) && /LEFT JOIN classes/i.test(s),
      run: () => ({ rows: [{ id: 7, class_id: 3, school_id: 2 }] })
    }
  ]);
  const row = await lookupStudentClassContext(pool, 7);
  assert.deepEqual(row, { id: 7, class_id: 3, school_id: 2 });
}

{
  const inserts = [];
  const pool = mockPool([
    {
      match: (s) => /INSERT INTO cockpit_events/i.test(s),
      run: (params) => {
        inserts.push(params);
        return { rows: [{ id: 1, created_at: new Date().toISOString() }] };
      }
    }
  ]);
  await onPlanSaved(pool, {
    studentId: 7,
    schoolId: 2,
    classId: 3,
    subject: "Mathe",
    goalId: "g-1"
  });
  assert.equal(inserts.length, 1);
  assert.equal(inserts[0][0], 2);
  assert.equal(inserts[0][1], 3);
  assert.equal(inserts[0][2], 7);
  assert.equal(inserts[0][3], "tagesziel_gesetzt");
  assert.match(String(inserts[0][4]), /"subject":"Mathe"/);
  assert.match(String(inserts[0][4]), /"goalId":"g-1"/);
  assert.doesNotMatch(String(inserts[0][4]), /name/i);
}

{
  const inserts = [];
  const pool = mockPool([
    {
      match: (s) => /INSERT INTO cockpit_events/i.test(s),
      run: (params) => {
        inserts.push(params);
        return { rows: [{ id: 2, created_at: new Date().toISOString() }] };
      }
    }
  ]);
  await onCheckSaved(pool, { studentId: 7, schoolId: 2, classId: 3, subject: "Deutsch" });
  assert.equal(inserts[0][3], "tagesziel_geschafft");
}

{
  const inserts = [];
  const pool = mockPool([
    {
      match: (s) => /INSERT INTO cockpit_events/i.test(s),
      run: (params) => {
        inserts.push(params);
        return { rows: [{ id: 3, created_at: new Date().toISOString() }] };
      }
    }
  ]);
  await onReflectSaved(pool, {
    studentId: 7,
    schoolId: 2,
    classId: 3,
    subject: "Mathe",
    goalAchieved: "ja"
  });
  assert.equal(inserts.length, 2);
  assert.equal(inserts[0][3], "reflexion");
  assert.equal(inserts[1][3], "tagesziel_geschafft");
}

{
  const inserts = [];
  const pool = mockPool([
    {
      match: (s) => /INSERT INTO cockpit_events/i.test(s),
      run: (params) => {
        inserts.push(params);
        return { rows: [{ id: 4, created_at: new Date().toISOString() }] };
      }
    }
  ]);
  await onReflectSaved(pool, {
    studentId: 7,
    schoolId: 2,
    classId: 3,
    goalAchieved: "nein"
  });
  assert.equal(inserts.length, 1);
  assert.equal(inserts[0][3], "reflexion");
}

{
  const inserts = [];
  const pool = mockPool([
    {
      match: (s) => /INSERT INTO cockpit_events/i.test(s),
      run: (params) => {
        inserts.push(params);
        return { rows: [{ id: 5, created_at: new Date().toISOString() }] };
      }
    }
  ]);
  await onLevelConfirmed(pool, {
    studentId: 7,
    schoolId: 2,
    classId: 3,
    goalId: "goal-uuid"
  });
  assert.equal(inserts[0][3], "level_bestaetigt");
  await onLogicCoachMessage(pool, { studentId: 7, schoolId: 2, classId: 3 });
  assert.equal(inserts[1][3], "logic_coach");
}

{
  let lookedUp = false;
  const pool = mockPool([
    {
      match: (s) => /FROM users u/i.test(s),
      run: () => {
        lookedUp = true;
        return { rows: [{ id: 9, class_id: 5, school_id: 1 }] };
      }
    },
    {
      match: (s) => /INSERT INTO cockpit_events/i.test(s),
      run: (params) => {
        assert.equal(params[0], 1);
        assert.equal(params[1], 5);
        assert.equal(params[2], 9);
        return { rows: [{ id: 6, created_at: new Date().toISOString() }] };
      }
    }
  ]);
  await onPlanSaved(pool, { studentId: 9, subject: "Englisch" });
  assert.equal(lookedUp, true);
}

{
  const pool = mockPool([
    {
      match: (s) => /INSERT INTO cockpit_events/i.test(s),
      run: () => {
        throw new Error("db down");
      }
    }
  ]);
  const result = await onPlanSaved(pool, {
    studentId: 1,
    schoolId: 1,
    classId: 1
  });
  assert.equal(result, null);
}

console.log("ok – cockpit-event-hooks");
