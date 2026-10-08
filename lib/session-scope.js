/**
 * Rollen-Sessions: pro Rolle ein eigenes Session-Cookie.
 *
 * Admin und Lehrkraft können so im selben Browser gleichzeitig angemeldet
 * sein (Tab 1 Admin, Tab 2 Lehrer). Schüler nutzen weiterhin genau eine
 * Sitzung pro Gerät (eigenes Cookie, wird bei neuem Schüler-Login ersetzt).
 *
 *   sol.sid.admin | sol.sid.teacher | sol.sid.student | sol.sid.superadmin
 *
 * Welches Cookie eine Anfrage nutzt, bestimmt – in dieser Reihenfolge:
 *   1. Header X-Sol-Scope (setzt auth-fetch.js aus dem Boot-Pfad des Tabs)
 *   2. Seiten-Pfad (/admin, /teacher/*, /student/*, /superadmin, /first-login)
 *   3. Referer-Pfad (Downloads/Bilder ohne Header)
 *   4. Fallback über vorhandene Cookies (zuletzt genutzte Rolle, dann Priorität)
 */
import { parseCookieHeader, unsignSessionId } from "./session-logout.js";

export const SESSION_ROLES = ["admin", "teacher", "student", "superadmin"];
export const SCOPE_HEADER = "x-sol-scope";
export const LAST_ROLE_COOKIE = "sol_last_role";
export const LEGACY_SESSION_COOKIE = "connect.sid";

/** Fallback-Reihenfolge, wenn eine Anfrage keine Rolle nennt und mehrere Cookies da sind. */
const FALLBACK_PRIORITY = ["admin", "teacher", "superadmin", "student"];

export function isSessionRole(value) {
  return SESSION_ROLES.includes(value);
}

export function sessionCookieNameFor(role) {
  return `sol.sid.${role}`;
}

export function logoutMarkerNameFor(role) {
  return `sol_logout_${role}`;
}

/** Seiten-Pfad → Rolle (nur HTML-Shells, nie /api/teacher o. ä.). */
export function scopeFromPagePath(pathname) {
  const p = String(pathname || "").split("?")[0].split("#")[0];
  if (p === "/admin" || p.startsWith("/admin/") || p === "/admin.html" || p === "/password-cards.html") {
    return "admin";
  }
  if (p === "/superadmin" || p.startsWith("/superadmin/") || p === "/superadmin.html") {
    return "superadmin";
  }
  if (p === "/teacher" || p.startsWith("/teacher/") || p === "/teacher.html") {
    return "teacher";
  }
  if (
    p === "/student" ||
    p.startsWith("/student/") ||
    p === "/student.html" ||
    p === "/first-login" ||
    p === "/first-login.html" ||
    p === "/character-select"
  ) {
    return "student";
  }
  return null;
}

function pathOnly(urlLike) {
  try {
    return new URL(String(urlLike), "http://local").pathname;
  } catch (_err) {
    return String(urlLike || "").split("?")[0];
  }
}

/**
 * @returns {{ scope: string|null, source: "header"|"path"|"referer"|null }}
 */
export function resolveRequestScopeHint({ path, headers }) {
  const header = String((headers && headers[SCOPE_HEADER]) || "").trim().toLowerCase();
  if (isSessionRole(header)) return { scope: header, source: "header" };

  const p = String(path || "");
  if (!p.startsWith("/api/")) {
    const fromPath = scopeFromPagePath(p);
    if (fromPath) return { scope: fromPath, source: "path" };
  } else if (p === "/api/first-login") {
    return { scope: "student", source: "path" };
  }

  const referer = headers && headers.referer;
  if (referer) {
    const fromReferer = scopeFromPagePath(pathOnly(referer));
    if (fromReferer) return { scope: fromReferer, source: "referer" };
  }
  return { scope: null, source: null };
}

/** Rollen, für die im Cookie-Header ein gültig signiertes Session-Cookie liegt. */
export function rolesWithSessionCookie(cookieHeader, secret) {
  const out = [];
  for (const role of SESSION_ROLES) {
    if (parseScopedSessionIds(cookieHeader, role, secret).length) out.push(role);
  }
  return out;
}

/** Alle gültig signierten Session-IDs für das Cookie dieser Rolle. */
export function parseScopedSessionIds(cookieHeader, role, secret) {
  const name = sessionCookieNameFor(role);
  const ids = [];
  const seen = new Set();
  for (const [cookieName, value] of parseCookieHeader(cookieHeader)) {
    if (cookieName !== name) continue;
    let raw = value;
    if (raw.startsWith("s:")) raw = raw.slice(2);
    const id = unsignSessionId(raw, secret);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

export function readCookie(cookieHeader, name) {
  let found = "";
  for (const [cookieName, value] of parseCookieHeader(cookieHeader)) {
    if (cookieName === name) found = value;
  }
  return found;
}

export function hasScopedLogoutMarker(cookieHeader, role) {
  return readCookie(cookieHeader, logoutMarkerNameFor(role)) === "1";
}

export function lastRoleFromCookies(cookieHeader) {
  const v = readCookie(cookieHeader, LAST_ROLE_COOKIE);
  return isSessionRole(v) ? v : null;
}

/**
 * Reihenfolge der Rollen, die für Fallback/Redirect in Frage kommen
 * (nur Rollen mit Cookie): erst bevorzugte, dann zuletzt genutzte, dann Priorität.
 */
export function orderRolesByPreference(roles, { prefer = [], lastRole = null } = {}) {
  const have = new Set(roles);
  const ordered = [];
  const push = (r) => {
    if (r && have.has(r) && !ordered.includes(r)) ordered.push(r);
  };
  prefer.forEach(push);
  push(lastRole);
  FALLBACK_PRIORITY.forEach(push);
  return ordered;
}

/** API-Pfade, die eine Rolle nahelegen, wenn kein Header kam (z. B. alte gecachte Clients). */
export function preferredRolesForApiPath(pathname) {
  const p = String(pathname || "");
  if (p.startsWith("/api/superadmin")) return ["superadmin"];
  if (p.startsWith("/api/student/")) return ["student"];
  if (p.startsWith("/api/admin")) return ["admin"];
  return [];
}

/**
 * Endgültige Rolle für die Session dieser Anfrage.
 * @returns {string|null} null = keine Session laden
 */
export function pickRequestScope({ path, headers, cookieHeader, secret }) {
  const hint = resolveRequestScopeHint({ path, headers });
  const cookieRoles = rolesWithSessionCookie(cookieHeader, secret);

  if (hint.scope && (hint.source !== "referer" || cookieRoles.includes(hint.scope))) {
    return hint.scope;
  }
  if (!cookieRoles.length) return hint.scope; // ohne Cookie ist die Session eh leer

  const ordered = orderRolesByPreference(cookieRoles, {
    prefer: preferredRolesForApiPath(path),
    lastRole: lastRoleFromCookies(cookieHeader)
  });
  return ordered[0] || null;
}

/** Cookie-Optionen für Clear-Varianten eines beliebigen Cookie-Namens. */
export function cookieClearVariants() {
  const variants = [];
  for (const secure of [true, false]) {
    for (const sameSite of ["lax", "strict"]) {
      variants.push({ path: "/", httpOnly: true, secure, sameSite });
    }
  }
  variants.push({ path: "/", httpOnly: true, secure: true, sameSite: "none" });
  return variants;
}
