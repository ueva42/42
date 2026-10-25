/**
 * Legt einen Test-Schüler für den Logic Coach an.
 * Nicht gegen die Live-Datenbank laufen lassen, außer du setzt bewusst COACH_TEST_CONFIRM=ja.
 *
 * Aufruf, wenn DATABASE_URL auf eine lokale Datenbank zeigt:
 *   node scripts/create-coach-test-student.js
 *
 * Das Skript legt nichts doppelt an und ändert keine anderen Schüler.
 * Die App speichert Startpasswörter im Klartext, genau wie „Schüler:in anlegen“.
 * Es gibt kein extra Hashing.
 */
import fs from "fs";
import pg from "pg";

const LOGIN = "coach-test";
const CLASS_NAME = "Coach Testklasse";
const LEVEL_CHECK_NAME = "Coach Test Mathe";
const PASSWORD = "CoachTest42";
const SEED_MARK = "coach-test-seed";

const GOALS = [
  {
    text: "Brüche addieren und subtrahieren",
    rookie: "Ich addiere und subtrahiere Brüche mit gleichem Nenner.",
    operator: "Ich addiere und subtrahiere Brüche mit unterschiedlichem Nenner.",
    street: "Ich begründe an einem Beispiel, warum der Nenner gleich groß sein muss."
  },
  {
    text: "Brüche vergleichen",
    rookie: "Ich vergleiche Brüche mit gleichem Nenner.",
    operator: "Ich vergleiche Brüche, indem ich sie gleichnamig mache.",
    street: "Ich entscheide in einer Sachlage, welcher Bruch größer ist, und begründe das."
  }
];

function loadDotEnv() {
  if (!fs.existsSync(".env")) return;
  const text = fs.readFileSync(".env", "utf8");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] == null || process.env[key] === "") process.env[key] = value;
  }
}

function databaseHost(url) {
  const normalized = String(url).replace(/^postgres(ql)?:/i, "http:");
  try {
    return new URL(normalized).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function isLocalHost(host) {
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

function todayIso() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

async function main() {
  loadDotEnv();
  const databaseUrl = String(process.env.DATABASE_URL || "").trim();
  if (!databaseUrl) {
    fail("DATABASE_URL ist nicht gesetzt. Es wurde nichts angelegt.");
  }

  const host = databaseHost(databaseUrl);
  if (!isLocalHost(host) && process.env.COACH_TEST_CONFIRM !== "ja") {
    fail(
      "Die Datenbank liegt nicht auf diesem Rechner. Zum Schutz wurde nichts angelegt. Nur wenn du das absichtlich willst, setze COACH_TEST_CONFIRM=ja und starte das Skript nochmal."
    );
  }

  const pool = new pg.Pool({
    connectionString: databaseUrl,
    ssl: isLocalHost(host) ? undefined : { rejectUnauthorized: false }
  });

  try {
    const schoolId = await resolveSchoolId(pool);
    const classId = await ensureClass(pool, schoolId);
    const userId = await ensureStudent(pool, schoolId, classId);
    const levelCheckId = await ensureLevelCheck(pool, schoolId, classId);
    const goalIds = await ensureGoals(pool, schoolId, levelCheckId);
    await ensureDayGoal(pool, schoolId, userId, goalIds[0]);
    console.log("Fertig. Klasse: Coach Testklasse. Login: coach-test.");
    console.log("Passwort beim ersten Anlegen: CoachTest42. Ein zweites Mal ändert das Passwort nicht.");
    console.log("Kompetenzzeilen für diesen Test (UUID, das ist die competenceId):");
    for (const id of goalIds) console.log(id);
  } catch (err) {
    fail(`Konnte den Test-Schüler nicht anlegen. ${err.code || ""}`.trim());
  } finally {
    await pool.end();
  }
}

async function resolveSchoolId(pool) {
  const wanted = String(process.env.COACH_TEST_SCHOOL_ID || "").trim();
  if (wanted) {
    const one = await pool.query(`SELECT id FROM schools WHERE id = $1`, [wanted]);
    if (!one.rows.length) fail("COACH_TEST_SCHOOL_ID passt zu keiner Schule. Es wurde nichts angelegt.");
    return one.rows[0].id;
  }
  const schools = await pool.query(`SELECT id, name FROM schools ORDER BY id ASC`);
  if (!schools.rows.length) fail("Es gibt noch keine Schule. Es wurde nichts angelegt.");
  if (schools.rows.length === 1) return schools.rows[0].id;
  console.error("Es gibt mehrere Schulen. Setze COACH_TEST_SCHOOL_ID und starte nochmal.");
  for (const row of schools.rows) {
    console.error(`Schule ${row.id}: ${row.name}`);
  }
  process.exit(1);
}

async function ensureClass(pool, schoolId) {
  const existing = await pool.query(
    `SELECT id FROM classes WHERE school_id = $1 AND name = $2`,
    [schoolId, CLASS_NAME]
  );
  if (existing.rows.length) return existing.rows[0].id;
  const created = await pool.query(
    `INSERT INTO classes (name, school_id) VALUES ($1, $2) RETURNING id`,
    [CLASS_NAME, schoolId]
  );
  return created.rows[0].id;
}

async function ensureStudent(pool, schoolId, classId) {
  const existing = await pool.query(
    `SELECT id, class_id, role FROM users WHERE school_id = $1 AND name = $2`,
    [schoolId, LOGIN]
  );
  if (existing.rows.length) {
    const row = existing.rows[0];
    if (row.role !== "student" || Number(row.class_id) !== Number(classId)) {
      fail("Der Login coach-test gibt es schon woanders. Es wurde nichts geändert.");
    }
    return row.id;
  }
  const created = await pool.query(
    `
    INSERT INTO users (
      name, password, role, class_id, school_id, xp, first_login, freedom_rank, is_active
    )
    VALUES ($1, $2, 'student', $3, $4, 0, FALSE, 'starter', TRUE)
    RETURNING id
  `,
    [LOGIN, PASSWORD, classId, schoolId]
  );
  return created.rows[0].id;
}

async function ensureLevelCheck(pool, schoolId, classId) {
  const existing = await pool.query(
    `
    SELECT id FROM level_checks
    WHERE school_id = $1 AND class_id = $2 AND subject = 'Mathe' AND name = $3
    ORDER BY created_at ASC
    LIMIT 1
  `,
    [schoolId, classId, LEVEL_CHECK_NAME]
  );
  if (existing.rows.length) return existing.rows[0].id;
  const created = await pool.query(
    `
    INSERT INTO level_checks (school_id, class_id, subject, name, sort_order)
    VALUES ($1, $2, 'Mathe', $3, 0)
    RETURNING id
  `,
    [schoolId, classId, LEVEL_CHECK_NAME]
  );
  return created.rows[0].id;
}

async function ensureGoals(pool, schoolId, levelCheckId) {
  const ids = [];
  for (const goal of GOALS) {
    const existing = await pool.query(
      `
      SELECT id FROM level_check_goals
      WHERE level_check_id = $1 AND goal_text = $2
      ORDER BY created_at ASC
      LIMIT 1
    `,
      [levelCheckId, goal.text]
    );
    if (existing.rows.length) {
      ids.push(existing.rows[0].id);
      continue;
    }
    const orderRes = await pool.query(
      `SELECT COALESCE(MAX(sort_order), 0) + 1 AS next_order FROM level_check_goals WHERE level_check_id = $1`,
      [levelCheckId]
    );
    const created = await pool.query(
      `
      INSERT INTO level_check_goals (
        school_id, level_check_id, goal_text, sort_order,
        rookie_goal_text, operator_goal_text, street_legend_goal_text,
        material_type, active, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'none', TRUE, NOW())
      RETURNING id
    `,
      [
        schoolId,
        levelCheckId,
        goal.text,
        orderRes.rows[0].next_order,
        goal.rookie,
        goal.operator,
        goal.street
      ]
    );
    ids.push(created.rows[0].id);
  }
  return ids;
}

async function ensureDayGoal(pool, schoolId, userId, goalId) {
  const existing = await pool.query(
    `SELECT id FROM log_entries WHERE user_id = $1 AND details_text = $2 LIMIT 1`,
    [userId, SEED_MARK]
  );
  if (existing.rows.length) return;
  const goal = GOALS[0];
  await pool.query(
    `
    INSERT INTO log_entries (
      user_id, school_id, date, subject, goal,
      what_goal_id, what_goal_text, selected_level, level_goal_text, how_goal_text,
      details_text, entry_kind
    )
    VALUES ($1, $2, $3, 'Mathe', $4, $5, $4, 'rookie', $6, $7, $8, 'lesson')
  `,
    [
      userId,
      schoolId,
      todayIso(),
      goal.text,
      goalId,
      goal.rookie,
      "Ich prüfe, ob das Ergebnis größer oder kleiner als die Ausgangszahl ist.",
      SEED_MARK
    ]
  );
}

main();
