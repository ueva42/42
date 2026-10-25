/**
 * KI-Anbieter, OpenAI-kompatibel (OVH AI Endpoints oder ein anderer EU-Anbieter).
 * Nur AI_BASE_URL, AI_API_KEY, AI_MODEL_STRONG und AI_MODEL_FAST.
 * Der Schlüssel bleibt auf dem Server.
 */

const TIMEOUT_MS = 30000;
/**
 * Die sichtbare Antwort soll kurz sein (etwa 400 Tokens).
 * gpt-oss zählt Reasoning-Tokens mit. 400 würde das JSON abschneiden.
 * 4096 lässt die komplette JSON-Antwort ankommen.
 */
const MAX_TOKENS = 4096;

const DEFAULT_BASE = "https://oai.endpoints.kepler.ai.cloud.ovh.net/v1";
const DEFAULT_STRONG = "gpt-oss-120b";
const DEFAULT_FAST = "Mistral-Small-3.2-24B-Instruct-2506";

export const COACH_UNREACHABLE =
  "Der Coach ist gerade nicht erreichbar – frag deine Lehrkraft oder versuch es gleich nochmal.";

function endpointUrl() {
  const base = String(process.env.AI_BASE_URL || DEFAULT_BASE)
    .trim()
    .replace(/\/$/, "");
  if (!base) return "";
  if (base.endsWith("/chat/completions")) return base;
  return `${base}/chat/completions`;
}

function pickModel(useStrong) {
  const strong = String(process.env.AI_MODEL_STRONG || DEFAULT_STRONG).trim();
  const fast = String(process.env.AI_MODEL_FAST || DEFAULT_FAST).trim();
  if (useStrong) return { model: strong || fast, kind: strong ? "strong" : "fast" };
  return { model: fast || strong, kind: fast ? "fast" : "strong" };
}

function messageText(data) {
  const message = data?.choices?.[0]?.message || {};
  const content = String(message.content || "").trim();
  if (content) return content;
  return String(message.reasoning_content || "").trim();
}

async function callOnce({ model, messages }) {
  const url = endpointUrl();
  const key = String(process.env.AI_API_KEY || "").trim();
  if (!url || !key || !model) {
    throw new Error("coach-provider-unconfigured");
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        temperature: 0.4,
        max_tokens: MAX_TOKENS,
        messages
      })
    });
    if (!res.ok) {
      throw new Error("coach-provider-http");
    }
    const data = await res.json();
    const content = messageText(data);
    if (!content) throw new Error("coach-provider-empty");
    return {
      content,
      modell: model,
      tokensIn: Number(data?.usage?.prompt_tokens) || 0,
      tokensOut: Number(data?.usage?.completion_tokens) || 0
    };
  } finally {
    clearTimeout(timer);
  }
}

function sliceModelJson(content) {
  let raw = String(content || "").trim();
  raw = raw.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start >= 0 && end > start) raw = raw.slice(start, end + 1);
  return raw;
}

function jsonFields(parsed) {
  const z = parsed?.zwischenaufgabe;
  let zwischenaufgabe = null;
  if (z && typeof z === "object" && !Array.isArray(z)) {
    zwischenaufgabe = {
      aufgabe: z.aufgabe,
      loesung: z.loesung,
      anzeige: z.anzeige
    };
  }
  return {
    nachricht: parsed?.nachricht,
    diagnose_code: parsed?.diagnose_code,
    hilfestufe: parsed?.hilfestufe,
    loesung_verraten: parsed?.loesung_verraten === true,
    denkfehler: parsed?.denkfehler === true || String(parsed?.denkfehler || "").toLowerCase() === "true",
    zwischenaufgabe
  };
}

/**
 * Wörter, die nach einem echten JSON-Umbruch stehen dürfen: \nund, \noder.
 * Der Rest aus Kleinbuchstaben ist ein LaTeX-Befehl (\times, \frac, \nabla).
 */
const GERMAN_AFTER_ESCAPE = new Set([
  "und",
  "oder",
  "aber",
  "denn",
  "auch",
  "dann",
  "noch",
  "schon",
  "nur",
  "hier",
  "dort",
  "jetzt",
  "bitte",
  "genau",
  "richtig",
  "was",
  "wie",
  "warum",
  "wieso",
  "weiter",
  "wieder",
  "dass",
  "weil",
  "wenn",
  "also",
  "mit",
  "auf",
  "von",
  "vom",
  "zum",
  "zur",
  "nach",
  "vor",
  "bis",
  "als",
  "ein",
  "eine",
  "einem",
  "einen",
  "einer",
  "der",
  "die",
  "das",
  "den",
  "dem",
  "ist",
  "sind",
  "war",
  "hat",
  "kann",
  "muss",
  "man",
  "wir",
  "ihr",
  "sie",
  "ich",
  "du",
  "es",
  "er",
  "im",
  "in",
  "an",
  "am",
  "so",
  "da",
  "ob",
  "ja",
  "nein",
  "mal",
  "nicht",
  "beide",
  "alle",
  "etwas",
  "nichts",
  "gilt",
  "passt",
  "stimmt"
]);

/** \tan endet auf das deutsche Wort „an“, ist aber ein LaTeX-Befehl. */
const LATEX_FORCE = new Set(["tan"]);

/**
 * LaTeX in der JSON-Antwort: \sqrt, \cdot, \{ und \( sind ungültige Escapes, JSON.parse wirft.
 * \times, \frac, \right sehen gültig aus (\t, \f, \r) und werden sonst zu „imes“, Formfeed oder Zeilenumbruch.
 * Beides landet beim Schüler als „nicht erreichbar“, sobald irgendwo noch ein ungültiger Escape steht
 * und der ganze Parse scheitert. Jeder LaTeX-Befehl wird vorher verdoppelt. \n und \\cdot bleiben.
 */
function escapeLatexInJson(raw) {
  let out = "";
  let inString = false;
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i];
    if (!inString) {
      if (ch === '"') inString = true;
      out += ch;
      continue;
    }
    if (ch === '"') {
      inString = false;
      out += ch;
      continue;
    }
    if (ch === "\n") {
      out += "\\n";
      continue;
    }
    if (ch === "\r") {
      out += "\\r";
      continue;
    }
    if (ch === "\t" || ch.charCodeAt(0) < 0x20) {
      out += `\\u${ch.charCodeAt(0).toString(16).padStart(4, "0")}`;
      continue;
    }
    if (ch !== "\\") {
      out += ch;
      continue;
    }
    const next = raw[i + 1];
    if (next == null) {
      out += "\\\\";
      continue;
    }
    if (next === "\\" || next === '"' || next === "/") {
      out += `\\${next}`;
      i += 1;
      continue;
    }
    if (next === "u" && /^[0-9a-fA-F]{4}/.test(raw.slice(i + 2, i + 6))) {
      out += raw.slice(i, i + 6);
      i += 5;
      continue;
    }
    if ("bfnrt".includes(next)) {
      const rest = /^[a-z]+/.exec(raw.slice(i + 2));
      if (!rest) {
        out += `\\${next}`;
        i += 1;
        continue;
      }
      const full = next + rest[0];
      if (GERMAN_AFTER_ESCAPE.has(rest[0]) && !LATEX_FORCE.has(full)) {
        out += `\\${next}`;
        i += 1;
        continue;
      }
      out += `\\\\${full}`;
      i += full.length;
      continue;
    }
    const word = /^[A-Za-z]+/.exec(raw.slice(i + 1));
    if (word) {
      out += `\\\\${word[0]}`;
      i += word[0].length;
      continue;
    }
    out += `\\\\${next}`;
    i += 1;
  }
  return out;
}

function readJsonString(raw, key) {
  const match = new RegExp(`"${key}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`).exec(raw);
  if (!match) return null;
  try {
    return JSON.parse(`"${match[1]}"`);
  } catch {
    return null;
  }
}

/** Wenn die Zwischenaufgabe das JSON zerbricht, bleibt wenigstens die Diagnose. */
function salvageFields(raw) {
  const nachricht = String(readJsonString(raw, "nachricht") || "").trim();
  if (!nachricht) return null;
  const code = readJsonString(raw, "diagnose_code");
  const help = /"hilfestufe"\s*:\s*(-?\d+)/.exec(raw);
  const denk = /"denkfehler"\s*:\s*(true|false)/i.exec(raw);
  const verraten = /"loesung_verraten"\s*:\s*true/i.test(raw);
  return {
    nachricht,
    diagnose_code: code || "KEINER",
    hilfestufe: help ? Number(help[1]) : 0,
    loesung_verraten: verraten,
    denkfehler: denk ? denk[1].toLowerCase() === "true" : false,
    zwischenaufgabe: null
  };
}

export function parseModelJson(content) {
  const raw = sliceModelJson(content);
  const fixed = escapeLatexInJson(raw);
  try {
    return jsonFields(JSON.parse(fixed));
  } catch {
    /* Roh-JSON oder nur die Nachricht, ohne Zwischenaufgabe */
  }
  try {
    return jsonFields(JSON.parse(raw));
  } catch {
    /* weiter */
  }
  const salvaged = salvageFields(fixed) || salvageFields(raw);
  if (salvaged) return salvaged;
  throw new Error("coach-json");
}

/**
 * Ein Versuch, bei Fehler genau ein zweiter. Danach wirft die Funktion.
 * Der Aufrufer zeigt dann COACH_UNREACHABLE.
 */
export async function completeCoach({ useStrong, messages }) {
  const picked = pickModel(useStrong);
  let lastError = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const result = await callOnce({ model: picked.model, messages });
      const parsed = parseModelJson(result.content);
      return {
        ...parsed,
        modell: result.modell,
        modelKind: picked.kind,
        tokensIn: result.tokensIn,
        tokensOut: result.tokensOut
      };
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error("coach-provider-failed");
}
