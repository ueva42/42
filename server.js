// =======================================================
// Temple of Logic – SERVER.JS (MULTI-SCHOOL + SUPERADMIN,
// Klassen-XP + Klassenbelohnungen, ADMIN-PASSWORTWECHSEL + DEFAULT-SEED)
// =======================================================

import express from "express";
import session from "express-session";
import path from "path";
import { fileURLToPath } from "url";
import bodyParser from "body-parser";
import multer from "multer";
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand
} from "@aws-sdk/client-s3";
import pkg from "pg";
const { Pool } = pkg;
console.log("🚨 SERVER.JS – DIESE VERSION WIRD VERWENDET – MARKER A1");

// -------------------------------------------------------
// SRL-Logbuch – XP-Werte (zentral anpassbar)
// -------------------------------------------------------
const LOGBUCH_XP = {
  plan: 2,
  check: 3,
  reflect: 3,
  weekReflection: 10
};

const ZIELSETZUNG_XP = {
  targetGrade: 5,
  achievedGrade: 5,
  grow: 4,
  glow: 4,
  nextGoal: 5
};

const ZIELSETZUNG_FEEDBACK_OPTIONS = {
  grow: [
    "Mehr im Levelplan üben",
    "Operator-Stufe bei schwachen Themen anstreben",
    "Street Legend gezielt ausbauen",
    "Aufgaben genauer lesen",
    "Regelmäßiger wiederholen",
    "Bei Unsicherheit nachfragen"
  ],
  glow: [
    "Konsequent im Levelplan gearbeitet",
    "Gute Vorbereitung gezeigt",
    "Am Ball geblieben",
    "Strategien angewendet",
    "Zielnote erreicht oder übertroffen",
    "Stärken beibehalten"
  ],
  nextGoal: [
    "Zielnote verbessern",
    "Operator in allen Themen",
    "Street Legend ausbauen",
    "Schwachstellen gezielt trainieren",
    "Regelmäßiger üben",
    "Nächste Stufe im Levelplan anstreben"
  ]
};

const LEVEL_CHECK_TIERS = ["rookie", "operator", "street_legend"];
const LEVEL_CHECK_TIER_LABELS = {
  rookie: "Rookie",
  operator: "Operator",
  street_legend: "Street Legend"
};
const LEVEL_CHECK_XP = {
  rookie: 5,
  operator: 8,
  street_legend: 12
};

// Pro Überthema: Anteil der Unterthemen (Häkchen im Levelplan) pro Tier.
// Halbe Noten sind feste Zwischenstufen zwischen den ganzen Noten (keine Interpolation).
const TARGET_GRADE_RULES = {
  "1": { street_legend: 0.8 },
  "1.5": { operator: 1, street_legend: 0.65 },
  "2": { operator: 1, street_legend: 0.5 },
  "2.5": { operator: 1, street_legend: 0.25 },
  "3": { operator: 0.8 },
  "3.5": { rookie: 1, operator: 0.5 },
  "4": { rookie: 0.8 },
  "4.5": { rookie: 1 },
  "5": { rookie: 0.6 },
  "5.5": { rookie: 0.5 },
  "6": { rookie: 0.4 }
};

const TARGET_GRADE_ORDER = [];
for (let i = 2; i <= 12; i++) {
  const num = i / 2;
  TARGET_GRADE_ORDER.push(Number.isInteger(num) ? String(num) : num.toFixed(1));
}

const LEGACY_TARGET_GRADE_MAP = {
  "1-": "1.5",
  "2+": "1.5",
  "2-": "2.5",
  "3+": "2.5",
  "3-": "3.5",
  "4+": "3.5",
  "4-": "4.5",
  "5+": "4.5",
  "5-": "5.5"
};

function normalizeFeedbackText(raw) {
  if (raw == null) return null;
  const text = String(raw).trim().replace(/\s+/g, " ");
  if (!text) return null;
  return text.slice(0, 500);
}

function buildZielsetzungFeedbackOptions() {
  const gradeGoals = TARGET_GRADE_ORDER.slice(0, 8).map((value) => ({
    value: `Zielnote ${formatGradeLabel(value)} anstreben`,
    label: `Zielnote ${formatGradeLabel(value)} anstreben`
  }));
  const presetNext = ZIELSETZUNG_FEEDBACK_OPTIONS.nextGoal.map((text) => ({
    value: text,
    label: text
  }));
  const seen = new Set();
  const nextGoal = [];
  for (const item of [...gradeGoals, ...presetNext]) {
    if (seen.has(item.value)) continue;
    seen.add(item.value);
    nextGoal.push(item);
  }

  return {
    grow: ZIELSETZUNG_FEEDBACK_OPTIONS.grow.map((text) => ({ value: text, label: text })),
    glow: ZIELSETZUNG_FEEDBACK_OPTIONS.glow.map((text) => ({ value: text, label: text })),
    nextGoal
  };
}

async function awardZielsetzungXPOnce(studentId, schoolId, levelCheckId, fieldKey, amount) {
  if (!amount) return 0;
  const source = `zielsetzung_${fieldKey}:${levelCheckId}`;
  const existing = await pool.query(
    `
    SELECT id FROM xp_transactions
    WHERE student_id = $1 AND source = $2
    LIMIT 1
  `,
    [studentId, source]
  );
  if (existing.rows.length) return 0;

  await awardLogbuchXP(studentId, amount, source, schoolId);
  return amount;
}

async function awardLevelplanMarkXPOnce(studentId, schoolId, goalId, tier) {
  const amount = LEVEL_CHECK_XP[tier] || 0;
  if (!amount) return 0;
  const source = `levelplan_mark:${goalId}:${tier}`;
  const existing = await pool.query(
    `
    SELECT id FROM xp_transactions
    WHERE student_id = $1 AND source = $2
    LIMIT 1
  `,
    [studentId, source]
  );
  if (existing.rows.length) return 0;

  await awardLogbuchXP(studentId, amount, source, schoolId);
  return amount;
}

function formatGradeLabel(key) {
  if (!key) return "–";
  return String(key).replace(".", ",");
}

const TARGET_GRADE_OPTIONS = TARGET_GRADE_ORDER.map((value) => ({
  value,
  label: formatGradeLabel(value)
}));

function normalizeTargetGradeKey(raw) {
  if (raw == null || raw === "") return null;

  let key = String(raw).trim().replace(",", ".").replace("−", "-");
  if (LEGACY_TARGET_GRADE_MAP[key]) key = LEGACY_TARGET_GRADE_MAP[key];
  if (TARGET_GRADE_RULES[key]) return key;

  const num = Number(key);
  if (!Number.isFinite(num) || num < 1 || num > 6) return null;

  const halfStep = Math.round(num * 2) / 2;
  if (Math.abs(halfStep - num) > 0.001) return null;

  const normalized = Number.isInteger(halfStep)
    ? String(halfStep)
    : halfStep.toFixed(1);
  return TARGET_GRADE_RULES[normalized] ? normalized : null;
}

function gradeRequirementsMet(totalGoals, markCounts, gradeKey) {
  const total = Math.max(0, Number(totalGoals) || 0);
  const key = normalizeTargetGradeKey(gradeKey);
  if (!total || !key) return false;

  const rules = TARGET_GRADE_RULES[key];
  for (const tier of LEVEL_CHECK_TIERS) {
    if (rules[tier] == null) continue;
    const required = Math.ceil(total * rules[tier]);
    if ((markCounts[tier] ?? 0) < required) return false;
  }
  return true;
}

function computeAchievedGradeFromMarks(totalGoals, markCounts) {
  const total = Math.max(0, Number(totalGoals) || 0);
  if (!total) return null;

  for (const gradeKey of TARGET_GRADE_ORDER) {
    if (gradeRequirementsMet(total, markCounts, gradeKey)) {
      return gradeKey;
    }
  }
  return null;
}

function countGoalMarksByTier(goals) {
  const counts = { rookie: 0, operator: 0, street_legend: 0, unmarked: 0 };
  for (const goal of goals || []) {
    const tiers = goal.mark?.tiers || {};
    const hasAny = !!(tiers.rookie || tiers.operator || tiers.street_legend);
    if (tiers.rookie) counts.rookie++;
    if (tiers.operator) counts.operator++;
    if (tiers.street_legend) counts.street_legend++;
    if (!hasAny) counts.unmarked++;
  }
  return counts;
}

function countGoalMarksCumulative(goals) {
  return countGoalMarksByTier(goals);
}

function expandGradeRulesForDisplay(rules) {
  if (!rules) return {};
  const out = { ...rules };
  // Rookie → Operator → Street Legend: höhere Stufe setzt niedrigere auf 100 % voraus.
  if (out.street_legend != null) {
    out.operator = Math.max(out.operator ?? 0, 1);
    out.rookie = Math.max(out.rookie ?? 0, 1);
  } else if (out.operator != null) {
    out.rookie = Math.max(out.rookie ?? 0, 1);
  }
  return out;
}

function recommendedTierCounts(totalGoals, targetGradeKey) {
  const total = Math.max(0, Number(totalGoals) || 0);
  const key = normalizeTargetGradeKey(targetGradeKey);
  if (!key || !total) return null;

  const rules = expandGradeRulesForDisplay(TARGET_GRADE_RULES[key]);
  const out = {};
  for (const tier of LEVEL_CHECK_TIERS) {
    if (rules[tier] != null) {
      out[tier] = Math.ceil(total * rules[tier]);
    }
  }
  return out;
}

function buildTopicTargetProgress(check, targetsRow = null) {
  const totalGoals = check.goals.length;
  const markCounts = countGoalMarksCumulative(check.goals);
  const targetKey = normalizeTargetGradeKey(targetsRow?.targetGradeKey);
  const achievedKey = normalizeTargetGradeKey(targetsRow?.achievedGradeKey);
  const recommended = targetKey ? recommendedTierCounts(totalGoals, targetKey) : null;

  const tiers = LEVEL_CHECK_TIERS.map((tier) => {
    const required = recommended?.[tier] ?? null;
    const current = markCounts[tier];
    return {
      id: tier,
      label: LEVEL_CHECK_TIER_LABELS[tier],
      current,
      recommended: required,
      onTrack: required == null ? null : current >= required,
      remaining: required == null ? null : Math.max(0, required - current)
    };
  });

  const allOnTrack =
    recommended == null
      ? null
      : LEVEL_CHECK_TIERS.every((tier) => {
          if (recommended[tier] == null) return true;
          return markCounts[tier] >= recommended[tier];
        });

  const summary = buildTargetProgressSummary(tiers, targetKey);

  return {
    id: check.id,
    subject: check.subject,
    name: check.name,
    totalGoals,
    unmarked: markCounts.unmarked,
    targetGrade: targetKey,
    targetGradeLabel: formatGradeLabel(targetKey),
    achievedGrade: achievedKey,
    achievedGradeLabel: formatGradeLabel(achievedKey),
    grow: targetsRow?.growText ?? null,
    glow: targetsRow?.glowText ?? null,
    nextGoal: targetsRow?.nextGoalText ?? null,
    xpAwarded: {
      targetGrade: !!targetsRow?.xpTargetAwarded,
      achievedGrade: !!targetsRow?.xpAchievedAwarded,
      grow: !!targetsRow?.xpGrowAwarded,
      glow: !!targetsRow?.xpGlowAwarded,
      nextGoal: !!targetsRow?.xpNextGoalAwarded
    },
    tiers,
    recommended,
    onTrack: allOnTrack,
    summary
  };
}

function buildTargetProgressSummary(tiers, targetGradeKey) {
  if (!targetGradeKey) return null;
  const parts = tiers
    .filter((t) => t.recommended != null)
    .map((t) => {
      if (t.remaining <= 0) return `${t.label} ✓`;
      return `noch ${t.remaining}× ${t.label}`;
    });
  return parts.length ? parts.join(" · ") : null;
}

function buildGoalMarkFromRows(rows) {
  const tiers = {};
  for (const row of rows || []) {
    tiers[row.tier] = { updatedAt: row.updated_at };
  }
  return Object.keys(tiers).length ? { tiers } : null;
}

async function fetchTargetGradesByCheck(studentId, checkIds) {
  const targetsByCheck = {};
  if (!checkIds.length) return targetsByCheck;

  let targetsRes;
  try {
    targetsRes = await pool.query(
      `
      SELECT
        level_check_id,
        target_grade_key,
        target_grade,
        achieved_grade_key,
        grow_text,
        glow_text,
        next_goal_text,
        xp_target_awarded,
        xp_achieved_awarded,
        xp_grow_awarded,
        xp_glow_awarded,
        xp_next_goal_awarded
      FROM level_check_targets
      WHERE user_id = $1 AND level_check_id = ANY($2::uuid[])
    `,
      [studentId, checkIds]
    );
  } catch (err) {
    console.error("❌ fetchTargetGradesByCheck (full):", err.message);
    targetsRes = await pool.query(
      `
      SELECT level_check_id, target_grade_key, target_grade, achieved_grade_key
      FROM level_check_targets
      WHERE user_id = $1 AND level_check_id = ANY($2::uuid[])
    `,
      [studentId, checkIds]
    );
  }

  for (const row of targetsRes.rows) {
    targetsByCheck[row.level_check_id] = {
      targetGradeKey:
        normalizeTargetGradeKey(row.target_grade_key) ||
        normalizeTargetGradeKey(row.target_grade),
      achievedGradeKey: normalizeTargetGradeKey(row.achieved_grade_key),
      growText: row.grow_text ?? null,
      glowText: row.glow_text ?? null,
      nextGoalText: row.next_goal_text ?? null,
      xpTargetAwarded: !!row.xp_target_awarded,
      xpAchievedAwarded: !!row.xp_achieved_awarded,
      xpGrowAwarded: !!row.xp_grow_awarded,
      xpGlowAwarded: !!row.xp_glow_awarded,
      xpNextGoalAwarded: !!row.xp_next_goal_awarded
    };
  }

  return targetsByCheck;
}

function attachTargetProgressToChecks(checks, targetsByCheck) {
  return checks.map((check) => ({
    ...check,
    target: buildTopicTargetProgress(check, targetsByCheck[check.id] ?? null)
  }));
}

function buildZielsetzungTopic(check, targetsRow) {
  return buildTopicTargetProgress(check, targetsRow);
}

function groupZielsetzungBySubject(topics) {
  const bySubject = {};
  for (const topic of topics) {
    if (!bySubject[topic.subject]) bySubject[topic.subject] = [];
    bySubject[topic.subject].push(topic);
  }

  const grouped = [];
  for (const subject of LOG_SUBJECTS) {
    if (bySubject[subject]?.length) {
      grouped.push({ subject, topics: bySubject[subject] });
      delete bySubject[subject];
    }
  }
  for (const [subject, topicsList] of Object.entries(bySubject)) {
    grouped.push({ subject, topics: topicsList });
  }
  return grouped;
}

function subjectsFromZielsetzungGroups(grouped) {
  return (grouped || []).map((g) => g.subject);
}

const LOG_SUBJECTS = [
  "Mathe",
  "Deutsch",
  "BNT",
  "Englisch",
  "Geo",
  "Geschichte",
  "Projekt",
  "Physik",
  "Chemie",
  "Biologie",
  "AES",
  "Technik",
  "Französisch",
  "GK",
  "Musik",
  "BK",
  "WBS",
  "Religion/Ethik"
];

const TIMETABLE_DEFAULT_TIMES = [
  "7.50-8.35",
  "8.40-9.25",
  "9.30-10.15",
  "10.35-11.20",
  "11.25-12.10",
  "12.15-13.00",
  "13.05-13.50"
];

const TIMETABLE_FREE_SUBJECT = "Frei";

function isTimetableFreeSubject(subject) {
  return subject === TIMETABLE_FREE_SUBJECT;
}

function timetableSubjectsFromRows(rows) {
  return [...new Set(rows.map((t) => t.subject).filter((s) => s && !isTimetableFreeSubject(s)))];
}

function timetableSubjectForSlot(timetable, timeslot) {
  if (!timeslot || !Array.isArray(timetable)) return null;
  const row = timetable.find((t) => t.timeslot === timeslot);
  const subject = row?.subject;
  if (!subject || isTimetableFreeSubject(subject)) return null;
  return subject;
}

function sortTimetableSlots(slots) {
  const order = new Map(TIMETABLE_DEFAULT_TIMES.map((t, i) => [t, i]));
  return [...slots].sort((a, b) => {
    const ai = order.has(a.timeslot) ? order.get(a.timeslot) : 999;
    const bi = order.has(b.timeslot) ? order.get(b.timeslot) : 999;
    if (ai !== bi) return ai - bi;
    return String(a.timeslot).localeCompare(String(b.timeslot), "de");
  });
}

function buildTimetableEditorSlots(dayRows) {
  const slots = TIMETABLE_DEFAULT_TIMES.map((timeslot) => ({
    id: null,
    timeslot,
    subject: "",
    room: ""
  }));

  for (const row of dayRows) {
    const idx = TIMETABLE_DEFAULT_TIMES.indexOf(row.timeslot);
    if (idx < 0) continue;
    slots[idx] = {
      id: row.id,
      timeslot: TIMETABLE_DEFAULT_TIMES[idx],
      subject: row.subject,
      room: row.room || ""
    };
  }

  return slots;
}

async function getStudentClassContext(studentId) {
  const r = await pool.query(
    `
    SELECT u.class_id, COALESCE(u.school_id, c.school_id) AS school_id, c.name AS class_name
    FROM users u
    LEFT JOIN classes c ON c.id = u.class_id
    WHERE u.id = $1
  `,
    [studentId]
  );
  const row = r.rows[0];
  return {
    classId: row?.class_id ?? null,
    schoolId: row?.school_id ?? null,
    className: row?.class_name ?? null
  };
}

async function fetchTimetableForClassDay(classId, weekday) {
  if (!classId || !weekday) return [];
  const tRes = await pool.query(
    `
    SELECT timeslot, subject, room
    FROM timetables
    WHERE class_id = $1 AND weekday = $2
    ORDER BY timeslot ASC
  `,
    [classId, weekday]
  );
  return sortTimetableSlots(tRes.rows);
}

const PLAN_ENTRY_FIELDS = `
  id, subject, goal, timeslot, work_goals, social_form,
  strategy, confidence_before, freitext, created_at
`;

async function findPlanLogEntry(studentId, { date, subject, timeslot, entryId }) {
  if (entryId) {
    const byId = await pool.query(
      `
      SELECT ${PLAN_ENTRY_FIELDS}
      FROM log_entries
      WHERE id=$1 AND user_id=$2
      LIMIT 1
    `,
      [entryId, studentId]
    );
    return byId.rows[0] || null;
  }

  if (!subject || !LOG_SUBJECTS.includes(subject) || !date) return null;

  const flexible = await pool.query(
    `
    SELECT ${PLAN_ENTRY_FIELDS}
    FROM log_entries
    WHERE user_id=$1 AND date=$2 AND subject=$3
      AND (
        $4::text IS NULL
        OR timeslot IS NULL
        OR timeslot = $4
      )
    ORDER BY
      CASE WHEN $4::text IS NOT NULL AND timeslot = $4 THEN 0 ELSE 1 END,
      created_at ASC
    LIMIT 1
  `,
    [studentId, date, subject, timeslot || null]
  );
  return flexible.rows[0] || null;
}

const LOG_GOALS = [
  "Neues Thema verstehen",
  "Verfahren erklären können",
  "Einfache Aufgaben lösen",
  "Aufgaben selbständig lösen",
  "Schwierigere Aufgaben lösen",
  "Fehler verbessern",
  "Thema wiederholen",
  "Test/Levelcheck vorbereiten"
];

async function fetchCustomSubjectLessonGoals(schoolId, subject = null) {
  const params = [schoolId];
  let subjectFilter = "";
  if (subject) {
    subjectFilter = " AND subject = $2";
    params.push(subject);
  }

  const res = await pool.query(
    `
    SELECT id, subject, goal_text, sort_order
    FROM subject_lesson_goals
    WHERE school_id = $1${subjectFilter}
    ORDER BY subject ASC, sort_order ASC, created_at ASC
  `,
    params
  );

  if (subject) {
    return res.rows.map((row) => ({
      id: row.id,
      text: row.goal_text,
      sortOrder: row.sort_order
    }));
  }

  const bySubject = {};
  for (const row of res.rows) {
    if (!bySubject[row.subject]) bySubject[row.subject] = [];
    bySubject[row.subject].push({
      id: row.id,
      text: row.goal_text,
      sortOrder: row.sort_order
    });
  }
  return bySubject;
}

function lessonGoalsForSubject(customGoalsBySubject, subject) {
  const custom = customGoalsBySubject?.[subject];
  if (Array.isArray(custom) && custom.length) {
    return custom.map((g) => g.text);
  }
  return LOG_GOALS;
}

async function getLessonGoalsForSubject(schoolId, subject) {
  const custom = await fetchCustomSubjectLessonGoals(schoolId, subject);
  if (custom.length) {
    return custom.map((g) => g.text);
  }
  return LOG_GOALS;
}

function isAllowedLessonGoal(goal, allowedGoals) {
  if (!goal) return false;
  if (allowedGoals.includes(goal)) return true;
  return LOG_GOALS.includes(goal);
}

const LOG_WORK_GOALS = [
  "Konzentriert arbeiten",
  "Kein Handy",
  "Tablet nur für Aufgaben",
  "Nicht ablenken lassen",
  "Ruhig arbeiten",
  "Hilfe holen wenn nötig"
];

const LOG_SOCIAL_FORMS = ["einzel", "partner", "gruppe", "frei"];

const LOG_GOAL_ACHIEVED = ["ja", "teilweise", "nein"];

const LOG_HOW_WORKED = ["konzentriert", "mit_hilfe", "unruhig", "abgelenkt"];

const LOG_NEXT_STEPS = [
  "weiterüben",
  "hilfe_holen",
  "levelcheck_machen",
  "test_vorbereiten",
  "neues_thema"
];

const LOG_STRATEGIES = [
  "Text genau lesen",
  "Beispiele anschauen",
  "Erklärung im Kopf wiederholen",
  "Aufgaben Schritt für Schritt",
  "Im Heft üben",
  "Mit Partner vergleichen",
  "Schwierigere Beispiele probieren",
  "Eigene Beispiele finden",
  "Thema mit anderem verbinden",
  "Ergebnis kontrollieren",
  "Gegenprobe machen",
  "Lösungsweg erklären"
];

function isoDateOrToday(value) {
  if (!value) return new Date().toISOString().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function weekdayFromIsoDate(dateStr) {
  const d = new Date(`${dateStr}T12:00:00`);
  const jsDay = d.getDay();
  return jsDay >= 1 && jsDay <= 5 ? jsDay : null;
}

const LOG_TIME_WASTERS = [
  "Handy / Social Media",
  "Gespräche mit Nachbarn",
  "Lärm in der Klasse",
  "Ich war müde",
  "Aufgabe war unklar",
  "Ich habe aufgeschoben"
];

const LOG_TIME_WASTER_LEVELS = ["selten", "manchmal", "oft"];

const LOG_CHECK_RATINGS = ["👍", "😐", "👎"];

const LOG_COMPETENCY_STATUSES = [
  "offen",
  "in_arbeit",
  "bereit",
  "test_angemeldet",
  "bestanden",
  "nacharbeit"
];

const LOG_COMPETENCY_STATUS_LABELS = {
  offen: "Offen",
  in_arbeit: "In Arbeit",
  bereit: "Bereit für Zielsetzung",
  test_angemeldet: "Test angemeldet",
  bestanden: "Bestanden",
  nacharbeit: "Nacharbeit"
};

const LOG_NEXT_STEP_LABELS = {
  weiterüben: "Weiterüben",
  hilfe_holen: "Hilfe holen",
  levelcheck_machen: "Zielsetzung prüfen",
  test_vorbereiten: "Test vorbereiten",
  neues_thema: "Neues Thema"
};

const TEACHER_HINT_PRIORITY = { yellow: 0, red: 1, green: 2, blue: 3 };

function computeStudentHint(entries, reflections, threeJaStreak) {
  if (!entries.length) {
    return { tag: "enger begleiten", color: "yellow" };
  }

  let best = { tag: "stabil", color: "blue", priority: TEACHER_HINT_PRIORITY.blue };

  for (const entry of entries) {
    const reflection = reflections.find((r) => r.log_entry_id === entry.id);
    let hint;

    if (!reflection) {
      hint = { tag: "stabil", color: "blue" };
    } else {
      const before = entry.confidence_before;
      const after = reflection.confidence_after;
      if (
        reflection.goal_achieved === "nein" &&
        before != null &&
        after != null &&
        after < before
      ) {
        hint = { tag: "Gespräch sinnvoll", color: "red" };
      } else if (threeJaStreak) {
        hint = { tag: "Zielsetzung prüfen", color: "green" };
      } else {
        hint = { tag: "stabil", color: "blue" };
      }
    }

    const priority = TEACHER_HINT_PRIORITY[hint.color];
    if (priority < best.priority) {
      best = { ...hint, priority };
    }
  }

  if (threeJaStreak && best.color === "blue") {
    best = { tag: "Zielsetzung prüfen", color: "green", priority: TEACHER_HINT_PRIORITY.green };
  }

  delete best.priority;
  return best;
}

function hasThreeJaStreak(reflectionRows) {
  if (reflectionRows.length < 3) return false;
  return reflectionRows.slice(0, 3).every((r) => r.goal_achieved === "ja");
}

function addDaysIso(dateStr, days) {
  const d = new Date(`${dateStr}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function mondayOfWeek(dateStr) {
  const d = new Date(`${dateStr}T12:00:00`);
  const jsDay = d.getDay();
  const diff = jsDay === 0 ? -6 : 1 - jsDay;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

function fridayOfWeek(weekStart) {
  return addDaysIso(weekStart, 4);
}

function isoWeekNumber(dateStr) {
  const d = new Date(`${dateStr}T12:00:00`);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  return (
    1 +
    Math.round(
      ((d - week1) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7
    )
  );
}

async function getSocialFormUnlock(studentId, schoolId) {
  const userRes = await pool.query(
    "SELECT xp, level_id FROM users WHERE id=$1",
    [studentId]
  );
  if (!userRes.rows.length) {
    return { gruppe: false, frei: false, levelRank: 0, levelName: null };
  }

  const { xp } = userRes.rows[0];
  const levelsRes = await pool.query(
    "SELECT id, name, min_xp FROM levels WHERE school_id=$1 ORDER BY min_xp ASC",
    [schoolId]
  );

  let levelRank = 0;
  let levelName = null;
  for (let i = 0; i < levelsRes.rows.length; i++) {
    if (xp >= levelsRes.rows[i].min_xp) {
      levelRank = i;
      levelName = levelsRes.rows[i].name;
    }
  }

  const nameLower = (levelName || "").toLowerCase();
  const gruppe =
    levelRank >= 1 ||
    nameLower.includes("silber") ||
    nameLower.includes("street pro") ||
    nameLower.includes("gold") ||
    nameLower.includes("legend");
  const frei =
    levelRank >= 2 ||
    nameLower.includes("gold") ||
    nameLower.includes("legend");

  return { gruppe, frei, levelRank, levelName };
}

async function awardLogbuchXP(studentId, amount, source, schoolId) {
  await pool.query("UPDATE users SET xp=xp+$1 WHERE id=$2", [amount, studentId]);
  await logXP(studentId, amount, null, source, null, schoolId);
  await updateStudentLevel(studentId);
}

function publicImageUrl(url) {
  const trimmed = String(url ?? "").trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  const base = String(process.env.R2_PUBLIC_URL || "").replace(/\/$/, "");
  if (base) return `${base}/${trimmed.replace(/^\/+/, "")}`;
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

// -------------------------------------------------------
// Grundpfade
// -------------------------------------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.set("trust proxy", 1);
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const isProduction =
  process.env.NODE_ENV === "production" || !!process.env.RAILWAY_ENVIRONMENT;

app.use(
  session({
    secret: "super-temp-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: isProduction,
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 24 * 14
    }
  })
);

// Static-Files
app.use(
  express.static(path.join(__dirname, "public"), {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith("sw.js")) {
        res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      }
    }
  })
);

// Login-Root
app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

// -------------------------------------------------------
// DB + R2 Storage
// -------------------------------------------------------
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl:
    process.env.DATABASE_URL &&
    !process.env.DATABASE_URL.includes("localhost")
      ? { rejectUnauthorized: false }
      : undefined
});

const r2 = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY
  }
});

const upload = multer({ storage: multer.memoryStorage() });

// -------------------------------------------------------
// Helper – fehlende Spalten anlegen
// -------------------------------------------------------
async function ensureColumn(table, col, type) {
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name='${table}' AND column_name='${col}'
      ) THEN
        ALTER TABLE ${table} ADD COLUMN ${col} ${type};
      END IF;
    END$$;
  `);
}

// -------------------------------------------------------
// Helper – Temp-Passwort
// -------------------------------------------------------
function generateTempPassword(length = 6) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  return Array.from({ length })
    .map(() => chars[Math.floor(Math.random() * chars.length)])
    .join("");
}

// -------------------------------------------------------
// LEVEL-Funktionen
// -------------------------------------------------------
async function updateStudentLevel(studentId) {
  const r = await pool.query(
    "SELECT xp,school_id FROM users WHERE id=$1",
    [studentId]
  );
  if (!r.rows.length) return;

  const { xp, school_id } = r.rows[0];

  const levels = await pool.query(
    "SELECT id,min_xp FROM levels WHERE school_id=$1 ORDER BY min_xp ASC",
    [school_id]
  );

  let newLevel = null;
  for (const lvl of levels.rows) {
    if (xp >= lvl.min_xp) newLevel = lvl.id;
  }

  await pool.query(
    "UPDATE users SET level_id=$1 WHERE id=$2",
    [newLevel, studentId]
  );
}

async function recalcAllStudentLevels() {
  const users = (
    await pool.query(
      "SELECT id,xp,school_id FROM users WHERE role='student'"
    )
  ).rows;

  for (const u of users) {
    const lvls = (
      await pool.query(
        "SELECT id,min_xp FROM levels WHERE school_id=$1 ORDER BY min_xp ASC",
        [u.school_id]
      )
    ).rows;

    let levelId = null;
    for (const l of lvls) {
      if (u.xp >= l.min_xp) levelId = l.id;
    }

    await pool.query(
      "UPDATE users SET level_id=$1 WHERE id=$2",
      [levelId, u.id]
    );
  }
}

// -------------------------------------------------------
// Helper – XP Summe pro Klasse
// -------------------------------------------------------
async function getClassTotalXP(classId, schoolId) {
  const r = await pool.query(
    `
    SELECT COALESCE(SUM(xp),0) AS total
    FROM users
    WHERE role='student'
      AND class_id=$1
      AND school_id=$2
  `,
    [classId, schoolId]
  );

  return Number(r.rows[0]?.total || 0);
}

// -------------------------------------------------------
// Default-Daten pro Schule
// -------------------------------------------------------
async function seedSchoolDefaults(schoolId) {
  const sid = Number(schoolId);

  // LEVELS
  const lvlCount = (
    await pool.query(
      "SELECT COUNT(*) FROM levels WHERE school_id=$1",
      [sid]
    )
  ).rows[0];

  if (Number(lvlCount.count) === 0) {
    await pool.query(`
      INSERT INTO levels (name,min_xp,school_id) VALUES
        ('Rookie', 0, ${sid}),
        ('Street Pro', 100, ${sid}),
        ('Logic Legend', 250, ${sid})
    `);
  }

  // MISSIONEN
  const missionCount = (
    await pool.query(
      "SELECT COUNT(*) FROM missions WHERE school_id=$1",
      [sid]
    )
  ).rows[0];

  if (Number(missionCount.count) === 0) {
    await pool.query(`
      INSERT INTO missions (name,xp,image_url,require_upload,school_id)
      VALUES
        ('Warm-Up: Konzentrations-Drive', 10, NULL, FALSE, ${sid}),
        ('Math Hustle: Gleichungsjagd', 20, NULL, TRUE, ${sid}),
        ('Logic Run: Rätsel-Checkpoint', 30, NULL, TRUE, ${sid})
    `);
  }

  // BONUSKARTEN
  const bonusCount = (
    await pool.query(
      "SELECT COUNT(*) FROM bonuscards WHERE school_id=$1",
      [sid]
    )
  ).rows[0];

  if (Number(bonusCount.count) === 0) {
    await pool.query(`
      INSERT INTO bonuscards (name,xp,image_url,school_id)
      VALUES
        ('5-Minuten Chill-Break', 30, NULL, ${sid}),
        ('Hausaufgaben-Joker (1x)', 60, NULL, ${sid}),
        ('Boss-Seat: Wunschplatz', 90, NULL, ${sid})
    `);
  }

  // CHARAKTERE
  const charCount = (
    await pool.query(
      "SELECT COUNT(*) FROM characters WHERE school_id=$1",
      [sid]
    )
  ).rows[0];

  if (Number(charCount.count) === 0) {
    await pool.query(`
      INSERT INTO characters (name,image_url,school_id)
      VALUES
        ('Nova Drift', NULL, ${sid}),
        ('Pixel Rydah', NULL, ${sid}),
        ('Logic Lynx', NULL, ${sid}),
        ('Neon Vibes', NULL, ${sid})
    `);
  }
}

// -------------------------------------------------------
// MIGRATION – Tabellen anlegen + Fixes
// -------------------------------------------------------
async function migrate() {
  console.log("🔧 Migration läuft…");

  // SCHULEN
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schools (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  // USERS
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'student',
      class_id INTEGER,
      xp INTEGER NOT NULL DEFAULT 0,
      character_id INTEGER,
      level_id INTEGER,
      traits JSONB,
      items JSONB,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await ensureColumn("users", "first_login", "BOOLEAN NOT NULL DEFAULT FALSE");
  await ensureColumn("users", "school_id", "INTEGER");

    // -------------------------------------------------------
  // UNIQUE-CONSTRAINTS (wichtig für ON CONFLICT)
  // -------------------------------------------------------
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE table_name='users'
          AND constraint_type='UNIQUE'
          AND constraint_name='users_name_school_unique'
      ) THEN
        ALTER TABLE users
        ADD CONSTRAINT users_name_school_unique UNIQUE (name, school_id);
      END IF;
    END$$;
  `);

    await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE table_name='classes'
          AND constraint_type='UNIQUE'
          AND constraint_name='classes_name_school_unique'
      ) THEN
        ALTER TABLE classes
        ADD CONSTRAINT classes_name_school_unique UNIQUE (name, school_id);
      END IF;
    END$$;
  `);

  // KLASSEN
  await pool.query(`
    CREATE TABLE IF NOT EXISTS classes (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL
    )
  `);
  await ensureColumn("classes", "school_id", "INTEGER");

  // MISSIONEN
  await pool.query(`
    CREATE TABLE IF NOT EXISTS missions (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      xp INTEGER NOT NULL,
      image_url TEXT,
      require_upload BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await ensureColumn("missions", "school_id", "INTEGER");

  // UPLOADS
  await pool.query(`
    CREATE TABLE IF NOT EXISTS student_uploads (
      id SERIAL PRIMARY KEY,
      student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      mission_id INTEGER REFERENCES missions(id),
      image_url TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await ensureColumn("student_uploads", "school_id", "INTEGER");

  // BONUSKARTEN
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bonuscards (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      xp INTEGER NOT NULL,
      image_url TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await ensureColumn("bonuscards", "school_id", "INTEGER");

  // KLASSENBELOHNUNGEN (Liste)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS class_rewards (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      xp_required INTEGER NOT NULL,
      image_url TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await ensureColumn("class_rewards", "school_id", "INTEGER");

  // CHARAKTERE
  await pool.query(`
    CREATE TABLE IF NOT EXISTS characters (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      image_url TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await ensureColumn("characters", "school_id", "INTEGER");

  // XP-LOG
  await pool.query(`
    CREATE TABLE IF NOT EXISTS xp_transactions (
      id SERIAL PRIMARY KEY,
      student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      amount INTEGER NOT NULL,
      mission_id INTEGER REFERENCES missions(id),
      source TEXT,
      awarded_by INTEGER,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await ensureColumn("xp_transactions", "school_id", "INTEGER");

  // LEVELS
  await pool.query(`
    CREATE TABLE IF NOT EXISTS levels (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      min_xp INTEGER NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await ensureColumn("levels", "school_id", "INTEGER");

  // ------------------------------------------
  // KLASSE-BELOHNUNGS-RUNDEN (Voting-System)
  // ------------------------------------------
  await pool.query(`
    CREATE TABLE IF NOT EXISTS class_reward_rounds (
      id SERIAL PRIMARY KEY,
      class_id INTEGER,
      school_id INTEGER,
      title TEXT,
      target_xp INTEGER,
      is_active BOOLEAN DEFAULT TRUE,
      fixed_option_id INTEGER,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await ensureColumn("class_reward_rounds", "school_id", "INTEGER");
  await ensureColumn("class_reward_rounds", "is_active", "BOOLEAN DEFAULT TRUE");
  await ensureColumn("class_reward_rounds", "title", "TEXT");

  // ------------------------------------------
  // KLASSE-BELOHNUNGS-OPTIONEN (Voting)
  //  -> jetzt mit reward_id, damit eine Klassenbelohnung
  //     direkt an eine Voting-Option gebunden werden kann
  // ------------------------------------------
  await pool.query(`
    CREATE TABLE IF NOT EXISTS class_reward_options (
      id SERIAL PRIMARY KEY,
      round_id INTEGER,
      reward_id INTEGER,
      name TEXT,
      image_url TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await ensureColumn("class_reward_options", "round_id", "INTEGER");
  await ensureColumn("class_reward_options", "reward_id", "INTEGER");
  await ensureColumn("class_reward_options", "name", "TEXT");
  await ensureColumn("class_reward_options", "image_url", "TEXT");

  // WICHTIG: reward_id darf NULL sein (sonst crash bei freien Optionen)
  await pool.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name='class_reward_options'
          AND column_name='reward_id'
      ) THEN
        BEGIN
          ALTER TABLE class_reward_options
          ALTER COLUMN reward_id DROP NOT NULL;
        EXCEPTION WHEN others THEN
          -- falls kein NOT NULL gesetzt ist, einfach ignorieren
          NULL;
        END;
      END IF;
    END$$;
  `);

  // ------------------------------------------
  // STIMMEN FÜR VOTING
  // ------------------------------------------
  await pool.query(`
    CREATE TABLE IF NOT EXISTS class_reward_votes (
      id SERIAL PRIMARY KEY,
      round_id INTEGER,
      student_id INTEGER,
      option_id INTEGER,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await ensureColumn("class_reward_votes", "round_id", "INTEGER");
  await ensureColumn("class_reward_votes", "student_id", "INTEGER");
  await ensureColumn("class_reward_votes", "option_id", "INTEGER");
  await ensureColumn("class_reward_votes", "reward_id", "INTEGER");


  // UNIQUE: eine Stimme pro Schüler pro Runde
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE table_name='class_reward_votes'
          AND constraint_name='class_reward_votes_unique_vote'
      ) THEN
        ALTER TABLE class_reward_votes
        ADD CONSTRAINT class_reward_votes_unique_vote UNIQUE(round_id,student_id);
      END IF;
    END$$;
  `);

  // ------------------------------------------
  // KLASSE-CHALLENGES
  // ------------------------------------------
  await pool.query(`
    CREATE TABLE IF NOT EXISTS class_challenges (
      id SERIAL PRIMARY KEY,
      class_id INTEGER,
      reward_id INTEGER,
      target_xp INTEGER,
      is_active BOOLEAN DEFAULT TRUE,
      school_id INTEGER,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await ensureColumn("class_challenges", "school_id", "INTEGER");

  // -------------------------------------------------------
  // SRL-LOGBUCH – UUID-Unterstützung
  // -------------------------------------------------------
  try {
    await pool.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);
  } catch (extErr) {
    console.warn("⚠️ pgcrypto Extension:", extErr.message);
  }

  // LogEntry – Tagesziel / Planung (Forethought)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS log_entries (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      school_id INTEGER,
      date DATE NOT NULL,
      timeslot TEXT,
      subject TEXT NOT NULL,
      goal TEXT NOT NULL,
      work_goals JSONB NOT NULL DEFAULT '[]',
      social_form TEXT,
      strategy TEXT,
      confidence_before INTEGER,
      freitext TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await ensureColumn("log_entries", "school_id", "INTEGER");

  // LogCheck – Zwischen-Check (Performance)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS log_checks (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      log_entry_id UUID NOT NULL REFERENCES log_entries(id) ON DELETE CASCADE,
      on_track TEXT NOT NULL,
      understands TEXT NOT NULL,
      progress TEXT NOT NULL,
      change_note TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(log_entry_id)
    )
  `);

  // LogReflection – Tagesabschluss (Self-Reflection)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS log_reflections (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      log_entry_id UUID NOT NULL REFERENCES log_entries(id) ON DELETE CASCADE,
      goal_achieved TEXT NOT NULL,
      how_worked TEXT NOT NULL,
      next_step TEXT NOT NULL,
      confidence_after INTEGER NOT NULL,
      learned_today TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(log_entry_id)
    )
  `);

  // LogWeekReflection – Wochenreflexion inkl. Zeitfresser-Matrix
  await pool.query(`
    CREATE TABLE IF NOT EXISTS log_week_reflections (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      school_id INTEGER,
      week_start DATE NOT NULL,
      time_wasters JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(user_id, week_start)
    )
  `);
  await ensureColumn("log_week_reflections", "school_id", "INTEGER");

  // CompetencyStatus – Kompetenz-Status pro Fach/Thema
  await pool.query(`
    CREATE TABLE IF NOT EXISTS competency_status (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      school_id INTEGER,
      subject TEXT NOT NULL,
      topic TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'offen',
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await ensureColumn("competency_status", "school_id", "INTEGER");

  // Timetable – Stundenplan pro Klasse (von Lehrkraft gepflegt)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS timetables (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      school_id INTEGER,
      weekday INTEGER NOT NULL CHECK (weekday >= 1 AND weekday <= 5),
      timeslot TEXT NOT NULL,
      subject TEXT NOT NULL,
      room TEXT
    )
  `);
  await ensureColumn("timetables", "school_id", "INTEGER");

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_log_entries_user_date
    ON log_entries (user_id, date)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_competency_status_user_subject
    ON competency_status (user_id, subject)
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS level_check_topics (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      school_id INTEGER,
      class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      subject TEXT NOT NULL,
      topic TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await ensureColumn("level_check_topics", "school_id", "INTEGER");

  await pool.query(`
    CREATE TABLE IF NOT EXISTS level_check_uploads (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      school_id INTEGER,
      topic_id UUID NOT NULL REFERENCES level_check_topics(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      tier TEXT NOT NULL,
      file_url TEXT NOT NULL,
      file_name TEXT,
      xp_awarded INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(topic_id, user_id, tier)
    )
  `);
  await ensureColumn("level_check_uploads", "school_id", "INTEGER");

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_level_check_topics_class
    ON level_check_topics (class_id, subject)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_level_check_uploads_user
    ON level_check_uploads (user_id, topic_id)
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS level_checks (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      school_id INTEGER,
      class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      subject TEXT NOT NULL,
      name TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await ensureColumn("level_checks", "school_id", "INTEGER");

  await pool.query(`
    CREATE TABLE IF NOT EXISTS level_check_goals (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      school_id INTEGER,
      level_check_id UUID NOT NULL REFERENCES level_checks(id) ON DELETE CASCADE,
      goal_text TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await ensureColumn("level_check_goals", "school_id", "INTEGER");

  await pool.query(`
    CREATE TABLE IF NOT EXISTS level_check_marks (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      school_id INTEGER,
      goal_id UUID NOT NULL REFERENCES level_check_goals(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      tier TEXT NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(goal_id, user_id, tier)
    )
  `);
  await ensureColumn("level_check_marks", "school_id", "INTEGER");

  await pool.query(`
    ALTER TABLE level_check_marks
    DROP CONSTRAINT IF EXISTS level_check_marks_goal_id_user_id_key
  `).catch(() => {});

  await pool.query(`
    INSERT INTO level_check_marks (school_id, goal_id, user_id, tier, updated_at)
    SELECT school_id, goal_id, user_id, 'rookie', updated_at
    FROM level_check_marks
    WHERE tier IN ('operator', 'street_legend')
      AND NOT EXISTS (
        SELECT 1 FROM level_check_marks m2
        WHERE m2.goal_id = level_check_marks.goal_id
          AND m2.user_id = level_check_marks.user_id
          AND m2.tier = 'rookie'
      )
  `).catch(() => {});

  await pool.query(`
    INSERT INTO level_check_marks (school_id, goal_id, user_id, tier, updated_at)
    SELECT school_id, goal_id, user_id, 'operator', updated_at
    FROM level_check_marks
    WHERE tier = 'street_legend'
      AND NOT EXISTS (
        SELECT 1 FROM level_check_marks m2
        WHERE m2.goal_id = level_check_marks.goal_id
          AND m2.user_id = level_check_marks.user_id
          AND m2.tier = 'operator'
      )
  `).catch(() => {});

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE table_name = 'level_check_marks'
          AND constraint_name = 'level_check_marks_goal_user_tier_unique'
      ) THEN
        ALTER TABLE level_check_marks
        ADD CONSTRAINT level_check_marks_goal_user_tier_unique
        UNIQUE (goal_id, user_id, tier);
      END IF;
    END$$;
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_level_checks_class
    ON level_checks (class_id, subject, sort_order)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_level_check_goals_check
    ON level_check_goals (level_check_id, sort_order)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_level_check_marks_user
    ON level_check_marks (user_id, goal_id)
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS level_check_proofs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      school_id INTEGER,
      level_check_id UUID NOT NULL REFERENCES level_checks(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      tier TEXT NOT NULL,
      file_url TEXT NOT NULL,
      file_name TEXT,
      xp_awarded INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(level_check_id, user_id, tier)
    )
  `);
  await ensureColumn("level_check_proofs", "school_id", "INTEGER");

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_level_check_proofs_user
    ON level_check_proofs (user_id, level_check_id)
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS level_check_targets (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      school_id INTEGER,
      level_check_id UUID NOT NULL REFERENCES level_checks(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      target_grade INTEGER NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(level_check_id, user_id)
    )
  `);
  await ensureColumn("level_check_targets", "target_grade_key", "TEXT");
  await ensureColumn("level_check_targets", "achieved_grade_key", "TEXT");
  await ensureColumn("level_check_targets", "school_id", "INTEGER");
  await ensureColumn("level_check_targets", "grow_text", "TEXT");
  await ensureColumn("level_check_targets", "glow_text", "TEXT");
  await ensureColumn("level_check_targets", "next_goal_text", "TEXT");
  await ensureColumn("level_check_targets", "xp_target_awarded", "BOOLEAN DEFAULT FALSE");
  await ensureColumn("level_check_targets", "xp_achieved_awarded", "BOOLEAN DEFAULT FALSE");
  await ensureColumn("level_check_targets", "xp_grow_awarded", "BOOLEAN DEFAULT FALSE");
  await ensureColumn("level_check_targets", "xp_glow_awarded", "BOOLEAN DEFAULT FALSE");
  await ensureColumn("level_check_targets", "xp_next_goal_awarded", "BOOLEAN DEFAULT FALSE");

  await pool.query(`
    ALTER TABLE level_check_targets
    ALTER COLUMN target_grade DROP NOT NULL
  `).catch(() => {});

  await pool.query(`
    UPDATE level_check_targets
    SET target_grade_key = target_grade::text
    WHERE target_grade_key IS NULL AND target_grade IS NOT NULL
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_level_check_targets_user
    ON level_check_targets (user_id, level_check_id)
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS subject_lesson_goals (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      school_id INTEGER NOT NULL,
      subject TEXT NOT NULL,
      goal_text TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_subject_lesson_goals_school_subject
    ON subject_lesson_goals (school_id, subject, sort_order)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_timetables_class_weekday
    ON timetables (class_id, weekday)
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE table_name='timetables'
          AND constraint_name='timetables_class_weekday_timeslot_unique'
      ) THEN
        ALTER TABLE timetables
        ADD CONSTRAINT timetables_class_weekday_timeslot_unique
        UNIQUE (class_id, weekday, timeslot);
      END IF;
    END$$;
  `);

  // -------------------------------------------------------
  // LEVEL-CONSTRAINT FIX
  // -------------------------------------------------------
  await pool.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE table_name='levels'
          AND constraint_name='levels_min_xp_unique'
      ) THEN
        ALTER TABLE levels DROP CONSTRAINT levels_min_xp_unique;
      END IF;
    END$$;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE table_name='levels'
          AND constraint_name='levels_school_min_xp_unique'
      ) THEN
        ALTER TABLE levels
        ADD CONSTRAINT levels_school_min_xp_unique UNIQUE(school_id,min_xp);
      END IF;
    END$$;
  `);

  // -------------------------------------------------------
  // GEISTERDATEN BEREINIGUNG – verwaiste Schüler/Uploads
  // -------------------------------------------------------
  await pool.query(`
    DELETE FROM student_uploads su
    WHERE NOT EXISTS (
      SELECT 1 FROM users u WHERE u.id = su.student_id
    );
  `);

  await pool.query(`
    DELETE FROM xp_transactions xt
    WHERE NOT EXISTS (
      SELECT 1 FROM users u WHERE u.id = xt.student_id
    );
  `);

  await pool.query(`
    DELETE FROM class_reward_votes v
    WHERE NOT EXISTS (
      SELECT 1 FROM users u WHERE u.id = v.student_id
    );
  `);

  await pool.query(`
    DELETE FROM log_checks lc
    WHERE NOT EXISTS (
      SELECT 1 FROM log_entries le WHERE le.id = lc.log_entry_id
    );
  `);

  await pool.query(`
    DELETE FROM log_reflections lr
    WHERE NOT EXISTS (
      SELECT 1 FROM log_entries le WHERE le.id = lr.log_entry_id
    );
  `);

  await pool.query(`
    DELETE FROM log_entries le
    WHERE NOT EXISTS (
      SELECT 1 FROM users u WHERE u.id = le.user_id
    );
  `);

  await pool.query(`
    DELETE FROM competency_status cs
    WHERE NOT EXISTS (
      SELECT 1 FROM users u WHERE u.id = cs.user_id
    );
  `);

  await pool.query(`
    DELETE FROM log_week_reflections lwr
    WHERE NOT EXISTS (
      SELECT 1 FROM users u WHERE u.id = lwr.user_id
    );
  `);

  await pool.query(`
    DELETE FROM timetables t
    WHERE NOT EXISTS (
      SELECT 1 FROM classes c WHERE c.id = t.class_id
    );
  `);

  await pool.query(`
    DELETE FROM users u
    WHERE u.role = 'student'
      AND u.class_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM classes c
        WHERE c.id = u.class_id
      );
  `);

  // -------------------------------------------------------
  // DEFAULT-SCHULE "ADSZ"
  // -------------------------------------------------------
  let defaultSchoolId;
  const sres = await pool.query(
    "SELECT id FROM schools WHERE slug='adsz'"
  );

  if (sres.rows.length) {
    defaultSchoolId = sres.rows[0].id;
  } else {
    const ins = await pool.query(
      "INSERT INTO schools (name,slug) VALUES ('ADSZ','adsz') RETURNING id"
    );
    defaultSchoolId = ins.rows[0].id;
  }

  // Alle Datensätze ohne school_id auf ADSZ setzen
  await pool.query(
    "UPDATE users SET school_id=$1 WHERE school_id IS NULL",
    [defaultSchoolId]
  );
  await pool.query(
    "UPDATE classes SET school_id=$1 WHERE school_id IS NULL",
    [defaultSchoolId]
  );
  await pool.query(
    "UPDATE missions SET school_id=$1 WHERE school_id IS NULL",
    [defaultSchoolId]
  );
  await pool.query(
    "UPDATE bonuscards SET school_id=$1 WHERE school_id IS NULL",
    [defaultSchoolId]
  );
  await pool.query(
    "UPDATE class_rewards SET school_id=$1 WHERE school_id IS NULL",
    [defaultSchoolId]
  );
  await pool.query(
    "UPDATE characters SET school_id=$1 WHERE school_id IS NULL",
    [defaultSchoolId]
  );
  await pool.query(
    "UPDATE levels SET school_id=$1 WHERE school_id IS NULL",
    [defaultSchoolId]
  );
  await pool.query(
    "UPDATE student_uploads SET school_id=$1 WHERE school_id IS NULL",
    [defaultSchoolId]
  );
  await pool.query(
    "UPDATE xp_transactions SET school_id=$1 WHERE school_id IS NULL",
    [defaultSchoolId]
  );
  await pool.query(
    "UPDATE class_reward_rounds SET school_id=$1 WHERE school_id IS NULL",
    [defaultSchoolId]
  );
  await pool.query(
    "UPDATE class_challenges SET school_id=$1 WHERE school_id IS NULL",
    [defaultSchoolId]
  );
  await pool.query(
    "UPDATE log_entries SET school_id=$1 WHERE school_id IS NULL",
    [defaultSchoolId]
  );
  await pool.query(
    "UPDATE competency_status SET school_id=$1 WHERE school_id IS NULL",
    [defaultSchoolId]
  );
  await pool.query(
    "UPDATE log_week_reflections SET school_id=$1 WHERE school_id IS NULL",
    [defaultSchoolId]
  );
  await pool.query(
    "UPDATE level_check_topics SET school_id=$1 WHERE school_id IS NULL",
    [defaultSchoolId]
  );
  await pool.query(
    "UPDATE level_check_uploads SET school_id=$1 WHERE school_id IS NULL",
    [defaultSchoolId]
  );
  await pool.query(
    "UPDATE level_checks SET school_id=$1 WHERE school_id IS NULL",
    [defaultSchoolId]
  );
  await pool.query(
    "UPDATE level_check_goals SET school_id=$1 WHERE school_id IS NULL",
    [defaultSchoolId]
  );
  await pool.query(
    "UPDATE level_check_marks SET school_id=$1 WHERE school_id IS NULL",
    [defaultSchoolId]
  );
  await pool.query(
    "UPDATE level_check_proofs SET school_id=$1 WHERE school_id IS NULL",
    [defaultSchoolId]
  );
  // Backfill reward_id / image_url (WHERE-only refs to target table – safe in PG UPDATE)
  try {
    await pool.query(`
      UPDATE class_reward_options o
      SET reward_id = cr.id
      FROM class_reward_rounds rr, class_rewards cr
      WHERE o.round_id = rr.id
        AND o.reward_id IS NULL
        AND cr.school_id = rr.school_id
        AND cr.name = o.name
    `);
    await pool.query(`
      UPDATE class_reward_options o
      SET image_url = cr.image_url
      FROM class_rewards cr
      WHERE o.reward_id = cr.id
        AND (o.image_url IS NULL OR TRIM(o.image_url) = '')
        AND cr.image_url IS NOT NULL
        AND TRIM(cr.image_url) <> ''
    `);
    await pool.query(`
      UPDATE class_reward_options o
      SET image_url = cr.image_url
      FROM class_reward_rounds rr, class_rewards cr
      WHERE o.round_id = rr.id
        AND o.reward_id IS NULL
        AND cr.school_id = rr.school_id
        AND cr.name = o.name
        AND (o.image_url IS NULL OR TRIM(o.image_url) = '')
        AND cr.image_url IS NOT NULL
        AND TRIM(cr.image_url) <> ''
    `);
  } catch (backfillErr) {
    console.warn("⚠️ class_reward_options backfill:", backfillErr.message);
  }
  await pool.query(
    `UPDATE timetables t SET school_id = c.school_id
     FROM classes c
     WHERE t.class_id = c.id AND t.school_id IS NULL`
  );
  await pool.query(
    `UPDATE users u SET school_id = c.school_id
     FROM classes c
     WHERE u.class_id = c.id AND u.school_id IS NULL`
  );
  await pool.query(
    "UPDATE timetables SET school_id=$1 WHERE school_id IS NULL",
    [defaultSchoolId]
  );

  // Default Admin
  await pool.query(
    `
    INSERT INTO users (name,password,role,school_id,first_login)
    VALUES ('admin','bruhrain','admin',$1,FALSE)
    ON CONFLICT (name,school_id) DO NOTHING
  `,
    [defaultSchoolId]
  );

  // Superadmin user
  await pool.query(
    `
    INSERT INTO users (name,password,role,school_id,first_login)
    VALUES ('ueva42','bruhrain','superadmin',$1,FALSE)
    ON CONFLICT (name,school_id) DO NOTHING
  `,
    [defaultSchoolId]
  );

  // Defaults für alle Schulen
  const allSchools = await pool.query("SELECT id FROM schools");
  for (const row of allSchools.rows) {
    await seedSchoolDefaults(row.id);
  }

  console.log("✔️ Migration fertig.");
}

// -------------------------------------------------------
// AUTH
// -------------------------------------------------------
app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;

  const r = await pool.query(
    `
    SELECT id,name,password,role,class_id,school_id,first_login
    FROM users
    WHERE name=$1
    ORDER BY id ASC
    LIMIT 1
  `,
    [username]
  );

  if (!r.rows.length) return res.json({ success: false });

  const user = r.rows[0];
  if (user.password !== password) return res.json({ success: false });

  req.session.user = {
    id: user.id,
    role: user.role,
    class_id: user.class_id,
    school_id: user.school_id
  };

  res.json({
    success: true,
    role: user.role,
    firstLogin: user.role === "student" ? !!user.first_login : false
  });
});

app.post("/api/logout", (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});
// -------------------------------------------------------
// ADMIN – eigenes Passwort ändern
// -------------------------------------------------------
app.post("/api/admin/change-password", isAdmin, async (req, res) => {
  try {
    const adminId = req.session.user.id;
    const schoolId = req.session.user.school_id;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.json({
        success: false,
        message: "Bitte alle Felder ausfüllen."
      });
    }

    // Aktuellen Admin holen
    const r = await pool.query(
      `
      SELECT password
      FROM users
      WHERE id=$1 AND school_id=$2 AND role='admin'
      `,
      [adminId, schoolId]
    );

    if (!r.rows.length) {
      return res.json({
        success: false,
        message: "Admin nicht gefunden."
      });
    }

    if (r.rows[0].password !== currentPassword) {
      return res.json({
        success: false,
        message: "Aktuelles Passwort ist falsch."
      });
    }

    // Neues Passwort setzen
    await pool.query(
      `
      UPDATE users
      SET password=$1
      WHERE id=$2 AND school_id=$3 AND role='admin'
      `,
      [newPassword, adminId, schoolId]
    );

    res.json({ success: true });

  } catch (err) {
    console.error("❌ Fehler beim Admin-Passwort-Update:", err);
    return res.status(500).json({
      success: false,
      message: "Serverfehler beim Passwort-Update."
    });
  }
});

// -------------------------------------------------------
// ROLE GUARDS
// -------------------------------------------------------
function isHtmlPageRequest(req) {
  if (req.method !== "GET" || req.path.startsWith("/api/")) return false;
  if (req.get("Sec-Fetch-Mode") === "navigate") return true;
  const accept = req.get("Accept") || "";
  return accept.includes("text/html");
}

function denyAccess(req, res) {
  if (isHtmlPageRequest(req)) {
    return res.redirect(302, "/login");
  }
  return res.status(403).json({ error: "Forbidden" });
}

function isAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== "admin")
    return denyAccess(req, res);
  next();
}

function isStudent(req, res, next) {
  if (!req.session.user || req.session.user.role !== "student")
    return denyAccess(req, res);
  next();
}

function isSuperadmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== "superadmin")
    return denyAccess(req, res);
  next();
}

// -------------------------------------------------------
// STUDENT: FIRST LOGIN – Passwort ändern
// -------------------------------------------------------
app.post("/api/first-login", isStudent, async (req, res) => {
  const studentId = req.session.user.id;
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.json({
      success: false,
      message: "Bitte alle Felder ausfüllen."
    });
  }

  const r = await pool.query(
    "SELECT password,first_login FROM users WHERE id=$1",
    [studentId]
  );

  if (!r.rows.length) {
    return res.json({ success: false, message: "Benutzer nicht gefunden." });
  }

  const user = r.rows[0];

  if (!user.first_login) {
    return res.json({
      success: false,
      message: "Erst-Login bereits abgeschlossen."
    });
  }

  if (user.password !== currentPassword) {
    return res.json({
      success: false,
      message: "Aktuelles Einmalpasswort ist falsch."
    });
  }

  await pool.query(
    "UPDATE users SET password=$1, first_login=FALSE WHERE id=$2",
    [newPassword, studentId]
  );

  res.json({ success: true });
});

// -------------------------------------------------------
// STUDENT: PROFIL + DASHBOARD
// -------------------------------------------------------
app.get("/api/student/me", isStudent, async (req, res) => {
  const id = req.session.user.id;

  const userData = await pool.query(
    `
    SELECT u.id,u.name,u.xp,u.character_id,u.level_id,u.school_id,
           l.name AS level_name,l.min_xp AS level_min_xp
    FROM users u
    LEFT JOIN levels l ON l.id = u.level_id
    WHERE u.id=$1
  `,
    [id]
  );

  const user = userData.rows[0];
  let character = null;

  if (user.character_id) {
    const c = await pool.query(
      "SELECT id,name,image_url FROM characters WHERE id=$1",
      [user.character_id]
    );
    character = c.rows[0] || null;
  }

  // Traits & Items
  const TRAITS = [
    "Neugierig","Ausdauernd","Kreativ","Hilfsbereit","Strukturiert",
    "Ruhig","Zielstrebig","Analytisch","Teamorientiert","Sorgfältig",
    "Mutig","Risikofreudig","Optimistisch","Aufmerksam","Pragmatisch"
  ];

  const ITEMS = [
    "Zirkel der Präzision","Rechenamulett","Logikstein",
    "Zauberstift","Kompass","Rucksack","Lineal",
    "Lampe","Formelbuch"
  ];

  const pick3 = arr =>
    [...arr].sort(() => Math.random() - 0.5).slice(0, 3);

  const traitItem = await pool.query(
    "SELECT traits,items FROM users WHERE id=$1",
    [id]
  );

  let traits = traitItem.rows[0].traits;
  let items = traitItem.rows[0].items;

  if (!traits) {
    traits = pick3(TRAITS);
    await pool.query(
      "UPDATE users SET traits=$1 WHERE id=$2",
      [JSON.stringify(traits), id]
    );
  }

  if (!items) {
    items = pick3(ITEMS);
    await pool.query(
      "UPDATE users SET items=$1 WHERE id=$2",
      [JSON.stringify(items), id]
    );
  }

  // XP-Log
  const xpLog = await pool.query(
    `
    SELECT t.*, m.name AS mission_name
    FROM xp_transactions t
    LEFT JOIN missions m ON t.mission_id = m.id
    WHERE student_id=$1
    ORDER BY created_at DESC
  `,
    [id]
  );

  // XP pro Mission
  const xpPerMission = await pool.query(
    `
    SELECT mission_id, SUM(amount) AS total
    FROM xp_transactions
    WHERE student_id=$1 AND mission_id IS NOT NULL
    GROUP BY mission_id
  `,
    [id]
  );

  const xpByMission = {};
  xpPerMission.rows.forEach(r => {
    xpByMission[r.mission_id] = Number(r.total);
  });

  // Uploads
  const uploads = await pool.query(
    `
    SELECT su.*, m.name AS mission_name
    FROM student_uploads su
    LEFT JOIN missions m ON m.id = su.mission_id
    WHERE su.student_id=$1
    ORDER BY su.created_at DESC
  `,
    [id]
  );

  // Level-Liste
  const levels = await pool.query(
    `
    SELECT id,name,min_xp
    FROM levels
    WHERE school_id=$1
    ORDER BY min_xp ASC
  `,
    [user.school_id]
  );

  res.json({
    user,
    character,
    traits,
    items,
    xp_log: xpLog.rows,
    uploads: uploads.rows,
    levels: levels.rows,
    xp_per_mission: xpByMission
  });
});

// -------------------------------------------------------
// STUDENT: SRL-Logbuch – Planen
// -------------------------------------------------------
app.get("/api/student/log/plan-context", isStudent, async (req, res) => {
  try {
    const studentId = req.session.user.id;
    const date = isoDateOrToday(req.query.date);
    if (!date) return res.status(400).json({ error: "Ungültiges Datum" });

    const timeslot = req.query.timeslot || null;
    const subjectQuery = req.query.subject || null;
    const entryId = req.query.entryId || null;
    const weekday = weekdayFromIsoDate(date);

    const { classId, schoolId } = await getStudentClassContext(studentId);

    let timetable = [];
    if (classId && weekday) {
      timetable = await fetchTimetableForClassDay(classId, weekday);
    }

    let existingEntry = null;
    if (entryId) {
      existingEntry = await findPlanLogEntry(studentId, { date, entryId });
    } else if (subjectQuery && LOG_SUBJECTS.includes(subjectQuery)) {
      existingEntry = await findPlanLogEntry(studentId, {
        date,
        subject: subjectQuery,
        timeslot
      });
    }

    const timetableSubjects = timetableSubjectsFromRows(timetable);
    const lockedSubject = timetableSubjectForSlot(timetable, timeslot);
    const subjectLocked = !!lockedSubject;
    let suggestedSubject = null;
    if (lockedSubject) {
      suggestedSubject = lockedSubject;
    } else if (subjectQuery && LOG_SUBJECTS.includes(subjectQuery)) {
      suggestedSubject = subjectQuery;
    } else if (timetableSubjects.length) {
      suggestedSubject = timetableSubjects[0];
    }

    const socialUnlock = await getSocialFormUnlock(studentId, schoolId);
    const customLessonGoals = await fetchCustomSubjectLessonGoals(schoolId);
    const activeSubject = lockedSubject
      ? lockedSubject
      : subjectQuery && LOG_SUBJECTS.includes(subjectQuery)
        ? subjectQuery
        : suggestedSubject;
    const lessonGoals = activeSubject
      ? lessonGoalsForSubject(customLessonGoals, activeSubject)
      : LOG_GOALS;

    res.json({
      date,
      weekday,
      timetable,
      subjects: LOG_SUBJECTS,
      timetableSubjects,
      suggestedSubject,
      socialUnlock,
      existingEntry,
      defaultLessonGoals: LOG_GOALS,
      customLessonGoals,
      lessonGoals,
      subjectLocked,
      lockedSubject
    });
  } catch (err) {
    console.error("❌ /api/student/log/plan-context:", err);
    res.status(500).json({ error: "Serverfehler" });
  }
});

app.post("/api/student/log/plan", isStudent, async (req, res) => {
  try {
    const studentId = req.session.user.id;
    const schoolId = req.session.user.school_id;

    const date = isoDateOrToday(req.body.date);
    if (!date) {
      return res.json({ success: false, message: "Ungültiges Datum." });
    }

    const {
      timeslot = null,
      subject,
      goal,
      workGoals = [],
      socialForm = null,
      strategy = null,
      confidenceBefore = null,
      freitext = null
    } = req.body;

    if (!subject || !LOG_SUBJECTS.includes(subject)) {
      return res.json({ success: false, message: "Bitte ein gültiges Fach wählen." });
    }

    if (timeslot) {
      const { classId } = await getStudentClassContext(studentId);
      const weekday = weekdayFromIsoDate(date);
      if (classId && weekday) {
        const timetable = await fetchTimetableForClassDay(classId, weekday);
        const expectedSubject = timetableSubjectForSlot(timetable, timeslot);
        if (expectedSubject && subject !== expectedSubject) {
          return res.json({
            success: false,
            message: "Das Fach ist für diese Stunde fest vorgegeben."
          });
        }
      }
    }

    const allowedGoals = await getLessonGoalsForSubject(schoolId, subject);
    if (!isAllowedLessonGoal(goal, allowedGoals)) {
      return res.json({ success: false, message: "Bitte ein gültiges Stundenziel wählen." });
    }

    const cleanWorkGoals = Array.isArray(workGoals)
      ? workGoals.filter((g) => LOG_WORK_GOALS.includes(g))
      : [];

    if (socialForm && !LOG_SOCIAL_FORMS.includes(socialForm)) {
      return res.json({ success: false, message: "Ungültige Sozialform." });
    }

    if (socialForm === "gruppe" || socialForm === "frei") {
      const unlock = await getSocialFormUnlock(studentId, schoolId);
      if (socialForm === "gruppe" && !unlock.gruppe) {
        return res.json({
          success: false,
          message: "Gruppe ist erst ab Level Silber freigeschaltet."
        });
      }
      if (socialForm === "frei" && !unlock.frei) {
        return res.json({
          success: false,
          message: "Frei ist erst ab Level Gold freigeschaltet."
        });
      }
    }

    if (strategy && !LOG_STRATEGIES.includes(strategy)) {
      return res.json({ success: false, message: "Ungültige Lernstrategie." });
    }

    const confidence =
      confidenceBefore === null || confidenceBefore === undefined
        ? null
        : Number(confidenceBefore);
    if (
      confidence !== null &&
      (!Number.isInteger(confidence) || confidence < 1 || confidence > 5)
    ) {
      return res.json({
        success: false,
        message: "Selbstwirksamkeit muss zwischen 1 und 5 liegen."
      });
    }

    const cleanFreitext =
      typeof freitext === "string" && freitext.trim()
        ? freitext.trim().slice(0, 100)
        : null;

    const existing = await findPlanLogEntry(studentId, {
      date,
      subject,
      timeslot: timeslot || null
    });

    if (existing) {
      return res.json({
        success: false,
        message: "Für diese Stunde ist bereits ein Tagesziel gespeichert – nur Ansicht möglich.",
        entryId: existing.id,
        readOnly: true
      });
    }

    const insertRes = await pool.query(
      `
      INSERT INTO log_entries (
        user_id, school_id, date, timeslot, subject, goal,
        work_goals, social_form, strategy, confidence_before, freitext
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      RETURNING id, created_at
    `,
      [
        studentId,
        schoolId,
        date,
        timeslot || null,
        subject,
        goal,
        JSON.stringify(cleanWorkGoals),
        socialForm || null,
        strategy || null,
        confidence,
        cleanFreitext
      ]
    );

    await awardLogbuchXP(studentId, LOGBUCH_XP.plan, "logbuch_plan", schoolId);

    res.json({
      success: true,
      entry: insertRes.rows[0],
      xpAwarded: LOGBUCH_XP.plan
    });
  } catch (err) {
    console.error("❌ /api/student/log/plan:", err);
    res.status(500).json({ success: false, message: "Serverfehler" });
  }
});

// -------------------------------------------------------
// STUDENT: SRL-Logbuch – Meine Woche
// -------------------------------------------------------
app.get("/api/student/log/week", isStudent, async (req, res) => {
  try {
    const studentId = req.session.user.id;
    const schoolId = req.session.user.school_id;
    const refDate = isoDateOrToday(req.query.weekStart) || isoDateOrToday(req.query.date);
    if (!refDate) return res.status(400).json({ error: "Ungültiges Datum" });

    const weekStart = mondayOfWeek(refDate);
    const weekEnd = fridayOfWeek(weekStart);
    const weekNumber = isoWeekNumber(weekStart);

    const startLabel = new Date(`${weekStart}T12:00:00`).toLocaleDateString("de-DE", {
      day: "2-digit",
      month: "2-digit"
    });
    const endLabel = new Date(`${weekEnd}T12:00:00`).toLocaleDateString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    });

    const entriesRes = await pool.query(
      `
      SELECT
        le.id, le.date, le.subject, le.goal,
        lr.goal_achieved
      FROM log_entries le
      LEFT JOIN log_reflections lr ON lr.log_entry_id = le.id
      WHERE le.user_id=$1
        AND le.date >= $2
        AND le.date <= $3
      ORDER BY le.date ASC, le.subject ASC
    `,
      [studentId, weekStart, weekEnd]
    );

    const weekdayShort = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
    const rows = entriesRes.rows.map((row) => {
      const dateIso =
        row.date instanceof Date
          ? row.date.toISOString().slice(0, 10)
          : String(row.date).slice(0, 10);
      const d = new Date(`${dateIso}T12:00:00`);
      let achieved = "–";
      if (row.goal_achieved === "ja") achieved = "✓";
      else if (row.goal_achieved === "teilweise") achieved = "◐";
      else if (row.goal_achieved === "nein") achieved = "✗";
      else if (!row.goal_achieved) achieved = "○";

      return {
        date: dateIso,
        weekday: weekdayShort[d.getDay()],
        subject: row.subject,
        goal: row.goal,
        achieved,
        goalAchieved: row.goal_achieved
      };
    });

    const stats = {
      gesetzt: rows.length,
      erreicht: rows.filter((r) => r.goalAchieved === "ja").length,
      teilweise: rows.filter((r) => r.goalAchieved === "teilweise").length,
      offen: rows.filter((r) => !r.goalAchieved).length
    };

    const xpRes = await pool.query(
      `
      SELECT COALESCE(SUM(amount), 0) AS total
      FROM xp_transactions
      WHERE student_id=$1
        AND school_id=$2
        AND source IN ('logbuch_plan','logbuch_check','logbuch_reflect','logbuch_week')
        AND created_at >= $3::date
        AND created_at < ($4::date + INTERVAL '1 day')
    `,
      [studentId, schoolId, weekStart, addDaysIso(weekEnd, 1)]
    );

    const weekReflectionRes = await pool.query(
      `
      SELECT id, time_wasters, created_at
      FROM log_week_reflections
      WHERE user_id=$1 AND week_start=$2
    `,
      [studentId, weekStart]
    );

    res.json({
      weekStart,
      weekEnd,
      weekNumber,
      weekLabel: `KW ${weekNumber} · ${startLabel}. – ${endLabel}`,
      stats,
      xpThisWeek: Number(xpRes.rows[0]?.total || 0),
      rows,
      timeWasterItems: LOG_TIME_WASTERS,
      timeWasterLevels: LOG_TIME_WASTER_LEVELS,
      weekReflection: weekReflectionRes.rows[0] || null
    });
  } catch (err) {
    console.error("❌ /api/student/log/week:", err);
    res.status(500).json({ error: "Serverfehler" });
  }
});

app.post("/api/student/log/week-reflection", isStudent, async (req, res) => {
  try {
    const studentId = req.session.user.id;
    const schoolId = req.session.user.school_id;
    const { weekStart, timeWasters } = req.body;

    const cleanWeekStart = isoDateOrToday(weekStart);
    if (!cleanWeekStart || mondayOfWeek(cleanWeekStart) !== cleanWeekStart) {
      return res.json({
        success: false,
        message: "Ungültiger Wochenstart (Montag erwartet)."
      });
    }

    if (!timeWasters || typeof timeWasters !== "object") {
      return res.json({ success: false, message: "Zeitfresser-Matrix fehlt." });
    }

    const cleanWasters = {};
    for (const item of LOG_TIME_WASTERS) {
      const level = timeWasters[item];
      if (!level || !LOG_TIME_WASTER_LEVELS.includes(level)) {
        return res.json({
          success: false,
          message: `Bitte alle Zeitfresser bewerten (${item}).`
        });
      }
      cleanWasters[item] = level;
    }

    const existingRes = await pool.query(
      "SELECT id FROM log_week_reflections WHERE user_id=$1 AND week_start=$2",
      [studentId, cleanWeekStart]
    );

    if (existingRes.rows.length) {
      return res.json({
        success: false,
        message: "Wochenreflexion für diese Woche ist bereits abgeschlossen."
      });
    }

    const insertRes = await pool.query(
      `
      INSERT INTO log_week_reflections (user_id, school_id, week_start, time_wasters)
      VALUES ($1,$2,$3,$4)
      RETURNING id, created_at
    `,
      [studentId, schoolId, cleanWeekStart, JSON.stringify(cleanWasters)]
    );

    await awardLogbuchXP(
      studentId,
      LOGBUCH_XP.weekReflection,
      "logbuch_week",
      schoolId
    );

    res.json({
      success: true,
      reflection: insertRes.rows[0],
      xpAwarded: LOGBUCH_XP.weekReflection
    });
  } catch (err) {
    console.error("❌ /api/student/log/week-reflection:", err);
    res.status(500).json({ success: false, message: "Serverfehler" });
  }
});

// -------------------------------------------------------
// STUDENT: SRL-Logbuch – Mein Tag
// -------------------------------------------------------
app.get("/api/student/log/today", isStudent, async (req, res) => {
  try {
    const studentId = req.session.user.id;
    const date = isoDateOrToday(req.query.date);
    if (!date) return res.status(400).json({ error: "Ungültiges Datum" });

    const weekday = weekdayFromIsoDate(date);
    const d = new Date(`${date}T12:00:00`);
    const weekdayLabels = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
    const weekdayLabel = weekdayLabels[d.getDay()];
    const dateLabel = d.toLocaleDateString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    });

    const { classId, className } = await getStudentClassContext(studentId);

    let timetable = [];
    if (classId && weekday) {
      timetable = await fetchTimetableForClassDay(classId, weekday);
    }

    const entriesRes = await pool.query(
      `
      SELECT
        le.id, le.date, le.timeslot, le.subject, le.goal,
        le.confidence_before, le.created_at,
        lc.id AS check_id,
        lr.id AS reflection_id,
        lr.goal_achieved, lr.how_worked, lr.next_step,
        lr.confidence_after, lr.learned_today
      FROM log_entries le
      LEFT JOIN log_checks lc ON lc.log_entry_id = le.id
      LEFT JOIN log_reflections lr ON lr.log_entry_id = le.id
      WHERE le.user_id=$1 AND le.date=$2
      ORDER BY le.timeslot ASC NULLS LAST, le.subject ASC
    `,
      [studentId, date]
    );

    const entries = entriesRes.rows.map((row) => ({
      id: row.id,
      date: row.date,
      timeslot: row.timeslot,
      subject: row.subject,
      goal: row.goal,
      confidence_before: row.confidence_before,
      created_at: row.created_at,
      hasCheck: !!row.check_id,
      hasReflection: !!row.reflection_id,
      reflection: row.reflection_id
        ? {
            goal_achieved: row.goal_achieved,
            how_worked: row.how_worked,
            next_step: row.next_step,
            confidence_after: row.confidence_after,
            learned_today: row.learned_today
          }
        : null
    }));

    const findEntryForSlot = (slot) => {
      const exact = entries.find(
        (e) =>
          e.subject === slot.subject &&
          e.timeslot &&
          slot.timeslot &&
          e.timeslot === slot.timeslot
      );
      if (exact) return exact;

      const bySubject = entries.find(
        (e) =>
          e.subject === slot.subject &&
          (!e.timeslot || !slot.timeslot || e.timeslot === slot.timeslot)
      );
      return bySubject || null;
    };

    const activeTimetable = timetable.filter(
      (slot) => slot.subject && !isTimetableFreeSubject(slot.subject)
    );

    const blocks = [];
    const usedEntryIds = new Set();

    for (const slot of activeTimetable) {
      const entry = findEntryForSlot(slot);
      if (entry) usedEntryIds.add(entry.id);
      blocks.push({ slot, entry });
    }

    for (const entry of entries) {
      if (!usedEntryIds.has(entry.id)) {
        blocks.push({
          slot: { subject: entry.subject, timeslot: entry.timeslot, room: null },
          entry
        });
      }
    }

    const phases = {
      plan: entries.length > 0,
      check: entries.some((e) => e.hasCheck),
      reflect: entries.some((e) => e.hasReflection)
    };

    const timetableSubjects = timetableSubjectsFromRows(timetable);
    const todayIso = new Date().toISOString().slice(0, 10);

    res.json({
      date,
      weekday,
      weekdayLabel,
      dateLabel,
      isToday: date === todayIso,
      isPast: date < todayIso,
      hasClass: !!classId,
      className,
      timetable: activeTimetable,
      timetableSubjects,
      entries,
      blocks,
      phases
    });
  } catch (err) {
    console.error("❌ /api/student/log/today:", err);
    res.status(500).json({ error: "Serverfehler" });
  }
});

// -------------------------------------------------------
// STUDENT: SRL-Logbuch – Zwischen-Check
// -------------------------------------------------------
app.get("/api/student/log/check-context", isStudent, async (req, res) => {
  try {
    const studentId = req.session.user.id;
    const entryId = req.query.entryId;

    if (!entryId) {
      return res.status(400).json({ error: "entryId fehlt" });
    }

    const entryRes = await pool.query(
      `
      SELECT id, date, timeslot, subject, goal, created_at
      FROM log_entries
      WHERE id=$1 AND user_id=$2
    `,
      [entryId, studentId]
    );

    if (!entryRes.rows.length) {
      return res.json({ entry: null, existingCheck: null });
    }

    const checkRes = await pool.query(
      `
      SELECT id, on_track, understands, progress, change_note, created_at
      FROM log_checks
      WHERE log_entry_id=$1
    `,
      [entryId]
    );

    res.json({
      entry: entryRes.rows[0],
      existingCheck: checkRes.rows[0] || null
    });
  } catch (err) {
    console.error("❌ /api/student/log/check-context:", err);
    res.status(500).json({ error: "Serverfehler" });
  }
});

app.post("/api/student/log/check", isStudent, async (req, res) => {
  try {
    const studentId = req.session.user.id;
    const schoolId = req.session.user.school_id;

    const {
      logEntryId,
      onTrack,
      understands,
      progress,
      changeNote = null
    } = req.body;

    if (!logEntryId) {
      return res.json({ success: false, message: "Lern-Eintrag fehlt." });
    }

    const entryRes = await pool.query(
      "SELECT id FROM log_entries WHERE id=$1 AND user_id=$2",
      [logEntryId, studentId]
    );

    if (!entryRes.rows.length) {
      return res.json({ success: false, message: "Lern-Eintrag nicht gefunden." });
    }

    if (!onTrack || !LOG_CHECK_RATINGS.includes(onTrack)) {
      return res.json({ success: false, message: "Bitte alle drei Check-Fragen beantworten." });
    }
    if (!understands || !LOG_CHECK_RATINGS.includes(understands)) {
      return res.json({ success: false, message: "Bitte alle drei Check-Fragen beantworten." });
    }
    if (!progress || !LOG_CHECK_RATINGS.includes(progress)) {
      return res.json({ success: false, message: "Bitte alle drei Check-Fragen beantworten." });
    }

    const hasThumbsDown = [onTrack, understands, progress].includes("👎");
    const cleanChangeNote =
      typeof changeNote === "string" && changeNote.trim()
        ? changeNote.trim().slice(0, 200)
        : null;

    if (hasThumbsDown && !cleanChangeNote) {
      return res.json({
        success: false,
        message: "Bitte notiere, was du jetzt änderst (mindestens ein 👎)."
      });
    }

    const existingRes = await pool.query(
      "SELECT id FROM log_checks WHERE log_entry_id=$1",
      [logEntryId]
    );

    if (existingRes.rows.length) {
      return res.json({
        success: false,
        message: "Zwischen-Check für diesen Eintrag ist bereits abgeschlossen.",
        checkId: existingRes.rows[0].id
      });
    }

    const insertRes = await pool.query(
      `
      INSERT INTO log_checks (log_entry_id, on_track, understands, progress, change_note)
      VALUES ($1,$2,$3,$4,$5)
      RETURNING id, created_at
    `,
      [
        logEntryId,
        onTrack,
        understands,
        progress,
        hasThumbsDown ? cleanChangeNote : null
      ]
    );

    await awardLogbuchXP(studentId, LOGBUCH_XP.check, "logbuch_check", schoolId);

    res.json({
      success: true,
      check: insertRes.rows[0],
      xpAwarded: LOGBUCH_XP.check
    });
  } catch (err) {
    console.error("❌ /api/student/log/check:", err);
    res.status(500).json({ success: false, message: "Serverfehler" });
  }
});

// -------------------------------------------------------
// STUDENT: SRL-Logbuch – Tagesabschluss
// -------------------------------------------------------
app.get("/api/student/log/reflect-context", isStudent, async (req, res) => {
  try {
    const studentId = req.session.user.id;
    const entryId = req.query.entryId;

    if (!entryId) {
      return res.status(400).json({ error: "entryId fehlt" });
    }

    const entryRes = await pool.query(
      `
      SELECT id, date, timeslot, subject, goal, confidence_before, created_at
      FROM log_entries
      WHERE id=$1 AND user_id=$2
    `,
      [entryId, studentId]
    );

    if (!entryRes.rows.length) {
      return res.json({ entry: null, existingReflection: null });
    }

    const reflectionRes = await pool.query(
      `
      SELECT id, goal_achieved, how_worked, next_step, confidence_after,
             learned_today, created_at
      FROM log_reflections
      WHERE log_entry_id=$1
    `,
      [entryId]
    );

    res.json({
      entry: entryRes.rows[0],
      existingReflection: reflectionRes.rows[0] || null
    });
  } catch (err) {
    console.error("❌ /api/student/log/reflect-context:", err);
    res.status(500).json({ error: "Serverfehler" });
  }
});

app.post("/api/student/log/reflect", isStudent, async (req, res) => {
  try {
    const studentId = req.session.user.id;
    const schoolId = req.session.user.school_id;

    const {
      logEntryId,
      goalAchieved,
      howWorked,
      nextStep,
      confidenceAfter,
      learnedToday = null
    } = req.body;

    if (!logEntryId) {
      return res.json({ success: false, message: "Lern-Eintrag fehlt." });
    }

    const entryRes = await pool.query(
      "SELECT id FROM log_entries WHERE id=$1 AND user_id=$2",
      [logEntryId, studentId]
    );

    if (!entryRes.rows.length) {
      return res.json({ success: false, message: "Lern-Eintrag nicht gefunden." });
    }

    if (!goalAchieved || !LOG_GOAL_ACHIEVED.includes(goalAchieved)) {
      return res.json({ success: false, message: "Bitte Zielerreichung wählen." });
    }

    if (!howWorked || !LOG_HOW_WORKED.includes(howWorked)) {
      return res.json({ success: false, message: "Bitte Arbeitsweise wählen." });
    }

    if (!nextStep || !LOG_NEXT_STEPS.includes(nextStep)) {
      return res.json({ success: false, message: "Bitte nächsten Schritt wählen." });
    }

    const confidence = Number(confidenceAfter);
    if (!Number.isInteger(confidence) || confidence < 1 || confidence > 5) {
      return res.json({
        success: false,
        message: "Selbstwirksamkeit muss zwischen 1 und 5 liegen."
      });
    }

    const cleanLearned =
      typeof learnedToday === "string" && learnedToday.trim()
        ? learnedToday.trim().slice(0, 200)
        : null;

    const existingRes = await pool.query(
      "SELECT id FROM log_reflections WHERE log_entry_id=$1",
      [logEntryId]
    );

    if (existingRes.rows.length) {
      return res.json({
        success: false,
        message: "Reflexion für diesen Eintrag ist bereits abgeschlossen.",
        reflectionId: existingRes.rows[0].id
      });
    }

    const insertRes = await pool.query(
      `
      INSERT INTO log_reflections (
        log_entry_id, goal_achieved, how_worked, next_step,
        confidence_after, learned_today
      )
      VALUES ($1,$2,$3,$4,$5,$6)
      RETURNING id, created_at
    `,
      [logEntryId, goalAchieved, howWorked, nextStep, confidence, cleanLearned]
    );

    await awardLogbuchXP(studentId, LOGBUCH_XP.reflect, "logbuch_reflect", schoolId);

    res.json({
      success: true,
      reflection: insertRes.rows[0],
      xpAwarded: LOGBUCH_XP.reflect
    });
  } catch (err) {
    console.error("❌ /api/student/log/reflect:", err);
    res.status(500).json({ success: false, message: "Serverfehler" });
  }
});

function levelCheckTiersPayload(withXp = false) {
  return LEVEL_CHECK_TIERS.map((t) => ({
    id: t,
    label: LEVEL_CHECK_TIER_LABELS[t],
    ...(withXp ? { xp: LEVEL_CHECK_XP[t] } : {})
  }));
}

function levelCheckTierUnlocked(tier, proofsByTier) {
  if (tier === "rookie") return true;
  if (tier === "operator") return !!proofsByTier.rookie;
  if (tier === "street_legend") return !!proofsByTier.operator;
  return false;
}

async function getLevelChecksForClass(classId, schoolId, studentId = null) {
  const checksRes = await pool.query(
    `
    SELECT id, subject, name, sort_order, created_at
    FROM level_checks
    WHERE class_id=$1 AND school_id=$2
    ORDER BY subject ASC, sort_order ASC, name ASC
  `,
    [classId, schoolId]
  );

  if (!checksRes.rows.length) {
    return [];
  }

  const checkIds = checksRes.rows.map((c) => c.id);

  const goalsRes = await pool.query(
    `
    SELECT id, level_check_id, goal_text, sort_order
    FROM level_check_goals
    WHERE level_check_id = ANY($1::uuid[])
    ORDER BY sort_order ASC, created_at ASC
  `,
    [checkIds]
  );

  let marksByGoal = {};
  if (studentId) {
    const marksRes = await pool.query(
      `
      SELECT m.goal_id, m.tier, m.updated_at
      FROM level_check_marks m
      JOIN level_check_goals g ON g.id = m.goal_id
      WHERE m.user_id=$1 AND g.level_check_id = ANY($2::uuid[])
    `,
      [studentId, checkIds]
    );
    for (const row of marksRes.rows) {
      if (!marksByGoal[row.goal_id]) marksByGoal[row.goal_id] = [];
      marksByGoal[row.goal_id].push(row);
    }
  }

  const goalsByCheck = {};
  for (const g of goalsRes.rows) {
    if (!goalsByCheck[g.level_check_id]) goalsByCheck[g.level_check_id] = [];
    goalsByCheck[g.level_check_id].push({
      id: g.id,
      text: g.goal_text,
      sortOrder: g.sort_order,
      mark: buildGoalMarkFromRows(marksByGoal[g.id])
    });
  }

  return checksRes.rows.map((c) => ({
    id: c.id,
    subject: c.subject,
    name: c.name,
    sortOrder: c.sort_order,
    goals: goalsByCheck[c.id] || []
  }));
}

function groupLevelChecksBySubject(checks) {
  const bySubject = {};
  for (const check of checks) {
    if (!bySubject[check.subject]) bySubject[check.subject] = [];
    bySubject[check.subject].push(check);
  }

  const grouped = [];
  for (const subject of LOG_SUBJECTS) {
    if (bySubject[subject]?.length) {
      grouped.push({ subject, levelChecks: bySubject[subject] });
      delete bySubject[subject];
    }
  }
  for (const [subject, levelChecks] of Object.entries(bySubject)) {
    grouped.push({ subject, levelChecks });
  }
  return grouped;
}

// -------------------------------------------------------
// STUDENT: Levelplan – Matrix (Selbsteinschätzung pro Ziel)
// -------------------------------------------------------
app.get("/api/student/levelplan", isStudent, async (req, res) => {
  try {
    const studentId = req.session.user.id;
    const schoolId = req.session.user.school_id;
    const classId = req.session.user.class_id;

    if (!classId) {
      return res.json({
        hasClass: false,
        grouped: [],
        tiers: levelCheckTiersPayload(true)
      });
    }

    const checks = await getLevelChecksForClass(classId, schoolId, studentId);
    const checkIds = checks.map((c) => c.id);
    const targetsByCheck = await fetchTargetGradesByCheck(studentId, checkIds);
    const checksWithTargets = attachTargetProgressToChecks(checks, targetsByCheck);

    res.json({
      hasClass: true,
      grouped: groupLevelChecksBySubject(checksWithTargets),
      tiers: levelCheckTiersPayload(true),
      gradeOptions: TARGET_GRADE_OPTIONS
    });
  } catch (err) {
    console.error("❌ /api/student/levelplan:", err);
    res.status(500).json({ error: "Serverfehler" });
  }
});

// -------------------------------------------------------
// STUDENT: Zielsetzung – Zielnote & Level-Fortschritt pro Thema
// -------------------------------------------------------
app.get("/api/student/zielsetzung", isStudent, async (req, res) => {
  try {
    const studentId = req.session.user.id;
    const schoolId = req.session.user.school_id;
    const classId = req.session.user.class_id;

    if (!classId) {
      return res.json({
        hasClass: false,
        grouped: [],
        gradeOptions: TARGET_GRADE_OPTIONS,
        feedbackOptions: buildZielsetzungFeedbackOptions(),
        xpValues: ZIELSETZUNG_XP
      });
    }

    const checks = await getLevelChecksForClass(classId, schoolId, studentId);
    const checkIds = checks.map((c) => c.id);
    const targetsByCheck = await fetchTargetGradesByCheck(studentId, checkIds);

    const topics = checks.map((check) => {
      try {
        return buildZielsetzungTopic(check, targetsByCheck[check.id] ?? null);
      } catch (err) {
        console.error("❌ buildZielsetzungTopic:", check.id, err);
        return {
          id: check.id,
          subject: check.subject,
          name: check.name,
          totalGoals: check.goals?.length ?? 0,
          unmarked: check.goals?.length ?? 0,
          targetGrade: null,
          targetGradeLabel: "–",
          achievedGrade: null,
          achievedGradeLabel: "–",
          tiers: LEVEL_CHECK_TIERS.map((tier) => ({
            id: tier,
            label: LEVEL_CHECK_TIER_LABELS[tier],
            current: 0,
            recommended: null,
            onTrack: null,
            remaining: null
          })),
          recommended: null,
          onTrack: null,
          summary: null
        };
      }
    });
    const grouped = groupZielsetzungBySubject(topics);

    res.json({
      hasClass: true,
      grouped,
      subjects: subjectsFromZielsetzungGroups(grouped),
      gradeOptions: TARGET_GRADE_OPTIONS,
      feedbackOptions: buildZielsetzungFeedbackOptions(),
      xpValues: ZIELSETZUNG_XP
    });
  } catch (err) {
    console.error("❌ /api/student/zielsetzung:", err);
    res.status(500).json({ error: "Serverfehler" });
  }
});

app.post("/api/student/zielsetzung", isStudent, async (req, res) => {
  try {
    const studentId = req.session.user.id;
    const schoolId = req.session.user.school_id;
    const classId = req.session.user.class_id;
    const levelCheckId = req.body.levelCheckId;
    const hasTarget = Object.prototype.hasOwnProperty.call(req.body, "targetGradeKey")
      || Object.prototype.hasOwnProperty.call(req.body, "targetGrade");
    const hasAchieved = Object.prototype.hasOwnProperty.call(req.body, "achievedGradeKey")
      || Object.prototype.hasOwnProperty.call(req.body, "achievedGrade");
    const hasGrow = Object.prototype.hasOwnProperty.call(req.body, "growText")
      || Object.prototype.hasOwnProperty.call(req.body, "grow");
    const hasGlow = Object.prototype.hasOwnProperty.call(req.body, "glowText")
      || Object.prototype.hasOwnProperty.call(req.body, "glow");
    const hasNextGoal = Object.prototype.hasOwnProperty.call(req.body, "nextGoalText")
      || Object.prototype.hasOwnProperty.call(req.body, "nextGoal");

    let targetGradeKey;
    if (hasTarget) {
      const raw = req.body.targetGradeKey ?? req.body.targetGrade;
      targetGradeKey = raw === "" || raw == null ? null : normalizeTargetGradeKey(raw);
      if (raw !== "" && raw != null && !targetGradeKey) {
        return res.json({
          success: false,
          message: "Bitte eine gültige Zielnote wählen (1 bis 6 in 0,5-Schritten)."
        });
      }
    }

    let achievedGradeKey;
    if (hasAchieved) {
      const raw = req.body.achievedGradeKey ?? req.body.achievedGrade;
      achievedGradeKey = raw === "" || raw == null ? null : normalizeTargetGradeKey(raw);
      if (raw !== "" && raw != null && !achievedGradeKey) {
        return res.json({
          success: false,
          message: "Bitte eine gültige erreichte Note wählen (1 bis 6 in 0,5-Schritten)."
        });
      }
    }

    let growText;
    if (hasGrow) {
      growText = normalizeFeedbackText(req.body.growText ?? req.body.grow);
    }

    let glowText;
    if (hasGlow) {
      glowText = normalizeFeedbackText(req.body.glowText ?? req.body.glow);
    }

    let nextGoalText;
    if (hasNextGoal) {
      nextGoalText = normalizeFeedbackText(req.body.nextGoalText ?? req.body.nextGoal);
    }

    if (!classId || !levelCheckId) {
      return res.json({ success: false, message: "Thema fehlt." });
    }

    if (!hasTarget && !hasAchieved && !hasGrow && !hasGlow && !hasNextGoal) {
      return res.json({ success: false, message: "Keine Daten zum Speichern übergeben." });
    }

    const checkRes = await pool.query(
      `
      SELECT id FROM level_checks
      WHERE id = $1 AND class_id = $2 AND school_id = $3
    `,
      [levelCheckId, classId, schoolId]
    );
    if (!checkRes.rows.length) {
      return res.json({ success: false, message: "Thema nicht gefunden." });
    }

    const existingRes = await pool.query(
      `
      SELECT
        target_grade_key,
        target_grade,
        achieved_grade_key,
        grow_text,
        glow_text,
        next_goal_text,
        xp_target_awarded,
        xp_achieved_awarded,
        xp_grow_awarded,
        xp_glow_awarded,
        xp_next_goal_awarded
      FROM level_check_targets
      WHERE level_check_id = $1 AND user_id = $2
    `,
      [levelCheckId, studentId]
    );

    const existing = existingRes.rows[0];
    const finalTarget =
      hasTarget
        ? targetGradeKey
        : normalizeTargetGradeKey(existing?.target_grade_key) ||
          normalizeTargetGradeKey(existing?.target_grade);
    const finalAchieved = hasAchieved
      ? achievedGradeKey
      : normalizeTargetGradeKey(existing?.achieved_grade_key);
    const finalGrow = hasGrow ? growText : (existing?.grow_text ?? null);
    const finalGlow = hasGlow ? glowText : (existing?.glow_text ?? null);
    const finalNextGoal = hasNextGoal ? nextGoalText : (existing?.next_goal_text ?? null);

    const hasAnyData =
      finalTarget ||
      finalAchieved ||
      finalGrow ||
      finalGlow ||
      finalNextGoal;

    if (!hasAnyData) {
      if (existing) {
        await pool.query(
          `DELETE FROM level_check_targets WHERE level_check_id = $1 AND user_id = $2`,
          [levelCheckId, studentId]
        );
      }
      return res.json({
        success: true,
        targetGrade: null,
        achievedGrade: null,
        grow: null,
        glow: null,
        nextGoal: null,
        xpAwarded: 0,
        xpDetails: []
      });
    }

    const wholeGrade = finalTarget
      ? Math.min(6, Math.max(1, Math.round(parseFloat(finalTarget))))
      : (existing?.target_grade ?? null);

    let xpTargetAwarded = !!existing?.xp_target_awarded;
    let xpAchievedAwarded = !!existing?.xp_achieved_awarded;
    let xpGrowAwarded = !!existing?.xp_grow_awarded;
    let xpGlowAwarded = !!existing?.xp_glow_awarded;
    let xpNextGoalAwarded = !!existing?.xp_next_goal_awarded;

    const xpDetails = [];
    let xpAwardedTotal = 0;

    if (finalTarget && !xpTargetAwarded) {
      const amount = await awardZielsetzungXPOnce(
        studentId,
        schoolId,
        levelCheckId,
        "target",
        ZIELSETZUNG_XP.targetGrade
      );
      if (amount) {
        xpTargetAwarded = true;
        xpAwardedTotal += amount;
        xpDetails.push({ field: "targetGrade", amount });
      }
    }

    if (finalAchieved && !xpAchievedAwarded) {
      const amount = await awardZielsetzungXPOnce(
        studentId,
        schoolId,
        levelCheckId,
        "achieved",
        ZIELSETZUNG_XP.achievedGrade
      );
      if (amount) {
        xpAchievedAwarded = true;
        xpAwardedTotal += amount;
        xpDetails.push({ field: "achievedGrade", amount });
      }
    }

    if (finalAchieved && finalGrow && !xpGrowAwarded) {
      const amount = await awardZielsetzungXPOnce(
        studentId,
        schoolId,
        levelCheckId,
        "grow",
        ZIELSETZUNG_XP.grow
      );
      if (amount) {
        xpGrowAwarded = true;
        xpAwardedTotal += amount;
        xpDetails.push({ field: "grow", amount });
      }
    }

    if (finalAchieved && finalGlow && !xpGlowAwarded) {
      const amount = await awardZielsetzungXPOnce(
        studentId,
        schoolId,
        levelCheckId,
        "glow",
        ZIELSETZUNG_XP.glow
      );
      if (amount) {
        xpGlowAwarded = true;
        xpAwardedTotal += amount;
        xpDetails.push({ field: "glow", amount });
      }
    }

    if (finalAchieved && finalNextGoal && !xpNextGoalAwarded) {
      const amount = await awardZielsetzungXPOnce(
        studentId,
        schoolId,
        levelCheckId,
        "nextGoal",
        ZIELSETZUNG_XP.nextGoal
      );
      if (amount) {
        xpNextGoalAwarded = true;
        xpAwardedTotal += amount;
        xpDetails.push({ field: "nextGoal", amount });
      }
    }

    const upsert = await pool.query(
      `
      INSERT INTO level_check_targets (
        school_id,
        level_check_id,
        user_id,
        target_grade,
        target_grade_key,
        achieved_grade_key,
        grow_text,
        glow_text,
        next_goal_text,
        xp_target_awarded,
        xp_achieved_awarded,
        xp_grow_awarded,
        xp_glow_awarded,
        xp_next_goal_awarded
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      ON CONFLICT (level_check_id, user_id)
      DO UPDATE SET
        target_grade = EXCLUDED.target_grade,
        target_grade_key = EXCLUDED.target_grade_key,
        achieved_grade_key = EXCLUDED.achieved_grade_key,
        grow_text = EXCLUDED.grow_text,
        glow_text = EXCLUDED.glow_text,
        next_goal_text = EXCLUDED.next_goal_text,
        xp_target_awarded = EXCLUDED.xp_target_awarded,
        xp_achieved_awarded = EXCLUDED.xp_achieved_awarded,
        xp_grow_awarded = EXCLUDED.xp_grow_awarded,
        xp_glow_awarded = EXCLUDED.xp_glow_awarded,
        xp_next_goal_awarded = EXCLUDED.xp_next_goal_awarded,
        updated_at = NOW()
      RETURNING
        target_grade_key,
        target_grade,
        achieved_grade_key,
        grow_text,
        glow_text,
        next_goal_text
    `,
      [
        schoolId,
        levelCheckId,
        studentId,
        wholeGrade,
        finalTarget,
        finalAchieved,
        finalGrow,
        finalGlow,
        finalNextGoal,
        xpTargetAwarded,
        xpAchievedAwarded,
        xpGrowAwarded,
        xpGlowAwarded,
        xpNextGoalAwarded
      ]
    );

    res.json({
      success: true,
      targetGrade:
        upsert.rows[0].target_grade_key || (upsert.rows[0].target_grade != null
          ? String(upsert.rows[0].target_grade)
          : null),
      achievedGrade: upsert.rows[0].achieved_grade_key || null,
      grow: upsert.rows[0].grow_text || null,
      glow: upsert.rows[0].glow_text || null,
      nextGoal: upsert.rows[0].next_goal_text || null,
      xpAwarded: xpAwardedTotal,
      xpDetails
    });
  } catch (err) {
    console.error("❌ POST /api/student/zielsetzung:", err);
    res.status(500).json({ success: false, message: "Serverfehler" });
  }
});

app.get("/api/student/levelcheck", isStudent, (req, res) => {
  res.redirect(307, "/api/student/zielsetzung");
});

// Legacy upload API (nicht mehr in der Schüler-Oberfläche)
app.get("/api/student/levelchecks", isStudent, (req, res) => {
  res.redirect(307, "/api/student/levelplan");
});

// -------------------------------------------------------
// STUDENT: Levelcheck – Nachweise hochladen (Legacy, aus UI entfernt)
// -------------------------------------------------------
app.post(
  "/api/student/levelcheck-upload",
  isStudent,
  upload.single("file"),
  async (req, res) => {
    try {
      const studentId = req.session.user.id;
      const schoolId = req.session.user.school_id;
      const classId = req.session.user.class_id;
      const levelCheckId = req.body.levelCheckId;
      const tier = req.body.tier;

      if (!classId) {
        return res.json({ success: false, message: "Keine Klasse zugeordnet." });
      }
      if (!levelCheckId || !tier) {
        return res.json({ success: false, message: "Levelcheck und Stufe fehlen." });
      }
      if (!LEVEL_CHECK_TIERS.includes(tier)) {
        return res.json({ success: false, message: "Ungültige Stufe." });
      }
      if (!req.file) {
        return res.json({ success: false, message: "Bitte eine Datei wählen." });
      }

      const checkRes = await pool.query(
        `
        SELECT id FROM level_checks
        WHERE id=$1 AND class_id=$2 AND school_id=$3
      `,
        [levelCheckId, classId, schoolId]
      );
      if (!checkRes.rows.length) {
        return res.json({ success: false, message: "Thema nicht gefunden." });
      }

      const existingRes = await pool.query(
        `
        SELECT id FROM level_check_proofs
        WHERE level_check_id=$1 AND user_id=$2 AND tier=$3
      `,
        [levelCheckId, studentId, tier]
      );
      if (existingRes.rows.length) {
        return res.json({
          success: false,
          message: "Für diese Stufe wurde bereits ein Nachweis hochgeladen."
        });
      }

      const priorTiers = LEVEL_CHECK_TIERS.slice(0, LEVEL_CHECK_TIERS.indexOf(tier));
      if (priorTiers.length) {
        const priorRes = await pool.query(
          `
          SELECT tier FROM level_check_proofs
          WHERE level_check_id=$1 AND user_id=$2 AND tier = ANY($3::text[])
        `,
          [levelCheckId, studentId, priorTiers]
        );
        const have = new Set(priorRes.rows.map((r) => r.tier));
        for (const pt of priorTiers) {
          if (!have.has(pt)) {
            return res.json({
              success: false,
              message: `Bitte zuerst den ${LEVEL_CHECK_TIER_LABELS[pt]}-Check hochladen.`
            });
          }
        }
      }

      const safeName = (req.file.originalname || "nachweis").replace(/[^\w.\-äöüÄÖÜß ]+/g, "_");
      const fileName = `levelcheck-proofs/${schoolId}_${classId}_${studentId}_${levelCheckId}_${tier}_${Date.now()}_${safeName}`;

      await r2.send(
        new PutObjectCommand({
          Bucket: process.env.R2_BUCKET,
          Key: fileName,
          Body: req.file.buffer,
          ContentType: req.file.mimetype
        })
      );

      const url = `${process.env.R2_PUBLIC_URL}/${fileName}`;
      const xpAmount = LEVEL_CHECK_XP[tier] || 5;

      await pool.query(
        `
        INSERT INTO level_check_proofs
          (school_id, level_check_id, user_id, tier, file_url, file_name, xp_awarded)
        VALUES ($1,$2,$3,$4,$5,$6,$7)
      `,
        [schoolId, levelCheckId, studentId, tier, url, safeName, xpAmount]
      );

      await awardLogbuchXP(studentId, xpAmount, `levelcheck_${tier}`, schoolId);

      res.json({
        success: true,
        fileUrl: url,
        xpAwarded: xpAmount,
        tierLabel: LEVEL_CHECK_TIER_LABELS[tier]
      });
    } catch (err) {
      console.error("❌ /api/student/levelcheck-upload:", err);
      res.status(500).json({ success: false, message: "Upload fehlgeschlagen." });
    }
  }
);

app.post("/api/student/levelcheck-mark", isStudent, async (req, res) => {
  try {
    const studentId = req.session.user.id;
    const schoolId = req.session.user.school_id;
    const classId = req.session.user.class_id;
    const goalId = req.body.goalId;
    const tier = req.body.tier;

    if (!classId) {
      return res.json({ success: false, message: "Keine Klasse zugeordnet." });
    }
    if (!goalId || !tier) {
      return res.json({ success: false, message: "Ziel und Stufe fehlen." });
    }
    if (!LEVEL_CHECK_TIERS.includes(tier)) {
      return res.json({ success: false, message: "Ungültige Stufe." });
    }

    const goalRes = await pool.query(
      `
      SELECT g.id
      FROM level_check_goals g
      JOIN level_checks lc ON lc.id = g.level_check_id
      WHERE g.id=$1 AND lc.class_id=$2 AND lc.school_id=$3
    `,
      [goalId, classId, schoolId]
    );
    if (!goalRes.rows.length) {
      return res.json({ success: false, message: "Ziel nicht gefunden." });
    }

    const existing = await pool.query(
      `SELECT id FROM level_check_marks WHERE goal_id=$1 AND user_id=$2 AND tier=$3`,
      [goalId, studentId, tier]
    );

    if (existing.rows.length) {
      await pool.query(
        `DELETE FROM level_check_marks WHERE id=$1`,
        [existing.rows[0].id]
      );
      return res.json({ success: true, tier: null, cleared: true, xpAwarded: 0 });
    }

    await pool.query(
      `
      INSERT INTO level_check_marks (school_id, goal_id, user_id, tier)
      VALUES ($1,$2,$3,$4)
    `,
      [schoolId, goalId, studentId, tier]
    );

    const xpAwarded = await awardLevelplanMarkXPOnce(studentId, schoolId, goalId, tier);

    res.json({
      success: true,
      tier,
      tierLabel: LEVEL_CHECK_TIER_LABELS[tier],
      xpAwarded
    });
  } catch (err) {
    console.error("❌ /api/student/levelcheck-mark:", err);
    res.status(500).json({ success: false, message: "Speichern fehlgeschlagen." });
  }
});

app.get("/api/student/competencies", isStudent, (req, res) => {
  res.redirect(307, "/api/student/levelplan");
});

// -------------------------------------------------------
// TEACHER: Levelstatus (Themen + Unterthemen)
// -------------------------------------------------------
app.get("/api/teacher/levelchecks", isAdmin, async (req, res) => {
  try {
    const schoolId = req.session.user.school_id;
    const classId = Number(req.query.classId);

    if (!classId) {
      return res.status(400).json({ error: "classId fehlt" });
    }

    const classRes = await pool.query(
      "SELECT id, name FROM classes WHERE id=$1 AND school_id=$2",
      [classId, schoolId]
    );
    if (!classRes.rows.length) {
      return res.status(404).json({ error: "Klasse nicht gefunden" });
    }

    const checks = await getLevelChecksForClass(classId, schoolId);

    res.json({
      classId,
      className: classRes.rows[0].name,
      subjects: LOG_SUBJECTS,
      tiers: levelCheckTiersPayload(true),
      levelChecks: checks
    });
  } catch (err) {
    console.error("❌ /api/teacher/levelchecks:", err);
    res.status(500).json({ error: "Serverfehler" });
  }
});

app.get("/api/teacher/levelcheck-topics", isAdmin, (req, res) => {
  const q = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
  res.redirect(307, `/api/teacher/levelchecks${q}`);
});

app.post("/api/teacher/levelchecks", isAdmin, async (req, res) => {
  try {
    const schoolId = req.session.user.school_id;
    const classId = Number(req.body.classId);
    const subject = String(req.body.subject || "").trim();
    const name = String(req.body.name || "").trim();

    if (!classId || !subject || !name) {
      return res.json({
        success: false,
        message: "Klasse, Fach und Themen-Name sind Pflicht."
      });
    }

    if (!LOG_SUBJECTS.includes(subject)) {
      return res.json({ success: false, message: "Ungültiges Fach." });
    }

    const classRes = await pool.query(
      "SELECT id FROM classes WHERE id=$1 AND school_id=$2",
      [classId, schoolId]
    );
    if (!classRes.rows.length) {
      return res.json({ success: false, message: "Klasse nicht gefunden." });
    }

    const orderRes = await pool.query(
      `
      SELECT COALESCE(MAX(sort_order), 0) + 1 AS next_order
      FROM level_checks
      WHERE class_id=$1 AND school_id=$2 AND subject=$3
    `,
      [classId, schoolId, subject]
    );

    const ins = await pool.query(
      `
      INSERT INTO level_checks (school_id, class_id, subject, name, sort_order)
      VALUES ($1,$2,$3,$4,$5)
      RETURNING id, subject, name, sort_order, created_at
    `,
      [schoolId, classId, subject, name.slice(0, 120), orderRes.rows[0].next_order]
    );

    const row = ins.rows[0];
    res.json({
      success: true,
      levelCheck: {
        id: row.id,
        subject: row.subject,
        name: row.name,
        sortOrder: row.sort_order,
        goals: [],
        createdAt: row.created_at
      }
    });
  } catch (err) {
    console.error("❌ POST /api/teacher/levelchecks:", err);
    res.status(500).json({ success: false, message: "Serverfehler" });
  }
});

app.post("/api/teacher/levelchecks/:id/goals", isAdmin, async (req, res) => {
  try {
    const schoolId = req.session.user.school_id;
    const levelCheckId = req.params.id;
    const goalText = String(req.body.goalText || "").trim();

    if (!goalText) {
      return res.json({ success: false, message: "Zieltext fehlt." });
    }

    const checkRes = await pool.query(
      `SELECT id FROM level_checks WHERE id=$1 AND school_id=$2`,
      [levelCheckId, schoolId]
    );
    if (!checkRes.rows.length) {
      return res.json({ success: false, message: "Thema nicht gefunden." });
    }

    const orderRes = await pool.query(
      `
      SELECT COALESCE(MAX(sort_order), 0) + 1 AS next_order
      FROM level_check_goals
      WHERE level_check_id=$1
    `,
      [levelCheckId]
    );

    const ins = await pool.query(
      `
      INSERT INTO level_check_goals (school_id, level_check_id, goal_text, sort_order)
      VALUES ($1,$2,$3,$4)
      RETURNING id, goal_text, sort_order
    `,
      [schoolId, levelCheckId, goalText.slice(0, 300), orderRes.rows[0].next_order]
    );

    const row = ins.rows[0];
    res.json({
      success: true,
      goal: {
        id: row.id,
        text: row.goal_text,
        sortOrder: row.sort_order
      }
    });
  } catch (err) {
    console.error("❌ POST goal:", err);
    res.status(500).json({ success: false, message: "Serverfehler" });
  }
});

app.delete("/api/teacher/levelchecks/:id", isAdmin, async (req, res) => {
  try {
    const schoolId = req.session.user.school_id;
    const del = await pool.query(
      `DELETE FROM level_checks WHERE id=$1 AND school_id=$2 RETURNING id`,
      [req.params.id, schoolId]
    );
    if (!del.rows.length) {
      return res.json({ success: false, message: "Thema nicht gefunden." });
    }
    res.json({ success: true });
  } catch (err) {
    console.error("❌ DELETE levelcheck:", err);
    res.status(500).json({ success: false, message: "Serverfehler" });
  }
});

// -------------------------------------------------------
// TEACHER: Stundenziele pro Fach
// -------------------------------------------------------
app.get("/api/teacher/subject-lesson-goals", isAdmin, async (req, res) => {
  try {
    const schoolId = req.session.user.school_id;
    const goalsBySubject = await fetchCustomSubjectLessonGoals(schoolId);

    res.json({
      subjects: LOG_SUBJECTS,
      defaultGoals: LOG_GOALS,
      goalsBySubject
    });
  } catch (err) {
    console.error("❌ /api/teacher/subject-lesson-goals:", err);
    res.status(500).json({ error: "Serverfehler" });
  }
});

app.post("/api/teacher/subject-lesson-goals", isAdmin, async (req, res) => {
  try {
    const schoolId = req.session.user.school_id;
    const subject = String(req.body.subject || "").trim();
    const goalText = String(req.body.goalText || "").trim();

    if (!subject || !goalText) {
      return res.json({ success: false, message: "Fach und Zieltext sind Pflicht." });
    }

    if (!LOG_SUBJECTS.includes(subject)) {
      return res.json({ success: false, message: "Ungültiges Fach." });
    }

    const orderRes = await pool.query(
      `
      SELECT COALESCE(MAX(sort_order), 0) + 1 AS next_order
      FROM subject_lesson_goals
      WHERE school_id = $1 AND subject = $2
    `,
      [schoolId, subject]
    );

    const ins = await pool.query(
      `
      INSERT INTO subject_lesson_goals (school_id, subject, goal_text, sort_order)
      VALUES ($1, $2, $3, $4)
      RETURNING id, subject, goal_text, sort_order
    `,
      [schoolId, subject, goalText.slice(0, 300), orderRes.rows[0].next_order]
    );

    const row = ins.rows[0];
    res.json({
      success: true,
      goal: {
        id: row.id,
        subject: row.subject,
        text: row.goal_text,
        sortOrder: row.sort_order
      }
    });
  } catch (err) {
    console.error("❌ POST /api/teacher/subject-lesson-goals:", err);
    res.status(500).json({ success: false, message: "Serverfehler" });
  }
});

app.post("/api/teacher/subject-lesson-goals/seed-defaults", isAdmin, async (req, res) => {
  try {
    const schoolId = req.session.user.school_id;
    const subject = String(req.body.subject || "").trim();

    if (!subject || !LOG_SUBJECTS.includes(subject)) {
      return res.json({ success: false, message: "Ungültiges Fach." });
    }

    const existing = await pool.query(
      `SELECT id FROM subject_lesson_goals WHERE school_id = $1 AND subject = $2 LIMIT 1`,
      [schoolId, subject]
    );
    if (existing.rows.length) {
      return res.json({
        success: false,
        message: "Für dieses Fach gibt es schon eigene Ziele."
      });
    }

    const goals = [];
    for (let i = 0; i < LOG_GOALS.length; i++) {
      const ins = await pool.query(
        `
        INSERT INTO subject_lesson_goals (school_id, subject, goal_text, sort_order)
        VALUES ($1, $2, $3, $4)
        RETURNING id, goal_text, sort_order
      `,
        [schoolId, subject, LOG_GOALS[i], i + 1]
      );
      const row = ins.rows[0];
      goals.push({
        id: row.id,
        text: row.goal_text,
        sortOrder: row.sort_order
      });
    }

    res.json({ success: true, goals });
  } catch (err) {
    console.error("❌ POST seed subject-lesson-goals:", err);
    res.status(500).json({ success: false, message: "Serverfehler" });
  }
});

app.delete("/api/teacher/subject-lesson-goals/:id", isAdmin, async (req, res) => {
  try {
    const schoolId = req.session.user.school_id;
    const del = await pool.query(
      `
      DELETE FROM subject_lesson_goals
      WHERE id = $1 AND school_id = $2
      RETURNING id
    `,
      [req.params.id, schoolId]
    );

    if (!del.rows.length) {
      return res.json({ success: false, message: "Ziel nicht gefunden." });
    }

    res.json({ success: true });
  } catch (err) {
    console.error("❌ DELETE subject-lesson-goals:", err);
    res.status(500).json({ success: false, message: "Serverfehler" });
  }
});

app.delete("/api/teacher/levelcheck-goals/:id", isAdmin, async (req, res) => {
  try {
    const schoolId = req.session.user.school_id;
    const del = await pool.query(
      `
      DELETE FROM level_check_goals g
      USING level_checks lc
      WHERE g.id=$1 AND g.level_check_id = lc.id AND lc.school_id=$2
      RETURNING g.id
    `,
      [req.params.id, schoolId]
    );
    if (!del.rows.length) {
      return res.json({ success: false, message: "Ziel nicht gefunden." });
    }
    res.json({ success: true });
  } catch (err) {
    console.error("❌ DELETE goal:", err);
    res.status(500).json({ success: false, message: "Serverfehler" });
  }
});

// -------------------------------------------------------
// TEACHER: Klassenübersicht (Dashboard)
// -------------------------------------------------------
app.get("/api/teacher/dashboard", isAdmin, async (req, res) => {
  try {
    const schoolId = req.session.user.school_id;
    const classId = Number(req.query.classId);
    const date = isoDateOrToday(req.query.date);

    if (!classId) {
      return res.status(400).json({ error: "classId fehlt" });
    }
    if (!date) {
      return res.status(400).json({ error: "Ungültiges Datum" });
    }

    const classRes = await pool.query(
      "SELECT id, name FROM classes WHERE id=$1 AND school_id=$2",
      [classId, schoolId]
    );
    if (!classRes.rows.length) {
      return res.status(404).json({ error: "Klasse nicht gefunden" });
    }

    const weekday = weekdayFromIsoDate(date);
    const d = new Date(`${date}T12:00:00`);
    const weekdayLabels = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];

    let timetable = [];
    if (weekday) {
      const rows = await fetchTimetableForClassDay(classId, weekday);
      timetable = rows.map((row, idx) => ({
        slot: idx + 1,
        timeslot: row.timeslot,
        subject: row.subject,
        room: row.room
      }));
    }

    const studentsRes = await pool.query(
      `
      SELECT id, name
      FROM users
      WHERE role='student' AND class_id=$1 AND school_id=$2
      ORDER BY name ASC
    `,
      [classId, schoolId]
    );

    const studentIds = studentsRes.rows.map((s) => s.id);

    let entriesByStudent = {};
    let streakByStudent = {};

    if (studentIds.length) {
      const entriesRes = await pool.query(
        `
        SELECT
          le.*,
          lr.goal_achieved,
          lr.confidence_after,
          lr.next_step,
          lr.id AS reflection_id
        FROM log_entries le
        LEFT JOIN log_reflections lr ON lr.log_entry_id = le.id
        WHERE le.user_id = ANY($1::int[])
          AND le.date = $2
        ORDER BY le.timeslot ASC NULLS LAST, le.subject ASC
      `,
        [studentIds, date]
      );

      for (const row of entriesRes.rows) {
        if (!entriesByStudent[row.user_id]) entriesByStudent[row.user_id] = [];
        entriesByStudent[row.user_id].push(row);
      }

      const streakRes = await pool.query(
        `
        SELECT le.user_id, lr.goal_achieved, le.date
        FROM log_reflections lr
        JOIN log_entries le ON le.id = lr.log_entry_id
        WHERE le.user_id = ANY($1::int[])
          AND le.date <= $2
        ORDER BY le.user_id ASC, le.date DESC, le.created_at DESC
      `,
        [studentIds, date]
      );

      for (const row of streakRes.rows) {
        if (!streakByStudent[row.user_id]) streakByStudent[row.user_id] = [];
        streakByStudent[row.user_id].push(row);
      }
    }

    const students = studentsRes.rows.map((student) => {
      const entries = entriesByStudent[student.id] || [];
      const streakRows = streakByStudent[student.id] || [];

      const dayReflections = entries
        .filter((e) => e.reflection_id)
        .map((e) => ({
          log_entry_id: e.id,
          goal_achieved: e.goal_achieved,
          confidence_after: e.confidence_after,
          next_step: e.next_step
        }));

      const threeJa = hasThreeJaStreak(streakRows);
      const hint = computeStudentHint(entries, dayReflections, threeJa);

      const primary = entries[0] || null;
      const primaryReflection = primary?.reflection_id
        ? {
            goal_achieved: primary.goal_achieved,
            confidence_after: primary.confidence_after,
            next_step: primary.next_step
          }
        : null;

      let goalAchievedLabel = "–";
      if (dayReflections.length) {
        const achieved = dayReflections.map((r) => r.goal_achieved);
        if (achieved.every((a) => a === "ja")) goalAchievedLabel = "✓";
        else if (achieved.some((a) => a === "ja")) goalAchievedLabel = "◐";
        else if (achieved.some((a) => a === "teilweise")) goalAchievedLabel = "◐";
        else if (achieved.some((a) => a === "nein")) goalAchievedLabel = "✗";
        else goalAchievedLabel = "○";
      }

      const confidenceBefore = primary?.confidence_before ?? null;
      const confidenceAfter = primary?.confidence_after ?? null;
      const nextStep = primary?.next_step || null;

      return {
        id: student.id,
        name: student.name,
        goalSet: entries.length > 0,
        goalCount: entries.length,
        goals: entries.map((e) => ({ subject: e.subject, goal: e.goal })),
        goalAchieved: goalAchievedLabel,
        hasReflection: dayReflections.length > 0,
        confidenceBefore,
        confidenceAfter,
        confidenceLabel:
          confidenceBefore != null && confidenceAfter != null
            ? `${confidenceBefore} → ${confidenceAfter}`
            : confidenceBefore != null
              ? `${confidenceBefore} → –`
              : "–",
        nextStep,
        nextStepLabel: nextStep ? LOG_NEXT_STEP_LABELS[nextStep] || nextStep : "–",
        hint
      };
    });

    res.json({
      classId,
      className: classRes.rows[0].name,
      date,
      weekday,
      weekdayLabel: weekdayLabels[d.getDay()],
      dateLabel: d.toLocaleDateString("de-DE", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric"
      }),
      timetable,
      students
    });
  } catch (err) {
    console.error("❌ /api/teacher/dashboard:", err);
    res.status(500).json({ error: "Serverfehler" });
  }
});

app.get("/api/teacher/student-week", isAdmin, async (req, res) => {
  try {
    const schoolId = req.session.user.school_id;
    const studentId = Number(req.query.studentId);
    const refDate = isoDateOrToday(req.query.date);
    if (!studentId || !refDate) {
      return res.status(400).json({ error: "Parameter fehlen" });
    }

    const studentRes = await pool.query(
      "SELECT id, name, class_id FROM users WHERE id=$1 AND role='student' AND school_id=$2",
      [studentId, schoolId]
    );
    if (!studentRes.rows.length) {
      return res.status(404).json({ error: "Schüler:in nicht gefunden" });
    }

    const weekStart = mondayOfWeek(refDate);
    const weekEnd = fridayOfWeek(weekStart);

    const entriesRes = await pool.query(
      `
      SELECT le.date, le.subject, le.goal, lr.goal_achieved,
             le.confidence_before, lr.confidence_after, lr.next_step
      FROM log_entries le
      LEFT JOIN log_reflections lr ON lr.log_entry_id = le.id
      WHERE le.user_id=$1 AND le.date >= $2 AND le.date <= $3
      ORDER BY le.date ASC, le.subject ASC
    `,
      [studentId, weekStart, weekEnd]
    );

    const weekdayShort = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
    const rows = entriesRes.rows.map((row) => {
      const dateIso =
        row.date instanceof Date
          ? row.date.toISOString().slice(0, 10)
          : String(row.date).slice(0, 10);
      const d = new Date(`${dateIso}T12:00:00`);
      let achieved = "○";
      if (row.goal_achieved === "ja") achieved = "✓";
      else if (row.goal_achieved === "teilweise") achieved = "◐";
      else if (row.goal_achieved === "nein") achieved = "✗";

      return {
        date: dateIso,
        weekday: weekdayShort[d.getDay()],
        subject: row.subject,
        goal: row.goal,
        achieved,
        confidenceLabel:
          row.confidence_before != null && row.confidence_after != null
            ? `${row.confidence_before} → ${row.confidence_after}`
            : "–",
        nextStepLabel: row.next_step
          ? LOG_NEXT_STEP_LABELS[row.next_step] || row.next_step
          : "–"
      };
    });

    res.json({
      student: studentRes.rows[0],
      weekStart,
      weekEnd,
      rows
    });
  } catch (err) {
    console.error("❌ /api/teacher/student-week:", err);
    res.status(500).json({ error: "Serverfehler" });
  }
});

// -------------------------------------------------------
// TEACHER: Stundenplan-Editor
// -------------------------------------------------------
const TIMETABLE_MAX_SLOTS_PER_DAY = 7;

app.get("/api/teacher/timetable", isAdmin, async (req, res) => {
  try {
    const schoolId = req.session.user.school_id;
    const classId = Number(req.query.classId);

    if (!classId) {
      return res.status(400).json({ error: "classId fehlt" });
    }

    const classRes = await pool.query(
      "SELECT id, name FROM classes WHERE id=$1 AND school_id=$2",
      [classId, schoolId]
    );
    if (!classRes.rows.length) {
      return res.status(404).json({ error: "Klasse nicht gefunden" });
    }

    const rowsRes = await pool.query(
      `
      SELECT id, weekday, timeslot, subject, room
      FROM timetables
      WHERE class_id=$1 AND school_id=$2
      ORDER BY weekday ASC, timeslot ASC
    `,
      [classId, schoolId]
    );

    const weekdays = [
      { id: 1, label: "Montag" },
      { id: 2, label: "Dienstag" },
      { id: 3, label: "Mittwoch" },
      { id: 4, label: "Donnerstag" },
      { id: 5, label: "Freitag" }
    ];

    const days = weekdays.map((day) => {
      const dayRows = rowsRes.rows.filter((r) => r.weekday === day.id);
      const slots = buildTimetableEditorSlots(dayRows);
      return { ...day, slots };
    });

    res.json({
      classId,
      className: classRes.rows[0].name,
      maxSlotsPerDay: TIMETABLE_MAX_SLOTS_PER_DAY,
      defaultTimeslots: TIMETABLE_DEFAULT_TIMES,
      freeSubject: TIMETABLE_FREE_SUBJECT,
      subjects: LOG_SUBJECTS,
      weekdays,
      days
    });
  } catch (err) {
    console.error("❌ /api/teacher/timetable:", err);
    res.status(500).json({ error: "Serverfehler" });
  }
});

app.put("/api/teacher/timetable", isAdmin, async (req, res) => {
  try {
    const schoolId = req.session.user.school_id;
    const classId = Number(req.body.classId);
    const entries = req.body.entries;

    if (!classId) {
      return res.json({ success: false, message: "classId fehlt." });
    }
    if (!Array.isArray(entries)) {
      return res.json({ success: false, message: "Ungültige Daten." });
    }

    const classRes = await pool.query(
      "SELECT id FROM classes WHERE id=$1 AND school_id=$2",
      [classId, schoolId]
    );
    if (!classRes.rows.length) {
      return res.json({ success: false, message: "Klasse nicht gefunden." });
    }

    const perDay = {};
    const cleaned = [];

    for (const entry of entries) {
      const weekday = Number(entry.weekday);
      const timeslot = String(entry.timeslot || "").trim();
      const subject = String(entry.subject || "").trim();
      const room = String(entry.room || "").trim() || null;

      if (!timeslot && !subject && !room) continue;

      if (timeslot && !subject) continue;

      if (!timeslot) {
        return res.json({
          success: false,
          message: "Zeitslot fehlt bei eingetragener Stunde."
        });
      }

      if (!subject) {
        return res.json({
          success: false,
          message: "Bitte Fach wählen oder „Frei“ markieren."
        });
      }

      if (weekday < 1 || weekday > 5) {
        return res.json({ success: false, message: "Ungültiger Wochentag." });
      }

      perDay[weekday] = (perDay[weekday] || 0) + 1;
      if (perDay[weekday] > TIMETABLE_MAX_SLOTS_PER_DAY) {
        return res.json({
          success: false,
          message: `Maximal ${TIMETABLE_MAX_SLOTS_PER_DAY} Stunden pro Tag.`
        });
      }

      cleaned.push({ weekday, timeslot, subject, room });
    }

    await pool.query("BEGIN");
    try {
      await pool.query(
        "DELETE FROM timetables WHERE class_id=$1",
        [classId]
      );

      for (const row of cleaned) {
        await pool.query(
          `
          INSERT INTO timetables (class_id, school_id, weekday, timeslot, subject, room)
          VALUES ($1,$2,$3,$4,$5,$6)
        `,
          [classId, schoolId, row.weekday, row.timeslot, row.subject, row.room]
        );
      }

      await pool.query("COMMIT");
    } catch (txErr) {
      await pool.query("ROLLBACK");
      throw txErr;
    }

    res.json({ success: true, saved: cleaned.length });
  } catch (err) {
    console.error("❌ /api/teacher/timetable:", err);
    res.status(500).json({ success: false, message: "Serverfehler" });
  }
});

function activityLevelForDay(entryCount, hasCheck, hasReflection) {
  if (!entryCount) return 0;
  if (hasReflection) return 3;
  if (hasCheck) return 2;
  return 1;
}

// -------------------------------------------------------
// TEACHER: Wochenübersicht Klasse (Heatmap)
// -------------------------------------------------------
app.get("/api/teacher/week", isAdmin, async (req, res) => {
  try {
    const schoolId = req.session.user.school_id;
    const classId = Number(req.query.classId);
    const refDate = isoDateOrToday(req.query.weekStart) || isoDateOrToday(req.query.date);

    if (!classId) {
      return res.status(400).json({ error: "classId fehlt" });
    }
    if (!refDate) {
      return res.status(400).json({ error: "Ungültiges Datum" });
    }

    const classRes = await pool.query(
      "SELECT id, name FROM classes WHERE id=$1 AND school_id=$2",
      [classId, schoolId]
    );
    if (!classRes.rows.length) {
      return res.status(404).json({ error: "Klasse nicht gefunden" });
    }

    const weekStart = mondayOfWeek(refDate);
    const weekEnd = fridayOfWeek(weekStart);
    const weekNumber = isoWeekNumber(weekStart);

    const startLabel = new Date(`${weekStart}T12:00:00`).toLocaleDateString("de-DE", {
      day: "2-digit",
      month: "2-digit"
    });
    const endLabel = new Date(`${weekEnd}T12:00:00`).toLocaleDateString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    });

    const weekdayShort = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
    const days = [];
    for (let i = 0; i < 5; i++) {
      const dateIso = addDaysIso(weekStart, i);
      const d = new Date(`${dateIso}T12:00:00`);
      days.push({
        date: dateIso,
        weekday: weekdayShort[d.getDay()],
        label: d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })
      });
    }

    const studentsRes = await pool.query(
      `
      SELECT id, name
      FROM users
      WHERE role='student' AND class_id=$1 AND school_id=$2
      ORDER BY name ASC
    `,
      [classId, schoolId]
    );

    const studentIds = studentsRes.rows.map((s) => s.id);
    const activityMap = {};

    if (studentIds.length) {
      const actRes = await pool.query(
        `
        SELECT
          le.user_id,
          le.date,
          COUNT(le.id)::int AS entry_count,
          BOOL_OR(lc.id IS NOT NULL) AS has_check,
          BOOL_OR(lr.id IS NOT NULL) AS has_reflection
        FROM log_entries le
        LEFT JOIN log_checks lc ON lc.log_entry_id = le.id
        LEFT JOIN log_reflections lr ON lr.log_entry_id = le.id
        WHERE le.user_id = ANY($1::int[])
          AND le.date >= $2
          AND le.date <= $3
        GROUP BY le.user_id, le.date
      `,
        [studentIds, weekStart, weekEnd]
      );

      for (const row of actRes.rows) {
        const dateIso =
          row.date instanceof Date
            ? row.date.toISOString().slice(0, 10)
            : String(row.date).slice(0, 10);
        const key = `${row.user_id}_${dateIso}`;
        activityMap[key] = {
          entryCount: Number(row.entry_count),
          hasCheck: !!row.has_check,
          hasReflection: !!row.has_reflection,
          level: activityLevelForDay(
            Number(row.entry_count),
            !!row.has_check,
            !!row.has_reflection
          )
        };
      }
    }

    const students = studentsRes.rows.map((student) => {
      const cells = days.map((day) => {
        const key = `${student.id}_${day.date}`;
        const act = activityMap[key] || {
          entryCount: 0,
          hasCheck: false,
          hasReflection: false,
          level: 0
        };
        let detail = "Keine Aktivität";
        if (act.level === 1) detail = `${act.entryCount} Ziel(e) gesetzt`;
        else if (act.level === 2) detail = `${act.entryCount} Ziel(e), Check`;
        else if (act.level === 3) detail = `${act.entryCount} Ziel(e), Reflexion`;

        return {
          date: day.date,
          level: act.level,
          entryCount: act.entryCount,
          hasCheck: act.hasCheck,
          hasReflection: act.hasReflection,
          detail
        };
      });

      return { id: student.id, name: student.name, cells };
    });

    res.json({
      classId,
      className: classRes.rows[0].name,
      weekStart,
      weekEnd,
      weekNumber,
      weekLabel: `KW ${weekNumber} · ${startLabel}. – ${endLabel}`,
      days,
      students,
      legend: [
        { level: 0, label: "Keine Aktivität" },
        { level: 1, label: "Ziel gesetzt" },
        { level: 2, label: "Check" },
        { level: 3, label: "Reflexion" }
      ]
    });
  } catch (err) {
    console.error("❌ /api/teacher/week:", err);
    res.status(500).json({ error: "Serverfehler" });
  }
});

// -------------------------------------------------------
// STUDENT: Charakter-Liste
// -------------------------------------------------------
app.get("/api/student/characterList", isStudent, async (req, res) => {
  const schoolId = req.session.user.school_id;

  const r = await pool.query(
    "SELECT id,name,image_url FROM characters WHERE school_id=$1 ORDER BY id ASC",
    [schoolId]
  );

  res.json(r.rows);
});

// Charakter auswählen
app.post("/api/student/selectCharacter", isStudent, async (req, res) => {
  const studentId = req.session.user.id;
  const { characterId } = req.body;

  if (!characterId)
    return res.json({ success: false, message: "Kein characterId" });

  await pool.query(
    "UPDATE users SET character_id=$1 WHERE id=$2",
    [characterId, studentId]
  );

  res.json({ success: true });
});

// -------------------------------------------------------
// STUDENT: Uploads für Mission
// -------------------------------------------------------
app.post(
  "/api/student/uploadForMission",
  isStudent,
  upload.single("image"),
  async (req, res) => {
    const { missionId } = req.body;
    const studentId = req.session.user.id;
    const schoolId = req.session.user.school_id;

    const fileName = `uploads/${schoolId}_${studentId}_${missionId}_${Date.now()}_${req.file.originalname}`;

    await r2.send(
      new PutObjectCommand({
        Bucket: process.env.R2_BUCKET,
        Key: fileName,
        Body: req.file.buffer,
        ContentType: req.file.mimetype
      })
    );

    const url = `${process.env.R2_PUBLIC_URL}/${fileName}`;

    await pool.query(
      `
      INSERT INTO student_uploads (student_id,mission_id,image_url,school_id)
      VALUES ($1,$2,$3,$4)
    `,
      [studentId, missionId, url, schoolId]
    );

    res.json({ success: true, url });
  }
);

// -------------------------------------------------------
// STUDENT: Mission-Liste
// -------------------------------------------------------
app.get("/api/student/missions", isStudent, async (req, res) => {
  const schoolId = req.session.user.school_id;

  const r = await pool.query(
    "SELECT * FROM missions WHERE school_id=$1 ORDER BY id DESC",
    [schoolId]
  );

  res.json(r.rows);
});

// -------------------------------------------------------
// STUDENT: Bonuskarten
// -------------------------------------------------------
app.get("/api/student/rewards", isStudent, async (req, res) => {
  const schoolId = req.session.user.school_id;

  const r = await pool.query(
    "SELECT * FROM bonuscards WHERE school_id=$1 ORDER BY xp ASC",
    [schoolId]
  );

  res.json(r.rows);
});

app.post("/api/student/redeemReward", isStudent, async (req, res) => {
  const studentId = req.session.user.id;
  const schoolId = req.session.user.school_id;
  const { rewardId } = req.body;

  const r = await pool.query(
    "SELECT xp FROM bonuscards WHERE id=$1 AND school_id=$2",
    [rewardId, schoolId]
  );

  if (!r.rows.length)
    return res.json({ success: false, message: "Reward nicht gefunden" });

  const cost = Number(r.rows[0].xp);

  const u = (
    await pool.query("SELECT xp FROM users WHERE id=$1", [studentId])
  ).rows[0];

  if (u.xp < cost)
    return res.json({ success: false, message: "Nicht genug XP" });

  await pool.query(
    "UPDATE users SET xp=xp-$1 WHERE id=$2",
    [cost, studentId]
  );

  res.json({ success: true });
});

// -------------------------------------------------------
// STUDENT – Klassen-Challenge (Klassen-XP + Voting)
//  -> /api/student/classProgress
//  -> /api/student/classVote
// -------------------------------------------------------
app.get("/api/student/classProgress", isStudent, async (req, res) => {
  try {
    const user = req.session.user;
    if (!user) {
      return res.json({ success: false, message: "Nicht eingeloggt." });
    }

    const classId  = user.class_id;
    const schoolId = user.school_id;

    if (!classId) {
      return res.json({
        success: false,
        message: "Keine Klasse zugeordnet."
      });
    }

    // Klasse + Klassen-XP
    const classRes = await pool.query(
      "SELECT id,name FROM classes WHERE id=$1 AND school_id=$2",
      [classId, schoolId]
    );
    const clsRow  = classRes.rows[0] || null;
    const totalXP = await getClassTotalXP(classId, schoolId);

    const cls = clsRow
      ? { id: clsRow.id, name: clsRow.name, total_xp: totalXP }
      : { id: classId, name: "Unbekannte Klasse", total_xp: totalXP };

    // letzte Voting-Runde dieser Klasse
    const roundRes = await pool.query(
      `
      SELECT *
      FROM class_reward_rounds
      WHERE class_id=$1 AND school_id=$2
      ORDER BY created_at DESC
      LIMIT 1
      `,
      [classId, schoolId]
    );

    if (!roundRes.rows.length) {
      return res.json({
        success: true,
        class: cls,
        round: null,
        options: [],
        votes: [],
        myVote: null
      });
    }

    const roundRow = roundRes.rows[0];

    // Status ableiten
    let status = "voting";
    if (roundRow.fixed_option_id && roundRow.is_active) {
      status = "active";
    } else if (roundRow.fixed_option_id && !roundRow.is_active) {
      status = "completed";
    }

    const round = {
      id: roundRow.id,
      title: roundRow.title,
      status,
      // WICHTIG: Option-ID, nicht Reward-ID
      selected_option_id: roundRow.fixed_option_id,
      // Ziel-XP der Runde (wie im Admin-Panel)
      xp_required: roundRow.target_xp || 0
    };

    // Optionen inkl. xp_required aus class_rewards (falls vorhanden)
    const optRes = await pool.query(
      `
      SELECT
        o.id,
        o.round_id,
        o.reward_id,
        o.name,
        COALESCE(
          NULLIF(TRIM(o.image_url), ''),
          NULLIF(TRIM(cr_direct.image_url), ''),
          NULLIF(TRIM(cr_by_name.image_url), '')
        ) AS image_url,
        COALESCE(cr_direct.xp_required, cr_by_name.xp_required) AS xp_required
      FROM class_reward_options o
      INNER JOIN class_reward_rounds rr ON rr.id = o.round_id
      LEFT JOIN class_rewards cr_direct ON cr_direct.id = o.reward_id
      LEFT JOIN class_rewards cr_by_name
        ON o.reward_id IS NULL
        AND cr_by_name.school_id = rr.school_id
        AND cr_by_name.name = o.name
      WHERE o.round_id=$1
      ORDER BY o.id ASC
      `,
      [roundRow.id]
    );

    const options = optRes.rows.map(o => ({
      id:          o.id,
      round_id:    o.round_id,
      reward_id:   o.reward_id,
      name:        o.name,
      image_url:   publicImageUrl(o.image_url),
      // fallback: wenn Reward keine eigene XP hat → Rundenziel
      xp_required: o.xp_required || round.xp_required || 0
    }));

    // Stimmen pro OPTION (nicht mehr pro reward_id)
    const votesRes = await pool.query(
      `
      SELECT
        o.id AS option_id,
        COUNT(v.id) AS votes
      FROM class_reward_options o
      LEFT JOIN class_reward_votes v
        ON v.option_id = o.id
      WHERE o.round_id=$1
      GROUP BY o.id
      `,
      [roundRow.id]
    );

    const votes = votesRes.rows.map(v => ({
      option_id: v.option_id,
      votes: Number(v.votes)
    }));

    // eigene Stimme → option_id
    const myVoteRes = await pool.query(
      `
      SELECT option_id
      FROM class_reward_votes
      WHERE round_id=$1 AND student_id=$2
      LIMIT 1
      `,
      [roundRow.id, user.id]
    );

    const myVote = myVoteRes.rows.length
      ? myVoteRes.rows[0].option_id
      : null;

    return res.json({
      success: true,
      class: cls,
      round,
      options,
      votes,
      myVote
    });
  } catch (err) {
    console.error("❌ /api/student/classProgress ERROR:", err);
    return res.json({
      success: false,
      message: "Serverfehler beim Laden der Klassen-Challenge."
    });
  }
});

// ======================================================
// STUDENT VOTING – 1x Stimme, nicht änderbar
// ======================================================
app.post("/api/student/classVote", isStudent, async (req, res) => {
  try {
    const studentId = req.session.user.id;
    const schoolId  = req.session.user.school_id;
    const { roundId, optionId } = req.body;

    // 1) Runde prüfen
    const r = await pool.query(
      "SELECT * FROM class_reward_rounds WHERE id=$1 AND school_id=$2",
      [roundId, schoolId]
    );
    if (!r.rows.length) {
      return res.json({ success: false, message: "Runde nicht gefunden." });
    }

    // Voting abgeschlossen?
    if (r.rows[0].fixed_option_id) {
      return res.json({ success: false, message: "Voting ist beendet." });
    }

    // 2) Prüfen: hat der Schüler schon abgestimmt?
    const existing = await pool.query(
      `
      SELECT id
      FROM class_reward_votes
      WHERE round_id=$1 AND student_id=$2
      `,
      [roundId, studentId]
    );

    if (existing.rows.length > 0) {
      return res.json({
        success: false,
        message: "Du hast bereits abgestimmt."
      });
    }

    // 3) Option prüfen
    const opt = await pool.query(
      `
      SELECT id, reward_id
      FROM class_reward_options
      WHERE id=$1 AND round_id=$2
      LIMIT 1
      `,
      [optionId, roundId]
    );

    if (!opt.rows.length) {
      return res.json({
        success: false,
        message: "Option ungültig."
      });
    }

    const rewardId = opt.rows[0].reward_id || null;

    // 4) Stimme speichern – einmalig
    await pool.query(
      `
      INSERT INTO class_reward_votes (round_id, student_id, option_id, reward_id)
      VALUES ($1,$2,$3,$4)
      `,
      [roundId, studentId, optionId, rewardId]
    );

    return res.json({ success: true });

  } catch (err) {
    console.error("❌ classVote ERROR:", err);
    return res.json({
      success: false,
      message: "Serverfehler bei der Abstimmung."
    });
  }
});


// -------------------------------------------------------
// ADMIN – Klassenfortschritt & Voting
// -------------------------------------------------------
app.get("/api/admin/class-progress", isAdmin, async (req, res) => {
  const schoolId = req.session.user.school_id;
  const classId = Number(req.query.classId);

  if (!classId) {
    return res.json({ success: false, message: "classId fehlt" });
  }

  const totalXP = await getClassTotalXP(classId, schoolId);

  const roundRes = await pool.query(`
    SELECT *
    FROM class_reward_rounds
    WHERE class_id=$1 AND school_id=$2
    ORDER BY created_at DESC
    LIMIT 1
  `, [classId, schoolId]);

  if (!roundRes.rows.length) {
    return res.json({
      success: true,
      classId,
      total_xp: totalXP,
      round: null,
      options: []
    });
  }

  const round = roundRes.rows[0];

  const optRes = await pool.query(
    `
    SELECT
      o.id,
      o.name,
      COALESCE(
        NULLIF(TRIM(o.image_url), ''),
        NULLIF(TRIM(cr_direct.image_url), ''),
        NULLIF(TRIM(cr_by_name.image_url), '')
      ) AS image_url,
      COUNT(v.id) AS votes
    FROM class_reward_options o
    INNER JOIN class_reward_rounds rr ON rr.id = o.round_id
    LEFT JOIN class_rewards cr_direct ON cr_direct.id = o.reward_id
    LEFT JOIN class_rewards cr_by_name
      ON o.reward_id IS NULL
      AND cr_by_name.school_id = rr.school_id
      AND cr_by_name.name = o.name
    LEFT JOIN class_reward_votes v ON v.option_id = o.id
    WHERE o.round_id=$1
    GROUP BY o.id, o.name, o.image_url, cr_direct.image_url, cr_by_name.image_url
    ORDER BY o.id ASC
    `,
    [round.id]
  );

  const hasReachedTarget = totalXP >= round.target_xp;

  res.json({
    success: true,
    classId,
    total_xp: totalXP,
    round: {
      id: round.id,
      title: round.title,
      target_xp: round.target_xp,
      is_active: round.is_active,
      fixed_option_id: round.fixed_option_id,
      hasReachedTarget
    },
    options: optRes.rows.map(o => ({
      id: o.id,
      name: o.name,
      image_url: publicImageUrl(o.image_url),
      votes: Number(o.votes),
      is_selected: round.fixed_option_id === o.id
    }))
  });
});

// Neue Voting-Runde starten
app.post("/api/admin/class-reward-round", isAdmin, async (req, res) => {
  const schoolId = req.session.user.school_id;
  const { classId, title, targetXp } = req.body;

  const cId = Number(classId);
  const tXp = Number(targetXp);

  if (!cId || !tXp) {
    return res.json({ success: false, message: "classId oder targetXp fehlt" });
  }

  await pool.query(
    "UPDATE class_reward_rounds SET is_active=FALSE WHERE class_id=$1 AND school_id=$2",
    [cId, schoolId]
  );

  const ins = await pool.query(`
    INSERT INTO class_reward_rounds (class_id,school_id,title,target_xp,is_active)
    VALUES ($1,$2,$3,$4,TRUE)
    RETURNING id
  `, [cId, schoolId, title || null, tXp]);

  res.json({ success: true, roundId: ins.rows[0].id });
});

// -------------------------------------------------------
// ADMIN – Klassenbelohnungen (Reward-Liste für Challenges)
// -------------------------------------------------------
let uploadedClassRewardImageUrl = null;

// Alle Klassenbelohnungen abrufen
app.get("/api/class/rewards", isAdmin, async (req, res) => {
  const schoolId = req.session.user.school_id;

  const r = await pool.query(
    `
    SELECT id,name,xp_required AS xp,image_url
    FROM class_rewards
    WHERE school_id=$1
    ORDER BY xp_required ASC
    `,
    [schoolId]
  );

  res.json(r.rows);
});

// Neue Klassenbelohnung anlegen
// VARIANTE C: xp ODER xpRequired ODER xp_required
app.post("/api/class/rewards", isAdmin, async (req, res) => {
  const schoolId = req.session.user.school_id;
  const { name, xp, xpRequired, xp_required, imageUrl } = req.body;

  const xpVal = Number(
    xp !== undefined
      ? xp
      : xpRequired !== undefined
        ? xpRequired
        : xp_required
  );

  if (!name || !xpVal) {
    return res.json({ success: false, message: "name oder xp fehlt" });
  }

  const ins = await pool.query(
    `
    INSERT INTO class_rewards (name,xp_required,image_url,school_id)
    VALUES ($1,$2,$3,$4)
    RETURNING id
    `,
    [name, xpVal, imageUrl || null, schoolId]
  );

  res.json({ success: true, id: ins.rows[0].id });
});

// Bild-Upload für Klassenbelohnung
app.post(
  "/api/class/rewards/upload",
  isAdmin,
  upload.single("image"),
  async (req, res) => {
    if (!req.file) return res.json({ success: false });

    const schoolId = req.session.user.school_id;
    const fileName = `class_rewards/${schoolId}_${Date.now()}_${req.file.originalname}`;

    await r2.send(
      new PutObjectCommand({
        Bucket: process.env.R2_BUCKET,
        Key: fileName,
        Body: req.file.buffer,
        ContentType: req.file.mimetype
      })
    );

    const url = `${process.env.R2_PUBLIC_URL}/${fileName}`;
    uploadedClassRewardImageUrl = url;

    res.json({ success: true, url });
  }
);

// Klassenbelohnung löschen
app.delete("/api/class/rewards/:id", isAdmin, async (req, res) => {
  const schoolId = req.session.user.school_id;
  const rewardId = Number(req.params.id);

  try {
    const r = await pool.query(
      "SELECT image_url FROM class_rewards WHERE id=$1 AND school_id=$2",
      [rewardId, schoolId]
    );

    if (r.rows.length && r.rows[0].image_url) {
      const prefix = (process.env.R2_PUBLIC_URL || "") + "/";
      const key = r.rows[0].image_url.replace(prefix, "");

      try {
        await r2.send(
          new DeleteObjectCommand({
            Bucket: process.env.R2_BUCKET,
            Key: key
          })
        );
      } catch (err) {
        console.error("R2 delete error (class_reward)", err);
      }
    }

    await pool.query(
      "DELETE FROM class_rewards WHERE id=$1 AND school_id=$2",
      [rewardId, schoolId]
    );

    res.json({ success: true });
  } catch (err) {
    console.error("Error deleting class_reward", err);
    res
      .status(500)
      .json({ success: false, message: "Fehler beim Löschen der Klassenbelohnung" });
  }
});

// Upload für Voting-Option
app.post(
  "/api/admin/class-reward-option/upload",
  isAdmin,
  upload.single("image"),
  async (req, res) => {
    if (!req.file) return res.json({ success: false });

    const schoolId = req.session.user.school_id;
    const fileName = `class_rewards/${schoolId}_${Date.now()}_${req.file.originalname}`;

    await r2.send(new PutObjectCommand({
      Bucket: process.env.R2_BUCKET,
      Key: fileName,
      Body: req.file.buffer,
      ContentType: req.file.mimetype
    }));

    const url = `${process.env.R2_PUBLIC_URL}/${fileName}`;
    uploadedClassRewardImageUrl = url;

    res.json({ success: true, url });
  }
);

// Option hinzufügen – jetzt wahlweise mit rewardId oder mit Name/Bild
app.post("/api/admin/class-reward-option", isAdmin, async (req, res) => {
  const schoolId = req.session.user.school_id;
  const { roundId, name, imageUrl, rewardId } = req.body;

  const rId = Number(roundId);
  const rewId = rewardId ? Number(rewardId) : null;

  if (!rId) {
    return res.json({ success: false, message: "roundId fehlt" });
  }

  let finalName = name || null;
  let finalImageUrl = imageUrl || uploadedClassRewardImageUrl || null;
  let finalRewardId = rewId;

  // Falls rewardId gesetzt ist, Daten aus class_rewards übernehmen
  if (rewId) {
    const r = await pool.query(
      "SELECT id,name,image_url FROM class_rewards WHERE id=$1 AND school_id=$2",
      [rewId, schoolId]
    );

    if (!r.rows.length) {
      return res.json({ success: false, message: "Klassenbelohnung nicht gefunden" });
    }

    finalRewardId = r.rows[0].id;
    if (!finalName) finalName = r.rows[0].name;
    if (!finalImageUrl) finalImageUrl = r.rows[0].image_url;
  }

  if (!finalName) {
    return res.json({
      success: false,
      message: "name oder rewardId fehlt"
    });
  }

  const ins = await pool.query(`
    INSERT INTO class_reward_options (round_id,reward_id,name,image_url)
    VALUES ($1,$2,$3,$4)
    RETURNING id
  `, [rId, finalRewardId, finalName, finalImageUrl]);

  uploadedClassRewardImageUrl = null;

  res.json({ success: true, optionId: ins.rows[0].id });
});

// Voting stoppen
app.post("/api/admin/class-reward-round/:id/stop", isAdmin, async (req, res) => {
  const schoolId = req.session.user.school_id;
  const id = Number(req.params.id);

  await pool.query(
    "UPDATE class_reward_rounds SET is_active=FALSE WHERE id=$1 AND school_id=$2",
    [id, schoolId]
  );

  res.json({ success: true });
});

// Gewinner fixieren
app.post("/api/admin/class-reward-round/:id/fix", isAdmin, async (req, res) => {
  const schoolId = req.session.user.school_id;
  const id = Number(req.params.id);
  const { optionId } = req.body;
  const oId = Number(optionId);

  if (!id || !oId) {
    return res.json({ success: false, message: "roundId/optionId fehlt" });
  }

  await pool.query(`
    UPDATE class_reward_rounds
    SET fixed_option_id=$1, is_active=FALSE
    WHERE id=$2 AND school_id=$3
  `, [oId, id, schoolId]);

  res.json({ success: true });
});

// -------------------------------------------------------
// ADMIN – Klassen
// -------------------------------------------------------
app.get("/api/class", isAdmin, async (req, res) => {
  const schoolId = req.session.user.school_id;

  const r = await pool.query(`
    SELECT id,name
    FROM classes
    WHERE school_id=$1
    ORDER BY name ASC
  `, [schoolId]);

  res.json(r.rows);
});

app.post("/api/class", isAdmin, async (req, res) => {
  const { name } = req.body;
  const schoolId = req.session.user.school_id;

  if (!name) return res.json({ success: false });

  await pool.query(`
    INSERT INTO classes (name,school_id)
    VALUES ($1,$2)
    ON CONFLICT (name,school_id) DO NOTHING
  `, [name, schoolId]);

  res.json({ success: true });
});

app.delete("/api/class/:id", isAdmin, async (req, res) => {
  const schoolId = req.session.user.school_id;
  const id = Number(req.params.id);

  await pool.query(
    "DELETE FROM users WHERE class_id=$1 AND role='student' AND school_id=$2",
    [id, schoolId]
  );

  await pool.query(
    "DELETE FROM classes WHERE id=$1 AND school_id=$2",
    [id, schoolId]
  );

  res.json({ success: true });
});

// -------------------------------------------------------
// ADMIN – Schüler:innen
// -------------------------------------------------------
app.get("/api/student", isAdmin, async (req, res) => {
  const { classId } = req.query;
  const schoolId = req.session.user.school_id;

  if (!classId) return res.json([]);

  const r = await pool.query(`
    SELECT id,name,password,xp
    FROM users
    WHERE role='student' AND class_id=$1 AND school_id=$2
    ORDER BY name ASC
  `, [classId, schoolId]);

  res.json(r.rows);
});

// -------------------------------------------------------
// ADMIN – Export: Passwortkarten für eine Klasse
// -------------------------------------------------------
app.get("/api/exportPasswords", isAdmin, async (req, res) => {
  const classId  = Number(req.query.classId);
  const schoolId = req.session.user.school_id;

  if (!classId) {
    return res.json([]);
  }

  const r = await pool.query(`
    SELECT id, name, password
    FROM users
    WHERE role='student'
      AND class_id=$1
      AND school_id=$2
    ORDER BY name ASC
  `, [classId, schoolId]);

  res.json(r.rows);
});

app.post("/api/student", isAdmin, async (req, res) => {
  const { name, classId } = req.body;
  const schoolId = req.session.user.school_id;

  if (!name || !classId)
    return res.json({ success: false });

  const tempPassword = generateTempPassword();

  await pool.query(`
    INSERT INTO users (name,password,role,class_id,school_id,xp,first_login)
    VALUES ($1,$2,'student',$3,$4,0,TRUE)
  `, [name, tempPassword, classId, schoolId]);

  res.json({ success: true });
});

app.delete("/api/student/:id", isAdmin, async (req, res) => {
  const schoolId = req.session.user.school_id;

  await pool.query(
    "DELETE FROM users WHERE id=$1 AND school_id=$2",
    [req.params.id, schoolId]
  );

  res.json({ success: true });
});

app.post("/api/student/resetPassword", isAdmin, async (req, res) => {
  const { studentId } = req.body;
  const schoolId = req.session.user.school_id;

  if (!studentId)
    return res.json({ success: false, message: "studentId fehlt" });

  const newPassword = generateTempPassword();

  const r = await pool.query(`
    UPDATE users
    SET password=$1, first_login=TRUE
    WHERE id=$2 AND school_id=$3
    RETURNING id
  `, [newPassword, studentId, schoolId]);

  if (!r.rows.length)
    return res.json({ success: false, message: "Schüler:in nicht gefunden" });

  res.json({ success: true, password: newPassword });
});

// -------------------------------------------------------
// XP VERGABE
// -------------------------------------------------------
async function logXP(studentId, amount, missionId, source, adminId, schoolId) {
  await pool.query(`
    INSERT INTO xp_transactions (student_id,amount,mission_id,source,awarded_by,school_id)
    VALUES ($1,$2,$3,$4,$5,$6)
  `, [studentId, amount, missionId, source, adminId, schoolId]);
}

app.post("/api/xp", isAdmin, async (req, res) => {
  const { studentId, xp } = req.body;

  const delta = Number(xp);
  const adminId = req.session.user.id;
  const schoolId = req.session.user.school_id;

  await pool.query(
    "UPDATE users SET xp=xp+$1 WHERE id=$2",
    [delta, studentId]
  );

  await logXP(studentId, delta, null, "direct", adminId, schoolId);
  await updateStudentLevel(studentId);

  res.json({ success: true });
});

app.post("/api/xpmission", isAdmin, async (req, res) => {
  const { studentId, missionId } = req.body;

  const adminId = req.session.user.id;
  const schoolId = req.session.user.school_id;

  const m = await pool.query(`
    SELECT xp
    FROM missions
    WHERE id=$1 AND school_id=$2
  `, [missionId, schoolId]);

  if (!m.rows.length)
    return res.json({ success: false });

  const xp = m.rows[0].xp;

  await pool.query(
    "UPDATE users SET xp=xp+$1 WHERE id=$2",
    [xp, studentId]
  );

  await logXP(studentId, xp, missionId, "mission", adminId, schoolId);
  await updateStudentLevel(studentId);

  res.json({ success: true });
});

// -------------------------------------------------------
// ADMIN – Missionen
// -------------------------------------------------------
let uploadedMissionImageUrl = null;

app.post(
  "/api/missions/upload",
  isAdmin,
  upload.single("image"),
  async (req, res) => {
    if (!req.file) return res.json({ success: false });

    const schoolId = req.session.user.school_id;
    const fileName = `missions/${schoolId}_${Date.now()}_${req.file.originalname}`;

    await r2.send(new PutObjectCommand({
      Bucket: process.env.R2_BUCKET,
      Key: fileName,
      Body: req.file.buffer,
      ContentType: req.file.mimetype
    }));

    const url = `${process.env.R2_PUBLIC_URL}/${fileName}`;
    uploadedMissionImageUrl = url;

    res.json({ success: true, url });
  }
);

app.post("/api/missions", isAdmin, async (req, res) => {
  const { name, xp, imageUrl, requireUpload } = req.body;

  const schoolId = req.session.user.school_id;

  await pool.query(`
    INSERT INTO missions (name,xp,image_url,require_upload,school_id)
    VALUES ($1,$2,$3,$4,$5)
  `, [
    name,
    Number(xp),
    imageUrl || uploadedMissionImageUrl,
    !!requireUpload,
    schoolId
  ]);

  uploadedMissionImageUrl = null;

  res.json({ success: true });
});

app.get("/api/missions", isAdmin, async (req, res) => {
  const schoolId = req.session.user.school_id;

  const r = await pool.query(`
    SELECT *
    FROM missions
    WHERE school_id=$1
    ORDER BY id DESC
  `, [schoolId]);

  res.json(r.rows);
});

app.delete("/api/missions/:id", isAdmin, async (req, res) => {
  const schoolId = req.session.user.school_id;
  const missionId = Number(req.params.id);

  const r = await pool.query(`
    SELECT image_url
    FROM missions
    WHERE id=$1 AND school_id=$2
  `, [missionId, schoolId]);

  if (r.rows.length && r.rows[0].image_url) {
    const prefix = process.env.R2_PUBLIC_URL + "/";
    const key = r.rows[0].image_url.replace(prefix, "");

    try {
      await r2.send(new DeleteObjectCommand({
        Bucket: process.env.R2_BUCKET,
        Key: key
      }));
    } catch (err) {}
  }

  await pool.query(
    "DELETE FROM student_uploads WHERE mission_id=$1 AND school_id=$2",
    [missionId, schoolId]
  );

  await pool.query(
    "UPDATE xp_transactions SET mission_id=NULL WHERE mission_id=$1 AND school_id=$2",
    [missionId, schoolId]
  );

  await pool.query(
    "DELETE FROM missions WHERE id=$1 AND school_id=$2",
    [missionId, schoolId]
  );

  res.json({ success: true });
});

// -------------------------------------------------------
// ADMIN – Bonuskarten
// -------------------------------------------------------
let uploadedBonusImageUrl = null;

app.post(
  "/api/bonus/upload",
  isAdmin,
  upload.single("image"),
  async (req, res) => {
    if (!req.file) return res.json({ success: false });

    const schoolId = req.session.user.school_id;
    const fileName = `bonuscards/${schoolId}_${Date.now()}_${req.file.originalname}`;

    await r2.send(new PutObjectCommand({
      Bucket: process.env.R2_BUCKET,
      Key: fileName,
      Body: req.file.buffer,
      ContentType: req.file.mimetype
    }));

    const url = `${process.env.R2_PUBLIC_URL}/${fileName}`;
    uploadedBonusImageUrl = url;

    res.json({ success: true, url });
  }
);

app.post("/api/bonus", isAdmin, async (req, res) => {
  const { name, xp, imageUrl } = req.body;
  const schoolId = req.session.user.school_id;

  await pool.query(`
    INSERT INTO bonuscards (name,xp,image_url,school_id)
    VALUES ($1,$2,$3,$4)
  `, [name, Number(xp), imageUrl || uploadedBonusImageUrl, schoolId]);

  uploadedBonusImageUrl = null;

  res.json({ success: true });
});

app.get("/api/bonus", isAdmin, async (req, res) => {
  const schoolId = req.session.user.school_id;

  const r = await pool.query(`
    SELECT *
    FROM bonuscards
    WHERE school_id=$1
    ORDER BY id DESC
  `, [schoolId]);

  res.json(r.rows);
});

app.delete("/api/bonus/:id", isAdmin, async (req, res) => {
  const schoolId = req.session.user.school_id;
  const bonusId = Number(req.params.id);

  const r = await pool.query(`
    SELECT image_url
    FROM bonuscards
    WHERE id=$1 AND school_id=$2
  `, [bonusId, schoolId]);

  if (r.rows.length && r.rows[0].image_url) {
    const prefix = process.env.R2_PUBLIC_URL + "/";
    const key = r.rows[0].image_url.replace(prefix, "");

    try {
      await r2.send(new DeleteObjectCommand({
        Bucket: process.env.R2_BUCKET,
        Key: key
      }));
    } catch {}
  }

  await pool.query(
    "DELETE FROM bonuscards WHERE id=$1 AND school_id=$2",
    [bonusId, schoolId]
  );

  res.json({ success: true });
});

// -------------------------------------------------------
// ADMIN – Charaktere
// -------------------------------------------------------
let uploadedCharacterImageUrl = null;

app.post(
  "/api/character/upload",
  isAdmin,
  upload.single("image"),
  async (req, res) => {
    if (!req.file) return res.json({ success: false });

    const schoolId = req.session.user.school_id;
    const fileName = `characters/${schoolId}_${Date.now()}_${req.file.originalname}`;

    await r2.send(new PutObjectCommand({
      Bucket: process.env.R2_BUCKET,
      Key: fileName,
      Body: req.file.buffer,
      ContentType: req.file.mimetype
    }));

    const url = `${process.env.R2_PUBLIC_URL}/${fileName}`;
    uploadedCharacterImageUrl = url;

    res.json({ success: true, url });
  }
);

app.post("/api/character", isAdmin, async (req, res) => {
  const { name, imageUrl } = req.body;
  const schoolId = req.session.user.school_id;

  await pool.query(`
    INSERT INTO characters (name,image_url,school_id)
    VALUES ($1,$2,$3)
  `, [name, imageUrl || uploadedCharacterImageUrl, schoolId]);

  uploadedCharacterImageUrl = null;

  res.json({ success: true });
});

app.get("/api/character", isAdmin, async (req, res) => {
  const schoolId = req.session.user.school_id;

  const r = await pool.query(`
    SELECT *
    FROM characters
    WHERE school_id=$1
    ORDER BY id DESC
  `, [schoolId]);

  res.json(r.rows);
});

app.delete("/api/character/:id", isAdmin, async (req, res) => {
  const schoolId = req.session.user.school_id;
  const charId = Number(req.params.id);

  const r = await pool.query(`
    SELECT image_url
    FROM characters
    WHERE id=$1 AND school_id=$2
  `, [charId, schoolId]);

  if (r.rows.length && r.rows[0].image_url) {
    const prefix = process.env.R2_PUBLIC_URL + "/";
    const key = r.rows[0].image_url.replace(prefix, "");

    try {
      await r2.send(new DeleteObjectCommand({
        Bucket: process.env.R2_BUCKET,
        Key: key
      }));
    } catch {}
  }

  await pool.query(
    "UPDATE users SET character_id=NULL WHERE character_id=$1 AND school_id=$2",
    [charId, schoolId]
  );

  await pool.query(
    "DELETE FROM characters WHERE id=$1 AND school_id=$2",
    [charId, schoolId]
  );

  res.json({ success: true });
});

// -------------------------------------------------------
// ADMIN – Level-System
// -------------------------------------------------------
app.get("/api/levels", isAdmin, async (req, res) => {
  const schoolId = req.session.user.school_id;

  const r = await pool.query(`
    SELECT id,name,min_xp
    FROM levels
    WHERE school_id=$1
    ORDER BY min_xp ASC
  `, [schoolId]);

  res.json(r.rows);
});

app.post("/api/levels", isAdmin, async (req, res) => {
  try {
    let { name, minXp } = req.body;
    const schoolId = req.session.user.school_id;

    minXp = Number(minXp);

    if (!name || Number.isNaN(minXp)) {
      return res.json({
        success: false,
        message: "Name oder Mindest-XP fehlen oder sind ungültig."
      });
    }

    // Erstes Level immer auf 0 XP setzen
    const existing = await pool.query(
      `
      SELECT COUNT(*) AS count
      FROM levels
      WHERE school_id=$1
    `,
      [schoolId]
    );

    const count = Number(existing.rows[0].count);
    if (count === 0 && minXp !== 0) {
      minXp = 0;
    }

    // Eintrag anlegen oder bei Konflikt (gleicher min_xp in derselben Schule)
    // nur den Namen aktualisieren, statt mit Fehler abzustürzen.
    await pool.query(
      `
      INSERT INTO levels (name, min_xp, school_id)
      VALUES ($1, $2, $3)
      ON CONFLICT (school_id, min_xp)
      DO UPDATE SET name = EXCLUDED.name
    `,
      [name, minXp, schoolId]
    );

    await recalcAllStudentLevels();

    return res.json({ success: true });
  } catch (err) {
    console.error("Fehler beim Anlegen eines Levels:", err);
    return res.status(500).json({
      success: false,
      message: "Fehler beim Anlegen des Levels."
    });
  }
});

app.delete("/api/levels/:id", isAdmin, async (req, res) => {
  try {
    const levelId = req.params.id;
    const schoolId = req.session.user.school_id;

    // Level laden
    const lvl = await pool.query(
      `SELECT id, min_xp FROM levels WHERE id=$1 AND school_id=$2`,
      [levelId, schoolId]
    );

    if (lvl.rowCount === 0) {
      return res.json({
        success: false,
        message: "Level nicht gefunden oder gehört nicht zu deiner Schule."
      });
    }

    const minXp = lvl.rows[0].min_xp;

    // 1. Schutz: 0 XP Level darf nie gelöscht werden
    if (minXp === 0) {
      return res.json({
        success: false,
        message: "Das Start-Level (0 XP) kann nicht gelöscht werden."
      });
    }

    // 2. Schutz: Es müssen immer mindestens 2 Level vorhanden bleiben
    const count = await pool.query(
      `SELECT COUNT(*) FROM levels WHERE school_id=$1`,
      [schoolId]
    );

    if (Number(count.rows[0].count) <= 2) {
      return res.json({
        success: false,
        message: "Du kannst nicht alle Level löschen. Mindestens ein Level neben dem Start-Level muss existieren."
      });
    }

    // Löschen, wenn beide Schutzmechanismen erfüllt sind
    await pool.query(
      `DELETE FROM levels WHERE id=$1 AND school_id=$2`,
      [levelId, schoolId]
    );

    return res.json({ success: true });

  } catch (err) {
    console.error("Fehler beim Löschen eines Levels:", err);
    return res.status(500).json({
      success: false,
      message: "Fehler beim Löschen."
    });
  }
});


// -------------------------------------------------------
// ADMIN – Klasse-Challenge (neues System)
// -------------------------------------------------------
app.get("/api/class/progress/status", isAdmin, async (req, res) => {
  const schoolId = req.session.user.school_id;
  const classId = Number(req.query.classId);

  if (!classId)
    return res.json({ success: false, message: "classId fehlt" });

  const totalXP = await getClassTotalXP(classId, schoolId);

  const r = await pool.query(`
    SELECT cc.id,cc.target_xp,cc.is_active,
           cr.name AS reward_name
    FROM class_challenges cc
    JOIN class_rewards cr ON cr.id = cc.reward_id
    WHERE cc.class_id=$1 AND cc.school_id=$2
    ORDER BY cc.created_at DESC
    LIMIT 1
  `, [classId, schoolId]);

  if (!r.rows.length) {
    return res.json({
      success: true,
      classId,
      total_xp: totalXP,
      challenge: null
    });
  }

  const ch = r.rows[0];

  res.json({
    success: true,
    classId,
    total_xp: totalXP,
    challenge: {
      id: ch.id,
      reward_name: ch.reward_name,
      target_xp: ch.target_xp,
      current_xp: totalXP,
      is_active: ch.is_active
    }
  });
});

app.post("/api/class/challenge/start", isAdmin, async (req, res) => {
  const schoolId = req.session.user.school_id;
  const { classId, rewardId, targetXp } = req.body;

  const cId = Number(classId);
  const rId = Number(rewardId);
  const tXp = Number(targetXp);

  if (!cId || !rId || !tXp) {
    return res.json({
      success: false,
      message: "classId, rewardId oder targetXp fehlt"
    });
  }

  const rewardRes = await pool.query(`
    SELECT id
    FROM class_rewards
    WHERE id=$1 AND school_id=$2
  `, [rId, schoolId]);

  if (!rewardRes.rows.length) {
    return res.json({ success: false, message: "Belohnung nicht gefunden" });
  }

  await pool.query(`
    UPDATE class_challenges
    SET is_active=FALSE
    WHERE class_id=$1 AND school_id=$2
  `, [cId, schoolId]);

  const ins = await pool.query(`
    INSERT INTO class_challenges (class_id,school_id,reward_id,target_xp,is_active)
    VALUES ($1,$2,$3,$4,TRUE)
  `, [cId, schoolId, rId, tXp]);

  res.json({ success: true, challengeId: ins.rows[0].id });
});

app.post("/api/class/challenge/stop", isAdmin, async (req, res) => {
  const schoolId = req.session.user.school_id;
  const { classId } = req.body;
  const cId = Number(classId);

  await pool.query(`
    UPDATE class_challenges
    SET is_active=FALSE
    WHERE class_id=$1 AND school_id=$2
  `, [cId, schoolId]);

  res.json({ success: true });
});

// -------------------------------------------------------
// SUPERADMIN – Schulen, Admins, Status, Reset
// -------------------------------------------------------

// Schulen-Liste
app.get("/api/superadmin/schools", isSuperadmin, async (_req, res) => {
  const r = await pool.query(
    "SELECT id,name,slug FROM schools ORDER BY name ASC"
  );
  res.json(r.rows);
});

// Schule anlegen
app.post("/api/superadmin/schools", isSuperadmin, async (req, res) => {
  const { name, slug } = req.body;
  if (!name || !slug) return res.json({ success: false });

  const ins = await pool.query(
    `
    INSERT INTO schools (name,slug)
    VALUES ($1,$2)
    ON CONFLICT (slug) DO NOTHING
    RETURNING id
  `,
    [name, slug]
  );

  if (ins.rows.length) {
    const newId = ins.rows[0].id;
    await seedSchoolDefaults(newId);
  }

  res.json({ success: true });
});

// Schule löschen (nur Eintrag, keine Kaskade)
app.delete("/api/superadmin/schools/:id", isSuperadmin, async (req, res) => {
  try {
    await pool.query("DELETE FROM schools WHERE id=$1", [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error("Error deleting school", err);
    res
      .status(500)
      .json({ success: false, message: "Fehler beim Löschen der Schule" });
  }
});

// Admin-Liste
app.get("/api/superadmin/admins", isSuperadmin, async (_req, res) => {
  const r = await pool.query(
    `
    SELECT u.id,u.name,u.password,s.slug,s.name AS school_name
    FROM users u
    JOIN schools s ON u.school_id = s.id
    WHERE u.role='admin'
    ORDER BY s.name, u.name
  `
  );
  res.json(r.rows);
});

// Admin anlegen – ohne First-Login-Zwang
app.post("/api/superadmin/admins", isSuperadmin, async (req, res) => {
  const { name, slug } = req.body;
  if (!name || !slug) return res.json({ success: false });

  const s = await pool.query("SELECT id FROM schools WHERE slug=$1", [slug]);
  if (!s.rows.length) {
    return res.json({ success: false, message: "Schule nicht gefunden" });
  }
  const schoolId = s.rows[0].id;

  const tempPassword = generateTempPassword();

  await pool.query(
    `
    INSERT INTO users (name,password,role,school_id,first_login)
    VALUES ($1,$2,'admin',$3,FALSE)
    ON CONFLICT (name,school_id) DO NOTHING
  `,
    [name, tempPassword, schoolId]
  );

  res.json({ success: true });
});

// Admin-Passwort zurücksetzen
app.post(
  "/api/superadmin/admins/reset/:id",
  isSuperadmin,
  async (req, res) => {
    const newPassword = generateTempPassword();

    const r = await pool.query(
      "UPDATE users SET password=$1 WHERE id=$2 AND role='admin' RETURNING id",
      [newPassword, req.params.id]
    );

    if (!r.rows.length) {
      return res.json({ success: false, message: "Admin nicht gefunden" });
    }

    res.json({ success: true, password: newPassword });
  }
);

// Admin löschen
app.delete(
  "/api/superadmin/admins/:id",
  isSuperadmin,
  async (req, res) => {
    try {
      await pool.query("DELETE FROM users WHERE id=$1 AND role='admin'", [
        req.params.id
      ]);
      res.json({ success: true });
    } catch (err) {
      console.error("Error deleting admin", err);
      res.status(500).json({
        success: false,
        message: "Fehler beim Löschen des Admins"
      });
    }
  }
);

// Systemstatus pro Schule
app.get("/api/superadmin/system-status", isSuperadmin, async (_req, res) => {
  const r = await pool.query(`
    SELECT
      s.id,
      s.name,
      s.slug,
      COUNT(*) FILTER (WHERE u.role='superadmin') AS superadmins,
      COUNT(*) FILTER (WHERE u.role='admin') AS admins,
      COUNT(*) FILTER (WHERE u.role='student') AS students,
      (SELECT COUNT(*) FROM classes c WHERE c.school_id = s.id) AS classes,
      (SELECT COUNT(*) FROM missions m WHERE m.school_id = s.id) AS missions,
      (SELECT COUNT(*) FROM bonuscards b WHERE b.school_id = s.id) AS bonuscards,
      (SELECT COUNT(*) FROM characters ch WHERE ch.school_id = s.id) AS characters,
      (SELECT COUNT(*) FROM levels lv WHERE lv.school_id = s.id) AS levels,
      (SELECT COUNT(*) FROM student_uploads su WHERE su.school_id = s.id) AS uploads,
      (SELECT COUNT(*) FROM xp_transactions xt WHERE xt.school_id = s.id) AS xp_entries
    FROM schools s
    LEFT JOIN users u ON u.school_id = s.id
    GROUP BY s.id,s.name,s.slug
    ORDER BY s.name;
  `);

  res.json(
    r.rows.map(row => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      superadmins: Number(row.superadmins),
      admins: Number(row.admins),
      students: Number(row.students),
      classes: Number(row.classes),
      missions: Number(row.missions),
      bonuscards: Number(row.bonuscards),
      characters: Number(row.characters),
      levels: Number(row.levels),
      uploads: Number(row.uploads),
      xp_entries: Number(row.xp_entries)
    }))
  );
});

// Reset einer Schule (Daten leeren, Admins/Superadmin bleiben)
app.post("/api/superadmin/reset-school", isSuperadmin, async (req, res) => {
  const { schoolId } = req.body;
  const id = Number(schoolId);
  if (!id) return res.json({ success: false, message: "schoolId fehlt" });

  try {
    // Referenzen entfernen
    await pool.query(
      "UPDATE users SET level_id=NULL, character_id=NULL WHERE school_id=$1",
      [id]
    );

    await pool.query("DELETE FROM xp_transactions WHERE school_id=$1", [id]);
    await pool.query("DELETE FROM student_uploads WHERE school_id=$1", [id]);

    await pool.query(
      "DELETE FROM users WHERE school_id=$1 AND role='student'",
      [id]
    );

    await pool.query("DELETE FROM classes WHERE school_id=$1", [id]);
    await pool.query("DELETE FROM missions WHERE school_id=$1", [id]);
    await pool.query("DELETE FROM bonuscards WHERE school_id=$1", [id]);
    await pool.query("DELETE FROM characters WHERE school_id=$1", [id]);
    await pool.query("DELETE FROM levels WHERE school_id=$1", [id]);
    await pool.query("DELETE FROM class_rewards WHERE school_id=$1", [id]);
    await pool.query("DELETE FROM class_challenges WHERE school_id=$1", [id]);
    await pool.query("DELETE FROM class_reward_rounds WHERE school_id=$1", [id]);

    // Default-Daten nach Reset wieder setzen
    await seedSchoolDefaults(id);

    res.json({ success: true });
  } catch (err) {
    console.error("Error resetting school", err);
    res.status(500).json({
      success: false,
      message: "Fehler beim Zurücksetzen der Schule"
    });
  }
});
console.log("🚨 MARKER A2 – Upload-Endpunkte wurden geladen");


// -------------------------------------------------------
// ADMIN – Uploads eines Schülers abrufen
// -------------------------------------------------------
app.get("/api/admin/student-uploads", isAdmin, async (req, res) => {
  const studentId = Number(req.query.studentId);
  const schoolId = req.session.user.school_id;
  if (!studentId) return res.json({ success: false, message: "studentId fehlt" });
  const r = await pool.query(
    `
    SELECT su.*, m.name AS mission_name
    FROM student_uploads su
    LEFT JOIN missions m ON m.id = su.mission_id
    WHERE su.student_id=$1 AND su.school_id=$2
    ORDER BY su.created_at DESC
    `,
    [studentId, schoolId]
  );
  res.json({ success: true, uploads: r.rows });
});

// -------------------------------------------------------
// ADMIN – Einzelnen Upload löschen
// -------------------------------------------------------
app.delete("/api/admin/student-uploads/:id", isAdmin, async (req, res) => {
  const uploadId = Number(req.params.id);
  const schoolId = req.session.user.school_id;
  try {
    const r = await pool.query(
      `
      SELECT image_url
      FROM student_uploads
      WHERE id=$1 AND school_id=$2
      `,
      [uploadId, schoolId]
    );
    if (!r.rows.length) return res.json({ success: false, message: "Upload nicht gefunden" });

    const prefix = (process.env.R2_PUBLIC_URL || "") + "/";
    const key = r.rows[0].image_url.replace(prefix, "");

    try {
      await r2.send(new DeleteObjectCommand({
        Bucket: process.env.R2_BUCKET,
        Key: key
      }));
    } catch (err) { console.error("Fehler beim Löschen in R2:", err); }

    await pool.query(
      "DELETE FROM student_uploads WHERE id=$1 AND school_id=$2",
      [uploadId, schoolId]
    );

    res.json({ success: true });
  } catch (err) {
    console.error("Fehler beim Löschen eines Uploads:", err);
    res.json({ success: false, message: "Serverfehler" });
  }
});


// -------------------------------------------------------
// STATIC FRONTEND ROUTES
// -------------------------------------------------------
app.get("/login", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

app.get("/first-login", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "first-login.html"));
});

app.get("/admin", isAdmin, (_req, res) => {
  res.redirect(302, "/teacher/dashboard");
});

const teacherSpaPaths = [
  "/teacher/dashboard",
  "/teacher/timetable",
  "/teacher/week",
  "/teacher/competencies",
  "/teacher/levelchecks",
  "/teacher/levelstatus",
  "/teacher/lesson-goals"
];

for (const route of teacherSpaPaths) {
  app.get(route, isAdmin, (_req, res) => {
    res.sendFile(path.join(__dirname, "public", "admin.html"));
  });
}

app.get("/student", isStudent, (_req, res) => {
  res.redirect(302, "/student/today");
});

const studentSpaPaths = [
  "/student/today",
  "/student/plan",
  "/student/check",
  "/student/reflect",
  "/student/week",
  "/student/levelplan",
  "/student/zielsetzung",
  "/student/levelcheck",
  "/student/competencies",
  "/student/status",
  "/student/missionen",
  "/student/belohnungen",
  "/student/charakter",
  "/student/xp"
];

for (const route of studentSpaPaths) {
  app.get(route, isStudent, (_req, res) => {
    res.sendFile(path.join(__dirname, "public", "student.html"));
  });
}

app.get("/superadmin", isSuperadmin, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "superadmin.html"));
});

// Optionale Seite für Charakterauswahl
app.get("/character-select", isStudent, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "character-select.html"));
});

// -------------------------------------------------------
// START SERVER
// -------------------------------------------------------
app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "streets-of-logic" });
});

const PORT = process.env.PORT || 8080;

async function boot() {
  try {
    await migrate();
  } catch (err) {
    console.error("❌ Migration fehlgeschlagen:", err);
    console.error("Server startet trotzdem – bitte Migration prüfen.");
  }

  app.listen(PORT, () => {
    console.log(
      `🚀 Server läuft auf Port ${PORT} (MULTI-SCHOOL + SUPERADMIN + Klassenbelohnungen)`
    );
  });
}

boot();
