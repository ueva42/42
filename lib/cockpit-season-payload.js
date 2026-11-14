/**
 * Stufe-1 Season-Payload für GET /api/teacher/cockpit (ohne neue Tabellen).
 * Per-goal Levelcheck-Bewertung fehlt — checkpointPassed wird nicht gesetzt.
 */
import { CONFIG } from "./cockpit-config.js";
import {
  matchCityMap,
  isBestaetigt,
  isGemeldet,
  missionRings,
  bossState,
  buildRespectWeek,
  starsFilledCount as countRespectStars,
  seasonProgress,
  seasonTrack,
  learningDaysThisWeek,
  pickHighlights,
  formatBossShield,
  daysUntil
} from "./cockpit-season.js";
import { TRAINING_KEY, MARK_TIERS, isoDay, addDays, weekStart } from "./teacher-cockpit.js";
import { buildTickerPayload } from "./cockpit-events.js";
import { crewTagVisible } from "./cockpit-crews.js";

const RING_TIERS = ["rookie", "operator", "street_legend"];

const RAFFLE_PILL_KEYS = ["planned", "reflected", "gutEingeschätzt", "geholfen"];

const RAFFLE_PILL_LABELS = {
  planned: "Geplant",
  reflected: "Reflektiert",
  gutEingeschätzt: "Gut eingeschätzt",
  geholfen: "Geholfen"
};

const GRADED = new Set(["klassenarbeit", "test", "projektabgabe"]);

const THEMA_NAME_HINTS = [
  ["quadratische", "quadratische-gleichungen"],
  ["potenz", "potenzen"],
  ["wurzel", "potenzen"],
  ["pythagoras", "pythagoras"],
  ["funktion", "funktionen"],
  ["trigono", "trigonometrie"],
  ["sinus", "trigonometrie"]
];

function trainingSafeOf(trainingMap, studentId, goal, tier) {
  if (!goal?.trainingWz) return false;
  const key = TRAINING_KEY[tier];
  if (!key) return false;
  const row = trainingMap.get(`${studentId}|${goal.trainingWz}`);
  return row?.merged?.levels?.[key]?.safe === true;
}

/**
 * Bestätigt für (Schüler, Mission, Stufe).
 * Mit trainingWz: Training-safe bevorzugt; Nachweis (Einheit+Stufe) als Sekundärquelle.
 * Ohne trainingWz: nur Nachweis. Checkpoint-Passed bewusst false (keine saubere Ziel-Zuordnung).
 */
export function studentGoalTierConfirmed({ trainingMap, proofSet, studentId, goal, tier, levelCheckId }) {
  const hasTw = Boolean(goal?.trainingWz);
  const trainingSafe = hasTw ? trainingSafeOf(trainingMap, studentId, goal, tier) : false;
  const hasLevelcheckProof = proofSet.has(`${studentId}|${levelCheckId}|${tier}`);
  // Nachweis ist Einheit+Stufe (nicht je Mission); ohne trainingWz einzige Quelle, sonst Sekundär.
  return isBestaetigt({
    trainingSafe,
    hasLevelcheckProof,
    checkpointPassed: false
  });
}

function resolveThemaId(mapId, unitName, goalWzSet) {
  if (mapId) return mapId;
  const name = String(unitName || "").toLowerCase();
  for (const [hint, id] of THEMA_NAME_HINTS) {
    if (name.includes(hint)) return id;
  }
  const wz = [...goalWzSet][0] || "";
  if (wz.startsWith("qg-")) return "quadratische-gleichungen";
  if (wz.startsWith("pw-")) return "potenzen";
  if (wz.startsWith("py-")) return "pythagoras";
  if (wz.startsWith("fkt-")) return "funktionen";
  if (wz.startsWith("trig-")) return "trigonometrie";
  return null;
}

function bossNameFor(themaId, checkpointIndex, config = CONFIG) {
  const list = (config.bossNamesByThema && themaId && config.bossNamesByThema[themaId]) || null;
  if (!list?.length) return "Klassen-Boss";
  const i = Math.max(0, Math.min(list.length - 1, Number(checkpointIndex) || 0));
  return list[i] || list[0];
}

function pastGradedIndex(unitEvents, day) {
  const past = (unitEvents || []).filter((e) => GRADED.has(e.type) && e.date && e.date < day);
  return past.length;
}

function nextGradedDate(unit) {
  if (unit?.exam?.date) return unit.exam.date;
  const ev = (unit?.events || []).find((e) => GRADED.has(e.type));
  return ev?.date || null;
}

function rafflePills(config = CONFIG) {
  const t = config.raffleTickets || CONFIG.raffleTickets;
  return RAFFLE_PILL_KEYS.filter((id) => t[id] != null).map((id) => ({
    id,
    tickets: t[id],
    label: RAFFLE_PILL_LABELS[id] || id
  }));
}

/**
 * Gut eingeschätzt: Basis = sicher-Meldungen mit Levelcheck-Ergebnis diese Woche;
 * passed = davon bestätigt (Eval passed / Nachweis / Training-safe).
 */
export function assessmentFromSicherMarks({
  studentIds = [],
  goals = [],
  marks = new Map(),
  evalStatusByStudent = new Map(),
  proofThisWeek = new Set(),
  trainingSafeThisWeek = new Set(),
  levelCheckId = ""
} = {}) {
  let basis = 0;
  let passed = 0;
  for (const goal of goals || []) {
    const gid = String(goal.id);
    for (const tier of RING_TIERS) {
      for (const sid of studentIds) {
        const mark = marks.get(`${sid}|${gid}|${tier}`);
        if (!isGemeldet(mark?.status)) continue;
        const evalStatus = evalStatusByStudent.get(Number(sid)) || evalStatusByStudent.get(sid);
        const hasEval = evalStatus === "passed" || evalStatus === "failed";
        const hasProof = proofThisWeek.has(`${sid}|${levelCheckId}|${tier}`) || proofThisWeek.has(`${sid}|${tier}`);
        const tw = goal?.trainingWz;
        const hasTraining =
          Boolean(tw) &&
          (trainingSafeThisWeek.has(`${sid}|${tw}|${tier}`) || trainingSafeThisWeek.has(`${Number(sid)}|${tw}|${tier}`));
        if (!hasEval && !hasProof && !hasTraining) continue;
        basis += 1;
        if (
          isBestaetigt({
            trainingSafe: hasTraining,
            hasLevelcheckProof: hasProof,
            checkpointPassed: evalStatus === "passed"
          })
        ) {
          passed += 1;
        }
      }
    }
  }
  return { basis, passed };
}

function configSlice(config = CONFIG) {
  return {
    mapRingColors: config.mapRingColors,
    mapDarkOpacity: config.mapDarkOpacity,
    beamerViewSeconds: config.beamerViewSeconds,
    pollSeconds: config.pollSeconds,
    highlightMaxPerCategory: config.highlightMaxPerCategory,
    seasonTiers: config.seasonTiers,
    bossLoot: config.bossLoot,
    raffleTickets: config.raffleTickets,
    respectStars: config.respectStars,
    crewTagMinMissing: config.crewTagMinMissing,
    tickerSeconds: config.tickerSeconds ?? 20,
    sideQuestTemplates: config.sideQuestTemplates || [],
    fallbackCrewNames: config.fallbackCrewNames || []
  };
}

function bossLootFromMission(missionRow, config = CONFIG) {
  const lootXp = missionRow?.loot_xp != null ? Number(missionRow.loot_xp) : null;
  const lootText = missionRow?.loot_text ? String(missionRow.loot_text).trim() : "";
  if (lootXp == null && !lootText) return config.bossLoot;
  const out = [];
  if (lootXp != null && Number.isFinite(lootXp)) {
    out.push({ kind: "xp", amount: lootXp, label: `+${lootXp} Klassen-XP` });
  }
  if (lootText) out.push({ kind: "text", label: lootText });
  return out.length ? out : config.bossLoot;
}

function goalByWz(goals) {
  const map = new Map();
  for (const g of goals || []) {
    if (g.trainingWz) map.set(g.trainingWz, g);
  }
  return map;
}

/**
 * @returns {{ season: object }}
 */
export function buildSeasonPayload(input) {
  const {
    day,
    classSize,
    students = [],
    studentIds = [],
    goals = [],
    chosen,
    unit,
    marks,
    trainingMap = new Map(),
    proofSet = new Set(),
    entriesByStudent = new Map(),
    missionRow = null,
    recentLessons = [],
    weekLessonDays = null,
    classXp = 0,
    xpSource = "einheit",
    plannedTodayCount = 0,
    mapsIndex = [],
    mapsDetail = new Map(),
    config = CONFIG,
    rng = Math.random,
    helpedCount = 0,
    helpedStudentIds = [],
    helpedAvailable = true,
    tickerEvents = [],
    crews = [],
    sideQuest = null,
    seasonKey = null,
    learningDaysThisWeek: learningDaysInput = null,
    timetableWeekdays = [],
    assessment = null,
    evalStatusByStudent = new Map(),
    proofThisWeek = new Set(),
    trainingSafeThisWeek = new Set()
  } = input;

  const gaps = [];
  // Per-goal Levelcheck-Bewertung fehlt (checkpoint → Ziele nicht sauber zuordenbar).
  gaps.push("Per-goal Levelcheck-Bewertung fehlt");

  const levelCheckId = chosen?.id != null ? String(chosen.id) : "";
  const goalsSorted = [...goals].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  const goalsById = new Map(goalsSorted.map((g) => [String(g.id), g]));
  const wzSet = new Set(goalsSorted.map((g) => g.trainingWz).filter(Boolean));

  const statusOf = (sid, goalId, tier) =>
    marks.get(`${sid}|${goalId}|${tier}`)?.status || "offen";

  const isConfirmed = (sid, goalId, tier) => {
    const goal = goalsById.get(String(goalId));
    if (!goal) return false;
    return studentGoalTierConfirmed({
      trainingMap,
      proofSet,
      studentId: sid,
      goal,
      tier,
      levelCheckId
    });
  };

  const isReported = (sid, goalId, tier) => isGemeldet(statusOf(sid, goalId, tier));

  // —— Map ——
  const indexEntry = matchCityMap(wzSet, mapsIndex, mapsDetail);
  const detail = indexEntry
    ? typeof mapsDetail.get === "function"
      ? mapsDetail.get(indexEntry.id)
      : mapsDetail[indexEntry.id]
    : null;

  const hereCounts = new Map();
  for (const sid of studentIds) {
    const entries = entriesByStudent.get(Number(sid)) || [];
    const latest = entries[0];
    const gid = latest?.what_goal_id ? String(latest.what_goal_id) : null;
    if (gid) hereCounts.set(gid, (hereCounts.get(gid) || 0) + 1);
  }
  let activeMissionN = null;
  let bestHere = -1;
  for (let i = 0; i < goalsSorted.length; i += 1) {
    const c = hereCounts.get(String(goalsSorted[i].id)) || 0;
    if (c > bestHere) {
      bestHere = c;
      activeMissionN = i + 1;
    }
  }
  if (bestHere <= 0) activeMissionN = null;

  let map = null;
  if (detail?.missions?.length) {
    const byWz = goalByWz(goalsSorted);
    const missions = detail.missions.map((m) => {
      const goal = byWz.get(m.wz) || null;
      const goalId = goal ? String(goal.id) : null;
      const confirmedByTier = {};
      const reportedByTier = {};
      for (const tier of RING_TIERS) {
        let conf = 0;
        let rep = 0;
        if (goalId) {
          for (const sid of studentIds) {
            if (isConfirmed(sid, goalId, tier)) conf += 1;
            if (isReported(sid, goalId, tier)) rep += 1;
          }
        }
        confirmedByTier[tier] = conf;
        reportedByTier[tier] = rep;
      }
      const rings = missionRings({ classSize, confirmedByTier, reportedByTier });
      const confR = confirmedByTier.rookie || 0;
      return {
        n: m.n,
        name: m.name,
        wz: m.wz,
        x: m.x,
        y: m.y,
        goalId,
        rings,
        hereCount: goalId ? hereCounts.get(goalId) || 0 : 0,
        confirmedRookieLabel: `${confR}/${classSize}`
      };
    });
    map = {
      id: detail.id || indexEntry.id,
      name: detail.name || indexEntry.name,
      ort: detail.ort || null,
      klasse: detail.klasse || indexEntry.klasse || null,
      routeColor: detail.routeColor || null,
      viewBox: detail.viewBox || null,
      imageUrl: detail.image ? `/cockpit-karten/${detail.image}` : null,
      start: detail.start || null,
      ziel: detail.ziel || null,
      missions,
      routeSegments: detail.routeSegments || [],
      activeMissionN,
      darkOpacity: config.mapDarkOpacity,
      mode: "city"
    };
  } else {
    gaps.push("Keine passende Stadtkarte — Spur-Ansicht");
    const lanes = goalsSorted.map((goal, i) => {
      let conf = 0;
      let rep = 0;
      const gid = String(goal.id);
      for (const sid of studentIds) {
        // Spur: Rookie als Referenzstufe
        if (isConfirmed(sid, gid, "rookie")) conf += 1;
        if (isReported(sid, gid, "rookie")) rep += 1;
      }
      const n = Math.max(1, classSize);
      return {
        goalId: gid,
        n: i + 1,
        text: goal.text || `Mission ${i + 1}`,
        confirmedFrac: conf / n,
        reportedFrac: rep / n
      };
    });
    map = { mode: "lanes", lanes };
  }

  const themaId = resolveThemaId(map?.mode === "city" ? map.id : null, chosen?.name, wzSet);

  // —— Boss ——
  let boss = null;
  const active =
    missionRow && missionRow.active !== false
      ? missionRow
      : null;
  const bossGoalIds = active
    ? (Array.isArray(active.goal_ids) ? active.goal_ids : []).map(String)
    : [];
  const bossTier = active?.tier || "rookie";
  if (active) {
    const dueDate = isoDay(active.due_date) || null;
    const name = bossNameFor(themaId, pastGradedIndex(unit?.events, day), config);
    const forceWin = Boolean(active.boss_won_at || active.bossWonAt);
    const state = bossState({
      studentIds,
      missionGoalIds: bossGoalIds,
      tier: bossTier,
      isConfirmed: (sid, goalId, t) => isConfirmed(sid, goalId, t),
      bossName: name,
      dueDate,
      forceWin
    });
    const hitByMission = state.hitByMission.map((row) => {
      const g = goalsById.get(String(row.goalId));
      const idx = goalsSorted.findIndex((x) => String(x.id) === String(row.goalId));
      return {
        goalId: row.goalId,
        n: idx >= 0 ? idx + 1 : null,
        label: g?.text || `Mission`,
        hits: row.hits
      };
    });
    const weak = state.weakGoalId ? goalsById.get(String(state.weakGoalId)) : null;
    boss = {
      name: state.name,
      dueDate: state.dueDate,
      shieldLabel: formatBossShield(state.dueDate),
      energy: state.energy,
      hits: state.hits,
      remaining: forceWin ? 0 : state.remaining,
      defeated: state.defeated,
      weakGoalId: state.weakGoalId,
      weakLabel: weak?.text || null,
      hitByMission,
      loot: bossLootFromMission(active, config),
      forceWin,
      bossWonAt: active.boss_won_at || active.bossWonAt || null
    };
  }

  // —— KPIs ——
  let completed = 0;
  for (const sid of studentIds) {
    const entries = entriesByStudent.get(Number(sid)) || [];
    const latest = entries[0];
    if (!latest) continue;
    const checked = !!latest.check_created_at;
    const reflected = !!latest.reflection_created_at;
    const gid = latest.what_goal_id ? String(latest.what_goal_id) : null;
    let markOk = false;
    if (gid) {
      for (const tier of MARK_TIERS) {
        if (isReported(sid, gid, tier)) {
          markOk = true;
          break;
        }
      }
    }
    if (checked || reflected || markOk) completed += 1;
  }

  const examDate = nextGradedDate(unit);
  const bossEnergyPct =
    boss && boss.energy > 0 ? Math.min(1, boss.hits / boss.energy) : 0;

  const dayJs = day ? new Date(`${String(day).slice(0, 10)}T12:00:00`) : null;
  const todayIsoWd = dayJs && !Number.isNaN(dayJs.getTime()) ? (dayJs.getDay() === 0 ? 7 : dayJs.getDay()) : null;
  const wdSet = new Set(
    [...(timetableWeekdays || [])].map(Number).filter((n) => Number.isFinite(n) && n >= 1 && n <= 7)
  );
  const hasTimetable = wdSet.size > 0;
  const noLessonToday =
    todayIsoWd == null
      ? false
      : hasTimetable
        ? !wdSet.has(todayIsoWd)
        : todayIsoWd === 6 || todayIsoWd === 7;

  const kpis = {
    started: plannedTodayCount,
    classSize,
    completed,
    bossEnergyPct,
    daysUntilExam: examDate ? daysUntil(day, examDate) : null,
    noLessonToday
  };

  // —— Respect (Lerntage Mo–So, nur erreichte Sterne zählen) ——
  const dayCounts =
    Array.isArray(weekLessonDays) && weekLessonDays.length
      ? weekLessonDays
      : (recentLessons || []).filter((r) => {
          const ws = weekStart(day);
          const d = r.date || r.iso;
          return d && d >= ws && d <= day;
        });

  const learningDays =
    Array.isArray(learningDaysInput) && learningDaysInput.length
      ? learningDaysInput
      : learningDaysThisWeek({
          isoToday: day,
          classSize,
          timetableWeekdays,
          dayCounts
        });

  if (!learningDays.length) {
    gaps.push("Respekt: noch kein Lerntag diese Woche");
  }

  const assessmentCounts =
    assessment && typeof assessment === "object"
      ? {
          basis: Math.max(0, Number(assessment.basis) || 0),
          passed: Math.max(0, Number(assessment.passed) || 0)
        }
      : assessmentFromSicherMarks({
          studentIds,
          goals: goalsSorted,
          marks,
          evalStatusByStudent,
          proofThisWeek,
          trainingSafeThisWeek,
          levelCheckId
        });

  const respect = buildRespectWeek({
    learningDaysThisWeek: learningDays,
    assessment: assessmentCounts,
    helpedCount: Number(helpedCount) || 0,
    helpedAvailable: helpedAvailable !== false,
    config
  });

  const starsFilledCount = countRespectStars(respect);

  // —— Highlights (7 Tage) ——
  const since7 = addDays(day, -6);
  const gut = [];
  const expert = [];
  const planGeschafft = [];
  const helpedSet = new Set((helpedStudentIds || []).map(Number));

  for (const sid of studentIds) {
    let gutHit = false;
    let expertHit = false;
    for (const goal of goalsSorted) {
      const gid = String(goal.id);
      for (const tier of RING_TIERS) {
        const mark = marks.get(`${sid}|${gid}|${tier}`);
        if (!mark || !isGemeldet(mark.status)) continue;
        if (!isConfirmed(sid, gid, tier)) continue;
        const upd = isoDay(mark.updated_at);
        if (upd && upd >= since7 && upd <= day) gutHit = true;
        if (tier === "street_legend") expertHit = true;
      }
    }
    if (helpedSet.has(Number(sid))) expertHit = true;
    if (gutHit) gut.push(sid);
    if (expertHit) expert.push(sid);

    const entries = entriesByStudent.get(Number(sid)) || [];
    const latest = entries[0];
    if (latest && (latest.check_created_at || latest.reflection_created_at)) {
      planGeschafft.push(sid);
    }
  }

  gaps.push("Highlights Dranbleiber: Streak-Daten fehlen");
  gaps.push("Taktik-Deck öffnen schreibt noch kein Ereignis (kein API)");

  const namesById = {};
  for (const s of students) {
    namesById[s.id] = s.shortName || s.name || String(s.id);
  }

  const highlights = pickHighlights({
    categories: {
      gutEingeschätzt: gut,
      planGeschafft,
      expert,
      dranbleiber: []
    },
    namesById,
    maxPerCat: config.highlightMaxPerCategory,
    rng
  });

  const xpTitle = xpSource === "gesamt" ? "Klassen-XP" : "Season-XP";
  const progress = seasonProgress(classXp, config.seasonTiers);
  const track = seasonTrack(classXp, config.seasonTiers);
  const seasonBar = {
    ...progress,
    ...track,
    xp: progress.xp,
    xpSource,
    title: xpTitle,
    titleKey: xpSource
  };

  // —— Crews (Beamer-Fortschritt + Karten-Tags) ——
  const minMissing = config.crewTagMinMissing ?? CONFIG.crewTagMinMissing ?? 1;
  const crewViews = [];
  const mapTags = [];
  for (const crew of crews || []) {
    if (!crew?.released) continue;
    const memberIds = (crew.members || []).map((m) => Number(m.id ?? m));
    const size = memberIds.length;
    let confirmedOnBoss = 0;
    if (bossGoalIds.length && size) {
      for (const sid of memberIds) {
        const ok = bossGoalIds.every((gid) => isConfirmed(sid, gid, bossTier));
        if (ok) confirmedOnBoss += 1;
      }
    }
    crewViews.push({
      id: crew.id,
      name: crew.name || "Crew",
      color: crew.color || "#22d3ee",
      tagText: crew.tagText || crew.tag_text || null,
      size,
      confirmed: confirmedOnBoss,
      label: `${confirmedOnBoss}/${size}`
    });
    if (!map || map.mode !== "city") continue;
    for (const m of map.missions || []) {
      if (!m.goalId) continue;
      let conf = 0;
      for (const sid of memberIds) {
        if (isConfirmed(sid, m.goalId, "rookie")) conf += 1;
      }
      if (crewTagVisible({ crewSize: size, confirmedOnMission: conf, minMissing })) {
        mapTags.push({
          crewId: crew.id,
          missionN: m.n,
          x: m.x,
          y: m.y,
          text: crew.tagText || crew.tag_text || crew.name || "Crew",
          color: crew.color || "#22d3ee"
        });
      }
    }
  }
  if (map && map.mode === "city") {
    map.crewTags = mapTags;
  }

  const ticker = buildTickerPayload(tickerEvents, { limit: 6 });

  let sideQuestView = null;
  if (sideQuest) {
    const ziel = Number(sideQuest.ziel) || 1;
    const progress = Math.min(ziel, Number(sideQuest.progress) || 0);
    sideQuestView = {
      id: sideQuest.id,
      typ: sideQuest.typ,
      text: sideQuest.text,
      ziel,
      xp: Number(sideQuest.xp) || 0,
      progress,
      done: sideQuest.done === true || progress >= ziel,
      auto: sideQuest.auto === true
    };
  }

  return {
    config: configSlice(config),
    map,
    boss,
    kpis,
    respect,
    seasonBar,
    raffleRules: rafflePills(config),
    highlights,
    showNamesOnBeamer: true,
    starsFilledCount,
    ticker,
    sideQuest: sideQuestView,
    crews: crewViews,
    seasonKey: seasonKey || null,
    gaps
  };
}
