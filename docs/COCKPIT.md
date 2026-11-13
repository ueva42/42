# Cockpit neu – Bauplan für Cursor

Erkläre mir am Ende in einfachem Deutsch, was du gebaut hast. Ich bin Lehrer, kein Entwickler.

## So arbeitest du
- **Direkt bauen**, Stufe für Stufe am Stück, ohne Pausen für mein OK. Zurück gehe ich über die vorherige Bereitstellung auf Railway.
- **Stufe 1: keine Änderungen an der Datenbank.** Nur vorhandene Daten lesen und auswerten.
- **Stufe 2: nur neue Tabellen oder neue Spalten** (additiv). Nichts Bestehendes umbenennen, ändern oder löschen. Ein Rollback auf Railway setzt die Datenbank nicht zurück, neue Tabellen stören dann aber nicht.
- Fehlen für etwas die Daten: **weglassen und am Ende auflisten** (was fehlt, was man speichern müsste). Nie durch etwas Ähnliches ersetzen, ohne es mir zu sagen.
- Alle Schwellen, Texte und Listen (Boss-Namen, Season-Stufen, Lose, Sterne-Kriterien) in **eine Konfigurationsdatei**, damit ich sie anpassen kann.
- Keine echten Schülernamen in Code, Commits oder Testdaten.
- Testen auf dem iPad (Safari) und am Beamer (1920 × 1080, Vollbild).

## Worum es geht
Das Cockpit (`/teacher/cockpit`) läuft im Unterricht am Beamer. Bisher zeigt es Ranglisten (Schnellste 5, Fortschritt, Aufholer) und „Auf Kurs 0/33“. Das belohnt Tempo und schnelles „sicher“-Drücken statt Lernen. Neu wird es ein **gemeinsames Spiel der Klasse**:
- **Karte:** Die Klasse fährt die Route ihres Themas aus dem Trainingscenter. Die Stadt leuchtet dort auf, wo sie im Levelcheck sicher ist.
- **Boss-Fight:** Jeder Checkpoint ist ein Boss, den die Klasse gemeinsam besiegt.
- **Respekt-Sterne, Season-Leiste, Glücks-Ziehung und Highlights** belohnen Lernverhalten: planen, reflektieren, sich richtig einschätzen, helfen, dranbleiben.
- **Kein Ranking.** Namen auf dem Beamer nur bei Positivem.

Die angehängten Bilder (Canvas „Cockpit · Beamer mit Gamification“) zeigen Aufbau und Inhalte.

## Design
- **Alles außer der Karte im Design der App**: Farben, Schriften, Panels, Kacheln, Buttons und Hintergrund aus dem vorhandenen Code übernehmen, wie im bisherigen Lehrer-Cockpit und auf der Schülerseite. Auch die **Level-Farben außerhalb der Karte** sind die der App (Rookie Cyan, Operator Violett, Street Legend Pink, wie auf `/student/zielsetzung`).
- **Die Karte sieht aus wie im Trainingscenter**, inklusive der Ring-Farben auf der Karte (Rookie #ffc300, Operator #f97316, Street Legend #ff2ea6). Die Kartenlegende nennt diese Farben.
- Navigation oben **mit festem Hintergrund** (bisher läuft der Inhalt beim Scrollen durch die Leiste).
- Antippbare Flächen mindestens 44 px. Farbe nie allein: immer Zahl oder Wort dazu.

## Die Karte
**Dateien:** Ordner `cockpit-karten/` (liegt bei, mit README). Kopiere ihn nach `public/cockpit-karten/` (oder wohin statische Dateien bei uns gehören). Er enthält pro befahrbarem Stadtteil ein Kartenbild und eine JSON-Datei mit `viewBox`, Missionen (mit Was-Ziel-ID `wz`), Start, Ziel und Routenstücken.

**Welche Karte:** Die Unterrichtseinheit im Cockpit hat Unterthemen mit Was-Ziel-IDs (z. B. qg-01 … qg-05). Wähle den Stadtteil, dessen Missionen diese `wz` haben. Gibt es keinen (z. B. Physik oder ein Thema ohne Stadtteil), zeige statt der Karte **Fahrspuren**: pro Unterthema ein Balken im App-Stil, „bestätigt“ gefüllt, „gemeldet“ schraffiert, Haltelinie am nächsten Checkpoint.

**Darüber zeichnen** (ein SVG mit derselben `viewBox` über dem Bild, Details im README):
- **Route:** noch zu fahren gepunktet (#7cc4ef). Durchgezogen in `routeColor` vom Start bis zur Mission, an der heute die meisten arbeiten („Klasse unterwegs“).
- **Missions-Marker wie im Trainingscenter:** Kreis mit Nummer, drei Ringsegmente. Pro Level **dick** = Anteil der Klasse, der das Level **im Levelcheck bestätigt** hat; **blass** dahinter = Anteil, der es nur als „sicher“ **gemeldet** hat; dünne Spur = Rest. Unter dem Marker „5/33“ = Rookie bestätigt.
- **Blase „gerade hier“** (cyan, oben rechts am Marker): Anzahl Schüler:innen, deren heutiges Tagesziel diese Mission ist.
- **Die Stadt leuchtet:** Die Karte ist abgedunkelt (dunkle Fläche, ca. 60 %). An jeder Mission ein weiches Loch in der Abdunklung, Radius wächst mit dem Rookie-Anteil „bestätigt“, dazu ein warmer Schein mit dem Operator- und Street-Legend-Anteil. Ganz am Anfang ist die Stadt dunkel, vor der Klassenarbeit hell.
- **Boss-Schild** an der letzten Mission des nächsten Checkpoints: „BOSS-FIGHT · DI 17.11.“ (Form wie das Schild „Nächste Mission“ im Trainingscenter).
- **Ziel-Flagge** mit „LERNCHECK · KA <Datum>“.
- Crew-Tags (Stufe 2).

## Begriffe und Daten (prüfe zuerst, woher sie kommen)
- **bestätigt** = Level eines Unterthemas im Levelcheck bzw. Nachweis bestanden. Prüfe, wo das gespeichert ist: Werkzeug „Levelchecks“, Nachweis-Code (code-pruefen) oder die Ergebnisse aus dem Trainingscenter (`/api/training/results`). Reihenfolge, falls mehrere: Levelcheck vor Nachweis-Code vor Trainingscenter-Kontrolle. Sag mir, was du nimmst.
- **gemeldet** = Status „sicher“, den die Schüler:innen selbst setzen.
- **Checkpoint** = die vorhandene **Klassen-Mission** (z. B. „Bis Di., 17.11. haben alle Mission 1–2 auf Rookie sicher“). Ab jetzt zählt dort **bestätigt**, nicht gemeldet.
- **Klasse** = alle Schüler:innen der Klasse, die nicht als abwesend markiert sind (falls es Abwesenheit gibt).

## Stufe 1 – ohne Datenbankänderung

**1. Kopf**
- Kicker „9A · SEASON <Stadtteil> · <Thema>“, Titel „Cockpit“, Datum der Klassenarbeit, Live-Punkt.
- Umschalter **Beamer / Lehrkraft**. Die Lehrkraft-Ansicht ist die Seite „Heute“ mit Namen, Hilfe-Anfragen usw.
- **Respekt-Sterne** oben rechts: 5 Sterne wie das Fahndungslevel in GTA (gefüllt gelb, leer grau umrandet).

**2. Kennzahlen (4 Kacheln):** gestartet (Tagesziel heute gesetzt) /n · Abschluss /n · Boss-Energie · Tage bis zur Klassenarbeit. „Auf Kurs“ entfällt.

**3. Karte** wie oben.

**4. Boss-Fight** (Panel neben der Karte)
- Boss = nächster Checkpoint. **Energie** = Schüler:innen × Missionen im Checkpoint. **Treffer** = ein Paar (Schüler:in, Mission) mit dem verlangten Level **bestätigt**. Energie minus Treffer ergibt den Balken.
- **Boss-Name** aus einer Liste in der Konfiguration, passend zum Thema; als Startwerte „Der Binom-Bandit“, „Die Wurzel-Hexe“, „Der Nullprodukt-Ninja“, „Graf Ergänzung“, „Der Formel-Fürst“. Ich kann ihn später umbenennen.
- **Treffer-Liste:** „Treffer Mission 1 −5“ usw.
- **Schwachstelle:** die Mission im Checkpoint mit dem kleinsten Anteil bestätigt (oder der größten Lücke zwischen gemeldet und bestätigt).
- Satz im Panel: „Selbst ‚sicher‘ drücken trifft nicht.“
- **Sieg** bei Energie 0: große Animation am Beamer, Konfetti in App-Farben, Boss-Schild wird „BESIEGT“, Beute wird freigeschaltet. Am Checkpoint-Datum ohne Sieg: „Knapp! Noch X Treffer“, keine Strafe, der Boss bleibt stehen. Für mich ein Knopf „Sieg geben“ (z. B. wegen Krankheit).
- **Beute bei Sieg:** in Stufe 1 aus der Konfiguration (Standard: „+300 Klassen-XP“ und ein Text wie „Musik in der Lernzeit · eine Woche“).

**5. Respekt diese Woche** (Mo–So, Klasse als Ganzes)

| Stern | Kriterium (Startwert) |
|---|---|
| Geplant | ≥ 80 % der Anwesenden haben ein Tagesziel (Wochenschnitt) |
| Reflektiert | ≥ 70 % reflektieren am Ende |
| Gut eingeschätzt | ≥ 70 % der „sicher“-Meldungen, zu denen es schon einen Levelcheck gibt, sind bestätigt |
| Drangeblieben | Serie: ≥ 3 Lerntage in Folge über 80 % geplant |
| Geholfen | ≥ 10 Hilfen unter Schüler:innen (erst Stufe 2; bis dahin grau mit „kommt bald“) |

Panel mit Liste: Stern, Kriterium, Wert und Ziel.

**6. Season-Leiste:** Season = Unterrichtseinheit. Klassen-XP seit Beginn der Einheit (falls XP Zeitstempel haben, sonst gesamt und mir sagen). Stufen aus der Konfiguration: 1.000 Musik in der Lernzeit · 2.000 Freie Platzwahl · 3.000 Hausaufgaben-Joker · 4.000 Mathe draußen · 5.000 Klassen-Frühstück. Erreichte Stufen gefüllt, nächste hervorgehoben, darüber „noch X bis …“.

**7. Glücks-Ziehung:** Mechanik wie bisher. **Lose neu:** Tagesziel gesetzt +1, reflektiert +1, gut eingeschätzt +2 (in den letzten 7 Tagen ein „sicher“ im Levelcheck bestätigt), geholfen +1 (Stufe 2). Kein Los für Tempo oder Reihenfolge. Die Regeln stehen als kleine Pills im Panel.

**8. Highlights heute** statt Podien
- **Gut eingeschätzt:** „sicher“ gemeldet und im Levelcheck bestätigt (letzte 7 Tage)
- **Plan geschafft:** Tagesziel heute erreicht
- **Expert:in:** Street Legend bestätigt in einer Mission der Einheit (ab Stufe 2 auch: hat geholfen)
- **Dranbleiber:** 5 Lerntage in Folge geplant und reflektiert

Pro Kategorie höchstens 3 Namen, **jede Person höchstens einmal**, zufällig unter allen, die es verdient haben (damit es nicht immer dieselben sind). Klassenweiter Schalter für mich: „Namen auf dem Beamer“ an/aus.

**9. Entfernen:** Schnellste 5, Fortschritt, Aufholer, „Auf Kurs“, „Podien aus“. „Wer ist schon dabei?“ mit Namen nur noch in der Lehrkraft-Ansicht; am Beamer nur die Zahl. Klassenziel-Karte ausblenden, solange keins aktiv ist.

**10. Beamer-Modus:** Knopf „Vollbild“. Kein Scrollen: drei Ansichten wechseln automatisch alle 25 s (Pause-Knopf, Pfeiltasten):
- **A:** Kennzahlen, Karte, Boss
- **B:** Respekt, Season, Glücks-Ziehung (ab Stufe 2 dazu Ticker und Side Quest)
- **C:** Highlights (ab Stufe 2 dazu Crews)

Daten alle 30 s neu laden, nur für die gewählte Klasse.

## Stufe 2 – mit neuen Tabellen

**A. Crews**
- Tabellen: `crews` (id, klasse, einheit/season, name, farbe, tag_text, freigegeben), `crew_mitglieder` (crew_id, schüler_id), `crew_nicht_zusammen` (klasse, schüler_a, schüler_b).
- **Auslosung (gelenkter Zufall):**
  - Klasse nach Zielnote sortieren und reihum wie Karten verteilen (1…k, dann k…1), innerhalb gleicher Zielnoten mischen.
  - „Nicht zusammen“-Paare auf verschiedene Crews legen.
  - Größe 4–5 (bei 33: fünf Crews à 5, zwei à 4).
  - Ich sehe das Ergebnis zuerst und kann neu losen, tauschen und freigeben (unter Werkzeuge → Crews).
- **Auslosungs-Show am Beamer:** Namen laufen wie bei einem Spielautomaten durch und landen nacheinander in den Crews.
- **Name und Tag:** Danach wählt jede Crew Name, Farbe und Tag (ein Gerät pro Crew), ich gebe frei. Fallback: Name aus einer Liste (Nachtfalken, Neon Riders, Vektor Gang, Pi Rats, Wurzelwerk, Formel X, Ghost Crew …).
- **Crew-Tag auf der Karte:** wenn mindestens alle außer einem (Startwert) die Mission bestätigt haben. Tag im Graffiti-Stil schräg neben der Mission, in der Crew-Farbe.
- **Am Beamer** pro Crew nur Fortschritt („3/5“), nie wer fehlt.
- **Jede Season neu auslosen.**

**B. Ereignis-Protokoll und Live-Ticker**
- Tabelle `ereignisse` (id, klasse, schüler_id oder leer, typ, daten als JSON, zeitpunkt).
- Schreiben bei: Tagesziel gesetzt, Tagesziel geschafft, Reflexion, Level bestätigt, Crew-Tag, Hilfe erledigt (mit Helfer), Taktik-Deck geöffnet, Serie erreicht, Boss besiegt.
- **Ticker am Beamer:**
  - nur Positives; anonym („Jemand“), Namen nur bei Erfolgen und nur, wenn die Person es erlaubt (neue Spalte bei den Schüler:innen: „Mein Name darf am Beamer stehen“, Standard aus)
  - gleiche Ereignisse zusammenfassen („3 haben gerade ihr Tagesziel gesetzt“)
  - höchstens eine Meldung alle 20 s, die letzten 6 sichtbar

**C. Hilfe-Frage**
- Wenn eine Hilfe-Anfrage geschlossen wird, fragt die App: „Wer hat dir geholfen?“ mit den Antworten Lehrkraft / Mitschüler:in (Name wählen) / Logic Coach / Taktik-Deck / niemand.
- Speichern als neue Spalten an der Hilfe-Anfrage oder als Ereignis.
- Speist den Stern „Geholfen“, die Lose „geholfen +1“ und das Highlight „Expert:in“.
- In der Lehrkraft-Ansicht und im Lernprofil sichtbar.

**D. Side Quests**
- Tabelle `side_quests` (id, klasse, datum, typ, text, ziel, xp).
- Ich wähle morgens aus Vorlagen, oder die App wählt reihum:
  - „Jede:r probiert eine Taktik aus dem Taktik-Deck“
  - „10 Hilfen geben“
  - „Alle reflektieren heute“
  - „Jede:r fragt den Logic Coach einmal, bevor er/sie die Lehrkraft fragt“
- Fortschritt aus den Ereignissen. Bei Erfolg +XP fürs Klassenkonto und eine Meldung im Ticker.

**E. Beute pro Checkpoint:** neue Spalte(n) an der Klassen-Mission für Beute-Texte, damit ich sie pro Checkpoint festlege.

## Am Ende
Erkläre mir in einfachem Deutsch:
- was sich geändert hat, getrennt nach Stufe 1 und 2
- woher „bestätigt“ jetzt kommt
- was fehlt und warum
- was ich am Beamer und auf dem iPad testen soll, und wie ich mit dem Testkonto einen Boss-Treffer, einen Stern und ein Highlight auslöse
