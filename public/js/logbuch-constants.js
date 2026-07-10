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
    { id: "ja", label: "Ja" },
    { id: "teilweise", label: "Teilweise" },
    { id: "nein", label: "Nein" }
  ],
  HOW_WORKED: [
    { id: "konzentriert", label: "Konzentriert" },
    { id: "mit_hilfe", label: "Mit Hilfe" },
    { id: "unruhig", label: "Unruhig" },
    { id: "abgelenkt", label: "Abgelenkt" }
  ],
  NEXT_STEPS: [
    { id: "weiterüben", label: "Weiterüben" },
    { id: "hilfe_holen", label: "Hilfe holen" },
    { id: "levelcheck_machen", label: "Zielsetzung prüfen" },
    { id: "test_vorbereiten", label: "Test vorbereiten" },
    { id: "neues_thema", label: "Neues Thema" }
  ],
  TIME_WASTERS: [
    "Handy / Social Media",
    "Gespräche mit Nachbarn",
    "Lärm in der Klasse",
    "Ich war müde",
    "Aufgabe war unklar",
    "Ich habe aufgeschoben"
  ],
  TIME_WASTER_LEVELS: ["selten", "manchmal", "oft"],
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
    "Ich nutze eine Hilfestellung.",
    "Ich vergleiche mit der Musterlösung.",
    "Ich frage eine Partnerin oder einen Partner.",
    "Ich teile die Aufgabe in kleine Schritte.",
    "Ich mache eine Probe oder kontrolliere rückwärts.",
    "Ich gehe kurz zurück zu Rookie-Aufgaben."
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
