/**
 * Lehrer-Cockpit und Klassen-Spiel.
 * Liest die vorhandenen Tabellen. Neu sind nur Klassen-Mission, Glücks-Ziehung und Team des Tages.
 * XP laufen ausschließlich über deps.awardXp (users.xp + xp_transactions + Rang).
 */
import crypto from "node:crypto";
import { teacherCanAccessClass } from "./teacher-auth.js";
import { displayNameFromUser } from "./group-mode.js";
import {
  MARK_TIERS,
  TIER_LABEL,
  GAME_XP_OPTIONS,
  DEFAULT_GAME_XP,
  classMissionProgress,
  classMissionDone,
  classMissionTitle,
  filterGradeRules,
  ghostDone,
  isoDay,
  lessonsUntil,
  normalizeGameXp,
  paceStatus,
  paceText,
  pickCheck,
  pickWinner,
  planTarget,
  rankCatchUpLeaders,
  rankProgressLeaders,
  resolveClassLevels,
  studentPosition,
  teamStats,
  trainingBoard,
  unitTimeline,
  weekStart,
  wrapStatusForLevels,
  addDays,
  TRAINING_KEY
} from "./teacher-cockpit.js";
import { loadCockpitMaps } from "./cockpit-map-load.js";
import { buildSeasonPayload, assessmentFromSicherMarks } from "./cockpit-season-payload.js";
import { CONFIG as COCKPIT_SEASON_CONFIG } from "./cockpit-config.js";
import {
  buildRafflePot,
  raffleTicketCount,
  learningDaysThisWeek,
  weekBoundsBerlin
} from "./cockpit-season.js";
import { drawCrews, seasonKeyFor } from "./cockpit-crews.js";
import { recordCockpitEvent, sideQuestProgressFromEvents } from "./cockpit-events.js";

export const XP_SOURCE_RAFFLE = "klassenspiel_ziehung";
export const XP_SOURCE_TEAM = "klassenspiel_team";
export const XP_SOURCE_BOSS = "klassenspiel_boss";
export const XP_SOURCE_SIDE_QUEST = "klassenspiel_side_quest";

/** Tag im Jahr (1–366) für Side-Quest-Rotation. */
export function dayOfYearFromIso(iso) {
  const d = new Date(`${String(iso || "").slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return 0;
  const start = new Date(d.getFullYear(), 0, 0);
  return Math.floor((d - start) / 86400000);
}

/** Nächste Vorlage per Tag-des-Jahres % Templates (deterministisch, ohne Speicher). */
export function pickSideQuestTemplate(templates, dayIso) {
  const list = Array.isArray(templates) ? templates : [];
  if (!list.length) return null;
  return list[dayOfYearFromIso(dayIso) % list.length];
}

async function ensureCockpitColumn(pool, table, col, typeSql) {
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = '${table}' AND column_name = '${col}'
      ) THEN
        ALTER TABLE ${table} ADD COLUMN ${col} ${typeSql};
      END IF;
    END$$;
  `);
}

export async function migrateCockpitTables(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS class_learning_missions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      school_id INTEGER,
      class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      level_check_id UUID,
      title TEXT NOT NULL,
      goal_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
      mission_numbers JSONB NOT NULL DEFAULT '[]'::jsonb,
      tier TEXT NOT NULL DEFAULT 'rookie',
      due_date DATE,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_by INTEGER,
      created_at TIMESTAMP DEFAULT NOW(),
      closed_at TIMESTAMP
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_class_learning_missions_class
    ON class_learning_missions (class_id, active, created_at DESC)
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS class_raffle_draws (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      school_id INTEGER,
      class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      draw_date DATE NOT NULL,
      winner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      eligible_count INTEGER NOT NULL DEFAULT 0,
      xp INTEGER NOT NULL DEFAULT 0,
      drawn_by INTEGER,
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE (class_id, draw_date)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS class_team_awards (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      school_id INTEGER,
      class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      award_date DATE NOT NULL,
      roster_id UUID,
      group_name TEXT,
      subject TEXT,
      member_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
      member_count INTEGER NOT NULL DEFAULT 0,
      reflected_count INTEGER NOT NULL DEFAULT 0,
      goal_reached BOOLEAN NOT NULL DEFAULT FALSE,
      xp_each INTEGER NOT NULL DEFAULT 0,
      confirmed_by INTEGER,
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE (class_id, award_date)
    )
  `);

  // —— Stufe 2 (nur additiv) ——
  await ensureCockpitColumn(pool, "class_learning_missions", "loot_xp", "INT");
  await ensureCockpitColumn(pool, "class_learning_missions", "loot_text", "TEXT");
  await ensureCockpitColumn(pool, "class_learning_missions", "boss_won_at", "TIMESTAMP");
  await ensureCockpitColumn(pool, "users", "beamer_name_ok", "BOOLEAN DEFAULT FALSE");
  await ensureCockpitColumn(pool, "teacher_coaching_state", "helped_by_kind", "TEXT");
  await ensureCockpitColumn(pool, "teacher_coaching_state", "helped_by_student_id", "INT");
  await ensureCockpitColumn(pool, "teacher_coaching_state", "help_closed_at", "TIMESTAMP");

  await pool.query(`
    CREATE TABLE IF NOT EXISTS crews (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      school_id INTEGER,
      class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      season_key TEXT NOT NULL,
      name TEXT,
      color TEXT,
      tag_text TEXT,
      released BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_crews_class_season
    ON crews (class_id, season_key, created_at DESC)
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS crew_members (
      crew_id UUID NOT NULL REFERENCES crews(id) ON DELETE CASCADE,
      student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      PRIMARY KEY (crew_id, student_id)
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_crew_members_student
    ON crew_members (student_id)
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS crew_avoid_pairs (
      class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      student_a INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      student_b INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      PRIMARY KEY (class_id, student_a, student_b),
      CHECK (student_a < student_b)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS cockpit_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      school_id INTEGER,
      class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      student_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      typ TEXT NOT NULL,
      data JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_cockpit_events_class_created
    ON cockpit_events (class_id, created_at DESC)
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS side_quests (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      school_id INTEGER,
      class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      quest_date DATE NOT NULL,
      typ TEXT NOT NULL,
      text TEXT NOT NULL,
      ziel INT NOT NULL DEFAULT 1,
      xp INT NOT NULL DEFAULT 0,
      progress INT NOT NULL DEFAULT 0,
      done BOOLEAN NOT NULL DEFAULT FALSE,
      UNIQUE (class_id, quest_date)
    )
  `);
  await ensureCockpitColumn(pool, "side_quests", "xp_awarded", "BOOLEAN NOT NULL DEFAULT FALSE");
}

export function registerTeacherCockpitRoutes(app, deps) {
  const {
    pool,
    isTeacher,
    isStudent,
    getLevelChecksForClass,
    getGradeRequirements,
    resolveSchoolDate,
    todayIsoDate,
    awardXp,
    getClassTotalXP,
    publicImageUrl,
    randomInt = (n) => crypto.randomInt(n)
  } = deps;

  function avatarFrom(raw) {
    if (!raw) return null;
    return publicImageUrl ? publicImageUrl(raw) : raw;
  }

  async function today(req) {
    return (await resolveSchoolDate?.(req, null)) || todayIsoDate?.() || isoDay(new Date());
  }

  async function insertSideQuestRow(schoolId, classId, day, tpl, studentCount) {
    const ziel = tpl.ziel === "class" ? studentCount : Number(tpl.ziel) || 1;
    const text = String(tpl.text || "").trim().slice(0, 240);
    const xp = Number(tpl.xp) || 0;
    const r = await pool.query(
      `
      INSERT INTO side_quests (school_id, class_id, quest_date, typ, text, ziel, xp, progress, done)
      VALUES ($1, $2, $3::date, $4, $5, $6, $7, 0, FALSE)
      ON CONFLICT (class_id, quest_date) DO NOTHING
      RETURNING *
    `,
      [schoolId, classId, day, tpl.typ, text, ziel, xp]
    );
    if (r.rows[0]) return r.rows[0];
    const again = await pool.query(
      `SELECT * FROM side_quests WHERE class_id = $1 AND quest_date = $2::date LIMIT 1`,
      [classId, day]
    );
    return again.rows[0] || null;
  }

  /** Vorhandene Quest laden; fehlt sie, automatisch nächste Vorlage setzen. */
  async function loadOrAutoSideQuest(schoolId, classId, day, studentCount) {
    const existing = await pool.query(
      `SELECT * FROM side_quests WHERE class_id = $1 AND quest_date = $2::date LIMIT 1`,
      [classId, day]
    );
    if (existing.rows[0]) return { row: existing.rows[0], auto: false };
    const tpl = pickSideQuestTemplate(COCKPIT_SEASON_CONFIG.sideQuestTemplates, day);
    if (!tpl) return { row: null, auto: false };
    const row = await insertSideQuestRow(schoolId, classId, day, tpl, studentCount);
    return { row, auto: Boolean(row) };
  }

  function mapSideQuestRow(row, auto = false) {
    if (!row) return null;
    return {
      id: row.id,
      date: isoDay(row.quest_date),
      typ: row.typ,
      text: row.text,
      ziel: Number(row.ziel),
      xp: Number(row.xp) || 0,
      progress: Number(row.progress) || 0,
      done: row.done === true,
      auto: auto === true
    };
  }

  async function guardClass(req, res, classId) {
    if (!classId || !(await teacherCanAccessClass(pool, req.session.user, classId))) {
      res.status(403).json({ success: false, message: "Kein Zugriff auf diese Klasse." });
      return false;
    }
    return true;
  }

  async function classStudents(classId, schoolId) {
    const r = await pool.query(
      `
      SELECT
        u.id,
        u.name,
        COALESCE(u.xp, 0) AS xp,
        l.name AS rang,
        ch.image_url AS character_image,
        ch.name AS character_name
      FROM users u
      LEFT JOIN levels l ON l.id = u.level_id
      LEFT JOIN characters ch ON ch.id = u.character_id
      WHERE u.role = 'student'
        AND u.class_id = $1
        AND u.school_id = $2
        AND COALESCE(u.is_active, TRUE) = TRUE
      ORDER BY u.name ASC
    `,
      [classId, schoolId]
    );
    return r.rows.map((row) => ({
      id: Number(row.id),
      name: row.name,
      shortName: displayNameFromUser(row.name) || row.name,
      xp: Number(row.xp) || 0,
      rang: row.rang || null,
      avatarUrl: avatarFrom(row.character_image),
      characterName: row.character_name || null
    }));
  }

  /** Beamer-Wand: wer heute geplant hat + Schnellste (früher Tagesabschluss). */
  async function beamerExtras(studentIds, day, students) {
    const empty = {
      plannedIds: [],
      reflectedIds: [],
      plannedCount: 0,
      reflectedCount: 0,
      fastest: [],
      xpLeaders: []
    };
    if (!studentIds.length) return empty;
    const byId = new Map(students.map((s) => [Number(s.id), s]));
    const [plannedRes, fastRes, xpRes] = await Promise.all([
      pool.query(
        `
        SELECT DISTINCT user_id
        FROM log_entries
        WHERE user_id = ANY($1::int[])
          AND date = $2::date
          AND COALESCE(entry_kind, 'lesson') = 'lesson'
      `,
        [studentIds, day]
      ),
      pool.query(
        `
        SELECT le.user_id, MIN(lr.created_at) AS finished_at
        FROM log_entries le
        JOIN log_reflections lr ON lr.log_entry_id = le.id
        WHERE le.user_id = ANY($1::int[])
          AND le.date = $2::date
          AND COALESCE(le.entry_kind, 'lesson') = 'lesson'
        GROUP BY le.user_id
        ORDER BY finished_at ASC
        LIMIT 5
      `,
        [studentIds, day]
      ),
      pool.query(
        `
        SELECT student_id, COALESCE(SUM(amount), 0)::int AS xp
        FROM xp_transactions
        WHERE student_id = ANY($1::int[])
          AND amount > 0
          AND created_at::date = $2::date
        GROUP BY student_id
        ORDER BY xp DESC, student_id ASC
        LIMIT 5
      `,
        [studentIds, day]
      )
    ]);
    const plannedIds = plannedRes.rows.map((r) => Number(r.user_id));
    const mapStudent = (id, extra = {}) => {
      const s = byId.get(Number(id));
      return {
        id: Number(id),
        name: s?.shortName || displayNameFromUser(s?.name) || "Schüler:in",
        avatarUrl: s?.avatarUrl || null,
        characterName: s?.characterName || null,
        ...extra
      };
    };
    return {
      plannedIds,
      reflectedIds: fastRes.rows.map((r) => Number(r.user_id)),
      plannedCount: plannedIds.length,
      reflectedCount: fastRes.rows.length,
      fastest: fastRes.rows.map((r, i) =>
        mapStudent(r.user_id, {
          rank: i + 1,
          finishedAt: r.finished_at
        })
      ),
      xpLeaders: xpRes.rows.map((r, i) =>
        mapStudent(r.student_id, {
          rank: i + 1,
          xpToday: Number(r.xp) || 0
        })
      )
    };
  }

  /** Tagesabschluss heute: Reflexion im Logbuch oder im Gruppenmodus. */
  async function reflectedToday(studentIds, day) {
    if (!studentIds.length) return new Set();
    const r = await pool.query(
      `
      SELECT DISTINCT le.user_id AS id
      FROM log_entries le
      JOIN log_reflections lr ON lr.log_entry_id = le.id
      WHERE le.user_id = ANY($1::int[]) AND le.date = $2::date
      UNION
      SELECT DISTINCT m.user_id AS id
      FROM group_session_members m
      JOIN group_sessions gs ON gs.id = m.session_id
      WHERE m.user_id = ANY($1::int[])
        AND gs.session_date = $2::date
        AND m.reflection_at IS NOT NULL
    `,
      [studentIds, day]
    );
    return new Set(r.rows.map((row) => Number(row.id)));
  }

  /**
   * Lose für die Glücks-Ziehung:
   * +1 geplant heute, +1 reflektiert heute, +2 gut eingeschätzt (7 Tage bestätigt+gemeldet),
   * +1 je Peer-Hilfe heute (max +2), höchstens maxPerPerson Lose.
   */
  async function loadRaffleTicketState(studentIds, day, classId) {
    const empty = {
      ticketsByStudent: [],
      ticketsById: new Map(),
      pot: [],
      eligibleCount: 0,
      ticketTotal: 0,
      studentsWithTickets: 0,
      reflected: new Set(),
      planned: new Set()
    };
    if (!studentIds.length) return empty;
    const since7 = addDays(day, -6);
    const [plannedRes, reflected, gutMarksRes, helpRes, proofRes, trainRes] = await Promise.all([
      pool.query(
        `
        SELECT DISTINCT user_id
        FROM log_entries
        WHERE user_id = ANY($1::int[])
          AND date = $2::date
          AND COALESCE(entry_kind, 'lesson') = 'lesson'
      `,
        [studentIds, day]
      ),
      reflectedToday(studentIds, day),
      pool.query(
        `
        SELECT user_id, tier
        FROM level_check_marks
        WHERE user_id = ANY($1::int[])
          AND status = 'sicher'
          AND updated_at::date >= $2::date
          AND updated_at::date <= $3::date
      `,
        [studentIds, since7, day]
      ),
      pool.query(
        `
        SELECT helped_by_student_id AS id, COUNT(*)::int AS n
        FROM teacher_coaching_state
        WHERE class_id = $1
          AND coaching_date = $2::date
          AND helped_by_kind = 'peer'
          AND helped_by_student_id IS NOT NULL
        GROUP BY helped_by_student_id
      `,
        [classId, day]
      ),
      pool.query(
        `
        SELECT DISTINCT user_id, tier
        FROM level_check_proofs
        WHERE user_id = ANY($1::int[])
      `,
        [studentIds]
      ),
      pool.query(
        `
        SELECT student_id, merged
        FROM training_results
        WHERE student_id = ANY($1::int[])
      `,
        [studentIds]
      )
    ]);
    const planned = new Set(plannedRes.rows.map((r) => Number(r.user_id)));
    const proofSet = new Set(proofRes.rows.map((r) => `${Number(r.user_id)}|${r.tier}`));
    const trainingSafeByStudent = new Map();
    for (const row of trainRes.rows || []) {
      const sid = Number(row.student_id);
      const merged = typeof row.merged === "string" ? JSON.parse(row.merged) : row.merged;
      let set = trainingSafeByStudent.get(sid);
      if (!set) {
        set = new Set();
        trainingSafeByStudent.set(sid, set);
      }
      for (const [tier, key] of Object.entries(TRAINING_KEY)) {
        if (!key) continue;
        if (merged?.levels?.[key]?.safe === true) set.add(tier);
      }
    }
    const gut = new Set();
    for (const row of gutMarksRes.rows || []) {
      const sid = Number(row.user_id);
      const tier = row.tier;
      const confirmed =
        proofSet.has(`${sid}|${tier}`) || (trainingSafeByStudent.get(sid)?.has(tier) === true);
      if (confirmed) gut.add(sid);
    }
    const helpedTodayByStudent = new Map();
    for (const row of helpRes.rows || []) {
      const sid = Number(row.id);
      if (!Number.isFinite(sid)) continue;
      helpedTodayByStudent.set(sid, Number(row.n) || 0);
    }
    const ticketsByStudent = studentIds.map((id) => {
      const sid = Number(id);
      const tickets = raffleTicketCount({
        plannedToday: planned.has(sid),
        reflectedToday: reflected.has(sid),
        gutEingeschätzt7d: gut.has(sid),
        helpedTodayCount: helpedTodayByStudent.get(sid) || 0,
        config: COCKPIT_SEASON_CONFIG
      });
      return { id: sid, tickets };
    });
    const ticketsById = new Map(ticketsByStudent.map((row) => [row.id, row.tickets]));
    const pot = buildRafflePot(ticketsByStudent);
    const studentsWithTickets = ticketsByStudent.filter((row) => row.tickets >= 1).length;
    const ticketTotal = pot.length;
    return {
      ticketsByStudent,
      ticketsById,
      pot,
      eligibleCount: studentsWithTickets,
      ticketTotal,
      studentsWithTickets,
      reflected,
      planned
    };
  }

  async function marksFor(studentIds, goalIds) {
    if (!studentIds.length || !goalIds.length) return new Map();
    const r = await pool.query(
      `
      SELECT user_id, goal_id, tier, status, updated_at
      FROM level_check_marks
      WHERE user_id = ANY($1::int[]) AND goal_id = ANY($2::uuid[])
    `,
      [studentIds, goalIds]
    );
    const map = new Map();
    for (const row of r.rows) {
      map.set(`${Number(row.user_id)}|${row.goal_id}|${row.tier}`, row);
    }
    return map;
  }

  async function newSicherToday(studentIds, day, goalIds = null) {
    if (!studentIds.length) return new Map();
    const scoped = Array.isArray(goalIds) && goalIds.length > 0;
    const r = await pool.query(
      scoped
        ? `
        SELECT user_id, COUNT(*)::int AS n
        FROM level_check_marks
        WHERE user_id = ANY($1::int[])
          AND goal_id = ANY($2::uuid[])
          AND status = 'sicher'
          AND updated_at::date = $3::date
        GROUP BY user_id
      `
        : `
        SELECT user_id, COUNT(*)::int AS n
        FROM level_check_marks
        WHERE user_id = ANY($1::int[]) AND status = 'sicher' AND updated_at::date = $2::date
        GROUP BY user_id
      `,
      scoped ? [studentIds, goalIds, day] : [studentIds, day]
    );
    return new Map(r.rows.map((row) => [Number(row.user_id), Number(row.n) || 0]));
  }

  /** Anzeigename: Gruppenname aus Gruppenarbeit, sonst Mitglieder, sonst „Gruppe n“. */
  function teamDisplayName(groupName, memberNames, index) {
    const named = String(groupName || "").trim();
    if (named) return named;
    const names = (memberNames || []).map((n) => String(n || "").trim()).filter(Boolean);
    if (names.length) return names.join(" · ");
    return `Gruppe ${index + 1}`;
  }

  /**
   * Team des Tages: Gruppen einer angelegten Gruppenarbeit.
   * Preferiert offene work-Sessions (laufende Gruppenarbeit), sonst Stammgruppen
   * des Fachs (vorbereitete Gruppen für Gruppenarbeit). Optional nach Fach filtern.
   */
  async function loadTeams(classId, schoolId, studentIds, reflected, day, subject = null) {
    const subjectKey = String(subject || "").trim();
    const sessions = await pool.query(
      `
      SELECT gs.id, gs.subject,
             COALESCE(NULLIF(trim(gs.group_name), ''), NULLIF(trim(parent.group_name), '')) AS group_name,
             gs.topic_name_snapshot,
             gs.shared_goal,
             COALESCE(gs.session_kind, 'roster') AS session_kind,
             gs.status
      FROM group_sessions gs
      LEFT JOIN group_sessions parent ON parent.id = gs.roster_id
      WHERE gs.class_id = $1
        AND gs.school_id = $2
        AND (
          (
            COALESCE(gs.session_kind, 'roster') = 'work'
            AND gs.status IN ('setup', 'active', 'midcheck', 'reflecting')
          )
          OR (
            COALESCE(gs.session_kind, 'roster') = 'roster'
            AND gs.status IN ('setup', 'standing')
          )
        )
        AND ($3::text IS NULL OR $3 = '' OR lower(trim(gs.subject)) = lower(trim($3)))
      ORDER BY lower(gs.subject), gs.group_name NULLS LAST, gs.created_at
    `,
      [classId, schoolId, subjectKey || null]
    );
    const empty = {
      teams: [],
      source: null,
      subject: subjectKey || null,
      sessionTitle: null,
      emptyReason: subjectKey
        ? `Keine Gruppenarbeit für ${subjectKey}. Lege Gruppen im Gruppenmodus an – dann gilt die Team-Challenge für diese Gruppen.`
        : "Keine Gruppenarbeit angelegt. Lege Gruppen im Gruppenmodus an – dann gilt die Team-Challenge."
    };
    if (!sessions.rows.length) return empty;

    const workRows = sessions.rows.filter((row) => row.session_kind === "work");
    const rosterRows = sessions.rows.filter((row) => row.session_kind === "roster");
    // Anzeige: laufende Gruppenarbeit vor Stammgruppen. Ohne Fachfilter (z. B. Award)
    // beide Quellen behalten, damit eine konkrete Gruppe per ID gefunden wird.
    const preferWorkOnly = Boolean(subjectKey);
    const chosen = preferWorkOnly
      ? workRows.length
        ? workRows
        : rosterRows
      : workRows.length
        ? [...workRows, ...rosterRows]
        : rosterRows;
    const source = workRows.length ? "work" : "roster";
    if (!chosen.length) return empty;

    const members = await pool.query(
      `
      SELECT session_id, user_id, display_name_snapshot
      FROM group_session_members
      WHERE session_id = ANY($1::uuid[])
        AND COALESCE(invite_status, 'accepted') = 'accepted'
      ORDER BY sort_order, display_name_snapshot
    `,
      [chosen.map((row) => row.id)]
    );
    const inClass = new Set(studentIds);
    const sicher = await newSicherToday(studentIds, day);
    const teams = chosen
      .map((row, index) => {
        const list = members.rows
          .filter((m) => String(m.session_id) === String(row.id) && inClass.has(Number(m.user_id)))
          .map((m) => {
            const id = Number(m.user_id);
            return {
              id,
              name: m.display_name_snapshot || "Schüler:in",
              reflected: reflected.has(id)
            };
          });
        const stats = teamStats(
          list.map((m) => m.id),
          reflected,
          sicher
        );
        const topicName = String(row.topic_name_snapshot || "").trim() || null;
        const sharedGoal = String(row.shared_goal || "").trim() || null;
        return {
          rosterId: row.id,
          subject: row.subject,
          name: teamDisplayName(
            row.group_name,
            list.map((m) => m.name),
            index
          ),
          groupName: String(row.group_name || "").trim() || null,
          topicName,
          sharedGoal,
          sessionTitle: topicName || sharedGoal || null,
          source: row.session_kind === "work" ? "work" : "roster",
          members: list,
          ...stats
        };
      })
      .filter((team) => team.memberCount > 0);

    if (!teams.length) {
      return {
        ...empty,
        emptyReason: subjectKey
          ? `Für ${subjectKey} sind Gruppen angelegt, aber ohne Mitglieder in dieser Klasse.`
          : "Gruppen ohne Mitglieder in dieser Klasse."
      };
    }
    const topics = [...new Set(teams.map((t) => t.sessionTitle).filter(Boolean))];
    return {
      teams,
      source,
      subject: subjectKey || chosen[0]?.subject || null,
      sessionTitle: topics.length === 1 ? topics[0] : topics.length ? topics.join(" · ") : null,
      emptyReason: null
    };
  }

  async function activeMission(classId) {
    const r = await pool.query(
      `
      SELECT *
      FROM class_learning_missions
      WHERE class_id = $1
      ORDER BY active DESC, created_at DESC
      LIMIT 1
    `,
      [classId]
    );
    return r.rows[0] || null;
  }

  async function missionView(row, studentIds, meId = null) {
    if (!row) return null;
    const goalIds = (Array.isArray(row.goal_ids) ? row.goal_ids : []).map(String);
    const marks = await marksFor(studentIds, goalIds);
    const statusOf = (studentId, goalId, tier) => marks.get(`${studentId}|${goalId}|${tier}`)?.status || "offen";
    const progress = classMissionProgress({ goalIds, tier: row.tier }, studentIds, statusOf);
    const view = {
      id: row.id,
      title: row.title,
      tier: row.tier,
      tierLabel: TIER_LABEL[row.tier] || row.tier,
      goalIds,
      missionNumbers: Array.isArray(row.mission_numbers) ? row.mission_numbers.map(Number) : [],
      dueDate: isoDay(row.due_date) || null,
      active: row.active !== false,
      closedAt: row.closed_at || null,
      done: progress.done,
      total: progress.total,
      lootXp: row.loot_xp != null ? Number(row.loot_xp) : null,
      lootText: row.loot_text || null,
      bossWonAt: row.boss_won_at || null
    };
    if (meId != null) {
      view.mine = classMissionDone(goalIds, row.tier, (goalId, tier) => statusOf(meId, goalId, tier));
    }
    return view;
  }

  async function loadGame({ classId, schoolId, day, students, reflected, meId = null }) {
    const studentIds = students.map((s) => s.id);
    const [total, roundRes, todayXpRes, weekRes, missionRow, raffleRes, teamRes, ticketState] =
      await Promise.all([
      getClassTotalXP(classId, schoolId),
      pool.query(
        `
        SELECT r.id, r.title, r.target_xp, r.is_active, r.fixed_option_id
        FROM class_reward_rounds r
        LEFT JOIN classes c ON c.id = r.class_id
        WHERE r.class_id = $1 AND (r.school_id = $2 OR c.school_id = $2)
        ORDER BY r.created_at DESC
        LIMIT 1
      `,
        [classId, schoolId]
      ),
      studentIds.length
        ? pool.query(
            `
            SELECT COALESCE(SUM(amount), 0)::int AS xp, COUNT(DISTINCT student_id)::int AS people
            FROM xp_transactions
            WHERE student_id = ANY($1::int[]) AND amount > 0 AND created_at::date = $2::date
          `,
            [studentIds, day]
          )
        : { rows: [{ xp: 0, people: 0 }] },
      studentIds.length
        ? pool.query(
            `
            SELECT COUNT(DISTINCT student_id)::int AS people
            FROM xp_transactions
            WHERE student_id = ANY($1::int[]) AND amount > 0 AND created_at::date >= $2::date
          `,
            [studentIds, weekStart(day)]
          )
        : { rows: [{ people: 0 }] },
      activeMission(classId),
      pool.query(
        `
        SELECT d.id, d.draw_date, d.winner_id, d.eligible_count, d.xp, d.created_at, u.name AS winner_name
        FROM class_raffle_draws d
        LEFT JOIN users u ON u.id = d.winner_id
        WHERE d.class_id = $1 AND d.draw_date = $2::date
        LIMIT 1
      `,
        [classId, day]
      ),
      pool.query(
        `
        SELECT id, roster_id, group_name, subject, member_ids, member_count, reflected_count,
               goal_reached, xp_each, created_at
        FROM class_team_awards
        WHERE class_id = $1 AND award_date = $2::date
        LIMIT 1
      `,
        [classId, day]
      ),
      loadRaffleTicketState(studentIds, day, classId)
    ]);
    const reflectedSet = reflected || ticketState.reflected;
    const round = roundRes.rows[0] || null;
    const roundDone = round && round.fixed_option_id && round.is_active === false;
    const draw = raffleRes.rows[0] || null;
    const award = teamRes.rows[0] || null;
    const awardMembers = award ? (Array.isArray(award.member_ids) ? award.member_ids.map(Number) : []) : [];
    const byId = new Map((students || []).map((s) => [Number(s.id), s]));
    const awardMemberList = awardMembers.map((id) => {
      const s = byId.get(Number(id));
      return {
        id: Number(id),
        name: displayNameFromUser(s?.name) || "Schüler:in",
        reflected: reflectedSet.has(Number(id))
      };
    });
    return {
      xpOptions: GAME_XP_OPTIONS,
      defaultXp: DEFAULT_GAME_XP,
      klassenziel: {
        total: Number(total) || 0,
        title: round && !roundDone ? round.title || "Klassenziel" : null,
        target: round && !roundDone ? Number(round.target_xp) || 0 : 0,
        xpToday: Number(todayXpRes.rows[0]?.xp) || 0,
        peopleToday: Number(todayXpRes.rows[0]?.people) || 0,
        peopleWeek: Number(weekRes.rows[0]?.people) || 0,
        students: studentIds.length
      },
      mission: await missionView(missionRow, studentIds, meId),
      raffle: {
        eligibleCount: ticketState.eligibleCount,
        potSize: ticketState.pot.length,
        ticketTotal: ticketState.ticketTotal ?? ticketState.pot.length,
        studentsWithTickets: ticketState.studentsWithTickets ?? ticketState.eligibleCount,
        ...(meId != null
          ? {
              inPot: (ticketState.ticketsById.get(Number(meId)) || 0) >= 1,
              myTickets: ticketState.ticketsById.get(Number(meId)) || 0
            }
          : {}),
        drawn: draw
          ? {
              id: draw.id,
              winnerId: draw.winner_id != null ? Number(draw.winner_id) : null,
              winnerName: draw.winner_name || "",
              winnerShort: displayNameFromUser(draw.winner_name),
              eligibleCount: Number(draw.eligible_count) || 0,
              xp: Number(draw.xp) || 0,
              at: draw.created_at
            }
          : null
      },
      team: award
        ? {
            rosterId: award.roster_id,
            name: award.group_name || "Team",
            subject: award.subject || "",
            memberIds: awardMembers,
            members: awardMemberList,
            memberCount: Number(award.member_count) || awardMembers.length,
            reflectedCount: Number(award.reflected_count) || 0,
            goalReached: award.goal_reached === true,
            xpEach: Number(award.xp_each) || 0,
            at: award.created_at
          }
        : null
    };
  }

  app.get("/api/teacher/cockpit", isTeacher, async (req, res) => {
    try {
      const user = req.session.user;
      const classId = Number(req.query.classId);
      if (!(await guardClass(req, res, classId))) return;
      const day = await today(req);
      const classRes = await pool.query(
        `SELECT id, name, active_levels FROM classes WHERE id = $1 AND school_id = $2`,
        [classId, user.school_id]
      );
      if (!classRes.rows.length) {
        return res.status(404).json({ success: false, message: "Klasse nicht gefunden." });
      }
      const levels = resolveClassLevels(classRes.rows[0].active_levels);
      const students = await classStudents(classId, user.school_id);
      const studentIds = students.map((s) => s.id);
      const reflected = await reflectedToday(studentIds, day);
      const [checks, game, wall] = await Promise.all([
        getLevelChecksForClass?.(classId, user.school_id) || [],
        loadGame({ classId, schoolId: user.school_id, day, students, reflected }),
        beamerExtras(studentIds, day, students)
      ]);
      const levelChecks = (checks || [])
        .filter((check) => Array.isArray(check.goals) && check.goals.length)
        .map((check) => ({ id: check.id, name: check.name, subject: check.subject }));
      const chosen = pickCheck(checks, req.query.levelCheckId, day);
      const teamBundle = await loadTeams(
        classId,
        user.school_id,
        studentIds,
        reflected,
        day,
        chosen?.subject || null
      );
      const plannedSet = new Set(wall.plannedIds);
      const base = {
        success: true,
        date: day,
        class: { id: classRes.rows[0].id, name: classRes.rows[0].name },
        activeLevels: levels.activeLevels,
        markTiers: levels.markTiers,
        displayTiers: levels.displayTiers,
        stagesEnabled: levels.stagesEnabled,
        unterthemaOnly: levels.unterthemaOnly,
        levelChecks,
        students: students.map((s) => ({
          id: s.id,
          name: s.name,
          shortName: s.shortName || displayNameFromUser(s.name) || s.name,
          xp: s.xp,
          rang: s.rang,
          avatarUrl: s.avatarUrl || null,
          characterName: s.characterName || null,
          plannedToday: plannedSet.has(s.id),
          reflectedToday: reflected.has(s.id)
        })),
        wall: {
          plannedCount: wall.plannedCount,
          reflectedCount: Math.max(wall.reflectedCount, reflected.size),
          classSize: studentIds.length,
          fastest: wall.fastest,
          xpLeaders: wall.xpLeaders,
          progress: [],
          catchUp: [],
          roster: students
            .filter((s) => plannedSet.has(s.id) || reflected.has(s.id))
            .map((s) => ({
              id: s.id,
              name: s.shortName || displayNameFromUser(s.name) || s.name,
              avatarUrl: s.avatarUrl || null,
              planned: plannedSet.has(s.id),
              reflected: reflected.has(s.id)
            }))
            .sort((a, b) => {
              if (a.reflected !== b.reflected) return a.reflected ? -1 : 1;
              return String(a.name).localeCompare(String(b.name), "de");
            })
        },
        game,
        teams: teamBundle.teams,
        teamsInfo: {
          source: teamBundle.source,
          subject: teamBundle.subject,
          sessionTitle: teamBundle.sessionTitle || null,
          emptyReason: teamBundle.emptyReason
        }
      };
      if (!chosen || !studentIds.length) {
        return res.json({
          ...base,
          levelCheck: null,
          message: !studentIds.length
            ? "In dieser Klasse sind keine Schüler:innen hinterlegt."
            : "Für diese Klasse gibt es noch keine Unterrichtseinheit mit Missionen."
        });
      }

      const goals = [...chosen.goals].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
      const goalIds = goals.map((goal) => String(goal.id));
      const wzList = [...new Set(goals.map((goal) => goal.trainingWz).filter(Boolean))];
      const subject = chosen.subject || "";
      const recentFrom = addDays(day, -35);

      const unitStartIso = (() => {
        const preview = unitTimeline(chosen, day);
        return preview.start || day;
      })();
      const weekFrom = weekStart(day);

      const weekBounds = weekBoundsBerlin(day);
      const weekFromIsoBound = weekBounds.start || weekFrom;

      const [
        targetsRes,
        marks,
        trainingRes,
        entriesRes,
        recentRes,
        timetableRes,
        coachRes,
        proofsRes,
        seasonXpRes,
        weekLessonsRes,
        evalWeekRes,
        proofsWeekRes
      ] = await Promise.all([
        pool.query(
          `
          SELECT user_id, target_grade_key, target_grade
          FROM level_check_targets
          WHERE level_check_id = $1 AND user_id = ANY($2::int[])
        `,
          [chosen.id, studentIds]
        ),
        marksFor(studentIds, goalIds),
        wzList.length
          ? pool.query(
              `
              SELECT student_id, wz, merged, updated_at
              FROM training_results
              WHERE student_id = ANY($1::int[]) AND wz = ANY($2::text[])
            `,
              [studentIds, wzList]
            )
          : { rows: [] },
        pool.query(
          `
          SELECT le.id, le.user_id, le.what_goal_id, le.selected_level, le.confidence_before, le.created_at,
                 MIN(lc.created_at) AS check_created_at, MIN(lr.created_at) AS reflection_created_at
          FROM log_entries le
          LEFT JOIN log_checks lc ON lc.log_entry_id = le.id
          LEFT JOIN log_reflections lr ON lr.log_entry_id = le.id
          WHERE le.user_id = ANY($1::int[])
            AND le.date = $2::date
            AND (lower(le.subject) = lower($3) OR le.what_goal_id = ANY($4::uuid[]))
          GROUP BY le.id
        `,
          [studentIds, day, subject, goalIds]
        ),
        pool.query(
          `
          SELECT le.date, COUNT(DISTINCT le.user_id)::int AS planned,
                 COUNT(DISTINCT CASE WHEN lr.log_entry_id IS NOT NULL THEN le.user_id END)::int AS reflected
          FROM log_entries le
          LEFT JOIN log_reflections lr ON lr.log_entry_id = le.id
          WHERE le.user_id = ANY($1::int[])
            AND le.date >= $2::date AND le.date <= $3::date
            AND (lower(le.subject) = lower($4) OR le.what_goal_id = ANY($5::uuid[]))
          GROUP BY le.date
          ORDER BY le.date DESC
          LIMIT 5
        `,
          [studentIds, recentFrom, day, subject, goalIds]
        ),
        pool.query(`SELECT weekday, timeslot FROM timetables WHERE class_id = $1 AND lower(subject) = lower($2)`, [
          classId,
          subject
        ]),
        pool.query(
          `
          SELECT help_requested_at
          FROM teacher_coaching_state
          WHERE student_id = ANY($1::int[]) AND coaching_date = $2::date AND help_requested_at IS NOT NULL
        `,
          [studentIds, day]
        ),
        pool.query(
          `
          SELECT user_id, tier
          FROM level_check_proofs
          WHERE level_check_id = $1 AND user_id = ANY($2::int[])
        `,
          [chosen.id, studentIds]
        ),
        studentIds.length
          ? pool.query(
              `
              SELECT COALESCE(SUM(amount), 0)::int AS xp
              FROM xp_transactions
              WHERE student_id = ANY($1::int[])
                AND amount > 0
                AND created_at::date >= $2::date
            `,
              [studentIds, unitStartIso]
            )
          : { rows: [{ xp: 0 }] },
        pool.query(
          `
          SELECT le.date, COUNT(DISTINCT le.user_id)::int AS planned,
                 COUNT(DISTINCT CASE WHEN lr.log_entry_id IS NOT NULL THEN le.user_id END)::int AS reflected
          FROM log_entries le
          LEFT JOIN log_reflections lr ON lr.log_entry_id = le.id
          WHERE le.user_id = ANY($1::int[])
            AND le.date >= $2::date AND le.date <= $3::date
            AND (lower(le.subject) = lower($4) OR le.what_goal_id = ANY($5::uuid[]))
          GROUP BY le.date
          ORDER BY le.date ASC
        `,
          [studentIds, weekFromIsoBound, day, subject, goalIds]
        ),
        studentIds.length
          ? pool.query(
              `
              SELECT e.user_id, e.status, e.updated_at::date AS day
              FROM level_check_checkpoint_evaluations e
              JOIN level_check_checkpoints cp ON cp.id = e.checkpoint_id
              WHERE cp.level_check_id = $1
                AND e.user_id = ANY($2::int[])
                AND e.status IN ('passed', 'failed')
                AND e.updated_at::date >= $3::date
                AND e.updated_at::date <= $4::date
            `,
              [chosen.id, studentIds, weekFromIsoBound, day]
            )
          : { rows: [] },
        studentIds.length
          ? pool.query(
              `
              SELECT user_id, tier
              FROM level_check_proofs
              WHERE level_check_id = $1
                AND user_id = ANY($2::int[])
                AND created_at::date >= $3::date
                AND created_at::date <= $4::date
            `,
              [chosen.id, studentIds, weekFromIsoBound, day]
            )
          : { rows: [] }
      ]);

      const rulesByStudent = new Map();
      for (const row of targetsRes.rows) {
        const key = String(row.target_grade_key || row.target_grade || "").trim().replace(",", ".");
        if (key && getGradeRequirements?.(key)) rulesByStudent.set(Number(row.user_id), { key, rules: getGradeRequirements(key) });
      }
      const statusOf = (studentId, goalId, tier) => marks.get(`${studentId}|${goalId}|${tier}`)?.status || "offen";
      const trainingMap = new Map();
      for (const row of trainingRes.rows) {
        trainingMap.set(`${Number(row.student_id)}|${row.wz}`, { merged: row.merged, updatedAt: row.updated_at });
      }

      const unit = unitTimeline(chosen, day);
      const target = planTarget(goalIds, unit);
      const ghost = ghostDone(goalIds, unit, target);

      const entriesByStudent = new Map();
      for (const row of entriesRes.rows) {
        const id = Number(row.user_id);
        if (!entriesByStudent.has(id)) entriesByStudent.set(id, []);
        entriesByStudent.get(id).push(row);
      }

      const studentRows = students.map((student) => {
        const target_ = rulesByStudent.get(student.id) || null;
        const rules = filterGradeRules(target_?.rules || null, levels.markTiers);
        const pos = studentPosition(
          goals,
          rules,
          wrapStatusForLevels((goal, tier) => statusOf(student.id, String(goal.id), tier), levels)
        );
        const entries = (entriesByStudent.get(student.id) || []).sort(
          (a, b) => new Date(b.created_at) - new Date(a.created_at)
        );
        const latest = entries[0] || null;
        const marksOut = {};
        for (const goalId of goalIds) {
          marksOut[goalId] = levels.displayTiers.map((tier) => statusOf(student.id, goalId, tier));
        }
        const trainingOut = {};
        for (const goal of goals) {
          if (!goal.trainingWz) continue;
          const row = trainingMap.get(`${student.id}|${goal.trainingWz}`);
          if (!row?.merged?.levels) continue;
          trainingOut[String(goal.id)] = {
            solved: levels.markTiers.map((tier) => {
              const key = tier === "street_legend" ? "streetLegend" : tier;
              return Number(row.merged.levels?.[key]?.solved) || 0;
            }),
            ichKann: levels.markTiers.map((tier) => {
              const key = tier === "street_legend" ? "streetLegend" : tier;
              return row.merged.ichKann?.[key] || null;
            }),
            updated: isoDay(row.updatedAt) || null
          };
        }
        return {
          id: student.id,
          name: student.name,
          targetGrade: target_?.key || null,
          current: pos.current,
          done: pos.done,
          allDone: pos.allDone,
          pace: paceStatus(pos.done, ghost),
          paceText: paceText(pos.done, target),
          marks: marksOut,
          training: trainingOut,
          today: latest
            ? {
                goalId: latest.what_goal_id ? String(latest.what_goal_id) : null,
                level: latest.selected_level || null,
                confidence: latest.confidence_before != null ? Number(latest.confidence_before) : null,
                checked: !!latest.check_created_at,
                reflected: !!latest.reflection_created_at
              }
            : null
        };
      });

      const shares = goalIds.map((goalId) => {
        const counts = {};
        for (const tier of levels.displayTiers) {
          counts[tier] = studentIds.filter((id) => statusOf(id, goalId, tier) === "sicher").length;
        }
        return { goalId, ...counts };
      });

      const training = trainingBoard(
        goals.map((goal) => ({ id: goal.id, trainingWz: goal.trainingWz })),
        studentIds,
        (studentId, wz) => trainingMap.get(`${studentId}|${wz}`) || null,
        day,
        levels.markTiers
      );

      const events = [];
      for (const row of entriesRes.rows) {
        if (row.created_at) events.push({ at: row.created_at, kind: "ziel" });
      }
      for (const row of trainingRes.rows) {
        if (isoDay(row.updated_at) === day) events.push({ at: row.updated_at, kind: "training" });
      }
      for (const row of marks.values()) {
        if (row.status === "sicher" && isoDay(row.updated_at) === day) events.push({ at: row.updated_at, kind: "sicher" });
      }
      for (const row of coachRes.rows) events.push({ at: row.help_requested_at, kind: "hilfe" });

      const lessons = target ? lessonsUntil(timetableRes.rows, day, target.date) : { count: 0, days: [] };
      const avgDone = studentRows.length
        ? studentRows.reduce((sum, s) => sum + Math.min(s.done, target ? target.planIndex + 1 : s.done), 0) /
          studentRows.length
        : 0;

      const sicherTodayMap = await newSicherToday(studentIds, day, goalIds);
      const trainingTodayById = new Map();
      for (const row of trainingRes.rows) {
        if (isoDay(row.updated_at) !== day) continue;
        const id = Number(row.student_id);
        let solved = 0;
        const levelMap = row.merged?.levels || {};
        for (const key of Object.keys(levelMap)) {
          solved += Number(levelMap[key]?.solved) || 0;
        }
        trainingTodayById.set(id, (trainingTodayById.get(id) || 0) + solved);
      }
      const byStudent = new Map(students.map((s) => [Number(s.id), s]));
      const podiumPeople = studentRows.map((s) => {
        const baseStudent = byStudent.get(Number(s.id));
        return {
          id: s.id,
          name: baseStudent?.shortName || displayNameFromUser(baseStudent?.name || s.name) || s.name,
          avatarUrl: baseStudent?.avatarUrl || null,
          characterName: baseStudent?.characterName || null,
          done: s.done
        };
      });
      base.wall = {
        ...base.wall,
        progress: rankProgressLeaders({
          students: podiumPeople,
          sicherById: sicherTodayMap,
          trainingById: trainingTodayById,
          limit: 5
        }),
        catchUp: rankCatchUpLeaders({
          students: podiumPeople,
          sicherById: sicherTodayMap,
          ghost,
          limit: 5
        })
      };

      const proofSet = new Set();
      for (const row of proofsRes.rows || []) {
        proofSet.add(`${Number(row.user_id)}|${chosen.id}|${row.tier}`);
      }

      // XP-Quelle: mit Einheits-Start → Summe xp_transactions seit Start (Season-XP);
      // ohne Start → ehrliches Fallback auf Klassen-Gesamt-XP.
      const xpSeitEinheit = Number(seasonXpRes.rows?.[0]?.xp) || 0;
      const xpGesamt = Number(game.klassenziel?.total) || 0;
      const hasUnitStart = Boolean(unit.start);
      let classXp = hasUnitStart ? xpSeitEinheit : xpGesamt;
      let xpSource = hasUnitStart ? "einheit" : "gesamt";

      const maps = loadCockpitMaps();
      const missionForBoss = game.mission
        ? {
            goal_ids: game.mission.goalIds,
            tier: game.mission.tier,
            due_date: game.mission.dueDate,
            active: game.mission.active,
            loot_xp: game.mission.lootXp,
            loot_text: game.mission.lootText,
            boss_won_at: game.mission.bossWonAt || null
          }
        : null;

      const seasonKey = seasonKeyFor(chosen.id, classId);
      const weekFromIso = weekStart(day);
      let helpedCount = 0;
      let helpedStudentIds = [];
      let tickerRows = [];
      let crewsForSeason = [];
      let sideQuestRow = null;
      let sideQuestAuto = false;
      try {
        const [helpRes, tickerRes, crewsRes, sqPack, evTodayRes] = await Promise.all([
          pool.query(
            `
            SELECT helped_by_student_id
            FROM teacher_coaching_state
            WHERE class_id = $1
              AND coaching_date >= $2::date
              AND coaching_date <= $3::date
              AND helped_by_kind = 'peer'
              AND helped_by_student_id IS NOT NULL
          `,
            [classId, weekFromIso, day]
          ),
          pool.query(
            `
            SELECT e.id, e.typ, e.student_id, e.data, e.created_at,
                   u.name AS student_name, COALESCE(u.beamer_name_ok, FALSE) AS beamer_name_ok
            FROM cockpit_events e
            LEFT JOIN users u ON u.id = e.student_id
            WHERE e.class_id = $1
            ORDER BY e.created_at DESC
            LIMIT 40
          `,
            [classId]
          ),
          pool.query(
            `
            SELECT c.id, c.name, c.color, c.tag_text, c.released, c.season_key,
                   COALESCE(
                     json_agg(json_build_object('id', cm.student_id) ORDER BY cm.student_id)
                     FILTER (WHERE cm.student_id IS NOT NULL),
                     '[]'::json
                   ) AS members
            FROM crews c
            LEFT JOIN crew_members cm ON cm.crew_id = c.id
            WHERE c.class_id = $1 AND c.season_key = $2
            GROUP BY c.id
            ORDER BY c.created_at ASC
          `,
            [classId, seasonKey]
          ),
          loadOrAutoSideQuest(user.school_id, classId, day, studentIds.length),
          pool.query(
            `
            SELECT typ, created_at
            FROM cockpit_events
            WHERE class_id = $1 AND created_at::date = $2::date
          `,
            [classId, day]
          )
        ]);
        helpedStudentIds = helpRes.rows
          .map((r) => Number(r.helped_by_student_id))
          .filter((id) => Number.isFinite(id));
        helpedCount = helpedStudentIds.length;
        tickerRows = tickerRes.rows.map((r) => ({
          id: r.id,
          typ: r.typ,
          student_id: r.student_id,
          studentName: displayNameFromUser(r.student_name) || r.student_name,
          beamerNameOk: r.beamer_name_ok === true,
          data: r.data,
          created_at: r.created_at
        }));
        crewsForSeason = crewsRes.rows.map((r) => ({
          id: r.id,
          name: r.name,
          color: r.color,
          tagText: r.tag_text,
          released: r.released === true,
          members: Array.isArray(r.members) ? r.members : JSON.parse(r.members || "[]")
        }));
        sideQuestRow = sqPack.row || null;
        sideQuestAuto = sqPack.auto === true;
        if (sideQuestRow) {
          const prog = sideQuestProgressFromEvents(evTodayRes.rows, sideQuestRow.typ);
          sideQuestRow = {
            ...sideQuestRow,
            progress: Math.max(Number(sideQuestRow.progress) || 0, prog),
            auto: sideQuestAuto
          };
          if (!sideQuestRow.done && sideQuestRow.progress >= Number(sideQuestRow.ziel)) {
            const finished = await pool.query(
              `
              UPDATE side_quests
              SET progress = $2, done = TRUE
              WHERE id = $1 AND done = FALSE
              RETURNING id, xp, xp_awarded
            `,
              [sideQuestRow.id, sideQuestRow.progress]
            );
            if (finished.rows.length) {
              sideQuestRow.done = true;
              await recordCockpitEvent(pool, {
                schoolId: user.school_id,
                classId,
                typ: "side_quest_done",
                data: { questId: sideQuestRow.id, typ: sideQuestRow.typ }
              });
              const questXp = Math.max(0, Number(finished.rows[0].xp) || 0);
              if (questXp > 0 && finished.rows[0].xp_awarded !== true) {
                const n = studentIds.length;
                const per = n > 0 ? Math.floor(questXp / n) : 0;
                if (per > 0) {
                  for (const sid of studentIds) {
                    await awardXp(sid, per, XP_SOURCE_SIDE_QUEST, user.school_id);
                  }
                }
                await pool
                  .query(`UPDATE side_quests SET xp_awarded = TRUE WHERE id = $1`, [sideQuestRow.id])
                  .catch(() => {});
              }
            }
          } else if (prog !== Number(sideQuestRow.progress)) {
            await pool
              .query(`UPDATE side_quests SET progress = $2 WHERE id = $1`, [sideQuestRow.id, prog])
              .catch(() => {});
          }
        }
      } catch (stufe2Err) {
        console.warn("Cockpit Stufe-2 Anreicherung:", stufe2Err?.message || stufe2Err);
      }

      const timetableWeekdays = [
        ...new Set(
          (timetableRes.rows || [])
            .map((row) => Number(row.weekday))
            .filter((n) => Number.isFinite(n) && n >= 1 && n <= 7)
        )
      ];
      const weekDayCounts = (weekLessonsRes.rows || []).map((row) => ({
        date: isoDay(row.date),
        planned: Number(row.planned) || 0,
        reflected: Number(row.reflected) || 0,
        plannedCount: Number(row.planned) || 0,
        reflectedCount: Number(row.reflected) || 0
      }));
      const learningDays = learningDaysThisWeek({
        isoToday: day,
        classSize: studentIds.length,
        timetableWeekdays,
        dayCounts: weekDayCounts
      });

      const evalStatusByStudent = new Map();
      for (const row of evalWeekRes.rows || []) {
        const sid = Number(row.user_id);
        const prev = evalStatusByStudent.get(sid);
        // passed schlägt failed, falls mehrere Evals
        if (prev === "passed") continue;
        if (row.status === "passed" || row.status === "failed") {
          evalStatusByStudent.set(sid, row.status);
        }
      }
      const proofThisWeek = new Set(
        (proofsWeekRes.rows || []).map((row) => `${Number(row.user_id)}|${chosen.id}|${row.tier}`)
      );
      for (const row of proofsWeekRes.rows || []) {
        proofThisWeek.add(`${Number(row.user_id)}|${row.tier}`);
      }
      const trainingSafeThisWeek = new Set();
      for (const row of trainingRes.rows || []) {
        if (isoDay(row.updated_at) < weekFromIsoBound || isoDay(row.updated_at) > day) continue;
        const sid = Number(row.student_id);
        const merged = typeof row.merged === "string" ? JSON.parse(row.merged) : row.merged;
        for (const [tier, key] of Object.entries(TRAINING_KEY)) {
          if (!key) continue;
          if (merged?.levels?.[key]?.safe === true) {
            trainingSafeThisWeek.add(`${sid}|${row.wz}|${tier}`);
          }
        }
      }
      const assessment = assessmentFromSicherMarks({
        studentIds,
        goals,
        marks,
        evalStatusByStudent,
        proofThisWeek,
        trainingSafeThisWeek,
        levelCheckId: String(chosen.id)
      });

      const season = buildSeasonPayload({
        day,
        classSize: studentIds.length,
        students,
        studentIds,
        goals,
        chosen,
        unit,
        marks,
        trainingMap,
        proofSet,
        entriesByStudent,
        missionRow: missionForBoss,
        recentLessons: recentRes.rows
          .map((row) => ({ date: isoDay(row.date), planned: row.planned, reflected: row.reflected }))
          .reverse(),
        weekLessonDays: weekDayCounts,
        learningDaysThisWeek: learningDays,
        timetableWeekdays,
        assessment,
        evalStatusByStudent,
        proofThisWeek,
        trainingSafeThisWeek,
        classXp,
        xpSource,
        plannedTodayCount: wall.plannedCount,
        mapsIndex: maps.index,
        mapsDetail: maps.details,
        config: COCKPIT_SEASON_CONFIG,
        rng: Math.random,
        helpedCount,
        helpedStudentIds,
        helpedAvailable: true,
        tickerEvents: tickerRows,
        crews: crewsForSeason,
        sideQuest: sideQuestRow,
        seasonKey
      });

      res.json({
        ...base,
        levelCheck: { id: chosen.id, name: chosen.name, subject },
        goals: goals.map((goal, index) => ({
          id: String(goal.id),
          number: index + 1,
          text: goal.text,
          trainingWz: goal.trainingWz || null
        })),
        unit: {
          start: unit.start,
          events: unit.events,
          target,
          ghost,
          lessonsUntilTarget: lessons.count,
          lessonDays: lessons.days,
          missingToTarget: target ? Math.max(0, Math.round((target.planIndex + 1 - avgDone) * 10) / 10) : null
        },
        shares,
        studentsDetail: studentRows,
        training,
        events,
        recentLessons: recentRes.rows
          .map((row) => ({ date: isoDay(row.date), planned: row.planned, reflected: row.reflected }))
          .reverse(),
        season
      });
    } catch (err) {
      console.error("❌ /api/teacher/cockpit:", err);
      res.status(500).json({ success: false, message: "Serverfehler" });
    }
  });

  /**
   * Boss-Sieg: boss_won_at setzen, Ereignis speichern, loot_xp gleichmäßig als Klassen-XP verteilen
   * (Klassen-XP = Summe der Schüler-XP via getClassTotalXP / awardXp).
   */
  app.post("/api/teacher/cockpit/boss-win", isTeacher, async (req, res) => {
    try {
      const user = req.session.user;
      const classId = Number(req.body?.classId);
      if (!(await guardClass(req, res, classId))) return;
      const mission = await activeMission(classId);
      if (!mission || mission.active === false) {
        return res.status(400).json({
          success: false,
          message: "Keine aktive Klassen-Mission – Boss-Sieg nicht möglich."
        });
      }
      if (mission.boss_won_at) {
        return res.json({
          success: true,
          already: true,
          bossWonAt: mission.boss_won_at,
          message: "Boss war bereits besiegt."
        });
      }
      const updated = await pool.query(
        `
        UPDATE class_learning_missions
        SET boss_won_at = NOW()
        WHERE id = $1 AND active = TRUE AND boss_won_at IS NULL
        RETURNING id, boss_won_at, loot_xp, loot_text
      `,
        [mission.id]
      );
      if (!updated.rows.length) {
        return res.status(409).json({
          success: false,
          message: "Boss-Sieg konnte nicht gespeichert werden."
        });
      }
      const row = updated.rows[0];
      const lootXp = row.loot_xp != null ? Math.max(0, Number(row.loot_xp) || 0) : 0;
      const students = await classStudents(classId, user.school_id);
      const n = students.length;
      let perStudent = 0;
      let awardedTotal = 0;
      if (lootXp > 0 && n > 0) {
        perStudent = Math.floor(lootXp / n);
        if (perStudent > 0) {
          for (const s of students) {
            await awardXp(s.id, perStudent, XP_SOURCE_BOSS, user.school_id);
            awardedTotal += perStudent;
          }
        }
      }
      await recordCockpitEvent(pool, {
        schoolId: user.school_id,
        classId,
        typ: "boss_besiegt",
        data: {
          by: user.id,
          missionId: mission.id,
          lootXp,
          lootText: row.loot_text || null,
          perStudent,
          awardedTotal,
          students: n
        }
      });
      res.json({
        success: true,
        bossWonAt: row.boss_won_at,
        lootXp,
        perStudent,
        awardedTotal,
        message:
          lootXp > 0 && awardedTotal > 0
            ? `Boss besiegt – ${awardedTotal} Klassen-XP verteilt (${perStudent} XP je Schüler:in).`
            : "Boss besiegt – Beute freigeschaltet."
      });
    } catch (err) {
      console.error("❌ POST /api/teacher/cockpit/boss-win:", err);
      res.status(500).json({ success: false, message: "Serverfehler" });
    }
  });

  app.post("/api/teacher/cockpit/class-mission", isTeacher, async (req, res) => {
    try {
      const user = req.session.user;
      const classId = Number(req.body?.classId);
      if (!(await guardClass(req, res, classId))) return;
      const classLevelsRes = await pool.query(`SELECT active_levels FROM classes WHERE id = $1 AND school_id = $2`, [
        classId,
        user.school_id
      ]);
      const levels = resolveClassLevels(classLevelsRes.rows[0]?.active_levels);
      const allowedTiers = levels.missionTiers;
      const tier = allowedTiers.includes(req.body?.tier) ? req.body.tier : allowedTiers[0] || "rookie";
      const checks = (await getLevelChecksForClass?.(classId, user.school_id)) || [];
      const check = checks.find((c) => String(c.id) === String(req.body?.levelCheckId));
      if (!check) return res.status(400).json({ success: false, message: "Unterrichtseinheit nicht gefunden." });
      const ordered = [...(check.goals || [])].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
      const wanted = new Set((Array.isArray(req.body?.goalIds) ? req.body.goalIds : []).map(String));
      const picked = ordered
        .map((goal, index) => ({ id: String(goal.id), number: index + 1 }))
        .filter((goal) => wanted.has(goal.id));
      if (!picked.length) {
        return res.status(400).json({ success: false, message: "Bitte mindestens eine Mission wählen." });
      }
      const dueDate = isoDay(req.body?.dueDate) || null;
      const custom = String(req.body?.title || "").trim().slice(0, 160);
      const numbers = picked.map((goal) => goal.number);
      const title = custom || classMissionTitle({ numbers, tier, dueDate });
      const lootXpRaw = req.body?.lootXp;
      const lootXp =
        lootXpRaw === "" || lootXpRaw == null ? null : Math.max(0, Math.min(5000, Number(lootXpRaw) || 0));
      const lootText = String(req.body?.lootText || "").trim().slice(0, 200) || null;
      await pool.query(
        `UPDATE class_learning_missions SET active = FALSE, closed_at = NOW() WHERE class_id = $1 AND active = TRUE`,
        [classId]
      );
      const r = await pool.query(
        `
        INSERT INTO class_learning_missions
          (school_id, class_id, level_check_id, title, goal_ids, mission_numbers, tier, due_date, created_by, loot_xp, loot_text)
        VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8, $9, $10, $11)
        RETURNING id
      `,
        [
          user.school_id,
          classId,
          check.id,
          title,
          JSON.stringify(picked.map((goal) => goal.id)),
          JSON.stringify(numbers),
          tier,
          dueDate,
          user.id,
          lootXp,
          lootText
        ]
      );
      res.json({ success: true, id: r.rows[0]?.id, title, message: "Klassen-Mission gestartet." });
    } catch (err) {
      console.error("❌ POST /api/teacher/cockpit/class-mission:", err);
      res.status(500).json({ success: false, message: "Serverfehler" });
    }
  });

  app.post("/api/teacher/cockpit/class-mission/:id/close", isTeacher, async (req, res) => {
    try {
      const r = await pool.query(`SELECT id, class_id FROM class_learning_missions WHERE id = $1`, [req.params.id]);
      const row = r.rows[0];
      if (!row) return res.status(404).json({ success: false, message: "Klassen-Mission nicht gefunden." });
      if (!(await guardClass(req, res, Number(row.class_id)))) return;
      await pool.query(
        `UPDATE class_learning_missions SET active = FALSE, closed_at = COALESCE(closed_at, NOW()) WHERE id = $1`,
        [row.id]
      );
      res.json({ success: true, message: "Klassen-Mission beendet." });
    } catch (err) {
      console.error("❌ POST class-mission close:", err);
      res.status(500).json({ success: false, message: "Serverfehler" });
    }
  });

  app.post("/api/teacher/cockpit/raffle", isTeacher, async (req, res) => {
    try {
      const user = req.session.user;
      const classId = Number(req.body?.classId);
      if (!(await guardClass(req, res, classId))) return;
      const day = await today(req);
      const xp = normalizeGameXp(req.body?.xp);
      const auto = req.body?.auto === true;
      const students = await classStudents(classId, user.school_id);
      const ticketState = await loadRaffleTicketState(
        students.map((s) => s.id),
        day,
        classId
      );
      if (!ticketState.pot.length) {
        return res.status(400).json({
          success: false,
          message: "Im Lostopf ist noch niemand. Lose gibt es für geplant, reflektiert, gut eingeschätzt und geholfen."
        });
      }
      const winnerId = pickWinner(ticketState.pot, randomInt);
      const eligibleCount = ticketState.eligibleCount;
      const claim = await pool.query(
        `
        INSERT INTO class_raffle_draws (school_id, class_id, draw_date, winner_id, eligible_count, xp, drawn_by)
        VALUES ($1, $2, $3::date, $4, $5, $6, $7)
        ON CONFLICT (class_id, draw_date) DO NOTHING
        RETURNING id
      `,
        [user.school_id, classId, day, winnerId, eligibleCount, xp, user.id]
      );
      if (!claim.rows.length) {
        return res.status(409).json({ success: false, message: "Heute wurde in dieser Klasse schon gezogen." });
      }
      try {
        await awardXp(winnerId, xp, XP_SOURCE_RAFFLE, user.school_id);
      } catch (err) {
        await pool.query(`DELETE FROM class_raffle_draws WHERE id = $1`, [claim.rows[0].id]).catch(() => {});
        throw err;
      }
      const winner = students.find((s) => s.id === winnerId);
      const short = displayNameFromUser(winner?.name);
      await recordCockpitEvent(pool, {
        schoolId: user.school_id,
        classId,
        studentId: winnerId,
        typ: "ziehung",
        data: {
          xp,
          eligibleCount,
          potSize: ticketState.pot.length,
          tickets: ticketState.ticketsById.get(Number(winnerId)) || 0,
          auto: !!auto
        }
      });
      res.json({
        success: true,
        auto,
        winner: { id: winnerId, name: winner?.name || "", short },
        xp,
        eligibleCount,
        potSize: ticketState.pot.length,
        message: auto
          ? `Automatische Ziehung: ${short} gewinnt ${xp} XP.`
          : `${short} gewinnt ${xp} XP.`
      });
    } catch (err) {
      console.error("❌ POST /api/teacher/cockpit/raffle:", err);
      res.status(500).json({ success: false, message: "Serverfehler" });
    }
  });

  app.post("/api/teacher/cockpit/team-award", isTeacher, async (req, res) => {
    try {
      const user = req.session.user;
      const classId = Number(req.body?.classId);
      if (!(await guardClass(req, res, classId))) return;
      const day = await today(req);
      const xp = normalizeGameXp(req.body?.xp);
      const students = await classStudents(classId, user.school_id);
      const studentIds = students.map((s) => s.id);
      const reflected = await reflectedToday(studentIds, day);
      // Ohne Fachfilter: Bestätigung aus dem Cockpit muss die gewählte Gruppe finden.
      const teamBundle = await loadTeams(classId, user.school_id, studentIds, reflected, day, null);
      const team = teamBundle.teams.find((t) => String(t.rosterId) === String(req.body?.rosterId));
      if (!team) return res.status(404).json({ success: false, message: "Team nicht gefunden." });
      const memberIds = team.members.map((m) => m.id);
      const claim = await pool.query(
        `
        INSERT INTO class_team_awards
          (school_id, class_id, award_date, roster_id, group_name, subject, member_ids,
           member_count, reflected_count, goal_reached, xp_each, confirmed_by)
        VALUES ($1, $2, $3::date, $4, $5, $6, $7::jsonb, $8, $9, $10, $11, $12)
        ON CONFLICT (class_id, award_date) DO NOTHING
        RETURNING id
      `,
        [
          user.school_id,
          classId,
          day,
          team.rosterId,
          team.name,
          team.subject,
          JSON.stringify(memberIds),
          team.memberCount,
          team.reflectedCount,
          team.goalReached,
          xp,
          user.id
        ]
      );
      if (!claim.rows.length) {
        return res.status(409).json({ success: false, message: "Heute gibt es in dieser Klasse schon ein Team des Tages." });
      }
      const awarded = [];
      try {
        for (const id of memberIds) {
          await awardXp(id, xp, XP_SOURCE_TEAM, user.school_id);
          awarded.push(id);
        }
      } catch (err) {
        if (!awarded.length) {
          await pool.query(`DELETE FROM class_team_awards WHERE id = $1`, [claim.rows[0].id]).catch(() => {});
        }
        throw err;
      }
      res.json({
        success: true,
        team: { rosterId: team.rosterId, name: team.name, memberCount: team.memberCount },
        xp,
        message: `${team.name} ist Team des Tages: ${xp} XP für jedes Mitglied.`
      });
    } catch (err) {
      console.error("❌ POST /api/teacher/cockpit/team-award:", err);
      res.status(500).json({ success: false, message: "Serverfehler" });
    }
  });

  // —— Stufe 2: Crews ——
  async function loadAvoidPairs(classId) {
    const r = await pool.query(
      `SELECT student_a, student_b FROM crew_avoid_pairs WHERE class_id = $1`,
      [classId]
    );
    return r.rows.map((row) => ({ studentA: Number(row.student_a), studentB: Number(row.student_b) }));
  }

  async function listCrews(classId, seasonKey) {
    const r = await pool.query(
      `
      SELECT c.id, c.name, c.color, c.tag_text, c.released, c.season_key, c.created_at,
             COALESCE(
               json_agg(
                 json_build_object('id', u.id, 'name', u.name)
                 ORDER BY u.name
               ) FILTER (WHERE u.id IS NOT NULL),
               '[]'::json
             ) AS members
      FROM crews c
      LEFT JOIN crew_members cm ON cm.crew_id = c.id
      LEFT JOIN users u ON u.id = cm.student_id
      WHERE c.class_id = $1 AND c.season_key = $2
      GROUP BY c.id
      ORDER BY c.created_at ASC
    `,
      [classId, seasonKey]
    );
    return r.rows.map((row) => {
      const members = Array.isArray(row.members) ? row.members : JSON.parse(row.members || "[]");
      return {
        id: row.id,
        name: row.name,
        color: row.color,
        tagText: row.tag_text,
        released: row.released === true,
        seasonKey: row.season_key,
        createdAt: row.created_at,
        members: members.map((m) => ({
          id: Number(m.id),
          name: m.name,
          shortName: displayNameFromUser(m.name) || m.name
        }))
      };
    });
  }

  app.get("/api/teacher/cockpit/crews", isTeacher, async (req, res) => {
    try {
      const classId = Number(req.query.classId);
      if (!(await guardClass(req, res, classId))) return;
      const seasonKey = String(req.query.seasonKey || seasonKeyFor(null, classId));
      const [crews, avoid] = await Promise.all([listCrews(classId, seasonKey), loadAvoidPairs(classId)]);
      res.json({
        success: true,
        seasonKey,
        crews,
        avoidPairs: avoid,
        fallbackNames: COCKPIT_SEASON_CONFIG.fallbackCrewNames || []
      });
    } catch (err) {
      console.error("❌ GET /api/teacher/cockpit/crews:", err);
      res.status(500).json({ success: false, message: "Serverfehler" });
    }
  });

  app.post("/api/teacher/cockpit/crews/draw", isTeacher, async (req, res) => {
    try {
      const user = req.session.user;
      const classId = Number(req.body?.classId);
      if (!(await guardClass(req, res, classId))) return;
      const seasonKey = String(req.body?.seasonKey || seasonKeyFor(null, classId));
      const students = await classStudents(classId, user.school_id);
      let ids = Array.isArray(req.body?.studentIds)
        ? req.body.studentIds.map(Number).filter((n) => Number.isFinite(n))
        : students.map((s) => s.id);
      const byId = new Map(students.map((s) => [s.id, s]));
      ids = ids.filter((id) => byId.has(id));

      // Zielnoten für Sortierung (bevorzugt aktuelle Season/Einheit)
      const lcId = seasonKey.startsWith("class-") ? null : seasonKey;
      const targetsRes = await pool
        .query(
          `
        SELECT user_id, target_grade_key, target_grade, level_check_id
        FROM level_check_targets
        WHERE user_id = ANY($1::int[])
        ORDER BY CASE WHEN $2::text IS NOT NULL AND level_check_id::text = $2 THEN 0 ELSE 1 END,
                 updated_at DESC NULLS LAST
      `,
          [ids, lcId]
        )
        .catch(() => ({ rows: [] }));
      const gradeByUser = new Map();
      for (const row of targetsRes.rows || []) {
        const uid = Number(row.user_id);
        if (gradeByUser.has(uid)) continue;
        gradeByUser.set(uid, row.target_grade_key || row.target_grade);
      }
      const poolStudents = ids.map((id) => ({
        id,
        targetGrade: gradeByUser.get(id) ?? null
      }));
      const avoid = await loadAvoidPairs(classId);
      const drawn = drawCrews(poolStudents, avoid, Math.random);

      // Unreleased Draft ersetzen
      const old = await pool.query(
        `SELECT id FROM crews WHERE class_id = $1 AND season_key = $2 AND released = FALSE`,
        [classId, seasonKey]
      );
      if (old.rows.length) {
        const oldIds = old.rows.map((r) => r.id);
        await pool.query(`DELETE FROM crew_members WHERE crew_id = ANY($1::uuid[])`, [oldIds]);
        await pool.query(`DELETE FROM crews WHERE id = ANY($1::uuid[])`, [oldIds]);
      }

      const names = COCKPIT_SEASON_CONFIG.fallbackCrewNames || [];
      const colors = COCKPIT_SEASON_CONFIG.fallbackCrewColors || [];
      const created = [];
      for (let i = 0; i < drawn.crews.length; i += 1) {
        const memberIds = drawn.crews[i];
        if (!memberIds.length) continue;
        const name = names[i % names.length] || `Crew ${i + 1}`;
        const color = colors[i % colors.length] || "#22d3ee";
        const ins = await pool.query(
          `
          INSERT INTO crews (school_id, class_id, season_key, name, color, tag_text, released)
          VALUES ($1, $2, $3, $4, $5, $6, FALSE)
          RETURNING id
        `,
          [user.school_id, classId, seasonKey, name, color, name,]
        );
        const crewId = ins.rows[0].id;
        for (const sid of memberIds) {
          await pool.query(
            `INSERT INTO crew_members (crew_id, student_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            [crewId, sid]
          );
        }
        created.push(crewId);
      }
      const crews = await listCrews(classId, seasonKey);
      res.json({
        success: true,
        seasonKey,
        crews,
        ok: drawn.ok,
        unresolved: drawn.unresolved,
        message: drawn.ok
          ? "Crews ausgelost (Entwurf – noch nicht freigegeben)."
          : "Ausgelost, aber einige „Nicht zusammen“-Paare konnten nicht getrennt werden."
      });
    } catch (err) {
      console.error("❌ POST /api/teacher/cockpit/crews/draw:", err);
      res.status(500).json({ success: false, message: "Serverfehler" });
    }
  });

  app.post("/api/teacher/cockpit/crews/swap", isTeacher, async (req, res) => {
    try {
      const classId = Number(req.body?.classId);
      if (!(await guardClass(req, res, classId))) return;
      const studentId = Number(req.body?.studentId);
      const toCrewId = String(req.body?.toCrewId || "");
      if (!studentId || !toCrewId) {
        return res.status(400).json({ success: false, message: "studentId und toCrewId nötig." });
      }
      const crewRes = await pool.query(
        `SELECT id, class_id, season_key, released FROM crews WHERE id = $1`,
        [toCrewId]
      );
      const toCrew = crewRes.rows[0];
      if (!toCrew || Number(toCrew.class_id) !== classId) {
        return res.status(404).json({ success: false, message: "Crew nicht gefunden." });
      }
      if (toCrew.released) {
        return res.status(400).json({ success: false, message: "Freigegebene Crews nicht mehr tauschen." });
      }
      await pool.query(
        `
        DELETE FROM crew_members
        WHERE student_id = $1
          AND crew_id IN (SELECT id FROM crews WHERE class_id = $2 AND season_key = $3)
      `,
        [studentId, classId, toCrew.season_key]
      );
      await pool.query(`INSERT INTO crew_members (crew_id, student_id) VALUES ($1, $2)`, [
        toCrewId,
        studentId
      ]);
      const crews = await listCrews(classId, toCrew.season_key);
      res.json({ success: true, crews, message: "Getauscht." });
    } catch (err) {
      console.error("❌ POST /api/teacher/cockpit/crews/swap:", err);
      res.status(500).json({ success: false, message: "Serverfehler" });
    }
  });

  app.post("/api/teacher/cockpit/crews/release", isTeacher, async (req, res) => {
    try {
      const classId = Number(req.body?.classId);
      if (!(await guardClass(req, res, classId))) return;
      const seasonKey = String(req.body?.seasonKey || seasonKeyFor(null, classId));
      await pool.query(
        `UPDATE crews SET released = TRUE WHERE class_id = $1 AND season_key = $2`,
        [classId, seasonKey]
      );
      const crews = await listCrews(classId, seasonKey);
      await recordCockpitEvent(pool, {
        schoolId: req.session.user.school_id,
        classId,
        typ: "crew_tag",
        data: { action: "release", seasonKey, count: crews.length }
      });
      res.json({ success: true, crews, message: "Crews freigegeben." });
    } catch (err) {
      console.error("❌ POST /api/teacher/cockpit/crews/release:", err);
      res.status(500).json({ success: false, message: "Serverfehler" });
    }
  });

  app.put("/api/teacher/cockpit/crews/:id", isTeacher, async (req, res) => {
    try {
      const id = String(req.params.id);
      const r = await pool.query(`SELECT id, class_id FROM crews WHERE id = $1`, [id]);
      const row = r.rows[0];
      if (!row) return res.status(404).json({ success: false, message: "Crew nicht gefunden." });
      if (!(await guardClass(req, res, Number(row.class_id)))) return;
      const name =
        req.body?.name != null ? String(req.body.name).trim().slice(0, 40) : undefined;
      const color =
        req.body?.color != null ? String(req.body.color).trim().slice(0, 32) : undefined;
      const tagText =
        req.body?.tagText != null || req.body?.tag_text != null
          ? String(req.body.tagText ?? req.body.tag_text)
              .trim()
              .slice(0, 40)
          : undefined;
      await pool.query(
        `
        UPDATE crews
        SET name = COALESCE($2, name),
            color = COALESCE($3, color),
            tag_text = COALESCE($4, tag_text)
        WHERE id = $1
      `,
        [id, name || null, color || null, tagText || null]
      );
      res.json({ success: true, message: "Crew gespeichert." });
    } catch (err) {
      console.error("❌ PUT /api/teacher/cockpit/crews/:id:", err);
      res.status(500).json({ success: false, message: "Serverfehler" });
    }
  });

  app.post("/api/teacher/cockpit/crews/avoid", isTeacher, async (req, res) => {
    try {
      const classId = Number(req.body?.classId);
      if (!(await guardClass(req, res, classId))) return;
      const a = Number(req.body?.studentA ?? req.body?.student_a);
      const b = Number(req.body?.studentB ?? req.body?.student_b);
      if (!a || !b || a === b) {
        return res.status(400).json({ success: false, message: "Zwei verschiedene Schüler:innen nötig." });
      }
      const [studentA, studentB] = a < b ? [a, b] : [b, a];
      await pool.query(
        `
        INSERT INTO crew_avoid_pairs (class_id, student_a, student_b)
        VALUES ($1, $2, $3)
        ON CONFLICT DO NOTHING
      `,
        [classId, studentA, studentB]
      );
      res.json({
        success: true,
        avoidPairs: await loadAvoidPairs(classId),
        message: "Paar gespeichert."
      });
    } catch (err) {
      console.error("❌ POST /api/teacher/cockpit/crews/avoid:", err);
      res.status(500).json({ success: false, message: "Serverfehler" });
    }
  });

  app.post("/api/teacher/cockpit/help-attribution", isTeacher, async (req, res) => {
    try {
      const user = req.session.user;
      const classId = Number(req.body?.classId);
      const studentId = Number(req.body?.studentId);
      if (!(await guardClass(req, res, classId))) return;
      if (!studentId) {
        return res.status(400).json({ success: false, message: "studentId fehlt." });
      }
      const kind = String(req.body?.helpedByKind || req.body?.helped_by_kind || "niemand").slice(0, 32);
      const allowed = new Set(["lehrkraft", "peer", "logic_coach", "taktik_deck", "niemand"]);
      if (!allowed.has(kind)) {
        return res.status(400).json({ success: false, message: "Ungültige Attribution." });
      }
      let helperId =
        kind === "peer" ? Number(req.body?.helpedByStudentId || req.body?.helped_by_student_id) : null;
      if (kind === "peer" && (!helperId || helperId === studentId)) {
        return res.status(400).json({ success: false, message: "Bitte Helfer:in wählen." });
      }
      if (kind !== "peer") helperId = null;
      const date = isoDay(req.body?.date) || (await today(req));
      await pool.query(
        `
        UPDATE teacher_coaching_state
        SET helped_by_kind = $3,
            helped_by_student_id = $4,
            help_closed_at = COALESCE(help_closed_at, NOW()),
            help_status = CASE WHEN help_status = 'closed' THEN help_status ELSE 'closed' END,
            closed_by = COALESCE(closed_by, $5),
            closed_at = COALESCE(closed_at, NOW()),
            updated_at = NOW()
        WHERE student_id = $1 AND coaching_date = $2::date
      `,
        [studentId, date, kind, helperId, user.id]
      );
      if (kind === "peer" && helperId) {
        await recordCockpitEvent(pool, {
          schoolId: user.school_id,
          classId,
          studentId: helperId,
          typ: "hilfe_erledigt",
          data: { helpedStudentId: studentId, kind }
        });
      } else if (kind !== "niemand") {
        await recordCockpitEvent(pool, {
          schoolId: user.school_id,
          classId,
          studentId,
          typ: "hilfe_erledigt",
          data: { kind }
        });
      }
      res.json({ success: true, message: "Hilfe-Attribution gespeichert." });
    } catch (err) {
      console.error("❌ POST /api/teacher/cockpit/help-attribution:", err);
      res.status(500).json({ success: false, message: "Serverfehler" });
    }
  });

  app.get("/api/teacher/cockpit/side-quests", isTeacher, async (req, res) => {
    try {
      const classId = Number(req.query.classId);
      if (!(await guardClass(req, res, classId))) return;
      const day = isoDay(req.query.date) || (await today(req));
      const students = await classStudents(classId, req.session.user.school_id);
      const templates = (COCKPIT_SEASON_CONFIG.sideQuestTemplates || []).map((t) => ({
        ...t,
        zielResolved: t.ziel === "class" ? students.length : Number(t.ziel) || 1
      }));
      const { row, auto } = await loadOrAutoSideQuest(
        req.session.user.school_id,
        classId,
        day,
        students.length
      );
      let quest = mapSideQuestRow(row, auto);
      if (quest) {
        const ev = await pool.query(
          `SELECT typ, created_at FROM cockpit_events WHERE class_id = $1 AND created_at::date = $2::date`,
          [classId, day]
        );
        const prog = sideQuestProgressFromEvents(ev.rows, quest.typ);
        const prevProgress = quest.progress;
        const prevDone = quest.done;
        quest.progress = Math.max(quest.progress, prog);
        quest.done = quest.done || prog >= quest.ziel;
        if (quest.progress !== prevProgress || quest.done !== prevDone) {
          await pool
            .query(`UPDATE side_quests SET progress = $2, done = $3 WHERE id = $1`, [
              quest.id,
              quest.progress,
              quest.done
            ])
            .catch(() => {});
        }
      }
      res.json({ success: true, date: day, templates, quest, auto: auto === true });
    } catch (err) {
      console.error("❌ GET /api/teacher/cockpit/side-quests:", err);
      res.status(500).json({ success: false, message: "Serverfehler" });
    }
  });

  app.post("/api/teacher/cockpit/side-quests", isTeacher, async (req, res) => {
    try {
      const user = req.session.user;
      const classId = Number(req.body?.classId);
      if (!(await guardClass(req, res, classId))) return;
      const day = isoDay(req.body?.date) || (await today(req));
      const templateId = String(req.body?.templateId || "");
      const templates = COCKPIT_SEASON_CONFIG.sideQuestTemplates || [];
      const tpl = templates.find((t) => t.id === templateId) || templates.find((t) => t.typ === req.body?.typ);
      if (!tpl) {
        return res.status(400).json({ success: false, message: "Vorlage nicht gefunden." });
      }
      const students = await classStudents(classId, user.school_id);
      const ziel = tpl.ziel === "class" ? students.length : Number(tpl.ziel) || 1;
      const text = String(req.body?.text || tpl.text).trim().slice(0, 240);
      const xp = Number(req.body?.xp ?? tpl.xp) || 0;
      const r = await pool.query(
        `
        INSERT INTO side_quests (school_id, class_id, quest_date, typ, text, ziel, xp, progress, done)
        VALUES ($1, $2, $3::date, $4, $5, $6, $7, 0, FALSE)
        ON CONFLICT (class_id, quest_date) DO UPDATE
          SET typ = EXCLUDED.typ, text = EXCLUDED.text, ziel = EXCLUDED.ziel, xp = EXCLUDED.xp,
              progress = 0, done = FALSE
        RETURNING *
      `,
        [user.school_id, classId, day, tpl.typ, text, ziel, xp]
      );
      const row = r.rows[0];
      res.json({
        success: true,
        quest: {
          id: row.id,
          date: isoDay(row.quest_date),
          typ: row.typ,
          text: row.text,
          ziel: Number(row.ziel),
          xp: Number(row.xp),
          progress: 0,
          done: false
        },
        message: "Side Quest für heute gesetzt."
      });
    } catch (err) {
      console.error("❌ POST /api/teacher/cockpit/side-quests:", err);
      res.status(500).json({ success: false, message: "Serverfehler" });
    }
  });

  app.get("/api/student/cockpit/crew", isStudent, async (req, res) => {
    try {
      const user = req.session.user;
      const classId = Number(user.class_id);
      if (!classId) return res.json({ success: true, crew: null });
      const r = await pool.query(
        `
        SELECT c.id, c.name, c.color, c.tag_text, c.released, c.season_key
        FROM crews c
        JOIN crew_members cm ON cm.crew_id = c.id
        WHERE cm.student_id = $1 AND c.class_id = $2
        ORDER BY c.released DESC, c.created_at DESC
        LIMIT 1
      `,
        [user.id, classId]
      );
      const crew = r.rows[0];
      if (!crew) return res.json({ success: true, crew: null });
      // Naming vor Freigabe erlaubt; nach Freigabe nur lesen
      const membersRes = await pool.query(
        `
        SELECT u.id, u.name
        FROM crew_members cm
        JOIN users u ON u.id = cm.student_id
        WHERE cm.crew_id = $1
        ORDER BY u.name
      `,
        [crew.id]
      );
      res.json({
        success: true,
        crew: {
          id: crew.id,
          name: crew.name,
          color: crew.color,
          tagText: crew.tag_text,
          released: crew.released === true,
          seasonKey: crew.season_key,
          canEdit: crew.released !== true,
          members: membersRes.rows.map((m) => ({
            id: Number(m.id),
            shortName: displayNameFromUser(m.name) || m.name
          }))
        }
      });
    } catch (err) {
      console.error("❌ GET /api/student/cockpit/crew:", err);
      res.status(500).json({ success: false, message: "Serverfehler" });
    }
  });

  app.post("/api/student/cockpit/crew", isStudent, async (req, res) => {
    try {
      const user = req.session.user;
      const classId = Number(user.class_id);
      const crewId = String(req.body?.crewId || "");
      if (!classId || !crewId) {
        return res.status(400).json({ success: false, message: "crewId fehlt." });
      }
      const r = await pool.query(
        `
        SELECT c.id, c.released
        FROM crews c
        JOIN crew_members cm ON cm.crew_id = c.id
        WHERE c.id = $1 AND c.class_id = $2 AND cm.student_id = $3
      `,
        [crewId, classId, user.id]
      );
      const crew = r.rows[0];
      if (!crew) return res.status(404).json({ success: false, message: "Crew nicht gefunden." });
      if (crew.released) {
        return res.status(400).json({ success: false, message: "Crew schon freigegeben." });
      }
      const name = req.body?.name != null ? String(req.body.name).trim().slice(0, 40) : null;
      const color = req.body?.color != null ? String(req.body.color).trim().slice(0, 32) : null;
      const tagText =
        req.body?.tagText != null ? String(req.body.tagText).trim().slice(0, 40) : null;
      await pool.query(
        `
        UPDATE crews
        SET name = COALESCE($2, name),
            color = COALESCE($3, color),
            tag_text = COALESCE($4, tag_text)
        WHERE id = $1
      `,
        [crewId, name, color, tagText]
      );
      res.json({ success: true, message: "Crew-Name gespeichert." });
    } catch (err) {
      console.error("❌ POST /api/student/cockpit/crew:", err);
      res.status(500).json({ success: false, message: "Serverfehler" });
    }
  });

  /** Schüler: Name am Beamer erlauben (Default false). */
  app.post("/api/student/beamer-name", isStudent, async (req, res) => {
    try {
      const raw = req.body?.beamerNameOk ?? req.body?.beamer_name_ok;
      if (raw === undefined || raw === null) {
        return res.status(400).json({ success: false, message: "beamerNameOk fehlt." });
      }
      const beamerNameOk =
        raw === true || raw === "true" || raw === 1 || raw === "1";
      await pool.query(`UPDATE users SET beamer_name_ok = $1 WHERE id = $2`, [
        beamerNameOk,
        req.session.user.id
      ]);
      res.json({ success: true, beamerNameOk });
    } catch (err) {
      console.error("❌ POST /api/student/beamer-name:", err);
      res.status(500).json({ success: false, message: "Serverfehler" });
    }
  });

  app.get("/api/student/class-game", isStudent, async (req, res) => {
    try {
      const user = req.session.user;
      const classId = Number(user.class_id);
      if (!classId) return res.json({ success: true, game: null });
      const day = await today(req);
      const students = await classStudents(classId, user.school_id);
      const studentIds = students.map((s) => s.id);
      const reflected = await reflectedToday(studentIds, day);
      const me = Number(user.id);
      const [game, teamBundle] = await Promise.all([
        loadGame({ classId, schoolId: user.school_id, day, students, reflected, meId: me }),
        loadTeams(classId, user.school_id, studentIds, reflected, day, null)
      ]);
      const drawn = game.raffle.drawn;
      const team = game.team;
      // Eigene Gruppe: nur Namen der Teammitglieder, kein Wer-fehlt-Status (keine öffentliche Beschämung).
      const mine =
        teamBundle.teams.find((t) => t.source === "work" && t.members.some((m) => m.id === me)) ||
        teamBundle.teams.find((t) => t.members.some((m) => m.id === me)) ||
        null;
      const myTeam = mine
        ? {
            name: mine.name,
            subject: mine.subject || null,
            sessionTitle: mine.sessionTitle || null,
            members: mine.members.map((m) => m.name),
            yours: true
          }
        : null;
      res.json({
        success: true,
        date: day,
        game: {
          klassenziel: game.klassenziel,
          mission: game.mission && game.mission.active
            ? {
                title: game.mission.title,
                tierLabel: game.mission.tierLabel,
                dueDate: game.mission.dueDate,
                done: game.mission.done,
                total: game.mission.total,
                mine: game.mission.mine === true
              }
            : null,
          raffle: {
            inPot: game.raffle.inPot === true,
            myTickets: Number(game.raffle.myTickets) || 0,
            eligibleCount: game.raffle.eligibleCount,
            drawn: drawn
              ? { winnerShort: drawn.winnerShort, xp: drawn.xp, youWon: drawn.winnerId === me }
              : null
          },
          team: team
            ? {
                name: team.name,
                xpEach: team.xpEach,
                yours: team.memberIds.includes(me),
                members: (team.members || []).map((m) => m.name)
              }
            : null,
          myTeam: team ? null : myTeam
        }
      });
    } catch (err) {
      console.error("❌ /api/student/class-game:", err);
      res.status(500).json({ success: false, message: "Serverfehler" });
    }
  });
}
