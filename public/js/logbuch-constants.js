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
    { id: "ja_sicher", label: "Ja, geschafft." },
    { id: "teilweise_uebung", label: "Teilweise geschafft." },
    { id: "nein_nicht", label: "Noch nicht geschafft." },
    { id: "ziel_geaendert", label: "Mein Ziel hat sich geändert." }
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
    { id: "weiter_gleiches_ziel", label: "Beim nächsten Mal wiederholen" },
    { id: "operator_weiter", label: "Auf dem gleichen Level weiterarbeiten" },
    { id: "naechstes_level", label: "Ein Level höher ausprobieren" },
    { id: "andere_strategie", label: "Eine andere Strategie testen" },
    { id: "nachweis_vorbereiten", label: "Eine offene Aufgabe abschließen" },
    { id: "hilfestellung", label: "Hilfe einplanen" },
    { id: "rookie_wiederholen", label: "Eine leichtere Aufgabe üben" },
    { id: "lehrkraft_fragen", label: "Ich frage die Lehrkraft." }
  ],
  REFLECT_HELPED: [
    { id: "mein_weg", label: "Mein Weg zum Ziel", desc: "Mein Plan hat geholfen." },
    { id: "plan_b", label: "Mein Plan B", desc: "Notfallplan hat geholfen." },
    { id: "beispiel", label: "Eine Beispielaufgabe", desc: "Am Beispiel orientiert." },
    { id: "hilfe", label: "Hilfe von anderen", desc: "Partner oder Lehrkraft." },
    { id: "leichter", label: "Eine leichtere Aufgabe", desc: "Klein gestartet." },
    { id: "muster", label: "Die Musterlösung", desc: "Vergleich hat geholfen." },
    { id: "fokus", label: "Konzentriertes Arbeiten", desc: "Ruhig und fokussiert." },
    { id: "andere", label: "Eine andere Strategie", desc: "Andere Taktik genutzt." }
  ],
  TIME_WASTERS: [
    "Handy / Social Media",
    "Gespräche mit Nachbarn",
    "Lärm in der Klasse",
    "Ich war müde",
    "Aufgabe war unklar",
    "Ich habe aufgeschoben",
    "Zu schwierige Aufgabe",
    "Zeit war zu knapp"
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
    "Ja, ich bin gut unterwegs.",
    "Teilweise, ich muss etwas ändern.",
    "Noch nicht, ich hänge fest.",
    "Ich habe mein Ziel geändert."
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
    "Ich nutze meinen Plan B.",
    "Ich wähle eine andere Strategie.",
    "Ich frage gezielt nach Hilfe.",
    "Ich passe mein Ziel an.",
    "Ich starte mit einer leichteren Aufgabe."
  ],
  COMPETENCY_STATUS: {
    offen: { label: "Offen", class: "status-offen" },
    in_arbeit: { label: "In Arbeit", class: "status-in-arbeit" },
    bereit: { label: "Bereit für Zielsetzung", class: "status-bereit" },
    test_angemeldet: { label: "Test angemeldet", class: "status-test" },
    bestanden: { label: "Bestanden", class: "status-bestanden" },
    nacharbeit: { label: "Nacharbeit", class: "status-nacharbeit" }
  },

  /** Zentrale Zielnoten-Matrix – Spiegel von server.js TARGET_GRADE_RULES / getGradeRequirements */
  TARGET_GRADE_RULES: {
    "1": { rookie: 1, operator: 1, street_legend: 0.8 },
    "1.5": { rookie: 1, operator: 1, street_legend: 0.65 },
    "2": { rookie: 1, operator: 1, street_legend: 0.5 },
    "2.5": { rookie: 1, operator: 1, street_legend: 0.25 },
    "3": { rookie: 1, operator: 0.8, street_legend: 0 },
    "3.5": { rookie: 1, operator: 0.5, street_legend: 0 },
    "4": { rookie: 0.8, operator: 0, street_legend: 0 },
    "4.5": { rookie: 0.6, operator: 0, street_legend: 0 },
    "5": { rookie: 0.4, operator: 0, street_legend: 0 },
    "5.5": { rookie: 0.2, operator: 0, street_legend: 0 },
    "6": { rookie: 0, operator: 0, street_legend: 0 }
  },

  getGradeRequirements(targetGrade) {
    let key = String(targetGrade ?? "")
      .trim()
      .replace(",", ".")
      .replace("−", "-");
    if (!key) return null;
    const rulesTable = (typeof window !== "undefined" && window.LogbuchConstants
      ? window.LogbuchConstants.TARGET_GRADE_RULES
      : null) || this.TARGET_GRADE_RULES;
    if (rulesTable[key]) {
      const rules = rulesTable[key];
      return {
        rookie: Number(rules.rookie) || 0,
        operator: Number(rules.operator) || 0,
        street_legend: Number(rules.street_legend) || 0
      };
    }
    const num = Number(key);
    if (!Number.isFinite(num) || num < 1 || num > 6) return null;
    const halfStep = Math.round(num * 2) / 2;
    key = Number.isInteger(halfStep) ? String(halfStep) : halfStep.toFixed(1);
    const rules = rulesTable[key];
    if (!rules) return null;
    return {
      rookie: Number(rules.rookie) || 0,
      operator: Number(rules.operator) || 0,
      street_legend: Number(rules.street_legend) || 0
    };
  },

  ZIELPFAD_PRIMARY_GRADES: ["3", "2", "1"],

  LEVEL_CHECK_TIER_ORDER: ["rookie", "operator", "street_legend"],

  LEVEL_CHECK_TIER_LABELS: {
    rookie: "Rookie",
    operator: "Operator",
    street_legend: "Street Legend"
  }
};
