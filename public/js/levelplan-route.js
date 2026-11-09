/**
 * Reine Logik der Lernstand-Route (Schritt 1).
 * Keine Platzhalter, keine festen sieben Koordinaten.
 * Im Browser: window.LogbuchLevelplanRoute. In Node: import.
 */
const TIERS = ["rookie", "operator", "street_legend"];
const WEEKDAYS = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

function round1(n) {
  return Math.round(n * 10) / 10;
}

function isoDay(value) {
  const text = String(value || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

export function formatShortDate(value) {
  const iso = isoDay(value);
  if (!iso) return "";
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(year, month - 1, day, 12, 0, 0, 0);
  if (Number.isNaN(date.getTime())) return "";
  return `${WEEKDAYS[date.getDay()]}., ${String(day).padStart(2, "0")}.${String(month).padStart(2, "0")}.`;
}

export function requiredTiersForMission(index, total, rules) {
  const count = Math.max(0, Number(total) || 0);
  if (!count || index < 0 || index >= count) return [];
  if (!rules) return TIERS.slice();
  return TIERS.filter((id) => {
    const ratio = Number(rules[id]) || 0;
    if (ratio <= 0) return false;
    return index < Math.ceil(count * ratio);
  });
}

export function currentMissionIndex(goals, rules, statusOf) {
  const list = Array.isArray(goals) ? goals : [];
  const total = list.length;
  if (!total) return 0;
  for (let i = 0; i < total; i++) {
    const need = requiredTiersForMission(i, total, rules);
    const open = need.some((id) => statusOf(list[i], id) !== "sicher");
    if (open) return i;
  }
  return total - 1;
}

export function missionIsDone(goal, index, total, rules, statusOf) {
  const need = requiredTiersForMission(index, total, rules);
  if (!need.length) return true;
  return need.every((id) => statusOf(goal, id) === "sicher");
}

export function etappenCounts(goals, rules, statusOf) {
  const list = Array.isArray(goals) ? goals : [];
  let sicher = 0;
  let all = 0;
  for (let i = 0; i < list.length; i++) {
    for (const id of requiredTiersForMission(i, list.length, rules)) {
      all += 1;
      if (statusOf(list[i], id) === "sicher") sicher += 1;
    }
  }
  return { sicher, all };
}

export function paceLabel(currentIndex, planIndex) {
  const diff = Number(currentIndex) - Number(planIndex);
  if (!Number.isFinite(diff) || diff >= 0) return "im Plan";
  const n = Math.abs(diff);
  return `−${n} ${n === 1 ? "Mission" : "Missionen"}`;
}

function datedChecks(levelchecks) {
  return (Array.isArray(levelchecks) ? levelchecks : [])
    .map((lc) => ({
      date: isoDay(lc?.date),
      linkedGoalIds: Array.isArray(lc?.linkedGoalIds) ? lc.linkedGoalIds.map(String) : []
    }))
    .filter((lc) => lc.date)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function lastLinkedIndex(goalIds, linkedGoalIds) {
  const linked = new Set((linkedGoalIds || []).map(String));
  let index = -1;
  goalIds.forEach((id, i) => {
    if (linked.has(String(id))) index = i;
  });
  return index;
}

export function planState({ goalIds, levelchecks, today, kaDate, currentIndex }) {
  const ids = Array.isArray(goalIds) ? goalIds.map(String) : [];
  const checks = datedChecks(levelchecks);
  const hidden = {
    showPin: false,
    showPace: false,
    planIndex: null,
    pinLabel: "",
    paceLabel: ""
  };
  if (!checks.length || !ids.length) return hidden;

  const todayIso = isoDay(today);
  const upcoming = checks.find((lc) => lc.date >= todayIso);
  if (upcoming) {
    const planIndex = lastLinkedIndex(ids, upcoming.linkedGoalIds);
    if (planIndex < 0) return hidden;
    const when = formatShortDate(upcoming.date);
    return {
      showPin: true,
      showPace: true,
      planIndex,
      pinLabel: when ? `bis ${when}` : "bis Levelcheck",
      paceLabel: paceLabel(currentIndex, planIndex)
    };
  }

  const planIndex = ids.length - 1;
  const ka = formatShortDate(kaDate);
  return {
    showPin: true,
    showPace: true,
    planIndex,
    pinLabel: ka ? `bis KA, ${ka}` : "bis KA",
    paceLabel: paceLabel(currentIndex, planIndex)
  };
}

function tangentOf(tangent) {
  return tangent === "vertical" ? "vertical" : "horizontal";
}

function cubicAt(a, b, t, tangent) {
  let c1;
  let c2;
  if (tangentOf(tangent) === "vertical") {
    const mid = (a.y + b.y) / 2;
    c1 = { x: a.x, y: mid };
    c2 = { x: b.x, y: mid };
  } else {
    const mid = (a.x + b.x) / 2;
    c1 = { x: mid, y: a.y };
    c2 = { x: mid, y: b.y };
  }
  const u = 1 - t;
  return {
    x: u * u * u * a.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * b.x,
    y: u * u * u * a.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * b.y
  };
}

function segmentLength(a, b, tangent) {
  let length = 0;
  let prev = a;
  const steps = 16;
  for (let step = 1; step <= steps; step++) {
    const point = cubicAt(a, b, step / steps, tangent);
    length += Math.hypot(point.x - prev.x, point.y - prev.y);
    prev = point;
  }
  return length;
}

export function roadPath(points, tangent) {
  if (!points?.length) return "";
  const mode = tangentOf(tangent);
  let d = `M${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (mode === "vertical") {
      const mid = round1((a.y + b.y) / 2);
      d += ` C${a.x} ${mid} ${b.x} ${mid} ${b.x} ${b.y}`;
    } else {
      const mid = round1((a.x + b.x) / 2);
      d += ` C${mid} ${a.y} ${mid} ${b.y} ${b.x} ${b.y}`;
    }
  }
  return d;
}

function routeLayoutUp(count) {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  if (!n) return null;
  const gap = 120;
  const flagY = 48;
  const lastY = flagY + 112;
  const firstY = n === 1 ? lastY : lastY + (n - 1) * gap;
  const startY = firstY + 72;
  const height = startY + 28;
  const midX = 198;
  const missions = [];
  for (let i = 0; i < n; i++) {
    const y = n === 1 ? lastY : firstY - gap * i;
    const wave = Math.sin((i + 0.35) * Math.PI);
    missions.push({ x: round1(midX + wave * 16), y: round1(y) });
  }
  const start = { x: midX, y: round1(startY) };
  const flag = { x: missions[n - 1].x, y: flagY };
  const points = [start, ...missions, flag];
  return {
    width: 480,
    height: round1(height),
    start,
    missions,
    flag,
    path: roadPath(points, "vertical"),
    tangent: "vertical",
    direction: "up"
  };
}

export function routeLayout(count, options) {
  if (options?.direction === "up") return routeLayoutUp(count);
  const n = Math.max(0, Math.floor(Number(count) || 0));
  if (!n) return null;
  const minGap = 132;
  const side = 36;
  const lead = 108;
  const tail = 118;
  const labelPad = 78;
  const natural = side + lead + Math.max(0, n - 1) * minGap + tail + labelPad;
  const width = Math.max(n <= 8 ? 1040 : 780, natural);
  const innerLeft = side + lead;
  const innerRight = width - labelPad - tail;
  const span = Math.max(0, innerRight - innerLeft);
  const gap = n === 1 ? 0 : span / (n - 1);
  const missions = [];
  for (let i = 0; i < n; i++) {
    const x = n === 1 ? (innerLeft + innerRight) / 2 : innerLeft + gap * i;
    const wave = Math.sin((i + 0.35) * Math.PI);
    missions.push({ x: round1(x), y: round1(216 + wave * 48) });
  }
  const start = { x: side, y: round1(missions[0].y + 16) };
  const flag = { x: round1(width - labelPad), y: missions[n - 1].y };
  const points = [start, ...missions, flag];
  return {
    width: round1(width),
    height: 360,
    start,
    missions,
    flag,
    path: roadPath(points),
    tangent: "horizontal",
    direction: "side"
  };
}

export function missionFraction(layout, missionIndex) {
  if (!layout?.missions?.length) return 0;
  const points = [layout.start, ...layout.missions, layout.flag];
  const tangent = layout?.tangent === "vertical" ? "vertical" : "horizontal";
  const lengths = [];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const length = segmentLength(points[i - 1], points[i], tangent);
    lengths.push(length);
    total += length;
  }
  if (!total) return 0;
  const index = Math.max(0, Math.min(layout.missions.length - 1, missionIndex));
  let walked = 0;
  for (let i = 0; i <= index; i++) walked += lengths[i] || 0;
  return Math.max(0, Math.min(100, (walked / total) * 100));
}

export function selectedMissionIndex(goalIds, selectedId, fallbackIndex) {
  const ids = Array.isArray(goalIds) ? goalIds.map(String) : [];
  const fallback = Math.max(0, Math.min(ids.length - 1, Number(fallbackIndex) || 0));
  if (selectedId == null || selectedId === "") return fallback;
  const index = ids.indexOf(String(selectedId));
  return index >= 0 ? index : fallback;
}

export function focusTier({ goal, index, total, rules, statusOf, allowed }) {
  const pool = Array.isArray(allowed) && allowed.length ? allowed : TIERS;
  const open = (id) => statusOf(goal, id) !== "sicher";
  const required = requiredTiersForMission(index, total, rules).filter((id) => pool.includes(id));
  const need = required.find(open);
  if (need) return { id: need, extra: false };
  const bonus = TIERS.filter((id) => pool.includes(id) && !required.includes(id)).find(open);
  return bonus ? { id: bonus, extra: true } : null;
}

/* Ringstücke um eine Mission wie im Trainingscenter: Rookie oben, Operator rechts, Street Legend links. */
export const TIER_ARCS = { rookie: [212, 328], operator: [338, 92], street_legend: [102, 202] };

export function nodeArc(r, a0, a1) {
  const at = (a) => [Math.cos((a * Math.PI) / 180) * r, Math.sin((a * Math.PI) / 180) * r];
  const [s, e] = [at(a0), at(a1)];
  return `M${s[0].toFixed(2)} ${s[1].toFixed(2)}A${r} ${r} 0 0 1 ${e[0].toFixed(2)} ${e[1].toFixed(2)}`;
}

function seeded(seed) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function cityBackdrop(layout, height) {
  if (!layout?.width) return null;
  const W = layout.width;
  const H = Math.max(Number(height) || 0, layout.height || 0);
  const up = layout.direction === "up";
  const pad = 14;
  const sx = up ? 92 : 104;
  const sy = up ? 84 : 76;
  const rnd = seeded(Math.round(W * 7 + H * 13));
  const xs = [];
  const ys = [];
  for (let x = pad + 22; x < W - pad; x += sx) xs.push(round1(x));
  for (let y = pad + 20; y < H - pad; y += sy) ys.push(round1(y));
  const streets = [];
  xs.forEach((x, i) => streets.push({ d: `M${x} ${pad}V${round1(H - pad)}`, major: i % 3 === 1 }));
  ys.forEach((y, i) => streets.push({ d: `M${pad} ${y}H${round1(W - pad)}`, major: i % 3 === 1 }));
  const rp = up
    ? [[pad, H * 0.58], [W * 0.35, H * 0.52], [W * 0.6, H * 0.66], [W - pad, H * 0.6]]
    : [[W * 0.42, pad], [W * 0.36, H * 0.35], [W * 0.5, H * 0.65], [W * 0.45, H - pad]];
  const riverPts = [];
  for (let k = 0; k <= 40; k++) {
    const t = k / 40;
    const u = 1 - t;
    const w0 = u * u * u;
    const w1 = 3 * u * u * t;
    const w2 = 3 * u * t * t;
    const w3 = t * t * t;
    riverPts.push([
      w0 * rp[0][0] + w1 * rp[1][0] + w2 * rp[2][0] + w3 * rp[3][0],
      w0 * rp[0][1] + w1 * rp[1][1] + w2 * rp[2][1] + w3 * rp[3][1]
    ]);
  }
  const nearRiver = (x, y, w, h) =>
    riverPts.some(([px, py]) => px > x - 16 && px < x + w + 16 && py > y - 16 && py < y + h + 16);
  const blocks = [];
  const parks = [];
  const cols = [pad, ...xs, W - pad];
  const rows = [pad, ...ys, H - pad];
  for (let r = 0; r < rows.length - 1; r++) {
    for (let c = 0; c < cols.length - 1; c++) {
      const x0 = cols[c] + 7;
      const y0 = rows[r] + 7;
      const w = cols[c + 1] - cols[c] - 14;
      const h = rows[r + 1] - rows[r] - 14;
      if (w < 18 || h < 18) continue;
      const roll = rnd();
      if (nearRiver(x0, y0, w, h)) continue;
      if (roll < 0.12) {
        parks.push({ x: round1(x0), y: round1(y0), w: round1(w), h: round1(h) });
        continue;
      }
      if (roll < 0.2) continue;
      const split = rnd() < 0.55 && w > 44;
      const parts = split ? [[x0, (w - 6) * 0.55], [x0 + (w - 6) * 0.55 + 6, (w - 6) * 0.45]] : [[x0, w]];
      for (const [bx, bw] of parts) {
        const inset = Math.round(rnd() * 6);
        blocks.push({
          x: round1(bx),
          y: round1(y0 + inset),
          w: round1(bw),
          h: round1(h - inset),
          shade: Math.floor(rnd() * 4)
        });
      }
    }
  }
  const [p0, p1, p2, p3] = rp.map(([x, y]) => `${round1(x)} ${round1(y)}`);
  const river = `M${p0} C${p1} ${p2} ${p3}`;
  return { width: W, height: H, pad, streets, blocks, parks, river };
}

export function progressDash(percent) {
  const pct = Math.max(0, Math.min(100, Number(percent) || 0));
  return `${pct.toFixed(1)} 200`;
}

export function planDash(currentPercent, planPercent) {
  const cur = Math.max(0, Math.min(100, Number(currentPercent) || 0));
  const plan = Math.max(0, Math.min(100, Number(planPercent) || 0));
  if (!(plan > cur + 0.05)) return "0 200";
  const parts = ["0", cur.toFixed(1)];
  let pos = cur;
  while (pos < plan - 0.2) {
    const draw = Math.min(1.2, plan - pos);
    parts.push(draw.toFixed(2));
    pos += draw;
    if (pos >= plan - 0.05) break;
    const gap = Math.min(1.4, plan - pos);
    parts.push(gap.toFixed(2));
    pos += gap;
  }
  parts.push("200");
  return parts.join(" ");
}

const api = {
  formatShortDate,
  requiredTiersForMission,
  currentMissionIndex,
  missionIsDone,
  etappenCounts,
  paceLabel,
  planState,
  roadPath,
  routeLayout,
  missionFraction,
  selectedMissionIndex,
  focusTier,
  TIER_ARCS,
  nodeArc,
  cityBackdrop,
  progressDash,
  planDash
};

if (typeof window !== "undefined") window.LogbuchLevelplanRoute = api;

export default api;
