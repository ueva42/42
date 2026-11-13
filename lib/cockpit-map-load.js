/**
 * Lädt Cockpit-Stadtteil-Karten aus public/cockpit-karten (einmal, mit Cache).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const mapsDir = join(dirname(fileURLToPath(import.meta.url)), "../public/cockpit-karten");

let cache = null;

function readJson(fileName) {
  return JSON.parse(readFileSync(join(mapsDir, fileName), "utf8"));
}

/** Index + Detail-Maps (Map id → detail). Wiederholte Aufrufe nutzen denselben Cache. */
export function loadCockpitMaps() {
  if (cache) return cache;
  const index = readJson("index.json");
  const details = new Map();
  if (Array.isArray(index)) {
    for (const entry of index) {
      if (!entry?.file || !entry?.id) continue;
      try {
        details.set(entry.id, readJson(entry.file));
      } catch {
        // fehlende Detail-Datei überspringen
      }
    }
  }
  cache = { index: Array.isArray(index) ? index : [], details };
  return cache;
}

/** Nur für Tests: Cache leeren. */
export function clearCockpitMapsCache() {
  cache = null;
}

export function cockpitKartenDir() {
  return mapsDir;
}
