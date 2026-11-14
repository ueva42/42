/**
 * Reine Cockpit-Logik (ohne DB): Karte, Boss, Respekt, Season, Highlights.
 */

import { CONFIG } from "./cockpit-config.js";

const TIERS = ["rookie", "operator", "street_legend"];

const WEEKDAY_DE = ["SO", "MO", "DI", "MI", "DO", "FR", "SA"];

const HIGHLIGHT_ORDER = [
  "gutEingeschätzt",
  "planGeschafft",
  "expert",
  "dranbleiber"
];

function asSet(value) {
  if (value instanceof Set) return value;
  if (Array.isArray(value)) return new Set(value);
  if (value == null) return new Set();
  return new Set(value);
}

/** Mission-wz-Liste aus Index-Eintrag und optionaler Detail-Map. */
function missionWzList(entry, mapsDetail) {
  if (mapsDetail) {
    const detail =
      typeof mapsDetail.get === "function"
        ? mapsDetail.get(entry.id)
        : mapsDetail[entry.id];
    if (detail?.missions?.length) {
      return detail.missions.map((m) => m.wz).filter(Boolean);
    }
  }
  if (Array.isArray(entry.missions) && entry.missions.length) {
    if (typeof entry.missions[0] === "object") {
      return entry.missions.map((m) => m.wz).filter(Boolean);
    }
  }
  return null;
}

/**
 * Stadtteil wählen: Mission-wz der Karte ⊆ goalWzSet, höchste Überlappung.
 * Exakte Mengen-Gleichheit gewinnt. Sonst null.
 */
export function matchCityMap(goalWzSet, mapsIndex, mapsDetail) {
  const goals = asSet(goalWzSet);
  if (!goals.size || !Array.isArray(mapsIndex) || !mapsIndex.length) return null;

  let exact = null;
  let best = null;
  let bestOverlap = -1;

  for (const entry of mapsIndex) {
    const wzList = missionWzList(entry, mapsDetail);
    if (!wzList?.length) continue;

    const mapSet = new Set(wzList);
    let subset = true;
    let overlap = 0;
    for (const wz of mapSet) {
      if (goals.has(wz)) overlap += 1;
      else {
        subset = false;
        break;
      }
    }
    if (!subset) continue;

    const isExact = mapSet.size === goals.size && overlap === goals.size;
    if (isExact) {
      exact = entry;
      break;
    }
    if (overlap > bestOverlap) {
      bestOverlap = overlap;
      best = entry;
    }
  }

  return exact || best;
}

/** Gemeldet = Schüler:in hat Status „sicher“ gesetzt. */
export function isGemeldet(status) {
  return status === "sicher";
}

/**
 * Bestätigt = Level wirklich bestanden.
 * Reihenfolge der Quellen: Levelcheck vor Nachweis/Training.
 */
export function isBestaetigt({
  trainingSafe = false,
  hasLevelcheckProof = false,
  checkpointPassed = false
} = {}) {
  // Levelcheck (checkpointPassed) → Nachweis (hasLevelcheckProof) → Training
  return Boolean(checkpointPassed || hasLevelcheckProof || trainingSafe);
}

/**
 * Ring-Anteile 0…1 je Tier für Missions-Marker.
 * confirmedByTier / reportedByTier: Anzahlen { rookie, operator, street_legend }.
 */
export function missionRings({ classSize, confirmedByTier, reportedByTier }) {
  const n = Math.max(0, Number(classSize) || 0);
  const out = {};
  for (const tier of TIERS) {
    const confirmed = n > 0 ? Math.min(1, (confirmedByTier?.[tier] || 0) / n) : 0;
    const reported = n > 0 ? Math.min(1, (reportedByTier?.[tier] || 0) / n) : 0;
    out[tier] = { confirmed, reported };
  }
  return out;
}

/**
 * Boss-Energie = Schüler × Missionen; Treffer = bestätigte Paare auf dem verlangten Tier.
 */
export function bossState({
  studentIds = [],
  missionGoalIds = [],
  tier,
  isConfirmed,
  bossName,
  dueDate,
  forceWin = false
}) {
  const students = studentIds || [];
  const goals = missionGoalIds || [];
  const energy = students.length * goals.length;

  const hitByMission = goals.map((goalId) => {
    let hits = 0;
    for (const sid of students) {
      if (isConfirmed?.(sid, goalId, tier)) hits += 1;
    }
    return { goalId, hits };
  });

  const hits = hitByMission.reduce((sum, row) => sum + row.hits, 0);
  const remaining = Math.max(0, energy - hits);
  const defeated = forceWin || remaining === 0;

  let weakGoalId = null;
  let weakHits = Infinity;
  for (const row of hitByMission) {
    if (row.hits < weakHits) {
      weakHits = row.hits;
      weakGoalId = row.goalId;
    }
  }
  if (!goals.length) weakGoalId = null;

  return {
    energy,
    hits,
    remaining,
    defeated,
    weakGoalId,
    hitByMission,
    name: bossName,
    dueDate,
    lootUnlocked: defeated
  };
}

function isoDayLocal(value) {
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

function addDaysLocal(iso, count) {
  const date = new Date(`${iso}T12:00:00`);
  date.setDate(date.getDate() + count);
  return isoDayLocal(date);
}

/** Montag–Sonntag der Kalenderwoche (Europe/Berlin-Kalendertag). */
export function weekBoundsBerlin(isoDay) {
  const day = isoDayLocal(isoDay);
  if (!day) return { start: "", end: "" };
  const date = new Date(`${day}T12:00:00`);
  const js = date.getDay();
  date.setDate(date.getDate() + (js === 0 ? -6 : 1 - js));
  const start = isoDayLocal(date);
  return { start, end: addDaysLocal(start, 6) };
}

/**
 * Lerntage dieser Woche bis heute inkl.
 * Mit Stundenplan: Wochentag hat Fach-Unterricht.
 * Ohne Stundenplan: Tag mit ≥1 geplanter Person.
 */
export function learningDaysThisWeek({
  isoToday,
  classSize = 0,
  timetableWeekdays = [],
  dayCounts = []
} = {}) {
  const today = isoDayLocal(isoToday);
  if (!today) return [];
  const { start, end } = weekBoundsBerlin(today);
  const byDate = new Map();
  for (const row of dayCounts || []) {
    const d = isoDayLocal(row.date || row.iso);
    if (!d) continue;
    byDate.set(d, {
      plannedCount: Number(row.plannedCount ?? row.planned) || 0,
      reflectedCount: Number(row.reflectedCount ?? row.reflected) || 0
    });
  }
  const wdSet = new Set(
    [...(timetableWeekdays || [])].map(Number).filter((n) => Number.isFinite(n) && n >= 1 && n <= 7)
  );
  const hasTimetable = wdSet.size > 0;
  const out = [];
  let cursor = start;
  while (cursor && cursor <= end && cursor <= today) {
    const js = new Date(`${cursor}T12:00:00`).getDay();
    const isoWd = js === 0 ? 7 : js;
    const stats = byDate.get(cursor) || { plannedCount: 0, reflectedCount: 0 };
    const isLearning = hasTimetable ? wdSet.has(isoWd) : stats.plannedCount >= 1;
    if (isLearning) {
      out.push({
        date: cursor,
        plannedCount: stats.plannedCount,
        reflectedCount: stats.reflectedCount,
        classSize: Math.max(0, Number(classSize) || 0)
      });
    }
    cursor = addDaysLocal(cursor, 1);
  }
  return out;
}

function respectStar({ id, label, status, wert, ziel, einheit, text, comingSoon = false }) {
  return {
    id,
    label,
    status,
    wert,
    ziel,
    einheit,
    text,
    filled: status === "erreicht",
    // Aliase für ältere UI
    value: wert,
    target: ziel,
    ...(comingSoon ? { comingSoon: true } : {})
  };
}

function longestPlannedStreak(days, rateThreshold) {
  let best = 0;
  let run = 0;
  const sorted = [...(days || [])].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  for (const d of sorted) {
    const size = Math.max(0, Number(d.classSize) || 0);
    const planned = Math.max(0, Number(d.plannedCount) || 0);
    const rate = size > 0 ? planned / size : 0;
    if (rate >= rateThreshold) {
      run += 1;
      if (run > best) best = run;
    } else {
      run = 0;
    }
  }
  return best;
}

/**
 * Respekt-Sterne dieser Woche (Klasse als Ganzes).
 * Nur status === 'erreicht' zählt als Stern (filled).
 */
export function buildRespectWeek({
  learningDaysThisWeek: days = [],
  assessment = { basis: 0, passed: 0 },
  helpedCount = 0,
  helpedAvailable = true,
  config = CONFIG
} = {}) {
  const rs = config.respectStars || CONFIG.respectStars;
  const learningDays = Array.isArray(days) ? days : [];
  const noDays = learningDays.length === 0;

  const geplantZiel = Math.round((rs.geplant ?? 0.8) * 100);
  const reflektiertZiel = Math.round((rs.reflektiert ?? 0.7) * 100);
  const gutZiel = Math.round((rs.gutEingeschätzt ?? 0.7) * 100);
  const streakZiel = rs.drangebliebenDays ?? 3;
  const helpZiel = rs.geholfenCount ?? 10;

  let geplant;
  let reflektiert;
  if (noDays) {
    geplant = respectStar({
      id: "geplant",
      label: "Geplant",
      status: "keine_daten",
      wert: null,
      ziel: geplantZiel,
      einheit: "%",
      text: "noch kein Lerntag"
    });
    reflektiert = respectStar({
      id: "reflektiert",
      label: "Reflektiert",
      status: "keine_daten",
      wert: null,
      ziel: reflektiertZiel,
      einheit: "%",
      text: "noch kein Lerntag"
    });
  } else {
    const sumPlanned = learningDays.reduce((s, d) => s + (Number(d.plannedCount) || 0), 0);
    const sumReflected = learningDays.reduce((s, d) => s + (Number(d.reflectedCount) || 0), 0);
    const sumClass = learningDays.reduce((s, d) => s + (Number(d.classSize) || 0), 0);
    const plannedRate = sumClass > 0 ? sumPlanned / sumClass : 0;
    const reflectedRate = sumClass > 0 ? sumReflected / sumClass : 0;
    const plannedPct = Math.round(plannedRate * 100);
    const reflectedPct = Math.round(reflectedRate * 100);
    geplant = respectStar({
      id: "geplant",
      label: "Geplant",
      status: plannedRate >= (rs.geplant ?? 0.8) ? "erreicht" : "offen",
      wert: plannedPct,
      ziel: geplantZiel,
      einheit: "%",
      text: `Ziel ${geplantZiel} %`
    });
    reflektiert = respectStar({
      id: "reflektiert",
      label: "Reflektiert",
      status: reflectedRate >= (rs.reflektiert ?? 0.7) ? "erreicht" : "offen",
      wert: reflectedPct,
      ziel: reflektiertZiel,
      einheit: "%",
      text: `Ziel ${reflektiertZiel} %`
    });
  }

  const basis = Math.max(0, Number(assessment?.basis) || 0);
  const passed = Math.max(0, Number(assessment?.passed) || 0);
  let gut;
  if (basis === 0) {
    gut = respectStar({
      id: "gutEingeschätzt",
      label: "Gut eingeschätzt",
      status: "keine_daten",
      wert: null,
      ziel: gutZiel,
      einheit: "%",
      text: "noch kein Levelcheck"
    });
  } else {
    const rate = passed / basis;
    const pct = Math.round(rate * 100);
    gut = respectStar({
      id: "gutEingeschätzt",
      label: "Gut eingeschätzt",
      status: rate >= (rs.gutEingeschätzt ?? 0.7) ? "erreicht" : "offen",
      wert: pct,
      ziel: gutZiel,
      einheit: "%",
      text: `Ziel ${gutZiel} %`
    });
  }

  let drangeblieben;
  if (noDays) {
    drangeblieben = respectStar({
      id: "drangeblieben",
      label: "Drangeblieben",
      status: "keine_daten",
      wert: null,
      ziel: streakZiel,
      einheit: "Lerntage",
      text: "noch kein Lerntag"
    });
  } else {
    const streak = longestPlannedStreak(learningDays, rs.drangebliebenRate ?? 0.8);
    drangeblieben = respectStar({
      id: "drangeblieben",
      label: "Drangeblieben",
      status: streak >= streakZiel ? "erreicht" : "offen",
      wert: streak,
      ziel: streakZiel,
      einheit: "Lerntage",
      text: `${streak} / ${streakZiel} Lerntage`
    });
  }

  let geholfen;
  if (!helpedAvailable) {
    geholfen = respectStar({
      id: "geholfen",
      label: "Geholfen",
      status: "keine_daten",
      wert: null,
      ziel: helpZiel,
      einheit: "Hilfen",
      text: "Hilfe-Frage noch nicht aktiv",
      comingSoon: true
    });
  } else {
    const count = Math.max(0, Number(helpedCount) || 0);
    geholfen = respectStar({
      id: "geholfen",
      label: "Geholfen",
      status: count >= helpZiel ? "erreicht" : "offen",
      wert: count,
      ziel: helpZiel,
      einheit: "Hilfen",
      text: `${count} / ${helpZiel} Hilfen`
    });
  }

  return [geplant, reflektiert, gut, drangeblieben, geholfen];
}

/** Alias: gleiche Semantik wie buildRespectWeek. */
export function respectWeek(input) {
  return buildRespectWeek(input);
}

/** Anzahl erreichter Sterne (nur status === 'erreicht'). */
export function starsFilledCount(respect) {
  return (respect || []).filter((s) => s.status === "erreicht").length;
}

/** Season-Fortschritt: gefüllte Stufen und Rest bis zur nächsten. */
export function seasonProgress(classXp, tiers = CONFIG.seasonTiers) {
  const xp = Math.max(0, Number(classXp) || 0);
  const sorted = [...(tiers || [])].sort((a, b) => a.xp - b.xp);
  let filledCount = 0;
  let next = null;
  for (const t of sorted) {
    if (xp >= t.xp) filledCount += 1;
    else {
      next = t;
      break;
    }
  }
  const remaining = next ? Math.max(0, next.xp - xp) : 0;
  return { xp, next, remaining, filledCount };
}

/**
 * Season-Leiste: Marker-Zustände + Füllung auf absoluter Skala 0…letzte Stufe.
 * segmentFill = Anteil im aktuellen Abschnitt (0 unter der ersten Stufe).
 */
export function seasonTrack(classXp, tiers = CONFIG.seasonTiers) {
  const xp = Math.max(0, Number(classXp) || 0);
  const sorted = [...(tiers || [])].sort((a, b) => a.xp - b.xp);
  const lastXp = sorted.length ? sorted[sorted.length - 1].xp : 0;
  const fillRatio = lastXp > 0 ? Math.min(1, xp / lastXp) : 0;

  let nextIdx = sorted.findIndex((t) => xp < t.xp);
  if (nextIdx < 0) nextIdx = sorted.length;

  const markers = sorted.map((t, i) => {
    if (i < nextIdx) {
      return { xp: t.xp, label: t.label, state: "erreicht" };
    }
    if (i === nextIdx) {
      return {
        xp: t.xp,
        label: t.label,
        state: "naechste",
        remaining: Math.max(0, t.xp - xp)
      };
    }
    return { xp: t.xp, label: t.label, state: "spaeter" };
  });

  let segmentFill = 0;
  if (sorted.length) {
    if (nextIdx >= sorted.length) {
      segmentFill = 1;
    } else if (nextIdx === 0) {
      const firstXp = sorted[0].xp;
      segmentFill = firstXp > 0 ? Math.min(1, Math.max(0, xp / firstXp)) : 0;
    } else {
      const prevXp = sorted[nextIdx - 1].xp;
      const nextXp = sorted[nextIdx].xp;
      const span = nextXp - prevXp;
      segmentFill = span > 0 ? Math.min(1, Math.max(0, (xp - prevXp) / span)) : 0;
    }
  }

  return {
    xp,
    titleKey: null,
    markers,
    fillRatio,
    segmentFill,
    currentXp: xp
  };
}

/**
 * Lose für die heutige Ziehung.
 * planned/reflected heute; gutEingeschätzt7d = mindestens ein bestätigt+gemeldet in 7 Tagen;
 * helpedTodayCount = Anzahl Peer-Hilfen heute als Helfer:in (cap geholfenMax).
 */
export function raffleTicketCount({
  plannedToday = false,
  reflectedToday = false,
  gutEingeschätzt7d = false,
  helpedTodayCount = 0,
  // Aliase (ältere Aufrufe)
  planned,
  reflected,
  gutEingeschätzt,
  helped,
  config = CONFIG
} = {}) {
  const t = config.raffleTickets || CONFIG.raffleTickets;
  const didPlan = plannedToday || planned === true;
  const didReflect = reflectedToday || reflected === true;
  const gut = gutEingeschätzt7d || gutEingeschätzt === true;
  const helpCount =
    helpedTodayCount != null && helpedTodayCount !== false
      ? Math.max(0, Number(helpedTodayCount) || 0)
      : helped
        ? 1
        : 0;

  let n = 0;
  if (didPlan) n += t.planned || 0;
  if (didReflect) n += t.reflected || 0;
  if (gut) n += t.gutEingeschätzt || 0;
  const helpTickets = Math.min(helpCount * (t.geholfen || 0), t.geholfenMax ?? helpCount * (t.geholfen || 0));
  n += Math.max(0, helpTickets);
  if (t.maxPerPerson != null) n = Math.min(n, t.maxPerPerson);
  return n;
}

/**
 * Lostopf: Schüler-IDs mit Wiederholung nach Ticket-Anzahl (gewichtet).
 * @param {Array<{ id: number, tickets: number }>} studentsTickets
 * @returns {number[]}
 */
export function buildRafflePot(studentsTickets) {
  const pot = [];
  for (const row of studentsTickets || []) {
    const id = Number(row?.id ?? row?.studentId);
    const tickets = Math.max(0, Math.floor(Number(row?.tickets ?? row?.count) || 0));
    if (!Number.isFinite(id) || tickets <= 0) continue;
    for (let i = 0; i < tickets; i += 1) pot.push(id);
  }
  return pot;
}

function shuffleInPlace(arr, rng) {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

/**
 * Highlights: max. maxPerCat pro Kategorie, jede Person höchstens einmal global.
 * Zufällig unter den Berechtigten (rng: () => 0…1).
 */
export function pickHighlights({
  categories = {},
  namesById = {},
  maxPerCat = CONFIG.highlightMaxPerCategory,
  rng = Math.random
} = {}) {
  const used = new Set();
  const out = {};
  const keys = [
    ...HIGHLIGHT_ORDER.filter((k) => k in categories),
    ...Object.keys(categories).filter((k) => !HIGHLIGHT_ORDER.includes(k))
  ];

  for (const key of keys) {
    const eligible = (categories[key] || []).filter(
      (id) => id != null && !used.has(id)
    );
    const pool = shuffleInPlace([...eligible], rng);
    const picked = pool.slice(0, Math.max(0, maxPerCat));
    for (const id of picked) used.add(id);
    out[key] = picked.map((id) => ({
      id,
      name: namesById[id] != null ? namesById[id] : id
    }));
  }
  return out;
}

/** Schild-Text: „BOSS-FIGHT · DI 17.11.“ */
export function formatBossShield(dueDate) {
  if (!dueDate) return "BOSS-FIGHT";
  const d = dueDate instanceof Date ? dueDate : new Date(`${dueDate}T12:00:00`);
  if (Number.isNaN(d.getTime())) return "BOSS-FIGHT";
  const wd = WEEKDAY_DE[d.getDay()];
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  return `BOSS-FIGHT · ${wd} ${day}.${month}.`;
}

/** Differenz in ganzen Tagen (isoTarget − isoToday). */
export function daysUntil(isoToday, isoTarget) {
  const a = new Date(`${isoToday}T12:00:00`);
  const b = new Date(`${isoTarget}T12:00:00`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  return Math.round((b - a) / 86400000);
}
