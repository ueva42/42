/**
 * Lese-Endpunkt für das Lehrer-Dashboard.
 * Liest nur vorhandene Tabellen. Legt nichts an und ändert kein Schema.
 */
import { teacherCanAccessClass } from "./teacher-auth.js";
import { extractHelpFromCheck } from "./teacher-matrix.js";
import {
  TEACHER_DASHBOARD_CONFIG,
  TEACHER_DASHBOARD_GAPS
} from "./teacher-dashboard-config.js";
import {
  aggregateClass,
  analyzeStudent,
  formatGrade,
  isoDay,
  topicBoard
} from "./teacher-dashboard-signals.js";

const GRADED = new Set(["klassenarbeit", "test", "projektabgabe"]);
const TYPE_LABEL = {
  klassenarbeit: "Klassenarbeit",
  test: "Test",
  projektabgabe: "Projektabgabe",
  levelcheck: "Levelcheck"
};

export function registerTeacherDashboardRoutes(app, deps) {
  const { pool, isTeacher, getLevelChecksForClass, getGradeRequirements, resolveSchoolDate } =
    deps;

  app.get("/api/teacher/regulation", isTeacher, async (req, res) => {
    try {
      const user = req.session.user;
      const classId = Number(req.query.classId);
      if (!classId || !(await teacherCanAccessClass(pool, user, classId))) {
        return res.status(403).json({ success: false, message: "Kein Zugriff auf diese Klasse." });
      }
      const today =
        (await resolveSchoolDate?.(req, null)) || isoDay(new Date()) || new Date().toISOString().slice(0, 10);
      const range = req.query.range === "week" ? "week" : TEACHER_DASHBOARD_CONFIG.defaultRange;

      const classRes = await pool.query(
        `SELECT id, name FROM classes WHERE id = $1 AND school_id = $2`,
        [classId, user.school_id]
      );
      if (!classRes.rows.length) {
        return res.status(404).json({ success: false, message: "Klasse nicht gefunden." });
      }

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
        [classId, user.school_id]
      );
      const students = studentsRes.rows.map((row) => ({ id: row.id, name: row.name }));
      const studentIds = students.map((student) => student.id);

      const checks = (await getLevelChecksForClass?.(classId, user.school_id)) || [];
      const levelChecks = checks
        .filter((check) => Array.isArray(check.goals) && check.goals.length)
        .map((check) => ({
          id: check.id,
          name: check.name,
          subject: check.subject
        }));
      const chosen = pickCheck(checks, req.query.levelCheckId, today);

      if (!chosen || !studentIds.length) {
        return res.json({
          success: true,
          class: { id: classRes.rows[0].id, name: classRes.rows[0].name },
          date: today,
          range,
          levelCheck: chosen
            ? { id: chosen.id, name: chosen.name, subject: chosen.subject }
            : null,
          levelChecks,
          gaps: TEACHER_DASHBOARD_GAPS,
          limits: limits(),
          students: [],
          live: emptyLive(),
          topics: [],
          patterns: [],
          helpGroups: [],
          multiHelpCount: 0,
          buckets: { fits: 0, high: 0, low: 0, unknown: 0 },
          quotes: { entries: 0, reflected: 0, achievedYes: 0, achievedKnown: 0 },
          topicGaps: [],
          lesson: null,
          message: !studentIds.length
            ? "In dieser Klasse sind keine Schüler:innen hinterlegt."
            : "Für diese Klasse gibt es noch keine Unterrichtseinheit mit Unterthemen."
        });
      }

      const exam = nextExam(chosen, today);
      const week = weekBounds(today);
      const unit = unitRange(chosen, today);
      const bounds = range === "week" ? week : unit;
      const fetchStart = bounds.start < week.start ? bounds.start : week.start;
      const goalIds = chosen.goals.map((goal) => String(goal.id));
      const subject = chosen.subject;

      const [targets, marksRes, evalRes, entryRes, coachRes, coachStateRes, noteRes, timetableRes] =
        await Promise.all([
          pool.query(
            `
            SELECT user_id, target_grade_key, target_grade
            FROM level_check_targets
            WHERE level_check_id = $1 AND user_id = ANY($2::int[])
          `,
            [chosen.id, studentIds]
          ),
          pool.query(
            `
            SELECT user_id, goal_id, tier, status, updated_at
            FROM level_check_marks
            WHERE user_id = ANY($1::int[]) AND goal_id = ANY($2::uuid[])
          `,
            [studentIds, goalIds]
          ),
          pool.query(
            `
            SELECT e.user_id, e.status, e.percent, e.updated_at,
                   cp.checkpoint_date, cp.checkpoint_type, cp.linked_subtopic_ids
            FROM level_check_checkpoint_evaluations e
            JOIN level_check_checkpoints cp ON cp.id = e.checkpoint_id
            WHERE cp.level_check_id = $1 AND e.user_id = ANY($2::int[])
          `,
            [chosen.id, studentIds]
          ),
          pool.query(
            `
            SELECT le.id, le.user_id, le.date, le.timeslot, le.subject, le.goal,
                   le.what_goal_id, le.what_goal_text, le.selected_level,
                   le.confidence_before, le.plan_b_strategy_text, le.created_at,
                   lc.on_track, lc.understands, lc.progress, lc.next_step_answer,
                   lc.change_note, lc.selected_strategy_problem, lc.selected_strategy_next_step,
                   lc.selected_strategy_name, lc.created_at AS check_created_at,
                   lr.goal_achieved, lr.goal_reached_answer, lr.confidence_after,
                   lr.used_strategy_name, lr.created_at AS reflection_created_at
            FROM log_entries le
            LEFT JOIN log_checks lc ON lc.log_entry_id = le.id
            LEFT JOIN log_reflections lr ON lr.log_entry_id = le.id
            WHERE le.user_id = ANY($1::int[])
              AND le.date >= $2::date
              AND le.date <= $3::date
              AND (
                lower(le.subject) = lower($4)
                OR le.what_goal_id = ANY($5::uuid[])
              )
          `,
            [studentIds, fetchStart, today, subject, goalIds]
          ),
          pool.query(
            `
            SELECT s.user_id, s.competence_id, s.fach, m.created_at, m.rolle
            FROM coach_sessions s
            JOIN coach_messages m ON m.session_id = s.id
            WHERE s.user_id = ANY($1::int[])
              AND m.created_at::date >= $2::date
              AND m.created_at::date <= $3::date
              AND (
                s.competence_id = ANY($4::uuid[])
                OR lower(s.fach) = lower($5)
              )
          `,
            [studentIds, fetchStart, today, goalIds, subject]
          ),
          pool.query(
            `
            SELECT student_id, help_status, help_requested_at, taken_over_at, closed_at, log_entry_id, goal_id
            FROM teacher_coaching_state
            WHERE student_id = ANY($1::int[]) AND coaching_date = $2::date
          `,
            [studentIds, today]
          ),
          pool.query(
            `
            SELECT DISTINCT ON (student_id)
              student_id, teacher_private_note, feedback_date
            FROM teacher_feedback
            WHERE student_id = ANY($1::int[]) AND school_id = $2
            ORDER BY student_id, feedback_date DESC, created_at DESC
          `,
            [studentIds, user.school_id]
          ),
          pool.query(
            `
            SELECT weekday, timeslot, subject
            FROM timetables
            WHERE class_id = $1 AND lower(subject) = lower($2)
          `,
            [classId, subject]
          )
        ]);

      const targetByStudent = new Map();
      for (const row of targets.rows) {
        const key = usableGrade(row.target_grade_key || row.target_grade, getGradeRequirements);
        targetByStudent.set(row.user_id, key);
      }
      const marksByStudent = groupRows(marksRes.rows, "user_id");
      const evalByStudent = groupRows(evalRes.rows, "user_id");
      const entryByStudent = groupRows(entryRes.rows, "user_id");
      const coachByStudent = groupRows(coachRes.rows, "user_id");
      const stateByStudent = new Map(coachStateRes.rows.map((row) => [row.student_id, row]));
      const noteByStudent = new Map(
        noteRes.rows.map((row) => [row.student_id, row.teacher_private_note || ""])
      );
      const timetable = timetableRes.rows.map((row) => ({
        weekday: Number(row.weekday),
        timeslot: row.timeslot,
        subject: row.subject
      }));
      const now = new Date();
      const daysToExam = exam ? daysBetween(today, exam.date) : null;

      const analyzed = students.map((student) => {
        const entryRows = entryByStudent.get(student.id) || [];
        const coaching = stateByStudent.get(student.id) || null;
        const mappedEntries = entryRows.map((row) => mapEntry(row));
        const helpEvents = entryRows
          .map((row) => helpFromRow(row, coaching))
          .filter(Boolean);
        const evaluations = (evalByStudent.get(student.id) || []).map(mapEval);
        const analysis = analyzeStudent({
          config: TEACHER_DASHBOARD_CONFIG,
          getGradeRequirements,
          now,
          today,
          timeZone: TEACHER_DASHBOARD_CONFIG.schoolTimeZone,
          rangeStart: bounds.start,
          rangeEnd: bounds.end,
          weekStart: week.start,
          weekEnd: week.end,
          subject,
          exam: exam
            ? { ...exam, days: daysToExam }
            : null,
          goals: chosen.goals.map((goal) => ({
            id: goal.id,
            text: goal.text,
            sortOrder: goal.sortOrder
          })),
          targetGradeKey: targetByStudent.get(student.id) || null,
          marks: (marksByStudent.get(student.id) || []).map((row) => ({
            goalId: row.goal_id,
            tier: row.tier,
            status: row.status,
            updatedAt: row.updated_at
          })),
          evaluations,
          entries: mappedEntries,
          helpEvents,
          coachMessages: (coachByStudent.get(student.id) || []).map((row) => ({
            at: row.created_at,
            rolle: row.rolle,
            competenceId: row.competence_id
          })),
          timetable
        });
        return {
          id: student.id,
          name: student.name,
          today,
          entries: mappedEntries,
          evaluations,
          analysis,
          note: noteByStudent.get(student.id) || ""
        };
      });

      const summary = aggregateClass(analyzed, {
        config: TEACHER_DASHBOARD_CONFIG,
        daysToExam,
        goals: chosen.goals,
        rangeStart: bounds.start,
        rangeEnd: bounds.end
      });
      const topics = topicBoard(analyzed, chosen.goals);
      const live = assembleLive(analyzed);

      res.json({
        success: true,
        class: { id: classRes.rows[0].id, name: classRes.rows[0].name },
        date: today,
        range,
        rangeStart: bounds.start,
        rangeEnd: bounds.end,
        levelCheck: {
          id: chosen.id,
          name: chosen.name,
          subject: chosen.subject,
          examDate: exam?.date || null,
          examLabel: exam?.label || null,
          daysToExam
        },
        levelChecks,
        goals: chosen.goals.map((goal) => ({ id: goal.id, text: goal.text })),
        gaps: TEACHER_DASHBOARD_GAPS,
        limits: limits(),
        lesson: live.lesson,
        live: {
          help: live.help,
          visit: live.visit,
          noGoal: live.noGoal,
          runningCount: live.runningCount,
          experts: live.experts
        },
        topics,
        patterns: summary.patterns,
        helpGroups: summary.helpGroups,
        multiHelpCount: summary.multiHelpCount,
        buckets: summary.buckets,
        quotes: summary.quotes,
        topicGaps: summary.gaps,
        students: analyzed
          .map((student) => ({
            id: student.id,
            name: student.name,
            targetGrade: student.analysis.targetGradeKey,
            targetGradeLabel: formatGrade(student.analysis.targetGradeKey),
            prognosis: student.analysis.prognosis,
            prognosisReason: student.analysis.prognosisReason,
            standGrade: student.analysis.standGrade,
            standGradeLabel: formatGrade(student.analysis.standGrade),
            levelcheckCount: student.analysis.levelcheckCount,
            path: student.analysis.path,
            sicher: student.analysis.sicher,
            totalGoals: student.analysis.totalGoals,
            hints: student.analysis.hints,
            neutral: student.analysis.neutral,
            helpGroups: student.analysis.helpGroups,
            quotes: student.analysis.quotes,
            stands: student.analysis.stands,
            week: student.analysis.week,
            helpStats: student.analysis.helpStats,
            note: student.note
          }))
          .sort((a, b) => b.hints.length - a.hints.length || a.name.localeCompare(b.name, "de"))
      });
    } catch (err) {
      console.error("❌ /api/teacher/regulation:", err);
      res.status(500).json({ success: false, message: "Serverfehler" });
    }
  });
}

function limits() {
  return {
    reminder: false,
    helpButtons: true,
    teacherNote: true,
    multipleHelpGroups: true
  };
}

function emptyLive() {
  return { help: [], visit: [], noGoal: [], runningCount: 0, experts: [] };
}

function pickCheck(checks, requestedId, today) {
  const list = (checks || []).filter((check) => Array.isArray(check.goals) && check.goals.length);
  if (!list.length) return null;
  if (requestedId) {
    const found = list.find((check) => String(check.id) === String(requestedId));
    if (found) return found;
  }
  const upcoming = list
    .map((check) => ({ check, exam: nextExam(check, today) }))
    .filter((item) => item.exam && item.exam.date >= today)
    .sort((a, b) => a.exam.date.localeCompare(b.exam.date));
  return upcoming[0]?.check || list[0];
}

function nextExam(check, today) {
  const points = (check.checkpoints || [])
    .filter((point) => GRADED.has(point.checkpointType) && point.checkpointDate)
    .filter((point) => point.checkpointDate >= today)
    .sort((a, b) => a.checkpointDate.localeCompare(b.checkpointDate));
  const chosen = points[0];
  if (!chosen) return null;
  return {
    date: chosen.checkpointDate,
    label: TYPE_LABEL[chosen.checkpointType] || "Arbeit",
    linkedGoalIds: chosen.linkedSubtopicIds || [],
    type: chosen.checkpointType
  };
}

function unitRange(check, today) {
  const previous = (check.checkpoints || [])
    .filter((point) => GRADED.has(point.checkpointType) && point.checkpointDate && point.checkpointDate < today)
    .sort((a, b) => b.checkpointDate.localeCompare(a.checkpointDate))[0];
  let start = previous ? addDays(previous.checkpointDate, 1) : isoDay(check.createdAt);
  if (!start || start > today) start = today;
  return { start, end: today };
}

function weekBounds(today) {
  const date = new Date(`${today}T12:00:00`);
  const js = date.getDay();
  const toMonday = js === 0 ? -6 : 1 - js;
  const monday = new Date(date);
  monday.setDate(date.getDate() + toMonday);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { start: isoDay(monday), end: isoDay(sunday) };
}

function addDays(iso, count) {
  const date = new Date(`${iso}T12:00:00`);
  date.setDate(date.getDate() + count);
  return isoDay(date);
}

function daysBetween(fromIso, toIso) {
  const a = new Date(`${fromIso}T12:00:00`).getTime();
  const b = new Date(`${toIso}T12:00:00`).getTime();
  return Math.round((b - a) / 86400000);
}

function usableGrade(raw, getGradeRequirements) {
  if (raw == null || raw === "") return null;
  const key = String(raw).trim().replace(",", ".");
  if (typeof getGradeRequirements === "function" && getGradeRequirements(key)) return key;
  return null;
}

function groupRows(rows, key) {
  const map = new Map();
  for (const row of rows || []) {
    const id = row[key];
    if (!map.has(id)) map.set(id, []);
    map.get(id).push(row);
  }
  return map;
}

function mapEntry(row) {
  const check = row.check_created_at
    ? {
        createdAt: row.check_created_at,
        strategyName: row.selected_strategy_name || null,
        on_track: row.on_track,
        understands: row.understands,
        progress: row.progress,
        next_step_answer: row.next_step_answer,
        change_note: row.change_note,
        selected_strategy_problem: row.selected_strategy_problem,
        selected_strategy_next_step: row.selected_strategy_next_step,
        selected_strategy_name: row.selected_strategy_name
      }
    : null;
  const reflection = row.reflection_created_at
    ? {
        createdAt: row.reflection_created_at,
        goal_achieved: row.goal_achieved,
        goal_reached_answer: row.goal_reached_answer,
        strategyName: row.used_strategy_name || null
      }
    : null;
  return {
    id: row.id,
    date: isoDay(row.date),
    createdAt: row.created_at,
    timeslot: row.timeslot,
    subject: row.subject,
    goal: row.goal,
    whatGoalId: row.what_goal_id,
    whatGoalText: row.what_goal_text,
    selectedLevel: row.selected_level,
    confidenceBefore: row.confidence_before,
    planB: row.plan_b_strategy_text ? String(row.plan_b_strategy_text).trim() : null,
    check,
    reflection
  };
}

function helpFromRow(row, coaching) {
  if (!row.check_created_at) return null;
  const help = extractHelpFromCheck({
    on_track: row.on_track,
    understands: row.understands,
    progress: row.progress,
    next_step_answer: row.next_step_answer,
    change_note: row.change_note,
    selected_strategy_problem: row.selected_strategy_problem,
    selected_strategy_next_step: row.selected_strategy_next_step,
    created_at: row.check_created_at
  });
  if (!help) return null;
  const sameEntry =
    coaching && coaching.log_entry_id && String(coaching.log_entry_id) === String(row.id);
  const closed =
    sameEntry &&
    coaching.help_status === "closed" &&
    coaching.closed_at &&
    new Date(coaching.closed_at).getTime() >= new Date(help.requestedAt || row.check_created_at).getTime();
  return {
    at: help.requestedAt || row.check_created_at,
    entryId: row.id,
    goalId: row.what_goal_id,
    concern: help.concern,
    closed: Boolean(closed),
    takenOver: Boolean(sameEntry && coaching.help_status === "taken_over" && !closed),
    topic: row.what_goal_text || row.goal || null,
    level: row.selected_level || null
  };
}

function mapEval(row) {
  const linked = row.linked_subtopic_ids;
  return {
    status: row.status,
    percent: row.percent == null ? null : Number(row.percent),
    date: isoDay(row.checkpoint_date || row.updated_at),
    type: row.checkpoint_type,
    linkedGoalIds: Array.isArray(linked) ? linked.map((id) => String(id)) : []
  };
}

function assembleLive(students) {
  const help = [];
  const visit = [];
  const noGoal = [];
  const experts = [];
  let runningCount = 0;
  let lesson = null;
  for (const student of students) {
    const live = student.analysis.live;
    if (live.lesson) lesson = live.lesson;
    for (const item of live.help) {
      help.push({
        studentId: student.id,
        name: student.name,
        ...item
      });
    }
    if (live.visit?.length) {
      visit.push({
        studentId: student.id,
        name: student.name,
        reasons: live.visit,
        topic: live.help[0]?.topic || null
      });
    }
    if (live.noGoal) noGoal.push({ studentId: student.id, name: student.name });
    if (live.running) {
      runningCount += 1;
      for (const topic of live.expertTopics || []) {
        experts.push({
          studentId: student.id,
          name: student.name,
          topic: topic.text,
          goalId: topic.goalId
        });
      }
    }
  }
  help.sort((a, b) => (b.waitMinutes || 0) - (a.waitMinutes || 0));
  return { help, visit, noGoal, runningCount, experts, lesson };
}
