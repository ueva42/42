/**
 * Gesprächsstart und Zwischenaufgaben.
 * Reine Entscheidungen, ohne Datenbank.
 */
import { checkStudentMath } from "./coach-math.js";

/** So viele Schülerzüge hintereinander ohne Fortschritt, dann der Hinweis. */
export const MAX_OHNE_FORTSCHRITT = 10;

export const ZWI_HINT =
  "Du kommst hier seit einer Weile nicht weiter. Frag deine Lehrkraft oder schau dir ein Erklärvideo im Materialschrank an.";

export function statusPrompt(status) {
  if (status === "in_arbeit") {
    return "In Arbeit. Der Schüler übt dieses Unterthema gerade. Frag, wo es hakt, oder stell eine typische Aufgabe aus diesem Leveltext.";
  }
  if (status === "sicher") {
    return "Sicher. Der Schüler hält dieses Unterthema für sicher. Stell eine kleine Herausforderung zu diesem Unterthema zur Bestätigung.";
  }
  return "Offen. Der Schüler hat dieses Unterthema noch offen. Der Einstieg ist ganz einfach und bleibt beim Grundbegriff dieses Unterthemas und dieses Leveltexts.";
}

/**
 * Schülertext: kein „imes“, kein roher Backslash.
 * \sqrt wird „Wurzel“, \times, \cdot und · werden „mal“.
 */
export function readableCoachText(text) {
  let s = String(text ?? "");
  s = s.replace(/\u0009\s*imes/g, " mal ");
  s = s.replace(/\u000crac/g, "\\frac");
  s = s.replace(/\\{2,}/g, "\\");
  let prev = "";
  while (s !== prev) {
    prev = s;
    s = s.replace(
      /\\(?:d|t)?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g,
      (_, a, b) => `(${String(a).trim()})/(${String(b).trim()})`
    );
    s = s.replace(/\\sqrt\s*(?:\[([^\]]*)\])?\s*\{([^{}]*)\}/g, (_, deg, inner) =>
      deg ? `Wurzel ${String(deg).trim()} aus ${String(inner).trim()}` : `Wurzel ${String(inner).trim()}`
    );
    s = s.replace(/\\sqrt\s*(\d+(?:[.,]\d+)?)/g, "Wurzel $1");
  }
  s = s.replace(/\(\s*(\d+(?:[.,]\d+)?)\s*\)\s*\/\s*\(\s*(\d+(?:[.,]\d+)?)\s*\)/g, "$1/$2");
  s = s.replace(/[ \t]*\\(?:times|cdot)[ \t]*/g, " mal ");
  s = s.replace(/[ \t]*[·×∙⋅][ \t]*/g, " mal ");
  s = s.replace(/(\d)\s*imes\s*(\d)/gi, "$1 mal $2");
  s = s.replace(/\bimes\b/gi, "mal");
  s = s.replace(/\\(?:left|right|big|Big|bigg|Bigg|displaystyle|textstyle|qquad|quad)\b/g, "");
  s = s.replace(/\\text\s*\{([^{}]*)\}/g, "$1");
  s = s.replace(/\\[A-Za-z]+/g, (cmd) => cmd.slice(1));
  s = s.replace(/\\(.)/g, "$1");
  s = s.replace(/\\/g, "");
  s = s.replace(/\$([^$\n]*)\$/g, (all, inner) => {
    if (/Wurzel|\bmal\b|[A-Za-z]{3,}/.test(inner)) return inner;
    return all;
  });
  s = s.replace(/[ \t]{2,}/g, " ");
  s = s.replace(/[ \t]+\n/g, "\n");
  s = s.replace(/\n[ \t]+/g, "\n");
  return s.trim();
}

/** Dieselbe Lesart wie im Fenster: „2imes3“ wird „2 mal 3“. */
export function repairImeGlitch(text) {
  return readableCoachText(text);
}

export function humanizeExpr(raw) {
  let text = readableCoachText(raw);
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

/**
 * Nur zeigen, wenn mathjs die mitgelieferte Lösung zur Aufgabe bestätigt.
 * Scheitert die Prüfung, ist das keine ausgefallene Verbindung: dann keine Aufgabe.
 */
export function verifiedZwischenaufgabe(raw) {
  try {
    const z = readZwischenaufgabe(raw);
    if (!z) return null;
    const checked = checkStudentMath({ aufgabe: z.aufgabe, schuelerantwort: z.loesung });
    if (checked.status !== "richtig") return null;
    return z;
  } catch {
    return null;
  }
}

export function zwischenLine(z) {
  if (!z) return "";
  const anzeige = readableCoachText(z.anzeige).trim();
  if (anzeige && !anzeige.includes("\\") && !leaksSolution(anzeige, z.loesung)) return anzeige;
  const expr = humanizeExpr(z.aufgabe);
  if (expr && !expr.includes("\\") && !leaksSolution(expr, z.loesung)) return `Rechne: ${expr}`;
  return "";
}

export function composeZwischen(nachricht, z) {
  const line = zwischenLine(z);
  const base = repairImeGlitch(nachricht).trim();
  if (!line) return base;
  if (!base) return line;
  return `${base}\n\n${line}`;
}

export function isDenkfehler(raw) {
  return raw?.denkfehler === true || String(raw?.denkfehler || "").toLowerCase() === "true";
}

const BEGRIFF_FRAGE =
  /(?:was\s+(?:ist|sind)\s+(?:ein|eine|der|die|das)\s+[a-zäöüß]|was\s+(?:bedeutet|heißt|heisst|meint)\s+[a-zäöüß]|was\s+versteht\s+man\s+unter|(?:bitte\s+)?(?:erklär\w*|erklaer\w*)(?:\s+mir)?(?:\s+bitte)?\s*,?\s*(?:was|den|die|das|ein|eine)\b)/i;

function looksLikeRechnung(text) {
  const s = String(text || "");
  if (/\d\s*(?:mal|\*|x|·|×|plus|\+|minus|-|geteilt|:|\/|\^|hoch)\s*\d/i.test(s)) return true;
  if (/was\s+ist\s+\d/i.test(s)) return true;
  if (/was\s+(?:ergibt|macht)\s+\d/i.test(s)) return true;
  return false;
}

/** Begriffsfrage wie „Was ist eine Quadratzahl?“, keine Rechenaufgabe. */
export function isVerstaendnisfrage(text) {
  const s = String(text || "").trim();
  if (!s || s.length > 400) return false;
  if (looksLikeRechnung(s)) return false;
  return BEGRIFF_FRAGE.test(s);
}

/**
 * Fehlzug: falsch, hakt oder keine richtige Prüfung.
 * Eine Verständnisfrage und eine richtige Antwort sind kein Fehlzug.
 */
export function istFehlzug({ pruefung, verstaendnis }) {
  if (verstaendnis) return false;
  if (pruefung === "richtig") return false;
  return true;
}

/**
 * ohneFortschritt: schon gespeicherte Fehlzüge direkt hintereinander, ohne diesen Zug.
 * Eine Verständnisfrage bleibt ein normales Gespräch, keine Zwischenaufgabe.
 * Eine richtige Zwischenaufgabe geht ans Modell, damit es den letzten Satz aufgreift.
 */
export function nextCoachStep({ pruefung, denkfehler, ohneFortschritt, verstaendnis }) {
  const status = pruefung || "nicht_pruefbar";
  const bisher = Number(ohneFortschritt) || 0;
  const fehlzug = istFehlzug({ pruefung: status, verstaendnis: verstaendnis === true });
  if (fehlzug && bisher >= MAX_OHNE_FORTSCHRITT) return "hinweis";
  if (verstaendnis === true) return "normal";
  const wrong = status === "falsch" || (status !== "richtig" && denkfehler === true);
  if (!wrong) return "normal";
  return "zwischen";
}
