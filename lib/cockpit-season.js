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

/**
 * Respekt-Sterne dieser Woche (Klasse als Ganzes).
 * Geholfen: comingSoon nur wenn helpedAvailable === false.
 */
export function respectWeek({
  plannedRate = 0,
  reflectedRate = 0,
  assessmentRate = 0,
  streakOk = false,
  helpedCount = 0,
  helpedAvailable = true,
  config = CONFIG
} = {}) {
  const rs = config.respectStars || CONFIG.respectStars;

  return [
    {
      id: "geplant",
      label: "Geplant",
      filled: plannedRate >= rs.geplant,
      value: plannedRate,
      target: rs.geplant
    },
    {
      id: "reflektiert",
      label: "Reflektiert",
      filled: reflectedRate >= rs.reflektiert,
      value: reflectedRate,
      target: rs.reflektiert
    },
    {
      id: "gutEingeschätzt",
      label: "Gut eingeschätzt",
      filled: assessmentRate >= rs.gutEingeschätzt,
      value: assessmentRate,
      target: rs.gutEingeschätzt
    },
    {
      id: "drangeblieben",
      label: "Drangeblieben",
      filled: Boolean(streakOk),
      value: streakOk ? rs.drangebliebenDays : 0,
      target: rs.drangebliebenDays
    },
    {
      id: "geholfen",
      label: "Geholfen",
      filled: helpedAvailable && helpedCount >= rs.geholfenCount,
      value: helpedAvailable ? helpedCount : 0,
      target: rs.geholfenCount,
      comingSoon: !helpedAvailable
    }
  ];
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

/** Lose zählen aus Bool/Flags und Config-Gewichten. */
export function raffleTicketCount({
  planned = false,
  reflected = false,
  gutEingeschätzt = false,
  helped = false,
  config = CONFIG
} = {}) {
  const t = config.raffleTickets || CONFIG.raffleTickets;
  let n = 0;
  if (planned) n += t.planned;
  if (reflected) n += t.reflected;
  if (gutEingeschätzt) n += t.gutEingeschätzt;
  if (helped) n += t.geholfen;
  return n;
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
