/**
 * Muster für das Lehrer-Dashboard.
 * Nur aus mitgegebenen Daten. Kein Zugriff auf die Datenbank.
 * Was fehlt, steht in TEACHER_DASHBOARD_GAPS und wird nicht geschätzt.
 */
import { isGoalMissedReflection } from "./teacher-insights.js";
import { TEACHER_DASHBOARD_CONFIG } from "./teacher-dashboard-config.js";

export const TIERS = ["rookie", "operator", "street_legend"];
export const TIER_LABELS = {
  rookie: "Rookie",
  operator: "Operator",
  street_legend: "Street Legend"
};
export const TIER_SHORT = {
  rookie: "R",
  operator: "O",
  street_legend: "SL"
};

const GRADE_ORDER = [];
for (let i = 2; i <= 12; i += 1) {
  const num = i / 2;
  GRADE_ORDER.push(Number.isInteger(num) ? String(num) : num.toFixed(1));
}

const CONCERN_ORDER = ["H1", "Z1", "A2", "Z2", "H3", "A1", "Z4", "Z3", "H2", "A4", "A3"];
const STRENGTH_ORDER = ["Z+", "A+", "H+"];

export function gradeNumber(key) {
  if (key == null || key === "") return null;
  const n = Number(String(key).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export function formatGrade(key) {
  if (key == null || key === "") return null;
  return String(key).replace(".", ",");
}

export function tierRank(tier) {
  const i = TIERS.indexOf(String(tier || "").toLowerCase());
  return i < 0 ? -1 : i;
}

export function isoDay(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const s = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

export function eachIsoDay(start, end) {
  const out = [];
  if (!start || !end || start > end) return out;
  const cursor = new Date(`${start}T12:00:00`);
  const last = new Date(`${end}T12:00:00`);
  while (cursor <= last) {
    out.push(isoDay(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

export function weekdayFromIso(iso) {
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const js = d.getDay();
  return js === 0 ? 7 : js;
}

export function daysUntil(fromIso, toIso) {
  if (!fromIso || !toIso) return null;
  const a = new Date(`${fromIso}T12:00:00`).getTime();
  const b = new Date(`${toIso}T12:00:00`).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 86400000);
}

/** Uhrzeit aus „11.25-12.10“ oder „11:25-12:10“. */
export function parseTimeslot(raw) {
  const parts = String(raw || "")
    .split("-")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length < 2) return null;
  const start = parseClock(parts[0]);
  const end = parseClock(parts[1]);
  if (start == null || end == null || end <= start) return null;
  return { start, end, label: `${parts[0]}–${parts[1]}` };
}

function parseClock(token) {
  const match = String(token || "").trim().match(/^(\d{1,2})[.:](\d{2})$/);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
}

/**
 * Schul-Uhrzeit (ohne Zeitzone gespeichert) → Zeitpunkt.
 * Die Stunden im Plan sind Ortszeit der Schule.
 */
export function schoolDateTime(iso, minutes, timeZone) {
  const h = Math.floor(minutes / 60);
  const mi = minutes % 60;
  const local = `${iso}T${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}:00`;
  const utcGuess = new Date(`${local}Z`);
  if (Number.isNaN(utcGuess.getTime())) return null;
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
  const parts = Object.fromEntries(dtf.formatToParts(utcGuess).map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
  return new Date(utcGuess.getTime() - (asUtc - utcGuess.getTime()));
}

export function berlinClock(date, timeZone) {
  const dtf = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
  const parts = Object.fromEntries(dtf.formatToParts(date).map((p) => [p.type, p.value]));
  return {
    iso: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute)
  };
}

function goalOutcome(reflection) {
  if (!reflection) return null;
  if (isGoalMissedReflection(reflection)) return false;
  const achieved = String(reflection.goal_achieved || reflection.goalAchieved || "")
    .trim()
    .toLowerCase();
  const answer = String(reflection.goal_reached_answer || reflection.goalReachedAnswer || "")
    .trim()
    .toLowerCase();
  if (achieved === "ja" || achieved.startsWith("ja")) return true;
  if (answer.startsWith("ja")) return true;
  if (achieved === "teilweise" || answer.includes("teilweise")) return false;
  if (answer.includes("geschafft") && !answer.includes("nicht")) return true;
  return null;
}

function percentLabel(ratio) {
  return `${Math.round(ratio * 100)} %`;
}

/**
 * Beste Note, deren Zielpfad die sicheren Level erfüllen.
 * Ohne sicheren Level keine Note: Note 6 verlangt 0 % und darf Leere nicht als Note ausgeben.
 */
export function achievedGradeFromSicher(total, counts, getGradeRequirements) {
  const sum =
    Number(counts?.rookie || 0) +
    Number(counts?.operator || 0) +
    Number(counts?.street_legend || 0);
  if (!total || sum <= 0 || typeof getGradeRequirements !== "function") return null;
  for (const key of GRADE_ORDER) {
    const rules = getGradeRequirements(key);
    if (!rules) continue;
    let ok = true;
    for (const tier of TIERS) {
      const required = Math.ceil(total * (Number(rules[tier]) || 0));
      if ((counts[tier] || 0) < required) {
        ok = false;
        break;
      }
    }
    if (ok) return key;
  }
  return null;
}

function rulesFor(getGradeRequirements, gradeKey) {
  if (!gradeKey || typeof getGradeRequirements !== "function") return null;
  const rules = getGradeRequirements(gradeKey);
  if (!rules) return null;
  return {
    rookie: Number(rules.rookie) || 0,
    operator: Number(rules.operator) || 0,
    street_legend: Number(rules.street_legend) || 0
  };
}

function highestRequiredTier(goalIndex, total, rules) {
  if (!rules || goalIndex < 0) return null;
  let top = null;
  for (const tier of TIERS) {
    const required = Math.ceil(total * (Number(rules[tier]) || 0));
    if (required > 0 && goalIndex < required) top = tier;
  }
  return top;
}

function sicherCounts(goals, marks) {
  const counts = { rookie: 0, operator: 0, street_legend: 0 };
  for (const goal of goals) {
    for (const tier of TIERS) {
      const mark = marks.find(
        (item) => String(item.goalId) === String(goal.id) && String(item.tier) === tier
      );
      if (mark && normalizeStatus(mark.status) === "sicher") counts[tier] += 1;
    }
  }
  return counts;
}

function normalizeStatus(raw) {
  const key = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
  if (key === "sicher") return "sicher";
  if (key === "in_arbeit" || key === "inarbeit") return "in_arbeit";
  if (!key) return null;
  return "offen";
}

function highestStand(marks, goalId) {
  const list = marks.filter((item) => String(item.goalId) === String(goalId));
  let best = null;
  for (const item of list) {
    const status = normalizeStatus(item.status);
    if (status !== "sicher" && status !== "in_arbeit") continue;
    if (!best || tierRank(item.tier) > tierRank(best.tier)) {
      best = { tier: String(item.tier), status, updatedAt: item.updatedAt || null };
    }
  }
  return best;
}

function markFor(marks, goalId, tier) {
  return (
    marks.find(
      (item) => String(item.goalId) === String(goalId) && String(item.tier) === tier
    ) || null
  );
}

function inRange(iso, start, end) {
  if (!iso || !start || !end) return false;
  return iso >= start && iso <= end;
}

function stamp(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function hint(id, kind, title, fact, prompt, idea, extra = {}) {
  return { id, kind, title, fact, prompt, idea, ...extra };
}

function pickHints(signals, max) {
  const concerns = [...signals.filter((item) => item.kind === "concern")].sort(
    (a, b) => CONCERN_ORDER.indexOf(a.id) - CONCERN_ORDER.indexOf(b.id)
  );
  const strengths = [...signals.filter((item) => item.kind === "strength")].sort(
    (a, b) => STRENGTH_ORDER.indexOf(a.id) - STRENGTH_ORDER.indexOf(b.id)
  );
  const picked = [];
  const roomForConcerns = strengths.length ? Math.max(0, max - 1) : max;
  for (const item of concerns) {
    if (picked.length >= roomForConcerns) break;
    picked.push(item);
  }
  if (strengths.length && picked.length < max) picked.push(strengths[0]);
  return picked.slice(0, max);
}

function lessonBounds(iso, timeslot, timeZone) {
  const parsed = parseTimeslot(timeslot);
  if (!parsed || !iso) return null;
  return {
    ...parsed,
    startAt: schoolDateTime(iso, parsed.start, timeZone),
    endAt: schoolDateTime(iso, parsed.end, timeZone)
  };
}

function currentLesson(today, slots, now, timeZone) {
  const clock = berlinClock(now, timeZone);
  if (clock.iso !== today) return null;
  const candidates = [];
  for (const slot of slots || []) {
    const bounds = lessonBounds(today, slot.timeslot, timeZone);
    if (!bounds?.startAt || !bounds.endAt) continue;
    candidates.push(bounds);
  }
  return (
    candidates.find((item) => now >= item.startAt && now <= item.endAt) || null
  );
}

/**
 * Eine Schülerin oder ein Schüler.
 * entries/checks/reflections können über den Muster-Zeitraum hinausreichen (Wochenstreifen).
 */
export function analyzeStudent(input) {
  const cfg = input.config || TEACHER_DASHBOARD_CONFIG;
  const goals = [...(input.goals || [])].sort(
    (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || String(a.id).localeCompare(String(b.id))
  );
  const marks = input.marks || [];
  const entries = input.entries || [];
  const rangeStart = input.rangeStart;
  const rangeEnd = input.rangeEnd;
  const ranged = entries.filter((entry) => inRange(entry.date, rangeStart, rangeEnd));
  const getReq = input.getGradeRequirements;
  const total = goals.length;
  const targetKey = input.targetGradeKey || null;
  const rules = rulesFor(getReq, targetKey);
  const counts = sicherCounts(goals, marks);
  const levelchecks = (input.evaluations || []).filter((item) => {
    if (String(item.type || "") !== "levelcheck") return false;
    if (item.status !== "passed" && item.status !== "failed") return false;
    return inRange(item.date, rangeStart, rangeEnd);
  });
  const standGrade = achievedGradeFromSicher(total, counts, getReq);
  const levelcheckCount = levelchecks.length;
  let prognosis = "unknown";
  let prognosisReason = "noch nicht einschätzbar";
  if (!targetKey) {
    prognosisReason = "keine Zielnote";
  } else if (!rules) {
    prognosisReason = "kein Zielpfad zu dieser Zielnote";
  } else if (levelcheckCount < cfg.grades.minLevelchecks) {
    prognosisReason = `erst ab ${cfg.grades.minLevelchecks} bewerteten Levelchecks`;
  } else if (!standGrade) {
    prognosisReason = "noch kein sicherer Levelstand";
  } else {
    const diff = gradeNumber(standGrade) - gradeNumber(targetKey);
    if (diff == null) prognosisReason = "Note nicht lesbar";
    else if (diff >= cfg.grades.gap) {
      prognosis = "high";
      prognosisReason = "Zielnote liegt über dem Stand";
    } else if (diff <= -cfg.grades.gap) {
      prognosis = "low";
      prognosisReason = "Zielnote liegt unter dem Stand";
    } else {
      prognosis = "fits";
      prognosisReason = "Zielnote und Stand liegen beieinander";
    }
  }

  const reflectionsKnown = [];
  for (const entry of ranged) {
    const outcome = goalOutcome(entry.reflection);
    if (outcome == null) continue;
    reflectionsKnown.push({ entry, outcome, date: entry.date });
  }
  reflectionsKnown.sort((a, b) => String(b.date).localeCompare(String(a.date)) || 0);
  const window = reflectionsKnown.slice(0, cfg.goals.achievedWindow);

  const signals = [];
  const neutral = [];

  if (prognosis === "high" || prognosis === "low") {
    const pathText = rules
      ? `Rookie ${percentLabel(rules.rookie)}, Operator ${percentLabel(rules.operator)}, Street Legend ${percentLabel(rules.street_legend)}`
      : "Zielpfad";
    signals.push(
      hint(
        "Z1",
        "concern",
        "Passt die Zielnote noch zum Stand?",
        `Zielnote ${formatGrade(targetKey)}. Sichere Level entsprechen nach dem Zielpfad Note ${formatGrade(standGrade)}. ${levelcheckCount} bewertete Levelchecks. Pfad: ${pathText}.`,
        "Was müsstest du bis zur Arbeit noch schaffen – und reicht dein Plan dafür?",
        "Zielnote und Zielpfad nebeneinanderlegen. Die Note nicht vorgeben.",
        { prognosis }
      )
    );
  }

  const belowDays = daysBelowPath(ranged, goals, rules, total);
  if (belowDays.length >= cfg.goals.daysBelowPath) {
    signals.push(
      hint(
        "Z2",
        "concern",
        "Arbeitest du auf dem Level, das die Zielnote braucht?",
        `An ${belowDays.length} Tagen nur ein Level unter dem Zielpfad.`,
        "Welches Level brauchst du als Nächstes für deine Zielnote?",
        "Für die nächste Stunde eine Aufgabe auf dem Level festlegen, das der Pfad vorsieht."
      )
    );
  }

  if (window.length >= cfg.goals.achievedWindow) {
    const yes = window.filter((item) => item.outcome).length;
    const ratio = yes / window.length;
    if (ratio < cfg.goals.achievedMaxRatio) {
      signals.push(
        hint(
          "Z3",
          "concern",
          "Sind die Tagesziele zu groß?",
          `Von den letzten ${window.length} Tagen mit Abschluss waren ${yes} geschafft.`,
          "Was wäre ein Tagesziel, das an einem Tag wirklich zu schaffen ist?",
          "Das nächste Ziel kleiner schneiden."
        )
      );
    }
  }

  const stuckGoal = sameGoalWithoutProgress(ranged, marks, cfg.goals.sameGoalDays);
  if (stuckGoal) {
    signals.push(
      hint(
        "Z4",
        "concern",
        "Hängt dasselbe Tagesziel fest?",
        `„${stuckGoal.text}“ an ${stuckGoal.days} Tagen, und der Abschluss sagt jeweils nicht geschafft.`,
        "Was hat sich seit dem letzten Mal nicht bewegt?",
        "Ziel kleiner machen oder das Unterthema wechseln."
      )
    );
  }

  const timetableDays = timetableDaysInRange(
    input.timetable || [],
    rangeStart,
    rangeEnd,
    input.subject
  );
  const entryDays = new Set(ranged.map((entry) => entry.date));
  const setRatio = timetableDays.length ? entryDays.size / timetableDays.length : null;
  const knownOutcomes = reflectionsKnown.length;
  const knownYes = reflectionsKnown.filter((item) => item.outcome).length;
  const achievedRatio = knownOutcomes ? knownYes / knownOutcomes : null;
  if (
    setRatio != null &&
    setRatio >= cfg.goals.strengthSetRatio &&
    knownOutcomes >= cfg.goals.strengthMinKnown &&
    achievedRatio != null &&
    achievedRatio >= cfg.goals.strengthAchievedRatio
  ) {
    signals.push(
      hint(
        "Z+",
        "strength",
        "Was läuft beim Ziele setzen gut?",
        `Tagesziel an ${percentLabel(setRatio)} der Stunden im Plan, ${percentLabel(achievedRatio)} der Abschlüsse geschafft.`,
        "Was machst du, wenn du ein Ziel setzt, das dann auch klappt?",
        "Ansprechen und loben. Darauf lässt sich aufbauen."
      )
    );
  }

  const helpEvents = (input.helpEvents || []).filter((item) =>
    inRange(isoDay(item.at), rangeStart, rangeEnd)
  );
  const coachAsks = (input.coachMessages || []).filter(
    (item) =>
      String(item.rolle) === "schueler" && inRange(isoDay(item.at), rangeStart, rangeEnd)
  );
  const h1Fail = levelchecks.some((item) => item.status === "failed");
  const stallDays = measurableStallDays(ranged, marks, coachAsks, cfg);
  const noHelpNoCoach = helpEvents.length === 0 && coachAsks.length === 0;
  if (h1Fail || (stallDays.length >= cfg.help.stallMinDays && noHelpNoCoach)) {
    const fact = h1Fail
      ? "Im Zeitraum ist ein Levelcheck nicht bestanden."
      : `An ${stallDays.length} Tagen mindestens ${cfg.help.stallMinutes} Minuten ohne Statuswechsel, ohne Hilfe und ohne Coach.`;
    signals.push(
      hint(
        "H1",
        "concern",
        "Wann holst du dir Hilfe?",
        fact,
        "Woran merkst du, dass du nicht weiterkommst – und wen fragst du dann?",
        "In der nächsten Stunde einmal aktiv vorbeischauen."
      )
    );
  }

  if (earlyHelpCount(ranged, helpEvents, coachAsks, cfg) >= cfg.help.earlyMinCount) {
    signals.push(
      hint(
        "H2",
        "concern",
        "Startest du mit einem eigenen Versuch?",
        `Hilfe oder Coach mindestens ${cfg.help.earlyMinCount}-mal in den ersten ${cfg.help.earlyMinutes} Minuten nach dem Start des Tagesziels.`,
        "Was könntest du in den ersten Minuten allein probieren, bevor du fragst?",
        "Kurz allein starten lassen, danach nachfragen."
      )
    );
  }

  const lateHelps = lateHelpEvents(ranged, helpEvents, marks, cfg);
  if (lateHelps >= cfg.help.lateMinCount) {
    signals.push(
      hint(
        "H3",
        "concern",
        "Fragst du erst, wenn es schon lange hakt?",
        `Mindestens ${cfg.help.lateMinCount} Hilfen erst nach ${cfg.help.stallMinutes} Minuten ohne Statuswechsel.`,
        "Was wäre ein früherer Moment zum Fragen gewesen?",
        "Eine kleine Regel: nach einer Viertelstunde ohne Wechsel kurz fragen."
      )
    );
  }

  if (cameFurther(ranged, helpEvents, coachAsks, marks, cfg, input.timeZone)) {
    signals.push(
      hint(
        "H+",
        "strength",
        "Wobei hat dir Hilfe geholfen?",
        "Nach Hilfe, Coach oder einer gespeicherten Taktik gab es in dem Zeitfenster einen Statuswechsel.",
        "Was hat dir geholfen, den nächsten Schritt zu finden?",
        "Das behalten und nachfragen, was genau geholfen hat."
      )
    );
  }

  const switchDays = topicSwitchDays(ranged, marks, cfg);
  if (switchDays >= cfg.work.switchMinDays) {
    signals.push(
      hint(
        "A1",
        "concern",
        "Bleibst du bei einem Unterthema?",
        `An ${switchDays} Tagen mindestens ${cfg.work.switches} Wechsel des Unterthemas in einer Stunde, ohne Statusänderung dazwischen.`,
        "Was suchst du, wenn du das Thema wechselst?",
        "Ein Unterthema für die Stunde fest halten."
      )
    );
  }

  const missingTopic = missingExamTopic(input, goals, rules, total, marks, ranged, cfg);
  if (missingTopic) {
    signals.push(
      hint(
        "A2",
        "concern",
        "Fehlt ein Unterthema, das die Zielnote braucht?",
        `„${missingTopic.text}“ ist für die Zielnote vorgesehen und noch nicht begonnen. ${missingTopic.examLabel} in ${missingTopic.days} Tagen.`,
        "Wann fängst du mit diesem Unterthema an?",
        "Das Unterthema als nächstes Tagesziel setzen.",
        { goalId: missingTopic.id }
      )
    );
  }

  const legendJumps = streetLegendWithoutRookie(goals, marks);
  if (legendJumps.length >= cfg.work.legendWithoutRookie) {
    signals.push(
      hint(
        "A3",
        "concern",
        "Springst du ins höchste Level, bevor das erste sitzt?",
        `Bei ${legendJumps.length} Unterthemen ist Street Legend begonnen, Rookie aber nicht sicher.`,
        "Was brauchst du auf Rookie noch, bevor Street Legend dran ist?",
        "Zuerst Rookie abschließen."
      )
    );
  } else if (legendJumps.length === 1) {
    neutral.push({
      id: "A3",
      text: `Aktueller Stand: bei „${legendJumps[0].text}“ ist Street Legend begonnen, Rookie noch nicht sicher. Einmal ist kein Muster.`
    });
  }

  const learningDays = entryDays.size;
  const reflectedDays = new Set(
    ranged.filter((entry) => entry.reflection).map((entry) => entry.date)
  ).size;
  if (
    learningDays >= cfg.work.reflectionMinDays &&
    reflectedDays / learningDays < cfg.work.reflectionMaxRatio
  ) {
    signals.push(
      hint(
        "A4",
        "concern",
        "Wie oft schließt du den Tag ab?",
        `Reflexion an ${reflectedDays} von ${learningDays} Lerntagen.`,
        "Was hindert dich am kurzen Abschluss?",
        "Zwei Sätze am Ende der Stunde reichen."
      )
    );
  }

  const ordered = worksInOrder(goals, marks);
  const stayed = staysOnTopic(ranged);
  if (ordered && stayed && legendJumps.length === 0 && switchDays < cfg.work.switchMinDays) {
    signals.push(
      hint(
        "A+",
        "strength",
        "Was hilft dir, der Reihe nach zu arbeiten?",
        "Die Level werden der Reihe nach sicher, und die Einträge bleiben beim Unterthema.",
        "Was hilft dir, beim Thema zu bleiben?",
        "Als Stärke benennen."
      )
    );
  }

  const helpGroups = ["H1", "H2", "H3", "H+"].filter((id) =>
    signals.some((item) => item.id === id)
  );

  const quotes = {
    entries: ranged.length,
    reflected: ranged.filter((entry) => entry.reflection).length,
    achievedYes: reflectionsKnown.filter((item) => item.outcome).length,
    achievedKnown: reflectionsKnown.length
  };

  const stands = goals.map((goal) => {
    const stand = highestStand(marks, goal.id);
    return {
      goalId: String(goal.id),
      text: goal.text,
      tier: stand?.tier || null,
      tierLabel: stand ? TIER_LABELS[stand.tier] : null,
      short: stand ? TIER_SHORT[stand.tier] : null,
      status: stand?.status || null
    };
  });

  const weekStart = input.weekStart;
  const weekEnd = input.weekEnd;
  const week = eachIsoDay(weekStart, weekEnd)
    .filter((iso) => {
      const day = weekdayFromIso(iso);
      return day >= 1 && day <= 5;
    })
    .map((iso) => {
      const dayEntries = entries.filter((entry) => entry.date === iso);
      return {
        date: iso,
        planned: dayEntries.length > 0,
        reflected: dayEntries.some((entry) => entry.reflection)
      };
    });

  let longestStall = null;
  for (const day of stallDays) {
    if (longestStall == null || day.minutes > longestStall) longestStall = day.minutes;
  }

  const live = buildLive(input, {
    cfg,
    rangedToday: entries.filter((entry) => entry.date === input.today),
    helpGroups,
    signals
  });

  return {
    prognosis,
    prognosisReason,
    standGrade,
    targetGradeKey: targetKey,
    levelcheckCount,
    path: rules,
    sicher: counts,
    totalGoals: total,
    signals,
    hints: pickHints(signals, cfg.hints.maxPerStudent),
    neutral,
    helpGroups,
    quotes,
    stands,
    week,
    helpStats: {
      helpCount: helpEvents.length,
      coachCount: coachAsks.length,
      tacticCount: tacticEvents(ranged).length,
      stallMinutes: longestStall
    },
    live
  };
}

function daysBelowPath(entries, goals, rules, total) {
  if (!rules || !total) return [];
  const byDate = groupBy(entries, (entry) => entry.date);
  const days = [];
  for (const [date, list] of byDate) {
    const judged = [];
    for (const entry of list) {
      if (!entry.whatGoalId || !entry.selectedLevel) continue;
      const index = goals.findIndex((goal) => String(goal.id) === String(entry.whatGoalId));
      if (index < 0) continue;
      const needed = highestRequiredTier(index, total, rules);
      if (!needed) continue;
      const level = tierRank(entry.selectedLevel);
      const need = tierRank(needed);
      if (level < 0 || need < 0) continue;
      judged.push(level < need);
    }
    if (judged.length && judged.every(Boolean)) days.push(date);
  }
  return days;
}

function sameGoalWithoutProgress(entries, marks, minDays) {
  const byGoal = new Map();
  for (const entry of entries) {
    if (!entry.whatGoalId) continue;
    if (!byGoal.has(String(entry.whatGoalId))) byGoal.set(String(entry.whatGoalId), []);
    byGoal.get(String(entry.whatGoalId)).push(entry);
  }
  let found = null;
  for (const [goalId, list] of byGoal) {
    const byDate = groupBy(list, (entry) => entry.date);
    const dates = [...byDate.keys()].sort();
    if (dates.length < minDays) continue;
    const picked = dates.slice(0, minDays);
    let explicitMiss = true;
    for (const date of picked) {
      const outcomes = byDate
        .get(date)
        .map((entry) => goalOutcome(entry.reflection))
        .filter((outcome) => outcome != null);
      if (!outcomes.length || outcomes.some((outcome) => outcome === true)) {
        explicitMiss = false;
        break;
      }
    }
    if (!explicitMiss) continue;
    const laterTouch = marks.some((mark) => {
      if (String(mark.goalId) !== goalId) return false;
      const day = isoDay(mark.updatedAt);
      return day && day > picked[0];
    });
    if (laterTouch) continue;
    if (!found || dates.length > found.days) {
      found = {
        id: goalId,
        text: list[0].whatGoalText || list[0].goal || "Tagesziel",
        days: dates.length
      };
    }
  }
  return found;
}

function timetableDaysInRange(slots, start, end, subject) {
  const days = [];
  const wanted = String(subject || "").trim().toLowerCase();
  for (const iso of eachIsoDay(start, end)) {
    const weekday = weekdayFromIso(iso);
    const hit = (slots || []).some((slot) => {
      if (Number(slot.weekday) !== weekday) return false;
      if (!wanted) return true;
      return String(slot.subject || "").trim().toLowerCase() === wanted;
    });
    if (hit) days.push(iso);
  }
  return days;
}

function groupBy(list, keyFn) {
  const map = new Map();
  for (const item of list) {
    const key = keyFn(item);
    if (!key) continue;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  }
  return map;
}

function measurableStallDays(entries, marks, coachAsks, cfg) {
  const minutes = cfg.help.stallMinutes;
  const byDate = groupBy(entries, (entry) => entry.date);
  const found = [];
  for (const [date, list] of byDate) {
    const times = [];
    for (const entry of list) {
      const created = stamp(entry.createdAt);
      if (created) times.push(created.getTime());
      const checkAt = stamp(entry.check?.createdAt);
      if (checkAt) times.push(checkAt.getTime());
      const reflAt = stamp(entry.reflection?.createdAt);
      if (reflAt) times.push(reflAt.getTime());
    }
    for (const ask of coachAsks) {
      if (isoDay(ask.at) === date) {
        const at = stamp(ask.at);
        if (at) times.push(at.getTime());
      }
    }
    for (const mark of marks) {
      if (isoDay(mark.updatedAt) === date) {
        const at = stamp(mark.updatedAt);
        if (at) times.push(at.getTime());
      }
    }
    times.sort((a, b) => a - b);
    let gap = 0;
    for (let i = 1; i < times.length; i += 1) {
      const delta = Math.floor((times[i] - times[i - 1]) / 60000);
      if (delta > gap) gap = delta;
    }
    if (gap >= minutes) found.push({ date, minutes: gap });
  }
  return found;
}

function earlyHelpCount(entries, helpEvents, coachAsks, cfg) {
  const windowMs = cfg.help.earlyMinutes * 60000;
  const hits = new Set();
  for (const entry of entries) {
    const start = stamp(entry.createdAt);
    if (!start) continue;
    const end = start.getTime() + windowMs;
    for (const help of helpEvents) {
      if (String(help.entryId || "") !== String(entry.id)) continue;
      const at = stamp(help.at);
      if (at && at.getTime() >= start.getTime() && at.getTime() <= end) {
        hits.add(`h:${help.entryId}:${at.getTime()}`);
      }
    }
    for (const ask of coachAsks) {
      const at = stamp(ask.at);
      if (!at) continue;
      const sameGoal =
        !entry.whatGoalId ||
        !ask.competenceId ||
        String(ask.competenceId) === String(entry.whatGoalId);
      if (!sameGoal) continue;
      if (at.getTime() >= start.getTime() && at.getTime() <= end) {
        hits.add(`c:${at.getTime()}:${ask.competenceId || ""}`);
      }
    }
  }
  return hits.size;
}

function lateHelpEvents(entries, helpEvents, marks, cfg) {
  let count = 0;
  const need = cfg.help.stallMinutes * 60000;
  for (const help of helpEvents) {
    const at = stamp(help.at);
    const entry = entries.find((item) => String(item.id) === String(help.entryId));
    const start = stamp(entry?.createdAt);
    if (!at || !start) continue;
    if (at.getTime() - start.getTime() < need) continue;
    const changed = marks.some((mark) => {
      const updated = stamp(mark.updatedAt);
      if (!updated) return false;
      return updated.getTime() > start.getTime() && updated.getTime() < at.getTime();
    });
    if (!changed) count += 1;
  }
  return count;
}

function tacticEvents(entries) {
  const events = [];
  for (const entry of entries) {
    if (entry.planB) {
      const at = stamp(entry.createdAt);
      if (at) events.push({ at, goalId: entry.whatGoalId || null });
    }
    if (entry.check?.strategyName) {
      const at = stamp(entry.check.createdAt);
      if (at) events.push({ at, goalId: entry.whatGoalId || null });
    }
    if (entry.reflection?.strategyName) {
      const at = stamp(entry.reflection.createdAt);
      if (at) events.push({ at, goalId: entry.whatGoalId || null });
    }
  }
  return events;
}

function cameFurther(entries, helpEvents, coachAsks, marks, cfg, timeZone) {
  const triggers = [
    ...helpEvents.map((item) => ({ at: item.at, goalId: item.goalId || null, entryId: item.entryId })),
    ...coachAsks.map((item) => ({ at: item.at, goalId: item.competenceId || null, entryId: null })),
    ...tacticEvents(entries).map((item) => ({ at: item.at, goalId: item.goalId, entryId: null }))
  ];
  for (const trigger of triggers) {
    const start = stamp(trigger.at);
    if (!start) continue;
    const entry = entries.find((item) => String(item.id) === String(trigger.entryId)) ||
      entries.find(
        (item) =>
          trigger.goalId &&
          String(item.whatGoalId) === String(trigger.goalId) &&
          item.date === isoDay(start)
      );
    let limit = start.getTime() + cfg.help.progressWindowMinutes * 60000;
    const bounds = lessonBounds(entry?.date, entry?.timeslot, timeZone || cfg.schoolTimeZone);
    if (bounds?.endAt) limit = bounds.endAt.getTime();
    const moved = marks.some((mark) => {
      if (trigger.goalId && String(mark.goalId) !== String(trigger.goalId)) return false;
      const updated = stamp(mark.updatedAt);
      if (!updated) return false;
      const t = updated.getTime();
      return t > start.getTime() && t <= limit;
    });
    if (moved) return true;
  }
  return false;
}

function topicSwitchDays(entries, marks, cfg) {
  const windowMs = cfg.work.switchWindowMinutes * 60000;
  const byDate = groupBy(
    entries.filter((entry) => entry.whatGoalId && entry.createdAt),
    (entry) => entry.date
  );
  let days = 0;
  for (const [, list] of byDate) {
    const sorted = [...list].sort(
      (a, b) => stamp(a.createdAt).getTime() - stamp(b.createdAt).getTime()
    );
    let hit = false;
    for (let i = 0; i < sorted.length; i += 1) {
      const start = stamp(sorted[i].createdAt).getTime();
      let changes = 0;
      let prev = String(sorted[i].whatGoalId);
      for (let j = i + 1; j < sorted.length; j += 1) {
        const at = stamp(sorted[j].createdAt).getTime();
        if (at - start > windowMs) break;
        const id = String(sorted[j].whatGoalId);
        if (id !== prev) {
          changes += 1;
          prev = id;
        }
      }
      if (changes < cfg.work.switches) continue;
      const end = start + windowMs;
      const statusInside = marks.some((mark) => {
        const updated = stamp(mark.updatedAt);
        if (!updated) return false;
        const t = updated.getTime();
        return t >= start && t <= end;
      });
      if (!statusInside) {
        hit = true;
        break;
      }
    }
    if (hit) days += 1;
  }
  return days;
}

function missingExamTopic(input, goals, rules, total, marks, entries, cfg) {
  const exam = input.exam;
  if (!exam?.date || !rules) return null;
  const days = daysUntil(input.today, exam.date);
  if (days == null || days < 0 || days > cfg.work.examHorizonDays) return null;
  const linked = new Set((exam.linkedGoalIds || []).map(String));
  if (!linked.size) return null;
  for (const goal of goals) {
    if (!linked.has(String(goal.id))) continue;
    const index = goals.findIndex((item) => String(item.id) === String(goal.id));
    if (!highestRequiredTier(index, total, rules)) continue;
    const startedMark = marks.some((mark) => {
      if (String(mark.goalId) !== String(goal.id)) return false;
      const status = normalizeStatus(mark.status);
      return status === "sicher" || status === "in_arbeit";
    });
    const startedEntry = entries.some((entry) => String(entry.whatGoalId) === String(goal.id));
    if (!startedMark && !startedEntry) {
      return { id: String(goal.id), text: goal.text, days, examLabel: exam.label || "Klassenarbeit" };
    }
  }
  return null;
}

function streetLegendWithoutRookie(goals, marks) {
  const found = [];
  for (const goal of goals) {
    const legend = markFor(marks, goal.id, "street_legend");
    const legendStatus = normalizeStatus(legend?.status);
    if (legendStatus !== "in_arbeit" && legendStatus !== "sicher") continue;
    const rookie = normalizeStatus(markFor(marks, goal.id, "rookie")?.status);
    if (rookie === "sicher") continue;
    found.push({ id: String(goal.id), text: goal.text });
  }
  return found;
}

function worksInOrder(goals, marks) {
  let seenSicher = false;
  for (const goal of goals) {
    for (let i = 0; i < TIERS.length; i += 1) {
      const status = normalizeStatus(markFor(marks, goal.id, TIERS[i])?.status);
      const started = status === "in_arbeit" || status === "sicher";
      if (!started) continue;
      seenSicher = seenSicher || status === "sicher";
      for (let j = 0; j < i; j += 1) {
        if (normalizeStatus(markFor(marks, goal.id, TIERS[j])?.status) !== "sicher") return false;
      }
    }
  }
  return seenSicher;
}

function staysOnTopic(entries) {
  const withGoal = entries.filter((entry) => entry.whatGoalId);
  if (withGoal.length < 2) return false;
  const counts = new Map();
  for (const entry of withGoal) {
    const id = String(entry.whatGoalId);
    counts.set(id, (counts.get(id) || 0) + 1);
  }
  const top = Math.max(...counts.values());
  return top >= 2 && top / withGoal.length >= 0.7;
}

function buildLive(input, ctx) {
  const { cfg } = ctx;
  const todayEntries = ctx.rangedToday || [];
  const lesson = currentLesson(
    input.today,
    (input.timetable || []).filter(
      (slot) =>
        !input.subject ||
        String(slot.subject || "").trim().toLowerCase() === String(input.subject).trim().toLowerCase()
    ),
    input.now,
    input.timeZone || cfg.schoolTimeZone
  );
  const helpToday = (input.helpEvents || []).filter((item) => isoDay(item.at) === input.today);
  const openHelp = helpToday.filter((item) => !item.closed);
  const reasons = [];
  if (ctx.helpGroups.includes("H1")) {
    reasons.push({ id: "H1", label: "Hilfe bleibt aus" });
  }
  if (lesson && todayEntries.length) {
    const last = lastVisibleAt(input, todayEntries);
    if (last) {
      const idle = Math.floor((input.now.getTime() - last.getTime()) / 60000);
      if (idle >= cfg.help.stallMinutes) {
        reasons.push({
          id: "stall",
          label: `Seit ${idle} Minuten kein sichtbarer Wechsel`,
          minutes: idle
        });
      }
    }
  }
  const low = todayEntries.find((entry) => {
    const n = Number(entry.confidenceBefore);
    return Number.isFinite(n) && n >= 1 && n <= cfg.live.lowConfidenceMax;
  });
  if (low) {
    reasons.push({
      id: "confidence",
      label: `Sicherheitsgefühl ${low.confidenceBefore}`
    });
  }

  let noGoal = false;
  if (lesson?.startAt) {
    const after =
      input.now.getTime() - lesson.startAt.getTime() >= cfg.live.noGoalAfterMinutes * 60000;
    const hasGoal = todayEntries.some((entry) => String(entry.goal || "").trim() || entry.whatGoalId);
    if (after && !hasGoal) noGoal = true;
  }
  if (noGoal && reasons.length) {
    reasons.push({ id: "nogoal", label: "Noch kein Tagesziel" });
    noGoal = false;
  }

  const running = todayEntries.some((entry) => String(entry.goal || "").trim() || entry.whatGoalId);
  const expertTopics = [];
  for (const entry of todayEntries) {
    if (!entry.whatGoalId) continue;
    const legend = (input.marks || []).find(
      (mark) =>
        String(mark.goalId) === String(entry.whatGoalId) &&
        String(mark.tier) === "street_legend" &&
        normalizeStatus(mark.status) === "sicher"
    );
    if (!legend) continue;
    const goal = (input.goals || []).find((item) => String(item.id) === String(entry.whatGoalId));
    expertTopics.push({ goalId: String(entry.whatGoalId), text: goal?.text || entry.whatGoalText || "Unterthema" });
  }

  return {
    help: openHelp.map((item) => ({
      at: item.at,
      entryId: item.entryId || null,
      goalId: item.goalId || null,
      concern: item.concern || "Hilfe angefragt",
      waitMinutes:
        item.at && input.now
          ? Math.max(0, Math.floor((input.now.getTime() - new Date(item.at).getTime()) / 60000))
          : null,
      takenOver: Boolean(item.takenOver),
      topic: item.topic || null,
      level: item.level || null
    })),
    visit: openHelp.length ? [] : reasons,
    noGoal: noGoal && !openHelp.length,
    running: running && !openHelp.length && reasons.length === 0 && !noGoal,
    expertTopics,
    lesson: lesson
      ? { label: lesson.label, start: lesson.start, end: lesson.end }
      : null
  };
}

function lastVisibleAt(input, todayEntries) {
  const times = [];
  for (const entry of todayEntries) {
    const created = stamp(entry.createdAt);
    if (created) times.push(created);
    const checkAt = stamp(entry.check?.createdAt);
    if (checkAt) times.push(checkAt);
    const reflAt = stamp(entry.reflection?.createdAt);
    if (reflAt) times.push(reflAt);
  }
  for (const ask of input.coachMessages || []) {
    if (isoDay(ask.at) !== input.today) continue;
    const at = stamp(ask.at);
    if (at) times.push(at);
  }
  for (const mark of input.marks || []) {
    if (isoDay(mark.updatedAt) !== input.today) continue;
    const at = stamp(mark.updatedAt);
    if (at) times.push(at);
  }
  if (!times.length) return null;
  return new Date(Math.max(...times.map((item) => item.getTime())));
}

export function aggregateClass(students, meta) {
  const cfg = meta.config || TEACHER_DASHBOARD_CONFIG;
  const days = meta.daysToExam;
  const proximity = days == null ? 1 : days <= 7 ? 3 : days <= 21 ? 2 : 1;
  const buckets = { fits: 0, high: 0, low: 0, unknown: 0 };
  const quotes = { entries: 0, reflected: 0, achievedYes: 0, achievedKnown: 0 };
  const helpMap = {
    H1: { id: "H1", label: "Fragt selten, obwohl es hakt", names: [] },
    H2: { id: "H2", label: "Fragt in den ersten Minuten", names: [] },
    H3: { id: "H3", label: "Fragt erst nach langem Stillstand", names: [] },
    "H+": { id: "H+", label: "Kommt nach Hilfe weiter", names: [] }
  };
  let multi = 0;
  const patternMap = new Map();

  for (const student of students) {
    const state = student.analysis.prognosis;
    if (buckets[state] != null) buckets[state] += 1;
    else buckets.unknown += 1;
    for (const key of Object.keys(quotes)) quotes[key] += student.analysis.quotes[key] || 0;
    if (student.analysis.helpGroups.length > 1) multi += 1;
    for (const id of student.analysis.helpGroups) {
      helpMap[id]?.names.push({ id: student.id, name: student.name });
    }
    for (const signal of student.analysis.signals) {
      if (signal.kind !== "concern") continue;
      const key = signal.id === "A2" && signal.goalId ? `${signal.id}:${signal.goalId}` : signal.id;
      if (!patternMap.has(key)) {
        patternMap.set(key, {
          id: signal.id,
          title: signal.title,
          idea: signal.idea,
          fact: signal.fact,
          names: []
        });
      }
      patternMap.get(key).names.push({ id: student.id, name: student.name });
    }
  }

  const patterns = [...patternMap.values()]
    .map((item) => ({
      ...item,
      count: item.names.length,
      score: item.names.length * proximity,
      fact: `Betrifft ${item.names.length} ${item.names.length === 1 ? "Person" : "Personen"} im gewählten Zeitraum.`
    }))
    .sort((a, b) => b.score - a.score || b.count - a.count)
    .slice(0, 3);

  const goalIds = meta.goals || [];
  const gaps = goalIds.map((goal) => {
    let sure = 0;
    const sureNames = [];
    const passedNames = [];
    let passedKnown = false;
    for (const student of students) {
      const stand = student.analysis.stands.find((item) => item.goalId === String(goal.id));
      if (stand?.status === "sicher") {
        sure += 1;
        sureNames.push({ id: student.id, name: student.name });
      }
      const single = (student.evaluations || []).filter(
        (item) =>
          item.type === "levelcheck" &&
          Array.isArray(item.linkedGoalIds) &&
          item.linkedGoalIds.length === 1 &&
          String(item.linkedGoalIds[0]) === String(goal.id) &&
          (item.status === "passed" || item.status === "failed") &&
          inRange(item.date, meta.rangeStart, meta.rangeEnd)
      );
      if (single.length) {
        passedKnown = true;
        if (single.some((item) => item.status === "passed")) {
          passedNames.push({ id: student.id, name: student.name });
        }
      }
    }
    const passedCount = passedKnown ? passedNames.length : null;
    const diff = passedCount == null ? null : sure - passedCount;
    return {
      goalId: String(goal.id),
      text: goal.text,
      sureCount: sure,
      sureNames,
      passedCount,
      passedKnown,
      diff,
      highlight: diff != null && diff >= cfg.gapHighlight
    };
  });

  return {
    buckets,
    quotes,
    patterns,
    helpGroups: Object.values(helpMap).map((item) => ({ ...item, count: item.names.length })),
    multiHelpCount: multi,
    gaps
  };
}

export function topicBoard(students, goals) {
  return (goals || []).map((goal) => {
    const people = [];
    const experts = [];
    for (const student of students) {
      const stand = student.analysis.stands.find((item) => item.goalId === String(goal.id));
      if (stand?.tier === "street_legend" && stand.status === "sicher") {
        experts.push({ id: student.id, name: student.name });
      }
      const today = (student.entries || []).find(
        (entry) => entry.date === student.today && String(entry.whatGoalId) === String(goal.id)
      );
      if (!today) continue;
      people.push({
        id: student.id,
        name: student.name,
        tier: stand?.tier || null,
        tierLabel: stand?.tierLabel || null,
        short: stand?.short || null,
        status: stand?.status || null
      });
    }
    const tips = [];
    if (people.length >= 2) tips.push("Mehrere Personen hängen an diesem Unterthema.");
    if (experts.length) {
      tips.push(
        `Street Legend sicher: ${experts.map((item) => item.name).join(", ")}. Zum Erklären fragen?`
      );
    }
    return {
      goalId: String(goal.id),
      text: goal.text,
      people,
      experts,
      tips
    };
  });
}
