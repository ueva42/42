/**
 * Lokale Coach-Kette ohne Datenbank und ohne Railway.
 * Start: node scripts/measure-coach-turn.js
 * Gibt Zeiten, HTTP und die echte Fehlermeldung aus. Keinen Schlüssel, keinen Schülertext.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { checkStudentMath, formatPruefung } from "../lib/coach-math.js";
import { completeCoach } from "../lib/coach-provider.js";
import { isDenkfehler, nextCoachStep, statusPrompt } from "../lib/coach-turn.js";

const ENV_KEYS = ["AI_BASE_URL", "AI_API_KEY", "AI_MODEL_STRONG", "AI_MODEL_FAST"];
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function loadSelectedEnv() {
  const file = resolve(root, ".env");
  if (!existsSync(file)) {
    console.log("env_datei=fehlt");
    return;
  }
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
  console.log("env_datei=vorhanden");
}

function fillPrompt(template, values) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const value = values[key];
    if (value == null || String(value).trim() === "") return "nicht angegeben";
    return String(value);
  });
}

function msSince(start) {
  return Math.round(performance.now() - start);
}

loadSelectedEnv();
console.log(`schluessel=${String(process.env.AI_API_KEY || "").trim() ? "ja" : "nein"}`);
console.log(`modell_stark=${String(process.env.AI_MODEL_STRONG || "gpt-oss-120b").trim() || "gpt-oss-120b"}`);

const schueler = "das ergibt 12";
const opening = "Hey! Lass uns Potenzen durchgehen. Was bedeutet 3²?";

let mark = performance.now();
const kontext = {
  thema: "Potenzen",
  kompetenz: "Potenzen verstehen",
  level: "Rookie",
  levelbeschreibung: "Grundbegriff: was eine Potenz bedeutet",
  status: statusPrompt("offen"),
  tagesziel: "Potenzen Rookie",
  aufgabe: "",
  hilfestufe: 0,
  verstaendnis: "nein",
  ursprung: opening,
  diagnosekarte: "keine"
};
console.log(`schritt=kontext dauer_ms=${msSince(mark)} abbruch=nein`);

mark = performance.now();
let checked;
let mathError = "";
try {
  checked = checkStudentMath({
    aufgabe: kontext.aufgabe,
    schuelerantwort: schueler,
    nachricht: schueler
  });
} catch (err) {
  mathError = `${err?.name || "Error"}: ${String(err?.message || "fehler").replace(/[\r\n]+/g, " ").slice(0, 180)}`;
}
if (mathError) {
  console.log(`schritt=mathe dauer_ms=${msSince(mark)} abbruch=ja meldung=${mathError}`);
} else {
  console.log(
    `schritt=mathe dauer_ms=${msSince(mark)} abbruch=nein status=${checked.status} pruefung=${formatPruefung(checked)}`
  );
}

mark = performance.now();
const template = readFileSync(resolve(root, "coach/prompts/system_mathe.md"), "utf8");
const pruefung = checked ? formatPruefung(checked) : "nicht_pruefbar";
const system = fillPrompt(template, {
  thema: kontext.thema,
  kompetenz: kontext.kompetenz,
  level: kontext.level,
  levelbeschreibung: kontext.levelbeschreibung,
  status: kontext.status,
  tagesziel: kontext.tagesziel,
  aufgabe: kontext.aufgabe,
  schuelerantwort: schueler,
  pruefung,
  diagnosekarte: kontext.diagnosekarte,
  hilfestufe: kontext.hilfestufe,
  verstaendnis: kontext.verstaendnis,
  ursprungsfrage: kontext.ursprung
});
const history = [{ role: "assistant", content: opening }];
const messages = [
  { role: "system", content: system },
  ...history,
  { role: "user", content: schueler }
];
const step = nextCoachStep({
  pruefung: checked?.status || "nicht_pruefbar",
  denkfehler: false,
  ohneFortschritt: 0,
  verstaendnis: false
});
const promptChars = messages.reduce((sum, message) => sum + String(message.content || "").length, 0);
console.log(
  `schritt=prompt dauer_ms=${msSince(mark)} abbruch=nein vorlage_zeichen=${template.length} system_zeichen=${system.length} gesendet_zeichen=${promptChars} folgeschritt=${step} modell=stark`
);

mark = performance.now();
let raw;
try {
  raw = await completeCoach({ messages });
  console.log(
    `schritt=ki dauer_ms=${msSince(mark)} abbruch=nein modell=${raw.modell} art=${raw.modelKind} antwort_zeichen=${String(raw.nachricht || "").length}`
  );
} catch (err) {
  const meldung = String(err?.message || err?.name || "fehler")
    .replace(/[\r\n]+/g, " ")
    .slice(0, 180);
  console.log(
    `schritt=ki dauer_ms=${msSince(mark)} abbruch=ja name=${err?.name || "-"} meldung=${meldung} http=${err?.status ?? err?.coachHttp ?? "-"}`
  );
  process.exit(0);
}

mark = performance.now();
const denkfehler = isDenkfehler(raw);
let after = step;
if (checked?.status !== "falsch") {
  after = nextCoachStep({
    pruefung: checked?.status || "nicht_pruefbar",
    denkfehler,
    ohneFortschritt: 0,
    verstaendnis: false
  });
}
console.log(
  `schritt=json dauer_ms=0 abbruch=nein denkfehler=${denkfehler ? "ja" : "nein"} folgeschritt=${after} zwischen_vorhanden=${raw.zwischenaufgabe ? "ja" : "nein"}`
);
console.log(`schritt=antwort dauer_ms=${msSince(mark)} abbruch=nein zeichen=${String(raw.nachricht || "").length}`);
