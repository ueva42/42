/**
 * LaTeX in der Coach-JSON darf weder den Parse noch die Anzeige killen.
 * node scripts/check-coach-latex.mjs
 */
import { parseModelJson } from "../lib/coach-provider.js";
import { readableCoachText, verifiedZwischenaufgabe, composeZwischen } from "../lib/coach-turn.js";
import { checkStudentMath } from "../lib/coach-math.js";

let failed = 0;

function assert(cond, msg) {
  if (cond) return;
  failed += 1;
  console.error("FAIL", msg);
}

function noJunk(text, label) {
  assert(!String(text).includes("imes"), `${label} enthält imes: ${JSON.stringify(text)}`);
  assert(!String(text).includes("\\"), `${label} enthält Backslash: ${JSON.stringify(text)}`);
}

const samples = [
  ["2\\times3", "2 mal 3"],
  ["\\sqrt{8}", "Wurzel 8"],
  ["\\frac{1}{2}", "1/2"],
  ["\\cdot", "mal"]
];

for (const [input, expected] of samples) {
  const got = readableCoachText(input);
  assert(got === expected, `${JSON.stringify(input)} → ${JSON.stringify(got)}, erwartet ${JSON.stringify(expected)}`);
  noJunk(got, input);
  assert(readableCoachText(got) === got, `nicht stabil: ${JSON.stringify(got)}`);
}

assert(readableCoachText("2imes3") === "2 mal 3", "2imes3");
assert(readableCoachText("einmal") === "einmal", "einmal bleibt");
assert(
  readableCoachText("Kann man √8 + √8 zusammenfassen?") === "Kann man √8 + √8 zusammenfassen?",
  "Wurzelzeichen bleibt"
);
assert(readableCoachText(String.raw`2\\times3`) === "2 mal 3", "doppelter Backslash mal");
assert(readableCoachText("2·3") === "2 mal 3", "malpunkt");
assert(readableCoachText("2 × 3") === "2 mal 3", "malzeichen");

const snippet = String.raw`{"nachricht":"Schau $\sqrt{8}$ und $2\times3$ und $\frac{1}{2}$ und $\cdot$ an.","diagnose_code":"KEINER","hilfestufe":1,"loesung_verraten":false,"denkfehler":true,"zwischenaufgabe":{"aufgabe":"\sqrt{4}+\sqrt{4}","loesung":"4","anzeige":"Was ist $\sqrt{4}+\sqrt{4}$?"}}`;
let nativeThrew = false;
try {
  JSON.parse(snippet);
} catch {
  nativeThrew = true;
}
assert(nativeThrew, "JSON.parse soll an \\sqrt scheitern");

const parsed = parseModelJson(snippet);
const shown = readableCoachText(parsed.nachricht);
noJunk(shown, "schnipsel");
assert(shown.includes("Wurzel 8"), `Wurzel fehlt: ${shown}`);
assert(shown.includes("2 mal 3"), `mal fehlt: ${shown}`);
assert(shown.includes("1/2"), `bruch fehlt: ${shown}`);
assert(parsed.zwischenaufgabe?.aufgabe?.includes("sqrt") || parsed.zwischenaufgabe?.aufgabe?.includes("\\sqrt"), JSON.stringify(parsed.zwischenaufgabe));
const line = composeZwischen(parsed.nachricht, parsed.zwischenaufgabe);
noJunk(line, "zwischenzeile");
assert(line.includes("Wurzel"), line);

const onlyTimes = String.raw`{"nachricht":"2\times3","diagnose_code":"KEINER","hilfestufe":0,"zwischenaufgabe":null}`;
const times = parseModelJson(onlyTimes);
assert(times.nachricht === "2\\times3", `times verschluckt: ${JSON.stringify(times.nachricht)}`);
assert(!times.nachricht.includes("\t"), "times wurde zum Tab");
assert(readableCoachText(times.nachricht) === "2 mal 3", JSON.stringify(times.nachricht));

const onlyFrac = String.raw`{"nachricht":"\frac{1}{2}","diagnose_code":"KEINER","hilfestufe":0}`;
const frac = parseModelJson(onlyFrac);
assert(!frac.nachricht.includes("\f"), `frac verschluckt: ${JSON.stringify(frac.nachricht)}`);
assert(readableCoachText(frac.nachricht) === "1/2", JSON.stringify(frac.nachricht));

const onlyRoot = String.raw`{"nachricht":"\sqrt{8}+\sqrt{8}","diagnose_code":"KEINER","hilfestufe":1,"denkfehler":true,"zwischenaufgabe":{"aufgabe":"2*3","loesung":"6","anzeige":"Was ist 2 mal 3?"}}`;
const root = parseModelJson(onlyRoot);
assert(readableCoachText(root.nachricht) === "Wurzel 8+Wurzel 8", JSON.stringify(root.nachricht));
assert(root.zwischenaufgabe?.loesung === "6", "aufgabe bleibt prüfbar");

const newline = String.raw`{"nachricht":"Hi\nund weiter","diagnose_code":"KEINER","hilfestufe":0}`;
assert(parseModelJson(newline).nachricht === "Hi\nund weiter", "Zeilenumbruch vor und");

const nabla = String.raw`{"nachricht":"\nabla","diagnose_code":"KEINER","hilfestufe":0}`;
assert(parseModelJson(nabla).nachricht === String.raw`\nabla`, "nabla bleibt Befehl");
noJunk(readableCoachText(parseModelJson(nabla).nachricht), "nabla anzeige");

const broken = String.raw`{"nachricht":"Du nennst die Regel, nicht den Grund.","diagnose_code":"EIGEN:auswendig","hilfestufe":1,"denkfehler":true,"zwischenaufgabe":{"aufgabe":"\sqrt{4}","loesung":"2","anzeige":"Was ist \sqrt{4}?",}}`;
const saved = parseModelJson(broken);
assert(saved.nachricht.startsWith("Du nennst die Regel"), saved.nachricht);
assert(saved.zwischenaufgabe == null, "kaputte Aufgabe wird verworfen");
assert(saved.denkfehler === true, "denkfehler bleibt");
noJunk(readableCoachText(saved.nachricht), "gerettete nachricht");

assert(verifiedZwischenaufgabe({ zwischenaufgabe: { aufgabe: "keine rechnung", loesung: "weiss nicht", anzeige: "Erklär mal" } }) == null, "nicht prüfbar");
assert(checkStudentMath({ aufgabe: String.raw`2\times3`, schuelerantwort: "6" }).status === "richtig", "2 mal 3 prüfen");
assert(checkStudentMath({ aufgabe: "2*3", schuelerantwort: "6" }).status === "richtig", "stern bleibt prüfbar");

const tan = parseModelJson(String.raw`{"nachricht":"\tan und \right und \(x\) und \{8\}","diagnose_code":"KEINER","hilfestufe":0}`);
assert(tan.nachricht === String.raw`\tan und \right und \(x\) und \{8\}`, JSON.stringify(tan.nachricht));
noJunk(readableCoachText(tan.nachricht), "tan/right/klammern");
assert(!tan.nachricht.includes("\t") && !tan.nachricht.includes("\r"), "tan/right verschluckt");

const weiter = parseModelJson(String.raw`{"nachricht":"Hi\nWeiter","diagnose_code":"KEINER","hilfestufe":0}`);
assert(weiter.nachricht === "Hi\nWeiter", "Umbruch vor Großbuchstabe");

const kept = parseModelJson('{"nachricht":"Zeile\\nWeiter und \\\\sqrt{8}","diagnose_code":"KEINER","hilfestufe":0}');
assert(kept.nachricht === "Zeile\nWeiter und \\sqrt{8}", JSON.stringify(kept.nachricht));
noJunk(readableCoachText(kept.nachricht), "schon korrekt escaped");
assert(readableCoachText(kept.nachricht).includes("Wurzel 8"), readableCoachText(kept.nachricht));

const quote = String.raw`{"nachricht":"Er sagt \"hi\" dazu","diagnose_code":"KEINER","hilfestufe":0}`;
assert(parseModelJson(quote).nachricht === 'Er sagt "hi" dazu', "Anführungszeichen");

if (failed) {
  console.error(`${failed} Fehler`);
  process.exit(1);
}
console.log("ok");
