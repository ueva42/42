/**
 * Logic Coach, Phase 1: nur Server.
 * Keine Kachel, kein Fenster. COACH_ENABLED ist standardmäßig aus.
 */
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { randomBytes } from "crypto";
import { loadCoachContext } from "./coach-context.js";
import {
  checkCoachLimits,
  estimateCostEur,
  isCoachEnabled,
  isLoginAllowed,
  isSubjectEnabled,
  recordCoachUsage,
  retentionDays
} from "./coach-limits.js";
import { mockReply } from "./coach-mock.js";
import { redactContacts, redactForModel } from "./coach-privacy.js";
import { COACH_UNREACHABLE, completeCoach } from "./coach-provider.js";

const promptPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../coach/prompts/system_mathe.md"
);
const systemTemplate = readFileSync(promptPath, "utf8");

function useMock() {
  const flag = String(process.env.COACH_MOCK || "").trim().toLowerCase();
  const key = String(process.env.AI_API_KEY || "").trim();
  return flag === "true" || !key;
}

function fillPrompt(values) {
  return systemTemplate.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const value = values[key];
    if (value == null || String(value).trim() === "") return "nicht angegeben";
    return String(value);
  });
}

function sanitizeReply(raw) {
  let hilfestufe = Number(raw?.hilfestufe);
  if (!Number.isFinite(hilfestufe)) hilfestufe = 0;
  hilfestufe = Math.max(0, Math.min(4, Math.round(hilfestufe)));
  let nachricht = String(raw?.nachricht || "").trim().slice(0, 2000);
  if (raw?.loesung_verraten === true) {
    nachricht = "Die Lösung verrate ich nicht. Was hast du als Nächstes vor?";
  }
  if (!nachricht) nachricht = "Magst du mir sagen, wie du gerechnet hast?";
  const diagnose = String(raw?.diagnose_code || "KEINER").trim().slice(0, 80) || "KEINER";
  return {
    nachricht,
    diagnose_code: diagnose,
    hilfestufe,
    loesung_verraten: false
  };
}

async function loadAccount(pool, userId) {
  const res = await pool.query(
    `
    SELECT id, name, role, class_id, school_id,
           COALESCE(is_active, TRUE) AS is_active
    FROM users
    WHERE id = $1
  `,
    [userId]
  );
  const row = res.rows[0];
  if (!row || row.is_active === false) return null;
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    classId: row.class_id,
    schoolId: row.school_id
  };
}

async function loadClassName(pool, classId, schoolId) {
  if (!classId) return "";
  const res = await pool.query(
    `SELECT name FROM classes WHERE id = $1 AND ($2::int IS NULL OR school_id = $2)`,
    [classId, schoolId]
  );
  return String(res.rows[0]?.name || "");
}

export async function migrateCoachTables(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS coach_sessions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id INTEGER NOT NULL,
      school_id INTEGER,
      schueler_pseudonym TEXT NOT NULL,
      fach TEXT NOT NULL,
      competence_id UUID NOT NULL,
      level TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_coach_sessions_user_created
    ON coach_sessions (user_id, created_at)
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS coach_messages (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      session_id UUID NOT NULL REFERENCES coach_sessions(id) ON DELETE CASCADE,
      rolle TEXT NOT NULL,
      inhalt TEXT NOT NULL,
      diagnose_code TEXT,
      hilfestufe INTEGER,
      modell TEXT,
      tokens_in INTEGER,
      tokens_out INTEGER,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_coach_messages_session
    ON coach_messages (session_id, created_at)
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS coach_usage (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id INTEGER NOT NULL,
      school_id INTEGER,
      usage_date DATE NOT NULL,
      tokens_in INTEGER NOT NULL DEFAULT 0,
      tokens_out INTEGER NOT NULL DEFAULT 0,
      estimated_cost_eur NUMERIC(12, 6) NOT NULL DEFAULT 0,
      message_count INTEGER NOT NULL DEFAULT 0,
      UNIQUE (user_id, usage_date)
    )
  `);
}

export async function purgeOldCoachData(pool) {
  const days = retentionDays();
  await pool.query(
    `
    DELETE FROM coach_sessions
    WHERE created_at < NOW() - make_interval(days => $1::int)
  `,
    [days]
  );
  await pool.query(
    `
    DELETE FROM coach_usage
    WHERE usage_date < (CURRENT_DATE - $1::int)
  `,
    [days]
  );
}

async function accessFor(req, pool) {
  const sessionUser = req.session?.user;
  if (!sessionUser?.id) {
    return { status: 401, body: { enabled: false, message: "Bitte einloggen." } };
  }
  const user = await loadAccount(pool, sessionUser.id);
  if (!user) {
    return { status: 401, body: { enabled: false, message: "Bitte einloggen." } };
  }
  const enabled = isCoachEnabled() && isLoginAllowed(user.name);
  return { user, enabled };
}

function publicReply(sessionId, reply) {
  return {
    sessionId: sessionId || null,
    nachricht: reply.nachricht,
    diagnose_code: reply.diagnose_code,
    hilfestufe: reply.hilfestufe,
    loesung_verraten: false
  };
}

async function previousHelpLevel(pool, sessionId) {
  const res = await pool.query(
    `
    SELECT COALESCE(MAX(hilfestufe), 0) AS stufe
    FROM coach_messages
    WHERE session_id = $1 AND rolle = 'coach'
  `,
    [sessionId]
  );
  return Number(res.rows[0]?.stufe || 0);
}

async function historyForModel(pool, sessionId, hints) {
  const res = await pool.query(
    `
    SELECT rolle, inhalt
    FROM coach_messages
    WHERE session_id = $1
    ORDER BY created_at ASC
    LIMIT 20
  `,
    [sessionId]
  );
  return res.rows.map((row) => ({
    role: row.rolle === "coach" ? "assistant" : "user",
    content: redactForModel(row.inhalt, hints)
  }));
}

async function ensureSession(pool, user, input, goal, levelLabel) {
  if (!input.sessionId) {
    const created = await pool.query(
      `
      INSERT INTO coach_sessions (
        user_id, school_id, schueler_pseudonym, fach, competence_id, level
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id
    `,
      [
        user.id,
        user.schoolId,
        `S${randomBytes(4).toString("hex")}`,
        goal.subject,
        goal.id,
        levelLabel
      ]
    );
    return { id: created.rows[0].id };
  }
  if (!/^[0-9a-f-]{36}$/i.test(input.sessionId)) {
    return { error: "Gespräch nicht gefunden.", status: 404 };
  }
  const found = await pool.query(
    `SELECT id, user_id, competence_id FROM coach_sessions WHERE id = $1`,
    [input.sessionId]
  );
  const row = found.rows[0];
  if (!row || Number(row.user_id) !== Number(user.id)) {
    return { error: "Gespräch nicht gefunden.", status: 404 };
  }
  if (String(row.competence_id) !== String(goal.id)) {
    return { error: "Dieses Gespräch gehört zu einer anderen Kompetenz.", status: 400 };
  }
  return { id: row.id };
}

async function storeTurn(pool, sessionId, studentText, reply, meta) {
  await pool.query(
    `
    INSERT INTO coach_messages (session_id, rolle, inhalt, created_at)
    VALUES ($1, 'schueler', $2, NOW())
  `,
    [sessionId, studentText]
  );
  await pool.query(
    `
    INSERT INTO coach_messages (
      session_id, rolle, inhalt, diagnose_code, hilfestufe, modell, tokens_in, tokens_out, created_at
    )
    VALUES ($1, 'coach', $2, $3, $4, $5, $6, $7, NOW())
  `,
    [
      sessionId,
      reply.nachricht,
      reply.diagnose_code,
      reply.hilfestufe,
      meta.modell,
      meta.tokensIn,
      meta.tokensOut
    ]
  );
}

async function handleStatus(req, res, pool) {
  try {
    const access = await accessFor(req, pool);
    if (access.status) return res.status(access.status).json(access.body);
    if (access.enabled) {
      try {
        await purgeOldCoachData(pool);
      } catch (err) {
        console.error("coach purge:", err.code || "fehler");
      }
    }
    return res.json({ enabled: access.enabled });
  } catch (err) {
    console.error("coach status:", err.code || "fehler");
    return res.status(500).json({ enabled: false });
  }
}

async function handleMessage(req, res, pool, user) {
  const nachricht = redactContacts(String(req.body?.nachricht || "")).trim();
  if (!nachricht) {
    return res.status(400).json({
      nachricht: "Schreib eine kurze Frage oder deine Antwort.",
      diagnose_code: "KEINER",
      hilfestufe: 0,
      loesung_verraten: false
    });
  }
  if (nachricht.length > 4000) {
    return res.status(400).json({
      nachricht: "Das ist zu lang. Schreib es bitte kürzer.",
      diagnose_code: "KEINER",
      hilfestufe: 0,
      loesung_verraten: false
    });
  }

  const loaded = await loadCoachContext(pool, user, {
    ...req.body,
    nachricht
  });
  if (loaded.error) {
    return res.status(loaded.status || 400).json({
      nachricht: loaded.error,
      diagnose_code: "KEINER",
      hilfestufe: 0,
      loesung_verraten: false
    });
  }

  if (!isSubjectEnabled(loaded.goal.subject)) {
    return res.json(
      publicReply(
        null,
        sanitizeReply({
          nachricht: "Der Coach ist gerade nur für Mathe da.",
          diagnose_code: "KEINER",
          hilfestufe: 0
        })
      )
    );
  }

  const limits = await checkCoachLimits(pool, user);
  if (!limits.ok) {
    return res.json(
      publicReply(null, sanitizeReply({ nachricht: limits.nachricht, diagnose_code: "LIMIT", hilfestufe: 0 }))
    );
  }

  const session = await ensureSession(pool, user, loaded.input, loaded.goal, loaded.level.label);
  if (session.error) {
    return res.status(session.status || 400).json({
      nachricht: session.error,
      diagnose_code: "KEINER",
      hilfestufe: 0,
      loesung_verraten: false
    });
  }

  const className = await loadClassName(pool, user.classId, user.schoolId);
  const hints = { name: user.name, className };
  const safeMessage = redactForModel(nachricht, hints);
  const hilfestufe = await previousHelpLevel(pool, session.id);

  let raw;
  let meta = { modell: "mock", tokensIn: 0, tokensOut: 0, modelKind: "fast" };
  if (useMock()) {
    raw = mockReply(safeMessage);
  } else {
    const history = await historyForModel(pool, session.id, hints);
    const system = fillPrompt({
      thema: redactForModel(loaded.goal.thema, hints),
      kompetenz: redactForModel(loaded.goal.goal_text, hints),
      level: `${loaded.level.label}. ${redactForModel(loaded.levelText, hints)}`,
      tagesziel: redactForModel(loaded.tageszielText, hints),
      aufgabe: redactForModel(loaded.input.aufgabe, hints),
      schuelerantwort: redactForModel(loaded.input.schuelerantwort, hints),
      pruefung: "nicht_pruefbar",
      diagnosekarte: "keine Karte hinterlegt",
      hilfestufe
    });
    try {
      const completed = await completeCoach({
        useStrong: hilfestufe === 0 && history.length === 0,
        messages: [{ role: "system", content: system }, ...history, { role: "user", content: safeMessage }]
      });
      raw = completed;
      meta = {
        modell: completed.modell,
        tokensIn: completed.tokensIn,
        tokensOut: completed.tokensOut,
        modelKind: completed.modelKind
      };
    } catch (err) {
      console.error("coach provider:", err?.name === "AbortError" ? "timeout" : "fehler");
      return res.status(503).json({
        sessionId: session.id,
        nachricht: COACH_UNREACHABLE,
        diagnose_code: "KEINER",
        hilfestufe: 0,
        loesung_verraten: false
      });
    }
  }

  const reply = sanitizeReply(raw);
  await storeTurn(pool, session.id, nachricht, reply, meta);
  await recordCoachUsage(pool, user, {
    tokensIn: meta.tokensIn,
    tokensOut: meta.tokensOut,
    costEur: estimateCostEur(meta.modelKind, meta.tokensIn, meta.tokensOut)
  });
  return res.json(publicReply(session.id, reply));
}

export function registerCoachRoutes(app, { pool, isStudent }) {
  app.get("/api/coach/status", (req, res) => {
    handleStatus(req, res, pool);
  });

  app.post(
    "/api/coach/message",
    (req, res, next) => {
      accessFor(req, pool)
        .then((access) => {
          if (access.status) {
            res.status(access.status).json(access.body);
            return;
          }
          if (!access.enabled) {
            res.status(403).json({ enabled: false, message: "Nicht verfügbar." });
            return;
          }
          req.coachUser = access.user;
          next();
        })
        .catch((err) => {
          console.error("coach gate:", err.code || "fehler");
          res.status(503).json({
            nachricht: COACH_UNREACHABLE,
            diagnose_code: "KEINER",
            hilfestufe: 0,
            loesung_verraten: false
          });
        });
    },
    isStudent,
    (req, res) => {
      const user = req.coachUser;
      if (!user || user.role !== "student") {
        res.status(403).json({ enabled: false, message: "Nicht verfügbar." });
        return;
      }
      purgeOldCoachData(pool)
        .catch((err) => {
          console.error("coach purge:", err.code || "fehler");
        })
        .then(() => handleMessage(req, res, pool, user))
        .catch((err) => {
          console.error("coach message:", err.code || "fehler");
          if (!res.headersSent) {
            res.status(503).json({
              nachricht: COACH_UNREACHABLE,
              diagnose_code: "KEINER",
              hilfestufe: 0,
              loesung_verraten: false
            });
          }
        });
    }
  );
}
