/**
 * Trainingsstand: prüfen, mischen, CORS, Thema → Was-Ziele.
 * Keine Datenbank, keine Namen, keine Adressen.
 */
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

export const TRAINING_THEMA = "funktionen";
export const TRAINING_ORIGIN = "https://trainingscenter.streetsoflogic.de";
export const TRAINING_BASE = "https://trainingscenter.streetsoflogic.de/";
export const SICHER_AB = 6;
export const TIERS = ["rookie", "operator", "streetLegend"];
export const TIER_GRADE_KEY = {
  rookie: "rookie",
  operator: "operator",
  streetLegend: "street_legend"
};
export const TIER_LABEL = {
  rookie: "Rookie",
  operator: "Operator",
  streetLegend: "Street Legend"
};

const GRADE_KEYS = ["1", "1.5", "2", "2.5", "3", "3.5", "4", "4.5", "5", "5.5", "6"];
const LEGACY_GRADES = {
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
const TOKEN_RE = /^[A-Za-z0-9_-]{16,64}$/;
const STATION_PATH_RE = /^funktionen\/[a-z0-9-]+\/$/;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_RE =
  /^([0-9A-Z]+(?:-[0-9A-Z]+)*?)-?R(\d)(\d)-?OP(\d)(\d)-?SL(\d)(\d)-?K([01])-?I([0-3])([0-3])([0-3])-?([A-Z2-9]{2})$/;
const ICH_FROM_CODE = [null, "noch-nicht", "teilweise", "sicher"];

const haltePath = join(dirname(fileURLToPath(import.meta.url)), "../data/halte-funktionen.json");

let halteCache = null;

export function loadHalte() {
  if (!halteCache) {
    const parsed = JSON.parse(readFileSync(haltePath, "utf8"));
    halteCache = parsed.map((item) => ({
      n: item.n,
      name: item.name,
      wz: item.wz,
      url: item.url
    }));
  }
  return halteCache;
}

export function wzForThema(thema) {
  if (thema !== TRAINING_THEMA) return new Set();
  return new Set(loadHalte().map((item) => item.wz));
}

export function trainingAllowOrigin(origin) {
  return origin === TRAINING_ORIGIN ? TRAINING_ORIGIN : "";
}

export function applyTrainingCors(req, res) {
  const origin = String(req.headers?.origin || "");
  res.setHeader("Vary", "Origin");
  const allow = trainingAllowOrigin(origin);
  if (allow) res.setHeader("Access-Control-Allow-Origin", allow);
  res.setHeader("Access-Control-Allow-Methods", "GET, POST");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store");
}

export function isTrainingToken(token) {
  return typeof token === "string" && TOKEN_RE.test(token);
}

function integerInRange(value) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 999;
}

export function normalizeIchKann(value) {
  if (value == null) return { ok: true, value: null };
  if (typeof value !== "string") return { ok: false, value: null };
  const key = value.trim().toLowerCase().replace(/\s+/g, "-");
  if (key === "sicher" || key === "teilweise" || key === "noch-nicht") {
    return { ok: true, value: key };
  }
  return { ok: false, value: null };
}

export function validatePayload(body, options = {}) {
  const requireToken = options.requireToken !== false;
  const allowedWz = options.allowedWz || wzForThema(TRAINING_THEMA);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "json" };
  }
  if (body.v !== 1) return { ok: false, error: "version" };
  if (requireToken) {
    if (!isTrainingToken(body.token)) return { ok: false, error: "token" };
  } else if (body.token != null && body.token !== "" && !isTrainingToken(body.token)) {
    return { ok: false, error: "token" };
  }
  if (typeof body.wz !== "string" || !allowedWz.has(body.wz)) {
    return { ok: false, error: "wz" };
  }
  if (typeof body.kontrolle !== "boolean" || typeof body.problem !== "boolean") {
    return { ok: false, error: "flags" };
  }
  if (body.pensumErfuellt != null && typeof body.pensumErfuellt !== "boolean") {
    return { ok: false, error: "pensum" };
  }
  if (!body.levels || typeof body.levels !== "object" || Array.isArray(body.levels)) {
    return { ok: false, error: "levels" };
  }
  if (!body.ichKann || typeof body.ichKann !== "object" || Array.isArray(body.ichKann)) {
    return { ok: false, error: "ichKann" };
  }

  const levels = {};
  const ichKann = {};
  for (const tier of TIERS) {
    const level = body.levels[tier];
    if (!level || typeof level !== "object" || Array.isArray(level)) {
      return { ok: false, error: "levels" };
    }
    if (!integerInRange(level.solved) || !integerInRange(level.first)) {
      return { ok: false, error: "zahl" };
    }
    if (typeof level.safe !== "boolean") return { ok: false, error: "safe" };
    levels[tier] = { solved: level.solved, first: level.first, safe: level.safe };
    const kann = normalizeIchKann(body.ichKann[tier]);
    if (!kann.ok) return { ok: false, error: "ichKann" };
    ichKann[tier] = kann.value;
  }

  return {
    ok: true,
    value: {
      v: 1,
      wz: body.wz,
      levels,
      kontrolle: body.kontrolle,
      problem: body.problem,
      ichKann
    }
  };
}

function storedTier(levels, tier) {
  const current = levels?.[tier] || {};
  return {
    solved: integerInRange(current.solved) ? current.solved : 0,
    first: integerInRange(current.first) ? current.first : 0,
    safe: current.safe === true
  };
}

function storedIchKann(value) {
  const kann = normalizeIchKann(value);
  return kann.ok ? kann.value : null;
}

/** solved/first bleiben das Maximum, Wahr-Flags bleiben wahr, ichKann der neueste Wert außer null. */
export function mergeTraining(previous, incoming) {
  const prior = previous && typeof previous === "object" ? previous : {};
  const levels = {};
  const ichKann = {};
  for (const tier of TIERS) {
    const oldTier = storedTier(prior.levels, tier);
    const nextTier = incoming.levels[tier];
    levels[tier] = {
      solved: Math.max(oldTier.solved, nextTier.solved),
      first: Math.max(oldTier.first, nextTier.first),
      safe: oldTier.safe || nextTier.safe
    };
    const previousKann = storedIchKann(prior.ichKann?.[tier]);
    ichKann[tier] = incoming.ichKann[tier] == null ? previousKann : incoming.ichKann[tier];
  }
  return {
    v: 1,
    wz: incoming.wz,
    levels,
    kontrolle: prior.kontrolle === true || incoming.kontrolle === true,
    problem: prior.problem === true || incoming.problem === true,
    ichKann
  };
}

export function publicHalt(merged) {
  const halt = { kontrolle: merged?.kontrolle === true };
  for (const tier of TIERS) {
    const level = storedTier(merged?.levels, tier);
    halt[tier] = { solved: level.solved, safe: level.safe };
  }
  return halt;
}

export function normalizeGoalName(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function matchHalteToGoals(halte, goals) {
  const byName = new Map();
  for (const goal of goals || []) {
    const key = normalizeGoalName(goal.text);
    if (!key) continue;
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push(goal);
  }
  const matches = [];
  const abweichungen = [];
  const used = new Set();
  for (const halt of halte || []) {
    const found = byName.get(normalizeGoalName(halt.name)) || [];
    const free = found.filter((goal) => !used.has(String(goal.id)));
    if (found.length === 1 && free.length === 1) {
      used.add(String(free[0].id));
      matches.push({ goalId: free[0].id, halt });
    } else if (found.length === 0) {
      abweichungen.push({ name: halt.name, wz: halt.wz, grund: "kein Unterthema" });
    } else {
      abweichungen.push({ name: halt.name, wz: halt.wz, grund: "nicht eindeutig" });
    }
  }
  return { matches, abweichungen };
}

export function topicIsFunktionen(name, goals, halte = loadHalte()) {
  if (/funktionen/i.test(String(name || ""))) return true;
  const list = goals || [];
  if (!list.length) return false;
  const { matches } = matchHalteToGoals(halte, list);
  return matches.length * 2 > list.length;
}

export function formatZielnote(raw) {
  if (raw == null || raw === "") return null;
  let key = String(raw).trim().replace(",", ".").replace("−", "-");
  if (LEGACY_GRADES[key]) key = LEGACY_GRADES[key];
  if (!GRADE_KEYS.includes(key)) {
    const num = Number(key);
    if (!Number.isFinite(num)) return null;
    const half = Math.round(num * 2) / 2;
    if (Math.abs(half - num) > 0.001 || half < 1 || half > 6) return null;
    key = Number.isInteger(half) ? String(half) : half.toFixed(1);
  }
  if (!GRADE_KEYS.includes(key)) return null;
  return key.replace(".", ",");
}

export function gradeKeyFromLabel(label) {
  const formatted = formatZielnote(label);
  if (!formatted) return null;
  return formatted.replace(",", ".");
}

export function bandFromSolved(solved) {
  const count = integerInRange(solved) ? solved : 0;
  if (count >= SICHER_AB) return "sicher";
  if (count >= 3) return "teilweise";
  return "noch-nicht";
}

export function standLabel(solved) {
  const band = bandFromSolved(solved);
  return band === "noch-nicht" ? "noch nicht" : band;
}

/** Erst das Training, dann die Einschätzung. */
export function vergleich(solved, ichKann) {
  const kann = normalizeIchKann(ichKann);
  if (!kann.ok || kann.value == null) return null;
  const training = bandFromSolved(solved);
  const self = kann.value;
  if (training === self) return "passt";
  const rank = { "noch-nicht": 0, teilweise: 1, sicher: 2 };
  if (rank[self] > rank[training]) return "überschätzt";
  return "unterschätzt";
}

export function anzeigeAusTraining(level) {
  if (level?.safe === true) return "sicher";
  const solved = integerInRange(level?.solved) ? level.solved : 0;
  return `${solved} von ${SICHER_AB}`;
}

export function pensumText(entries, gradeKey, recommendedTierCounts) {
  const total = Array.isArray(entries) ? entries.length : 0;
  if (!gradeKey || !total || typeof recommendedTierCounts !== "function") return null;
  const need = recommendedTierCounts(total, gradeKey);
  if (!need) return null;
  const parts = [];
  for (const tier of TIERS) {
    const required = Number(need[TIER_GRADE_KEY[tier]]) || 0;
    if (required <= 0) continue;
    const done = entries.filter((entry) => entry?.levels?.[tier]?.safe === true).length;
    if (done < required) parts.push(`${TIER_LABEL[tier]}: ${done} von ${required}`);
  }
  return parts.length ? parts.join(", ") : "Pensum erfüllt";
}

export function cityUrl(token, note) {
  if (!isTrainingToken(token) || !note) return null;
  const params = new URLSearchParams({
    t: token,
    note: String(note),
    k: "10",
    d: "funktionen"
  });
  return `${TRAINING_BASE}?${params.toString()}`;
}

export function stationUrl(urlPath, token, note) {
  if (!isTrainingToken(token) || !note) return null;
  const path = String(urlPath || "");
  if (!STATION_PATH_RE.test(path)) return null;
  const params = new URLSearchParams({ t: token, note: String(note) });
  return `${TRAINING_BASE}${path}?${params.toString()}`;
}

/** Thema, dessen Unterthemen beim Migrate eine Trainings-ID bekommen. Schon normalisiert. */
export const TRAINING_ASSIGN_TOPIC = "lineare und quadratische funktionen";

/** Genau dieses Thema, nicht jedes Thema, in dessen Namen „Funktionen“ vorkommt. */
export function isCityMapTopic(name) {
  return normalizeGoalName(name) === TRAINING_ASSIGN_TOPIC;
}

/**
 * Feste Zuordnung Name → Trainings-ID. fkt-25 und fkt-26 gehören nicht dazu.
 * Der Ordner kommt getrennt aus halte-funktionen.json über die wz.
 */
export const TRAINING_GOAL_ASSIGNMENTS = [
  ["fkt-01", "Geraden zeichnen"],
  ["fkt-02", "Geraden ablesen"],
  ["fkt-03", "m bestimmen, c ablesen"],
  ["fkt-04", "m gegeben, c berechnen"],
  ["fkt-05", "m und c berechnen"],
  ["fkt-06", "Die Scheitelform"],
  ["9-05b", "Scheitel auf der y-Achse"],
  ["fkt-08", "Scheitel auf der x-Achse"],
  ["fkt-09", "Scheitelform überall"],
  ["fkt-10", "Von der Scheitelform zur Normalform"],
  ["fkt-11", "Von der Normalform zur Scheitelform"],
  ["fkt-12", "Schnittpunkt mit der y-Achse"],
  ["fkt-13", "Schnittpunkt mit der x-Achse"],
  ["fkt-14", "Schnittpunkte zweier Graphen"],
  ["fkt-15", "Funktion grafisch bestimmen"],
  ["fkt-16", "b oder c bestimmen"],
  ["fkt-17", "b und c bestimmen"],
  ["fkt-18", "Die Produktform"],
  ["fkt-19", "Der Streckfaktor a"],
  ["fkt-20", "a grafisch bestimmen"],
  ["fkt-21", "a oder c bestimmen"],
  ["fkt-22", "Skizze erstellen"],
  ["fkt-23", "Gleichung bestimmen"],
  ["fkt-24", "Höhe oder Weite"]
];

export function storedTrainingWz(goal) {
  const wz = String(goal?.trainingWz ?? goal?.training_wz ?? "").trim();
  return wz || "";
}

/** Ordner und Halt nur über die gespeicherte wz, nicht über den Unterthema-Namen. */
export function haltForStoredWz(halte, wz) {
  const key = String(wz ?? "").trim();
  if (!key) return null;
  for (const halt of halte || []) {
    if (halt?.wz === key) return halt;
  }
  return null;
}

function codeChecksum(source) {
  let hash = 17;
  for (const ch of `SOL${source}`) {
    hash = (hash * 31 + ch.charCodeAt(0) + 7) % 1021;
  }
  return CODE_ALPHABET[hash % 32] + CODE_ALPHABET[Math.floor(hash / 32) % 32];
}

export function parseProofCode(raw) {
  const source = String(raw || "")
    .toUpperCase()
    .replace(/[\s·]/g, "");
  const match = CODE_RE.exec(source);
  if (!match) return { ok: false, error: "format" };
  const body = source.slice(0, source.length - match[12].length).replace(/-/g, "");
  if (codeChecksum(body) !== match[12]) return { ok: false, error: "pruefzeichen" };
  const numbers = match.slice(2, 8).map(Number);
  if (numbers[1] > numbers[0] || numbers[3] > numbers[2] || numbers[5] > numbers[4]) {
    return { ok: false, error: "widerspruch" };
  }
  return {
    ok: true,
    wz: match[1].toLowerCase(),
    solved: [numbers[0], numbers[2], numbers[4]],
    first: [numbers[1], numbers[3], numbers[5]],
    kontrolle: match[8] === "1",
    ichKann: [match[9], match[10], match[11]].map((digit) => ICH_FROM_CODE[Number(digit)] ?? null)
  };
}

export const REDEEM_HINWEIS =
  "Der Nachweis-Code lässt sich nicht zuverlässig in die Felder übersetzen: die Aufgabenstände stehen nur als eine Ziffer (höchstens 9) und das Problem fehlt. Zum Einlösen gilt das JSON der Übertragung, dieselben Felder wie bei der direkten Meldung.";

export function redeemExample() {
  return {
    v: 1,
    wz: "9-05b",
    levels: {
      rookie: { solved: 6, first: 4, safe: true },
      operator: { solved: 3, first: 1, safe: false },
      streetLegend: { solved: 0, first: 0, safe: false }
    },
    kontrolle: false,
    problem: false,
    ichKann: { rookie: "sicher", operator: "teilweise", streetLegend: null },
    pensumErfuellt: false
  };
}
