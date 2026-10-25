/**
 * Prüft eine Schülerrechnung, bevor der Coach antwortet.
 * Ergebnis für den Prompt: richtig | falsch, erwartet: … | nicht_pruefbar
 */
import { create, all } from "mathjs";

const math = create(all);
const RESERVED = new Set([
  "pi",
  "e",
  "i",
  "true",
  "false",
  "sqrt",
  "abs",
  "sin",
  "cos",
  "tan",
  "log",
  "ln",
  "exp"
]);
const UNIT_RE = /\b(mm|cm|dm|km|mg|kg|ml|min|cm2|cm3|m2|m3|m|g|l|s|h)\b/i;
const SAFE_RE = /^[0-9A-Za-z_+\-*/^().,\s]+$/;

function normalizeExpr(raw) {
  let text = String(raw || "").trim();
  if (!text) return "";
  text = text.replace(/\\frac\s*\{([^{}]+)\}\s*\{([^{}]+)\}/g, "($1)/($2)");
  text = text.replace(/\\sqrt\s*\{([^{}]+)\}/g, "sqrt($1)");
  text = text.replace(/[−–—]/g, "-");
  text = text.replace(/[·×∙]/g, "*");
  text = text.replace(/÷/g, "/");
  text = text.replace(/√\s*\(/g, "sqrt(");
  text = text.replace(/√\s*(\d+(?:\.\d+)?)/g, "sqrt($1)");
  text = text.replace(/√/g, "sqrt");
  text = text.replace(/²/g, "^2").replace(/³/g, "^3");
  text = text.replace(/(\d),(\d)/g, "$1.$2");
  text = text.replace(/(\d|\))\s*:\s*(\d|\()/g, "$1/$2");
  text = text.replace(/\s+/g, " ").trim();
  return text;
}

function stripWords(raw) {
  let text = String(raw || "").trim();
  const filler =
    /^(berechne|rechne|löse|loese|wie viel ist|wieviel ist|das ergebnis ist|ergebnis|meine antwort ist|antwort|ich habe|ich bekomme)\s*[:.]?\s*/i;
  for (let i = 0; i < 3 && filler.test(text); i += 1) {
    text = text.replace(filler, "").trim();
  }
  return text;
}

function isSafe(expr) {
  if (!expr || expr.length > 180) return false;
  if (!SAFE_RE.test(expr)) return false;
  if (/\b(import|evaluate|parse|createUnit|config|reviver|help)\b/i.test(expr)) return false;
  return true;
}

function compileExpr(expr) {
  const clean = normalizeExpr(stripWords(expr));
  if (!isSafe(clean)) return null;
  try {
    const node = math.parse(clean);
    return { text: clean, node, code: node.compile() };
  } catch {
    return null;
  }
}

function freeSymbols(node) {
  const names = new Set();
  node.traverse((n, _path, parent) => {
    if (!n || n.type !== "SymbolNode") return;
    if (parent && parent.type === "FunctionNode" && parent.fn === n) return;
    if (RESERVED.has(n.name)) return;
    if (UNIT_RE.test(n.name) && n.name.length <= 3) return;
    names.add(n.name);
  });
  return [...names];
}

function hasUnit(expr) {
  return UNIT_RE.test(expr);
}

function toNumber(value) {
  if (value == null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "bigint") return Number(value);
  if (math.isUnit(value)) return null;
  try {
    if (math.isFraction?.(value) || (value && value.isFraction)) {
      const n = math.number(value);
      return Number.isFinite(n) ? n : null;
    }
  } catch {
    return null;
  }
  if (typeof value === "object" && typeof value.n !== "undefined" && typeof value.d !== "undefined") {
    const n = Number(value.n) / Number(value.d);
    return Number.isFinite(n) ? n : null;
  }
  try {
    const n = math.number(value);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function nearlyEqualNumbers(a, b) {
  const diff = Math.abs(a - b);
  const scale = Math.max(Math.abs(a), Math.abs(b), 1);
  return diff <= 0.005 || diff <= 1e-4 * scale;
}

function nearlyEqual(a, b) {
  if (math.isUnit(a) || math.isUnit(b)) {
    if (!math.isUnit(a) || !math.isUnit(b)) return false;
    try {
      if (math.equal(a, b) === true) return true;
    } catch {
      /* weiter mit Toleranz */
    }
    try {
      const unit = a.formatUnits?.() || b.formatUnits?.();
      if (!unit) return false;
      const diffN = math.number(math.abs(math.subtract(a, b)), unit);
      const scale = Math.abs(math.number(a, unit));
      if (!Number.isFinite(diffN)) return false;
      return nearlyEqualNumbers(diffN, 0) || diffN <= Math.max(0.005, 1e-4 * (Number.isFinite(scale) ? scale : 1));
    } catch {
      return false;
    }
  }
  const na = toNumber(a);
  const nb = toNumber(b);
  if (na == null || nb == null) return false;
  return nearlyEqualNumbers(na, nb);
}

function formatValue(value, fallback) {
  if (math.isUnit(value)) {
    const text = math.format(value, { precision: 6 });
    return text.replace(".", ",");
  }
  const n = toNumber(value);
  if (n == null) return fallback || "";
  try {
    const fraction = math.fraction(n);
    const den = Number(fraction.d);
    const num = Number(fraction.s) * Number(fraction.n);
    if (Number.isFinite(den) && den > 0 && den <= 100) {
      const back = num / den;
      if (nearlyEqualNumbers(back, n)) {
        if (den === 1) return String(num);
        const sign = num < 0 ? "-" : "";
        return `${sign}${Math.abs(num)}/${den}`;
      }
    }
  } catch {
    /* Dezimalzahl zeigen */
  }
  const rounded = Math.round(n * 10000) / 10000;
  return String(rounded).replace(".", ",");
}

function evalPlain(compiled) {
  return compiled.code.evaluate({});
}

function sampleValues(count) {
  const values = [-3, -2, -1, 1, 2, 3, 4];
  while (values.length < count) {
    const n = Math.floor(Math.random() * 9) - 4;
    if (n !== 0) values.push(n);
  }
  return values;
}

function termsMatch(left, right) {
  const symbols = [...new Set([...freeSymbols(left.node), ...freeSymbols(right.node)])];
  if (!symbols.length) {
    try {
      const a = evalPlain(left);
      const b = evalPlain(right);
      return { ok: nearlyEqual(a, b), expected: formatValue(a, left.text) };
    } catch {
      return { ok: null };
    }
  }
  let hits = 0;
  const picks = sampleValues(8);
  for (let i = 0; i < picks.length && hits < 6; i += 1) {
    const scope = {};
    for (const name of symbols) scope[name] = picks[(i + name.length) % picks.length] || 1;
    try {
      const a = left.code.evaluate(scope);
      const b = right.code.evaluate(scope);
      hits += 1;
      if (!nearlyEqual(a, b)) {
        return { ok: false, expected: left.text };
      }
    } catch {
      /* neuer Wert, z. B. Division durch null */
    }
  }
  if (hits < 4) return { ok: null };
  return { ok: true, expected: left.text };
}

function compareSides(expectedExpr, givenExpr) {
  const left = compileExpr(expectedExpr);
  const right = compileExpr(givenExpr);
  if (!left || !right) return { status: "nicht_pruefbar" };
  if (hasUnit(left.text) || hasUnit(right.text)) {
    try {
      const a = evalPlain(left);
      const b = evalPlain(right);
      if (math.isUnit(a) || math.isUnit(b)) {
        const ok = nearlyEqual(a, b);
        return ok
          ? { status: "richtig" }
          : { status: "falsch", erwartet: formatValue(a, left.text) };
      }
    } catch {
      return { status: "nicht_pruefbar" };
    }
  }
  const matched = termsMatch(left, right);
  if (matched.ok == null) return { status: "nicht_pruefbar" };
  if (matched.ok) return { status: "richtig" };
  return { status: "falsch", erwartet: matched.expected || left.text };
}

function splitEquation(raw) {
  const text = normalizeExpr(stripWords(raw));
  const eq = text.lastIndexOf("=");
  if (eq <= 0 || eq >= text.length - 1) return null;
  const lhs = text.slice(0, eq).trim();
  const rhs = text.slice(eq + 1).trim();
  if (!lhs || !rhs || rhs.includes("=")) return null;
  return { lhs, rhs };
}

function extractExpression(raw) {
  const eq = splitEquation(raw);
  if (eq) return eq.lhs;
  const compiled = compileExpr(raw);
  return compiled ? compiled.text : "";
}

function extractResult(raw) {
  const eq = splitEquation(raw);
  if (eq) return eq.rhs;
  const compiled = compileExpr(raw);
  return compiled ? compiled.text : "";
}

export function checkStudentMath({ aufgabe = "", schuelerantwort = "", nachricht = "" } = {}) {
  const task = String(aufgabe || "").trim();
  const answer = String(schuelerantwort || "").trim();
  const message = String(nachricht || "").trim();

  if (task && answer) {
    const expected = extractExpression(task);
    const given = extractResult(answer);
    if (expected && given) {
      const checked = compareSides(expected, given);
      if (checked.status !== "nicht_pruefbar") return checked;
    }
  }

  const blobs = [answer, message, task];
  for (const blob of blobs) {
    const eq = splitEquation(blob);
    if (!eq) continue;
    const checked = compareSides(eq.lhs, eq.rhs);
    if (checked.status !== "nicht_pruefbar") return checked;
  }

  return { status: "nicht_pruefbar" };
}

export function formatPruefung(result) {
  if (!result || result.status === "nicht_pruefbar") return "nicht_pruefbar";
  if (result.status === "richtig") return "richtig";
  const expected = String(result.erwartet || "").trim();
  if (!expected) return "falsch";
  return `falsch, erwartet: ${expected}`;
}
