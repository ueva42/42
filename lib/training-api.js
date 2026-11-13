/**
 * Verbindung zum Trainingscenter: Funktionen, Potenzen, Quadratische Gleichungen, Trigonometrie, Pythagoras.
 * Stände liegen in eigenen Tabellen. Die Trainings-ID hängt als training_wz am Unterthema.
 * qg-01 = Binomische Formeln (unter Quadratische Gleichungen oder Legacy-Thema), Kennung bleibt quadratische-gleichungen.
 * trig-07 und fkt-26 senden selbst keine Station. Die Kennung hängt am Unterthema.
 * fkt-26 öffnet das Prüfungsarchiv. fkt-25 bleibt die Station typische-aufgaben.
 * py-01…py-04 unter Satz des Pythagoras; startklar ohne Kennung.
 */
import { randomBytes } from "crypto";
import {
  BINOM_ASSIGN_TOPIC,
  BINOM_GOAL_ASSIGNMENTS,
  POTENZEN_ASSIGN_TOPIC,
  POTENZEN_CITY,
  POTENZEN_GOAL_ASSIGNMENTS,
  POTENZEN_LEVEL_TEXTS,
  POTENZEN_THEMA,
  PY_ASSIGN_TOPIC,
  PY_CITY,
  PY_GOAL_ASSIGNMENTS,
  PY_LEVEL_TEXTS,
  PY_THEMA,
  QG_ASSIGN_TOPIC,
  QG_CITY,
  QG_GOAL_ASSIGNMENTS,
  QG_LEVEL_TEXTS,
  QG_THEMA,
  GOAL_DASH_SQL_CLASS,
  TRAINING_ASSIGN_TOPIC,
  TRAINING_GOAL_ASSIGNMENTS,
  TRAINING_THEMA,
  TRIG_ASSIGN_TOPIC,
  TRIG_CITY,
  TRIG_GOAL_ASSIGNMENTS,
  TRIG_LEVEL_TEXTS,
  TRIG_PRACTICE_MARKER,
  TRIG_THEMA,
  anzeigeAusTraining,
  applyTrainingCors,
  cityMapLabel,
  cityUrl,
  formatZielnote,
  gradeKeyFromLabel,
  haltForStoredWz,
  isCityMapTopic,
  isTrainingToken,
  loadHalte,
  TIERS,
  markTierForTraining,
  mergeTraining,
  normalizeDashGoalName,
  normalizeGoalName,
  parseProofCode,
  pensumText,
  proofToPayload,
  publicHalt,
  standLabel,
  statusFromTraining,
  trainingOpenUrl,
  trigPracticeNeedsTrainingLink,
  storedTrainingWz,
  topicIsFunktionen,
  validatePayload,
  vergleich,
  wzForThema
} from "./training-merge.js";

const BODY_LIMIT = 4096;
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 60;
const hitsByToken = new Map();

export function resetTrainingRateLimit() {
  hitsByToken.clear();
}

export function allowTrainingMessage(token, now = Date.now()) {
  const fresh = (hitsByToken.get(token) || []).filter((stamp) => now - stamp < RATE_WINDOW_MS);
  if (fresh.length >= RATE_LIMIT) {
    hitsByToken.set(token, fresh);
    return false;
  }
  fresh.push(now);
  hitsByToken.set(token, fresh);
  return true;
}

export function captureTrainingResultBody(req, res, next) {
  if (req.path !== "/api/training/results" || req.method !== "POST") return next();
  const chunks = [];
  let size = 0;
  let settled = false;
  const finish = () => {
    if (settled) return;
    settled = true;
    req._body = true;
    if (size > BODY_LIMIT) {
      req.trainingBodyError = "too-large";
      req.trainingRaw = "";
    } else {
      req.trainingRaw = Buffer.concat(chunks).toString("utf8");
    }
    next();
  };
  req.on("data", (chunk) => {
    size += chunk.length;
    if (size <= BODY_LIMIT) chunks.push(chunk);
  });
  req.on("end", finish);
  req.on("error", finish);
}

export function createTrainingToken() {
  return randomBytes(24).toString("base64url");
}

export async function migrateTrainingTables(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS training_tokens (
      token TEXT PRIMARY KEY,
      student_id INTEGER NOT NULL,
      thema TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      revoked_at TIMESTAMP
    )
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS training_tokens_one_active
    ON training_tokens (student_id, thema)
    WHERE revoked_at IS NULL
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS training_results (
      student_id INTEGER NOT NULL,
      wz TEXT NOT NULL,
      merged JSONB NOT NULL,
      last_raw JSONB NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW(),
      PRIMARY KEY (student_id, wz)
    )
  `);
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'level_check_goals' AND column_name = 'training_wz'
      ) THEN
        ALTER TABLE level_check_goals ADD COLUMN training_wz TEXT NULL;
      END IF;
    END$$;
  `);
  await assignTrainingGoalIds(pool);
  await assignPotenzenGoalIds(pool);
  await assignPotenzenLevelTexts(pool);
  await assignQuadratischeGoalIds(pool);
  await assignQuadratischeLevelTexts(pool);
  await assignTrigonometrieGoalIds(pool);
  await assignTrigonometrieLevelTexts(pool);
  await assignTrigonometriePracticeLinks(pool);
  await assignPythagorasGoalIds(pool);
  await assignPythagorasLevelTexts(pool);
}

/**
 * Beim Start und erneut: exakter Themen- + Unterthema-Name → Trainings-ID.
 * Überschreibt die Kennung bei Treffer (auch wenn vorher leer oder falsch).
 */
async function assignGoalIds(pool, topicName, assignments) {
  const params = [topicName];
  const values = assignments.map(([wz, name], index) => {
    params.push(normalizeGoalName(name), wz);
    const base = index * 2 + 2;
    return `($${base}::text, $${base + 1}::text)`;
  });
  await pool.query(
    `
    UPDATE level_check_goals AS g
    SET training_wz = m.wz
    FROM level_checks AS lc,
         (VALUES ${values.join(", ")}) AS m(goal_name, wz)
    WHERE g.level_check_id = lc.id
      AND lower(regexp_replace(btrim(lc.name), '\\s+', ' ', 'g')) = $1
      AND lower(regexp_replace(btrim(g.goal_text), '\\s+', ' ', 'g')) = m.goal_name
    `,
    params
  );
}

export async function assignTrainingGoalIds(pool) {
  await assignGoalIds(pool, TRAINING_ASSIGN_TOPIC, TRAINING_GOAL_ASSIGNMENTS);
}

export async function assignPotenzenGoalIds(pool) {
  await assignGoalIds(pool, POTENZEN_ASSIGN_TOPIC, POTENZEN_GOAL_ASSIGNMENTS);
}

export async function assignPythagorasGoalIds(pool) {
  await assignGoalIds(pool, PY_ASSIGN_TOPIC, PY_GOAL_ASSIGNMENTS);
}

/** Street Legend nur bei „Pythagoras in Körpern“. Rookie, Operator und Stände bleiben. */
export async function assignPythagorasLevelTexts(pool) {
  const params = [PY_ASSIGN_TOPIC];
  const values = PY_LEVEL_TEXTS.map((row, index) => {
    params.push(normalizeGoalName(row.name), row.streetLegend);
    const base = index * 2 + 2;
    return `($${base}::text, $${base + 1}::text)`;
  });
  await pool.query(
    `
    UPDATE level_check_goals AS g
    SET street_legend_goal_text = m.street_legend_text
    FROM level_checks AS lc,
         (VALUES ${values.join(", ")}) AS m(goal_name, street_legend_text)
    WHERE g.level_check_id = lc.id
      AND lower(regexp_replace(btrim(lc.name), '\\s+', ' ', 'g')) = $1
      AND lower(regexp_replace(btrim(g.goal_text), '\\s+', ' ', 'g')) = m.goal_name
    `,
    params
  );
}

/** Legacy-Thema Binomische Formeln + Thema Quadratische Gleichungen (inkl. qg-01). */
export async function assignQuadratischeGoalIds(pool) {
  await assignGoalIds(pool, BINOM_ASSIGN_TOPIC, BINOM_GOAL_ASSIGNMENTS);
  await assignGoalIds(pool, QG_ASSIGN_TOPIC, QG_GOAL_ASSIGNMENTS);
}

/** Nur die zwei Stufen am passenden Unterthema. Schülerstände bleiben. */
export async function assignPotenzenLevelTexts(pool) {
  const params = [POTENZEN_ASSIGN_TOPIC];
  const values = POTENZEN_LEVEL_TEXTS.map((row, index) => {
    params.push(normalizeGoalName(row.name), row.operator, row.streetLegend);
    const base = index * 3 + 2;
    return `($${base}::text, $${base + 1}::text, $${base + 2}::text)`;
  });
  await pool.query(
    `
    UPDATE level_check_goals AS g
    SET operator_goal_text = m.operator_text,
        street_legend_goal_text = m.street_legend_text
    FROM level_checks AS lc,
         (VALUES ${values.join(", ")}) AS m(goal_name, operator_text, street_legend_text)
    WHERE g.level_check_id = lc.id
      AND lower(regexp_replace(btrim(lc.name), '\\s+', ' ', 'g')) = $1
      AND lower(regexp_replace(btrim(g.goal_text), '\\s+', ' ', 'g')) = m.goal_name
    `,
    params
  );
}

function trigGoalNameSql(column) {
  return `lower(regexp_replace(regexp_replace(btrim(${column}), '[${GOAL_DASH_SQL_CLASS}]', '-', 'g'), '\\s+', ' ', 'g'))`;
}

/** Nur unter Trigonometrie. Strichvarianten im Namen „Einheitskreis“ gelten als gleich. */
export async function assignTrigonometrieGoalIds(pool) {
  const params = [TRIG_ASSIGN_TOPIC];
  const values = TRIG_GOAL_ASSIGNMENTS.map(([wz, name], index) => {
    params.push(normalizeDashGoalName(name), wz);
    const base = index * 2 + 2;
    return `($${base}::text, $${base + 1}::text)`;
  });
  await pool.query(
    `
    UPDATE level_check_goals AS g
    SET training_wz = m.wz
    FROM level_checks AS lc,
         (VALUES ${values.join(", ")}) AS m(goal_name, wz)
    WHERE g.level_check_id = lc.id
      AND lower(regexp_replace(btrim(lc.name), '\\s+', ' ', 'g')) = $1
      AND ${trigGoalNameSql("g.goal_text")} = m.goal_name
    `,
    params
  );
}

/** Alle drei Ich-kann-Sätze, nur bei Startklar im Thema Trigonometrie. Stände bleiben. */
export async function assignTrigonometrieLevelTexts(pool) {
  const params = [TRIG_ASSIGN_TOPIC];
  const values = TRIG_LEVEL_TEXTS.map((row, index) => {
    params.push(normalizeDashGoalName(row.name), row.rookie, row.operator, row.streetLegend);
    const base = index * 4 + 2;
    return `($${base}::text, $${base + 1}::text, $${base + 2}::text, $${base + 3}::text)`;
  });
  await pool.query(
    `
    UPDATE level_check_goals AS g
    SET rookie_goal_text = m.rookie_text,
        operator_goal_text = m.operator_text,
        street_legend_goal_text = m.street_legend_text
    FROM level_checks AS lc,
         (VALUES ${values.join(", ")}) AS m(goal_name, rookie_text, operator_text, street_legend_text)
    WHERE g.level_check_id = lc.id
      AND lower(regexp_replace(btrim(lc.name), '\\s+', ' ', 'g')) = $1
      AND ${trigGoalNameSql("g.goal_text")} = m.goal_name
    `,
    params
  );
}

/**
 * Alte forschendphaenomenal-Links nur an den sieben Unterthemen.
 * Gespeichert wird kein Trainingslink und keine Kennung, sondern ein Platzhalter.
 */
export async function assignTrigonometriePracticeLinks(pool) {
  const names = TRIG_GOAL_ASSIGNMENTS.map(([, name]) => normalizeDashGoalName(name));
  await pool.query(
    `
    UPDATE level_check_goals AS g
    SET practice_url = $2
    FROM level_checks AS lc
    WHERE g.level_check_id = lc.id
      AND lower(regexp_replace(btrim(lc.name), '\\s+', ' ', 'g')) = $1
      AND ${trigGoalNameSql("g.goal_text")} = ANY($3::text[])
      AND g.practice_url ILIKE '%forschendphaenomenal%'
    `,
    [TRIG_ASSIGN_TOPIC, TRIG_PRACTICE_MARKER, names]
  );
}

function writeShownPractice(goal, url) {
  goal.practiceUrl = url;
  if (goal.material && typeof goal.material === "object") goal.material.url = url;
}

/**
 * Alte Material-Links nur in der Antwort ersetzen.
 * Ohne Zielnote bleibt die Adresse leer, damit kein Link ohne Kennung offen ist.
 */
export async function applyTrigPracticeLinks(pool, studentId, checks) {
  const byName = new Map(
    TRIG_GOAL_ASSIGNMENTS.map(([wz, name]) => [normalizeDashGoalName(name), wz])
  );
  const pending = [];
  for (const check of checks || []) {
    if (normalizeGoalName(check.name) !== TRIG_ASSIGN_TOPIC) continue;
    for (const goal of check.goals || []) {
      const current = goal.practiceUrl || goal.material?.url || "";
      if (!trigPracticeNeedsTrainingLink(current)) continue;
      const nameWz = byName.get(normalizeDashGoalName(goal.text));
      if (!nameWz) continue;
      const stored = storedTrainingWz(goal);
      if (stored && stored !== nameWz) continue;
      pending.push({ check, goal, wz: stored || nameWz });
    }
  }
  if (!pending.length) return;
  const noteByCheck = new Map();
  for (const item of pending) {
    const checkId = String(item.check.id);
    if (!noteByCheck.has(checkId)) {
      noteByCheck.set(checkId, await targetFor(pool, studentId, item.check.id));
    }
  }
  const needsToken = pending.some((item) => noteByCheck.get(String(item.check.id)));
  const token = needsToken ? await ensureToken(pool, studentId, TRIG_THEMA) : null;
  const halte = loadHalte(TRIG_THEMA);
  for (const item of pending) {
    const note = noteByCheck.get(String(item.check.id));
    const halt = haltForStoredWz(halte, item.wz);
    const url = note && token ? trainingOpenUrl(halt, token, note) : null;
    writeShownPractice(item.goal, url);
  }
}

/** Rookie-Feld am Unterthema Binomische Formeln (beide möglichen Themennamen). */
export async function assignQuadratischeLevelTexts(pool) {
  for (const topicName of [BINOM_ASSIGN_TOPIC, QG_ASSIGN_TOPIC]) {
    const params = [topicName];
    const values = QG_LEVEL_TEXTS.map((row, index) => {
      params.push(normalizeGoalName(row.name), row.rookie);
      const base = index * 2 + 2;
      return `($${base}::text, $${base + 1}::text)`;
    });
    await pool.query(
      `
      UPDATE level_check_goals AS g
      SET rookie_goal_text = m.rookie_text
      FROM level_checks AS lc,
           (VALUES ${values.join(", ")}) AS m(goal_name, rookie_text)
      WHERE g.level_check_id = lc.id
        AND lower(regexp_replace(btrim(lc.name), '\\s+', ' ', 'g')) = $1
        AND lower(regexp_replace(btrim(g.goal_text), '\\s+', ' ', 'g')) = m.goal_name
      `,
      params
    );
  }
}

function parseJsonObject(text) {
  if (typeof text !== "string" || !text.trim()) return { ok: false };
  try {
    const value = JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false };
    return { ok: true, value };
  } catch (_err) {
    return { ok: false };
  }
}

function asObject(value) {
  if (value && typeof value === "object") return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (_err) {
      return {};
    }
  }
  return {};
}

function isoTime(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

async function readToken(pool, token) {
  const found = await pool.query(
    `
    SELECT token, student_id, thema, revoked_at
    FROM training_tokens
    WHERE token = $1
    LIMIT 1
  `,
    [token]
  );
  return found.rows[0] || null;
}

async function readResult(pool, studentId, wz) {
  const found = await pool.query(
    `
    SELECT merged, updated_at
    FROM training_results
    WHERE student_id = $1 AND wz = $2
    LIMIT 1
  `,
    [studentId, wz]
  );
  return found.rows[0] || null;
}

async function writeResult(pool, studentId, wz, merged, raw) {
  await pool.query(
    `
    INSERT INTO training_results (student_id, wz, merged, last_raw, updated_at)
    VALUES ($1, $2, $3::jsonb, $4::jsonb, NOW())
    ON CONFLICT (student_id, wz)
    DO UPDATE SET merged = EXCLUDED.merged, last_raw = EXCLUDED.last_raw, updated_at = NOW()
  `,
    [studentId, wz, JSON.stringify(merged), JSON.stringify(raw)]
  );
}

async function ensureToken(pool, studentId, thema) {
  const existing = await pool.query(
    `
    SELECT token
    FROM training_tokens
    WHERE student_id = $1 AND thema = $2 AND revoked_at IS NULL
    LIMIT 1
  `,
    [studentId, thema]
  );
  if (existing.rows[0]?.token) return existing.rows[0].token;
  const token = createTrainingToken();
  try {
    await pool.query(
      `
      INSERT INTO training_tokens (token, student_id, thema)
      VALUES ($1, $2, $3)
    `,
      [token, studentId, thema]
    );
    return token;
  } catch (err) {
    const again = await pool.query(
      `
      SELECT token
      FROM training_tokens
      WHERE student_id = $1 AND thema = $2 AND revoked_at IS NULL
      LIMIT 1
    `,
      [studentId, thema]
    );
    if (again.rows[0]?.token) return again.rows[0].token;
    throw err;
  }
}

async function studentRow(pool, studentId) {
  const found = await pool.query(
    `
    SELECT id, class_id, school_id
    FROM users
    WHERE id = $1 AND role = 'student'
    LIMIT 1
  `,
    [studentId]
  );
  return found.rows[0] || null;
}

async function targetFor(pool, studentId, levelCheckId) {
  const found = await pool.query(
    `
    SELECT target_grade_key, target_grade
    FROM level_check_targets
    WHERE user_id = $1 AND level_check_id = $2
    LIMIT 1
  `,
    [studentId, levelCheckId]
  );
  const row = found.rows[0];
  if (!row) return null;
  return formatZielnote(row.target_grade_key || row.target_grade);
}

function pickStoredTrainingTopic(checks) {
  let best = null;
  let bestCount = 0;
  for (const check of checks || []) {
    const count = (check.goals || []).filter((goal) => storedTrainingWz(goal)).length;
    if (count > bestCount) {
      best = check;
      bestCount = count;
    }
  }
  return best;
}

function storedWzOnChecks(checks) {
  const set = new Set();
  for (const check of checks || []) {
    for (const goal of check.goals || []) {
      const wz = storedTrainingWz(goal);
      if (wz) set.add(wz);
    }
  }
  return set;
}

async function checksForStudent(pool, studentId, getLevelChecksForClass) {
  const student = await studentRow(pool, studentId);
  if (!student?.class_id) return { student, checks: [] };
  const checks = await getLevelChecksForClass(
    student.class_id,
    student.school_id,
    student.id
  );
  return { student, checks: checks || [] };
}

function goalView(goalId, halt, row, zielnote, token) {
  const view = {
    goalId,
    wz: halt?.wz || null,
    trainingUrl: trainingOpenUrl(halt, token, zielnote),
    updatedAt: row ? isoTime(row.updated_at) : null,
    stufen: null
  };
  if (!row) return view;
  const merged = asObject(row.merged);
  const stufen = {};
  for (const tier of ["rookie", "operator", "streetLegend"]) {
    const level = merged.levels?.[tier] || {};
    const solved = Number.isInteger(level.solved) && level.solved >= 0 ? level.solved : 0;
    stufen[tier] = {
      anzeige: anzeigeAusTraining(level),
      solved,
      vergleich: vergleich(solved, merged.ichKann?.[tier])
    };
  }
  view.stufen = stufen;
  return view;
}

async function resultsForStudent(pool, studentId) {
  const found = await pool.query(
    `
    SELECT wz, merged, updated_at
    FROM training_results
    WHERE student_id = $1
  `,
    [studentId]
  );
  const byWz = new Map();
  for (const row of found.rows) byWz.set(row.wz, row);
  return byWz;
}

function describeTopic(check, halte, byWz, zielnote, token, recommendedTierCounts, cityOptions) {
  const withTraining = [];
  const seenWz = new Set();
  const goalPayload = [];
  for (const goal of check.goals || []) {
    const halt = haltForStoredWz(halte, storedTrainingWz(goal));
    if (!halt) continue;
    const row = byWz.get(halt.wz) || null;
    if (row && !seenWz.has(halt.wz)) {
      seenWz.add(halt.wz);
      withTraining.push(asObject(row.merged));
    }
    goalPayload.push(goalView(goal.id, halt, row, zielnote, token));
  }
  const topicKey = normalizeGoalName(check.name);
  const showStadtkarte = isCityMapTopic(check.name);
  return {
    levelCheckId: check.id,
    name: check.name,
    isFunktionen:
      topicKey !== POTENZEN_ASSIGN_TOPIC &&
      topicKey !== QG_ASSIGN_TOPIC &&
      topicKey !== BINOM_ASSIGN_TOPIC &&
      topicKey !== TRIG_ASSIGN_TOPIC &&
      topicKey !== PY_ASSIGN_TOPIC,
    zielnote,
    showStadtkarte,
    beschriftung: showStadtkarte ? cityMapLabel(cityMapThema(check.name)) : null,
    // Ganzes Thema: kein einzelnes Unterthema, deshalb kein h.
    // Binomische Formeln ist kein Stadtkarten-Thema, auch wenn qg-01 dort hängt.
    stadtkarte: showStadtkarte ? cityUrl(token, zielnote, undefined, cityOptions) : null,
    pensum: pensumText(withTraining, gradeKeyFromLabel(zielnote), recommendedTierCounts),
    abweichungen: [],
    goals: goalPayload
  };
}

function cityMapThema(name) {
  const key = normalizeGoalName(name);
  if (key === POTENZEN_ASSIGN_TOPIC) return POTENZEN_THEMA;
  if (key === TRAINING_ASSIGN_TOPIC) return TRAINING_THEMA;
  if (key === QG_ASSIGN_TOPIC || key === BINOM_ASSIGN_TOPIC) return QG_THEMA;
  if (key === TRIG_ASSIGN_TOPIC) return TRIG_THEMA;
  if (key === PY_ASSIGN_TOPIC) return PY_THEMA;
  return "";
}

/** Levelplan-Thema → Kennung. Unbekannte Namen bleiben bei Funktionen, wie bisher. */
function trainingThemaForCheck(name) {
  return cityMapThema(name) || TRAINING_THEMA;
}

function cityOptionsForThema(thema) {
  if (thema === POTENZEN_THEMA) return POTENZEN_CITY;
  if (thema === QG_THEMA) return QG_CITY;
  if (thema === TRIG_THEMA) return TRIG_CITY;
  if (thema === PY_THEMA) return PY_CITY;
  return undefined;
}

/** null = kein Thema angegeben, false = unbrauchbar, sonst eine bekannte Kennung. */
function requestedThema(value) {
  if (value == null || value === "") return null;
  if (typeof value !== "string") return false;
  const thema = value.trim();
  if (!thema) return null;
  if (
    thema !== TRAINING_THEMA &&
    thema !== POTENZEN_THEMA &&
    thema !== QG_THEMA &&
    thema !== TRIG_THEMA &&
    thema !== PY_THEMA
  ) {
    return false;
  }
  return thema;
}

/** Zielnote der Status-Abfrage. Quadratische Gleichungen nicht vom Nachbarthema nehmen. */
function topicForStatus(checks, statusThema) {
  if (statusThema === POTENZEN_THEMA) {
    return (
      (checks || []).find((check) => normalizeGoalName(check.name) === POTENZEN_ASSIGN_TOPIC) ||
      null
    );
  }
  if (statusThema === QG_THEMA) {
    return (
      (checks || []).find((check) => normalizeGoalName(check.name) === QG_ASSIGN_TOPIC) || null
    );
  }
  if (statusThema === TRIG_THEMA) {
    return (
      (checks || []).find((check) => normalizeGoalName(check.name) === TRIG_ASSIGN_TOPIC) || null
    );
  }
  if (statusThema === PY_THEMA) {
    return (
      (checks || []).find((check) => normalizeGoalName(check.name) === PY_ASSIGN_TOPIC) || null
    );
  }
  return pickStoredTrainingTopic(checks);
}

/**
 * Dieselbe Kennung wie „Training starten“: Halt nur über die gespeicherte training_wz.
 * Ohne Zielnote kein Link. Ohne passende Halt-Nummer kein Link auf einen anderen Halt.
 */
export async function cityMapsForGoals(pool, studentId, goalIds) {
  const ids = [...new Set((goalIds || []).map((id) => String(id || "").trim()).filter(Boolean))];
  const out = new Map();
  if (!ids.length) return out;
  const found = await pool.query(
    `
    SELECT g.id::text AS id, g.training_wz, lc.id AS level_check_id, lc.name
    FROM level_check_goals g
    JOIN level_checks lc ON lc.id = g.level_check_id
    WHERE g.id::text = ANY($1::text[])
  `,
    [ids]
  );
  const groups = new Map();
  for (const row of found.rows) {
    const thema = cityMapThema(row.name);
    if (!thema) continue;
    let group = groups.get(thema);
    if (!group) {
      group = { rows: [], checkIds: [] };
      groups.set(thema, group);
    }
    group.rows.push(row);
    const checkId = String(row.level_check_id);
    if (!group.checkIds.includes(checkId)) group.checkIds.push(checkId);
  }
  for (const [thema, group] of groups) {
    const token = await ensureToken(pool, studentId, thema);
    const noteByCheck = new Map();
    for (const checkId of group.checkIds) {
      noteByCheck.set(checkId, await targetFor(pool, studentId, checkId));
    }
    const themeHalte = loadHalte(thema);
    const cityOptions = cityOptionsForThema(thema);
    for (const row of group.rows) {
      const halt = haltForStoredWz(themeHalte, storedTrainingWz(row));
      const n = Number(halt?.n);
      if (!halt || !Number.isInteger(n) || n < 1) continue;
      const zielnote = noteByCheck.get(String(row.level_check_id));
      out.set(String(row.id), {
        url: cityUrl(token, zielnote, n, cityOptions),
        beschriftung: cityMapLabel(thema)
      });
    }
  }
  return out;
}

async function saveIncoming(pool, studentId, raw, value) {
  const current = await readResult(pool, studentId, value.wz);
  const merged = mergeTraining(asObject(current?.merged), value);
  const storedRaw = { ...raw };
  delete storedRaw.token;
  await writeResult(pool, studentId, value.wz, merged, storedRaw);
  return merged;
}

function currentMarkStatus(goal, markTier) {
  const entry = goal?.mark?.tiers?.[markTier];
  if (!entry) return "offen";
  if (typeof entry === "object" && entry.status) return entry.status;
  return "sicher";
}

/** Schreibt nur, was statusFromTraining zurückgibt. 0 und „schon sicher“ ergeben keinen Schreibaufruf. */
async function applyTrainingMarks(writeLevelMark, student, checks, merged) {
  if (typeof writeLevelMark !== "function" || !student || !merged?.levels) return;
  const wz = merged.wz;
  for (const check of checks || []) {
    for (const goal of check.goals || []) {
      if (!goal?.id || storedTrainingWz(goal) !== wz) continue;
      for (const tier of TIERS) {
        const markTier = markTierForTraining(tier);
        if (!markTier) continue;
        const next = statusFromTraining(currentMarkStatus(goal, markTier), merged.levels[tier]);
        if (!next) continue;
        await writeLevelMark({
          schoolId: student.school_id,
          goalId: goal.id,
          userId: student.id,
          tier: markTier,
          status: next
        });
      }
    }
  }
}

const CODE_BITTE = "Bitte den Nachweis-Code eintragen.";
const CODE_UNGUELTIG = "Der Code ist nicht gültig.";
const CODE_OHNE_ZIEL = "Dieser Code gehört zu keinem Unterthema.";

function reject(res, status) {
  return res.status(status).json({ ok: false });
}

export function registerTrainingRoutes(app, deps) {
  const {
    pool,
    isStudent,
    isTeacher,
    teacherCanAccessClass,
    getLevelChecksForClass,
    recommendedTierCounts,
    writeLevelMark
  } = deps;
  const allowedWz = wzForThema(TRAINING_THEMA);
  const halte = loadHalte();

  app.options("/api/training/results", (req, res) => {
    applyTrainingCors(req, res);
    res.status(204).end();
  });

  app.options("/api/training/status", (req, res) => {
    applyTrainingCors(req, res);
    res.status(204).end();
  });

  app.post("/api/training/results", async (req, res) => {
    applyTrainingCors(req, res);
    try {
      if (req.trainingBodyError) return reject(res, 400);
      const parsed = parseJsonObject(req.trainingRaw);
      if (!parsed.ok) return reject(res, 400);
      const token = parsed.value.token;
      if (!isTrainingToken(token)) return reject(res, 400);
      const row = await readToken(pool, token);
      if (!row) return reject(res, 404);
      if (row.revoked_at) return reject(res, 410);
      if (
        row.thema !== TRAINING_THEMA &&
        row.thema !== POTENZEN_THEMA &&
        row.thema !== QG_THEMA &&
        row.thema !== TRIG_THEMA &&
        row.thema !== PY_THEMA
      ) {
        return reject(res, 400);
      }
      const asked = requestedThema(parsed.value.thema);
      if (asked === false || (asked && asked !== row.thema)) return reject(res, 400);
      const checked = validatePayload(parsed.value, { allowedWz: wzForThema(row.thema) });
      if (!checked.ok) return reject(res, 400);
      const { student, checks } = await checksForStudent(pool, row.student_id, getLevelChecksForClass);
      if (!storedWzOnChecks(checks).has(checked.value.wz)) return reject(res, 400);
      if (!allowTrainingMessage(token)) {
        res.setHeader("Retry-After", "60");
        return res.status(429).json({ ok: false });
      }
      const merged = await saveIncoming(pool, row.student_id, parsed.value, checked.value);
      await applyTrainingMarks(writeLevelMark, student, checks, merged);
      return res.json({ ok: true });
    } catch (_err) {
      console.error("training results");
      return res.status(500).json({ ok: false });
    }
  });

  app.get("/api/training/status", async (req, res) => {
    applyTrainingCors(req, res);
    try {
      const token = String(req.query.t || "");
      if (!isTrainingToken(token)) return reject(res, 400);
      const row = await readToken(pool, token);
      if (!row) return reject(res, 404);
      if (row.revoked_at) return reject(res, 410);
      const asked = requestedThema(req.query.thema);
      if (asked === false || (asked && asked !== row.thema)) return reject(res, 400);
      const statusThema =
        row.thema === POTENZEN_THEMA ||
        row.thema === QG_THEMA ||
        row.thema === TRIG_THEMA ||
        row.thema === PY_THEMA
          ? row.thema
          : TRAINING_THEMA;
      const themeWz = wzForThema(statusThema);
      const { student, checks } = await checksForStudent(
        pool,
        row.student_id,
        getLevelChecksForClass
      );
      const assigned = storedWzOnChecks(checks);
      const topic = topicForStatus(checks, statusThema);
      const zielnote = topic && student ? await targetFor(pool, student.id, topic.id) : null;
      const stored = await resultsForStudent(pool, row.student_id);
      const halteOut = {};
      for (const [wz, result] of stored) {
        if (!assigned.has(wz) || !themeWz.has(wz)) continue;
        halteOut[wz] = publicHalt(asObject(result.merged));
      }
      return res.json({ zielnote, halte: halteOut });
    } catch (_err) {
      console.error("training status");
      return res.status(500).json({ ok: false });
    }
  });

  app.get("/api/student/training", isStudent, async (req, res) => {
    try {
      const studentId = req.session.user.id;
      const student = await studentRow(pool, studentId);
      if (!student) return reject(res, 404);
      const checks = student.class_id
        ? await getLevelChecksForClass(student.class_id, student.school_id, studentId)
        : [];
      const relevant = checks.filter(
        (check) =>
          isCityMapTopic(check.name) ||
          (check.goals || []).some((goal) => storedTrainingWz(goal))
      );
      if (!relevant.length) return res.json({ thema: TRAINING_THEMA, topics: [] });
      const byWz = await resultsForStudent(pool, studentId);
      const tokenByThema = new Map();
      const topics = [];
      for (const check of relevant) {
        const thema = trainingThemaForCheck(check.name);
        let token = tokenByThema.get(thema);
        if (!token) {
          token = await ensureToken(pool, studentId, thema);
          tokenByThema.set(thema, token);
        }
        const zielnote = await targetFor(pool, studentId, check.id);
        const cityOptions = cityOptionsForThema(thema);
        topics.push(
          describeTopic(
            check,
            loadHalte(thema),
            byWz,
            zielnote,
            token,
            recommendedTierCounts,
            cityOptions
          )
        );
      }
      return res.json({ thema: TRAINING_THEMA, topics });
    } catch (_err) {
      console.error("training lernstand");
      return res.status(500).json({ ok: false });
    }
  });

  app.post("/api/student/training/redeem", isStudent, async (req, res) => {
    try {
      const studentId = req.session.user.id;
      const raw = req.body && typeof req.body.code === "string" ? req.body.code.trim() : "";
      if (!raw || raw.startsWith("{") || raw.startsWith("[")) {
        return res.status(400).json({ ok: false, gespeichert: false, hinweis: CODE_BITTE });
      }
      const parsed = parseProofCode(raw);
      if (!parsed.ok) {
        return res.status(400).json({ ok: false, gespeichert: false, hinweis: CODE_UNGUELTIG });
      }
      const checked = validatePayload(proofToPayload(parsed), { allowedWz, requireToken: false });
      if (!checked.ok) {
        return res.status(400).json({ ok: false, gespeichert: false, hinweis: CODE_UNGUELTIG });
      }
      const { student, checks } = await checksForStudent(pool, studentId, getLevelChecksForClass);
      if (!student) return reject(res, 404);
      if (!storedWzOnChecks(checks).has(checked.value.wz)) {
        return res.status(400).json({ ok: false, gespeichert: false, hinweis: CODE_OHNE_ZIEL });
      }
      const merged = await saveIncoming(pool, studentId, { code: raw, quelle: "code" }, checked.value);
      await applyTrainingMarks(writeLevelMark, student, checks, merged);
      return res.json({ ok: true, gespeichert: true, quelle: "code" });
    } catch (_err) {
      console.error("training einloesen");
      return res.status(500).json({ ok: false, hinweis: CODE_UNGUELTIG });
    }
  });

  app.get("/api/teacher/training", isTeacher, async (req, res) => {
    try {
      const classId = Number(req.query.classId);
      const levelCheckId = String(req.query.levelCheckId || "");
      if (!Number.isInteger(classId) || classId <= 0 || !levelCheckId) return reject(res, 400);
      const allowed = await teacherCanAccessClass(pool, req.session.user, classId);
      if (!allowed) return res.status(403).json({ ok: false });
      const checks = await getLevelChecksForClass(
        classId,
        req.session.user.school_id,
        null
      );
      const check = checks.find((item) => String(item.id) === levelCheckId);
      if (!check) return reject(res, 404);
      if (!topicIsFunktionen(check.name, check.goals || [], halte)) {
        return res.json({ isFunktionen: false, abweichungen: [], goals: [] });
      }
      const students = await pool.query(
        `
        SELECT id, name
        FROM users
        WHERE class_id = $1
          AND school_id = $2
          AND role = 'student'
          AND COALESCE(is_active, TRUE) = TRUE
        ORDER BY name ASC, id ASC
      `,
        [classId, req.session.user.school_id]
      );
      const ids = students.rows.map((student) => student.id);
      let rows = [];
      if (ids.length) {
        const stored = await pool.query(
          `
          SELECT student_id, wz, merged
          FROM training_results
          WHERE student_id = ANY($1::int[])
        `,
          [ids]
        );
        rows = stored.rows;
      }
      const byStudentWz = new Map();
      for (const row of rows) {
        if (!allowedWz.has(row.wz)) continue;
        byStudentWz.set(`${row.student_id}:${row.wz}`, asObject(row.merged));
      }
      const goals = (check.goals || []).map((goal) => {
        const halt = haltForStoredWz(halte, storedTrainingWz(goal));
        const people = [];
        if (halt) {
          for (const student of students.rows) {
            const merged = byStudentWz.get(`${student.id}:${halt.wz}`);
            if (!merged) continue;
            const stufen = {};
            for (const tier of ["rookie", "operator", "streetLegend"]) {
              const solved = merged.levels?.[tier]?.solved;
              stufen[tier] = {
                stand: standLabel(solved),
                ueberschaetzt: vergleich(solved, merged.ichKann?.[tier]) === "überschätzt"
              };
            }
            people.push({ id: student.id, name: student.name, stufen });
          }
        }
        return {
          goalId: goal.id,
          text: goal.text,
          wz: halt?.wz || null,
          students: people
        };
      });
      return res.json({ isFunktionen: true, abweichungen: [], goals });
    } catch (_err) {
      console.error("training lehrkraft");
      return res.status(500).json({ ok: false });
    }
  });
}
