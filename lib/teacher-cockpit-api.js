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
  raffleEligible,
  resolveClassLevels,
  studentPosition,
  teamStats,
  trainingBoard,
  unitTimeline,
  weekStart,
  wrapStatusForLevels,
  addDays
} from "./teacher-cockpit.js";

export const XP_SOURCE_RAFFLE = "klassenspiel_ziehung";
export const XP_SOURCE_TEAM = "klassenspiel_team";

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
    randomInt = (n) => crypto.randomInt(n)
  } = deps;

  async function today(req) {
    return (await resolveSchoolDate?.(req, null)) || todayIsoDate?.() || isoDay(new Date());
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
      SELECT u.id, u.name, COALESCE(u.xp, 0) AS xp, l.name AS rang
      FROM users u
      LEFT JOIN levels l ON l.id = u.level_id
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
      xp: Number(row.xp) || 0,
      rang: row.rang || null
    }));
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

  async function newSicherToday(studentIds, day) {
    if (!studentIds.length) return new Map();
    const r = await pool.query(
      `
      SELECT user_id, COUNT(*)::int AS n
      FROM level_check_marks
      WHERE user_id = ANY($1::int[]) AND status = 'sicher' AND updated_at::date = $2::date
      GROUP BY user_id
    `,
      [studentIds, day]
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
      total: progress.total
    };
    if (meId != null) {
      view.mine = classMissionDone(goalIds, row.tier, (goalId, tier) => statusOf(meId, goalId, tier));
    }
    return view;
  }

  async function loadGame({ classId, schoolId, day, students, reflected, meId = null }) {
    const studentIds = students.map((s) => s.id);
    const [total, roundRes, todayXpRes, weekRes, missionRow, raffleRes, teamRes] = await Promise.all([
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
      )
    ]);
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
        reflected: reflected.has(Number(id))
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
        eligibleCount: raffleEligible(studentIds, reflected).length,
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
      const [checks, game] = await Promise.all([
        getLevelChecksForClass?.(classId, user.school_id) || [],
        loadGame({ classId, schoolId: user.school_id, day, students, reflected })
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
          xp: s.xp,
          rang: s.rang,
          reflectedToday: reflected.has(s.id)
        })),
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

      const [targetsRes, marks, trainingRes, entriesRes, recentRes, timetableRes, coachRes] = await Promise.all([
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
        )
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
          .reverse()
      });
    } catch (err) {
      console.error("❌ /api/teacher/cockpit:", err);
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
      await pool.query(
        `UPDATE class_learning_missions SET active = FALSE, closed_at = NOW() WHERE class_id = $1 AND active = TRUE`,
        [classId]
      );
      const r = await pool.query(
        `
        INSERT INTO class_learning_missions
          (school_id, class_id, level_check_id, title, goal_ids, mission_numbers, tier, due_date, created_by)
        VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8, $9)
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
          user.id
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
      const students = await classStudents(classId, user.school_id);
      const reflected = await reflectedToday(
        students.map((s) => s.id),
        day
      );
      const eligible = raffleEligible(
        students.map((s) => s.id),
        reflected
      );
      if (!eligible.length) {
        return res.status(400).json({
          success: false,
          message: "Heute hat noch niemand den Tag abgeschlossen. Im Lostopf ist noch niemand."
        });
      }
      const winnerId = pickWinner(eligible, randomInt);
      const claim = await pool.query(
        `
        INSERT INTO class_raffle_draws (school_id, class_id, draw_date, winner_id, eligible_count, xp, drawn_by)
        VALUES ($1, $2, $3::date, $4, $5, $6, $7)
        ON CONFLICT (class_id, draw_date) DO NOTHING
        RETURNING id
      `,
        [user.school_id, classId, day, winnerId, eligible.length, xp, user.id]
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
      res.json({
        success: true,
        winner: { id: winnerId, name: winner?.name || "", short: displayNameFromUser(winner?.name) },
        xp,
        eligibleCount: eligible.length,
        message: `${displayNameFromUser(winner?.name)} gewinnt ${xp} XP.`
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
            inPot: reflected.has(me),
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
