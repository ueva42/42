# Levelcheck – Termin, Fähnchen, Ergebnis, Freigabe (Streets of Logic)

Erkläre mir am Ende in einfachem Deutsch, was du gebaut hast. Ich bin Lehrer, kein Entwickler.
Direkt bauen. Neue Tabellen oder Spalten sind erlaubt (nur additiv, nichts Bestehendes umbenennen oder löschen). Fehlt etwas oder ist etwas unklar: weglassen und am Ende auflisten.

## Worum es geht
Levelchecks sind die Stelle, an der aus „ich fühle mich sicher“ ein **bestätigtes** Können wird. Darauf bauen Boss-Fight, „Stadt leuchtet“, Respekt-Stern „Gut eingeschätzt“ und die Highlights im Cockpit auf. Bisher kommen diese Daten kaum rein.

**So läuft ein Levelcheck in meinem Unterricht:**
- Er ist digital: Die Schüler:innen importieren ein PDF in GoodNotes und bearbeiten es auf dem iPad.
- Er hat immer **10 Aufgaben**. **Ab 7 richtigen (70 %) ist er bestanden.**
- Ich korrigiere, danach soll das Ergebnis in die App.

**Es gab früher schon eine Funktion:** Ein angesetzter Levelcheck wurde im Lernstand ohne Note angezeigt, und die Schüler:innen konnten die erreichten Prozent eintragen. Suche diese Funktion (Lernstand, Werkzeug „Levelchecks“, zugehörige Tabellen und API) und baue darauf auf, statt etwas Paralleles zu bauen. Sag mir, was du gefunden hast.

## Ablauf
1. **Ich lege den Levelcheck an** (Lehrerbereich, Werkzeug „Levelchecks“).
2. **Er erscheint:** im Lernstand der Schüler:innen, als **Fähnchen** auf der Karte im Cockpit bzw. an den Missionen in der Fahrspuren-Ansicht und über die Schnittstelle auch auf der Karte im Trainingscenter.
3. **Am Termin:** Die Schüler:innen schreiben den Levelcheck wie bisher außerhalb der App (PDF von TaskCards in GoodNotes).
4. **Nach meiner Korrektur** tragen die Schüler:innen ein, wie viele von 10 richtig sind. Das geht im Lernstand (alle Fächer) oder im Trainingscenter (Mathe). Status danach: „eingetragen – wartet auf Freigabe“.
5. **Ich gebe frei:** Ich sehe die Liste aller Schüler:innen mit den eingetragenen Werten, korrigiere falls nötig, trage für Fehlende selbst ein und klicke „Alle freigeben“.
6. **Nach der Freigabe:** ab 7 von 10 sind alle Missionen des Levelchecks auf seinem Level **bestätigt**, sonst „nicht bestanden“. Im Cockpit wird daraus der Boss-Treffer.

## Datenmodell (prüfe, was es schon gibt, und ergänze nur)
**Levelcheck**
- id, klasse, einheit, titel
- datum (Termin)
- level: rookie | operator | streetLegend
- wz: Liste der Was-Ziel-IDs der Missionen, z. B. ["qg-01","qg-02"]
- **Kein PDF, kein Link, kein Upload.** Den Levelcheck verteile ich selbst (TaskCards), die App kennt nur Termin, Level, Missionen und Ergebnis.
- aufgaben (Standard 10), schwelle (Standard 7)
- freigegeben_am

**Levelcheck-Ergebnis**
- levelcheck_id, schüler_id
- richtig (0–10)
- eingetragen_von: schüler | lehrkraft
- eingetragen_am
- status: eingetragen | bestätigt | nicht_bestanden | nicht_teilgenommen

**Status eines Levelchecks für eine Person** (berechnet):

| Status | Bedingung |
|---|---|
| geplant | Termin in der Zukunft |
| offen | Termin erreicht, noch nichts eingetragen; Eingabe möglich |
| eingetragen | wartet auf Freigabe; Wert bis zur Freigabe änderbar |
| bestätigt | freigegeben, richtig ≥ schwelle |
| nicht_bestanden | freigegeben, richtig < schwelle |
| nicht_teilgenommen | von mir gesetzt, z. B. krank; Nachschreiben = neuer Eintrag möglich |

**„bestätigt“ für Mission und Level** = es gibt einen bestätigten Levelcheck mit dieser wz und diesem Level, oder einem höheren Level. Das ist ab jetzt **die** Quelle für „bestätigt“ im Cockpit (Ringe, Boss, Leuchten, Respekt, Highlights, Lose) und im Lernstand.

## Lehrerbereich (Werkzeug „Levelchecks“)
- **Anlegen:**
  - Klasse, Einheit, Datum, Titel, Level (Segment Rookie / Operator / Street Legend)
  - Missionen als Mehrfachauswahl aus den Unterthemen der Einheit mit ihren wz
  - Aufgaben (10), Schwelle (7)
- **Übersicht:** Liste der Levelchecks mit Datum, Missionen, Level, „x von n eingetragen“ und Status (offen / wartet auf Freigabe / freigegeben).
- **Ergebnisse eines Levelchecks:**
  - alle Schüler:innen der Klasse mit Avatar, alphabetisch
  - pro Person der eingetragene Wert (Zahlenfeld 0–10, mit Stift auf dem iPad gut bedienbar) und ein Schalter „nicht teilgenommen“
  - Zählung oben: „24 eingetragen · 7 fehlen“
  - Knopf **„Alle freigeben“** mit Sicherheitsabfrage
  - nach der Freigabe Werte weiter änderbar, z. B. für Nachschreiber; der Status rechnet sich neu
- **Testkonten** nicht anzeigen.

## Lernstand (Schülerseite, alle Fächer)
- Bereich **„Levelchecks“** im Lernstand, im Design der App:
  - nächster Levelcheck oben mit Datum, Level und Missionen
  - darunter die bisherigen
- **Pro Levelcheck je nach Status:**

| Status | Anzeige |
|---|---|
| geplant | „Am Di., 24.11. · Rookie · Binomische Formeln, Rein quadratische Gleichungen“ |
| offen | Feld **„Wie viele von 10 hast du richtig?“** (0–10) mit „Eintragen“ |
| eingetragen | „7 von 10 · wartet auf Freigabe“ (bis zur Freigabe änderbar) |
| bestätigt | „7 von 10 · bestanden ✓“, die Missionen zeigen ihr Level als bestätigt |
| nicht_bestanden | „5 von 10 · noch nicht geschafft“ und ein Hinweis: „Übe weiter im Trainingscenter, der nächste Levelcheck ist deine Chance.“ Keine roten Strafsignale. |

- **Keine Note**, nur „x von 10“.

## Schnittstelle zum Trainingscenter
Das Trainingscenter ruft bereits `GET /api/training/status` ab (mit der Kennung `t` pro Schüler:in und Thema) und sendet an `POST /api/training/results`.
- **`GET /api/training/status`** bekommt ein **zusätzliches** Feld `levelchecks`. Das bestehende Format bleibt unverändert, damit das Trainingscenter nicht bricht:
```json
"levelchecks": [
  { "id": "lc_123", "titel": "Levelcheck 1", "datum": "2026-11-24",
    "level": "rookie", "wz": ["qg-01", "qg-02"],
    "aufgaben": 10, "schwelle": 7,
    "status": "offen", "richtig": null }
]
```
Nur Levelchecks der Einheit, zu der das Thema gehört, sortiert nach Datum; vergangene freigegebene bis 14 Tage zurück.- **Neuer Endpunkt `POST /api/training/levelcheck`**: Body `{ t, levelcheckId, richtig }`. Gleiche Prüfung der Kennung wie bei `/results`. Nur erlaubt bei Status offen oder eingetragen. Antwort: der neue Status-Eintrag (wie oben).
- **CORS** für `https://trainingscenter.streetsoflogic.de` wie bei den bestehenden Endpunkten.
- Schreibe die Schnittstelle zusätzlich als kurze Datei `docs/API-LEVELCHECK.md` auf, damit ich sie dem Trainingscenter-Chat geben kann.

## Cockpit
- **Boss = nächster Levelcheck.** Energie = Schüler:innen × Missionen des Levelchecks; Treffer = bestätigte Paare (Person, Mission). Gibt es keinen Levelcheck, aber eine Klassen-Mission, gilt wie bisher die Klassen-Mission; sonst „Nächster Boss erscheint bald“.
- **Fähnchen** auf der Karte bzw. in den Fahrspuren an der letzten Mission des Levelchecks: „LEVELCHECK DI 24.11.“ (ersetzt das bisherige Boss-Schild).
- **Freigabe = Moment am Beamer:**
  - Nach „Alle freigeben“ zeigt das Cockpit beim nächsten Abruf eine Einblendung (3–4 s) „LEVELCHECK FREIGEGEBEN · 17 TREFFER!“.
  - Der Boss-Balken fällt animiert, die Stadt leuchtet an den Missionen auf.
  - Bei Energie 0: „BOSS BESIEGT“ mit Beute.
  - Eintrag ins Ereignis-Protokoll (Ticker: „Levelcheck freigegeben – 17 Treffer“, ohne Namen).
- **Respekt „Gut eingeschätzt“, Highlights und Lose** rechnen ab jetzt mit diesen bestätigten Ergebnissen.

## Andere Fächer
Alles oben gilt für jedes Fach: anlegen, Lernstand, Freigabe, Cockpit-Fahrspuren. Nur die Karte im Trainingscenter gibt es lediglich dort, wo es einen Stadtteil gibt; dort ist der Weg über `levelchecks` in der Status-API zusätzlich.

## Prüfliste
- [ ] Bestehende Levelcheck-Funktion gefunden und erweitert (sag mir, wo)
- [ ] Levelcheck anlegen mit Missionen, Level, 10/7 (kein PDF, kein Link)
- [ ] Lernstand: geplant → offen (Eingabe) → eingetragen → bestätigt / nicht bestanden
- [ ] Lehrerliste mit Avataren, Werte änderbar, „nicht teilgenommen“, „Alle freigeben“
- [ ] Nach Freigabe: Missionen bestätigt, Cockpit-Boss getroffen, Einblendung am Beamer
- [ ] `GET /api/training/status` liefert `levelchecks`, alte Felder unverändert
- [ ] `POST /api/training/levelcheck` funktioniert mit Testkennung, abgelehnt bei geplant oder freigegeben
- [ ] `docs/API-LEVELCHECK.md` geschrieben
- [ ] Physik (ohne Stadtteil): Levelcheck im Lernstand und als Fähnchen in den Fahrspuren
