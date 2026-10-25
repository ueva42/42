/**
 * Feste Coach-Antworten, ohne KI.
 * Die Wahl hängt nur am Text der Schülernachricht, nicht am Zufall.
 *
 * Reihenfolge:
 * 1. "stufe 4" → Hilfestufe 4
 * 2. "stufe 3" → Hilfestufe 3
 * 3. "stufe 2" → Hilfestufe 2
 * 4. "2/5"     → Fehlvorstellung
 * 5. "richtig" → Fall „richtig“
 * 6. sonst     → Hilfestufe 1
 */

function reply(nachricht, diagnoseCode, hilfestufe) {
  return {
    nachricht,
    diagnose_code: diagnoseCode,
    hilfestufe,
    loesung_verraten: false
  };
}

export function mockReply(message) {
  const text = String(message || "").toLowerCase();

  if (text.includes("stufe 4")) {
    return reply(
      "Den ersten Schritt machen wir zusammen: Schreib die beiden Nenner untereinander und such ein gemeinsames Vielfaches. Den Rest rechnest du selbst. Was nimmst du als gemeinsamen Nenner?",
      "KEINER",
      4
    );
  }

  if (text.includes("stufe 3")) {
    return reply(
      "Kleines Beispiel daneben: 1/2 + 1/4. Bei 1/2 schneidest du die Hälfte in zwei Viertel. Wie viele Viertel sind das zusammen?",
      "KEINER",
      3
    );
  }

  if (text.includes("stufe 2")) {
    return reply(
      "Schau auf den Nenner. Dort hakt es: Die Stücke sind noch nicht gleich groß. Was musst du ändern, bevor du die Zähler addierst?",
      "KEINER",
      2
    );
  }

  if (text.includes("2/5")) {
    return reply(
      "Du hast Zähler und Nenner jeweils für sich addiert. Ist 2/5 mehr oder weniger als 1/2? Passt das, wenn du zu 1/2 noch etwas dazutust?",
      "ZAEHLER_UND_NENNER_ADDIERT",
      1
    );
  }

  if (text.includes("richtig")) {
    return reply(
      "Ja, das Ergebnis stimmt. Stark, dass du gleichnamig gemacht hast. Was machst du beim nächsten Mal zuerst?",
      "KEINER",
      0
    );
  }

  return reply(
    "Erzähl mir kurz, wie du gerechnet hast. Welchen Schritt hast du zuerst gemacht?",
    "KEINER",
    1
  );
}
