# Beispielkarten für den Logic Coach (Mathe)

Das sind zwei Beispiele. Sie gehören noch zu keiner echten Kompetenz aus der Klasse.

Der Dateiname muss später die echte ID der Kompetenzzeile sein. Das ist die UUID aus `level_check_goals`, mit der Endung `.json`. In der Datei muss `competenceId` dieselbe UUID sein.

Benenne die Datei um, sobald du diese UUID kennst. Solange der Name mit `beispiel-` beginnt, findet der Coach die Karte nicht.

Beide Beispiele gehören zum Thema Brüche:

- Zähler und Nenner einzeln addiert
- nur den Nenner erweitert

Liegen beide Fehler bei derselben Kompetenz, darfst du sie in eine gemeinsame Datei mit der echten UUID schreiben.

Fehlt zu einer Kompetenz eine Karte, arbeitet der Coach trotzdem.

Prüfung aller Karten: `node scripts/check-diagnosekarten.js`
