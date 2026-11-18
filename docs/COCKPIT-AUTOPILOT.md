# Cockpit – Autopilot: läuft von selbst, Lehrkraft muss kaum etwas starten

Bezug: `docs/COCKPIT.md`, `docs/LEVELCHECK.md`, `docs/COCKPIT-GAMIFICATION.md`. Nach diesen umsetzen.
Direkt bauen, nur additive Datenbankänderungen. Alle Zeiten und Schalter in die Konfiguration bzw. in eine Einstellungsseite „Autopilot“ pro Klasse. Am Ende Prüfliste abhaken und in einfachem Deutsch erklären.

## Ziel
Ich öffne morgens einmal den Beamer-Link. Danach läuft das Cockpit den ganzen Tag allein:
- richtige Klasse und Einheit zur richtigen Zeit
- passende Ansicht zur Phase der Stunde
- Side Quest, Glücks-Ziehung, Season-Start und Crew-Auslosung von selbst

Ich greife nur ein, wenn ich will.

**Was ich dann noch mache:**
- **Täglich:** Beamer-Link öffnen und einmal tippen (Vollbild verlangt der Browser aus Sicherheitsgründen mit einem Tipp).
- **Pro Einheit:** Levelcheck-Termine bestätigen (die App schlägt sie vor).
- **Optional:** Levelcheck-Ergebnisse vor der automatischen Freigabe ansehen.

---

## 1. Ein Link für den ganzen Tag
- **Neue Adresse:** `/teacher/beamer`. Sie öffnet direkt die Beamer-Ansicht ohne Navigation (Pseudo-Vollbild, funktioniert auch auf dem iPad). Ein Tipp auf „Vollbild“ macht echtes Vollbild.
- **Automatische Klassenwahl:** Die Seite liest meinen **Stundenplan** und zeigt automatisch die Klasse und Einheit der laufenden Stunde (Tag und Uhrzeit, Europe/Berlin). Hat die Klasse in dem Fach mehrere aktive Einheiten: die mit dem nächsten Ziel-Termin.
- **Zwischen den Stunden** und 5 Minuten vor Beginn: Wartebildschirm „Gleich: 9a · Mathe · Quadratische Gleichungen“, mit der Avatar-Wand der kommenden Klasse (alle gedimmt) und den Respekt-Sternen der Woche. So sehen die Kinder beim Reinkommen sofort ihre Wand.
- **Ohne Stunde laut Plan:** ruhiger Bildschirm mit Uhrzeit und „Heute keine Stunde mehr“. Kein Leerlauf mit Nullen.
- **Bleibt den ganzen Tag offen:**
  - Daten alle 30 s
  - Klassenwechsel automatisch beim Stundenwechsel
  - Bildschirm-Sperre auf dem iPad verhindern, wo möglich (Wake Lock API)
- **Manuell überschreiben** (Klasse/Einheit wählen) geht weiter über die Steuerleiste, gilt bis zum Ende der Stunde.

## 2. Phasen der Stunde
Die Stunde wird nach Stundenplan in drei Phasen geteilt (Minuten in den Einstellungen):

| Phase | Zeitraum (Standard) | Beamer zeigt |
|---|---|---|
| Start | erste 10 min | **Klasse** (Avatar-Wand) dauerhaft, damit alle ihr Tagesziel setzen. Sobald alle Anwesenden ein Ziel haben: Moment „GANZE KLASSE GESTARTET!“, dann Wechsel in die Lernphase |
| Lernphase | Mitte | automatischer Wechsel Mission → Klasse → Belohnung alle 25 s; die Avatar-Wand zeigt Live-Zustände |
| Abschluss | letzte 10 min | **Klasse** mit Hinweis „Zeit für eure Reflexion“, danach **Belohnung** |

- **5 Minuten vor Stundenende:** automatische **Glücks-Ziehung** mit Spielautomat-Animation, XP-Wert aus den Einstellungen (Standard 10). Nur wenn heute noch nicht gezogen wurde und mindestens 1 Los im Topf ist.
- **Ausschalten:** „Phasen aus“ in den Einstellungen → dann wie bisher nur der automatische Wechsel.

## 3. Side Quest wählt sich selbst
- **Jeden Lerntag** wählt die App automatisch eine Side Quest aus den Vorlagen, passend zur Woche:
  - Respekt „Reflektiert“ unter Ziel → „Alle reflektieren heute“
  - „Geholfen“ unter Ziel → „10 Hilfen geben“
  - „Gut eingeschätzt“ unter Ziel und Levelcheck in den nächsten 3 Tagen → „Jede:r macht die Kontrolle einer Mission im Trainingscenter“ (nur Mathe mit Stadtteil, sonst „Jede:r probiert eine Taktik aus dem Taktik-Deck“)
  - sonst reihum aus den übrigen Vorlagen, nicht zweimal hintereinander dieselbe
- **Ich kann sie ändern**, muss aber nicht.

## 4. Levelchecks: Vorschlag und Freigabe
- **Vorschlag beim Anlegen einer Einheit** (oder beim ersten Öffnen ohne Levelchecks):
  - Die App schlägt Termine vor, verteilt bis zum Ziel-Termin der Einheit: wöchentlich am selben Wochentag, Missionen in Reihenfolge, zuerst Rookie, später Operator.
  - Eine Liste „Vorgeschlagene Levelchecks“ mit „Alle übernehmen“, einzeln änderbar.
- **Automatische Freigabe** (Schalter pro Klasse, **Standard an**):
  - Ergebnisse werden **2 Schultage nach dem Termin** automatisch freigegeben, außer ich habe vorher selbst freigegeben oder einen Wert geändert.
  - Vorher erscheint im Lehrerbereich ein unaufdringlicher Hinweis „Levelcheck 2 wird morgen automatisch freigegeben (24 eingetragen, 7 fehlen)“.
  - Wer bis dahin nichts eingetragen hat, bleibt offen und kann nachtragen; Nachträge werden ebenfalls 2 Schultage später automatisch freigegeben.
- **Freigabe = Moment am Beamer** (wie in LEVELCHECK.md), auch bei automatischer Freigabe. Der Moment wird in der nächsten Stunde der Klasse gezeigt, nicht irgendwann.

## 5. Season und Crews
- **Neue Einheit = neue Season**, automatisch:
  - Season-XP beginnen neu
  - am ersten Tag erscheint in der Startphase die „?“-Ansicht (So funktioniert's)
- **Crews** (falls gebaut):
  - Auslosung automatisch zum Season-Start (gelenkter Zufall wie in COCKPIT.md, „nicht zusammen“-Paare beachten), Show am Beamer in der Startphase der ersten Stunde
  - Namen: Die Crews dürfen bis zum Ende der ersten Stunde wählen, sonst vergibt die App einen aus der Liste
  - Ich sehe das Ergebnis vorher im Lehrerbereich und kann neu losen, muss aber nicht
- **Boss besiegt** wird automatisch erkannt. „Sieg geben“ bleibt nur als Ausnahme in der Steuerleiste.

## 6. Erinnerungen an die Schüler:innen statt an mich
- **Tagesziel:** 5 Minuten nach Stundenbeginn bekommen alle, die noch kein Tagesziel haben, auf ihrem Gerät eine Erinnerung „Setz dein Tagesziel“ (Hinweis in der App bzw. die bestehende Erinnerungsfunktion). Am Beamer erscheinen keine Namen.
- **Reflexion:** 10 Minuten vor Stundenende Erinnerung „Zeit für deine Reflexion“.
- **Levelcheck-Ergebnis:** Ist ein Levelcheck offen und noch nichts eingetragen: Erinnerung im Lernstand.

## 7. Einstellungsseite „Autopilot“ (pro Klasse, einmal einrichten)
- **Schalter mit sinnvollen Standards:**
  - Autopilot an
  - Phasen an
  - automatische Ziehung an, XP-Wert
  - automatische Side Quest an
  - automatische Levelcheck-Freigabe an, Wartezeit 2 Schultage
  - Namen am Beamer an
  - Ton aus
- **Minuten** für Start- und Abschlussphase und für die Ziehung vor Stundenende.
- **Vorschau:** „So sieht dein Tag aus“ mit der Liste der heutigen Stunden laut Stundenplan.

---

## Prüfliste
- [x] `/teacher/beamer` wählt Klasse und Einheit nach Stundenplan, wechselt beim Stundenwechsel, Wartebildschirm dazwischen
- [x] Phasen Start / Lernphase / Abschluss laufen nach Uhr; „GANZE KLASSE GESTARTET!“ beendet die Startphase vorzeitig
- [x] Glücks-Ziehung startet 5 min vor Ende automatisch, nur einmal pro Tag
- [x] Side Quest wird jeden Lerntag automatisch passend gewählt
- [x] Levelcheck-Vorschläge bis zum Ziel-Termin, „Alle übernehmen“
- [x] Automatische Freigabe nach 2 Schultagen mit Hinweis vorher; Moment in der nächsten Stunde der Klasse
- [x] Season-Start automatisch mit „?“-Ansicht; Crews (falls vorhanden) automatisch ausgelost
- [x] Erinnerungen an Schüler:innen für Tagesziel, Reflexion, Levelcheck-Ergebnis
- [x] Einstellungsseite „Autopilot“ pro Klasse mit allen Schaltern
- [x] Mit Testdaten einen ganzen Schultag simulieren (Uhrzeit in der Konfiguration überschreibbar) und beschreiben, was zu welcher Zeit passiert

### Simulation (Beispiel)
In Autopilot-Einstellungen Datum/Uhrzeit setzen, dann `/teacher/beamer` öffnen:

| Uhrzeit | Was passiert |
|---|---|
| 5 min vor Stunde | Wartebildschirm „Gleich: 9a · Mathe · …“ |
| Stundenbeginn | Klasse (Avatar-Wand), Startphase |
| Alle haben Tagesziel | Moment „GANZE KLASSE GESTARTET!“, Wechsel Lernphase (Mission↔Klasse↔Belohnung) |
| 5 min vor Ende | Automatische Glücks-Ziehung (wenn Lose da) |
| Letzte 10 min | Hinweis Reflexion, dann Belohnung |
| Nach letzter Stunde | „Heute keine Stunde mehr“ |
