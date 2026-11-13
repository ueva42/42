/**
 * Alle Cockpit-Schwellen, Texte und Listen an einer Stelle.
 * Lehrkraft kann Werte hier anpassen, ohne Logik zu ändern.
 */

export const CONFIG = {
  /** Boss-Namen je Stadtteil/Thema (Reihenfolge = Checkpoint-Reihenfolge). */
  bossNamesByThema: {
    potenzen: [
      "Der Potenz-Pirat",
      "Die Wurzel-Wächterin",
      "Kapitän Zehnerpotenz",
      "Der Exponenten-Lord",
      "Die Radikal-Rebellin"
    ],
    "quadratische-gleichungen": [
      "Der Binom-Bandit",
      "Die Wurzel-Hexe",
      "Der Nullprodukt-Ninja",
      "Graf Ergänzung",
      "Der Formel-Fürst"
    ],
    pythagoras: [
      "Der Hypotenusen-Held",
      "Die Katheten-Königin",
      "Der Rechtwinkel-Räuber",
      "Flächen-Phantom",
      "Pythagoras' Schatten"
    ],
    funktionen: [
      "Der Geraden-Gangster",
      "Die Steigungs-Hexe",
      "Der Nullstellen-Ninja",
      "Graphen-Graf",
      "Der Funktions-Fürst"
    ],
    trigonometrie: [
      "Der Sinus-Samurai",
      "Die Kosinus-Königin",
      "Tangens-Terror",
      "Der Winkel-Wächter",
      "Der Dreiecks-Drache"
    ]
  },

  /** Respekt-Sterne: Anteile / Schwellen (Klasse als Ganzes, Mo–So). */
  respectStars: {
    geplant: 0.8,
    reflektiert: 0.7,
    gutEingeschätzt: 0.7,
    drangebliebenDays: 3,
    drangebliebenRate: 0.8,
    geholfenCount: 10
  },

  /** Season-Stufen: Klassen-XP → Belohnungstext. */
  seasonTiers: [
    { xp: 1000, label: "Musik in der Lernzeit" },
    { xp: 2000, label: "Freie Platzwahl" },
    { xp: 3000, label: "Hausaufgaben-Joker" },
    { xp: 4000, label: "Mathe draußen" },
    { xp: 5000, label: "Klassen-Frühstück" }
  ],

  /** Beute bei Boss-Sieg (Stufe 1: fest aus Config). */
  bossLoot: [
    { kind: "xp", amount: 300, label: "+300 Klassen-XP" },
    { kind: "text", label: "Musik in der Lernzeit · eine Woche" }
  ],

  /** Lose für die Glücks-Ziehung. */
  raffleTickets: {
    planned: 1,
    reflected: 1,
    gutEingeschätzt: 2,
    geholfen: 1
  },

  /** Ring-Farben auf der Karte (wie Trainingscenter). */
  mapRingColors: {
    rookie: "#ffc300",
    operator: "#f97316",
    streetLegend: "#ff2ea6"
  },

  /** Abdunklung der Stadtkarte (0 = hell, 1 = schwarz). */
  mapDarkOpacity: 0.6,

  /** Beamer: Ansichtswechsel in Sekunden. */
  beamerViewSeconds: 25,

  /** Polling-Intervall für Cockpit-Daten (Sekunden). */
  pollSeconds: 30,

  /** Highlights: max. Namen pro Kategorie. */
  highlightMaxPerCategory: 3,

  /** Crew-Tag: mindestens so viele dürfen noch fehlen (Stufe 2). */
  crewTagMinMissing: 1,

  /** Fallback-Crew-Namen nach der Auslosung (Stufe 2). */
  fallbackCrewNames: [
    "Nachtfalken",
    "Neon Riders",
    "Vektor Gang",
    "Pi Rats",
    "Wurzelwerk",
    "Formel X",
    "Ghost Crew"
  ],

  /** Fallback-Crew-Farben (hex). */
  fallbackCrewColors: [
    "#22d3ee",
    "#f472b6",
    "#a78bfa",
    "#fbbf24",
    "#34d399",
    "#fb923c",
    "#67e8f9"
  ],

  /** Side-Quest-Vorlagen (Lehrkraft wählt morgens). ziel: Zahl oder "class" = Klassengröße. */
  sideQuestTemplates: [
    {
      id: "taktik",
      typ: "taktik_deck",
      text: "Jede:r probiert eine Taktik aus dem Taktik-Deck",
      ziel: "class",
      xp: 50
    },
    {
      id: "hilfen",
      typ: "hilfe_erledigt",
      text: "10 Hilfen geben",
      ziel: 10,
      xp: 50
    },
    {
      id: "reflektieren",
      typ: "reflexion",
      text: "Alle reflektieren heute",
      ziel: "class",
      xp: 50
    },
    {
      id: "logic_coach",
      typ: "logic_coach",
      text: "Jede:r fragt den Logic Coach einmal, bevor er/sie die Lehrkraft fragt",
      ziel: "class",
      xp: 50
    }
  ],

  /** Beamer-Ticker: Anzeige-Intervall in Sekunden. */
  tickerSeconds: 20
};

export const {
  bossNamesByThema,
  respectStars,
  seasonTiers,
  bossLoot,
  raffleTickets,
  mapRingColors,
  mapDarkOpacity,
  beamerViewSeconds,
  pollSeconds,
  highlightMaxPerCategory,
  crewTagMinMissing,
  fallbackCrewNames,
  fallbackCrewColors,
  sideQuestTemplates,
  tickerSeconds
} = CONFIG;

export default CONFIG;
