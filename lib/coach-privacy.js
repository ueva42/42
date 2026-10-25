/**
 * Freitext für den Logic Coach säubern.
 * An die KI gehen keine Namen, Klassen, E-Mails, Telefonnummern oder Schüler-IDs.
 */

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_RE = /(?:\+|00)?\d[\d\s().-]{7,}\d/g;

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function replaceLiteral(text, needle, replacement) {
  const raw = String(needle || "").trim();
  if (raw.length < 3) return text;
  return text.replace(new RegExp(escapeRegExp(raw), "gi"), replacement);
}

/** E-Mail und Telefon entfernen, bevor etwas gespeichert oder gesendet wird. */
export function redactContacts(text) {
  return String(text || "")
    .replace(EMAIL_RE, "[entfernt]")
    .replace(PHONE_RE, "[entfernt]");
}

/**
 * Zusätzlich den eigenen Namen und den Klassennamen aus dem Text nehmen.
 * Diese Fassung geht an die KI. user_id wird hier nie eingesetzt.
 */
export function redactForModel(text, hints = {}) {
  let clean = redactContacts(text);
  clean = replaceLiteral(clean, hints.name, "Schueler");
  clean = replaceLiteral(clean, hints.className, "Klasse");
  return clean;
}
