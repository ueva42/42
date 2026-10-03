/**
 * Classroom HQ / Lernstadt: Klasse als Stationen-Stadt.
 * Position = aktuelles Tagesziel-Unterthema (keine Rankings, keine Tempo-Anzeige).
 * Hilfe nur bei explizitem Zwischencheck-Hilfe-Signal – niedrige Levelcheck-% ≠ Hilfe.
 */
import { isNegativeCheckValue, isGoalMissedReflection } from "./teacher-insights.js";

export const HQ_TIERS = ["rookie", "operator", "street_legend"];
export const HQ_TIER_LABELS = {
  rookie: "Rookie",
  operator: "Operator",
  street_legend: "Street Legend"
};

export const HQ_UNASSIGNED_STATION_ID = "unassigned";

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
    const status = String(m.status || "sicher").toLowerCase();
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
      levelLabel: tierLabel(ev.checkedLevel) || null,
      checkpointId: ev.checkpoint_id ? String(ev.checkpoint_id) : null
    };
  }
  return null;
}

/**
 * Status eines Schülers für die Lernstadt.
 */
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
 * Baut die Lernstadt-Ansicht.
 */
export function buildLernstadt(input) {
  const {
    students = [],
    goals = [],
    todayEntries = [],
    checks = [],
    reflections = [],
    marks = [],
    targets = [],
    evaluations = [],
    coachingStates = [],
    date,
    now = new Date()
  } = input;

  const goalById = new Map(goals.map((g) => [String(g.id), g]));
  const entriesByStudent = {};
  for (const e of todayEntries) {
    (entriesByStudent[e.user_id] ||= []).push(e);
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

  const stationBuckets = new Map();
  for (const g of goals) {
    stationBuckets.set(String(g.id), []);
  }
  stationBuckets.set(HQ_UNASSIGNED_STATION_ID, []);

  const studentCards = students.map((s, index) => {
    const entries = (entriesByStudent[s.id] || []).slice().sort((a, b) => {
      const ta = String(a.timeslot || "");
      const tb = String(b.timeslot || "");
      if (ta !== tb) return ta.localeCompare(tb);
      return String(a.created_at || "").localeCompare(String(b.created_at || ""));
    });

    // Primäres Tagesziel: Eintrag mit Unterthema dieses Levelchecks, sonst erster Plan
    let primary =
      entries.find((e) => e.what_goal_id && goalById.has(String(e.what_goal_id))) ||
      entries[0] ||
      null;

    // Bei Hilfe-Signal dieses Entry bevorzugen
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

    const stationId =
      primary?.what_goal_id && goalById.has(String(primary.what_goal_id))
        ? String(primary.what_goal_id)
        : HQ_UNASSIGNED_STATION_ID;
    const stationGoal = goalById.get(stationId) || null;

    const status = resolveStudentHqStatus({
      hasTagesziel,
      goalReached,
      helpFromCheck,
      coaching
    });
    // waitMinutes mit aktuellem now neu berechnen
    if (status.helpActive && status.waitMinutes == null) {
      status.waitMinutes = waitMinutes(
        helpFromCheck?.requestedAt || coaching?.help_requested_at,
        now
      );
    }
    status.waitLabel = formatWaitLabel(status.waitMinutes);

    const { reachedTier, workingTier } = highestTierFromMarks(marksByStudent[s.id] || []);
    const currentLevel =
      (primary?.selected_level && tierRank(primary.selected_level) >= 0
        ? String(primary.selected_level).toLowerCase()
        : null) ||
      workingTier ||
      reachedTier ||
      null;

    const target = targetByStudent[s.id] || null;
    const lastEval = pickLatestEvaluation(evalByStudent[s.id] || []);

    const concern =
      sanitizeText(coaching?.help_concern) ||
      helpFromCheck?.concern ||
      null;

    const nextStepStored =
      sanitizeText(coaching?.next_step) ||
      sanitizeText(primaryRefl?.next_step) ||
      sanitizeText(primaryCheck?.next_step_answer) ||
      sanitizeText(target?.next_goal_text) ||
      null;

    const note = sanitizeText(coaching?.note) || null;

    const initials = String(s.name || "?")
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
      stationId,
      stationName: stationGoal?.text || "Noch nicht zugeordnet",
      statusId: status.id,
      statusIcon: status.icon,
      statusLabel: status.label,
      statusShort: status.shortLabel,
      helpActive: Boolean(status.helpActive),
      waitMinutes: status.waitMinutes,
      waitLabel: status.waitLabel,
      tagesziel: sanitizeText(primary?.what_goal_text || primary?.goal, 500),
      unterthema: stationGoal?.text || null,
      unterthemaAssigned: stationId !== HQ_UNASSIGNED_STATION_ID,
      subject: primary?.subject || null,
      timeslot: primary?.timeslot || null,
      logEntryId: primary?.id ? String(primary.id) : null,
      goalId: stationId !== HQ_UNASSIGNED_STATION_ID ? stationId : null,
      currentLevel,
      currentLevelLabel: tierLabel(currentLevel),
      plannedLevel: workingTier,
      plannedLevelLabel: tierLabel(workingTier),
      reachedLevel: reachedTier,
      reachedLevelLabel: tierLabel(reachedTier),
      levelcheck: lastEval
        ? {
            percent: lastEval.percent,
            date: lastEval.date,
            levelLabel: lastEval.levelLabel,
            status: lastEval.status,
            empty: lastEval.percent == null && !lastEval.status
          }
        : { percent: null, date: null, levelLabel: null, status: null, empty: true },
      zielnote: target?.target_grade_key
        ? String(target.target_grade_key)
        : target?.target_grade != null
          ? String(target.target_grade)
          : null,
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
        closedAt: asIsoTimestamp(coaching?.closed_at),
        historyNote: note
      },
      nextStepSuggestion:
        status.id === "goal_reached"
          ? nextStepStored || sanitizeText(target?.next_goal_text) || null
          : nextStepStored,
      sortIndex: index
    };

    stationBuckets.get(stationId).push(card);
    return card;
  });

  const stations = [];
  goals.forEach((g, i) => {
    const list = stationBuckets.get(String(g.id)) || [];
    list.sort((a, b) => String(a.name).localeCompare(String(b.name), "de"));
    stations.push({
      id: String(g.id),
      name: g.text,
      sortOrder: g.sortOrder ?? i,
      kind: "unterthema",
      studentCount: list.length,
      helpCount: list.filter((s) => s.helpActive).length,
      students: list,
      previewLimit: 4
    });
  });

  const unassigned = stationBuckets.get(HQ_UNASSIGNED_STATION_ID) || [];
  unassigned.sort((a, b) => String(a.name).localeCompare(String(b.name), "de"));
  stations.push({
    id: HQ_UNASSIGNED_STATION_ID,
    name: "Noch nicht zugeordnet",
    sortOrder: 9999,
    kind: "unassigned",
    studentCount: unassigned.length,
    helpCount: unassigned.filter((s) => s.helpActive).length,
    students: unassigned,
    previewLimit: 4
  });

  // Gruppenhinweis: mehrere offene Hilfen am gleichen Unterthema
  const groupHelp = stations
    .filter((st) => st.kind === "unterthema" && st.helpCount >= 2)
    .map((st) => ({
      stationId: st.id,
      stationName: st.name,
      count: st.helpCount,
      studentNames: st.students.filter((s) => s.helpActive).map((s) => s.name)
    }));

  const withTagesziel = studentCards.filter((s) => s.statusId !== "no_goal").length;
  const openHelp = studentCards.filter((s) => s.helpActive).length;
  const reachedGoals = studentCards.filter((s) => s.statusId === "goal_reached").length;

  return {
    stations,
    students: studentCards,
    groupHelp,
    stats: {
      studentCount: studentCards.length,
      withTagesziel,
      openHelp,
      reachedGoals
    },
    legend: {
      statuses: Object.values(HQ_STATUS).map((s) => ({
        id: s.id,
        icon: s.icon,
        label: s.label
      })),
      tiers: HQ_TIERS.map((id) => ({ id, label: HQ_TIER_LABELS[id] })),
      note: "Position = aktuelles Tagesziel-Unterthema. Levelcheck-% ist kein Hilfe-Signal."
    }
  };
}

/** @deprecated Alias für bestehende Importe – nutzt Lernstadt. */
export function buildLevelcheckMatrix(input) {
  const hq = buildLernstadt({
    students: input.students,
    goals: input.goals,
    todayEntries: input.entries || input.todayEntries || [],
    checks: input.checks,
    reflections: input.reflections,
    marks: input.marks,
    targets: input.targets,
    evaluations: (input.evaluations || []).map((ev) => ({
      ...ev,
      checkpointDate: ev.checkpointDate || ev._date
    })),
    coachingStates: input.coachingStates || [],
    date: input.date
  });
  return {
    ...hq,
    goals: (input.goals || []).map((g) => ({
      id: String(g.id),
      text: g.text,
      sortOrder: g.sortOrder ?? 0
    })),
    totals: {
      studentCount: hq.stats.studentCount,
      helpCount: hq.stats.openHelp,
      todayCount: hq.stats.withTagesziel,
      openCount: hq.stats.studentCount - hq.stats.withTagesziel,
      reachedCount: hq.stats.reachedGoals
    }
  };
}
