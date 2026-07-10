/**
 * SRL-Logbuch – gemeinsame Konstanten (Frontend).
 */
window.LOGBUCH = {
  SUBJECTS: [
    "Mathe",
    "Deutsch",
    "BNT",
    "Englisch",
    "Geo",
    "Geschichte",
    "Projekt",
    "Physik",
    "Chemie",
    "Biologie",
    "AES",
    "Technik",
    "Französisch",
    "GK",
    "Musik",
    "BK",
    "WBS",
    "Religion/Ethik"
  ],
  GOALS: [
    "Ich starte mit Rookie-Aufgaben.",
    "Ich löse erst Aufgaben mit Hilfe und danach alleine.",
    "Ich bearbeite Operator-Aufgaben und bleibe dran.",
    "Ich versuche eine Street-Legend-Aufgabe.",
    "Ich vergleiche meinen Rechenweg mit der Musterlösung.",
    "Ich suche gezielt meine Fehler.",
    "Ich erkläre am Ende eine Aufgabe jemandem.",
    "Ich arbeite ein Lernvideo durch und schreibe das Wichtigste heraus.",
    "Ich wiederhole ein Thema gezielt.",
    "Ich bereite mich auf den nächsten Levelcheck vor."
  ],
  WORK_GOALS: [
    "Konzentriert arbeiten",
    "Kein Handy",
    "Tablet nur für Aufgaben",
    "Nicht ablenken lassen",
    "Ruhig arbeiten",
    "Hilfe holen wenn nötig"
  ],
  SOCIAL_FORMS: [
    { id: "einzel", label: "Einzel" },
    { id: "partner", label: "Partner" },
    { id: "gruppe", label: "Gruppe", unlockKey: "gruppe" },
    { id: "frei", label: "Frei", unlockKey: "frei" }
  ],
  STRATEGIES: {
    Verstehen: [
      "Text genau lesen",
      "Beispiele anschauen",
      "Erklärung im Kopf wiederholen"
    ],
    Üben: [
      "Aufgaben Schritt für Schritt",
      "Im Heft üben",
      "Mit Partner vergleichen"
    ],
    Vertiefen: [
      "Schwierigere Beispiele probieren",
      "Eigene Beispiele finden",
      "Thema mit anderem verbinden"
    ],
    Kontrolle: [
      "Ergebnis kontrollieren",
      "Gegenprobe machen",
      "Lösungsweg erklären"
    ]
  },
  GOAL_ACHIEVED: [
    { id: "ja_sicher", label: "Ja, ich bin sicher." },
    { id: "teilweise_uebung", label: "Teilweise, ich brauche noch Übung." },
    { id: "nein_nicht", label: "Nein, ich habe es noch nicht verstanden." }
  ],
  HOW_WORKED: [
    { id: "ja_geplant", label: "Ja, ich habe wie geplant gearbeitet." },
    { id: "teilweise_abgewichen", label: "Teilweise, ich bin etwas abgewichen." },
    { id: "nein_anders", label: "Nein, ich habe anders gearbeitet." }
  ],
  REFLECT_STRATEGY_HELPED: [
    { id: "ja_geholfen", label: "Ja, sie hat mir geholfen." },
    { id: "ein_bisschen", label: "Ein bisschen." },
    { id: "nein_andere", label: "Nein, ich brauche eine andere Strategie." },
    { id: "keine_genutzt", label: "Ich habe keine Strategie genutzt." }
  ],
  REFLECT_CONFIDENCE: [
    { value: "1", label: "1 – sehr unsicher" },
    { value: "2", label: "2 – eher unsicher" },
    { value: "3", label: "3 – geht so" },
    { value: "4", label: "4 – eher sicher" },
    { value: "5", label: "5 – sehr sicher" }
  ],
  NEXT_STEPS: [
    { id: "weiter_gleiches_ziel", label: "Ich übe dasselbe Ziel weiter." },
    { id: "naechstes_level", label: "Ich gehe zum nächsten Level." },
    { id: "rookie_wiederholen", label: "Ich wiederhole zuerst Rookie-Aufgaben." },
    { id: "operator_weiter", label: "Ich bearbeite Operator-Aufgaben weiter." },
    { id: "hilfestellung", label: "Ich brauche eine Hilfestellung." },
    { id: "lehrkraft_fragen", label: "Ich frage die Lehrkraft." },
    { id: "nachweis_vorbereiten", label: "Ich bereite mich weiter auf den Nachweis vor." }
  ],
  TIME_WASTERS: [
    "Handy / Social Media",
    "Gespräche mit Nachbarn",
    "Lärm in der Klasse",
    "Ich war müde",
    "Aufgabe war unklar",
    "Ich habe aufgeschoben"
  ],
  TIME_WASTER_LEVELS: ["nie", "selten", "manchmal", "oft"],
  WEEK_STRATEGIES: [
    "Gegeben und gesucht markieren",
    "Beispielaufgabe anschauen",
    "Fehlerjäger-Check",
    "Probe machen / rückwärts kontrollieren",
    "Aufgabe kleiner machen",
    "5-Minuten-Start",
    "Keine Strategie genutzt"
  ],
  WEEK_STRATEGY_HELPED: [
    { id: "ja_sehr", label: "Ja, sehr." },
    { id: "ein_bisschen", label: "Ein bisschen." },
    { id: "nein", label: "Nein." },
    { id: "keine_genutzt", label: "Ich habe keine Strategie genutzt." }
  ],
  CHECK_RATINGS: [
    { id: "👍", label: "👍" },
    { id: "😐", label: "😐" },
    { id: "👎", label: "👎" }
  ],
  CHECK_ON_TRACK: [
    "Ja, ich arbeite passend zu meinem Ziel.",
    "Teilweise, ich bin etwas unsicher.",
    "Nein, ich habe den Fokus verloren."
  ],
  CHECK_UNDERSTANDING: [
    "Ja, ich verstehe sie.",
    "Teilweise, ich brauche noch Hilfe.",
    "Nein, ich weiß nicht, was ich tun soll."
  ],
  CHECK_PROGRESS: [
    "Ja, ich komme gut voran.",
    "Teilweise, es geht langsam.",
    "Nein, ich hänge fest."
  ],
  CHECK_NEXT_STEP: [
    "Ich arbeite weiter wie geplant.",
    "Ich schaue mir ein Beispiel an.",
    "Ich schaue mir zuerst eine Beispielaufgabe an.",
    "Ich nutze eine Hilfestellung.",
    "Ich vergleiche mit der Musterlösung.",
    "Ich frage eine Partnerin oder einen Partner.",
    "Ich teile die Aufgabe in kleine Schritte.",
    "Ich mache eine Probe oder kontrolliere rückwärts.",
    "Ich gehe kurz zurück zu Rookie-Aufgaben.",
    "Ich markiere gegeben und gesucht.",
    "Ich suche gezielt meine Fehler und verbessere sie.",
    "Ich arbeite 5 Minuten konzentriert an einer kleinen Aufgabe."
  ],
  COMPETENCY_STATUS: {
    offen: { label: "Offen", class: "status-offen" },
    in_arbeit: { label: "In Arbeit", class: "status-in-arbeit" },
    bereit: { label: "Bereit für Zielsetzung", class: "status-bereit" },
    test_angemeldet: { label: "Test angemeldet", class: "status-test" },
    bestanden: { label: "Bestanden", class: "status-bestanden" },
    nacharbeit: { label: "Nacharbeit", class: "status-nacharbeit" }
  }
};
