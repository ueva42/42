/**
 * Diagnosekarten liegen als Datei pro Kompetenz.
 * Der Dateiname ist level_check_goals.id, nicht der Unterthema-Text.
 * Fehlt die Datei, arbeitet der Coach ohne Karte weiter.
 */
import { existsSync, readFileSync } from "fs";
import { basename, dirname, join } from "path";
import { fileURLToPath } from "url";

const cardsDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "../coach/diagnosekarten/mathe"
);

const ID_RE = /^[A-Za-z0-9][A-Za-z0-9-]{0,120}$/;

export function loadDiagnosekarte(competenceId) {
  const id = String(competenceId || "").trim();
  if (!ID_RE.test(id)) return null;
  const name = `${id}.json`;
  const file = join(cardsDir, name);
  if (basename(file) !== name || dirname(file) !== cardsDir) return null;
  if (!existsSync(file)) return null;
  try {
    const data = JSON.parse(readFileSync(file, "utf8"));
    if (!data || typeof data !== "object") return null;
    if (String(data.competenceId || "") !== id) return null;
    if (!Array.isArray(data.fehlvorstellungen)) return null;
    return data;
  } catch {
    return null;
  }
}

export function formatDiagnosekarte(card) {
  if (!card || !Array.isArray(card.fehlvorstellungen) || !card.fehlvorstellungen.length) {
    return "keine Karte hinterlegt";
  }
  const lines = [];
  if (card.titel) lines.push(`Titel: ${card.titel}`);
  for (const item of card.fehlvorstellungen) {
    if (!item || !item.code) continue;
    lines.push(
      [
        `Code ${item.code}`,
        `Erkennung: ${item.erkennung || ""}`,
        `Denkfehler: ${item.denkfehler || ""}`,
        `Hilfestrategie: ${item.hilfestrategie || ""}`,
        `Rückfrage: ${item.rueckfrage || ""}`
      ].join(" | ")
    );
  }
  return lines.length ? lines.join("\n") : "keine Karte hinterlegt";
}
