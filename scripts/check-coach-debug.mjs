/**
 * Diagnose-Codes und Mathe-Prüfung, ohne KI und ohne Datenbank.
 * node scripts/check-coach-debug.mjs
 */
import { checkStudentMath } from "../lib/coach-math.js";
import { logCoachFailure, unreachablePayload, COACH_UNREACHABLE } from "../lib/coach-provider.js";
import { nextCoachStep } from "../lib/coach-turn.js";

let failed = 0;

function assert(cond, msg) {
  if (cond) return;
  failed += 1;
  console.error("FAIL", msg);
}

function capture(run) {
  const lines = [];
  const prev = console.error;
  console.error = (line) => lines.push(String(line));
  try {
    run();
  } finally {
    console.error = prev;
  }
  return lines.join("\n");
}

const answer = "das ergibt 12";
let mathStatus = "";
try {
  mathStatus = checkStudentMath({
    aufgabe: "",
    schuelerantwort: answer,
    nachricht: answer
  }).status;
} catch (err) {
  assert(false, `mathe wirft ${err?.name || "Error"}`);
}
assert(mathStatus === "nicht_pruefbar", `status ${mathStatus}`);

let powerStatus = "";
try {
  powerStatus = checkStudentMath({ aufgabe: "3^2", schuelerantwort: "12", nachricht: "12" }).status;
} catch (err) {
  assert(false, `potenz wirft ${err?.name || "Error"}`);
}
assert(powerStatus === "falsch", `potenz status ${powerStatus}`);

const step = nextCoachStep({
  pruefung: "nicht_pruefbar",
  denkfehler: false,
  ohneFortschritt: 0,
  verstaendnis: false
});
assert(step === "normal", `folgeschritt ${step}`);

delete process.env.COACH_DEBUG;
const hidden = unreachablePayload({ coachDebug: "TIMEOUT", message: "zeit" });
assert(hidden.nachricht === COACH_UNREACHABLE, "freundliche meldung");
assert(hidden.debugCode == null, "debug standard aus");

process.env.COACH_DEBUG = "true";
for (const code of ["TIMEOUT", "HTTP_401", "HTTP_400", "HTTP_500", "JSON_FEHLER", "LEER", "DB_FEHLER", "VERBINDUNG"]) {
  const body = unreachablePayload({ coachDebug: code });
  assert(body.nachricht === COACH_UNREACHABLE, `meldung ${code}`);
  assert(body.debugCode === code, `code ${code}`);
}
assert(unreachablePayload({ coachDebug: "geheim" }).debugCode == null, "fremder code bleibt weg");
delete process.env.COACH_DEBUG;

const plain = capture(() => {
  const err = new Error("coach-provider-unconfigured");
  err.coachMs = 0;
  logCoachFailure("ki", err);
});
assert(plain.includes("schritt=ki"), plain);
assert(plain.includes("meldung=coach-provider-unconfigured"), plain);
assert(plain.includes("http=-"), plain);
assert(plain.includes("dauer_ms=0"), plain);
assert(!plain.includes("verbindung"), plain);

const db = capture(() => {
  const err = new Error("insert schuelertext");
  err.severity = "ERROR";
  err.code = "23502";
  err.coachMs = 4;
  logCoachFailure("speichern", err);
});
assert(db.includes("schritt=speichern"), db);
assert(db.includes("code=DB_FEHLER"), db);
assert(db.includes("meldung=23502"), db);
assert(!db.includes("schuelertext"), db);

const http = capture(() => {
  const err = new Error("coach-provider-http");
  err.coachHttp = 401;
  err.coachMs = 320;
  err.coachDebug = "HTTP_401";
  logCoachFailure("ki", err);
});
assert(http.includes("http=401"), http);
assert(http.includes("dauer_ms=320"), http);
assert(http.includes("code=HTTP_401"), http);

if (failed) {
  console.error(`${failed} Fehler`);
  process.exit(1);
}
console.log("ok");
