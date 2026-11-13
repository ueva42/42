/**
 * Schlanke Hooks für Schüler-Flows → cockpit_events.
 * Fehler werden geschluckt, damit der Haupt-Request nie scheitert.
 */
import { recordCockpitEvent } from "./cockpit-events.js";

function cleanData({ subject, goalId, ...rest } = {}) {
  const data = { ...rest };
  if (subject != null && String(subject).trim()) data.subject = String(subject).trim().slice(0, 80);
  if (goalId != null && String(goalId).trim()) data.goalId = String(goalId).trim().slice(0, 80);
  return data;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number|string} studentId
 * @returns {Promise<{ id: number, class_id: number|null, school_id: number|null }|null>}
 */
export async function lookupStudentClassContext(pool, studentId) {
  if (!pool || studentId == null) return null;
  const r = await pool.query(
    `
    SELECT u.id, u.class_id, COALESCE(u.school_id, c.school_id) AS school_id
    FROM users u
    LEFT JOIN classes c ON c.id = u.class_id
    WHERE u.id = $1
    LIMIT 1
  `,
    [studentId]
  );
  return r.rows[0] || null;
}

async function emitForStudent(pool, { studentId, schoolId, classId, typ, subject, goalId, data } = {}) {
  try {
    let sid = schoolId;
    let cid = classId;
    let uid = studentId != null ? Number(studentId) : null;
    if ((!cid || sid == null) && uid != null) {
      const row = await lookupStudentClassContext(pool, uid);
      if (!row) return null;
      cid = cid || row.class_id;
      sid = sid != null ? sid : row.school_id;
      uid = Number(row.id);
    }
    if (!cid || !typ) return null;
    return await recordCockpitEvent(pool, {
      schoolId: sid,
      classId: cid,
      studentId: uid,
      typ,
      data: cleanData({ ...(data || {}), subject, goalId })
    });
  } catch (err) {
    console.warn("cockpit-event-hooks:", err?.message || err);
    return null;
  }
}

/** Tagesziel gesetzt (Plan speichern/anlegen). */
export async function onPlanSaved(pool, opts = {}) {
  return emitForStudent(pool, { ...opts, typ: "tagesziel_gesetzt" });
}

/**
 * Tagesziel geschafft – Zwischen-Check gespeichert oder Reflexion „ja“.
 * Aufrufer entscheidet den Moment; hier nur schreiben.
 */
export async function onCheckSaved(pool, opts = {}) {
  return emitForStudent(pool, { ...opts, typ: "tagesziel_geschafft" });
}

/** Reflexion gespeichert; bei goalAchieved === "ja" zusätzlich tagesziel_geschafft. */
export async function onReflectSaved(pool, opts = {}) {
  const { goalAchieved, ...rest } = opts;
  const reflection = await emitForStudent(pool, { ...rest, typ: "reflexion" });
  const achieved = String(goalAchieved || "")
    .trim()
    .toLowerCase();
  if (achieved === "ja" || achieved.startsWith("ja")) {
    await emitForStudent(pool, { ...rest, typ: "tagesziel_geschafft" });
  }
  return reflection;
}

/** Level bestätigt (Training → sicher oder Levelcheck-Nachweis). Nicht bei Selbst-Markierung. */
export async function onLevelConfirmed(pool, opts = {}) {
  return emitForStudent(pool, { ...opts, typ: "level_bestaetigt" });
}

/** Logic Coach: Schüler hat eine Nachricht gesendet. */
export async function onLogicCoachMessage(pool, opts = {}) {
  return emitForStudent(pool, { ...opts, typ: "logic_coach" });
}
