/**
 * Prüft alle Diagnosekarten unter coach/diagnosekarten.
 * Exit-Code 0 = in Ordnung, sonst 1.
 */
import { readdirSync, readFileSync, statSync } from "fs";
import { basename, dirname, extname, join } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../coach/diagnosekarten");
const LEVELS = new Set(["Rookie", "Operator", "Street Legend"]);
const CODE_RE = /^[A-Z][A-Z0-9_]*$/;
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9-]{0,120}$/;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name.startsWith(".")) continue;
    const file = join(dir, name);
    const info = statSync(file);
    if (info.isDirectory()) walk(file, out);
    else if (extname(name) === ".json") out.push(file);
  }
  return out;
}

function fail(errors, file, message) {
  errors.push(`${file}: ${message}`);
}

function checkCard(file, errors) {
  const name = basename(file, ".json");
  let data;
  try {
    data = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    fail(errors, file, "keine gültige JSON-Datei");
    return;
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    fail(errors, file, "die Karte muss ein Objekt sein");
    return;
  }
  if (!ID_RE.test(name)) {
    fail(errors, file, "der Dateiname ist keine gültige Kompetenz-ID");
  }
  if (typeof data.competenceId !== "string" || !data.competenceId.trim()) {
    fail(errors, file, "competenceId fehlt");
  } else if (data.competenceId !== name) {
    fail(errors, file, "competenceId muss exakt dem Dateinamen entsprechen");
  }
  if (typeof data.titel !== "string" || !data.titel.trim()) {
    fail(errors, file, "titel fehlt");
  }
  if (!Array.isArray(data.level) || data.level.length === 0) {
    fail(errors, file, "level muss eine Liste sein, z. B. Rookie und Operator");
  } else {
    for (const level of data.level) {
      if (!LEVELS.has(level)) {
        fail(errors, file, `unbekanntes Level „${level}“`);
      }
    }
  }
  if (!Array.isArray(data.fehlvorstellungen) || data.fehlvorstellungen.length === 0) {
    fail(errors, file, "fehlvorstellungen fehlt oder ist leer");
    return;
  }
  const seen = new Set();
  data.fehlvorstellungen.forEach((item, index) => {
    const where = `Fehlvorstellung ${index + 1}`;
    if (!item || typeof item !== "object") {
      fail(errors, file, `${where} ist kein Objekt`);
      return;
    }
    for (const key of ["code", "erkennung", "denkfehler", "hilfestrategie", "rueckfrage"]) {
      if (typeof item[key] !== "string" || !item[key].trim()) {
        fail(errors, file, `${where}: ${key} fehlt`);
      }
    }
    if (typeof item.code === "string" && item.code && !CODE_RE.test(item.code)) {
      fail(errors, file, `${where}: code soll in GROSSBUCHSTABEN mit Unterstrich sein`);
    }
    if (item.code && seen.has(item.code)) {
      fail(errors, file, `${where}: code ${item.code} kommt doppelt vor`);
    }
    if (item.code) seen.add(item.code);
  });
}

const errors = [];
let files = [];
try {
  files = walk(root);
} catch {
  console.error("Ordner coach/diagnosekarten wurde nicht gefunden.");
  process.exit(1);
}

if (!files.length) {
  console.error("Keine Diagnosekarten gefunden.");
  process.exit(1);
}

for (const file of files) checkCard(file, errors);

if (errors.length) {
  for (const line of errors) console.error(line);
  console.error(`${errors.length} Fehler in den Diagnosekarten.`);
  process.exit(1);
}

console.log(`${files.length} Diagnosekarten sind in Ordnung.`);
