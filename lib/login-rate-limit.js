// =======================================================
// Login-Rate-Limit (In-Memory, pro Prozess)
// =======================================================

const MAX_FAILURES = Number(process.env.LOGIN_MAX_FAILURES || 5);
const WINDOW_MS = Number(process.env.LOGIN_WINDOW_MS || 15 * 60 * 1000);
const LOCK_MS = Number(process.env.LOGIN_LOCK_MS || 15 * 60 * 1000);

/** @type {Map<string, { failures: number, firstFailureAt: number, lockedUntil: number }>} */
const buckets = new Map();

function now() {
  return Date.now();
}

function pruneStale(entry, t) {
  if (!entry) return null;
  if (entry.lockedUntil && entry.lockedUntil <= t) {
    entry.lockedUntil = 0;
    entry.failures = 0;
    entry.firstFailureAt = 0;
  }
  if (entry.firstFailureAt && t - entry.firstFailureAt > WINDOW_MS && !entry.lockedUntil) {
    entry.failures = 0;
    entry.firstFailureAt = 0;
  }
  return entry;
}

function getEntry(key) {
  const t = now();
  let entry = buckets.get(key);
  entry = pruneStale(entry, t);
  if (!entry) {
    entry = { failures: 0, firstFailureAt: 0, lockedUntil: 0 };
    buckets.set(key, entry);
  }
  return entry;
}

function keysFor({ ip, username }) {
  const list = [];
  const ipKey = String(ip || "").trim();
  if (ipKey) list.push(`ip:${ipKey}`);
  const userKey = String(username || "").trim().toLowerCase();
  if (userKey) list.push(`user:${userKey}`);
  return list;
}

export function clientIp(req) {
  const xf = String(req.headers?.["x-forwarded-for"] || "")
    .split(",")[0]
    .trim();
  if (xf) return xf;
  return String(req.socket?.remoteAddress || req.ip || "unknown");
}

/**
 * @returns {{ allowed: boolean, retryAfterSec: number }}
 */
export function checkLoginAllowed({ ip, username }) {
  const t = now();
  let lockedUntil = 0;
  for (const key of keysFor({ ip, username })) {
    const entry = getEntry(key);
    pruneStale(entry, t);
    if (entry.lockedUntil > t) {
      lockedUntil = Math.max(lockedUntil, entry.lockedUntil);
    }
  }
  if (lockedUntil > t) {
    return {
      allowed: false,
      retryAfterSec: Math.max(1, Math.ceil((lockedUntil - t) / 1000))
    };
  }
  return { allowed: true, retryAfterSec: 0 };
}

export function recordLoginFailure({ ip, username }) {
  const t = now();
  for (const key of keysFor({ ip, username })) {
    const entry = getEntry(key);
    pruneStale(entry, t);
    if (!entry.firstFailureAt) entry.firstFailureAt = t;
    entry.failures += 1;
    if (entry.failures >= MAX_FAILURES) {
      entry.lockedUntil = t + LOCK_MS;
    }
  }
}

export function recordLoginSuccess({ ip, username }) {
  for (const key of keysFor({ ip, username })) {
    buckets.delete(key);
  }
}

/** Nur für Tests. */
export function _resetLoginRateLimitForTests() {
  buckets.clear();
}

export const LOGIN_RATE_LIMIT = {
  MAX_FAILURES,
  WINDOW_MS,
  LOCK_MS
};
