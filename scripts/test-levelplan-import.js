/**
 * Tests für den Levelplan-Import-Parser.
 * Ausführen: node scripts/test-levelplan-import.js
 */
import {
  parseLevelplanImportText,
  normalizeLevelplanImportRows
} from "../lib/levelplan-import.js";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function knownSubject(raw) {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return { subject: "", known: false };
  if (trimmed.toLowerCase() === "mathe" || trimmed === "Mathe") {
    return { subject: "Mathe", known: true };
  }
  return { subject: trimmed, known: false };
}

function testSingleHeadingPaste() {
  const text = `Binomische Formeln
Rookie
Ich kann (a + b)², (a – b)² und (a + b)(a – b) ausmultiplizieren und bilde dabei das mittlere Glied richtig.
Operator
Ich kann einen Term wie x² + 12x + 36 als Quadrat schreiben und prüfe mit 2ab, ob es passt.
Street Legend
Ich kann Fehler in binomischen Rechnungen finden und erklären – auch bei Termen mit zwei Variablen.`;

  const parsed = parseLevelplanImportText(text, knownSubject);
  const rows = normalizeLevelplanImportRows(parsed, "Mathe", knownSubject);
  assert(rows.length === 1, "one row");
  assert(rows[0].thema === "Binomische Formeln", `thema=${rows[0].thema}`);
  assert(rows[0].unterthema === "Binomische Formeln", `unterthema=${rows[0].unterthema}`);
  assert(rows[0].fach === "Mathe", `fach=${rows[0].fach}`);
  assert(rows[0].status === "OK", `status=${rows[0].status} missing=${JSON.stringify(rows[0].missing)}`);
  assert(rows[0].rookieZiel.includes("ausmultiplizieren"), "rookie text");
  assert(rows[0].operatorZiel.includes("Quadrat"), "operator text");
  assert(rows[0].streetLegendZiel.includes("Fehler"), "legend text");
}

function testTopicThenSubtopic() {
  const text = `Thema Wahrscheinlichkeit

Richtig zählen
Rookie
Ich zähle geordnet.
Operator
Ich nutze Tabellen.
Street Legend
Ich begründe den Weg.`;
  const rows = normalizeLevelplanImportRows(
    parseLevelplanImportText(text, knownSubject),
    "Mathe",
    knownSubject
  );
  assert(rows.length === 1, "one row");
  assert(rows[0].thema === "Wahrscheinlichkeit", `thema=${rows[0].thema}`);
  assert(rows[0].unterthema === "Richtig zählen", `unterthema=${rows[0].unterthema}`);
  assert(rows[0].status === "OK", `status=${rows[0].status}`);
}

testSingleHeadingPaste();
testTopicThenSubtopic();
console.log("OK – levelplan import parser tests passed");
