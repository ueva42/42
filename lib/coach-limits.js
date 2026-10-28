/**
 * Kosten- und Tagesgrenzen für den Logic Coach.
 * Sichtbar nur, wenn der Schalter an ist und ein API-Schlüssel gesetzt ist.
 * Schüler teilen sich dasselbe Tageslimit. Lehrkräfte und Admins haben keins.
 */
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { userCanAccessTeacherArea } from "./teacher-auth.js";

const pricingPath = join(dirname(fileURLToPath(import.meta.url)), "../coach/pricing.json");
const pricing = JSON.parse(readFileSync(pricingPath, "utf8"));

export function isCoachEnabled() {
  return String(process.env.COACH_ENABLED || "").trim().toLowerCase() === "true";
}

export function hasAiApiKey() {
  return String(process.env.AI_API_KEY || "").trim().length > 0;
}

/** Kachel, Knöpfe und POST nur für eingeloggte Schüler, und nur mit Schalter plus Schlüssel. */
export function isCoachAvailable() {
  return isCoachEnabled() && hasAiApiKey();
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

/** Lehrkraft und Admin, wie im übrigen Lehrerbereich. Schüler, auch die Demo, bleiben begrenzt. */
export function skipsDailyQuestionLimit(user) {
  if (!user?.id) return false;
  return userCanAccessTeacherArea({
    id: user.id,
    role: user.role,
    is_active: user.is_active !== false
  });
}

export function defaultDailyLimit() {
  const n = Number(process.env.COACH_DAILY_LIMIT);
  if (!Number.isFinite(n) || n < 1) return 60;
  return Math.floor(n);
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
  const staff = skipsDailyQuestionLimit(user);
  let fragenUebrig;
  if (!staff) {
    const limit = defaultDailyLimit();
    const dayRes = await pool.query(
      `
      SELECT COALESCE(message_count, 0) AS n
      FROM coach_usage
      WHERE user_id = $1 AND usage_date = CURRENT_DATE
    `,
      [user.id]
    );
    const used = Number(dayRes.rows[0]?.n || 0);
    fragenUebrig = Math.max(0, limit - used);
    if (used >= limit) {
      return {
        ok: false,
        fragenUebrig: 0,
        nachricht:
          "Du hast den Coach heute schon oft gefragt. Morgen kannst du wieder fragen, oder frag deine Lehrkraft."
      };
    }
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
    const blocked = {
      ok: false,
      nachricht: "Der Coach macht gerade eine Pause. Frag deine Lehrkraft."
    };
    if (!staff) blocked.fragenUebrig = fragenUebrig;
    return blocked;
  }
  const ok = { ok: true };
  if (!staff) ok.fragenUebrig = fragenUebrig;
  return ok;
}

export async function recordCoachUsage(pool, user, usage) {
  const tokensIn = Number(usage.tokensIn) || 0;
  const tokensOut = Number(usage.tokensOut) || 0;
  const cost = Number(usage.costEur) || 0;
  const countQuestion = usage.countQuestion === true ? 1 : 0;
  if (countQuestion === 0 && tokensIn === 0 && tokensOut === 0 && cost === 0) return;
  await pool.query(
    `
    INSERT INTO coach_usage (
      user_id, school_id, usage_date, tokens_in, tokens_out, estimated_cost_eur, message_count
    )
    VALUES ($1, $2, CURRENT_DATE, $3, $4, $5, $6)
    ON CONFLICT (user_id, usage_date) DO UPDATE
    SET tokens_in = coach_usage.tokens_in + EXCLUDED.tokens_in,
        tokens_out = coach_usage.tokens_out + EXCLUDED.tokens_out,
        estimated_cost_eur = coach_usage.estimated_cost_eur + EXCLUDED.estimated_cost_eur,
        message_count = coach_usage.message_count + EXCLUDED.message_count
  `,
    [user.id, user.schoolId, tokensIn, tokensOut, cost, countQuestion]
  );
}
