/**
 * Digitaler Levelcheck: Termin, x/10, Freigabe, Trainingscenter-Feld.
 * Baut auf level_check_checkpoints auf (Typ levelcheck).
 */

import {
  inferTrainingWzFromGoalText,
  trainingWzForTopicGoal
} from "./training-merge.js";

export const LC_LEVELS = ["rookie", "operator", "street_legend"];
export const LC_LEVEL_API = {
  rookie: "rookie",
  operator: "operator",
  street_legend: "streetLegend"
};
export const LC_LEVEL_FROM_API = {
  rookie: "rookie",
  operator: "operator",
  streetlegend: "street_legend",
  street_legend: "street_legend"
};

export const LC_RESULT_STATUSES = [
  "eingetragen",
  "bestaetigt",
  "nicht_bestanden",
  "nicht_teilgenommen"
];

export const DEFAULT_AUFGABEN = 10;
export const DEFAULT_SCHWELLE = 7;

const TIER_RANK = { rookie: 1, operator: 2, street_legend: 3 };

export function isoDay(value) {
  const date = String(value || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "";
}

export function isTestAccountName(name) {
  return /^T\d+$/i.test(String(name || "").trim());
}

export function normalizeCheckLevel(raw) {
  const key = String(raw || "rookie")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  if (key === "streetlegend" || key === "street_legend") return "street_legend";
  if (key === "operator") return "operator";
  if (key === "rookie") return "rookie";
  return null;
}

export function levelToApi(level) {
  return LC_LEVEL_API[normalizeCheckLevel(level) || "rookie"] || "rookie";
}

export function parseRichtig(raw, aufgaben = DEFAULT_AUFGABEN) {
  if (raw === null || raw === undefined || raw === "") {
    return { ok: true, value: null };
  }
  const n = typeof raw === "number" ? raw : Number(String(raw).trim());
  const max = Math.max(1, Number(aufgaben) || DEFAULT_AUFGABEN);
  if (!Number.isInteger(n) || n < 0 || n > max) {
    return { ok: false, error: `Wert muss eine ganze Zahl zwischen 0 und ${max} sein.` };
  }
  return { ok: true, value: n };
}

export function statusAfterRelease(richtig, schwelle, notTeilgenommen) {
  if (notTeilgenommen) return "nicht_teilgenommen";
  if (richtig == null) return "nicht_teilgenommen";
  const need = Math.max(1, Number(schwelle) || DEFAULT_SCHWELLE);
  return Number(richtig) >= need ? "bestaetigt" : "nicht_bestanden";
}

/**
 * Anzeige-Status für eine Person (Spec-Tabelle).
 * @param {{ date: string, freigegebenAm?: string|null, result?: object|null, today: string }}
 */
export function personDisplayStatus({ date, freigegebenAm, result, today }) {
  const day = isoDay(date);
  const now = isoDay(today) || day;
  if (result?.status === "nicht_teilgenommen") return "nicht_teilgenommen";
  if (freigegebenAm) {
    if (result?.status === "bestaetigt") return "bestaetigt";
    if (result?.status === "nicht_bestanden") return "nicht_bestanden";
    return statusAfterRelease(result?.richtig, result?.schwelle || DEFAULT_SCHWELLE, false);
  }
  if (result && (result.status === "eingetragen" || result.richtig != null)) return "eingetragen";
  if (day && now < day) return "geplant";
  return "offen";
}

export function canStudentEnter(displayStatus) {
  return displayStatus === "offen" || displayStatus === "eingetragen";
}

export function tierSatisfiedByCheck(requiredTier, checkLevel) {
  const need = TIER_RANK[normalizeCheckLevel(requiredTier) || ""] || 0;
  const have = TIER_RANK[normalizeCheckLevel(checkLevel) || ""] || 0;
  return need > 0 && have >= need;
}

/** Status-Werte für die Trainingscenter-API (inkl. Umlaut „bestätigt“). */
export function trainingStatusApi(displayStatus) {
  if (displayStatus === "bestaetigt") return "bestätigt";
  return displayStatus || "offen";
}

/** Training-API Eintrag (exakte Feldnamen). */
export function serializeTrainingLevelcheck(cp, displayStatus, richtig) {
  const freigegeben =
    cp.freigegeben_am || cp.freigegebenAm || cp.bestaetigtAm || null;
  return {
    id: String(cp.id),
    titel: cp.title || cp.titel || "Levelcheck",
    datum: isoDay(cp.date || cp.checkpoint_date || cp.datum),
    level: levelToApi(cp.check_level || cp.level || "rookie"),
    wz: Array.isArray(cp.wz) ? cp.wz.filter(Boolean) : [],
    aufgaben: Number(cp.aufgaben) || DEFAULT_AUFGABEN,
    schwelle: Number(cp.schwelle) || DEFAULT_SCHWELLE,
    status: trainingStatusApi(displayStatus),
    richtig: richtig == null ? null : Number(richtig),
    bestaetigtAm: freigegeben ? isoDay(freigegeben) || String(freigegeben).slice(0, 10) : null
  };
}

export async function migrateLevelcheckDigital(pool) {
  // Einzelne ADD COLUMN IF NOT EXISTS – robuster als ein Multi-ADD auf manchen PG-Versionen.
  for (const [col, typ] of [
    ["title", "TEXT"],
    ["check_level", "TEXT"],
    ["aufgaben", "INTEGER"],
    ["schwelle", "INTEGER"],
    ["freigegeben_am", "TIMESTAMP"],
    ["class_id", "INTEGER"]
  ]) {
    await pool.query(
      `ALTER TABLE level_check_checkpoints ADD COLUMN IF NOT EXISTS ${col} ${typ}`
    );
  }
  await pool.query(`
    UPDATE level_check_checkpoints
    SET check_level = 'rookie'
    WHERE check_level IS NULL AND LOWER(COALESCE(checkpoint_type, '')) = 'levelcheck'
  `);
  await pool.query(`
    UPDATE level_check_checkpoints
    SET aufgaben = ${DEFAULT_AUFGABEN}
    WHERE aufgaben IS NULL AND LOWER(COALESCE(checkpoint_type, '')) = 'levelcheck'
  `);
  await pool.query(`
    UPDATE level_check_checkpoints
    SET schwelle = ${DEFAULT_SCHWELLE}
    WHERE schwelle IS NULL AND LOWER(COALESCE(checkpoint_type, '')) = 'levelcheck'
  `);
  await pool.query(`
    UPDATE level_check_checkpoints cp
    SET class_id = lc.class_id
    FROM level_checks lc
    WHERE cp.level_check_id = lc.id
      AND cp.class_id IS NULL
      AND lc.class_id IS NOT NULL
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS level_check_results (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      school_id INTEGER,
      checkpoint_id UUID NOT NULL REFERENCES level_check_checkpoints(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      richtig INTEGER,
      entered_by TEXT NOT NULL DEFAULT 'student',
      entered_at TIMESTAMP DEFAULT NOW(),
      status TEXT NOT NULL DEFAULT 'eingetragen',
      UNIQUE (checkpoint_id, user_id),
      CHECK (entered_by IN ('student', 'teacher')),
      CHECK (status IN ('eingetragen', 'bestaetigt', 'nicht_bestanden', 'nicht_teilgenommen')),
      CHECK (richtig IS NULL OR richtig >= 0)
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_lc_results_user
    ON level_check_results (user_id, checkpoint_id)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_lc_results_checkpoint
    ON level_check_results (checkpoint_id)
  `);
}

function linkedIds(raw) {
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * Lädt Levelchecks einer Klasse (optional gefiltert auf Thema-IDs).
 */
export async function loadDigitalLevelchecks(pool, { classId, schoolId, topicIds = null, today }) {
  const params = [classId];
  let topicFilter = "";
  if (Array.isArray(topicIds) && topicIds.length) {
    params.push(topicIds);
    topicFilter = `AND cp.level_check_id = ANY($${params.length}::uuid[])`;
  }
  if (schoolId) {
    params.push(schoolId);
    topicFilter += ` AND (cp.school_id = $${params.length} OR lc.school_id = $${params.length})`;
  }
  const r = await pool.query(
    `
    SELECT
      cp.id,
      cp.level_check_id,
      cp.class_id,
      cp.checkpoint_date,
      cp.checkpoint_type,
      cp.linked_subtopic_ids,
      cp.title,
      cp.check_level,
      cp.aufgaben,
      cp.schwelle,
      cp.freigegeben_am,
      lc.name AS topic_name,
      lc.subject AS subject
    FROM level_check_checkpoints cp
    JOIN level_checks lc ON lc.id = cp.level_check_id
    WHERE LOWER(COALESCE(cp.checkpoint_type, '')) = 'levelcheck'
      AND (
        cp.class_id = $1
        OR lc.class_id = $1
        OR EXISTS (
          SELECT 1 FROM class_level_plan_assignments a
          WHERE a.class_id = $1 AND a.catalog_id = lc.catalog_id
        )
      )
      ${topicFilter}
    ORDER BY cp.checkpoint_date ASC, cp.created_at ASC NULLS LAST
  `,
    params
  );

  const cps = r.rows;
  if (!cps.length) return [];

  const goalIds = [...new Set(cps.flatMap((c) => linkedIds(c.linked_subtopic_ids)))];
  let wzByGoal = new Map();
  let textByGoal = new Map();
  if (goalIds.length) {
    const g = await pool.query(
      `
      SELECT id, training_wz, goal_text
      FROM level_check_goals
      WHERE id = ANY($1::uuid[])
    `,
      [goalIds]
    );
    for (const row of g.rows) {
      const stored = row.training_wz ? String(row.training_wz).trim() : "";
      wzByGoal.set(String(row.id), stored || null);
      textByGoal.set(String(row.id), row.goal_text || "");
    }
  }

  const day = isoDay(today) || isoDay(new Date().toISOString());
  return cps.map((cp) => {
    const ids = linkedIds(cp.linked_subtopic_ids);
    const topicName = cp.topic_name || "";
    const wz = ids
      .map((id) => {
        const stored = wzByGoal.get(id);
        if (stored) return stored;
        const text = textByGoal.get(id) || "";
        return (
          trainingWzForTopicGoal(topicName, text) ||
          inferTrainingWzFromGoalText(text) ||
          null
        );
      })
      .filter(Boolean);
    const missionLabels = ids.map((id) => textByGoal.get(id) || id);
    return {
      id: String(cp.id),
      levelCheckId: String(cp.level_check_id),
      classId: cp.class_id ? Number(cp.class_id) : Number(classId),
      date: isoDay(cp.checkpoint_date),
      title: cp.title || `Levelcheck · ${cp.topic_name || "Thema"}`,
      check_level: normalizeCheckLevel(cp.check_level) || "rookie",
      aufgaben: Number(cp.aufgaben) || DEFAULT_AUFGABEN,
      schwelle: Number(cp.schwelle) || DEFAULT_SCHWELLE,
      freigegeben_am: cp.freigegeben_am || null,
      topicName: cp.topic_name || "",
      subject: cp.subject || "",
      linkedGoalIds: ids,
      missionLabels,
      wz,
      today: day
    };
  });
}

export async function loadResultsForCheckpoints(pool, checkpointIds) {
  if (!checkpointIds?.length) return new Map();
  const r = await pool.query(
    `
    SELECT checkpoint_id, user_id, richtig, entered_by, entered_at, status
    FROM level_check_results
    WHERE checkpoint_id = ANY($1::uuid[])
  `,
    [checkpointIds]
  );
  const map = new Map();
  for (const row of r.rows) {
    map.set(`${row.checkpoint_id}|${row.user_id}`, {
      richtig: row.richtig == null ? null : Number(row.richtig),
      entered_by: row.entered_by,
      entered_at: row.entered_at,
      status: row.status
    });
  }
  return map;
}

export function filterVisibleLevelchecks(list, { today, includeReleasedDays = 14 } = {}) {
  const day = isoDay(today) || isoDay(new Date().toISOString());
  const cutoff = new Date(`${day}T12:00:00`);
  cutoff.setDate(cutoff.getDate() - includeReleasedDays);
  const cutIso = isoDay(cutoff.toISOString());
  return (list || []).filter((cp) => {
    if (!cp.freigegeben_am) return true;
    const d = isoDay(cp.date);
    return d >= cutIso;
  });
}

/**
 * Bestätigungs-Set: `${studentId}|${goalId}|${tier}` für freigegebene bestandene LCs.
 * Höheres check_level bestätigt niedrigere Stufen.
 */
export function buildConfirmedFromResults(levelchecks, resultsMap) {
  const set = new Set();
  for (const cp of levelchecks || []) {
    if (!cp.freigegeben_am) continue;
    const level = normalizeCheckLevel(cp.check_level) || "rookie";
    for (const goalId of cp.linkedGoalIds || []) {
      for (const [key, res] of resultsMap || []) {
        if (!String(key).startsWith(`${cp.id}|`)) continue;
        if (res.status !== "bestaetigt") continue;
        const sid = String(key).slice(String(cp.id).length + 1);
        for (const tier of LC_LEVELS) {
          if (tierSatisfiedByCheck(tier, level)) {
            set.add(`${sid}|${goalId}|${tier}`);
          }
        }
      }
    }
  }
  return set;
}

export async function upsertStudentResult(pool, {
  schoolId,
  checkpointId,
  userId,
  richtig,
  enteredBy = "student",
  notTeilgenommen = false
}) {
  const cp = await pool.query(
    `
    SELECT id, aufgaben, schwelle, freigegeben_am, checkpoint_date
    FROM level_check_checkpoints
    WHERE id = $1
    LIMIT 1
  `,
    [checkpointId]
  );
  const row = cp.rows[0];
  if (!row) return { ok: false, error: "not_found", status: 404 };

  const aufgaben = Number(row.aufgaben) || DEFAULT_AUFGABEN;
  const schwelle = Number(row.schwelle) || DEFAULT_SCHWELLE;
  let status = "eingetragen";
  let value = richtig;
  if (notTeilgenommen) {
    status = "nicht_teilgenommen";
    value = null;
  } else {
    const parsed = parseRichtig(richtig, aufgaben);
    if (!parsed.ok) return { ok: false, error: parsed.error, status: 400 };
    value = parsed.value;
    if (row.freigegeben_am) {
      status = statusAfterRelease(value, schwelle, false);
    }
  }

  const ins = await pool.query(
    `
    INSERT INTO level_check_results (
      school_id, checkpoint_id, user_id, richtig, entered_by, entered_at, status
    )
    VALUES ($1, $2, $3, $4, $5, NOW(), $6)
    ON CONFLICT (checkpoint_id, user_id) DO UPDATE SET
      richtig = EXCLUDED.richtig,
      entered_by = EXCLUDED.entered_by,
      entered_at = NOW(),
      status = EXCLUDED.status
    RETURNING *
  `,
    [schoolId || null, checkpointId, userId, value, enteredBy, status]
  );
  return { ok: true, row: ins.rows[0], checkpoint: row };
}

export async function releaseLevelcheck(pool, checkpointId) {
  const cp = await pool.query(
    `
    UPDATE level_check_checkpoints
    SET freigegeben_am = COALESCE(freigegeben_am, NOW())
    WHERE id = $1
    RETURNING *
  `,
    [checkpointId]
  );
  const row = cp.rows[0];
  if (!row) return { ok: false, status: 404 };
  const schwelle = Number(row.schwelle) || DEFAULT_SCHWELLE;
  const results = await pool.query(
    `SELECT id, user_id, richtig, status FROM level_check_results WHERE checkpoint_id = $1`,
    [checkpointId]
  );
  let hits = 0;
  for (const res of results.rows) {
    let next;
    if (res.status === "nicht_teilgenommen" || res.richtig == null) {
      next = "nicht_teilgenommen";
    } else {
      next = statusAfterRelease(res.richtig, schwelle, false);
      if (next === "bestaetigt") hits += 1;
    }
    await pool.query(`UPDATE level_check_results SET status = $1 WHERE id = $2`, [next, res.id]);
  }
  // Schüler ohne Eintrag → nicht_teilgenommen
  const classId = row.class_id;
  if (classId) {
    const missing = await pool.query(
      `
      SELECT u.id, u.name
      FROM users u
      WHERE u.class_id = $1
        AND u.role = 'student'
        AND COALESCE(u.is_active, TRUE) = TRUE
        AND NOT EXISTS (
          SELECT 1 FROM level_check_results r
          WHERE r.checkpoint_id = $2 AND r.user_id = u.id
        )
    `,
      [classId, checkpointId]
    );
    for (const m of missing.rows) {
      if (isTestAccountName(m.name)) continue;
      await pool.query(
        `
        INSERT INTO level_check_results (school_id, checkpoint_id, user_id, richtig, entered_by, status)
        VALUES ($1, $2, $3, NULL, 'teacher', 'nicht_teilgenommen')
        ON CONFLICT (checkpoint_id, user_id) DO NOTHING
      `,
        [row.school_id, checkpointId, m.id]
      );
    }
  }
  const missionCount = linkedIds(row.linked_subtopic_ids).length;
  const treffer = hits * Math.max(1, missionCount);
  return { ok: true, checkpoint: row, enteredPassed: hits, treffer, missionCount };
}
