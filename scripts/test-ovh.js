/**
 * Kurzer Probe-Aufruf an beide Coach-Modelle.
 * Start: node scripts/test-ovh.js
 * Der Schlüssel kommt aus der Umgebung oder aus der .env.
 * Er wird nie ausgegeben. Keine Schülertexte.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ENV_KEYS = ["AI_BASE_URL", "AI_API_KEY", "AI_MODEL_STRONG", "AI_MODEL_FAST"];
const DEFAULT_BASE = "https://oai.endpoints.kepler.ai.cloud.ovh.net/v1";
const DEFAULT_STRONG = "gpt-oss-120b";
const DEFAULT_FAST = "Mistral-Small-3.2-24B-Instruct-2506";
const QUESTION = "Was ist 2 + 2? Antworte in einem kurzen Satz.";
const TIMEOUT_MS = 60000;

function loadSelectedEnv() {
  const file = resolve(dirname(fileURLToPath(import.meta.url)), "../.env");
  if (!existsSync(file)) return;
  const text = readFileSync(file, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const body = trimmed.startsWith("export ") ? trimmed.slice(7).trim() : trimmed;
    const eq = body.indexOf("=");
    if (eq <= 0) continue;
    const key = body.slice(0, eq).trim();
    if (!ENV_KEYS.includes(key)) continue;
    if (String(process.env[key] || "").trim()) continue;
    let value = body.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function endpointUrl() {
  const base = String(process.env.AI_BASE_URL || DEFAULT_BASE)
    .trim()
    .replace(/\/$/, "");
  if (base.endsWith("/chat/completions")) return base;
  return `${base}/chat/completions`;
}

function isGptOss(model) {
  return /gpt-oss/i.test(String(model || ""));
}

async function ask(model) {
  const body = {
    model,
    temperature: 0.4,
    max_tokens: isGptOss(model) ? 2000 : 800,
    messages: [
      { role: "system", content: "Du bist ein kurzer Mathe-Coach. Antworte in einem Satz." },
      { role: "user", content: QUESTION }
    ]
  };
  if (isGptOss(model)) body.reasoning_effort = "low";

  const started = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(endpointUrl(), {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        Authorization: `Bearer ${String(process.env.AI_API_KEY || "").trim()}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });
    const ms = Date.now() - started;
    let data = {};
    try {
      data = await res.json();
    } catch {
      data = {};
    }
    const choice = data?.choices?.[0] || {};
    const content = typeof choice?.message?.content === "string" ? choice.message.content : "";
    const usage = data?.usage || {};
    console.log(`Modell: ${model}`);
    console.log(`Dauer: ${ms} ms`);
    console.log(`HTTP-Status: ${res.status}`);
    console.log(`finish_reason: ${choice.finish_reason || "-"}`);
    console.log(
      `Tokens: prompt=${Number(usage.prompt_tokens) || 0} completion=${Number(usage.completion_tokens) || 0} total=${Number(usage.total_tokens) || 0}`
    );
    console.log("Antwort:");
    console.log(content || "(leer)");
    console.log("");
    return res.ok && content.trim().length > 0;
  } catch (err) {
    const ms = Date.now() - started;
    const code = err?.name === "AbortError" || err?.name === "TimeoutError" ? "zeitueberschreitung" : err?.code || err?.cause?.code || err?.name || "fehler";
    console.log(`Modell: ${model}`);
    console.log(`Dauer: ${ms} ms`);
    console.log("HTTP-Status: -");
    console.log("finish_reason: -");
    console.log("Tokens: -");
    console.log(`Antwort: (${code})`);
    console.log("");
    return false;
  } finally {
    clearTimeout(timer);
  }
}

loadSelectedEnv();

if (!String(process.env.AI_API_KEY || "").trim()) {
  console.error("AI_API_KEY fehlt. Trag den Schlüssel nur in die .env ein, nicht in den Chat.");
  process.exit(1);
}

const fast = String(process.env.AI_MODEL_FAST || DEFAULT_FAST).trim();
const strong = String(process.env.AI_MODEL_STRONG || DEFAULT_STRONG).trim();
const models = [
  ["schnell", fast],
  ["stark", strong]
].filter((entry) => entry[1]);

let failed = 0;
for (const [label, model] of models) {
  console.log(`--- ${label} ---`);
  const ok = await ask(model);
  if (!ok) failed += 1;
}

process.exit(failed ? 1 : 0);
