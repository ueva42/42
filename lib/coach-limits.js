/**
 * Wer den Coach nutzen darf, und die Kosten-/Tagesgrenzen.
 * COACH_ALLOWED_USERS=login:limit,anderer:10
 * Ohne :limit gilt COACH_DAILY_LIMIT (Standard 25). Leere Liste = niemand.
 */
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const pricingPath = join(dirname(fileURLToPath(import.meta.url)), "../coach/pricing.json");
const pricing = JSON.parse(readFileSync(pricingPath, "utf8"));

export function isCoachEnabled() {
  return String(process.env.COACH_ENABLED || "").trim().toLowerCase() === "true";
}

export function enabledSubjectKeys() {
  const raw = String(process.env.COACH_ENABLED_SUBJECTS || "mathe");
  const keys = raw
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
  return keys.length ? keys : ["mathe"];
}

export function subjectKey(subject) {
  const value = String(subject || "").trim().toLowerCase();
  if (value === "mathe" || value === "mathematik" || value === "math") return "mathe";
  return value;
}

export function isSubjectEnabled(subject) {
  return enabledSubjectKeys().includes(subjectKey(subject));
}

export function retentionDays() {
  const n = Number(process.env.COACH_RETENTION_DAYS);
  if (!Number.isFinite(n) || n < 1) return 90;
  return Math.floor(n);
}

export function monthlyBudgetEur() {
  const n = Number(process.env.COACH_MONTHLY_BUDGET_EUR);
  if (!Number.isFinite(n) || n < 0) return 8;
  return n;
}

export function defaultDailyLimit() {
  const n = Number(process.env.COACH_DAILY_LIMIT);
  if (!Number.isFinite(n) || n < 1) return 25;
  return Math.floor(n);
}

/** @returns {Map<string, {login: string, dailyLimit: number|null}>} */
export function parseAllowList(raw = process.env.COACH_ALLOWED_USERS) {
  const map = new Map();
  for (const part of String(raw || "").split(",")) {
    const piece = part.trim();
    if (!piece) continue;
    const splitAt = piece.lastIndexOf(":");
    let login = piece;
    let limit = null;
    if (splitAt > 0) {
      const maybe = piece.slice(splitAt + 1).trim();
      if (/^\d+$/.test(maybe)) {
        login = piece.slice(0, splitAt).trim();
        limit = Number(maybe);
      }
    }
    if (!login) continue;
    map.set(login.toLowerCase(), {
      login,
      dailyLimit: limit != null && limit > 0 ? limit : null
    });
  }
  return map;
}

export function allowEntryFor(name) {
  const key = String(name || "").trim().toLowerCase();
  if (!key) return null;
  return parseAllowList().get(key) || null;
}

export function isLoginAllowed(name) {
  return Boolean(allowEntryFor(name));
}

export function dailyLimitFor(name) {
  const entry = allowEntryFor(name);
  if (entry?.dailyLimit) return entry.dailyLimit;
  return defaultDailyLimit();
}

export function estimateCostEur(modelKind, tokensIn, tokensOut) {
  const table = pricing.perMillionTokens || {};
  const row = table[modelKind] || table.fast || { input: 0, output: 0 };
  const inn = Number(tokensIn) || 0;
  const out = Number(tokensOut) || 0;
  const cost = (inn / 1_000_000) * Number(row.input || 0) + (out / 1_000_000) * Number(row.output || 0);
  return Math.round(cost * 1_000_000) / 1_000_000;
}

export async function checkCoachLimits(pool, user) {
  const limit = dailyLimitFor(user.name);
  const dayRes = await pool.query(
    `
    SELECT COALESCE(message_count, 0) AS n
    FROM coach_usage
    WHERE user_id = $1 AND usage_date = CURRENT_DATE
  `,
    [user.id]
  );
  const used = Number(dayRes.rows[0]?.n || 0);
  if (used >= limit) {
    return {
      ok: false,
      nachricht:
        "Du hast den Coach heute schon oft gefragt. Morgen kannst du wieder fragen, oder frag deine Lehrkraft."
    };
  }

  const budget = monthlyBudgetEur();
  const monthRes = await pool.query(
    user.schoolId != null
      ? `
        SELECT COALESCE(SUM(estimated_cost_eur), 0) AS cost
        FROM coach_usage
        WHERE school_id = $1
          AND usage_date >= date_trunc('month', CURRENT_DATE)::date
      `
      : `
        SELECT COALESCE(SUM(estimated_cost_eur), 0) AS cost
        FROM coach_usage
        WHERE user_id = $1
          AND usage_date >= date_trunc('month', CURRENT_DATE)::date
      `,
    [user.schoolId != null ? user.schoolId : user.id]
  );
  const spent = Number(monthRes.rows[0]?.cost || 0);
  if (spent >= budget) {
    return {
      ok: false,
      nachricht: "Der Coach macht gerade eine Pause. Frag deine Lehrkraft."
    };
  }
  return { ok: true };
}

export async function recordCoachUsage(pool, user, usage) {
  const tokensIn = Number(usage.tokensIn) || 0;
  const tokensOut = Number(usage.tokensOut) || 0;
  const cost = Number(usage.costEur) || 0;
  await pool.query(
    `
    INSERT INTO coach_usage (
      user_id, school_id, usage_date, tokens_in, tokens_out, estimated_cost_eur, message_count
    )
    VALUES ($1, $2, CURRENT_DATE, $3, $4, $5, 1)
    ON CONFLICT (user_id, usage_date) DO UPDATE
    SET tokens_in = coach_usage.tokens_in + EXCLUDED.tokens_in,
        tokens_out = coach_usage.tokens_out + EXCLUDED.tokens_out,
        estimated_cost_eur = coach_usage.estimated_cost_eur + EXCLUDED.estimated_cost_eur,
        message_count = coach_usage.message_count + 1
  `,
    [user.id, user.schoolId, tokensIn, tokensOut, cost]
  );
}
