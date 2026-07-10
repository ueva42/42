/**
 * Zentrale Lernstrategien / Taktiken für Plan B, Zwischen-Check und Taktik-Deck.
 */
window.LOGBUCH_STRATEGIES = [
  {
    id: "understand_task",
    category: "Aufgabe verstehen",
    problem: "Ich verstehe die Aufgabe nicht.",
    name: "Gegeben und gesucht markieren",
    whenHelps:
      "Wenn du die Aufgabe liest, aber nicht genau weißt, was du tun sollst.",
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
    category: "Anfang finden",
    problem: "Ich weiß nicht, wie ich anfangen soll.",
    name: "Beispielaufgabe anschauen",
    whenHelps: "Wenn du nicht weißt, wie du anfangen sollst.",
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
    category: "Fehler finden",
    problem: "Ich mache Fehler.",
    name: "Fehlerjäger-Check",
    whenHelps:
      "Wenn dein Ergebnis nicht stimmt oder du viele kleine Fehler machst.",
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
    category: "Ergebnis kontrollieren",
    problem: "Ich bin unsicher, ob mein Ergebnis stimmt.",
    name: "Probe machen",
    whenHelps: "Wenn du nicht sicher bist, ob dein Ergebnis richtig ist.",
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
    category: "Schwierige Aufgabe",
    problem: "Die Aufgabe ist mir zu schwer.",
    name: "Aufgabe kleiner machen",
    whenHelps: "Wenn eine Aufgabe zu groß oder zu schwierig wirkt.",
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
    category: "Motivation und Konzentration",
    problem: "Ich bin unkonzentriert oder habe keine Motivation.",
    name: "5-Minuten-Start",
    whenHelps:
      "Wenn du nicht ins Arbeiten kommst oder dich schnell ablenken lässt.",
    steps: [
      "Stelle dir einen Timer auf 5 Minuten.",
      "Bearbeite nur eine kleine Aufgabe.",
      "Bleibe bei genau dieser Aufgabe.",
      "Danach entscheidest du, ob du weitermachst."
    ],
    nextStep: "Ich arbeite 5 Minuten konzentriert an einer kleinen Aufgabe."
  }
];

window.LOGBUCH_PLAN_B_OPTIONS = [
  "Ich schaue mir eine Beispielaufgabe an.",
  "Ich markiere gegeben und gesucht.",
  "Ich nutze eine Hilfestellung.",
  "Ich mache eine Probe oder kontrolliere rückwärts.",
  "Ich teile die Aufgabe in kleine Schritte.",
  "Ich frage eine Partnerin oder einen Partner.",
  "Ich starte mit einer einfachen Rookie-Aufgabe.",
  "Ich arbeite 5 Minuten konzentriert an einer kleinen Aufgabe."
];

window.LogbuchStrategies = {
  list() {
    return window.LOGBUCH_STRATEGIES || [];
  },

  planBOptions() {
    return window.LOGBUCH_PLAN_B_OPTIONS || [];
  },

  byId(id) {
    return this.list().find((s) => s.id === id) || null;
  },

  byName(name) {
    return this.list().find((s) => s.name === name) || null;
  },

  planBFromStrategyName(name) {
    const strategy = this.byName(name);
    if (!strategy) return null;
    const hit = this.planBOptions().find(
      (opt) => opt === strategy.nextStep || opt.includes(strategy.name.split(" ")[0])
    );
    return hit || strategy.nextStep;
  },

  rememberPlanB(text) {
    try {
      if (text) localStorage.setItem("logbuch_plan_b_pref", text);
      else localStorage.removeItem("logbuch_plan_b_pref");
    } catch (_) {
      /* ignore */
    }
  },

  rememberedPlanB() {
    try {
      return localStorage.getItem("logbuch_plan_b_pref") || null;
    } catch (_) {
      return null;
    }
  }
};
