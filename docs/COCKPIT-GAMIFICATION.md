# Cockpit – Gamification sichtbar machen

Bezug: `docs/COCKPIT.md` und `docs/LEVELCHECK.md`. Erst umsetzen, wenn LEVELCHECK fertig ist (der Boss ist dann der nächste Levelcheck).
Direkt bauen, keine Datenbankänderungen außer kleinen additiven, falls wirklich nötig. Design der App, nur die Karte wie im Trainingscenter. Am Ende die Prüfliste abhaken und in einfachem Deutsch erklären, was geändert ist.

## Das Problem
Die Mechanik ist da, aber am Beamer sieht man das Spiel nicht:
- Der Boss ist eine Textliste.
- Erfolge passieren still als Zahl.
- Die Hälfte des Bildschirms ist leer, und die spannenden Dinge (Sterne, Season) sind klein.
- Die Kinder wissen nicht, wie das Spiel funktioniert.

---

## 1. Momente: Einblendungen am Beamer
Wenn etwas Gutes passiert, erscheint in der Beamer-Ansicht für 3–4 Sekunden eine große Einblendung in der Mitte: dunkler Schleier, Comic-Schriftzug, Glow in App-Farben, kurze Animation (reinzoomen, leichtes Wackeln, Partikel). Danach geht es normal weiter.

| Ereignis | Auslöser | Einblendung |
|---|---|---|
| Boss getroffen | Levelcheck freigegeben | „TREFFER! −17“, Boss-Figur blinkt rot, Balken fällt sichtbar |
| Boss besiegt | Energie = 0 | „BOSS BESIEGT!“, Boss-Figur zerfällt, Beute wird groß gezeigt |
| Respekt-Stern | ein Kriterium wird diese Woche erstmals erreicht | „★ RESPEKT +1 · Geplant“, der Stern fliegt in die Respekt-Anzeige oben |
| Season-Stufe | Klassen-XP überschreiten eine Stufe | „FREIGESCHALTET: Hausaufgaben-Joker“ |
| Side Quest geschafft | Ziel erreicht | „SIDE QUEST GESCHAFFT · +50 XP“ |
| Alle dabei | alle Anwesenden haben ein Tagesziel | „GANZE KLASSE GESTARTET!“ |
| Glücks-Ziehung | Ziehung gestartet | Avatare laufen 2–3 s durch wie ein Spielautomat, dann Gewinner:in groß mit „+10 XP“ |

- Mehrere Ereignisse in einer Warteschlange, nacheinander, höchstens eine Einblendung alle 5 s.
- Nur in der Beamer-Ansicht, nicht in der Lehrkraft-Ansicht.
- Namen nur bei der Glücks-Ziehung und nur, wenn „Namen an“.
- `prefers-reduced-motion`: ohne Bewegung, nur Einblenden.
- Ton: optional, Standard aus, Schalter in der Steuerleiste.
- Erkennung über den 30-s-Abruf: Unterschied zum vorherigen Stand oder Ereignis-Protokoll. Ein Ereignis nie doppelt zeigen, auch nicht nach Neuladen; gezeigte Ereignis-IDs lokal merken.

## 2. Boss sichtbar machen (Ansicht Mission)
- **Boss-Figur:** großes Bild oben im Boss-Panel (ca. 40 % der Panelhöhe).
  - Bilder lege ich später ab: `public/bosse/<boss-slug>.png`, im Comic-Stil der Avatare.
  - Bis dahin ein **Platzhalter**: großes Neon-Emblem (Sechseck mit grimmigem Gesicht als SVG) in Pink, mit Boss-Namen.
  - Zuordnung Name → Bild in der Konfiguration.
- **Lebensbalken wie im Kampfspiel:**
  - dick (20 px), unterteilt in Segmente (ein Segment pro möglichem Treffer, bei mehr als 40 Segmenten durchgehend)
  - Farbe von Grün über Gelb zu Rot, je weniger Energie übrig ist
  - Zahl „45 / 62“ groß daneben
  - bei neuen Treffern blitzen die verlorenen Segmente kurz weiß auf und verschwinden
- **Darunter kompakt:**
  - „Levelcheck Di 24.11. · Rookie“
  - Treffer pro Mission **mit Namen** („Binomische Formeln −7“)
  - Schwachstelle als hervorgehobene Pille
  - Beute mit kleinen Symbolen
  - Satz „Selbst ‚sicher‘ drücken trifft nicht.“
- **Ohne Levelcheck und ohne Klassen-Mission:** Silhouette mit „Nächster Boss erscheint bald“, keine Zahlen.
- **Boss-Namen** fest pro Checkpoint aus der Konfiguration, auch für Physik:
  - „Der Kraftprotz“
  - „Professor Trägheit“
  - „Die Reibungs-Ratte“
  - „Hebel-Harry“
  - „Der Impuls-Imperator“

  Nie „Klassen-Boss“ als Titel.

## 3. Die Stadt leuchtet (Karte, noch offen)
- Über dem Kartenbild eine dunkle Fläche (#02040c, 60 %) mit SVG-Maske.
- An jeder Mission ein weiches Loch (radialGradient schwarz → transparent), Radius = 40 + 100 × Anteil Rookie **bestätigt** (viewBox-Einheiten).
- Darüber ein warmer Schein (#FFC74D, 35 % → 0), Radius = 30 + 90 × Anteil Operator + Street Legend bestätigt.
- Bei 0 bestätigt: dunkel.
- Bei einem neuen Treffer wächst das Licht animiert (1 s).

## 4. Karte aufräumen
- **„gerade hier“:** statt langer Textblasen eine runde cyan Plakette mit Zahl oben rechts am Marker (r = 11), wie im Trainingscenter. Keine überlappenden Texte. Legende erklärt: „Zahl = gerade an dieser Mission“.
- **Levelcheck-Fähnchen** (aus LEVELCHECK.md) und Boss-Schild sind dasselbe Element, nicht doppelt.
- **Legende vollständig:** Level-Farben, „Ring dick = im Levelcheck bestätigt, blass = nur gemeldet“, Plakette, orange Linie „Klasse unterwegs“.

## 5. Keine Leerflächen
Jede Beamer-Ansicht füllt den Bildschirm. Panels beginnen oben, 20 px Abstand. Das Hauptpanel wächst, die anderen sind so hoch wie ihr Inhalt.
- **Mission:**
  - Karte so groß wie möglich (16:9, Breite füllt die linke Spalte)
  - Boss-Panel rechts mit Figur
  - Kennzahlen-Kacheln flacher (max. 110 px hoch)
- **Klasse:**
  - Avatar-Wand **oben** beginnend, kein Leerstreifen über den Avataren
  - Avatare wachsen, bis die Wand die verfügbare Höhe nutzt (bis 120 px Durchmesser)
  - Respekt und Side Quest darunter
- **Belohnung:**
  - Highlights mit größeren Avatar-Chips (56 px)
  - **Glücks-Ziehung als Lostopf-Grafik:** gestapelte Los-Karten in App-Farben, darauf „65 Lose“, daneben „von 26 Schüler:innen“
  - nach der Ziehung groß Avatar und Name der Gewinnerin oder des Gewinners
  - **Season-Leiste:** jede Stufe mit Symbol (Note, Stuhl, Joker-Karte, Baum, Croissant o. ä., als einfache Linien-Icons); erreicht farbig mit Häkchen, nächste leuchtend, spätere mit Schloss; nie von der Steuerleiste verdeckt (unten genügend Abstand)

## 6. Respekt-Sterne prominent
- **Sterne im Kopf:** 40 px, gefüllt mit Glow. Ein neu verdienter Stern leuchtet 2 s auf (siehe Momente).
- **In der Ansicht Klasse:** Sterne in der Liste ebenfalls 28 px statt klein.

## 7. „So funktioniert's“ (Erklär-Ansicht)
- In der Steuerleiste ein Knopf „?“. Er zeigt eine Vollbild-Ansicht mit vier Kacheln, groß und mit Symbol:
  - **Boss:** „Jeder Levelcheck ist ein Boss. Nur bestandene Levelchecks treffen – selbst ‚sicher‘ drücken trifft nicht.“
  - **Respekt:** „Fünf Sterne pro Woche für die ganze Klasse: planen, reflektieren, gut einschätzen, dranbleiben, helfen.“
  - **Lose:** „Lose gibt es fürs Lernen, nicht fürs Tempo: geplant +1, reflektiert +1, gut eingeschätzt +2, geholfen +1.“
  - **Season:** „Gemeinsame XP schalten Belohnungen für alle frei.“
- Am Anfang jeder Season (neue Einheit) erscheint diese Ansicht einmal automatisch, danach nur über „?“.

## 8. Physik und Einheiten ohne Stadtteil (noch offen)
- Überschrift „Missionen“ statt „Fahrspuren · OHNE STADTTEIL“.
- Level-Umschalter über den Spuren (Rookie / Operator / Street Legend, App-Farben).
- Pro Spur „x / 31 bestätigt“, „+y gemeldet“, Levelcheck-Fähnchen an der Mission.
- Mehr als 8 Missionen: zwei Spalten; Missionen des nächsten Levelchecks oben und hervorgehoben.
- Vierte Kachel: „Tage bis Projektabgabe“ bzw. „Tage bis zur Klassenarbeit“ je nach Ziel der Einheit (heute steht bei Physik fälschlich „Tage bis KA“).

---

## Prüfliste
- [x] Alle sieben Momente lassen sich mit Testdaten auslösen und erscheinen je einmal
- [x] Boss mit Figur bzw. Platzhalter-Emblem, segmentierter Lebensbalken, Treffer mit Missionsnamen
- [x] Physik-Boss hat einen Namen aus der Liste
- [x] Stadt leuchtet an bestätigten Missionen, dunkel sonst
- [x] Keine überlappenden „gerade hier“-Texte
- [x] Keine Leerflächen in Mission, Klasse, Belohnung (1920 × 1080 und iPad quer)
- [x] Lostopf-Grafik und Gewinner-Avatar, Season mit Symbolen
- [x] Respekt-Sterne 40 px im Kopf
- [x] „?“-Ansicht vorhanden und erscheint einmal pro Season
- [x] Physik: „Missionen“, Level-Umschalter, „Tage bis Projektabgabe“
