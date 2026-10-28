/**
 * Logic Coach.
 * Kachel, Knöpfe und Antworten nur, wenn COACH_ENABLED=true und AI_API_KEY gesetzt ist.
 */
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { randomBytes } from "crypto";
import { formatDiagnosekarte, loadDiagnosekarte } from "./coach-cards.js";
import { loadCoachContext } from "./coach-context.js";
import {
  checkCoachLimits,
  estimateCostEur,
  hasAiApiKey,
  isCoachAvailable,
  isSubjectEnabled,
  recordCoachUsage,
  retentionDays
} from "./coach-limits.js";
import { checkStudentMath, formatPruefung, gradeAnswer } from "./coach-math.js";
import { redactContacts, redactForModel } from "./coach-privacy.js";
import { completeCoach, logCoachFailure, unreachablePayload } from "./coach-provider.js";
import {
  ZWI_HINT,
  backToOriginal,
  composeZwischen,
  isDenkfehler,
  nextCoachStep,
  repairImeGlitch,
  statusPrompt,
  verifiedZwischenaufgabe
} from "./coach-turn.js";

const promptPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../coach/prompts/system_mathe.md"
);
const systemTemplate = readFileSync(promptPath, "utf8");

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

async function ensureColumn(pool, table, col, type) {
  if (table !== "coach_messages" || !/^[a-z_]+$/.test(col)) {
    throw new Error("coach-spalte");
  }
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'coach_messages' AND column_name = '${col}'
      ) THEN
        ALTER TABLE coach_messages ADD COLUMN ${col} ${type};
      END IF;
    END$$;
  `);
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
      ist_zwischenaufgabe BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await ensureColumn(
    pool,
    "coach_messages",
    "ist_zwischenaufgabe",
    "BOOLEAN NOT NULL DEFAULT FALSE"
  );
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
  if (user.role !== "student") return { user, enabled: false };
  return { user, enabled: isCoachAvailable() };
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
    WHERE session_id = $1 AND rolle IN ('schueler', 'coach')
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

async function storeCoachOnly(pool, sessionId, reply, meta, flags = {}) {
  await pool.query(
    `
    INSERT INTO coach_messages (
      session_id, rolle, inhalt, diagnose_code, hilfestufe, modell,
      tokens_in, tokens_out, ist_zwischenaufgabe, created_at
    )
    VALUES ($1, 'coach', $2, $3, $4, $5, $6, $7, $8, NOW())
  `,
    [
      sessionId,
      reply.nachricht,
      reply.diagnose_code,
      reply.hilfestufe,
      meta.modell || null,
      meta.tokensIn || 0,
      meta.tokensOut || 0,
      flags.istZwischenaufgabe === true
    ]
  );
  if (flags.erwarteteLoesung) {
    await pool.query(
      `
      INSERT INTO coach_messages (session_id, rolle, inhalt, created_at)
      VALUES ($1, 'loesung', $2, NOW())
    `,
      [sessionId, redactContacts(String(flags.erwarteteLoesung)).slice(0, 120)]
    );
  }
}

async function storeTurn(pool, sessionId, studentText, reply, meta, flags) {
  await pool.query(
    `
    INSERT INTO coach_messages (session_id, rolle, inhalt, created_at)
    VALUES ($1, 'schueler', $2, NOW())
  `,
    [sessionId, studentText]
  );
  await storeCoachOnly(pool, sessionId, reply, meta, flags);
}

function levelKeyFromLabel(label) {
  const value = String(label || "").toLowerCase();
  if (value.includes("legend")) return "street_legend";
  if (value.includes("operator")) return "operator";
  if (value.includes("rookie")) return "rookie";
  return "";
}

async function ownedSession(pool, user, sessionId) {
  if (!sessionId) return null;
  if (!/^[0-9a-f-]{36}$/i.test(sessionId)) {
    return { error: "Gespräch nicht gefunden.", status: 404 };
  }
  const found = await pool.query(
    `SELECT id, user_id, competence_id, level FROM coach_sessions WHERE id = $1`,
    [sessionId]
  );
  const row = found.rows[0];
  if (!row || Number(row.user_id) !== Number(user.id)) {
    return { error: "Gespräch nicht gefunden.", status: 404 };
  }
  return {
    id: row.id,
    competenceId: String(row.competence_id),
    levelKey: levelKeyFromLabel(row.level)
  };
}

async function trailingZwischen(pool, sessionId) {
  const res = await pool.query(
    `
    SELECT ist_zwischenaufgabe
    FROM coach_messages
    WHERE session_id = $1 AND rolle = 'coach'
    ORDER BY created_at DESC
    LIMIT 8
  `,
    [sessionId]
  );
  let count = 0;
  for (const row of res.rows) {
    if (row.ist_zwischenaufgabe === true) count += 1;
    else break;
  }
  return count;
}

async function latestSolution(pool, sessionId) {
  const res = await pool.query(
    `
    SELECT inhalt
    FROM coach_messages
    WHERE session_id = $1 AND rolle = 'loesung'
    ORDER BY created_at DESC
    LIMIT 1
  `,
    [sessionId]
  );
  return String(res.rows[0]?.inhalt || "");
}

async function originalQuestion(pool, sessionId) {
  const res = await pool.query(
    `
    SELECT inhalt
    FROM coach_messages
    WHERE session_id = $1 AND rolle = 'coach' AND COALESCE(ist_zwischenaufgabe, FALSE) = FALSE
    ORDER BY created_at ASC
    LIMIT 1
  `,
    [sessionId]
  );
  return String(res.rows[0]?.inhalt || "");
}

function buildSystem(loaded, hints, extra) {
  return fillPrompt({
    thema: redactForModel(loaded.goal.thema, hints),
    kompetenz: redactForModel(loaded.goal.goal_text, hints),
    level: loaded.level.label,
    levelbeschreibung: redactForModel(loaded.levelbeschreibung, hints),
    status: statusPrompt(loaded.markStatus),
    tagesziel: redactForModel(loaded.tageszielText, hints),
    aufgabe: redactForModel(extra.aufgabe || "", hints),
    schuelerantwort: redactForModel(extra.schuelerantwort || "", hints),
    pruefung: extra.pruefung || "nicht_pruefbar",
    diagnosekarte: redactForModel(extra.karte || "", hints),
    hilfestufe: extra.hilfestufe ?? 0,
    zwischenfolge: String(extra.zwischenfolge ?? 0),
    ursprungsfrage: redactForModel(extra.ursprung || "noch keine", hints) || "noch keine"
  });
}

async function rememberUsage(pool, user, meta) {
  try {
    await recordCoachUsage(pool, user, {
      tokensIn: meta?.tokensIn || 0,
      tokensOut: meta?.tokensOut || 0,
      costEur: estimateCostEur(meta?.modelKind, meta?.tokensIn || 0, meta?.tokensOut || 0)
    });
  } catch (err) {
    console.error("coach usage:", err.code || "fehler");
  }
}

const ZWI_RETRY =
  "Die Zwischenaufgabe war nicht prüfbar. Gib eine neue, kleinere Aufgabe als JSON. aufgabe ist ein Ausdruck wie 2*3 oder 2^3, loesung das Ergebnis. anzeige ist der Satz für den Schüler ohne Ergebnis. nachricht bleibt die Diagnose, ohne Frage und ohne Ergebnis. denkfehler ist true.";

async function handleStatus(req, res, pool) {
  try {
    const access = await accessFor(req, pool);
    if (access.status || !access.user) return res.json({ enabled: false });
    if (access.enabled) {
      try {
        await purgeOldCoachData(pool);
      } catch (err) {
        console.error("coach purge:", err.code || "fehler");
      }
    }
    return res.json({ enabled: access.enabled === true });
  } catch (err) {
    console.error("coach status:", err.code || "fehler");
    return res.json({ enabled: false });
  }
}

function coachFail(res, status, nachricht) {
  return res.status(status).json({
    nachricht,
    diagnose_code: "KEINER",
    hilfestufe: 0,
    loesung_verraten: false
  });
}

function providerMeta(completed) {
  return {
    modell: completed.modell,
    tokensIn: completed.tokensIn,
    tokensOut: completed.tokensOut,
    modelKind: completed.modelKind
  };
}

async function handleStart(req, res, pool, user) {
  const loaded = await loadCoachContext(pool, user, {
    competenceId: req.body?.competenceId,
    level: req.body?.level,
    kontext: req.body?.kontext
  });
  if (loaded.error) return coachFail(res, loaded.status || 400, loaded.error);
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
  if (!hasAiApiKey()) return res.status(403).json({ enabled: false });

  const className = await loadClassName(pool, user.classId, user.schoolId);
  const hints = { name: user.name, className };
  const karte = formatDiagnosekarte(loadDiagnosekarte(loaded.goal.id));
  const variante = 1 + Math.floor(Math.random() * 6);
  const system = buildSystem(loaded, hints, {
    pruefung: "nicht_pruefbar",
    karte,
    hilfestufe: 0,
    zwischenfolge: 0,
    ursprung: "noch keine"
  });

  let completed;
  try {
    completed = await completeCoach({
      useStrong: true,
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: `Gesprächsstart. Variante ${variante}. Der Schüler hat noch nichts geschrieben.`
        }
      ]
    });
  } catch (err) {
    logCoachFailure("ki", err);
    return res.status(503).json(unreachablePayload(err));
  }

  const reply = sanitizeReply(completed);
  reply.nachricht = repairImeGlitch(reply.nachricht);
  const session = await ensureSession(pool, user, { sessionId: "" }, loaded.goal, loaded.level.label);
  if (session.error) return coachFail(res, session.status || 400, session.error);
  const meta = providerMeta(completed);
  await storeCoachOnly(pool, session.id, reply, meta, { istZwischenaufgabe: false });
  await rememberUsage(pool, user, meta);
  return res.json(publicReply(session.id, reply));
}

async function handleMessage(req, res, pool, user) {
  const nachricht = redactContacts(String(req.body?.nachricht || "")).trim();
  if (!nachricht) {
    return coachFail(res, 400, "Schreib eine kurze Frage oder deine Antwort.");
  }
  if (nachricht.length > 4000) {
    return coachFail(res, 400, "Das ist zu lang. Schreib es bitte kürzer.");
  }

  const prior = await ownedSession(pool, user, String(req.body?.sessionId || "").trim());
  if (prior?.error) return coachFail(res, prior.status || 404, prior.error);

  const body = { ...req.body, nachricht };
  if (prior?.competenceId || prior?.levelKey) {
    const kontext =
      body.kontext && typeof body.kontext === "object" ? { ...body.kontext } : {};
    if (prior.competenceId) {
      body.competenceId = prior.competenceId;
      kontext.competenceId = prior.competenceId;
    }
    if (prior.levelKey) {
      body.level = prior.levelKey;
      kontext.level = prior.levelKey;
    }
    body.kontext = kontext;
  }

  const loaded = await loadCoachContext(pool, user, body);
  if (loaded.error) return coachFail(res, loaded.status || 400, loaded.error);

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
  if (session.error) return coachFail(res, session.status || 400, session.error);

  const className = await loadClassName(pool, user.classId, user.schoolId);
  const hints = { name: user.name, className };
  const safeMessage = redactForModel(nachricht, hints);
  const hilfestufe = await previousHelpLevel(pool, session.id);
  const trailing = await trailingZwischen(pool, session.id);
  const pendingZwischen = trailing > 0;
  let checked;
  try {
    checked = pendingZwischen
      ? gradeAnswer(await latestSolution(pool, session.id), nachricht)
      : checkStudentMath({
          aufgabe: loaded.input.aufgabe,
          schuelerantwort: loaded.input.schuelerantwort || nachricht,
          nachricht
        });
  } catch (err) {
    err.coachStep = "mathe";
    throw err;
  }
  const pruefung = formatPruefung(checked);
  let step = nextCoachStep({
    pruefung: checked.status,
    denkfehler: false,
    trailing,
    pendingZwischen
  });

  if (step === "zurueck" || step === "hinweis") {
    const text =
      step === "zurueck" ? backToOriginal(await originalQuestion(pool, session.id)) : ZWI_HINT;
    const reply = sanitizeReply({ nachricht: text, diagnose_code: "KEINER", hilfestufe });
    reply.nachricht = repairImeGlitch(reply.nachricht);
    const meta = { modell: null, tokensIn: 0, tokensOut: 0, modelKind: "fast" };
    await storeTurn(pool, session.id, nachricht, reply, meta, { istZwischenaufgabe: false });
    await rememberUsage(pool, user, meta);
    return res.json(publicReply(session.id, reply));
  }

  if (!hasAiApiKey()) return res.status(403).json({ enabled: false });

  const history = await historyForModel(pool, session.id, hints);
  const karte = formatDiagnosekarte(loadDiagnosekarte(loaded.goal.id));
  const ursprung = await originalQuestion(pool, session.id);
  const system = buildSystem(loaded, hints, {
    aufgabe: loaded.input.aufgabe,
    schuelerantwort: loaded.input.schuelerantwort || nachricht,
    pruefung,
    karte,
    hilfestufe,
    zwischenfolge: trailing,
    ursprung: ursprung || "noch keine"
  });
  const messages = [{ role: "system", content: system }, ...history, { role: "user", content: safeMessage }];

  let raw;
  let meta;
  try {
    raw = await completeCoach({
      useStrong: step === "zwischen" || (hilfestufe === 0 && history.length === 0),
      messages
    });
    meta = providerMeta(raw);
  } catch (err) {
    logCoachFailure("ki", err);
    return res.status(503).json(unreachablePayload(err, { sessionId: session.id }));
  }
  await rememberUsage(pool, user, meta);

  if (checked.status !== "falsch") {
    step = nextCoachStep({
      pruefung: checked.status,
      denkfehler: isDenkfehler(raw),
      trailing,
      pendingZwischen
    });
  }

  let reply = sanitizeReply(raw);
  let flags = { istZwischenaufgabe: false };
  if (step === "zurueck") {
    reply = sanitizeReply({
      nachricht: backToOriginal(ursprung),
      diagnose_code: "KEINER",
      hilfestufe: raw.hilfestufe
    });
  } else if (step === "hinweis") {
    reply = sanitizeReply({
      nachricht: ZWI_HINT,
      diagnose_code: raw.diagnose_code,
      hilfestufe: raw.hilfestufe
    });
  } else if (step === "zwischen") {
    let task = verifiedZwischenaufgabe(raw);
    if (!task) {
      try {
        const again = await completeCoach({
          useStrong: true,
          messages: [...messages, { role: "user", content: ZWI_RETRY }]
        });
        const againMeta = providerMeta(again);
        await rememberUsage(pool, user, againMeta);
        task = verifiedZwischenaufgabe(again);
        if (task) meta = againMeta;
      } catch (err) {
        logCoachFailure("zwischen", err);
      }
    }
    if (task) {
      reply.nachricht = composeZwischen(reply.nachricht, task).slice(0, 2000);
      flags = { istZwischenaufgabe: true, erwarteteLoesung: task.loesung };
    }
  }
  reply.nachricht = repairImeGlitch(reply.nachricht);
  try {
    await storeTurn(pool, session.id, nachricht, reply, meta, flags);
  } catch (err) {
    err.coachStep = "speichern";
    throw err;
  }
  return res.json(publicReply(session.id, reply));
}

export function registerCoachRoutes(app, { pool, isStudent }) {
  app.get("/api/coach/status", (req, res) => {
    handleStatus(req, res, pool);
  });

  function guard(req, res, next) {
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
        logCoachFailure("gate", err);
        if (!res.headersSent) res.status(503).json(unreachablePayload(err));
      });
  }

  function studentCall(handler) {
    return (req, res) => {
      const user = req.coachUser;
      if (!user || user.role !== "student") {
        res.status(403).json({ enabled: false, message: "Nicht verfügbar." });
        return;
      }
      purgeOldCoachData(pool)
        .catch((err) => {
          console.error("coach purge:", err.code || "fehler");
        })
        .then(() => handler(req, res, pool, user))
        .catch((err) => {
          logCoachFailure(err?.coachStep || "anfrage", err);
          if (!res.headersSent) res.status(503).json(unreachablePayload(err));
        });
    };
  }

  app.post("/api/coach/start", guard, isStudent, studentCall(handleStart));
  app.post("/api/coach/message", guard, isStudent, studentCall(handleMessage));
}
