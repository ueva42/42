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

export function parseModelJson(content) {
  let raw = String(content || "").trim();
  raw = raw.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start >= 0 && end > start) raw = raw.slice(start, end + 1);
  const parsed = JSON.parse(raw);
  return {
    nachricht: parsed?.nachricht,
    diagnose_code: parsed?.diagnose_code,
    hilfestufe: parsed?.hilfestufe,
    loesung_verraten: parsed?.loesung_verraten === true
  };
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
