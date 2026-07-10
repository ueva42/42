/**
 * SRL-Logbuch – feste Lernstrategien für „Strategie holen“ (Zwischen-Check).
 */
window.LOGBUCH_STRATEGIES = [
  {
    id: "understand_task",
    problem: "Ich verstehe die Aufgabe nicht.",
    name: "Gegeben und gesucht markieren",
    whenHelps:
      "Diese Strategie hilft dir, wenn du die Aufgabe liest, aber nicht genau weißt, was du tun sollst.",
    steps: [
      "Lies die Aufgabe einmal ganz.",
      "Markiere alle wichtigen Zahlen und Informationen.",
      "Schreibe auf: Was ist gegeben?",
      "Schreibe auf: Was wird gesucht?",
      "Starte erst dann mit dem Rechnen."
    ],
    nextStep: "Ich markiere gegeben und gesucht."
  },
  {
    id: "no_start",
    problem: "Ich weiß nicht, wie ich anfangen soll.",
    name: "Beispielaufgabe anschauen",
    whenHelps: "Diese Strategie hilft dir, wenn du den ersten Schritt nicht findest.",
    steps: [
      "Suche eine ähnliche Beispielaufgabe.",
      "Schau dir nur den ersten Schritt an.",
      "Übertrage diesen Schritt auf deine Aufgabe.",
      "Rechne danach selbst weiter."
    ],
    nextStep: "Ich schaue mir zuerst eine Beispielaufgabe an."
  },
  {
    id: "mistakes",
    problem: "Ich mache Fehler.",
    name: "Fehlerjäger-Check",
    whenHelps:
      "Diese Strategie hilft dir, wenn dein Ergebnis nicht stimmt oder du viele kleine Fehler machst.",
    steps: [
      "Vergleiche deinen Rechenweg Zeile für Zeile.",
      "Prüfe zuerst Vorzeichen.",
      "Prüfe dann Klammern.",
      "Prüfe, ob du richtig abgeschrieben hast.",
      "Verbessere genau die Fehlerstelle."
    ],
    nextStep: "Ich suche gezielt meine Fehler und verbessere sie."
  },
  {
    id: "unsure_result",
    problem: "Ich bin unsicher, ob mein Ergebnis stimmt.",
    name: "Probe machen",
    whenHelps:
      "Diese Strategie hilft dir, wenn du nicht sicher bist, ob dein Ergebnis richtig ist.",
    steps: [
      "Setze dein Ergebnis wieder in die Aufgabe ein.",
      "Prüfe, ob es zur Aufgabe passt.",
      "Kontrolliere deinen Rechenweg rückwärts.",
      "Schreibe kurz auf, warum dein Ergebnis sinnvoll ist."
    ],
    nextStep: "Ich mache eine Probe oder kontrolliere rückwärts."
  },
  {
    id: "too_hard",
    problem: "Die Aufgabe ist mir zu schwer.",
    name: "Aufgabe kleiner machen",
    whenHelps:
      "Diese Strategie hilft dir, wenn eine Aufgabe zu groß oder zu schwierig wirkt.",
    steps: [
      "Lies nur den ersten Teil der Aufgabe.",
      "Decke den Rest kurz ab oder ignoriere ihn zuerst.",
      "Löse nur einen kleinen Schritt.",
      "Mache danach den nächsten Schritt.",
      "Gehe notfalls kurz zurück zu Rookie-Aufgaben."
    ],
    nextStep: "Ich teile die Aufgabe in kleine Schritte."
  },
  {
    id: "unfocused",
    problem: "Ich bin unkonzentriert oder habe keine Motivation.",
    name: "5-Minuten-Start",
    whenHelps:
      "Diese Strategie hilft dir, wenn du nicht ins Arbeiten kommst oder dich schnell ablenken lässt.",
    steps: [
      "Stelle dir einen Timer auf 5 Minuten.",
      "Bearbeite nur eine kleine Aufgabe.",
      "Bleibe bei genau dieser Aufgabe.",
      "Danach entscheidest du, ob du weitermachst."
    ],
    nextStep: "Ich arbeite 5 Minuten konzentriert an einer kleinen Aufgabe."
  }
];
