/**
 * Logout muss jede connect.sid im Cookie-Header treffen.
 * cookie.parse behält nur den letzten Wert — ein älteres Cookie einer
 * anderen Rolle (z. B. Schüler) bleibt sonst gültig und wird nach dem
 * Löschen des Admin-Cookies zur aktiven Session.
 */
import crypto from "crypto";

export const SESSION_COOKIE_NAME = "connect.sid";
export const LOGOUT_MARKER_NAME = "sol_logout";

function signSessionId(val, secret) {
  const mac = crypto.createHmac("sha256", secret).update(val).digest("base64").replace(/=+$/, "");
  return `${val}.${mac}`;
}

function unsignSessionId(val, secret) {
  if (!val || !secret) return "";
  const idx = val.lastIndexOf(".");
  if (idx <= 0) return "";
  const body = val.slice(0, idx);
  const expected = signSessionId(body, secret);
  const a = Buffer.from(expected);
  const b = Buffer.from(val);
  if (a.length !== b.length) return "";
  if (!crypto.timingSafeEqual(a, b)) return "";
  return body;
}

function decodeCookieValue(raw) {
  try {
    return decodeURIComponent(raw);
  } catch (_err) {
    return raw;
  }
}

function eachCookie(cookieHeader, fn) {
  const header = String(cookieHeader || "");
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const name = trimmed.slice(0, eq).trim();
    const value = decodeCookieValue(trimmed.slice(eq + 1).trim());
    fn(name, value);
  }
}

/** Alle gültig signierten Session-IDs (nicht nur die letzte). */
export function parseAllSessionIds(cookieHeader, secret) {
  const ids = [];
  const seen = new Set();
  eachCookie(cookieHeader, (name, value) => {
    if (name !== SESSION_COOKIE_NAME) return;
    let raw = value;
    if (raw.startsWith("s:")) raw = raw.slice(2);
    const id = unsignSessionId(raw, secret);
    if (!id || seen.has(id)) return;
    seen.add(id);
    ids.push(id);
  });
  return ids;
}

export function hasLogoutMarker(cookieHeader) {
  let found = false;
  eachCookie(cookieHeader, (name, value) => {
    if (name === LOGOUT_MARKER_NAME && value === "1") found = true;
  });
  return found;
}

/** Varianten, mit denen connect.sid gesetzt worden sein kann (secure an/aus). */
export function sessionCookieClearVariants() {
  const variants = [];
  for (const secure of [true, false]) {
    for (const sameSite of ["lax", "strict"]) {
      variants.push({ path: "/", httpOnly: true, secure, sameSite });
    }
  }
  variants.push({ path: "/", httpOnly: true, secure: true, sameSite: "none" });
  return variants;
}
