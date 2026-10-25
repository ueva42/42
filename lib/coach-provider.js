/**
 * OVH AI Endpoints, OpenAI-kompatibel.
 * Wird nur aufgerufen, wenn der Mock aus ist und ein API-Schlüssel da ist.
 * Der Schlüssel bleibt in dieser Datei auf dem Server.
 */

const TIMEOUT_MS = 30000;
const MAX_TOKENS = 400;
export const COACH_UNREACHABLE =
  "Der Coach ist gerade nicht erreichbar – frag deine Lehrkraft oder versuch es gleich nochmal.";

function endpointUrl() {
  const base = String(process.env.AI_BASE_URL || "").trim().replace(/\/$/, "");
  if (!base) return "";
  if (base.endsWith("/chat/completions")) return base;
  return `${base}/chat/completions`;
}

function pickModel(useStrong) {
  const strong = String(process.env.AI_MODEL_STRONG || "").trim();
  const fast = String(process.env.AI_MODEL_FAST || "").trim();
  if (useStrong) return { model: strong || fast, kind: strong ? "strong" : "fast" };
  return { model: fast || strong, kind: fast ? "fast" : "strong" };
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
    const content = data?.choices?.[0]?.message?.content;
    if (!content) throw new Error("coach-provider-empty");
    return {
      content: String(content),
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
  for (let attempt = 0; attempt < 2; attempt++) {
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
