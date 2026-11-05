/**
 * Trainingscenter-Verbindung, nur Thema Funktionen.
 * Ausführen: node scripts/test-training.js
 */
import assert from "node:assert/strict";
import { once } from "node:events";
import express from "express";
import {
  TRAINING_ORIGIN,
  REDEEM_HINWEIS,
  applyTrainingCors,
  bandFromSolved,
  formatZielnote,
  loadHalte,
  matchHalteToGoals,
  mergeTraining,
  pensumText,
  topicIsFunktionen,
  trainingAllowOrigin,
  validatePayload,
  vergleich,
  wzForThema
} from "../lib/training-merge.js";
import {
  allowTrainingMessage,
  captureTrainingResultBody,
  registerTrainingRoutes,
  resetTrainingRateLimit
} from "../lib/training-api.js";

const TOKEN = "aaaaaaaaaaaaaaaa";
const REVOKED = "bbbbbbbbbbbbbbbb";
const RATE = "cccccccccccccccc";
const UNKNOWN = "dddddddddddddddd";

function levels(rookie, operator, streetLegend) {
  return { rookie, operator, streetLegend };
}

function body(extra = {}) {
  return {
    v: 1,
    token: TOKEN,
    wz: "9-05b",
    levels: levels(
      { solved: 6, first: 5, safe: true },
      { solved: 4, first: 1, safe: false },
      { solved: 1, first: 0, safe: false }
    ),
    kontrolle: true,
    problem: true,
    ichKann: { rookie: "sicher", operator: "noch nicht", streetLegend: null },
    pensumErfuellt: true,
    ...extra
  };
}

const halte = loadHalte();
assert.equal(halte.length, 26);
assert.equal(halte.find((item) => item.n === 7).wz, "9-05b");
assert.equal(halte.some((item) => item.wz === "fkt-07"), false);
assert.deepEqual(Object.keys(halte[0]).sort(), ["n", "name", "url", "wz"]);
assert.equal(wzForThema("funktionen").has("9-05b"), true);
assert.equal(wzForThema("funktionen").has("fkt-01"), true);
assert.equal(wzForThema("brueche").has("9-05b"), false);

assert.equal(trainingAllowOrigin(TRAINING_ORIGIN), TRAINING_ORIGIN);
assert.equal(trainingAllowOrigin("https://evil.example"), "");
assert.equal(trainingAllowOrigin("http://trainingscenter.streetsoflogic.de"), "");

const corsHeaders = {};
applyTrainingCors(
  { headers: { origin: "https://evil.example" } },
  { setHeader(name, value) { corsHeaders[name] = value; } }
);
assert.equal(corsHeaders["Access-Control-Allow-Origin"], undefined);
assert.equal(corsHeaders.Vary, "Origin");

const prior = {
  wz: "9-05b",
  levels: levels(
    { solved: 6, first: 5, safe: true },
    { solved: 2, first: 1, safe: false },
    { solved: 0, first: 0, safe: false }
  ),
  kontrolle: true,
  problem: true,
  ichKann: { rookie: "sicher", operator: "teilweise", streetLegend: null }
};
const checked = validatePayload(
  body({
    levels: levels(
      { solved: 1, first: 0, safe: false },
      { solved: 4, first: 3, safe: true },
      { solved: 0, first: 0, safe: false }
    ),
    kontrolle: false,
    problem: false,
    ichKann: { rookie: null, operator: "noch nicht", streetLegend: "noch-nicht" }
  })
);
assert.equal(checked.ok, true);
assert.equal(checked.value.ichKann.operator, "noch-nicht");
const merged = mergeTraining(prior, checked.value);
assert.equal(merged.levels.rookie.solved, 6);
assert.equal(merged.levels.rookie.first, 5);
assert.equal(merged.levels.rookie.safe, true);
assert.equal(merged.levels.operator.solved, 4);
assert.equal(merged.levels.operator.first, 3);
assert.equal(merged.levels.operator.safe, true);
assert.equal(merged.kontrolle, true);
assert.equal(merged.problem, true);
assert.equal(merged.ichKann.rookie, "sicher");
assert.equal(merged.ichKann.operator, "noch-nicht");
assert.equal(merged.ichKann.streetLegend, "noch-nicht");
assert.equal(Object.hasOwn(merged, "pensumErfuellt"), false);

assert.equal(validatePayload(body({ v: 2 })).ok, false);
assert.equal(validatePayload(body({ token: "kurz" })).ok, false);
assert.equal(validatePayload(body({ token: "hat leerzeichen!!!!" })).ok, false);
assert.equal(validatePayload(body({ wz: "fremd" })).ok, false);
assert.equal(
  validatePayload(body({
    levels: levels(
      { solved: 1000, first: 0, safe: false },
      { solved: 0, first: 0, safe: false },
      { solved: 0, first: 0, safe: false }
    )
  })).ok,
  false
);
assert.equal(
  validatePayload(body({
    levels: levels(
      { solved: 1.5, first: 0, safe: false },
      { solved: 0, first: 0, safe: false },
      { solved: 0, first: 0, safe: false }
    )
  })).ok,
  false
);
assert.equal(validatePayload(body({ ichKann: { rookie: "vielleicht", operator: null, streetLegend: null } })).ok, false);
assert.equal(formatZielnote("1.5"), "1,5");
assert.equal(formatZielnote("3"), "3");
assert.equal(formatZielnote(""), null);

const pairs = [
  [6, "sicher", "passt"],
  [6, "teilweise", "unterschätzt"],
  [6, "noch-nicht", "unterschätzt"],
  [4, "sicher", "überschätzt"],
  [4, "teilweise", "passt"],
  [4, "noch nicht", "unterschätzt"],
  [1, "sicher", "überschätzt"],
  [1, "teilweise", "überschätzt"],
  [0, "noch-nicht", "passt"],
  [2, null, null]
];
for (const [solved, kann, expected] of pairs) {
  assert.equal(vergleich(solved, kann), expected, `${solved} ${kann}`);
}
assert.equal(bandFromSolved(6), "sicher");
assert.equal(bandFromSolved(5), "teilweise");
assert.equal(bandFromSolved(2), "noch-nicht");

const goals = [
  { id: "g1", text: "Scheitel auf der y-Achse" },
  { id: "g2", text: "  geraden   zeichnen " },
  { id: "g3", text: "Scheitel auf der y-Achse" }
];
const matched = matchHalteToGoals(halte, [
  { id: "g1", text: "Scheitel auf der y-Achse" },
  { id: "g2", text: "Geraden zeichnen" }
]);
assert.equal(matched.matches.length, 2);
assert.equal(matched.abweichungen.some((item) => item.name === "Scheitel auf der y-Achse"), false);
assert.equal(matched.abweichungen.some((item) => item.name === "Prüfungsaufgaben"), true);
const ambiguous = matchHalteToGoals(halte, goals);
assert.equal(
  ambiguous.abweichungen.some((item) => item.wz === "9-05b" && item.grund === "nicht eindeutig"),
  true
);
assert.equal(topicIsFunktionen("Quadratische Funktionen", [{ id: "x", text: "anders" }]), true);
assert.equal(
  topicIsFunktionen("Brüche", [
    { id: "g2", text: "Geraden zeichnen" },
    { id: "a", text: "Kürzen" },
    { id: "b", text: "Erweitern" }
  ]),
  false
);

const pensum = pensumText(
  [
    { levels: levels({ safe: true }, { safe: false }, { safe: false }) },
    { levels: levels({ safe: true }, { safe: true }, { safe: false }) }
  ],
  "3",
  (total, key) => {
    assert.equal(key, "3");
    assert.equal(total, 2);
    return { rookie: 2, operator: 2, street_legend: 0 };
  }
);
assert.equal(pensum, "Operator: 1 von 2");
const full = pensumText(
  [{ levels: levels({ safe: true }, { safe: true }, { safe: false }) }],
  "3",
  () => ({ rookie: 1, operator: 1, street_legend: 0 })
);
assert.equal(full, "Pensum erfüllt");

const db = {
  tokens: [
    { token: TOKEN, student_id: 7, thema: "funktionen", revoked_at: null },
    { token: REVOKED, student_id: 7, thema: "funktionen", revoked_at: "2026-01-01" },
    { token: RATE, student_id: 7, thema: "funktionen", revoked_at: null }
  ],
  results: []
};

function memoryPool() {
  return {
    async query(sql, params = []) {
      const q = sql.replace(/\s+/g, " ").trim();
      if (q.startsWith("SELECT token, student_id")) {
        const row = db.tokens.find((item) => item.token === params[0]);
        return { rows: row ? [row] : [] };
      }
      if (q.startsWith("SELECT merged, updated_at")) {
        const row = db.results.find((item) => item.student_id === params[0] && item.wz === params[1]);
        return { rows: row ? [row] : [] };
      }
      if (q.startsWith("INSERT INTO training_results")) {
        const row = {
          student_id: params[0],
          wz: params[1],
          merged: JSON.parse(params[2]),
          last_raw: JSON.parse(params[3]),
          updated_at: new Date().toISOString()
        };
        const index = db.results.findIndex((item) => item.student_id === row.student_id && item.wz === row.wz);
        if (index >= 0) db.results[index] = row;
        else db.results.push(row);
        return { rows: [] };
      }
      if (q.startsWith("SELECT id, class_id, school_id")) {
        return { rows: [{ id: 7, class_id: 3, school_id: 1 }] };
      }
      if (q.startsWith("SELECT target_grade_key")) {
        if (params[1] === "lc-f") return { rows: [{ target_grade_key: "1.5", target_grade: null }] };
        if (params[1] === "lc-b") return { rows: [{ target_grade_key: "6", target_grade: null }] };
        return { rows: [] };
      }
      if (q.startsWith("SELECT wz, merged")) {
        return { rows: db.results.filter((item) => item.student_id === params[0]) };
      }
      throw new Error(`unerwartetes SQL: ${q}`);
    }
  };
}

function checks() {
  return [
    {
      id: "lc-f",
      name: "Funktionen",
      subject: "Mathematik",
      goals: [
        { id: "g1", text: "Scheitel auf der y-Achse" },
        { id: "g2", text: "Geraden zeichnen" }
      ]
    },
    {
      id: "lc-b",
      name: "Brüche",
      subject: "Mathematik",
      goals: [{ id: "g3", text: "Kürzen" }]
    }
  ];
}

const app = express();
app.use(captureTrainingResultBody);
app.use(express.json({ limit: "2mb" }));
registerTrainingRoutes(app, {
  pool: memoryPool(),
  isStudent(req, _res, next) {
    req.session = { user: { id: 7, role: "student", class_id: 3, school_id: 1 } };
    next();
  },
  isTeacher(req, _res, next) {
    req.session = { user: { id: 3, role: "teacher", school_id: 1 } };
    next();
  },
  async teacherCanAccessClass() {
    return true;
  },
  async getLevelChecksForClass() {
    return checks();
  },
  recommendedTierCounts(total, key) {
    if (key === "1.5") return { rookie: total, operator: total, street_legend: Math.ceil(total * 0.65) };
    if (key === "3") return { rookie: total, operator: Math.ceil(total * 0.8), street_legend: 0 };
    return null;
  }
});

const server = app.listen(0);
await once(server, "listening");
const base = `http://127.0.0.1:${server.address().port}`;

async function call(path, options = {}) {
  const res = await fetch(`${base}${path}`, options);
  const text = await res.text();
  let json = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch (_err) {
      json = null;
    }
  }
  return { status: res.status, headers: res.headers, json, text };
}

try {
  const preflight = await call("/api/training/results", {
    method: "OPTIONS",
    headers: { Origin: TRAINING_ORIGIN }
  });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("access-control-allow-origin"), TRAINING_ORIGIN);
  assert.equal(preflight.headers.get("vary"), "Origin");
  assert.match(preflight.headers.get("access-control-allow-methods"), /GET/);
  assert.match(preflight.headers.get("access-control-allow-methods"), /POST/);
  assert.match(preflight.headers.get("access-control-allow-headers"), /Content-Type/);

  const evil = await call("/api/training/status?t=" + TOKEN, {
    headers: { Origin: "https://evil.example" }
  });
  assert.equal(evil.headers.get("access-control-allow-origin"), null);

  const huge = await call("/api/training/results", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: TRAINING_ORIGIN },
    body: JSON.stringify(body({ pad: "x".repeat(5000) }))
  });
  assert.equal(huge.status, 400);
  assert.equal(db.results.length, 0);

  assert.equal((await call("/api/training/results", {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify(body({ token: "kurz" }))
  })).status, 400);
  assert.equal((await call("/api/training/results", {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify(body({ token: UNKNOWN }))
  })).status, 404);
  assert.equal((await call("/api/training/results", {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify(body({ token: REVOKED }))
  })).status, 410);
  assert.equal((await call("/api/training/status?t=" + UNKNOWN)).status, 404);
  assert.equal((await call("/api/training/status?t=" + REVOKED)).status, 410);

  const saved = await call("/api/training/results", {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=UTF-8", Origin: TRAINING_ORIGIN },
    body: JSON.stringify(body())
  });
  assert.equal(saved.status, 200);
  assert.deepEqual(saved.json, { ok: true });
  assert.equal(saved.headers.get("access-control-allow-origin"), TRAINING_ORIGIN);
  const stored = db.results.find((item) => item.wz === "9-05b");
  assert.equal(stored.merged.ichKann.operator, "noch-nicht");
  assert.equal(stored.merged.pensumErfuellt, undefined);
  assert.equal(stored.last_raw.pensumErfuellt, true);
  assert.equal(stored.last_raw.token, undefined);

  const lower = await call("/api/training/results", {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify(body({
      levels: levels(
        { solved: 1, first: 0, safe: false },
        { solved: 2, first: 0, safe: false },
        { solved: 0, first: 0, safe: false }
      ),
      kontrolle: false,
      problem: false,
      ichKann: { rookie: null, operator: null, streetLegend: "sicher" }
    }))
  });
  assert.equal(lower.status, 200);
  const again = db.results.find((item) => item.wz === "9-05b");
  assert.equal(again.merged.levels.rookie.solved, 6);
  assert.equal(again.merged.levels.rookie.safe, true);
  assert.equal(again.merged.kontrolle, true);
  assert.equal(again.merged.problem, true);
  assert.equal(again.merged.ichKann.rookie, "sicher");
  assert.equal(again.merged.ichKann.streetLegend, "sicher");

  db.results.push({
    student_id: 7,
    wz: "fremd-wz",
    merged: { wz: "fremd-wz", levels: {}, kontrolle: true },
    last_raw: {},
    updated_at: new Date().toISOString()
  });
  const status = await call("/api/training/status?t=" + TOKEN, {
    headers: { Origin: TRAINING_ORIGIN }
  });
  assert.equal(status.status, 200);
  assert.equal(status.json.zielnote, "1,5");
  assert.deepEqual(Object.keys(status.json.halte), ["9-05b"]);
  assert.deepEqual(Object.keys(status.json.halte["9-05b"]).sort(), [
    "kontrolle",
    "operator",
    "rookie",
    "streetLegend"
  ]);
  assert.deepEqual(Object.keys(status.json.halte["9-05b"].rookie).sort(), ["safe", "solved"]);
  assert.equal(JSON.stringify(status.json).includes("name"), false);

  const codeRedeem = await call("/api/student/training/redeem", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: "9-05B-R64-OP21-SL00-K1-I320-AA" })
  });
  assert.equal(codeRedeem.status, 400);
  assert.equal(codeRedeem.json.gespeichert, false);
  assert.equal(codeRedeem.json.hinweis, REDEEM_HINWEIS);
  assert.equal(codeRedeem.json.beispiel.v, 1);
  assert.equal(db.results.some((item) => item.wz === "fkt-02"), false);

  const jsonRedeem = await call("/api/student/training/redeem", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body({
      token: undefined,
      wz: "fkt-01",
      ichKann: { rookie: "teilweise", operator: null, streetLegend: null }
    }))
  });
  assert.equal(jsonRedeem.status, 200);
  assert.equal(jsonRedeem.json.ok, true);
  assert.match(jsonRedeem.json.hinweis, /JSON/);
  assert.equal(db.results.find((item) => item.wz === "fkt-01").merged.levels.rookie.solved, 6);

  resetTrainingRateLimit();
  for (let i = 0; i < 60; i += 1) {
    const res = await call("/api/training/results", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify(body({ token: RATE, wz: "fkt-08" }))
    });
    assert.equal(res.status, 200, `meldung ${i + 1}`);
  }
  const limited = await call("/api/training/results", {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify(body({ token: RATE, wz: "fkt-08" }))
  });
  assert.equal(limited.status, 429);
  assert.equal(allowTrainingMessage(RATE), false);
} finally {
  await new Promise((resolve) => server.close(resolve));
}

console.log("training tests ok");
