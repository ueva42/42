/**
 * Lehrer Levelcheck-Matrix: Klasse × Unterthemen eines Levelchecks.
 * Reine Ableitung aus beobachtbaren Daten (Levelplan-Marken, Übungs-%, Logbuch,
 * Zwischencheck, Reflexion, Lehrer-Bewertung). Keine Rankings, keine Diagnosen.
 */
import { isNegativeCheckValue, isGoalMissedReflection } from "./teacher-insights.js";

export const MATRIX_TIERS = ["rookie", "operator", "street_legend"];
export const MATRIX_TIER_LABELS = {
  rookie: "Rookie",
  operator: "Operator",
  street_legend: "Street Legend"
};

export const MATRIX_PASS_PERCENT = 70;

/** Ab so vielen Arbeitstagen am selben Unterthema (ohne Abschluss) gilt „hängt“. */
export const MATRIX_STUCK_DAYS = 3;

export const MATRIX_STATUS_LABELS = {
  done: "abgeschlossen",
  today: "heute aktiv",
  working: "in Arbeit",
  open: "offen"
};

export const MATRIX_HELP_LABELS = {
  check_negative: "Zwischencheck: hängt / unsicher",
  reflection_missed: "Reflexion: Ziel nicht erreicht",
  stuck_days: `Seit ${MATRIX_STUCK_DAYS}+ Tagen am selben Unterthema`,
  level_down: "Level zurückgestuft",
  eval_failed: "Levelcheck nicht bestanden",
  practice_low: "Übungs-Check unter 70 %"
};

function tierRank(tier) {
  const i = MATRIX_TIERS.indexOf(String(tier || "").toLowerCase());
  return i < 0 ? -1 : i;
}

function tierLabel(tier) {
  return MATRIX_TIER_LABELS[tier] || null;
}

function isoDay(value) {
  return String(value || "").slice(0, 10);
}

/**
 * Zelle für (Schüler:in, Unterthema).
 * @param {object} input
 * @param {object[]} input.marks            level_check_marks rows {tier,status}
 * @param {number|null} input.practicePercent
 * @param {object[]} input.entries          log_entries rows (14-Tage-Fenster) mit what_goal_id = goal
 * @param {object[]} input.checks           log_checks rows für diese entries
 * @param {object[]} input.reflections      log_reflections rows für diese entries
 * @param {object|null} input.evaluation    {status, percent} der Lehrkraft (Checkpoint)
 * @param {string} input.date               ISO-Tag (Heute)
 */
export function buildMatrixCell(input) {
  const {
    marks = [],
    practicePercent = null,
    entries = [],
    checks = [],
    reflections = [],
    evaluation = null,
    date
  } = input;

  const help = [];

  // --- Level (aus Marken + Logbuch) ---
  let reachedTier = null; // höchste Stufe mit Status "sicher"
  let workingTier = null; // höchste Stufe mit Marke (in Arbeit oder sicher)
  for (const m of marks) {
    const t = String(m.tier || "").toLowerCase();
    if (tierRank(t) < 0) continue;
    const status = String(m.status || "sicher").toLowerCase();
    if (tierRank(t) > tierRank(workingTier)) workingTier = t;
    if (status === "sicher" && tierRank(t) > tierRank(reachedTier)) reachedTier = t;
  }

  const sortedEntries = [...entries].sort((a, b) => {
    const d = isoDay(a.date).localeCompare(isoDay(b.date));
    if (d !== 0) return d;
    return String(a.created_at || "").localeCompare(String(b.created_at || ""));
  });
  const todayEntries = sortedEntries.filter((e) => isoDay(e.date) === isoDay(date));
  const latestEntry = sortedEntries[sortedEntries.length - 1] || null;

  let currentTier = null;
  const todayLevel = todayEntries.map((e) => e.selected_level).filter(Boolean).pop();
  if (todayLevel && tierRank(todayLevel) >= 0) currentTier = String(todayLevel).toLowerCase();
  else if (latestEntry?.selected_level && tierRank(latestEntry.selected_level) >= 0) {
    currentTier = String(latestEntry.selected_level).toLowerCase();
  } else if (workingTier) currentTier = workingTier;

  // Level-Rückstufung: späterer Plan auf niedrigerem Level als ein früherer
  let maxSeen = -1;
  let levelDown = false;
  for (const e of sortedEntries) {
    const r = tierRank(e.selected_level);
    if (r < 0) continue;
    if (maxSeen >= 0 && r < maxSeen) levelDown = true;
    if (r > maxSeen) maxSeen = r;
  }

  // --- Abschluss (Lehrer-Bewertung bevorzugt, sonst Übungs-Check ≥ 70 %) ---
  const evalStatus = evaluation?.status || null;
  const evalPercent =
    evaluation && Number.isInteger(Number(evaluation.percent)) && evaluation.percent != null
      ? Number(evaluation.percent)
      : null;
  const practice =
    practicePercent != null && Number.isInteger(Number(practicePercent))
      ? Number(practicePercent)
      : null;

  let done = false;
  let resultPercent = null;
  let resultSource = null;
  if (evalStatus === "passed") {
    done = true;
    resultPercent = evalPercent;
    resultSource = "teacher";
  } else if (evalStatus === "failed") {
    help.push("eval_failed");
    resultPercent = evalPercent;
    resultSource = "teacher";
  } else if (practice != null) {
    resultPercent = practice;
    resultSource = "student";
    if (practice >= MATRIX_PASS_PERCENT) done = true;
    else help.push("practice_low");
  }

  // --- Hilfe-Signale aus Logbuch (nur solange nicht abgeschlossen) ---
  const checkNegative = checks.some(
    (c) =>
      isNegativeCheckValue(c.on_track) ||
      isNegativeCheckValue(c.understands) ||
      isNegativeCheckValue(c.progress)
  );
  if (checkNegative) help.push("check_negative");
  if (reflections.some((r) => isGoalMissedReflection(r))) help.push("reflection_missed");

  const workDays = new Set(sortedEntries.map((e) => isoDay(e.date)).filter(Boolean));
  if (!done && workDays.size >= MATRIX_STUCK_DAYS) help.push("stuck_days");
  if (!done && levelDown) help.push("level_down");

  const started = Boolean(marks.length || sortedEntries.length || practice != null || evaluation);
  const today = todayEntries.length > 0;

  let status = "open";
  if (done) status = "done";
  else if (today) status = "today";
  else if (started) status = "working";

  const helpIds = done ? help.filter((h) => h === "eval_failed") : [...new Set(help)];

  return {
    status,
    statusLabel: MATRIX_STATUS_LABELS[status],
    tier: currentTier,
    tierLabel: tierLabel(currentTier),
    reachedTier,
    reachedTierLabel: tierLabel(reachedTier),
    today,
    done,
    resultPercent,
    resultSource,
    help: helpIds.length > 0,
    helpReasons: helpIds.map((id) => ({ id, label: MATRIX_HELP_LABELS[id] || id })),
    workDays: workDays.size,
    lastDate: latestEntry ? isoDay(latestEntry.date) : null
  };
}

/** Ordnet Checkpoint-Bewertungen den Unterthemen zu (verlinkte Ziele, sonst alle). */
export function mapEvaluationsToGoals({ goals, checkpoints, evaluations }) {
  const goalIds = goals.map((g) => String(g.id));
  const byStudentGoal = {};
  const sortedCps = [...(checkpoints || [])].sort((a, b) =>
    String(b.checkpointDate || "").localeCompare(String(a.checkpointDate || ""))
  );
  for (const ev of evaluations || []) {
    const cp = sortedCps.find((c) => String(c.id) === String(ev.checkpoint_id));
    if (!cp) continue;
    const linked = (cp.linkedSubtopicIds || []).map(String).filter((id) => goalIds.includes(id));
    const targets = linked.length ? linked : goalIds;
    const sid = String(ev.user_id);
    if (!byStudentGoal[sid]) byStudentGoal[sid] = {};
    for (const gid of targets) {
      const prev = byStudentGoal[sid][gid];
      // Neuester Checkpoint gewinnt; „bewertet“ schlägt „nicht bewertet“
      const prevRank = prev ? (prev.status === "not_evaluated" ? 0 : 1) : -1;
      const curRank = ev.status === "not_evaluated" && ev.percent == null ? 0 : 1;
      if (!prev || curRank > prevRank || (curRank === prevRank && prev._date < cp.checkpointDate)) {
        byStudentGoal[sid][gid] = {
          status: ev.status || "not_evaluated",
          percent: ev.percent == null ? null : Number(ev.percent),
          checkpointId: String(cp.id),
          _date: String(cp.checkpointDate || "")
        };
      }
    }
  }
  return byStudentGoal;
}

/**
 * Komplette Matrix.
 * @param {object} input
 * @param {{id:number,name:string}[]} input.students
 * @param {{id:string,text:string,sortOrder:number}[]} input.goals
 * @param {object[]} input.marks           level_check_marks rows (user_id, goal_id, tier, status)
 * @param {object[]} input.progress        level_check_goal_progress rows (user_id, goal_id, practice_percent)
 * @param {object[]} input.entries         log_entries rows (user_id, what_goal_id, date, selected_level, id)
 * @param {object[]} input.checks          log_checks rows (log_entry_id, …)
 * @param {object[]} input.reflections     log_reflections rows (log_entry_id, …)
 * @param {object[]} input.topicEntriesToday  log_entries heute mit checkpoint_id des Levelchecks (ohne Unterthema)
 * @param {object[]} input.checkpoints     Checkpoints des Levelchecks
 * @param {object[]} input.evaluations     level_check_checkpoint_evaluations rows
 * @param {string} input.date
 */
export function buildLevelcheckMatrix(input) {
  const {
    students = [],
    goals = [],
    marks = [],
    progress = [],
    entries = [],
    checks = [],
    reflections = [],
    topicEntriesToday = [],
    checkpoints = [],
    evaluations = [],
    date
  } = input;

  const key = (sid, gid) => `${sid}|${gid}`;
  const marksBy = {};
  for (const m of marks) {
    const k = key(m.user_id, m.goal_id);
    (marksBy[k] ||= []).push(m);
  }
  const progressBy = {};
  for (const p of progress) progressBy[key(p.user_id, p.goal_id)] = p.practice_percent;

  const entriesBy = {};
  const entryOwner = {};
  for (const e of entries) {
    if (!e.what_goal_id) continue;
    const k = key(e.user_id, e.what_goal_id);
    (entriesBy[k] ||= []).push(e);
    entryOwner[String(e.id)] = k;
  }
  const checksBy = {};
  for (const c of checks) {
    const k = entryOwner[String(c.log_entry_id)];
    if (k) (checksBy[k] ||= []).push(c);
  }
  const reflBy = {};
  for (const r of reflections) {
    const k = entryOwner[String(r.log_entry_id)];
    if (k) (reflBy[k] ||= []).push(r);
  }
  const topicTodayBy = new Set(topicEntriesToday.map((e) => String(e.user_id)));

  const evalByStudentGoal = mapEvaluationsToGoals({ goals, checkpoints, evaluations });

  const summary = {};
  for (const g of goals) {
    summary[String(g.id)] = { working: 0, done: 0, open: 0, help: 0, today: 0 };
  }

  const rows = students.map((s) => {
    const cells = {};
    const flags = { help: false, today: false, open: true, done: 0 };
    for (const g of goals) {
      const gid = String(g.id);
      const k = key(s.id, gid);
      const cell = buildMatrixCell({
        marks: marksBy[k] || [],
        practicePercent: progressBy[k] ?? null,
        entries: entriesBy[k] || [],
        checks: checksBy[k] || [],
        reflections: reflBy[k] || [],
        evaluation: evalByStudentGoal[String(s.id)]?.[gid] || null,
        date
      });
      cells[gid] = cell;
      const sum = summary[gid];
      if (cell.status === "done") sum.done += 1;
      else if (cell.status === "open") sum.open += 1;
      else sum.working += 1;
      if (cell.today) sum.today += 1;
      if (cell.help) sum.help += 1;
      if (cell.help) flags.help = true;
      if (cell.today) flags.today = true;
      if (cell.status !== "open") flags.open = false;
      if (cell.done) flags.done += 1;
    }
    const topicToday = topicTodayBy.has(String(s.id));
    if (topicToday) flags.today = true;
    return {
      id: s.id,
      name: s.name,
      cells,
      topicToday,
      flags
    };
  });

  return {
    goals: goals.map((g) => ({
      id: String(g.id),
      text: g.text,
      sortOrder: g.sortOrder ?? 0,
      summary: summary[String(g.id)]
    })),
    students: rows,
    totals: {
      studentCount: students.length,
      helpCount: rows.filter((r) => r.flags.help).length,
      todayCount: rows.filter((r) => r.flags.today).length,
      openCount: rows.filter((r) => r.flags.open).length
    },
    legend: {
      statuses: MATRIX_STATUS_LABELS,
      help: MATRIX_HELP_LABELS,
      tiers: MATRIX_TIERS.map((id) => ({ id, label: MATRIX_TIER_LABELS[id] })),
      passPercent: MATRIX_PASS_PERCENT,
      stuckDays: MATRIX_STUCK_DAYS
    }
  };
}
