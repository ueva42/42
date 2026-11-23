// =======================================================
// Passwort-Hashing (bcrypt) + Legacy-Klartext-Migration
// =======================================================
import bcrypt from "bcryptjs";
import crypto from "crypto";

const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS || 10);

/** bcrypt-Hash erkennen ($2a$ / $2b$ / $2y$). */
export function looksHashed(stored) {
  return typeof stored === "string" && /^\$2[aby]\$\d{2}\$/.test(stored);
}

export async function hashPassword(plain) {
  const value = String(plain ?? "");
  if (!value) throw new Error("Passwort darf nicht leer sein.");
  return bcrypt.hash(value, BCRYPT_ROUNDS);
}

export function hashPasswordSync(plain) {
  const value = String(plain ?? "");
  if (!value) throw new Error("Passwort darf nicht leer sein.");
  return bcrypt.hashSync(value, BCRYPT_ROUNDS);
}

/**
 * Prüft ein Passwort gegen den DB-Wert.
 * Legacy: Klartext → ok + needsRehash (beim nächsten erfolgreichen Login umstellen).
 */
export async function verifyPassword(stored, candidate) {
  const storedStr = String(stored ?? "");
  const candidateStr = String(candidate ?? "");
  if (!storedStr || !candidateStr) {
    return { ok: false, needsRehash: false };
  }
  if (looksHashed(storedStr)) {
    const ok = await bcrypt.compare(candidateStr, storedStr);
    return { ok, needsRehash: false };
  }
  // Legacy-Klartext
  if (storedStr === candidateStr) {
    return { ok: true, needsRehash: true };
  }
  return { ok: false, needsRehash: false };
}

/** Einmalpasswort für Schülerkarten (ohne leicht verwechselbare Zeichen). */
export function generateTempPassword(length = 6) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = crypto.randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += chars[bytes[i] % chars.length];
  }
  return out;
}

/**
 * Einmalpasswort für Anzeige (Lehrer/Admin), solange first_login aktiv.
 * Nutzt temp_password; Fallback auf Legacy-Klartext in password.
 */
export function otpForDisplay(row) {
  const firstLogin = !!(row?.first_login ?? row?.firstLogin);
  if (!firstLogin) return null;
  const temp = row?.temp_password;
  if (typeof temp === "string" && temp.length) return temp;
  const pw = row?.password;
  if (typeof pw === "string" && pw.length && !looksHashed(pw)) return pw;
  return null;
}
