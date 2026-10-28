# Cursor-Prompt 2: Logic Coach für Mathematik

> **Umsetzung (gilt vor dem Text darunter, wo er widerspricht):** Kein Sonderkonto und keine Besucher-Liste. Kein Testmodus für Besucher. Der Coach ist für alle eingeloggten Schüler da, aber nur wenn `COACH_ENABLED=true` ist und `AI_API_KEY` gesetzt ist. Tageslimit 60 Fragen pro Schüler und Tag (Lehrkräfte und Admins ohne Tageslimit), Monatsbudget 8 €. Phasen 4, 5 und 6 sind nicht gebaut.

> In Cursor im Agent-Modus einfügen. Die Datei kann auch als `docs/LOGIC_COACH.md` im Projekt liegen; dann in Cursor mit `@docs/LOGIC_COACH.md` darauf verweisen.

---

Du baust in meine Web-App **Streets of Logic** einen KI-Lerncoach namens **Logic Coach** ein – zunächst nur für **Mathematik** (Realschule BW, Klassen 5–10). Physik und weitere Fächer kommen später; die Architektur soll das vorsehen, aber nicht umsetzen.

## Was die App schon hat
Kompetenzraster pro Fach und Thema mit den Levels **Rookie, Operator, Street Legend**, Tagesziele (Was-Ziel/Wie-Ziel), Lernstandsüberprüfungen, Reflexionen, „Mein Lernstand“ mit der Auswahl „Hilfe benötigt“, „Üben zu Hause“. Eigener GTA-/Neon-Comic-Look. Schüler nutzen iPads der 8. Generation (Safari).

## Hosting und Live-Betrieb – WICHTIG
- Die App bleibt vorerst auf **Railway** (https://42-production-44e7.up.railway.app). Ein Umzug zu einem EU-Hoster kommt später; baue so, dass er ohne Codeänderung möglich ist (alles über Umgebungsvariablen, nichts Railway-Spezifisches).
- Die Live-App ist gerade bei einem **Wettbewerb eingereicht**. Sie darf nicht kaputtgehen und sich für Besucher nicht verändern.
  - Richte zuerst eine eigene **Test-Umgebung** auf Railway ein (eigenes Environment mit eigener Test-Datenbank) oder erkläre mir, wie ich das tue. Entwickelt und getestet wird nur dort.
  - Der Coach ist hinter `COACH_ENABLED=false` versteckt und standardmäßig **aus**. Ist er aus, sieht die App exakt aus wie bisher.
  - Neue Tabellen nur hinzufügen, bestehende Tabellen nicht ändern.
  - Nichts in die Live-Umgebung deployen, ohne mich vorher zu fragen.

## Was der Coach können soll
- Weiß automatisch Fach, Thema, Kompetenz, Level, aktuelles Tagesziel und – falls vorhanden – Aufgabe und Schülerantwort. Keine extra Anmeldung.
- Analysiert Antwort und Lösungsweg, erkennt typische Fehlvorstellungen, stellt Rückfragen.
- Verrät die Lösung nicht, sondern hilft in Stufen.
- Schlägt passende Folgeaufgaben vor.
- Erreichbar über **„Hilfe benötigt“** in „Mein Lernstand“ und über das **Tagesziel**.

## KI-Anbieter (fest vorgegeben)
- **OVHcloud AI Endpoints** (Frankreich, EU-Rechenzentren, keine Trainingsnutzung), OpenAI-kompatible API.
- Basis-URL in `AI_BASE_URL` (aktuell vermutlich `https://oai.endpoints.kepler.ai.cloud.ovh.net/v1` – bitte über `GET /v1/models` prüfen und die genauen Modell-IDs ermitteln).
- Zwei Modelle per Umgebungsvariable:
  - `AI_MODEL_STRONG` = gpt-oss-120b → Erstdiagnose einer Schülerantwort und Aufgabengenerierung
  - `AI_MODEL_FAST` = Mistral Small 3.2 24B → Rückfragen, Ermutigung, Folgezüge im Dialog
- Anbieterunabhängig bauen: nur `AI_BASE_URL`, `AI_API_KEY`, Modellnamen tauschen = anderer EU-Anbieter.
- Der API-Schlüssel bleibt **nur im Backend**, nie im Browser.

## Bitte in Phasen arbeiten. Nach jeder Phase stoppen, mir zeigen, was fertig ist, und wie ich es teste.

### Phase 0 – Analyse
Lies das Projekt und erkläre mir in einfachem Deutsch: Framework, wie Kompetenzen/Level/Tagesziele/Aufgaben/Antworten in der Datenbank liegen, wo „Hilfe benötigt“ und das Tagesziel im Frontend sitzen. Schlage dann den konkreten Bauplan (Dateien, Tabellen, Routen) vor und warte auf mein OK.

### Phase 1 – Backend-Grundgerüst
- Route `POST /api/coach/message` (nur für eingeloggte Schüler). Eingabe: `sessionId?`, `kontext` (competenceId, level, tagesziel-ID, aufgabe?, schuelerantwort?), `nachricht`.
- Der Server baut den Kontext selbst aus der Datenbank zusammen – dem Browser wird nicht vertraut.
- Neue Tabellen (per Migration): `coach_sessions` (id, schueler_pseudonym, fach, competence_id, level, created_at), `coach_messages` (session_id, rolle, inhalt, diagnose_code, hilfestufe, modell, tokens_in, tokens_out, created_at), `coach_usage` (Tag, Tokens, geschätzte Kosten).
- **Datenschutz:** An die KI gehen keine Namen, E-Mails, Klassen oder IDs aus der Schülertabelle. Vor dem Versand Freitext auf Namen/E-Mail/Telefonnummer filtern. Chatverläufe nach 90 Tagen automatisch löschen (Konstante `COACH_RETENTION_DAYS`).
- **Kostenschutz:** `COACH_DAILY_LIMIT` (Standard 60 Fragen pro Schüler und Tag, Lehrkräfte und Admins ohne Tageslimit), `COACH_MONTHLY_BUDGET_EUR` (Standard 8). Kosten aus den `usage`-Angaben der API und den Preisen in einer Konfigurationsdatei berechnen. Bei Überschreitung freundliche Meldung statt KI-Aufruf. `max_tokens` pro Antwort ca. 400 (Reasoning-Modell: so wählen, dass die sichtbare Antwort nicht abgeschnitten wird).
- Fehlerbehandlung: Zeitlimit 30 s, ein Wiederholungsversuch, danach Meldung „Der Coach ist gerade nicht erreichbar – frag deine Lehrkraft oder versuch es gleich nochmal.“
- Feature-Flag `COACH_ENABLED_SUBJECTS=mathe`.
- Kein Testmodus für Besucher. Ohne `AI_API_KEY` bleibt der Coach unsichtbar. Mit Schlüssel antwortet nur die echte KI.

### Phase 2 – Antwortprüfung und Diagnose-Karten (das Herzstück)
- **Automatische Prüfung vor der KI:** Wenn die Aufgabe eine hinterlegte Lösung hat, prüft die App die Schülerantwort selbst (z. B. mit `mathjs`: Zahlen, Brüche, Dezimalzahlen mit Toleranz, Termäquivalenz durch Einsetzen mehrerer Zufallswerte, Einheiten). Ergebnis (`richtig` / `falsch` / `nicht_pruefbar` + erwarteter Wert) geht an die KI. Die KI darf diesem Ergebnis nie widersprechen.
- **Diagnose-Karten:** Pro Kompetenz (und optional Level) eine Datei unter `coach/diagnosekarten/mathe/<competenceId>.json` (später gern in der DB editierbar). Format:

```json
{
  "competenceId": "bruch-addition",
  "titel": "Brüche addieren und subtrahieren",
  "level": ["Rookie", "Operator"],
  "fehlvorstellungen": [
    {
      "code": "ZAEHLER_UND_NENNER_ADDIERT",
      "erkennung": "Schüler addiert Zähler und Nenner getrennt, z. B. 1/2 + 1/3 = 2/5",
      "denkfehler": "Bruch wird als zwei unabhängige Zahlen gesehen, nicht als Anteil",
      "hilfestrategie": "Mit Anteilen argumentieren lassen: Ist 2/5 mehr oder weniger als 1/2? Dann an Pizza/Strecke gleich große Stücke (gemeinsamer Nenner) herstellen lassen",
      "rueckfrage": "Ist dein Ergebnis größer oder kleiner als 1/2? Passt das, wenn du noch etwas dazuaddierst?"
    },
    {
      "code": "NUR_NENNER_ERWEITERT",
      "erkennung": "Gemeinsamer Nenner gebildet, Zähler aber nicht mit erweitert, z. B. 1/2 + 1/3 = 1/6 + 1/6",
      "denkfehler": "Erweitern wird als Änderung nur des Nenners verstanden",
      "hilfestrategie": "Prüfen lassen, ob 1/6 noch genauso viel ist wie 1/2; Erweitern als ‚Stücke feiner schneiden‘",
      "rueckfrage": "Ist 1/6 genauso viel wie 1/2? Wie viele Sechstel sind ein halbes Ganzes?"
    }
  ]
}
```

- Ich schreibe die Karten für meine Kompetenzen selbst. Lege 2 Beispielkarten an und ein Skript, das alle Karten auf gültiges Format prüft.
- Fehlt eine Karte, arbeitet der Coach trotzdem, nur ohne diese Hilfe.

### Phase 3 – Frontend
- Coach-Fenster als Seitenpanel/Bottom-Sheet im bestehenden Look der App (gleiche Schriften, Farben, Komponenten – vorher den vorhandenen Stil analysieren). Name: „Logic Coach“.
- Einstieg 1: „Hilfe benötigt“ in „Mein Lernstand“ → öffnet den Coach mit Kontext der Kompetenz.
- Einstieg 2: Button „Coach fragen“ beim Tagesziel.
- Einstieg 3: Neue Kachel **„Logic Coach“** im Kontrollzentrum (`/student/hub`), gebaut exakt wie die vorhandenen Kacheln (gleiche Komponente, Abstände, Hover, Glow), Akzentfarbe Magenta/Pink.
  - Bilder liegen schon bereit: `public/icons/student/hero/logic-coach-hero.png` (Illustration) und `public/icons/student/png/logic-coach.png` (Icon). Pfade und Einbindung wie bei den anderen Kacheln.
  - Titel „LOGIC COACH“, Text „Hängst du fest? Dein Coach hilft dir, selbst auf die Lösung zu kommen.“, Button „Coach fragen →“.
  - Klick öffnet den Coach mit Auswahl: „Mein heutiges Tagesziel“ (falls vorhanden) oder Mathe-Thema/Kompetenz selbst wählen.
  - Die Kachel erscheint nur, wenn `COACH_ENABLED=true` ist.
- Eingabe: Textfeld + einfache Mathe-Hilfen (Bruchstrich, Hochzahl, Wurzel, ·, :) als Tasten, weil Formeleingabe auf dem iPad mühsam ist.
- Mathe-Darstellung mit KaTeX (lokal ausgeliefert, kein CDN außerhalb der EU).
- Ladeanzeige, Streaming falls einfach möglich, sonst „Coach denkt nach…“.
- Getestet auf Safari iPad (Bildschirmbreite 810 px Hochformat, 1080 px Querformat), große Touch-Flächen.
- Hinweiszeile im Panel: „Der Coach ist eine KI und kann sich irren. Bei Unsicherheit frag deine Lehrkraft.“

### Phase 4 – Lehrkraft-Ansicht
- Einfache Seite für Lehrkräfte: Coach-Gespräche pro Kompetenz, häufigste `diagnose_code`s, Kosten im laufenden Monat, Schalter Coach an/aus pro Klasse.

### Phase 5 – Folgeaufgaben
- Coach kann eine „Zwillingsaufgabe“ anbieten (gleiche Struktur, andere Zahlen, passend zum Level).
- Die KI liefert Aufgabe **und** Lösung als JSON; die App prüft die Lösung mit `mathjs` nach, bevor die Aufgabe angezeigt wird. Nicht prüfbare Aufgaben werden verworfen oder als „KI-Aufgabe, ungeprüft“ markiert.
- Später: Aufgaben vorab per Skript erzeugen, von mir freigeben lassen und speichern.

### Phase 6 – Testset
- Skript `scripts/coach-eval`: liest `coach/eval/faelle.json` (Aufgabe, Schülerantwort, erwarteter Fehlercode), schickt alles an den Coach und schreibt eine Tabelle: erkannter Code, Antworttext, Lösung verraten ja/nein, Kosten. Damit vergleiche ich Modelle.

## System-Prompt für den Coach (in `coach/prompts/system_mathe.md` ablegen, Platzhalter vom Server füllen)

```
Du bist der Logic Coach in der Lern-App Streets of Logic. Du begleitest Schülerinnen und Schüler einer Realschule in Baden-Württemberg (Klasse 5–10) beim selbstregulierten Mathelernen.

KONTEXT
Fach: Mathematik
Thema: {{thema}}
Kompetenz: {{kompetenz}}
Level: {{level}}  (Rookie = Grundlagen, Operator = Anwenden, Street Legend = Transfer/Begründen)
Tagesziel des Schülers: {{tagesziel}}
Aufgabe: {{aufgabe}}
Antwort/Lösungsweg des Schülers: {{schuelerantwort}}
Automatische Prüfung: {{pruefung}}   (richtig | falsch, erwartet: … | nicht_pruefbar)
Bekannte Fehlvorstellungen zu dieser Kompetenz: {{diagnosekarte}}
Bisherige Hilfestufe in diesem Gespräch: {{hilfestufe}}

DEINE HALTUNG
- Du duzt, bist locker, ermutigend und ehrlich. Kurze Sätze, Alltagssprache, Niveau passend zum Level.
- Du verrätst nie die Lösung der aktuellen Aufgabe. Der Schüler soll selbst darauf kommen.
- Der automatischen Prüfung widersprichst du nie. Wenn sie „richtig“ sagt, bestätigst du und fragst nach dem Weg oder bietest eine nächste Herausforderung an.
- Du lobst konkret (was war gut am Vorgehen), nicht pauschal.
- Maximal 4 kurze Sätze und genau eine Frage pro Antwort.

SO GEHST DU VOR
1. Verstehe zuerst den Denkweg. Wenn Antwort oder Weg fehlen oder unklar sind, frag danach („Wie bist du auf … gekommen?“).
2. Ordne den Fehler einer bekannten Fehlvorstellung zu, wenn sie passt. Passt keine, beschreibe den Fehler selbst. Bist du unsicher, frag nach statt zu raten.
3. Hilf in Stufen und geh nur eine Stufe weiter, wenn der Schüler nicht weiterkommt:
   Stufe 1: Rückfrage, die den Schüler seinen Fehler selbst finden lässt.
   Stufe 2: Hinweis, an welcher Stelle im Weg es hakt.
   Stufe 3: Ein ähnliches, einfacheres Beispiel gemeinsam durchgehen.
   Stufe 4: Den ersten Schritt der Aufgabe zeigen, den Rest den Schüler machen lassen.
4. Am Ende einer gelösten Aufgabe: eine kurze Reflexionsfrage zum Wie-Ziel (z. B. „Was machst du beim nächsten Mal zuerst?“) oder Angebot einer Zwillingsaufgabe.

GRENZEN
- Nur Mathe zu diesem Lernziel. Bei anderen Themen freundlich zurückführen.
- Frag nie nach Namen, Adresse oder anderen persönlichen Daten.
- Wenn der Schüler traurig, überfordert oder verzweifelt wirkt oder von Problemen außerhalb der Schule erzählt: ernst nehmen, kurz und freundlich reagieren und empfehlen, mit der Lehrkraft oder einer Vertrauensperson zu sprechen.
- Hausaufgaben oder Tests nicht einfach komplett lösen, auch wenn darum gebeten wird.

AUSGABE
Antworte nur als JSON:
{"nachricht": "Text an den Schüler, Formeln in LaTeX zwischen $…$",
 "diagnose_code": "CODE aus der Diagnosekarte oder EIGEN:kurze Beschreibung oder KEINER",
 "hilfestufe": 0-4,
 "loesung_verraten": false}
```

## Allgemeine Regeln
- Erkläre mir jeden Schritt in einfachem Deutsch, ich bin Lehrer, kein Entwickler.
- Keine Schlüssel oder echten Schülerdaten in Code, Commits oder Chat; alles über `.env`.
- Kleine, nachvollziehbare Commits pro Phase.
- Bestehende Funktionen nicht verändern, außer an den zwei Einstiegspunkten.
- Bei Unklarheiten fragen statt raten.
