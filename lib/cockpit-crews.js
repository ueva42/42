/**
 * Crew-Auslosung (gelenkter Zufall) für das Lehrer-Cockpit.
 * Pure Funktionen — keine DB.
 */

/** Crew-Größen 4–5; bei 33 → fünf à 5, zwei à 4. */
export function crewSizesFor(n) {
  const count = Math.max(0, Math.floor(Number(n) || 0));
  if (count <= 0) return [];
  if (count <= 5) return [count];
  const kMin = Math.ceil(count / 5);
  const kMax = Math.max(kMin, Math.floor(count / 4));
  const k = kMin <= kMax ? kMin : kMax;
  const base = Math.floor(count / k);
  const rem = count % k;
  const sizes = [];
  for (let i = 0; i < k; i += 1) {
    sizes.push(i < rem ? base + 1 : base);
  }
  return sizes;
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

/** Schlechtere Zielnote zuerst (5 vor 1); fehlende Note ans Ende. */
export function gradeSortKey(gradeKey) {
  if (gradeKey == null || gradeKey === "") return 99;
  const n = Number(String(gradeKey).replace(",", "."));
  if (Number.isFinite(n)) return n;
  return 50;
}

/**
 * Sortiert nach Zielnote (schlechter zuerst), mischt innerhalb gleicher Note.
 * @param {{ id: number|string, targetGrade?: string|number|null }[]} students
 */
export function sortStudentsForDraw(students, rng = Math.random) {
  const byGrade = new Map();
  for (const s of students || []) {
    const key = gradeSortKey(s.targetGrade);
    if (!byGrade.has(key)) byGrade.set(key, []);
    byGrade.get(key).push(s);
  }
  const keys = [...byGrade.keys()].sort((a, b) => b - a);
  const out = [];
  for (const key of keys) {
    out.push(...shuffleInPlace(byGrade.get(key), rng));
  }
  return out;
}

/**
 * Karten austeilen wie 1…k, dann k…1 (Snake).
 * Bei passender Crew-Anzahl (ceil(n/5)) entstehen Größen 4–5.
 * @returns {number[][]}
 */
export function dealSnake(orderedIds, crewCount) {
  const k = Math.max(0, Math.floor(Number(crewCount) || 0));
  const crews = Array.from({ length: k }, () => []);
  if (!k) return crews;
  let dir = 1;
  let slot = 0;
  for (const id of orderedIds || []) {
    crews[slot].push(id);
    if (k === 1) continue;
    if (dir === 1 && slot === k - 1) dir = -1;
    else if (dir === -1 && slot === 0) dir = 1;
    else slot += dir;
  }
  return crews;
}

/** Alias: Deal nach Sollgrößen-Anzahl (Snake). */
export function dealIntoCrews(orderedIds, sizes) {
  return dealSnake(orderedIds, (sizes || []).length);
}

function orderedPair(a, b) {
  const x = Number(a);
  const y = Number(b);
  return x < y ? [x, y] : [y, x];
}

export function normalizeAvoidPairs(pairs) {
  const out = [];
  const seen = new Set();
  for (const p of pairs || []) {
    const a = p.studentA ?? p.student_a ?? p[0];
    const b = p.studentB ?? p.student_b ?? p[1];
    if (a == null || b == null || Number(a) === Number(b)) continue;
    const [x, y] = orderedPair(a, b);
    const key = `${x}|${y}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ studentA: x, studentB: y });
  }
  return out;
}

function crewIndexOf(crews, studentId) {
  const id = Number(studentId);
  for (let i = 0; i < crews.length; i += 1) {
    if (crews[i].some((x) => Number(x) === id)) return i;
  }
  return -1;
}

function conflictsIn(crews, avoidPairs) {
  const bad = [];
  for (const p of avoidPairs || []) {
    const ia = crewIndexOf(crews, p.studentA);
    const ib = crewIndexOf(crews, p.studentB);
    if (ia >= 0 && ia === ib) bad.push(p);
  }
  return bad;
}

/**
 * Versucht Konflikt-Paare auf verschiedene Crews zu legen (Swap).
 * @returns {{ crews: number[][], ok: boolean, unresolved: object[] }}
 */
export function resolveAvoidConflicts(crews, avoidPairs, rng = Math.random, maxTries = 80) {
  const working = crews.map((c) => [...c]);
  const pairs = normalizeAvoidPairs(avoidPairs);
  for (let t = 0; t < maxTries; t += 1) {
    const bad = conflictsIn(working, pairs);
    if (!bad.length) return { crews: working, ok: true, unresolved: [] };
    const p = bad[Math.floor(rng() * bad.length)];
    const ia = crewIndexOf(working, p.studentA);
    const ib = crewIndexOf(working, p.studentB);
    if (ia < 0 || ib < 0 || ia === ib) {
      // gleicher Crew: tausche einen mit anderer Crew
      const other = [...Array(working.length).keys()].filter((i) => i !== ia);
      if (!other.length) break;
      const jb = other[Math.floor(rng() * other.length)];
      const swapIdx = Math.floor(rng() * working[jb].length);
      const fromIdx = working[ia].findIndex((x) => Number(x) === Number(p.studentB));
      if (fromIdx < 0 || swapIdx < 0) continue;
      const tmp = working[ia][fromIdx];
      working[ia][fromIdx] = working[jb][swapIdx];
      working[jb][swapIdx] = tmp;
    }
  }
  return { crews: working, ok: conflictsIn(working, pairs).length === 0, unresolved: conflictsIn(working, pairs) };
}

/**
 * Volle Auslosung.
 * @param {{ id: number|string, targetGrade?: * }[]} students
 * @param {{ studentA: number, studentB: number }[]} avoidPairs
 * @param {() => number} rng
 */
export function drawCrews(students, avoidPairs = [], rng = Math.random) {
  const list = [...(students || [])];
  const sizes = crewSizesFor(list.length);
  const ordered = sortStudentsForDraw(list, rng);
  const ids = ordered.map((s) => Number(s.id));
  const crews = dealSnake(ids, sizes.length);
  const resolved = resolveAvoidConflicts(crews, avoidPairs, rng);
  return {
    sizes,
    crews: resolved.crews,
    ok: resolved.ok,
    unresolved: resolved.unresolved
  };
}

/** Crew-Tag sichtbar, wenn höchstens minMissing die Mission noch nicht bestätigt haben. */
export function crewTagVisible({ crewSize, confirmedOnMission, minMissing = 1 }) {
  const size = Math.max(0, Number(crewSize) || 0);
  const conf = Math.max(0, Number(confirmedOnMission) || 0);
  if (size <= 0) return false;
  return size - conf <= Math.max(0, Number(minMissing) || 0);
}

export function seasonKeyFor(levelCheckId, classId) {
  if (levelCheckId != null && String(levelCheckId).trim()) return String(levelCheckId);
  return `class-${classId}`;
}
