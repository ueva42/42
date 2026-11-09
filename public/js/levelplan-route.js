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
  progressDash,
  planDash
};

if (typeof window !== "undefined") window.LogbuchLevelplanRoute = api;

export default api;
