/**
 * Lehrer-Cockpit: reine Rechenlogik ohne Datenbank.
 * Hinweise, keine Rangliste: Ergebnisse sind Zählungen und Abstände zum Plan, keine Reihenfolgen.
 */
import route from "../public/js/levelplan-route.js";
import { bandFromSolved, vergleich, SICHER_AB } from "./training-merge.js";

export const MARK_TIERS = ["rookie", "operator", "street_legend"];
/** Wie classes.active_levels / server ACTIVE_LEVEL_OPTIONS. */
export const ACTIVE_LEVEL_OPTIONS = ["unterthema", "rookie", "operator", "street_legend"];
export const DEFAULT_ACTIVE_LEVELS = ["rookie", "operator", "street_legend"];
export const TRAINING_KEY = {
  unterthema: null,
  rookie: "rookie",
  operator: "operator",
  street_legend: "streetLegend"
};
export const TIER_LABEL = {
  unterthema: "Unterthema",
  rookie: "Rookie",
  operator: "Operator",
  street_legend: "Street Legend"
};
export const TIER_SHORT = { unterthema: "U", rookie: "R", operator: "O", street_legend: "SL" };
export const GAME_XP_OPTIONS = [5, 10, 15, 20];
export const DEFAULT_GAME_XP = 10;
export const IDLE_AFTER_DAYS = 5;

/**
 * Normalisiert classes.active_levels (Array oder JSON-String).
 * Leer/ungültig → Rookie/Operator/Street Legend (wie server.js).
 */
export function normalizeActiveLevels(raw) {
  let arr = raw;
  if (typeof raw === "string") {
    try {
      arr = JSON.parse(raw);
    } catch {
      arr = null;
    }
  }
  if (!Array.isArray(arr) || !arr.length) return [...DEFAULT_ACTIVE_LEVELS];
  const wanted = new Set(
    arr.map((tier) => (typeof tier === "string" ? tier : tier?.id)).filter((tier) => ACTIVE_LEVEL_OPTIONS.includes(tier))
  );
  const filtered = ACTIVE_LEVEL_OPTIONS.filter((tier) => wanted.has(tier));
  return filtered.length ? filtered : [...DEFAULT_ACTIVE_LEVELS];
}

/**
 * Welche Stufen die Lehrer-UI zeigen soll.
 * Nur Unterthema → keine R/O/SL-Spalten, Fortschritt am Unterthema.
 * Teilmenge (z. B. Rookie+Operator) → nur diese Stufen.
 */
export function resolveClassLevels(raw) {
  const activeLevels = normalizeActiveLevels(raw);
  const markTiers = MARK_TIERS.filter((tier) => activeLevels.includes(tier));
  const unterthemaActive = activeLevels.includes("unterthema");
  const stagesEnabled = markTiers.length > 0;
  const displayTiers = stagesEnabled ? markTiers : unterthemaActive ? ["unterthema"] : [...MARK_TIERS];
  const missionTiers = stagesEnabled ? markTiers : ["unterthema"];
  return {
    activeLevels,
    markTiers,
    displayTiers,
    missionTiers,
    stagesEnabled,
    unterthemaOnly: !stagesEnabled && unterthemaActive
  };
}

/** Zielnoten-Anteile auf aktive Mark-Stufen beschränken. */
export function filterGradeRules(rules, markTiers) {
  if (!rules) return null;
  const allowed = new Set(markTiers?.length ? markTiers : MARK_TIERS);
  const out = { rookie: 0, operator: 0, street_legend: 0 };
  for (const tier of MARK_TIERS) {
    out[tier] = allowed.has(tier) ? Number(rules[tier]) || 0 : 0;
  }
  return out;
}

/**
 * statusOf so wrappen, dass inaktive Stufen den Missionsfortschritt nicht blockieren.
 * Nur-Unterthema: jede Abfrage liefert den Unterthema-Status.
 */
export function wrapStatusForLevels(statusOf, levels) {
  if (levels?.unterthemaOnly) {
    return (goal, _tier) => statusOf(goal, "unterthema");
  }
  const active = new Set(levels?.markTiers?.length ? levels.markTiers : MARK_TIERS);
  return (goal, tier) => (active.has(tier) ? statusOf(goal, tier) : "sicher");
}

const GRADED = new Set(["klassenarbeit", "test", "projektabgabe"]);
const TYPE_LABEL = {
  klassenarbeit: "Klassenarbeit",
  test: "Test",
  projektabgabe: "Projektabgabe",
  levelcheck: "Levelcheck"
};

export function isoDay(value) {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return "";
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const text = String(value || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

export function addDays(iso, count) {
  const date = new Date(`${iso}T12:00:00`);
  date.setDate(date.getDate() + count);
  return isoDay(date);
}

export function daysBetween(fromIso, toIso) {
  const a = new Date(`${fromIso}T12:00:00`).getTime();
  const b = new Date(`${toIso}T12:00:00`).getTime();
  return Math.round((b - a) / 86400000);
}

export function weekStart(today) {
  const date = new Date(`${today}T12:00:00`);
  const js = date.getDay();
  date.setDate(date.getDate() + (js === 0 ? -6 : 1 - js));
  return isoDay(date);
}

/** Gleiche Auswahl wie /api/teacher/regulation, damit beide Ansichten dieselbe Einheit zeigen. */
export function pickCheck(checks, requestedId, today) {
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

function datedPoints(check) {
  return (check?.checkpoints || [])
    .map((point) => ({
      date: isoDay(point.checkpointDate),
      type: String(point.checkpointType || "").toLowerCase(),
      linkedGoalIds: (point.linkedSubtopicIds || []).map(String)
    }))
    .filter((point) => point.date)
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function nextExam(check, today) {
  const point = datedPoints(check).find((p) => GRADED.has(p.type) && p.date >= today);
  if (!point) return null;
  return {
    date: point.date,
    type: point.type,
    label: TYPE_LABEL[point.type] || "Arbeit",
    linkedGoalIds: point.linkedGoalIds
  };
}

export function lastLinkedIndex(goalIds, linkedGoalIds) {
  const linked = new Set((linkedGoalIds || []).map(String));
  let index = -1;
  (goalIds || []).forEach((id, i) => {
    if (linked.has(String(id))) index = i;
  });
  return index;
}

/**
 * Zeitachse der Einheit: Start, vorheriger und nächster Levelcheck, nächste Arbeit.
 * Start wie im Dashboard: Tag nach der letzten benoteten Arbeit, sonst Anlagedatum der Einheit.
 */
export function unitTimeline(check, today) {
  const points = datedPoints(check);
  const goalIds = (check?.goals || []).map((goal) => String(goal.id));
  const previousGraded = [...points].reverse().find((p) => GRADED.has(p.type) && p.date < today);
  let start = previousGraded ? addDays(previousGraded.date, 1) : isoDay(check?.createdAt);
  if (!start || start > today) start = today;
  const levelchecks = points.filter((p) => p.type === "levelcheck");
  const nextLevelcheck = levelchecks.find((p) => p.date >= today && lastLinkedIndex(goalIds, p.linkedGoalIds) >= 0) || null;
  const prevLevelcheck =
    [...levelchecks].reverse().find((p) => p.date < today && p.date >= start && lastLinkedIndex(goalIds, p.linkedGoalIds) >= 0) ||
    null;
  const exam = nextExam(check, today);
  const events = points
    .filter((p) => p.date >= start)
    .map((p) => ({
      date: p.date,
      type: p.type,
      label: TYPE_LABEL[p.type] || "Termin",
      lastMission: lastLinkedIndex(goalIds, p.linkedGoalIds)
    }));
  return { start, today, prevLevelcheck, nextLevelcheck, exam, events };
}

/** Ziel des Plans: bis zum nächsten Levelcheck, sonst bis zur nächsten Arbeit. */
export function planTarget(goalIds, unit) {
  const ids = (goalIds || []).map(String);
  if (!ids.length || !unit) return null;
  if (unit.nextLevelcheck) {
    const planIndex = lastLinkedIndex(ids, unit.nextLevelcheck.linkedGoalIds);
    if (planIndex >= 0) {
      return { kind: "levelcheck", label: "Levelcheck", date: unit.nextLevelcheck.date, planIndex };
    }
  }
  if (unit.exam) {
    const linked = lastLinkedIndex(ids, unit.exam.linkedGoalIds);
    return {
      kind: "exam",
      label: unit.exam.label,
      date: unit.exam.date,
      planIndex: linked >= 0 ? linked : ids.length - 1
    };
  }
  return null;
}

/**
 * Plan-Geist: wie viele Missionen die Klasse heute bei gleichmäßigem Tempo geschafft hätte.
 * Linear zwischen Ankerdatum (letzter Levelcheck oder Einheitsstart) und Zieldatum.
 */
export function ghostDone(goalIds, unit, target) {
  if (!target || !unit) return null;
  const ids = (goalIds || []).map(String);
  let anchorDate = unit.start;
  let anchorDone = 0;
  if (unit.prevLevelcheck) {
    anchorDate = unit.prevLevelcheck.date;
    anchorDone = lastLinkedIndex(ids, unit.prevLevelcheck.linkedGoalIds) + 1;
  }
  const targetDone = target.planIndex + 1;
  const span = daysBetween(anchorDate, target.date);
  const walked = daysBetween(anchorDate, unit.today);
  const fraction = span <= 0 ? 1 : Math.max(0, Math.min(1, walked / span));
  const expected = anchorDone + (targetDone - anchorDone) * fraction;
  return Math.round(Math.max(0, Math.min(ids.length, expected)) * 100) / 100;
}

/** Nächste offene Mission nach Zielpfad, wie die Route der Schüler:innen. */
export function studentPosition(goals, rules, statusOf) {
  const list = goals || [];
  const total = list.length;
  if (!total) return { current: 0, done: 0, allDone: false };
  const current = route.currentMissionIndex(list, rules, statusOf);
  const allDone = list.every((goal, i) => route.missionIsDone(goal, i, total, rules, statusOf));
  return { current, done: allDone ? total : current, allDone };
}

/** Abstand zum Plan-Geist. Kein Wettbewerb: drei Farben, keine Platzierung. */
export function paceStatus(done, expected) {
  if (expected == null || !Number.isFinite(Number(expected))) return "none";
  const gap = Number(expected) - Number(done);
  if (gap < 1) return "ok";
  if (gap < 2) return "mid";
  return "low";
}

export function paceText(done, target) {
  if (!target) return "kein Termin";
  const need = target.planIndex + 1 - Number(done);
  if (need <= 0) return `${target.label}-Missionen geschafft`;
  return `noch ${need} ${need === 1 ? "Mission" : "Missionen"}`;
}

export function tierRank(tier) {
  if (tier === "unterthema") return -1;
  return MARK_TIERS.indexOf(tier);
}

/** Klassen-Mission: wer jede gewählte Mission auf der Stufe (oder höher) sicher hat, zählt als geschafft. */
export function classMissionDone(goalIds, tier, statusOf) {
  if (tier === "unterthema") {
    return (goalIds || []).every((goalId) => statusOf(String(goalId), "unterthema") === "sicher");
  }
  const need = Math.max(0, tierRank(tier));
  return (goalIds || []).every((goalId) =>
    MARK_TIERS.slice(need).some((t) => statusOf(String(goalId), t) === "sicher")
  );
}

export function classMissionProgress(mission, studentIds, statusOfStudent) {
  const ids = studentIds || [];
  let done = 0;
  for (const id of ids) {
    if (classMissionDone(mission.goalIds, mission.tier, (goalId, tier) => statusOfStudent(id, goalId, tier))) {
      done += 1;
    }
  }
  return { done, total: ids.length };
}

export function missionNumbersText(numbers) {
  const list = [...new Set((numbers || []).map(Number).filter((n) => n > 0))].sort((a, b) => a - b);
  if (!list.length) return "";
  const consecutive = list.every((n, i) => i === 0 || n === list[i - 1] + 1);
  if (list.length === 1) return `Mission ${list[0]}`;
  if (consecutive) return `Mission ${list[0]}–${list[list.length - 1]}`;
  return `Mission ${list.slice(0, -1).join(", ")} und ${list[list.length - 1]}`;
}

export function classMissionTitle({ numbers, tier, dueDate }) {
  const when = dueDate ? route.formatShortDate(dueDate) : "";
  const what = missionNumbersText(numbers) || "die Missionen";
  if (tier === "unterthema") {
    return `${when ? `Bis ${when}` : "Gemeinsam"} haben alle ${what} sicher.`;
  }
  const level = TIER_LABEL[tier] || "Rookie";
  return `${when ? `Bis ${when}` : "Gemeinsam"} haben alle ${what} auf ${level} sicher.`;
}

/** Trainingscenter für alle Themen: Bänder je Mission und Stufe aus training_results.merged.
 *  markTiers: undefined = alle Stufen; [] = keine Stufen (nur Unterthema aktiv). */
export function trainingBoard(goals, studentIds, trainingOf, today, markTiers) {
  const tiersToCount =
    markTiers === undefined || markTiers === null
      ? MARK_TIERS
      : (markTiers || []).filter((tier) => MARK_TIERS.includes(tier));
  const missions = [];
  const self = { passt: 0, "überschätzt": 0, "unterschätzt": 0 };
  const overByStudent = new Map();
  const idle = [];
  const latestByStudent = new Map();
  for (const goal of goals || []) {
    if (!goal.trainingWz) continue;
    const tiers = {};
    for (const tier of tiersToCount) tiers[tier] = { sicher: 0, teilweise: 0, nochNicht: 0, offen: 0 };
    for (const studentId of studentIds || []) {
      const row = trainingOf(studentId, goal.trainingWz);
      const merged = row?.merged || null;
      for (const tier of tiersToCount) {
        const key = TRAINING_KEY[tier];
        const level = merged?.levels?.[key];
        const solved = Number(level?.solved) || 0;
        if (!solved && level?.safe !== true) {
          tiers[tier].offen += 1;
          continue;
        }
        const band = level?.safe === true ? "sicher" : bandFromSolved(solved);
        if (band === "sicher") tiers[tier].sicher += 1;
        else if (band === "teilweise") tiers[tier].teilweise += 1;
        else tiers[tier].nochNicht += 1;
        const ich = merged?.ichKann?.[key];
        const cmp = ich ? vergleich(solved, ich) : null;
        if (cmp) {
          self[cmp] += 1;
          if (cmp === "überschätzt") {
            if (!overByStudent.has(studentId)) overByStudent.set(studentId, []);
            overByStudent.get(studentId).push({ goalId: String(goal.id), tier, solved });
          }
        }
        if (band !== "sicher") {
          const updated = isoDay(row?.updatedAt);
          const prev = latestByStudent.get(studentId);
          if (updated && (!prev || updated > prev.updated)) {
            latestByStudent.set(studentId, { updated, goalId: String(goal.id), tier, solved });
          }
        }
      }
    }
    missions.push({ goalId: String(goal.id), trainingWz: goal.trainingWz, tiers });
  }
  for (const [studentId, info] of latestByStudent) {
    const days = daysBetween(info.updated, today);
    if (days >= IDLE_AFTER_DAYS) idle.push({ studentId, goalId: info.goalId, tier: info.tier, solved: info.solved, days });
  }
  idle.sort((a, b) => b.days - a.days);
  return {
    missions,
    self,
    over: [...overByStudent].map(([studentId, items]) => ({ studentId, items })),
    idle,
    sicherAb: SICHER_AB
  };
}

/**
 * Beamer: größter Fortschritt heute = meiste neue „sicher“-Markierungen (Einheit).
 * trainingById ist optionaler Tiebreaker (z. B. gelöste Trainingsaufgaben bei Update heute).
 */
export function rankProgressLeaders({ students, sicherById, trainingById = null, limit = 5 } = {}) {
  const list = (students || [])
    .map((s) => {
      const id = Number(s.id);
      const sicherToday = Number(sicherById?.get?.(id) ?? sicherById?.[id]) || 0;
      const trainingToday = Number(trainingById?.get?.(id) ?? trainingById?.[id]) || 0;
      return {
        id,
        name: s.name,
        avatarUrl: s.avatarUrl || null,
        characterName: s.characterName || null,
        sicherToday,
        trainingToday,
        score: sicherToday * 100 + trainingToday
      };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || b.sicherToday - a.sicherToday || String(a.name).localeCompare(String(b.name), "de"))
    .slice(0, Math.max(0, limit));
  return list.map((s, i) => ({ ...s, rank: i + 1 }));
}

/**
 * Beamer: Aufholer = Fortschritt heute unter denen, die noch hinter dem Plan-Geist liegen.
 * Ohne gestrigen Snapshot: wer heute sichert und danach noch nicht klar vor dem Plan ist.
 */
export function rankCatchUpLeaders({ students, sicherById, ghost, limit = 5 } = {}) {
  if (ghost == null || !Number.isFinite(Number(ghost))) return [];
  const expected = Number(ghost);
  const list = (students || [])
    .map((s) => {
      const id = Number(s.id);
      const sicherToday = Number(sicherById?.get?.(id) ?? sicherById?.[id]) || 0;
      const done = Number(s.done) || 0;
      const gap = expected - done;
      return {
        id,
        name: s.name,
        avatarUrl: s.avatarUrl || null,
        characterName: s.characterName || null,
        sicherToday,
        done,
        gap: Math.round(gap * 10) / 10,
        score: sicherToday
      };
    })
    .filter((s) => s.sicherToday > 0 && s.gap >= 1)
    .sort(
      (a, b) =>
        b.sicherToday - a.sicherToday ||
        b.gap - a.gap ||
        String(a.name).localeCompare(String(b.name), "de")
    )
    .slice(0, Math.max(0, limit));
  return list.map((s, i) => ({ ...s, rank: i + 1 }));
}

/** Team des Tages: Durchschnitt statt Summe, damit kleine Teams genauso gewinnen können. */
export function teamStats(memberIds, reflectedSet, newSicherByStudent) {
  const ids = (memberIds || []).map(Number);
  const memberCount = ids.length;
  const reflectedCount = ids.filter((id) => reflectedSet.has(id)).length;
  const sicherSum = ids.reduce((sum, id) => sum + (Number(newSicherByStudent?.get(id)) || 0), 0);
  return {
    memberCount,
    reflectedCount,
    share: memberCount ? reflectedCount / memberCount : 0,
    avgNewSicher: memberCount ? Math.round((sicherSum / memberCount) * 10) / 10 : 0,
    goalReached: memberCount > 0 && reflectedCount === memberCount
  };
}

export function raffleEligible(studentIds, reflectedSet) {
  return (studentIds || []).map(Number).filter((id) => reflectedSet.has(id));
}

export function pickWinner(ids, randomInt) {
  if (!ids?.length) return null;
  const index = Number(randomInt(ids.length));
  return ids[Math.max(0, Math.min(ids.length - 1, index))];
}

export function normalizeGameXp(value) {
  const n = Number(value);
  return GAME_XP_OPTIONS.includes(n) ? n : DEFAULT_GAME_XP;
}

/** Fachstunden laut Stundenplan zwischen heute (exklusiv) und Termin (exklusiv). Ferien kennt die App nicht. */
export function lessonsUntil(timetable, today, untilDate) {
  if (!untilDate || !today || untilDate <= today) return { count: 0, days: [] };
  const perWeekday = new Map();
  for (const slot of timetable || []) {
    const wd = Number(slot.weekday);
    perWeekday.set(wd, (perWeekday.get(wd) || 0) + 1);
  }
  let count = 0;
  const days = [];
  let cursor = addDays(today, 1);
  let guard = 0;
  while (cursor < untilDate && guard < 400) {
    const js = new Date(`${cursor}T12:00:00`).getDay();
    const wd = js === 0 ? 7 : js;
    const n = perWeekday.get(wd) || 0;
    if (n) {
      count += n;
      days.push(cursor);
    }
    cursor = addDays(cursor, 1);
    guard += 1;
  }
  return { count, days };
}
