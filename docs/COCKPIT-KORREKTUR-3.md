# Cockpit – Korrekturen Runde 3: Avatare, Schriftgrößen, Aufteilung der Ansichten

Bezug: `docs/COCKPIT.md`, `COCKPIT-KORREKTUR-1.md`, `COCKPIT-KORREKTUR-2.md`. Direkt umsetzen, keine Datenbankänderungen. Am Ende die Prüfliste abhaken und in einfachem Deutsch erklären, was geändert ist.

---

## 1. Neue Aufteilung der drei Beamer-Ansichten

Heute ist A voll, B läuft über (Respekt abgeschnitten, „Ziehung starten“ unten raus) und C ist zu zwei Dritteln leer. Neu:

| Ansicht | Name im Umschalter | Inhalt |
|---|---|---|
| A | Mission | 4 Kennzahlen · Karte bzw. Missionen · Boss (wie jetzt) |
| B | Klasse | **Avatar-Wand** „Wer ist dabei?“ (oben, ca. 55 % der Höhe) · darunter zweispaltig **Respekt kompakt** und **Side Quest** · Ticker-Leiste ganz unten (nur wenn Meldungen da sind) |
| C | Belohnung | **Highlights** mit Avataren · **Glücks-Ziehung** · **Season-Leiste** · später Crews |

- Die Knöpfe A/B/C heißen „Mission“, „Klasse“ und „Belohnung“; die drei Punkte im Vollbild bleiben.
- **Jede Ansicht passt bei 1920 × 1080 und auf dem iPad quer komplett auf den Bildschirm**, ohne Scrollen, ohne Abschneiden und ohne große Leerflächen. Inhalte verteilen sich mit CSS-Grid und `1fr`-Zeilen auf die Höhe.

## 2. Avatar-Wand „Wer ist dabei?“ (Ansicht B)

**Was:** Alle Schüler:innen der Klasse mit ihrem Charakter-Avatar (dieselben Avatar-Bilder wie im alten Cockpit „Wer ist schon dabei?“ und auf der Schülerseite).

**Reihenfolge:** immer **alphabetisch** und fest, **nicht** nach Status sortiert. So stehen die, die noch fehlen, nicht als Block am Ende.

**Drei Zustände pro Person (für heute):**

| Zustand | Bedingung | Darstellung |
|---|---|---|
| noch kein Ziel | heute kein Tagesziel | Avatar gedimmt (Graustufen, 55 % Deckkraft), dünner grauer Ring, kein Abzeichen |
| Ziel gesetzt | Tagesziel heute gesetzt, noch kein Abschluss | Avatar in Farbe, Ring in App-Cyan, kleines Abzeichen „Ziel“ unten |
| Abschluss | Tag abgeschlossen (Reflexion/Abschluss) | Avatar in Farbe, Ring mit App-Verlauf Cyan → Violett, Abzeichen mit Häkchen ✓ |

Falls es eine Abwesenheit gibt: abwesende Personen ausblenden und in der Zählung nicht mitzählen. Sonst alle zeigen.

**Kopfzeile der Wand:** drei Zähler nebeneinander:
- „23 Ziel gesetzt“ (Cyan-Punkt)
- „17 abgeschlossen“ (Häkchen)
- „10 noch ohne Ziel“ (grauer Punkt)

**Größe und Raster:**
- Avatar-Kreis 72 px bei 1920 × 1080, Name darunter 15 px, eine Zeile, bei Überlänge mit „…“ kürzen.
- Raster `repeat(auto-fill, minmax(104px, 1fr))`, bei 33 Personen etwa 3 Reihen. Bei mehr Personen wird der Avatar kleiner (min. 56 px), es entsteht kein Scrollen.

**Namen an/aus:** bei „Namen aus“ nur Avatare ohne Namen.

**Live-Moment:** Ändert sich ein Status beim 30-Sekunden-Abruf, bekommt der Avatar eine kurze Animation (0,6 s: Ring füllt sich, leichtes Aufleuchten, Avatar wird farbig). `prefers-reduced-motion` respektieren.

**Lehrkraft-Ansicht:** dieselbe Wand zusätzlich mit Tooltip (Tagesziel-Text, Uhrzeit).

## 3. Schriftgrößen (Ansicht B ist zu groß)

Heute sind z. B. „37 %“, „1 / 3 Lerntage“ und „14 Lose von 7 Schüler:innen im Topf“ riesig, die Namen bei den Highlights dagegen winzig. **Eine feste Typo-Skala für alle Beamer-Ansichten**, als CSS-Variablen an einer Stelle:

| Rolle | Größe |
|---|---|
| Panel-Titel | `clamp(18px, 1.15vw, 24px)` |
| Hauptwert (eine große Zahl pro Panel) | `clamp(24px, 1.6vw, 34px)` |
| Wert in Listenzeilen (z. B. Respekt) | `clamp(18px, 1.15vw, 24px)` |
| Text, Labels | `clamp(14px, 0.9vw, 18px)` |
| Kleiner Zusatz („Ziel 80 %“) | `clamp(13px, 0.8vw, 16px)` |
| Name unter Avatar / in Chips | `clamp(14px, 0.85vw, 17px)` |

Keine Schrift über 34 px in den Panels. Die Kennzahlen-Kacheln in Ansicht A dürfen größer sein (bis 48 px).

## 4. Respekt kompakt (Ansicht B)

- **Fünf schmale Zeilen**, alle sichtbar. Pro Zeile Stern (24 px), Name, rechts der Wert (Listengröße) und daneben klein „Ziel 80 %“ in **einer** Zeile.
- „Drangeblieben“ als „1 / 3 Lerntage“, „Geholfen“ als „x / 10 Hilfen“.
- Erreichte Zeile mit gelbem Rand wie jetzt, `keine_daten` grau (siehe Runde 1).

## 5. Side Quest (Ansicht B)

Auftrag in Panel-Titel-Größe, Balken 12 px, „0 / 33“ als Hauptwert, „+50 XP“ daneben. Ohne Quest: „Heute keine Side Quest“.

## 6. Highlights mit Avataren (Ansicht C)

- Pro Kategorie (Gut eingeschätzt, Plan geschafft, Expert:in, Dranbleiber) große **Chips mit Avatar (40 px) und Name**, statt Aufzählungspunkten.
- **Leere Kategorien ausblenden.** Sind alle leer: ein Satz „Die ersten Highlights kommen mit dem ersten Tagesziel.“
- Bei „Namen aus“: nur Avatare.

## 7. Glücks-Ziehung (Ansicht C)

- Hauptwert „14 Lose“, darunter Text „von 7 Schüler:innen im Topf“ (Textgröße, nicht riesig).
- Pills mit den Lose-Regeln bleiben.
- **Ergebnis:** großer Avatar (120 px) mit Name und „+10 XP“, kurze Animation (Avatare laufen durch wie ein Spielautomat, 2–3 s).
- XP-Auswahl und „Ziehung starten“ nur in der Steuerleiste bzw. per Taste Z, nicht im Panel.

## 8. Season-Leiste (Ansicht C)

- Bei **jeder** Stufe bleibt der Name der Belohnung stehen:
  - erreicht: „Musik in der Lernzeit ✓“
  - nächste: „Hausaufgaben-Joker · noch 567 XP“
  - spätere: „Mathe draußen“
- Die Beschriftung „2.433 XP“ an der Markierung darf keinen Stufen-Punkt überdecken: über dem Balken, mit kleinem Zeiger nach unten.

## 9. Schlanker Kopf in der Beamer-Ansicht

Heute nehmen Kicker, Titel, Zielzeile und Steuerleiste ca. ein Drittel der Höhe ein.
- In der Beamer-Ansicht **eine Zeile**: links Kicker „9A · SEASON OSTSTADT · QUADRATISCHE GLEICHUNGEN“ und darunter klein „Klassenarbeit Di., 15.12. · in 31 Tagen“, rechts die Respekt-Sterne. Der große Titel „Cockpit“ entfällt in der Beamer-Ansicht.
- **Steuerleiste** (Einheit, Lehrkraft-Ansicht, Vollbild, Namen, Pause, Ansichten, Ziehung, Sieg geben) in der Beamer-Ansicht standardmäßig eingeklappt. Sie erscheint bei Mausbewegung oder Tippen als halbtransparente Leiste unten für 3 s, auch ohne Vollbild.
- In der Lehrkraft-Ansicht bleibt der Kopf wie bisher.

---

## Prüfliste
- [x] Ansichten heißen Mission / Klasse / Belohnung; Inhalte wie in der Tabelle verteilt
- [x] Jede Ansicht bei 1920 × 1080 und iPad quer ohne Scrollen und ohne Abschneiden
- [x] Avatar-Wand zeigt alle 33 alphabetisch, drei Zustände klar unterscheidbar, Zähler stimmen
- [x] Status-Wechsel löst die kurze Animation aus
- [x] Keine Schrift in den Panels größer als 34 px; Respekt zeigt alle 5 Zeilen
- [x] Highlights mit Avatar-Chips, leere Kategorien ausgeblendet
- [x] Glücks-Ziehung mit Avatar-Ergebnis, Steuerung nicht im Panel
- [x] Season-Stufen behalten ihre Belohnungsnamen
- [x] Beamer-Kopf eine Zeile, Steuerleiste erscheint nur bei Mausbewegung
- [x] „Namen aus“ blendet Namen auf der Avatar-Wand, bei Highlights und im Ticker aus
