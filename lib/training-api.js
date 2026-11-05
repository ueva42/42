/**
 * Verbindung zum Trainingscenter, nur Thema Funktionen.
 * Stände liegen in eigenen Tabellen. Die Trainings-ID hängt als training_wz am Unterthema.
 */
import { randomBytes } from "crypto";
import {
  TRAINING_ASSIGN_TOPIC,
  TRAINING_GOAL_ASSIGNMENTS,
  TRAINING_THEMA,
  REDEEM_HINWEIS,
  anzeigeAusTraining,
  applyTrainingCors,
  cityUrl,
  formatZielnote,
  gradeKeyFromLabel,
  haltForStoredWz,
  isCityMapTopic,
  isTrainingToken,
  loadHalte,
  mergeTraining,
  normalizeGoalName,
  parseProofCode,
  pensumText,
  publicHalt,
  redeemExample,
  standLabel,
  stationUrl,
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
}

/** Einmalig und beim nächsten Start erneut: nur exakter Name, fremde IDs bleiben. */
export async function assignTrainingGoalIds(pool) {
  const params = [TRAINING_ASSIGN_TOPIC];
  const values = TRAINING_GOAL_ASSIGNMENTS.map(([wz, name], index) => {
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
      AND (
        g.training_wz IS NULL
        OR btrim(g.training_wz) = ''
        OR g.training_wz = m.wz
      )
    `,
    params
  );
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
    trainingUrl: halt ? stationUrl(halt.url, token, zielnote) : null,
    updatedAt: row ? isoTime(row.updated_at) : null,
    stufen: null
  };
  if (!row) return view;
  const merged = asObject(row.merged);
  const stufen = {};
  for (const tier of ["rookie", "operator", "streetLegend"]) {
    const level = merged.levels?.[tier] || {};
    stufen[tier] = {
      anzeige: anzeigeAusTraining(level),
      vergleich: vergleich(level.solved, merged.ichKann?.[tier])
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

function describeTopic(check, halte, byWz, zielnote, token, recommendedTierCounts) {
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
  const showStadtkarte = isCityMapTopic(check.name);
  return {
    levelCheckId: check.id,
    name: check.name,
    isFunktionen: true,
    zielnote,
    showStadtkarte,
    stadtkarte: showStadtkarte ? cityUrl(token, zielnote) : null,
    pensum: pensumText(withTraining, gradeKeyFromLabel(zielnote), recommendedTierCounts),
    abweichungen: [],
    goals: goalPayload
  };
}

/** Dieselbe Kennung wie „Training starten“. Ohne Zielnote kein Link. */
export async function cityMapsForGoals(pool, studentId, goalIds) {
  const ids = [...new Set((goalIds || []).map((id) => String(id || "").trim()).filter(Boolean))];
  const out = new Map();
  if (!ids.length) return out;
  const found = await pool.query(
    `
    SELECT g.id::text AS id, lc.id AS level_check_id, lc.name
    FROM level_check_goals g
    JOIN level_checks lc ON lc.id = g.level_check_id
    WHERE g.id::text = ANY($1::text[])
  `,
    [ids]
  );
  const checkByGoal = new Map();
  const checkIds = [];
  for (const row of found.rows) {
    if (!isCityMapTopic(row.name)) continue;
    const checkId = String(row.level_check_id);
    checkByGoal.set(String(row.id), checkId);
    if (!checkIds.includes(checkId)) checkIds.push(checkId);
  }
  if (!checkByGoal.size) return out;
  const token = await ensureToken(pool, studentId, TRAINING_THEMA);
  const urlByCheck = new Map();
  for (const checkId of checkIds) {
    const zielnote = await targetFor(pool, studentId, checkId);
    urlByCheck.set(checkId, cityUrl(token, zielnote));
  }
  for (const [goalId, checkId] of checkByGoal) {
    out.set(goalId, { url: urlByCheck.get(checkId) || null });
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
    recommendedTierCounts
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
      if (row.thema !== TRAINING_THEMA) return reject(res, 400);
      const checked = validatePayload(parsed.value, { allowedWz });
      if (!checked.ok) return reject(res, 400);
      const { checks } = await checksForStudent(pool, row.student_id, getLevelChecksForClass);
      if (!storedWzOnChecks(checks).has(checked.value.wz)) return reject(res, 400);
      if (!allowTrainingMessage(token)) {
        res.setHeader("Retry-After", "60");
        return res.status(429).json({ ok: false });
      }
      await saveIncoming(pool, row.student_id, parsed.value, checked.value);
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
      const { student, checks } = await checksForStudent(
        pool,
        row.student_id,
        getLevelChecksForClass
      );
      const assigned = storedWzOnChecks(checks);
      const topic = pickStoredTrainingTopic(checks);
      const zielnote = topic && student ? await targetFor(pool, student.id, topic.id) : null;
      const stored = await resultsForStudent(pool, row.student_id);
      const halteOut = {};
      for (const [wz, result] of stored) {
        if (!assigned.has(wz) || !allowedWz.has(wz)) continue;
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
      const funktionen = checks.filter(
        (check) =>
          isCityMapTopic(check.name) ||
          (check.goals || []).some((goal) => storedTrainingWz(goal))
      );
      if (!funktionen.length) return res.json({ thema: TRAINING_THEMA, topics: [] });
      const token = await ensureToken(pool, studentId, TRAINING_THEMA);
      const byWz = await resultsForStudent(pool, studentId);
      const topics = [];
      for (const check of funktionen) {
        const zielnote = await targetFor(pool, studentId, check.id);
        topics.push(describeTopic(check, halte, byWz, zielnote, token, recommendedTierCounts));
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
      const body = req.body;
      let payload = null;
      if (body && typeof body === "object" && !Array.isArray(body) && body.levels && body.wz) {
        payload = body;
      } else if (body && typeof body.code === "string" && body.code.trim().startsWith("{")) {
        const parsed = parseJsonObject(body.code);
        if (!parsed.ok) {
          return res.status(400).json({
            ok: false,
            gespeichert: false,
            hinweis: REDEEM_HINWEIS,
            beispiel: redeemExample()
          });
        }
        payload = parsed.value;
      } else if (body && typeof body.code === "string") {
        parseProofCode(body.code);
        return res.status(400).json({
          ok: false,
          gespeichert: false,
          hinweis: REDEEM_HINWEIS,
          beispiel: redeemExample()
        });
      }
      if (!payload) {
        return res.status(400).json({
          ok: false,
          gespeichert: false,
          hinweis: REDEEM_HINWEIS,
          beispiel: redeemExample()
        });
      }
      const checked = validatePayload(payload, { allowedWz, requireToken: false });
      if (!checked.ok) return reject(res, 400);
      await saveIncoming(pool, studentId, payload, checked.value);
      return res.json({
        ok: true,
        gespeichert: true,
        quelle: "json",
        hinweis: REDEEM_HINWEIS
      });
    } catch (_err) {
      console.error("training einloesen");
      return res.status(500).json({ ok: false });
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
