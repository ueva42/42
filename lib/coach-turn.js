/**
 * Gesprächsstart und Zwischenaufgaben.
 * Reine Entscheidungen, ohne Datenbank.
 */
import { checkStudentMath } from "./coach-math.js";

export const MAX_ZWI = 3;

export const ZWI_HINT =
  "Du hast jetzt dreimal an einem kleineren Schritt geübt. Frag deine Lehrkraft oder schau dir ein Erklärvideo im Materialschrank an.";

export function statusPrompt(status) {
  if (status === "in_arbeit") {
    return "In Arbeit. Der Schüler übt dieses Feld gerade. Frag, wo es hakt, oder stell eine typische Aufgabe zu diesem Level.";
  }
  if (status === "sicher") {
    return "Sicher. Der Schüler hält dieses Feld für sicher. Stell eine kleine Herausforderung zur Bestätigung.";
  }
  return "Offen. Der Schüler hat dieses Feld noch offen. Der Einstieg ist ganz einfach und bleibt beim Grundbegriff.";
}

/** Dieselbe Lesart wie im Fenster: „2imes3“ wird „2 mal 3“. */
export function repairImeGlitch(text) {
  return String(text || "").replace(/(\d)\s*imes\s*(\d)/g, "$1 mal $2");
}

export function humanizeExpr(raw) {
  let text = repairImeGlitch(String(raw || ""))
    .replace(/[ \t]*\\times[ \t]*/g, " mal ")
    .replace(/[ \t]*\\cdot[ \t]*/g, " mal ")
    .replace(/[ \t]*\times[ \t]*/g, " mal ");
  let prev = "";
  while (text !== prev) {
    prev = text;
    text = text.replace(/(\d)\s*\*\s*(\d)/g, "$1 mal $2");
    text = text.replace(/(\d)\s*[·×∙⋅]\s*(\d)/g, "$1 mal $2");
  }
  return text.replace(/ {2,}/g, " ").trim();
}

function leaksSolution(text, loesung) {
  const sol = String(loesung || "").trim();
  if (!sol) return false;
  const escaped = sol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^\\d])${escaped}([^\\d]|$)`).test(String(text || ""));
}

export function readZwischenaufgabe(raw) {
  const z = raw?.zwischenaufgabe;
  if (!z || typeof z !== "object" || Array.isArray(z)) return null;
  const aufgabe = String(z.aufgabe || "").trim().slice(0, 300);
  const loesung = String(z.loesung ?? "").trim().slice(0, 120);
  const anzeige = String(z.anzeige || "").trim().slice(0, 400);
  if (!aufgabe || !loesung) return null;
  return { aufgabe, loesung, anzeige };
}

/** Nur zeigen, wenn mathjs die mitgelieferte Lösung zur Aufgabe bestätigt. */
export function verifiedZwischenaufgabe(raw) {
  const z = readZwischenaufgabe(raw);
  if (!z) return null;
  const checked = checkStudentMath({ aufgabe: z.aufgabe, schuelerantwort: z.loesung });
  if (checked.status !== "richtig") return null;
  return z;
}

export function zwischenLine(z) {
  if (!z) return "";
  const anzeige = repairImeGlitch(z.anzeige).trim();
  if (anzeige && !leaksSolution(anzeige, z.loesung)) return anzeige;
  const expr = humanizeExpr(z.aufgabe);
  return expr ? `Rechne: ${expr}` : "";
}

export function composeZwischen(nachricht, z) {
  const line = zwischenLine(z);
  const base = repairImeGlitch(nachricht).trim();
  if (!line) return base;
  if (!base) return line;
  return `${base}\n\n${line}`;
}

export function backToOriginal(original) {
  const question = String(original || "").trim();
  if (!question) return "Stimmt. Versuch die erste Frage noch einmal.";
  return `Stimmt, das passt. Zurück zu deiner Frage: ${question}`;
}

export function isDenkfehler(raw) {
  return raw?.denkfehler === true || String(raw?.denkfehler || "").toLowerCase() === "true";
}

/**
 * trailing: schon gezeigte Zwischenaufgaben direkt hintereinander.
 * pendingZwischen: die gerade beantwortete Frage war eine Zwischenaufgabe.
 */
export function nextCoachStep({ pruefung, denkfehler, trailing, pendingZwischen }) {
  const status = pruefung || "nicht_pruefbar";
  const streak = Number(trailing) || 0;
  if (pendingZwischen && status === "richtig") return "zurueck";
  const wrong = status === "falsch" || (status !== "richtig" && denkfehler === true);
  if (!wrong) return "normal";
  if (streak >= MAX_ZWI) return "hinweis";
  return "zwischen";
}
