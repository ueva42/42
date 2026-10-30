/**
 * Schwellen für das Lehrer-Dashboard.
 * Eine Datei, damit die Lehrkraft die Grenzen an einer Stelle nachsehen kann.
 * Fehlende Werte werden nie als 0 oder als Auffälligkeit gewertet.
 */

export const TEACHER_DASHBOARD_CONFIG = {
  /** Standard: laufende Einheit bis zur Klassenarbeit. Umschaltbar auf diese Woche. */
  defaultRange: "unit",

  grades: {
    /** Prognose erst ab dieser Zahl bewerteter Levelchecks (bestanden oder nicht). */
    minLevelchecks: 2,
    /** Abweichung in Notenstufen. 2 gegen 2,5 bleibt unter dieser Grenze. */
    gap: 1
  },

  goals: {
    /** Z2: so viele Tage nur ein Level unter dem Zielpfad. */
    daysBelowPath: 3,
    /** Z3: Fenster aus Tagen mit bekanntem Abschluss. */
    achievedWindow: 5,
    /** Z3: Anteil geschaffter Tagesziele unter diesem Wert. */
    achievedMaxRatio: 0.4,
    /** Z4: dasselbe Tagesziel an so vielen Tagen, jedes Mal ausdrücklich nicht geschafft. */
    sameGoalDays: 3,
    /** Z+: Tagesziel an diesem Anteil der Stunden im Plan. */
    strengthSetRatio: 0.8,
    /** Z+: davon geschafft, nur unter Tagen mit bekanntem Abschluss. */
    strengthAchievedRatio: 0.7,
    /** Z+: mindestens so viele bekannte Abschlüsse, sonst keine Stärke. */
    strengthMinKnown: 4
  },

  self: {
    /** Sicherheitsgefühl 4 oder 5 gilt als sicher gemeldet. */
    sureMin: 4,
    /** 1 oder 2 gilt als unsicher. 3 und leere Felder bleiben außen vor. */
    unsureMax: 2,
    /** S1/S2 bräuchten so viele Fälle. Die Fälle fehlen, siehe DATA_GAPS. */
    minCases: 2,
    strengthConfirmRatio: 0.8
  },

  help: {
    /** Minuten ohne sichtbaren Wechsel. */
    stallMinutes: 20,
    /** H1: so viele solcher Tage, und im Zeitraum keine Hilfe und kein Coach. */
    stallMinDays: 2,
    /** H2: Fenster nach dem Start des Tagesziels. */
    earlyMinutes: 3,
    earlyMinCount: 3,
    /** H3: Hilfe erst nach dem Stillstand, so oft. */
    lateMinCount: 2,
    /** H+: falls die Stunde keine erkennbare Länge hat. */
    progressWindowMinutes: 45
  },

  work: {
    /** A1: Wechsel des Unterthemas in 60 Minuten. */
    switches: 3,
    switchWindowMinutes: 60,
    switchMinDays: 2,
    /** A2: Tage vor der Klassenarbeit. */
    examHorizonDays: 7,
    /** A3: erst ab dieser Zahl ein Musterhinweis. Einmal bleibt neutraler Stand. */
    legendWithoutRookie: 2,
    /** A4: Reflexion unter diesem Anteil der Lerntage. */
    reflectionMaxRatio: 0.5,
    reflectionMinDays: 4
  },

  live: {
    /** Noch kein Tagesziel, Minuten nach Stundenbeginn. */
    noGoalAfterMinutes: 10,
    lowConfidenceMax: 2
  },

  hints: {
    maxPerStudent: 3
  },

  /** Wo klafft es: Differenz erst ab dieser Zahl hervorheben. */
  gapHighlight: 5,

  /** Zeitzone der Stundenzeiten im Stundenplan (Uhrzeit ohne Zone gespeichert). */
  schoolTimeZone: "Europe/Berlin"
};

/**
 * Was die vorhandenen Tabellen nicht hergeben.
 * Die Oberfläche lässt diese Signale weg, statt sie zu schätzen.
 */
export const TEACHER_DASHBOARD_GAPS = [
  {
    signal: "S1, S2, S+ und die vier Felder Selbsteinschätzung gegen Levelcheck",
    missing:
      "Ein Levelcheck-Ergebnis pro Unterthema und Level. Gespeichert ist eine Bewertung pro Termin (bestanden, nicht bestanden, Prozent) und optional eine Liste von Unterthemen. Ein Level (Rookie, Operator, Street Legend) hängt am Termin nicht.",
    store:
      "Pro Schüler:in, Unterthema und Level: bestanden oder nicht bestanden, plus Zeitpunkt. Dann lässt sich „sicher gemeldet“ aus dem Levelplan danebenlegen."
  },
  {
    signal: "Z1 als Note, die aus den Levelcheck-Ergebnissen berechnet wird",
    missing:
      "Eine vorhandene Rechnung von Levelcheck-Ergebnissen auf eine Prognosenote. Vorhanden ist der Zielpfad: Anteil sicherer Level → Note. Levelcheck-Prozent wird im Programm ausdrücklich nicht zur Note.",
    store:
      "Dieselbe Speicherung wie bei S1. Die Anzeige nutzt den Zielpfad nur für sichere Levelstände, und nur ab der Mindestzahl bewerteter Levelchecks. Sonst steht „noch nicht einschätzbar“."
  },
  {
    signal: "Z4, Teil „an mindestens 2 der letzten 5 Lerntage kein Tagesziel“",
    missing:
      "Anwesenheit oder ein eigenes Feld „heute bewusst kein Ziel“. Ein Tag ohne Eintrag kann ein Fehltag sein.",
    store:
      "Anwesenheit je Stunde, oder ein Eintrag „kein Tagesziel gesetzt“ mit Datum. Der andere Teil von Z4 (dasselbe Ziel ohne Fortschritt) nutzt Reflexionen, die wirklich „nicht geschafft“ sagen."
  },
  {
    signal: "Wo klafft es, Balken „bestanden“ je Unterthema",
    missing:
      "Ein bestandener oder nicht bestandener Levelcheck, der genau einem Unterthema gehört. Termine mit mehreren Unterthemen werden nicht aufgeteilt.",
    store:
      "Wie S1, oder am Termin genau ein Unterthema verknüpfen. Nur dann erscheint der zweite Balken."
  },
  {
    signal: "Alle erinnern",
    missing:
      "Eine Erinnerung der Lehrkraft an die Klasse zum Tagesziel. Die Hausaufgaben-Glocke ist etwas anderes und wird hier nicht zweckentfremdet.",
    store: "Ein bestehender Versand an die Klasse zum Tagesziel. Solange es den nicht gibt, gibt es den Knopf nicht."
  },
  {
    signal: "Taktik-Deck nur geöffnet",
    missing:
      "Ein Zeitpunkt, dass das Taktik-Deck aufgeschlagen wurde. Gespeichert wird nur, was als Plan B, im Zwischencheck oder in der Reflexion als Strategie steht.",
    store: "Beim Öffnen oder Auswählen einer Taktik Zeit und Unterthema speichern."
  },
  {
    signal: "Ältere Statuswechsel",
    missing:
      "Die Vorgeschichte eines Levels. Pro Unterthema und Level liegt nur der letzte Stand mit einem Zeitpunkt. Ein früherer Wechsel ist überschrieben.",
    store:
      "Jede Änderung (offen, in Arbeit, sicher) als eigene Zeile mit Zeitpunkt. Stillstand und „danach weitergekommen“ würden dadurch sicherer."
  }
];
