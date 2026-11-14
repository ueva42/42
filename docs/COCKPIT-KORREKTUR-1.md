# Cockpit – Korrekturen Runde 1

Bezug: `docs/COCKPIT.md`. Betrifft `/teacher/cockpit`, vor allem den Kopf und Ansicht B (Respekt, Season, Glücks-Ziehung, Side Quest).
Direkt umsetzen, keine Datenbankänderungen außer den in COCKPIT.md für Stufe 2 erlaubten. Schülerseite nicht anfassen.
Am Ende in einfachem Deutsch erklären, was geändert ist, und die Prüfliste unten abhaken.

---

## 1. Respekt-Sterne richtig berechnen

**Fehler heute:** „Gut eingeschätzt“ zeigt „erreicht“, obwohl es keine Levelchecks gibt (0 von 0 wird als erfüllt gewertet). Einheiten sind falsch („0 % / 3“, „0 % / 10“).

**Neu:** Jedes Kriterium liefert ein Objekt
`{ status: 'erreicht' | 'offen' | 'keine_daten', wert, ziel, einheit, text }`.
**Nur `erreicht` zählt als Stern.** `keine_daten` ist nie erreicht.

**Woche:** Montag 00:00 bis Sonntag 23:59, Zeitzone Europe/Berlin.
**Lerntag:** ein Tag, an dem die Klasse laut Stundenplan Unterricht im Fach der Einheit hat. Gibt es keinen Stundenplan, zählt jeder Tag, an dem mindestens eine Person der Klasse ein Tagesziel gesetzt hat. Bisherige Lerntage dieser Woche zählen, zukünftige nicht.

| Kriterium | Berechnung | Ziel | Anzeige | keine_daten, wenn |
|---|---|---|---|---|
| Geplant | Summe über Lerntage: Personen mit Tagesziel ÷ Summe über Lerntage: Personen der Klasse | 80 % | „46 %“ · klein „Ziel 80 %“ | noch kein Lerntag |
| Reflektiert | wie oben mit Reflexion/Abschluss | 70 % | „31 %“ · „Ziel 70 %“ | noch kein Lerntag |
| Gut eingeschätzt | Basis: „sicher“-Meldungen (Person, Unterthema, Level) der Einheit, zu denen diese Woche ein Levelcheck-Ergebnis vorliegt. Wert: Anteil davon bestanden | 70 % | „61 %“ · „Ziel 70 %“ | Basis = 0 → Text „noch kein Levelcheck“ |
| Drangeblieben | längste Serie aufeinanderfolgender Lerntage dieser Woche mit Geplant-Quote ≥ 80 % | 3 | „2 / 3 Lerntage“ | noch kein Lerntag |
| Geholfen | Anzahl Hilfen unter Schüler:innen diese Woche (Hilfe-Frage, Antwort „Mitschüler:in“) | 10 | „4 / 10 Hilfen“ | Hilfe-Frage noch nicht aktiv; 0 Hilfen ist `offen`, nicht `keine_daten` |

Ziele und die 80-%-Schwelle der Serie in die Konfigurationsdatei.

**Darstellung im Panel „Respekt diese Woche“:** fünf gleich hohe Zeilen. In jeder Zeile:
- links der Stern (36 px)
- daneben der Name
- rechts groß der Wert, darunter klein das Ziel
- `erreicht`: gefüllter gelber Stern (#FFC74D, dunkle Kontur), Zeile mit gelbem Rand
- `offen`: leerer Stern mit grauer Kontur
- `keine_daten`: leerer Stern gestrichelt, Wert „–“, grauer Text (z. B. „noch kein Levelcheck“)

Oben rechts im Panel „x / 5“.

## 2. Kopf: Kicker und Respekt-Anzeige

**Fehler heute:** Die fünf Sterne oben rechts sind nur angeschnitten und rutschen unter die Navigation. Der Kicker fehlt.

- **Navigation:** `position: sticky; top: 0`, eigener deckender Hintergrund in der App-Farbe, `z-index` über allem. Der Kopf beginnt darunter und wird nie überdeckt.
- **Kicker über dem Titel** im Stil der App (wie früher „9A · MATHE · QUADRATISCHE GLEICHUNGEN“):
  - Text: `<Klasse> · SEASON <Ort> · <Thema>`, z. B. „9A · SEASON OSTSTADT · QUADRATISCHE GLEICHUNGEN“.
  - Ort = Feld `ort` aus der passenden Datei in `cockpit-karten/`, Thema = Name der Unterrichtseinheit.
  - Ohne Karte: `<Klasse> · <Fach> · <Thema>`.
- **Respekt-Anzeige rechts neben dem Titel**, wie das Fahndungslevel in GTA:
  - dunkler, halbtransparenter Kasten
  - Label „RESPEKT“, daneben fünf Sterne à 32 px
  - gefüllt = erreicht, leer = alles andere
  - `aria-label="Respekt x von 5 diese Woche"`
  - in allen drei Ansichten sichtbar, auch im Vollbild

## 3. Glücks-Ziehung: Lose-Regeln umsetzen, Entwickler-Text weg

**Fehler heute:** Am Beamer steht „API zählt vorerst Abschlüsse (reflektiert). Neue Regeln oben – volle Ticket-Zählung folgt.“ Die Regeln aus COCKPIT.md sind nicht umgesetzt.

- **Den Hinweistext komplett entfernen.** Interne Hinweise nie in der Oberfläche anzeigen.
- **Lose pro Person für die heutige Ziehung:**
  - +1 Tagesziel heute gesetzt
  - +1 heute reflektiert / abgeschlossen
  - +2 gut eingeschätzt: in den letzten 7 Tagen mindestens ein selbst als „sicher“ gemeldetes Level im Levelcheck bestätigt
  - +1 pro Hilfe heute für eine:n Mitschüler:in, höchstens +2
  - höchstens 5 Lose pro Person (Konfiguration)
- **Ziehung:** gewichteter Zufall über alle Personen mit mindestens 1 Los. Weiterhin einmal pro Tag und Klasse wie bisher.
- **Anzeige:** „17 Lose von 12 Schüler:innen im Topf“. Darunter die Regeln als Pills (Geplant +1 · Reflektiert +1 · Gut eingeschätzt +2 · Geholfen +1).
- **XP-Auswahl (5/10/15/20) und „Ziehung starten“** gehören zur Steuerung: sichtbar, wenn die Steuerung sichtbar ist (siehe 4), im Vollbild sonst ausgeblendet. Das Ergebnis (Name, +XP, Animation) ist immer groß sichtbar.

## 4. Steuerung und Vollbild

**Fehler heute:** Lehrkraft, Vollbild, Namen an, Pause und A/B/C stehen alle groß im Kopf. Am Beamer sieht die Klasse „Namen an“ und die Steuerung.

**Normale Ansicht (nicht Vollbild):** Steuerung gruppiert in einer Zeile unter dem Kopf.
- **links:** Einheit-Auswahl und Live-Anzeige
- **rechts:** Knopf „Lehrkraft-Ansicht“ und eine Gruppe „Beamer“ mit Vollbild, Namen an/aus, Pause/Weiter und Ansicht A/B/C als Segment-Schalter

**Vollbild:** `requestFullscreen`; falls nicht unterstützt, z. B. auf dem iPad, ein eigener Beamer-Modus, der dasselbe ausblendet.
- Navigation und gesamte Steuerung ausgeblendet.
- Unten in der Mitte drei kleine Punkte für A/B/C; der aktive Punkt ist gefüllt.
- Bei Mausbewegung oder Tippen erscheint die Steuerung als halbtransparente Leiste unten für 3 Sekunden, dann verschwindet sie wieder.
- Tastatur:
  - ← / → wechselt die Ansicht
  - Leertaste pausiert den automatischen Wechsel
  - N schaltet Namen an/aus
  - Z startet die Glücks-Ziehung
  - Esc verlässt das Vollbild

**Namen an/aus:** wirkt auf Highlights, Ticker und Glücks-Ziehung. Wird pro Klasse gemerkt.

## 5. Ticker

- Keine Meldungen: Ticker-Leiste **komplett ausblenden**, kein Platzhaltertext, kein Leerraum.
- Mit Meldungen: schmale Leiste, die letzten 3 Meldungen, neueste links, mit kleinem farbigem Punkt pro Art. Regeln wie in COCKPIT.md (nur Positives, Namen nur mit Erlaubnis, zusammenfassen, höchstens eine Meldung alle 20 s).

## 6. Season-Leiste

**Fehler heute:** Es gibt nur fünf Kästen, keinen Fortschrittsbalken. Erreichte Stufen sind nicht klar markiert. Darunter ist viel Leerraum.

- **Balken unter den Stufen über die ganze Breite.** Jede Stufe sitzt als Punkt auf dem Balken. Die Füllung reicht stückweise linear bis zur aktuellen XP. Beispiel: Stufen 1.000 / 2.000 / 3.000, 2.433 XP → Füllung bei 43 % des Abschnitts zwischen 2.000 und 3.000.
- **Markierung an der aktuellen Position:** Kreis mit Beschriftung „2.433 XP“.
- **Stufen:**
  - erreicht: gefüllt in App-Violett, Häkchen, Text „freigeschaltet“
  - nächste: pinker Rand, „noch 567 XP“
  - spätere: gedimmt
- **XP-Quelle:** XP seit Beginn der Unterrichtseinheit, wenn die XP Zeitstempel haben; Überschrift dann „Season-XP“. Sonst Gesamt-XP und Überschrift „Klassen-XP“. Sag mir, was du nimmst.

## 7. Lesbarkeit am Beamer (alle Ansichten A, B, C)

Ziel: Bei 1920 × 1080 ist alles aus der letzten Reihe lesbar, und es gibt keine großen Leerflächen.
- **Ansicht füllt den Bildschirm:** Höhe = Fensterhöhe minus Kopf, kein Scrollen.
  - Ansicht B als 2 × 2-Raster mit gleich hohen Zeilen (`grid-template-rows: 1fr 1fr`).
  - Panels nutzen ihre Höhe: Inhalt vertikal verteilt, Wertzahlen groß.
- **Schriftgrößen mit `clamp()`:**
  - Panel-Titel `clamp(22px, 1.5vw, 32px)`
  - Hauptwerte `clamp(28px, 2.2vw, 48px)`
  - Nebentexte `clamp(16px, 1.05vw, 22px)`
  - nichts unter 16 px
- **Side Quest:** Auftrag groß (wie Panel-Titel), Fortschrittsbalken 16 px hoch, Zahl „0 / 33“ als Hauptwert, „+50 XP“ daneben. Ohne Side Quest heute: „Heute keine Side Quest“.
- **Kein Unterricht heute** (Wochenende, keine Stunde laut Stundenplan): oben ein ruhiger Hinweis „Heute keine Stunde – Stand der Woche“. Keine leeren Nullen ohne Erklärung.

---

## Prüfliste (am Ende abhaken)
- [ ] Ohne Levelcheck in der Woche: „Gut eingeschätzt“ grau mit „noch kein Levelcheck“, kein Stern
- [ ] Einheiten: „x / 3 Lerntage“, „x / 10 Hilfen“, Prozent nur bei Geplant, Reflektiert, Gut eingeschätzt
- [ ] Sterne im Kopf vollständig sichtbar, nichts von der Navigation überdeckt, auch beim Scrollen
- [ ] Kicker „9A · SEASON OSTSTADT · QUADRATISCHE GLEICHUNGEN“ über „Cockpit“
- [ ] Kein Entwickler-Text mehr in der Oberfläche
- [ ] Lose werden nach den neuen Regeln gezählt, Anzeige „x Lose von y Schüler:innen“
- [ ] Im Vollbild nur Inhalt und drei Punkte; Steuerung erscheint bei Mausbewegung; Tastenkürzel funktionieren
- [ ] Leerer Ticker ist unsichtbar
- [ ] Season-Balken zeigt die Position der Klasse, erreichte Stufen mit Häkchen
- [ ] Bei 1920 × 1080 kein Scrollen, keine großen Leerflächen, kleinste Schrift 16 px
- [ ] iPad Safari: Beamer-Modus funktioniert auch ohne echtes Vollbild
