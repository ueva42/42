/**
 * Lehrer-Coaching-APIs: Heute, Klassen, Schülerdetail, Feedback, Admin-Lehrerverwaltung.
 */
import {
  getAccessibleClassIds,
  listAccessibleClasses,
  teacherCanAccessClass,
  teacherCanAccessStudent,
  userCanAccessAdminArea,
  userCanAccessTeacherArea
} from "./teacher-auth.js";
import {
  FEEDBACK_CHIPS,
  TeacherCoachingAssistant,
  buildTodayCoachingView
} from "./teacher-insights.js";
import { buildThemenCockpit, extractHelpFromCheck } from "./teacher-matrix.js";

/** Levelcheck-Auswahl für die Matrix: Themen mit Unterthemen + nächstem Checkpoint. */
function summarizeLevelCheckForPicker(check, today, helpers) {
  const cps = Array.isArray(check.checkpoints) ? check.checkpoints : [];
  const dated = cps
    .filter((cp) => cp.checkpointDate)
    .sort((a, b) => a.checkpointDate.localeCompare(b.checkpointDate));
  const upcoming = dated.find((cp) => cp.checkpointDate >= today) || null;
  const pick = upcoming || dated[dated.length - 1] || null;
  const typeLabel = pick
    ? helpers.resolveCheckpointTypeLabel?.(pick.checkpointType, pick.checkpointTypeLabel) ||
      pick.checkpointType
    : null;
  return {
    id: String(check.id),
    subject: check.subject,
    name: check.name,
    catalogName: check.catalogName || null,
    goalCount: Array.isArray(check.goals) ? check.goals.length : 0,
    checkpointDate: pick?.checkpointDate || null,
    checkpointDateLabel: pick ? helpers.formatGermanDate?.(pick.checkpointDate) || pick.checkpointDate : null,
    checkpointTypeLabel: typeLabel,
    checkpointUpcoming: Boolean(upcoming)
  };
}

function pickDefaultLevelCheck(picker) {
  if (!picker.length) return null;
  const upcoming = picker
    .filter((p) => p.checkpointUpcoming && p.checkpointDate)
    .sort((a, b) => a.checkpointDate.localeCompare(b.checkpointDate));
  if (upcoming.length) return upcoming[0];
  const past = picker
    .filter((p) => p.checkpointDate)
    .sort((a, b) => b.checkpointDate.localeCompare(a.checkpointDate));
  if (past.length) return past[0];
  return picker[0];
}

function normalizeIsoDate(raw) {
  const s = String(raw || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return s;
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function parseChips(raw) {
  if (!Array.isArray(raw)) return [];
  const allowed = new Set(FEEDBACK_CHIPS.map((c) => c.id));
  return [...new Set(raw.map((x) => String(x || "").trim()).filter((id) => allowed.has(id)))];
}

async function loadClassDayBundle(pool, schoolId, classId, date) {
  const classRes = await pool.query(
    `SELECT id, name FROM classes WHERE id = $1 AND school_id = $2`,
    [classId, schoolId]
  );
  if (!classRes.rows.length) return null;

  const studentsRes = await pool.query(
    `
    SELECT id, name
    FROM users
    WHERE role = 'student'
      AND class_id = $1
      AND school_id = $2
      AND COALESCE(is_active, TRUE) = TRUE
    ORDER BY name ASC
  `,
    [classId, schoolId]
  );

  const studentIds = studentsRes.rows.map((s) => s.id);
  const entriesBy = {};
  const checksBy = {};
  const reflectionsBy = {};
  const recentBy = {};
  const feedbackBy = {};

  if (studentIds.length) {
    const entriesRes = await pool.query(
      `
      SELECT *
      FROM log_entries
      WHERE user_id = ANY($1::int[])
        AND date = $2
      ORDER BY timeslot ASC NULLS LAST, subject ASC
    `,
      [studentIds, date]
    );
    for (const row of entriesRes.rows) {
      if (!entriesBy[row.user_id]) entriesBy[row.user_id] = [];
      entriesBy[row.user_id].push(row);
    }

    const entryIds = entriesRes.rows.map((e) => e.id);
    if (entryIds.length) {
      const checksRes = await pool.query(
        `
        SELECT *
        FROM log_checks
        WHERE log_entry_id = ANY($1::uuid[])
      `,
        [entryIds]
      );
      for (const row of checksRes.rows) {
        const entry = entriesRes.rows.find((e) => e.id === row.log_entry_id);
        if (!entry) continue;
        if (!checksBy[entry.user_id]) checksBy[entry.user_id] = [];
        checksBy[entry.user_id].push(row);
      }

      const reflRes = await pool.query(
        `
        SELECT *
        FROM log_reflections
        WHERE log_entry_id = ANY($1::uuid[])
      `,
        [entryIds]
      );
      for (const row of reflRes.rows) {
        const entry = entriesRes.rows.find((e) => e.id === row.log_entry_id);
        if (!entry) continue;
        if (!reflectionsBy[entry.user_id]) reflectionsBy[entry.user_id] = [];
        reflectionsBy[entry.user_id].push({ ...row, log_entry_id: row.log_entry_id });
      }
    }

    const streakRes = await pool.query(
      `
      SELECT le.user_id, lr.goal_achieved, le.date, lr.confidence_after
      FROM log_reflections lr
      JOIN log_entries le ON le.id = lr.log_entry_id
      WHERE le.user_id = ANY($1::int[])
        AND le.date <= $2
      ORDER BY le.user_id ASC, le.date DESC, le.created_at DESC
    `,
      [studentIds, date]
    );
    for (const row of streakRes.rows) {
      if (!recentBy[row.user_id]) recentBy[row.user_id] = [];
      if (recentBy[row.user_id].length < 8) recentBy[row.user_id].push(row);
    }

    const fbRes = await pool.query(
      `
      SELECT id, student_id, chips, note, conversation_held, created_at
      FROM teacher_feedback
      WHERE student_id = ANY($1::int[])
        AND feedback_date = $2
        AND school_id = $3
      ORDER BY created_at DESC
    `,
      [studentIds, date, schoolId]
    );
    for (const row of fbRes.rows) {
      if (!feedbackBy[row.student_id]) feedbackBy[row.student_id] = [];
      feedbackBy[row.student_id].push(row);
    }
  }

  return {
    classId: classRes.rows[0].id,
    className: classRes.rows[0].name,
    students: studentsRes.rows.map((s) => ({
      id: s.id,
      name: s.name,
      entries: entriesBy[s.id] || [],
      checks: checksBy[s.id] || [],
      reflections: reflectionsBy[s.id] || [],
      recentReflections: recentBy[s.id] || [],
      feedbackToday: feedbackBy[s.id] || []
    }))
  };
}

async function upsertCoachingState(pool, {
  schoolId,
  studentId,
  classId,
  date,
  logEntryId,
  goalId,
  patch
}) {
  const existing = await pool.query(
    `
    SELECT *
    FROM teacher_coaching_state
    WHERE student_id = $1 AND coaching_date = $2::date
    LIMIT 1
  `,
    [studentId, date]
  );
  if (!existing.rows.length) {
    const inserted = await pool.query(
      `
      INSERT INTO teacher_coaching_state (
        school_id, student_id, class_id, coaching_date, log_entry_id, goal_id,
        help_status, help_concern, help_requested_at,
        taken_over_by, taken_over_at, closed_by, closed_at,
        note, next_step
      )
      VALUES (
        $1,$2,$3,$4::date,$5,$6,
        $7,$8,$9,
        $10,$11,$12,$13,
        $14,$15
      )
      RETURNING *
    `,
      [
        schoolId,
        studentId,
        classId,
        date,
        logEntryId || null,
        goalId || null,
        patch.help_status || "none",
        patch.help_concern || null,
        patch.help_requested_at || null,
        patch.taken_over_by || null,
        patch.taken_over_at || null,
        patch.closed_by || null,
        patch.closed_at || null,
        patch.note || null,
        patch.next_step || null
      ]
    );
    return inserted.rows[0];
  }

  const cur = existing.rows[0];
  const next = {
    log_entry_id: logEntryId ?? cur.log_entry_id,
    goal_id: goalId ?? cur.goal_id,
    help_status: patch.help_status ?? cur.help_status,
    help_concern: patch.help_concern !== undefined ? patch.help_concern : cur.help_concern,
    help_requested_at:
      patch.help_requested_at !== undefined ? patch.help_requested_at : cur.help_requested_at,
    taken_over_by: patch.taken_over_by !== undefined ? patch.taken_over_by : cur.taken_over_by,
    taken_over_at: patch.taken_over_at !== undefined ? patch.taken_over_at : cur.taken_over_at,
    closed_by: patch.closed_by !== undefined ? patch.closed_by : cur.closed_by,
    closed_at: patch.closed_at !== undefined ? patch.closed_at : cur.closed_at,
    note: patch.note !== undefined ? patch.note : cur.note,
    next_step: patch.next_step !== undefined ? patch.next_step : cur.next_step
  };

  const updated = await pool.query(
    `
    UPDATE teacher_coaching_state
    SET class_id = $3,
        log_entry_id = $4,
        goal_id = $5,
        help_status = $6,
        help_concern = $7,
        help_requested_at = $8,
        taken_over_by = $9,
        taken_over_at = $10,
        closed_by = $11,
        closed_at = $12,
        note = $13,
        next_step = $14,
        updated_at = NOW()
    WHERE student_id = $1 AND coaching_date = $2::date
    RETURNING *
  `,
    [
      studentId,
      date,
      classId,
      next.log_entry_id,
      next.goal_id,
      next.help_status,
      next.help_concern,
      next.help_requested_at,
      next.taken_over_by,
      next.taken_over_at,
      next.closed_by,
      next.closed_at,
      next.note,
      next.next_step
    ]
  );
  return updated.rows[0];
}

export function registerTeacherCoachingRoutes(app, deps) {
  const {
    pool,
    isTeacher,
    isAdmin,
    resolveSchoolDate,
    ensureColumn,
    getLevelChecksForClass,
    resolveCheckpointTypeLabel,
    formatGermanDate,
    publicImageUrl,
    getGradeRequirements
  } = deps;

  const assistant = new TeacherCoachingAssistant({ enabled: false });

  // -------------------------------------------------------
  // Themen-Cockpit (Heute-Anker)
  // -------------------------------------------------------
  app.get("/api/teacher/levelcheck-matrix", isTeacher, async (req, res) => {
    try {
      const user = req.session.user;
      const classId = Number(req.query.classId);
      if (!classId || !(await teacherCanAccessClass(pool, user, classId))) {
        return res.status(403).json({ success: false, message: "Kein Zugriff auf diese Klasse." });
      }
      const date =
        (await resolveSchoolDate?.(req, req.query.date)) ||
        normalizeIsoDate(req.query.date) ||
        todayIsoDate();

      const classRes = await pool.query(
        `SELECT id, name FROM classes WHERE id = $1 AND school_id = $2`,
        [classId, user.school_id]
      );
      if (!classRes.rows.length) {
        return res.status(404).json({ success: false, message: "Klasse nicht gefunden." });
      }

      const checks = (await getLevelChecksForClass?.(classId, user.school_id)) || [];
      const helpers = { resolveCheckpointTypeLabel, formatGermanDate };
      const picker = checks
        .filter((c) => Array.isArray(c.goals) && c.goals.length)
        .map((c) => summarizeLevelCheckForPicker(c, date, helpers));

      const requestedId = String(req.query.levelCheckId || "").trim();
      const chosen =
        picker.find((p) => p.id === requestedId) || pickDefaultLevelCheck(picker) || null;
      const check = chosen ? checks.find((c) => String(c.id) === chosen.id) : null;

      const studentsRes = await pool.query(
        `
        SELECT u.id, u.name, u.character_id, ch.image_url AS character_image
        FROM users u
        LEFT JOIN characters ch ON ch.id = u.character_id
        WHERE u.role = 'student'
          AND u.class_id = $1
          AND u.school_id = $2
          AND COALESCE(u.is_active, TRUE) = TRUE
        ORDER BY u.name ASC
      `,
        [classId, user.school_id]
      );
      const students = studentsRes.rows.map((s) => ({
        id: s.id,
        name: s.name,
        avatarUrl: publicImageUrl ? publicImageUrl(s.character_image) : s.character_image || null
      }));

      if (!check) {
        const emptyCockpit = buildThemenCockpit({
          students,
          goals: [],
          date,
          getGradeRequirements
        });
        return res.json({
          date,
          classId,
          className: classRes.rows[0].name,
          levelChecks: picker,
          levelCheck: null,
          cockpit: emptyCockpit,
          lernstadt: emptyCockpit,
          matrix: emptyCockpit,
          message: picker.length
            ? "Bitte einen Levelcheck wählen."
            : "Für diese Klasse ist noch kein Levelcheck mit Unterthemen angelegt."
        });
      }

      const goals = check.goals.map((g) => ({
        id: String(g.id),
        text: g.text,
        sortOrder: g.sortOrder ?? 0
      }));
      const goalIds = goals.map((g) => g.id);
      const studentIds = students.map((s) => s.id);
      const checkpoints = Array.isArray(check.checkpoints) ? check.checkpoints : [];
      const checkpointIds = checkpoints.map((cp) => String(cp.id));

      let marks = [];
      let todayEntries = [];
      let pastEntries = [];
      let checksRows = [];
      let reflections = [];
      let evaluations = [];
      let targets = [];
      let coachingStates = [];

      if (studentIds.length) {
        const [marksRes, todayRes, targetsRes, coachingRes, pastRes] = await Promise.all([
          goalIds.length
            ? pool.query(
                `
                SELECT user_id, goal_id, tier, status, updated_at
                FROM level_check_marks
                WHERE user_id = ANY($1::int[]) AND goal_id = ANY($2::uuid[])
              `,
                [studentIds, goalIds]
              )
            : Promise.resolve({ rows: [] }),
          pool.query(
            `
            SELECT id, user_id, date, subject, timeslot, goal,
              what_goal_id, what_goal_text, selected_level, level_goal_text,
              confidence_before, created_at
            FROM log_entries
            WHERE user_id = ANY($1::int[])
              AND date = $2::date
            ORDER BY timeslot ASC NULLS LAST, created_at ASC
          `,
            [studentIds, date]
          ),
          pool.query(
            `
            SELECT user_id, target_grade, target_grade_key, next_goal_text, levelcheck_percent
            FROM level_check_targets
            WHERE user_id = ANY($1::int[]) AND level_check_id = $2::uuid
          `,
            [studentIds, check.id]
          ),
          pool.query(
            `
            SELECT tcs.*, u.name AS taken_over_by_name
            FROM teacher_coaching_state tcs
            LEFT JOIN users u ON u.id = tcs.taken_over_by
            WHERE tcs.student_id = ANY($1::int[])
              AND tcs.coaching_date = $2::date
              AND tcs.school_id = $3
          `,
            [studentIds, date, user.school_id]
          ),
          goalIds.length
            ? pool.query(
                `
                SELECT DISTINCT ON (le.user_id)
                  le.id, le.user_id, le.date, le.subject, le.timeslot, le.goal,
                  le.what_goal_id, le.what_goal_text, le.selected_level, le.created_at
                FROM log_entries le
                WHERE le.user_id = ANY($1::int[])
                  AND le.date < $2::date
                  AND le.what_goal_id = ANY($3::uuid[])
                ORDER BY le.user_id, le.date DESC, le.created_at DESC
              `,
                [studentIds, date, goalIds]
              )
            : Promise.resolve({ rows: [] })
        ]);
        marks = marksRes.rows;
        todayEntries = todayRes.rows;
        targets = targetsRes.rows;
        coachingStates = coachingRes.rows;
        pastEntries = pastRes.rows;

        const entryIds = todayEntries.map((e) => e.id);
        if (entryIds.length) {
          const [checksRes, reflRes] = await Promise.all([
            pool.query(
              `
              SELECT log_entry_id, on_track, understands, progress, next_step_answer,
                change_note, selected_strategy_problem, selected_strategy_next_step, created_at
              FROM log_checks
              WHERE log_entry_id = ANY($1::uuid[])
            `,
              [entryIds]
            ),
            pool.query(
              `
              SELECT log_entry_id, goal_achieved, goal_reached_answer, confidence_after, next_step
              FROM log_reflections
              WHERE log_entry_id = ANY($1::uuid[])
            `,
              [entryIds]
            )
          ]);
          checksRows = checksRes.rows;
          reflections = reflRes.rows;
        }

        if (checkpointIds.length) {
          const evalRes = await pool.query(
            `
            SELECT e.checkpoint_id, e.user_id, e.status, e.percent, e.updated_at,
              cp.checkpoint_date
            FROM level_check_checkpoint_evaluations e
            JOIN level_check_checkpoints cp ON cp.id = e.checkpoint_id
            WHERE e.user_id = ANY($1::int[]) AND e.checkpoint_id = ANY($2::uuid[])
          `,
            [studentIds, checkpointIds]
          );
          evaluations = evalRes.rows.map((row) => ({
            ...row,
            checkpointDate: row.checkpoint_date ? isoDaySafe(row.checkpoint_date) : null
          }));
        }
      }

      const cockpit = buildThemenCockpit({
        students,
        goals,
        todayEntries,
        pastEntries,
        checks: checksRows,
        reflections,
        marks,
        targets,
        evaluations,
        coachingStates,
        date,
        getGradeRequirements
      });

      res.json({
        date,
        classId,
        className: classRes.rows[0].name,
        levelChecks: picker,
        levelCheck: {
          ...chosen,
          checkpoints: checkpoints.map((cp) => ({
            id: String(cp.id),
            date: cp.checkpointDate,
            dateLabel: formatGermanDate?.(cp.checkpointDate) || cp.checkpointDate,
            typeLabel:
              resolveCheckpointTypeLabel?.(cp.checkpointType, cp.checkpointTypeLabel) ||
              cp.checkpointType
          }))
        },
        cockpit,
        lernstadt: cockpit,
        matrix: cockpit
      });
    } catch (err) {
      console.error("❌ /api/teacher/levelcheck-matrix:", err);
      res.status(500).json({ success: false, message: "Serverfehler" });
    }
  });

  function isoDaySafe(value) {
    return String(value || "").slice(0, 10);
  }

  // -------------------------------------------------------
  // Lehrer-Aktionen: Begleitung / Hilfe / Notiz / nächster Schritt
  // -------------------------------------------------------
  app.post("/api/teacher/coaching", isTeacher, async (req, res) => {
    try {
      const user = req.session.user;
      const action = String(req.body?.action || "").trim();
      const studentId = Number(req.body?.studentId);
      const date = normalizeIsoDate(req.body?.date) || todayIsoDate();
      const logEntryId = req.body?.logEntryId ? String(req.body.logEntryId) : null;
      const goalId = req.body?.goalId ? String(req.body.goalId) : null;
      const note =
        typeof req.body?.note === "string" ? req.body.note.trim().slice(0, 800) : undefined;
      const nextStep =
        typeof req.body?.nextStep === "string"
          ? req.body.nextStep.trim().slice(0, 500)
          : undefined;

      const allowed = new Set(["takeover", "close_help", "save_note", "save_next_step"]);
      if (!allowed.has(action)) {
        return res.status(400).json({ success: false, message: "Unbekannte Aktion." });
      }
      if (!studentId || !(await teacherCanAccessStudent(pool, user, studentId))) {
        return res.status(403).json({ success: false, message: "Kein Zugriff." });
      }

      const studentRes = await pool.query(
        `SELECT id, class_id FROM users WHERE id = $1 AND role = 'student' AND school_id = $2`,
        [studentId, user.school_id]
      );
      if (!studentRes.rows.length) {
        return res.status(404).json({ success: false, message: "Schüler nicht gefunden." });
      }
      const classId = studentRes.rows[0].class_id;

      let helpConcern = null;
      let helpRequestedAt = null;
      if (logEntryId) {
        const checkRes = await pool.query(
          `
          SELECT on_track, understands, progress, next_step_answer, change_note,
            selected_strategy_problem, selected_strategy_next_step, created_at
          FROM log_checks
          WHERE log_entry_id = $1::uuid
          LIMIT 1
        `,
          [logEntryId]
        );
        const help = extractHelpFromCheck(checkRes.rows[0] || null);
        if (help) {
          helpConcern = help.concern;
          helpRequestedAt = help.requestedAt;
        }
      }

      let patch = {};
      let message = "Gespeichert.";

      if (action === "takeover") {
        patch = {
          help_status: "taken_over",
          help_concern: helpConcern,
          help_requested_at: helpRequestedAt || new Date().toISOString(),
          taken_over_by: user.id,
          taken_over_at: new Date().toISOString(),
          closed_by: null,
          closed_at: null
        };
        message = "Begleitung übernommen.";
      } else if (action === "close_help") {
        patch = {
          help_status: "closed",
          closed_by: user.id,
          closed_at: new Date().toISOString()
        };
        if (note !== undefined) patch.note = note || null;
        if (nextStep !== undefined) patch.next_step = nextStep || null;
        message = "Hilfe abgeschlossen.";
      } else if (action === "save_note") {
        if (note === undefined || !note) {
          return res.status(400).json({ success: false, message: "Bitte eine Notiz eingeben." });
        }
        patch = { note };
        message = "Begleitnotiz gespeichert.";
      } else if (action === "save_next_step") {
        if (nextStep === undefined || !nextStep) {
          return res
            .status(400)
            .json({ success: false, message: "Bitte einen nächsten Lernschritt eingeben." });
        }
        patch = { next_step: nextStep };
        message = "Nächster Lernschritt vereinbart.";
      }

      const row = await upsertCoachingState(pool, {
        schoolId: user.school_id,
        studentId,
        classId,
        date,
        logEntryId,
        goalId,
        patch
      });

      res.json({
        success: true,
        message,
        coaching: {
          helpStatus: row.help_status,
          note: row.note,
          nextStep: row.next_step,
          takenOverAt: row.taken_over_at,
          closedAt: row.closed_at
        }
      });
    } catch (err) {
      console.error("❌ POST /api/teacher/coaching:", err);
      res.status(500).json({ success: false, message: "Serverfehler" });
    }
  });

  // -------------------------------------------------------
  // Lehrer: Profil / Klassen
  // -------------------------------------------------------
  app.get("/api/teacher/me", isTeacher, async (req, res) => {
    try {
      const user = req.session.user;
      const r = await pool.query(
        `
        SELECT u.id, u.name, u.role, COALESCE(u.is_active, TRUE) AS is_active, s.name AS school
        FROM users u
        LEFT JOIN schools s ON s.id = u.school_id
        WHERE u.id = $1
        LIMIT 1
      `,
        [user.id]
      );
      if (!r.rows.length) {
        return res.status(404).json({ success: false, message: "Nutzer nicht gefunden." });
      }
      const row = r.rows[0];
      const classes = await listAccessibleClasses(pool, user);
      res.json({
        success: true,
        id: row.id,
        name: row.name,
        role: row.role,
        canAdmin: userCanAccessAdminArea(user),
        canTeacher: userCanAccessTeacherArea(user),
        school: row.school,
        schoolId: user.school_id,
        classes,
        feedbackChips: FEEDBACK_CHIPS
      });
    } catch (err) {
      console.error("❌ /api/teacher/me:", err);
      res.status(500).json({ success: false, message: "Serverfehler" });
    }
  });

  app.get("/api/teacher/classes", isTeacher, async (req, res) => {
    try {
      const classes = await listAccessibleClasses(pool, req.session.user);
      res.json(classes);
    } catch (err) {
      console.error("❌ /api/teacher/classes:", err);
      res.status(500).json({ success: false, message: "Serverfehler" });
    }
  });

  // -------------------------------------------------------
  // Heute – Kennzahlen + Insight-Karten
  // -------------------------------------------------------
  app.get("/api/teacher/today", isTeacher, async (req, res) => {
    try {
      const user = req.session.user;
      const date =
        (await resolveSchoolDate?.(req, req.query.date)) ||
        normalizeIsoDate(req.query.date) ||
        todayIsoDate();
      let classId = Number(req.query.classId);
      const accessible = await getAccessibleClassIds(pool, user);

      if (!accessible.length) {
        return res.json({
          date,
          classId: null,
          className: null,
          classes: [],
          stats: {
            studentCount: 0,
            plannedCount: 0,
            reflectedCount: 0,
            needsAttentionCount: 0,
            positiveCount: 0
          },
          insights: [],
          insightTotal: 0,
          message: "Keine Klasse zugewiesen."
        });
      }

      if (!classId || !accessible.includes(classId)) {
        classId = accessible[0];
      }

      const bundle = await loadClassDayBundle(pool, user.school_id, classId, date);
      if (!bundle) {
        return res.status(404).json({ success: false, message: "Klasse nicht gefunden." });
      }

      const view = buildTodayCoachingView({
        classId: bundle.classId,
        className: bundle.className,
        date,
        students: bundle.students
      });
      view.insights = await assistant.enrichInsights(view.insights);
      view.classes = await listAccessibleClasses(pool, user);
      view.greetingName = (
        await pool.query(`SELECT name FROM users WHERE id = $1`, [user.id])
      ).rows[0]?.name || "";

      res.json(view);
    } catch (err) {
      console.error("❌ /api/teacher/today:", err);
      res.status(500).json({ success: false, message: "Serverfehler" });
    }
  });

  // -------------------------------------------------------
  // Klassenübersicht (Cards)
  // -------------------------------------------------------
  app.get("/api/teacher/class-overview", isTeacher, async (req, res) => {
    try {
      const user = req.session.user;
      const date =
        (await resolveSchoolDate?.(req, req.query.date)) ||
        normalizeIsoDate(req.query.date) ||
        todayIsoDate();
      const classes = await listAccessibleClasses(pool, user);
      const cards = [];

      for (const cls of classes) {
        const bundle = await loadClassDayBundle(pool, user.school_id, cls.id, date);
        if (!bundle) continue;
        const view = buildTodayCoachingView({
          classId: bundle.classId,
          className: bundle.className,
          date,
          students: bundle.students
        });
        cards.push({
          classId: cls.id,
          className: cls.name,
          date,
          studentCount: view.stats.studentCount,
          plannedCount: view.stats.plannedCount,
          needsAttentionCount: view.stats.needsAttentionCount,
          positiveCount: view.stats.positiveCount,
          students: view.students || []
        });
      }

      res.json({ date, classes: cards });
    } catch (err) {
      console.error("❌ /api/teacher/class-overview:", err);
      res.status(500).json({ success: false, message: "Serverfehler" });
    }
  });

  // -------------------------------------------------------
  // Schülerdetail
  // -------------------------------------------------------
  app.get("/api/teacher/student/:studentId", isTeacher, async (req, res) => {
    try {
      const user = req.session.user;
      const studentId = Number(req.params.studentId);
      const date =
        (await resolveSchoolDate?.(req, req.query.date)) ||
        normalizeIsoDate(req.query.date) ||
        todayIsoDate();

      if (!(await teacherCanAccessStudent(pool, user, studentId))) {
        return res.status(403).json({ success: false, message: "Kein Zugriff auf diesen Schüler." });
      }

      const studentRes = await pool.query(
        `
        SELECT u.id, u.name, u.class_id, c.name AS class_name
        FROM users u
        LEFT JOIN classes c ON c.id = u.class_id
        WHERE u.id = $1 AND u.role = 'student' AND u.school_id = $2
      `,
        [studentId, user.school_id]
      );
      if (!studentRes.rows.length) {
        return res.status(404).json({ success: false, message: "Schüler nicht gefunden." });
      }
      const student = studentRes.rows[0];

      const entriesRes = await pool.query(
        `
        SELECT le.*,
          lc.on_track, lc.understands, lc.progress, lc.next_step_answer,
          lc.change_note AS check_change_note,
          lr.goal_achieved, lr.confidence_after, lr.next_step,
          lr.goal_reached_answer, lr.learned_today, lr.strategy_helped_answer
        FROM log_entries le
        LEFT JOIN log_checks lc ON lc.log_entry_id = le.id
        LEFT JOIN log_reflections lr ON lr.log_entry_id = le.id
        WHERE le.user_id = $1 AND le.date = $2
        ORDER BY le.timeslot ASC NULLS LAST, le.subject ASC
      `,
        [studentId, date]
      );

      const weekStart = (() => {
        const d = new Date(`${date}T12:00:00`);
        const day = d.getDay();
        const diff = day === 0 ? -6 : 1 - day;
        d.setDate(d.getDate() + diff);
        return d.toISOString().slice(0, 10);
      })();

      const historyRes = await pool.query(
        `
        SELECT le.date, le.subject, le.goal, le.confidence_before,
          lr.goal_achieved, lr.confidence_after, lr.next_step
        FROM log_entries le
        LEFT JOIN log_reflections lr ON lr.log_entry_id = le.id
        WHERE le.user_id = $1
          AND le.date >= ($2::date - INTERVAL '14 days')
          AND le.date <= $2::date
        ORDER BY le.date DESC, le.timeslot ASC NULLS LAST
      `,
        [studentId, date]
      );

      const feedbackRes = await pool.query(
        `
        SELECT tf.id, tf.feedback_date, tf.chips, tf.note, tf.conversation_held,
          tf.teacher_private_note, tf.created_at, u.name AS teacher_name
        FROM teacher_feedback tf
        LEFT JOIN users u ON u.id = tf.teacher_id
        WHERE tf.student_id = $1 AND tf.school_id = $2
        ORDER BY tf.feedback_date DESC, tf.created_at DESC
        LIMIT 40
      `,
        [studentId, user.school_id]
      );

      res.json({
        student: {
          id: student.id,
          name: student.name,
          classId: student.class_id,
          className: student.class_name
        },
        date,
        weekStart,
        today: entriesRes.rows.map((row) => ({
          id: row.id,
          subject: row.subject,
          timeslot: row.timeslot,
          goal: row.goal,
          confidenceBefore: row.confidence_before,
          check: row.on_track
            ? {
                onTrack: row.on_track,
                understands: row.understands,
                progress: row.progress,
                nextStep: row.next_step_answer,
                note: row.check_change_note
              }
            : null,
          reflection: row.goal_achieved
            ? {
                goalAchieved: row.goal_achieved,
                confidenceAfter: row.confidence_after,
                nextStep: row.next_step,
                learnedToday: row.learned_today
              }
            : null
        })),
        history: historyRes.rows.map((row) => ({
          date: row.date,
          subject: row.subject,
          goal: row.goal,
          confidenceBefore: row.confidence_before,
          goalAchieved: row.goal_achieved,
          confidenceAfter: row.confidence_after,
          nextStep: row.next_step
        })),
        feedback: feedbackRes.rows.map((row) => ({
          id: row.id,
          date: row.feedback_date,
          chips: row.chips || [],
          note: row.note,
          conversationHeld: row.conversation_held,
          teacherPrivateNote: row.teacher_private_note,
          teacherName: row.teacher_name,
          createdAt: row.created_at
        })),
        feedbackChips: FEEDBACK_CHIPS
      });
    } catch (err) {
      console.error("❌ /api/teacher/student:", err);
      res.status(500).json({ success: false, message: "Serverfehler" });
    }
  });

  // -------------------------------------------------------
  // Feedback
  // -------------------------------------------------------
  app.post("/api/teacher/feedback", isTeacher, async (req, res) => {
    try {
      const user = req.session.user;
      const studentId = Number(req.body?.studentId);
      const date = normalizeIsoDate(req.body?.date) || todayIsoDate();
      const chips = parseChips(req.body?.chips);
      const note =
        typeof req.body?.note === "string" && req.body.note.trim()
          ? req.body.note.trim().slice(0, 800)
          : null;
      const conversationHeld = Boolean(req.body?.conversationHeld);
      const teacherPrivateNote =
        typeof req.body?.teacherPrivateNote === "string" && req.body.teacherPrivateNote.trim()
          ? req.body.teacherPrivateNote.trim().slice(0, 800)
          : null;

      if (!studentId) {
        return res.status(400).json({ success: false, message: "studentId fehlt." });
      }
      if (!(await teacherCanAccessStudent(pool, user, studentId))) {
        return res.status(403).json({ success: false, message: "Kein Zugriff." });
      }
      if (!chips.length && !note && !conversationHeld && !teacherPrivateNote) {
        return res.status(400).json({
          success: false,
          message: "Bitte Chips, Notiz oder Gesprächsvermerk setzen."
        });
      }

      const studentRes = await pool.query(
        `SELECT id, class_id FROM users WHERE id = $1 AND role = 'student' AND school_id = $2`,
        [studentId, user.school_id]
      );
      const classId = studentRes.rows[0]?.class_id || null;

      const inserted = await pool.query(
        `
        INSERT INTO teacher_feedback (
          school_id, teacher_id, student_id, class_id, feedback_date,
          chips, note, conversation_held, teacher_private_note
        )
        VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9)
        RETURNING id, feedback_date, chips, note, conversation_held, teacher_private_note, created_at
      `,
        [
          user.school_id,
          user.id,
          studentId,
          classId,
          date,
          JSON.stringify(chips),
          note,
          conversationHeld,
          teacherPrivateNote
        ]
      );

      res.json({ success: true, feedback: inserted.rows[0] });
    } catch (err) {
      console.error("❌ POST /api/teacher/feedback:", err);
      res.status(500).json({ success: false, message: "Serverfehler" });
    }
  });

  app.get("/api/teacher/history", isTeacher, async (req, res) => {
    try {
      const user = req.session.user;
      const classId = Number(req.query.classId);
      const days = Math.min(28, Math.max(7, Number(req.query.days) || 14));
      if (!classId || !(await teacherCanAccessClass(pool, user, classId))) {
        return res.status(403).json({ success: false, message: "Kein Zugriff auf diese Klasse." });
      }

      const end =
        (await resolveSchoolDate?.(req, req.query.date)) ||
        normalizeIsoDate(req.query.date) ||
        todayIsoDate();

      const studentsRes = await pool.query(
        `
        SELECT id, name FROM users
        WHERE role = 'student' AND class_id = $1 AND school_id = $2
        ORDER BY name ASC
      `,
        [classId, user.school_id]
      );
      const studentIds = studentsRes.rows.map((s) => s.id);
      if (!studentIds.length) {
        return res.json({ classId, end, days, students: [] });
      }

      const entriesRes = await pool.query(
        `
        SELECT le.user_id, le.date,
          COUNT(*)::int AS plan_count,
          COUNT(lr.id)::int AS reflect_count
        FROM log_entries le
        LEFT JOIN log_reflections lr ON lr.log_entry_id = le.id
        WHERE le.user_id = ANY($1::int[])
          AND le.date > ($2::date - ($3::int || ' days')::interval)
          AND le.date <= $2::date
        GROUP BY le.user_id, le.date
      `,
        [studentIds, end, days]
      );

      const notesRes = await pool.query(
        `
        SELECT student_id, feedback_date, conversation_held, teacher_private_note, note
        FROM teacher_feedback
        WHERE student_id = ANY($1::int[])
          AND school_id = $2
          AND feedback_date > ($3::date - ($4::int || ' days')::interval)
          AND feedback_date <= $3::date
      `,
        [studentIds, user.school_id, end, days]
      );

      const byStudent = {};
      for (const s of studentsRes.rows) {
        byStudent[s.id] = { id: s.id, name: s.name, days: {}, notes: [] };
      }
      for (const row of entriesRes.rows) {
        const key = String(row.date).slice(0, 10);
        if (!byStudent[row.user_id]) continue;
        byStudent[row.user_id].days[key] = {
          planned: row.plan_count > 0,
          reflected: row.reflect_count > 0,
          planCount: row.plan_count,
          reflectCount: row.reflect_count
        };
      }
      for (const row of notesRes.rows) {
        if (!byStudent[row.student_id]) continue;
        byStudent[row.student_id].notes.push({
          date: row.feedback_date,
          conversationHeld: row.conversation_held,
          privateNote: row.teacher_private_note,
          note: row.note
        });
      }

      res.json({
        classId,
        end,
        days,
        students: Object.values(byStudent)
      });
    } catch (err) {
      console.error("❌ /api/teacher/history:", err);
      res.status(500).json({ success: false, message: "Serverfehler" });
    }
  });

  // Schüler: eigene Rückmeldungen
  app.get("/api/student/feedback", deps.isStudent, async (req, res) => {
    try {
      const studentId = req.session.user.id;
      const schoolId = req.session.user.school_id;
      const r = await pool.query(
        `
        SELECT tf.id, tf.feedback_date, tf.chips, tf.note, tf.created_at,
          u.name AS teacher_name
        FROM teacher_feedback tf
        LEFT JOIN users u ON u.id = tf.teacher_id
        WHERE tf.student_id = $1 AND tf.school_id = $2
        ORDER BY tf.feedback_date DESC, tf.created_at DESC
        LIMIT 30
      `,
        [studentId, schoolId]
      );
      res.json({
        feedback: r.rows.map((row) => ({
          id: row.id,
          date: row.feedback_date,
          chips: row.chips || [],
          note: row.note,
          teacherName: row.teacher_name,
          createdAt: row.created_at
        })),
        chipLabels: Object.fromEntries(FEEDBACK_CHIPS.map((c) => [c.id, c.label]))
      });
    } catch (err) {
      console.error("❌ /api/student/feedback:", err);
      res.status(500).json({ success: false, message: "Serverfehler" });
    }
  });

  // -------------------------------------------------------
  // Admin: Lehrerverwaltung
  // -------------------------------------------------------
  app.get("/api/admin/teachers", isAdmin, async (req, res) => {
    try {
      const schoolId = req.session.user.school_id;
      const r = await pool.query(
        `
        SELECT u.id, u.name, u.role, COALESCE(u.is_active, TRUE) AS is_active, u.created_at
        FROM users u
        WHERE u.school_id = $1
          AND u.role IN ('teacher', 'admin')
        ORDER BY u.name ASC
      `,
        [schoolId]
      );
      const ids = r.rows.map((row) => row.id);
      let assignments = {};
      if (ids.length) {
        const a = await pool.query(
          `
          SELECT teacher_id, class_id
          FROM teacher_class_assignments
          WHERE teacher_id = ANY($1::int[])
        `,
          [ids]
        );
        for (const row of a.rows) {
          if (!assignments[row.teacher_id]) assignments[row.teacher_id] = [];
          assignments[row.teacher_id].push(row.class_id);
        }
      }
      const classes = await pool.query(
        `SELECT id, name FROM classes WHERE school_id = $1 ORDER BY name ASC`,
        [schoolId]
      );
      res.json({
        teachers: r.rows.map((row) => ({
          id: row.id,
          name: row.name,
          role: row.role,
          isActive: row.is_active !== false,
          isTeacher: row.role === "teacher" || row.role === "admin",
          isAdmin: row.role === "admin",
          classIds: assignments[row.id] || [],
          createdAt: row.created_at
        })),
        classes: classes.rows
      });
    } catch (err) {
      console.error("❌ GET /api/admin/teachers:", err);
      res.status(500).json({ success: false, message: "Serverfehler" });
    }
  });

  app.post("/api/admin/teachers", isAdmin, async (req, res) => {
    try {
      const schoolId = req.session.user.school_id;
      const name = String(req.body?.name || "").trim();
      const password = String(req.body?.password || "").trim();
      const asAdmin = Boolean(req.body?.isAdmin);
      const classIds = Array.isArray(req.body?.classIds)
        ? [...new Set(req.body.classIds.map(Number).filter((n) => Number.isInteger(n) && n > 0))]
        : [];

      if (!name || !password) {
        return res.json({ success: false, message: "Name und Passwort sind Pflicht." });
      }
      if (password.length < 4) {
        return res.json({ success: false, message: "Passwort mindestens 4 Zeichen." });
      }

      const role = asAdmin ? "admin" : "teacher";
      const inserted = await pool.query(
        `
        INSERT INTO users (name, password, role, school_id, is_active, first_login)
        VALUES ($1, $2, $3, $4, TRUE, FALSE)
        RETURNING id, name, role
      `,
        [name, password, role, schoolId]
      );
      const teacherId = inserted.rows[0].id;

      for (const classId of classIds) {
        const ok = await pool.query(
          `SELECT 1 FROM classes WHERE id = $1 AND school_id = $2`,
          [classId, schoolId]
        );
        if (!ok.rows.length) continue;
        await pool.query(
          `
          INSERT INTO teacher_class_assignments (teacher_id, class_id)
          VALUES ($1, $2)
          ON CONFLICT DO NOTHING
        `,
          [teacherId, classId]
        );
      }

      res.json({ success: true, teacher: inserted.rows[0] });
    } catch (err) {
      if (err.code === "23505") {
        return res.json({ success: false, message: "Dieser Name existiert bereits an der Schule." });
      }
      console.error("❌ POST /api/admin/teachers:", err);
      res.status(500).json({ success: false, message: "Serverfehler" });
    }
  });

  app.patch("/api/admin/teachers/:id", isAdmin, async (req, res) => {
    try {
      const schoolId = req.session.user.school_id;
      const teacherId = Number(req.params.id);
      const existing = await pool.query(
        `
        SELECT id, role FROM users
        WHERE id = $1 AND school_id = $2 AND role IN ('teacher', 'admin')
      `,
        [teacherId, schoolId]
      );
      if (!existing.rows.length) {
        return res.json({ success: false, message: "Lehrkraft nicht gefunden." });
      }

      const updates = [];
      const params = [];
      let i = 1;

      if (typeof req.body?.name === "string" && req.body.name.trim()) {
        updates.push(`name = $${i++}`);
        params.push(req.body.name.trim());
      }
      if (typeof req.body?.password === "string" && req.body.password.trim()) {
        if (req.body.password.trim().length < 4) {
          return res.json({ success: false, message: "Passwort mindestens 4 Zeichen." });
        }
        updates.push(`password = $${i++}`);
        params.push(req.body.password.trim());
      }
      if (typeof req.body?.isActive === "boolean") {
        updates.push(`is_active = $${i++}`);
        params.push(req.body.isActive);
      }
      if (typeof req.body?.isAdmin === "boolean") {
        updates.push(`role = $${i++}`);
        params.push(req.body.isAdmin ? "admin" : "teacher");
      }

      if (updates.length) {
        params.push(teacherId, schoolId);
        await pool.query(
          `UPDATE users SET ${updates.join(", ")} WHERE id = $${i++} AND school_id = $${i}`,
          params
        );
      }

      if (Array.isArray(req.body?.classIds)) {
        const classIds = [
          ...new Set(req.body.classIds.map(Number).filter((n) => Number.isInteger(n) && n > 0))
        ];
        await pool.query(`DELETE FROM teacher_class_assignments WHERE teacher_id = $1`, [teacherId]);
        for (const classId of classIds) {
          const ok = await pool.query(
            `SELECT 1 FROM classes WHERE id = $1 AND school_id = $2`,
            [classId, schoolId]
          );
          if (!ok.rows.length) continue;
          await pool.query(
            `
            INSERT INTO teacher_class_assignments (teacher_id, class_id)
            VALUES ($1, $2)
            ON CONFLICT DO NOTHING
          `,
            [teacherId, classId]
          );
        }
      }

      res.json({ success: true });
    } catch (err) {
      if (err.code === "23505") {
        return res.json({ success: false, message: "Name bereits vergeben." });
      }
      console.error("❌ PATCH /api/admin/teachers:", err);
      res.status(500).json({ success: false, message: "Serverfehler" });
    }
  });

  // ensureColumn unused but kept for future; silence lint via void
  void ensureColumn;
}
