/**
 * Themen-Cockpit (Lehrer Heute): Klasse × Unterthemen der gewählten Klassenarbeit.
 * Position/Zuordnung nur über reales Tagesziel (what_goal_id) – keine Live-Erfindung.
 * Hilfe nur bei explizitem Zwischencheck-Hilfe-Signal – niedrige Levelcheck-% ≠ Hilfe.
 * Levelcheck-% ≠ Tagesziel-Fortschritt ≠ Notenprognose.
 */
import { isNegativeCheckValue, isGoalMissedReflection } from "./teacher-insights.js";

export const HQ_TIERS = ["rookie", "operator", "street_legend"];
export const HQ_TIER_LABELS = {
  rookie: "Rookie",
  operator: "Operator",
  street_legend: "Street Legend"
};
export const HQ_TIER_BADGE = {
  rookie: "R",
  operator: "O",
  street_legend: "S"
};

export const HQ_UNASSIGNED_TOPIC_ID = "unassigned";

/** Fallback-Anteile, falls Server keine getGradeRequirements übergibt. */
const FALLBACK_GRADE_RULES = {
  "1": { rookie: 1, operator: 1, street_legend: 0.8 },
  "1.5": { rookie: 1, operator: 1, street_legend: 0.65 },
  "2": { rookie: 1, operator: 1, street_legend: 0.5 },
  "2.5": { rookie: 1, operator: 1, street_legend: 0.25 },
  "3": { rookie: 1, operator: 0.8, street_legend: 0 },
  "3.5": { rookie: 1, operator: 0.5, street_legend: 0 },
  "4": { rookie: 0.8, operator: 0, street_legend: 0 },
  "4.5": { rookie: 0.6, operator: 0, street_legend: 0 },
  "5": { rookie: 0.4, operator: 0, street_legend: 0 },
  "5.5": { rookie: 0.2, operator: 0, street_legend: 0 },
  "6": { rookie: 0, operator: 0, street_legend: 0 }
};

export const HQ_STATUS = {
  no_goal: {
    id: "no_goal",
    icon: "○",
    label: "Kein Tagesziel",
    shortLabel: "Kein Ziel"
  },
  in_progress: {
    id: "in_progress",
    icon: "◐",
    label: "Tagesziel vorhanden / in Bearbeitung",
    shortLabel: "In Bearbeitung"
  },
  help_open: {
    id: "help_open",
    icon: "!",
    label: "Hilfe angefragt",
    shortLabel: "Hilfe"
  },
  taken_over: {
    id: "taken_over",
    icon: "◆",
    label: "Begleitung durch Lehrkraft übernommen",
    shortLabel: "Begleitung"
  },
  goal_reached: {
    id: "goal_reached",
    icon: "✓",
    label: "Tagesziel erreicht",
    shortLabel: "Erreicht"
  }
};

function tierRank(tier) {
  const i = HQ_TIERS.indexOf(String(tier || "").toLowerCase());
  return i < 0 ? -1 : i;
}

function tierLabel(tier) {
  return HQ_TIER_LABELS[String(tier || "").toLowerCase()] || null;
}

function tierBadge(tier) {
  return HQ_TIER_BADGE[String(tier || "").toLowerCase()] || null;
}

function isoDay(value) {
  return String(value || "").slice(0, 10);
}

function asIsoTimestamp(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function waitMinutes(fromIso, now = new Date()) {
  if (!fromIso) return null;
  const start = new Date(fromIso).getTime();
  if (Number.isNaN(start)) return null;
  return Math.max(0, Math.floor((now.getTime() - start) / 60000));
}

function formatWaitLabel(minutes) {
  if (minutes == null) return null;
  if (minutes < 1) return "gerade eben";
  if (minutes < 60) return `${minutes} Min.`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} Std. ${m} Min.` : `${h} Std.`;
}

function sanitizeText(raw, max = 400) {
  if (typeof raw !== "string") return null;
  const t = raw.trim().replace(/[<>]/g, "");
  if (!t) return null;
  return t.slice(0, max);
}

function normalizeLevelStatus(raw) {
  const key = String(raw || "offen")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
  if (key === "in_arbeit" || key === "inarbeit") return "in_arbeit";
  if (key === "sicher") return "sicher";
  return "offen";
}

function normalizeTargetGradeKey(raw) {
  if (raw == null || raw === "") return null;
  let key = String(raw).trim().replace(",", ".").replace("−", "-");
  if (FALLBACK_GRADE_RULES[key]) return key;
  const num = Number(key);
  if (!Number.isFinite(num) || num < 1 || num > 6) return null;
  const halfStep = Math.round(num * 2) / 2;
  if (Math.abs(halfStep - num) > 0.001) return null;
  const normalized = Number.isInteger(halfStep) ? String(halfStep) : halfStep.toFixed(1);
  return FALLBACK_GRADE_RULES[normalized] ? normalized : null;
}

function defaultGetGradeRequirements(targetGrade) {
  const key = normalizeTargetGradeKey(targetGrade);
  if (!key || !FALLBACK_GRADE_RULES[key]) return null;
  const rules = FALLBACK_GRADE_RULES[key];
  return {
    rookie: Number(rules.rookie) || 0,
    operator: Number(rules.operator) || 0,
    street_legend: Number(rules.street_legend) || 0
  };
}

function isGoalReachedReflection(reflection) {
  if (!reflection) return false;
  if (isGoalMissedReflection(reflection)) return false;
  const achieved = String(reflection.goal_achieved || "").trim().toLowerCase();
  const answer = String(reflection.goal_reached_answer || "").trim().toLowerCase();
  if (achieved === "ja" || achieved.startsWith("ja")) return true;
  if (answer.startsWith("ja") || answer.includes("geschafft")) return true;
  return false;
}

/** Explizites Hilfe-Signal aus Zwischencheck – nicht aus Levelcheck-%. */
export function extractHelpFromCheck(check) {
  if (!check) return null;
  const stuck =
    isNegativeCheckValue(check.on_track) ||
    isNegativeCheckValue(check.understands) ||
    isNegativeCheckValue(check.progress) ||
    isNegativeCheckValue(check.next_step_answer);
  if (!stuck) return null;
  const concern =
    sanitizeText(check.change_note) ||
    sanitizeText(check.next_step_answer) ||
    sanitizeText(check.selected_strategy_problem) ||
    sanitizeText(check.selected_strategy_next_step) ||
    "Hilfe im Zwischencheck markiert";
  return {
    concern,
    requestedAt: asIsoTimestamp(check.created_at) || asIsoTimestamp(check.updated_at)
  };
}

function highestTierFromMarks(marks) {
  let reached = null;
  let working = null;
  for (const m of marks || []) {
    const t = String(m.tier || "").toLowerCase();
    if (tierRank(t) < 0) continue;
    const status = normalizeLevelStatus(m.status || "sicher");
    if (tierRank(t) > tierRank(working)) working = t;
    if (status === "sicher" && tierRank(t) > tierRank(reached)) reached = t;
  }
  return { reachedTier: reached, workingTier: working };
}

function pickLatestEvaluation(evaluations) {
  if (!evaluations?.length) return null;
  const sorted = [...evaluations].sort((a, b) => {
    const da = String(a.updated_at || a.checkpointDate || "").localeCompare(
      String(b.updated_at || b.checkpointDate || "")
    );
    return -da;
  });
  for (const ev of sorted) {
    if (ev.status === "not_evaluated" && ev.percent == null) continue;
    return {
      percent: ev.percent == null ? null : Number(ev.percent),
      status: ev.status || null,
      date: isoDay(ev.checkpointDate || ev.updated_at),
      checkpointId: ev.checkpoint_id ? String(ev.checkpoint_id) : null
    };
  }
  return null;
}

function pickLatestMarkForGoal(marks, goalId) {
  const list = (marks || []).filter((m) => String(m.goal_id) === String(goalId));
  if (!list.length) return null;
  list.sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")));
  const top = list[0];
  const { reachedTier, workingTier } = highestTierFromMarks(list);
  return {
    level: workingTier || reachedTier || String(top.tier || "").toLowerCase() || null,
    levelLabel: tierLabel(workingTier || reachedTier || top.tier),
    date: isoDay(top.updated_at),
    status: normalizeLevelStatus(top.status)
  };
}

/**
 * Erledigt = Levelplan-Status „sicher“ auf dem Mindestpfad zur Zielnote.
 * Geplant = empfohlene Level-Anzahl aus Zielnote × Unterthemen (Domain).
 * Ohne Zielnote oder ohne Unterthemen: kein Ring (nicht aus Zielnote allein erfinden).
 */
export function computeKlassenarbeitProgress(goals, marks, targetGradeKey, getGradeRequirements) {
  const totalGoals = Array.isArray(goals) ? goals.length : 0;
  const gradeKey = normalizeTargetGradeKey(targetGradeKey);
  const resolve = getGradeRequirements || defaultGetGradeRequirements;
  if (!totalGoals || !gradeKey) {
    return { erledigt: null, geplant: null, empty: true, hasZielnote: Boolean(gradeKey) };
  }
  const rules = resolve(gradeKey);
  if (!rules) {
    return { erledigt: null, geplant: null, empty: true, hasZielnote: true };
  }

  const orderedGoals = [...goals].sort(
    (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || String(a.id).localeCompare(String(b.id))
  );
  const markMap = new Map();
  for (const m of marks || []) {
    markMap.set(`${String(m.goal_id)}::${String(m.tier).toLowerCase()}`, m);
  }

  let geplant = 0;
  let erledigt = 0;
  for (const tier of HQ_TIERS) {
    const requiredCount = Math.ceil(totalGoals * (Number(rules[tier]) || 0));
    if (requiredCount <= 0) continue;
    geplant += requiredCount;
    for (const goal of orderedGoals.slice(0, requiredCount)) {
      const mark = markMap.get(`${String(goal.id)}::${tier}`);
      if (mark && normalizeLevelStatus(mark.status || "sicher") === "sicher") {
        erledigt += 1;
      }
    }
  }

  if (geplant <= 0) {
    return { erledigt: null, geplant: null, empty: true, hasZielnote: true };
  }
  return { erledigt, geplant, empty: false, hasZielnote: true };
}

/** Geplante Levels für ein Unterthema: Tiers auf dem Mindestpfad + Mark-Status. */
function plannedLevelsForTopic(goal, goals, marks, targetGradeKey, getGradeRequirements) {
  const totalGoals = goals.length;
  const gradeKey = normalizeTargetGradeKey(targetGradeKey);
  const resolve = getGradeRequirements || defaultGetGradeRequirements;
  const rules = gradeKey ? resolve(gradeKey) : null;
  const orderedGoals = [...goals].sort(
    (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || String(a.id).localeCompare(String(b.id))
  );
  const goalIndex = orderedGoals.findIndex((g) => String(g.id) === String(goal.id));
  const markMap = new Map();
  for (const m of marks || []) {
    if (String(m.goal_id) !== String(goal.id)) continue;
    markMap.set(String(m.tier).toLowerCase(), m);
  }

  return HQ_TIERS.map((tier) => {
    const requiredCount = rules ? Math.ceil(totalGoals * (Number(rules[tier]) || 0)) : 0;
    const onPath = Boolean(rules && requiredCount > 0 && goalIndex >= 0 && goalIndex < requiredCount);
    const mark = markMap.get(tier);
    const status = mark ? normalizeLevelStatus(mark.status || "sicher") : null;
    return {
      tier,
      badge: HQ_TIER_BADGE[tier],
      label: HQ_TIER_LABELS[tier],
      onPath,
      status,
      erledigt: status === "sicher"
    };
  }).filter((row) => row.onPath || row.status);
}

/**
 * Selbsteinschätzung nur aus explizitem confidence_before (Plan).
 * Nicht aus Levelcheck-%, Zielnote oder Dauer ableiten.
 */
function mapConfidenceBucket(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  if (n <= 2) return "unsicher";
  if (n === 3) return "teilweise";
  if (n >= 4) return "sicher";
  return null;
}

export function resolveStudentHqStatus({
  hasTagesziel,
  goalReached,
  helpFromCheck,
  coaching
}) {
  const closedAt = asIsoTimestamp(coaching?.closed_at);
  const helpRequestedAt = asIsoTimestamp(
    helpFromCheck?.requestedAt || coaching?.help_requested_at
  );
  const reopened =
    Boolean(helpFromCheck) && closedAt && helpRequestedAt && helpRequestedAt > closedAt;
  const helpClosed = coaching?.help_status === "closed" && !reopened;
  const hasOpenHelpSignal =
    Boolean(helpFromCheck) ||
    coaching?.help_status === "open" ||
    coaching?.help_status === "taken_over";

  if (coaching?.help_status === "taken_over" && !helpClosed && hasOpenHelpSignal) {
    return {
      ...HQ_STATUS.taken_over,
      helpActive: true,
      waitMinutes: waitMinutes(helpRequestedAt || asIsoTimestamp(coaching.taken_over_at))
    };
  }

  if ((helpFromCheck || coaching?.help_status === "open") && !helpClosed) {
    return {
      ...HQ_STATUS.help_open,
      helpActive: true,
      waitMinutes: waitMinutes(helpRequestedAt)
    };
  }

  if (goalReached) {
    return { ...HQ_STATUS.goal_reached, helpActive: false, waitMinutes: null };
  }
  if (hasTagesziel) {
    return { ...HQ_STATUS.in_progress, helpActive: false, waitMinutes: null };
  }
  return { ...HQ_STATUS.no_goal, helpActive: false, waitMinutes: null };
}

/**
 * Baut die Themen-Cockpit-Ansicht für die Lehrer-Heute-Seite.
 */
export function buildThemenCockpit(input) {
  const {
    students = [],
    goals = [],
    todayEntries = [],
    pastEntries = [],
    checks = [],
    reflections = [],
    marks = [],
    targets = [],
    evaluations = [],
    coachingStates = [],
    date,
    now = new Date(),
    getGradeRequirements = defaultGetGradeRequirements
  } = input;

  const goalById = new Map(goals.map((g) => [String(g.id), g]));
  const entriesByStudent = {};
  for (const e of todayEntries) {
    (entriesByStudent[e.user_id] ||= []).push(e);
  }
  const pastByStudent = {};
  for (const e of pastEntries) {
    const uid = e.user_id;
    if (pastByStudent[uid]) continue;
    pastByStudent[uid] = e;
  }
  const checkByEntry = {};
  for (const c of checks) checkByEntry[String(c.log_entry_id)] = c;
  const reflByEntry = {};
  for (const r of reflections) reflByEntry[String(r.log_entry_id)] = r;

  const marksByStudent = {};
  for (const m of marks) {
    (marksByStudent[m.user_id] ||= []).push(m);
  }
  const targetByStudent = {};
  for (const t of targets) targetByStudent[t.user_id] = t;

  const evalByStudent = {};
  for (const ev of evaluations) {
    (evalByStudent[ev.user_id] ||= []).push(ev);
  }
  const coachingByStudent = {};
  for (const c of coachingStates) coachingByStudent[c.student_id] = c;

  const topicBuckets = new Map();
  for (const g of goals) topicBuckets.set(String(g.id), []);
  const unmappedStudents = [];
  const noGoalStudents = [];

  const selfAssessment = {
    sicher: 0,
    teilweise: 0,
    unsicher: 0,
    keineAngabe: 0,
    hasExplicitData: false,
    note: null
  };

  const studentCards = students.map((s, index) => {
    const entries = (entriesByStudent[s.id] || []).slice().sort((a, b) => {
      const ta = String(a.timeslot || "");
      const tb = String(b.timeslot || "");
      if (ta !== tb) return ta.localeCompare(tb);
      return String(a.created_at || "").localeCompare(String(b.created_at || ""));
    });

    let primary =
      entries.find((e) => e.what_goal_id && goalById.has(String(e.what_goal_id))) ||
      entries[0] ||
      null;

    for (const e of entries) {
      const help = extractHelpFromCheck(checkByEntry[String(e.id)]);
      if (help) {
        primary = e;
        break;
      }
    }

    const primaryCheck = primary ? checkByEntry[String(primary.id)] : null;
    const primaryRefl = primary ? reflByEntry[String(primary.id)] : null;
    const helpFromCheck = extractHelpFromCheck(primaryCheck);
    const coaching = coachingByStudent[s.id] || null;
    const hasTagesziel = Boolean(primary);
    const goalReached = isGoalReachedReflection(primaryRefl);

    const mappedGoalId =
      primary?.what_goal_id && goalById.has(String(primary.what_goal_id))
        ? String(primary.what_goal_id)
        : null;
    const topicUnmapped = Boolean(hasTagesziel && !mappedGoalId);
    const stationGoal = mappedGoalId ? goalById.get(mappedGoalId) : null;

    const status = resolveStudentHqStatus({
      hasTagesziel,
      goalReached,
      helpFromCheck,
      coaching
    });
    if (status.helpActive && status.waitMinutes == null) {
      status.waitMinutes = waitMinutes(
        helpFromCheck?.requestedAt || coaching?.help_requested_at,
        now
      );
    }
    status.waitLabel = formatWaitLabel(status.waitMinutes);

    const studentMarks = marksByStudent[s.id] || [];
    const { reachedTier, workingTier } = highestTierFromMarks(
      mappedGoalId
        ? studentMarks.filter((m) => String(m.goal_id) === mappedGoalId)
        : studentMarks
    );
    const currentLevel =
      (primary?.selected_level && tierRank(primary.selected_level) >= 0
        ? String(primary.selected_level).toLowerCase()
        : null) ||
      workingTier ||
      reachedTier ||
      null;

    const target = targetByStudent[s.id] || null;
    const zielnote =
      normalizeTargetGradeKey(target?.target_grade_key) ||
      normalizeTargetGradeKey(target?.target_grade);
    const progress = computeKlassenarbeitProgress(
      goals,
      studentMarks,
      zielnote,
      getGradeRequirements
    );

    const lastEval = pickLatestEvaluation(evalByStudent[s.id] || []);
    const lastMarkForTopic = mappedGoalId
      ? pickLatestMarkForGoal(studentMarks, mappedGoalId)
      : null;

    const concern =
      sanitizeText(coaching?.help_concern) || helpFromCheck?.concern || null;

    const nextStepStored =
      sanitizeText(coaching?.next_step) ||
      sanitizeText(primaryRefl?.next_step) ||
      sanitizeText(primaryCheck?.next_step_answer) ||
      sanitizeText(target?.next_goal_text) ||
      null;

    const note = sanitizeText(coaching?.note) || null;

    const confidenceBucket = mapConfidenceBucket(primary?.confidence_before);
    if (hasTagesziel) {
      if (confidenceBucket) {
        selfAssessment.hasExplicitData = true;
        selfAssessment[confidenceBucket] += 1;
      } else {
        selfAssessment.keineAngabe += 1;
      }
    }

    const past = !hasTagesziel ? pastByStudent[s.id] || null : null;
    let pastStand = null;
    if (past) {
      const pastGoalId =
        past.what_goal_id && goalById.has(String(past.what_goal_id))
          ? String(past.what_goal_id)
          : null;
      pastStand = {
        date: isoDay(past.date),
        unterthema: pastGoalId ? goalById.get(pastGoalId)?.text || null : null,
        unterthemaId: pastGoalId,
        tagesziel: sanitizeText(past.what_goal_text || past.goal, 500),
        level: past.selected_level ? String(past.selected_level).toLowerCase() : null,
        levelLabel: tierLabel(past.selected_level),
        label: "Vergangener Stand (nicht heute)"
      };
    }

    const topicLevels = stationGoal
      ? plannedLevelsForTopic(stationGoal, goals, studentMarks, zielnote, getGradeRequirements)
      : [];

    const initials =
      String(s.name || "?")
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((p) => p[0]?.toUpperCase() || "")
        .join("") || "?";

    const card = {
      id: s.id,
      name: s.name,
      initials,
      avatarUrl: s.avatarUrl || null,
      topicId: mappedGoalId,
      topicName: stationGoal?.text || null,
      topicUnmapped,
      unmappedLabel: topicUnmapped
        ? "Tagesziel nicht diesem Levelcheck zuordenbar"
        : null,
      statusId: status.id,
      statusIcon: status.icon,
      statusLabel: status.label,
      statusShort: status.shortLabel,
      helpActive: Boolean(status.helpActive),
      waitMinutes: status.waitMinutes,
      waitLabel: status.waitLabel,
      tagesziel: sanitizeText(primary?.what_goal_text || primary?.goal, 500),
      unterthema: stationGoal?.text || null,
      unterthemaAssigned: Boolean(mappedGoalId),
      subject: primary?.subject || null,
      timeslot: primary?.timeslot || null,
      logEntryId: primary?.id ? String(primary.id) : null,
      goalId: mappedGoalId,
      currentLevel,
      currentLevelLabel: tierLabel(currentLevel),
      currentLevelBadge: tierBadge(currentLevel),
      plannedLevel: workingTier,
      plannedLevelLabel: tierLabel(workingTier),
      reachedLevel: reachedTier,
      reachedLevelLabel: tierLabel(reachedTier),
      topicLevels,
      progress,
      levelcheck: lastEval
        ? {
            percent: lastEval.percent,
            date: lastEval.date,
            status: lastEval.status,
            topic: stationGoal?.text || lastMarkForTopic?.levelLabel || null,
            levelLabel: lastMarkForTopic?.levelLabel || null,
            empty: lastEval.percent == null && !lastEval.status
          }
        : {
            percent: null,
            date: null,
            status: null,
            topic: lastMarkForTopic?.levelLabel || null,
            levelLabel: lastMarkForTopic?.levelLabel || null,
            empty: true
          },
      lastTopicLevelcheck: lastMarkForTopic,
      zielnote: zielnote || null,
      selbsteinschaetzung: confidenceBucket
        ? {
            bucket: confidenceBucket,
            value: Number(primary.confidence_before),
            label:
              confidenceBucket === "sicher"
                ? "Sicher"
                : confidenceBucket === "teilweise"
                  ? "Teilweise"
                  : "Unsicher"
          }
        : hasTagesziel
          ? { bucket: "keineAngabe", value: null, label: "Keine Angabe" }
          : null,
      pastStand,
      help: status.helpActive
        ? {
            concern,
            requestedAt: helpFromCheck?.requestedAt || asIsoTimestamp(coaching?.help_requested_at),
            waitLabel: status.waitLabel,
            takenOver: status.id === "taken_over",
            takenOverAt: asIsoTimestamp(coaching?.taken_over_at),
            takenOverByName: coaching?.taken_over_by_name || null
          }
        : null,
      coaching: {
        note,
        nextStep: nextStepStored,
        helpStatus: coaching?.help_status || (status.helpActive ? "open" : "none"),
        closedAt: asIsoTimestamp(coaching?.closed_at)
      },
      nextStepSuggestion:
        status.id === "goal_reached"
          ? nextStepStored || sanitizeText(target?.next_goal_text) || null
          : nextStepStored,
      sortIndex: index
    };

    if (mappedGoalId) topicBuckets.get(mappedGoalId).push(card);
    else if (topicUnmapped) unmappedStudents.push(card);
    else noGoalStudents.push(card);

    return card;
  });

  const topics = goals.map((g, i) => {
    const list = topicBuckets.get(String(g.id)) || [];
    list.sort((a, b) => String(a.name).localeCompare(String(b.name), "de"));
    return {
      id: String(g.id),
      name: g.text,
      sortOrder: g.sortOrder ?? i,
      kind: "unterthema",
      studentCount: list.length,
      helpCount: list.filter((s) => s.helpActive).length,
      students: list
    };
  });

  unmappedStudents.sort((a, b) => String(a.name).localeCompare(String(b.name), "de"));
  noGoalStudents.sort((a, b) => String(a.name).localeCompare(String(b.name), "de"));

  const helpQueue = studentCards
    .filter((s) => s.helpActive)
    .slice()
    .sort((a, b) => {
      const aTaken = a.help?.takenOver ? 1 : 0;
      const bTaken = b.help?.takenOver ? 1 : 0;
      if (aTaken !== bTaken) return aTaken - bTaken;
      const aw = a.waitMinutes == null ? -1 : a.waitMinutes;
      const bw = b.waitMinutes == null ? -1 : b.waitMinutes;
      if (aw !== bw) return bw - aw;
      return String(a.name).localeCompare(String(b.name), "de");
    })
    .map((s) => ({
      studentId: s.id,
      name: s.name,
      concern: s.help?.concern || null,
      waitLabel: s.help?.waitLabel || null,
      waitMinutes: s.waitMinutes,
      takenOver: Boolean(s.help?.takenOver),
      takenOverByName: s.help?.takenOverByName || null,
      topicId: s.topicId,
      topicName: s.topicName
    }));

  if (!selfAssessment.hasExplicitData) {
    selfAssessment.note =
      "Noch keine Selbsteinschätzungen vorhanden. Schüler:innen können beim Planen unter „Sicherheitsgefühl“ (1–5) eine Angabe machen (confidence_before).";
    selfAssessment.sicher = 0;
    selfAssessment.teilweise = 0;
    selfAssessment.unsicher = 0;
    selfAssessment.keineAngabe = 0;
  }

  const withTagesziel = studentCards.filter((s) => s.statusId !== "no_goal").length;
  const openHelp = studentCards.filter((s) => s.helpActive).length;

  return {
    topics,
    unmapped: {
      id: HQ_UNASSIGNED_TOPIC_ID,
      name: "Tagesziel nicht zuordenbar",
      kind: "unmapped",
      studentCount: unmappedStudents.length,
      helpCount: unmappedStudents.filter((s) => s.helpActive).length,
      students: unmappedStudents
    },
    noGoal: {
      id: "no_goal_line",
      name: "Heute ohne Tagesziel",
      kind: "no_goal",
      studentCount: noGoalStudents.length,
      students: noGoalStudents
    },
    students: studentCards,
    helpQueue,
    selfAssessment,
    stats: {
      studentCount: studentCards.length,
      withTagesziel,
      openHelp,
      noGoalCount: noGoalStudents.length,
      unmappedCount: unmappedStudents.length
    },
    legend: {
      tiers: HQ_TIERS.map((id) => ({
        id,
        label: HQ_TIER_LABELS[id],
        badge: HQ_TIER_BADGE[id]
      })),
      note: "Zuordnung nur über Tagesziel-Unterthema. Levelcheck-% ist kein Hilfe-Signal und keine Notenprognose."
    }
  };
}

/** @deprecated Alias – frühere Lernstadt/Matrix-Importe. */
export function buildLernstadt(input) {
  const cockpit = buildThemenCockpit(input);
  return {
    ...cockpit,
    stations: [
      ...cockpit.topics,
      ...(cockpit.unmapped.studentCount
        ? [{ ...cockpit.unmapped, previewLimit: 4, sortOrder: 9998 }]
        : []),
      ...(cockpit.noGoal.studentCount
        ? [{ ...cockpit.noGoal, previewLimit: 4, sortOrder: 9999 }]
        : [])
    ]
  };
}

/** @deprecated Alias für bestehende Importe. */
export function buildLevelcheckMatrix(input) {
  const hq = buildThemenCockpit({
    students: input.students,
    goals: input.goals,
    todayEntries: input.entries || input.todayEntries || [],
    pastEntries: input.pastEntries || [],
    checks: input.checks,
    reflections: input.reflections,
    marks: input.marks,
    targets: input.targets,
    evaluations: (input.evaluations || []).map((ev) => ({
      ...ev,
      checkpointDate: ev.checkpointDate || ev._date
    })),
    coachingStates: input.coachingStates || [],
    date: input.date,
    getGradeRequirements: input.getGradeRequirements
  });
  return {
    ...hq,
    stations: hq.topics,
    goals: (input.goals || []).map((g) => ({
      id: String(g.id),
      text: g.text,
      sortOrder: g.sortOrder ?? 0
    })),
    totals: {
      studentCount: hq.stats.studentCount,
      helpCount: hq.stats.openHelp,
      todayCount: hq.stats.withTagesziel,
      openCount: hq.stats.noGoalCount,
      reachedCount: 0
    }
  };
}
