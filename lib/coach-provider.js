/**
 * KI-Anbieter, OpenAI-kompatibel (OVH AI Endpoints oder ein anderer EU-Anbieter).
 * Nur AI_BASE_URL, AI_API_KEY, AI_MODEL_STRONG, AI_MODEL_FAST und COACH_USE_STRONG.
 * Der Schlüssel bleibt auf dem Server und erscheint nie in den Logs.
 * COACH_USE_STRONG ist standardmäßig aus: alle Antworten laufen über das schnelle Modell.
 */

const TIMEOUT_MS = 60000;
/** Mistral und andere Modelle: genug Platz für die JSON-Antwort. */
const MAX_TOKENS = 4096;
/**
 * gpt-oss zählt Reasoning-Tokens mit. reasoning_effort "low" und etwa 2000 Tokens,
 * damit message.content ankommt und nicht am Limit abreißt.
 */
const MAX_TOKENS_GPT_OSS = 2000;

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

function coachUsesStrong() {
  return String(process.env.COACH_USE_STRONG || "").trim().toLowerCase() === "true";
}

function pickModel(useStrong) {
  const strong = String(process.env.AI_MODEL_STRONG || DEFAULT_STRONG).trim();
  const fast = String(process.env.AI_MODEL_FAST || DEFAULT_FAST).trim();
  if (useStrong && coachUsesStrong() && strong) {
    return { model: strong, kind: "strong" };
  }
  if (fast) return { model: fast, kind: "fast" };
  return { model: strong, kind: strong ? "strong" : "fast" };
}

function isGptOss(model) {
  return /gpt-oss/i.test(String(model || ""));
}

/** Nur message.content. reasoning und reasoning_content bleiben ungelesen. */
function messageContent(data) {
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string") return "";
  return content.trim();
}

function logToken(value, max) {
  const clean = String(value ?? "-")
    .replace(/[^\w.\-:+]/g, "_")
    .slice(0, max);
  return clean || "-";
}

function logCall({ model, ms, status, finishReason, contentChars, jsonOk }) {
  console.log(
    `coach ki modell=${logToken(model, 120)} dauer_ms=${Number(ms) || 0} http=${logToken(status, 12)} finish_reason=${logToken(finishReason || "-", 40)} content_zeichen=${Number(contentChars) || 0} json_lesbar=${jsonOk ? "ja" : "nein"}`
  );
}

function isTimeoutError(err) {
  return err?.name === "AbortError" || err?.name === "TimeoutError";
}

function errorCode(err) {
  return String(err?.code || err?.cause?.code || "");
}

function isConnectionError(err) {
  if (!err || isTimeoutError(err)) return false;
  const code = errorCode(err);
  if (code === "ECONNRESET" || code === "ECONNREFUSED") return true;
  return /fetch failed/i.test(String(err.message || "")) && err.status == null;
}

async function callModel({ model, messages, responseFormat }) {
  const url = endpointUrl();
  const key = String(process.env.AI_API_KEY || "").trim();
  if (!url || !key || !model) {
    throw new Error("coach-provider-unconfigured");
  }

  const body = {
    model,
    temperature: 0.4,
    max_tokens: isGptOss(model) ? MAX_TOKENS_GPT_OSS : MAX_TOKENS,
    messages
  };
  if (isGptOss(model)) body.reasoning_effort = "low";
  if (responseFormat) body.response_format = { type: "json_object" };

  const started = Date.now();
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
      body: JSON.stringify(body)
    });
    let data = {};
    try {
      data = await res.json();
    } catch {
      data = {};
    }
    return {
      ok: res.ok,
      status: res.status,
      finishReason: String(data?.choices?.[0]?.finish_reason || ""),
      content: messageContent(data),
      ms: Date.now() - started,
      tokensIn: Number(data?.usage?.prompt_tokens) || 0,
      tokensOut: Number(data?.usage?.completion_tokens) || 0
    };
  } catch (err) {
    err.coachMs = Date.now() - started;
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function stripFences(content) {
  return String(content || "")
    .replace(/```(?:json)?[ \t]*\r?\n?/gi, "")
    .replace(/```/g, "")
    .trim();
}

function sliceModelJson(content) {
  const raw = stripFences(content);
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start >= 0 && end > start) return raw.slice(start, end + 1);
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

function jsonReadable(content) {
  const raw = sliceModelJson(content);
  if (!raw) return false;
  try {
    JSON.parse(escapeLatexInJson(raw));
    return true;
  } catch {
    /* Latex-Reparatur hat nicht gereicht */
  }
  try {
    JSON.parse(raw);
    return true;
  } catch {
    return false;
  }
}

function recognizedHelpLevel(content) {
  const help = /"hilfestufe"\s*:\s*(-?\d+)/.exec(String(content || ""));
  if (!help) return 1;
  const n = Number(help[1]);
  return Number.isFinite(n) ? n : 1;
}

/** JSON bleibt kaputt: der Antworttext selbst ist die Coach-Nachricht. */
function plainCoachReply(content) {
  return {
    nachricht: stripFences(content),
    diagnose_code: "KEINER",
    hilfestufe: recognizedHelpLevel(content),
    loesung_verraten: false,
    denkfehler: false,
    zwischenaufgabe: null
  };
}

export function interpretCoachContent(content) {
  try {
    const fields = parseModelJson(content);
    return { ...fields, jsonOk: jsonReadable(content), plainText: false };
  } catch (err) {
    if (err?.message !== "coach-json") throw err;
    return { ...plainCoachReply(content), jsonOk: false, plainText: true };
  }
}

function logTransportFailure(model, err) {
  const ms = Number(err?.coachMs) || 0;
  logCall({
    model,
    ms,
    status: "-",
    finishReason: "-",
    contentChars: 0,
    jsonOk: false
  });
  if (isTimeoutError(err)) {
    console.error(`coach ki fehler: zeitueberschreitung modell=${logToken(model, 120)} dauer_ms=${ms}`);
    return;
  }
  const code = errorCode(err);
  const label =
    code === "ECONNRESET" || code === "ECONNREFUSED"
      ? code
      : /fetch failed/i.test(String(err?.message || ""))
        ? "fetch-failed"
        : "verbindung";
  console.error(
    `coach ki fehler: verbindung modell=${logToken(model, 120)} dauer_ms=${ms} code=${logToken(label, 40)}`
  );
}

/**
 * 60 Sekunden, keine Wiederholung bei Zeitüberschreitung.
 * Ein zweiter Versuch nur bei Verbindungsfehlern ohne HTTP-Status.
 * HTTP 400 mit response_format: einmal ohne das Feld.
 * Kaputtes JSON wird als Text zurückgegeben. „Nicht erreichbar“ nur bei
 * Netz-/HTTP-Fehler oder leerem content.
 */
export async function completeCoach({ useStrong, messages }) {
  const picked = pickModel(useStrong);
  const model = picked.model;
  let withFormat = true;
  let connectionRetried = false;
  let formatRetried = false;

  for (let round = 0; round < 4; round += 1) {
    let result;
    try {
      result = await callModel({ model, messages, responseFormat: withFormat });
    } catch (err) {
      if (!isTimeoutError(err) && isConnectionError(err) && !connectionRetried) {
        logTransportFailure(model, err);
        connectionRetried = true;
        console.error(
          `coach ki: verbindung fehlgeschlagen, ein weiterer versuch modell=${logToken(model, 120)}`
        );
        continue;
      }
      logTransportFailure(model, err);
      throw err;
    }

    if (result.status === 400 && withFormat && !formatRetried) {
      logCall({
        model,
        ms: result.ms,
        status: result.status,
        finishReason: result.finishReason,
        contentChars: result.content.length,
        jsonOk: false
      });
      console.error(
        `coach ki fehler: response_format abgelehnt, wiederhole ohne json_object modell=${logToken(model, 120)} http=400`
      );
      withFormat = false;
      formatRetried = true;
      continue;
    }

    const chars = result.content.length;
    if (result.finishReason === "length") {
      console.error(
        `coach ki fehler: finish_reason length modell=${logToken(model, 120)} dauer_ms=${result.ms} http=${result.status} content_zeichen=${chars}`
      );
    }

    if (!result.ok) {
      logCall({
        model,
        ms: result.ms,
        status: result.status,
        finishReason: result.finishReason,
        contentChars: chars,
        jsonOk: false
      });
      console.error(
        `coach ki fehler: http modell=${logToken(model, 120)} dauer_ms=${result.ms} http=${result.status}`
      );
      throw new Error("coach-provider-http");
    }

    if (!result.content) {
      console.error(
        `coach ki fehler: content leer modell=${logToken(model, 120)} dauer_ms=${result.ms} http=${result.status} finish_reason=${logToken(result.finishReason || "-", 40)}`
      );
      logCall({
        model,
        ms: result.ms,
        status: result.status,
        finishReason: result.finishReason,
        contentChars: 0,
        jsonOk: false
      });
      throw new Error("coach-provider-empty");
    }

    const interpreted = interpretCoachContent(result.content);
    if (interpreted.plainText) {
      console.error(
        `coach ki fehler: json nicht lesbar modell=${logToken(model, 120)} content_zeichen=${chars}`
      );
    }
    logCall({
      model,
      ms: result.ms,
      status: result.status,
      finishReason: result.finishReason,
      contentChars: chars,
      jsonOk: interpreted.jsonOk
    });
    return {
      nachricht: interpreted.nachricht,
      diagnose_code: interpreted.diagnose_code,
      hilfestufe: interpreted.hilfestufe,
      loesung_verraten: interpreted.loesung_verraten === true,
      denkfehler: interpreted.denkfehler === true,
      zwischenaufgabe: interpreted.zwischenaufgabe ?? null,
      modell: model,
      modelKind: picked.kind,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut
    };
  }
  throw new Error("coach-provider-failed");
}
