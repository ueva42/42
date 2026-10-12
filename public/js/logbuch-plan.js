/**
 * SRL-Logbuch – PLANEN-Screen (Tagesziel aus Levelplan + Nachweis).
 */
(function () {
  const C = () => window.LOGBUCH;
  const UI = () => window.LogbuchUI;
  const PLAN_B = (subject) =>
    window.LogbuchStrategies?.planBOptions(subject ?? state.subject) ||
    window.LOGBUCH_PLAN_B_OPTIONS ||
    [];
  const PLAN_B_ALL = () =>
    window.LogbuchStrategies?.allPlanBOptions?.() || PLAN_B(null);
  const HOW_GOAL_OPTIONS = [
    "Ich schaue mir zuerst ein Beispiel an.",
    "Ich starte mit Rookie-Aufgaben.",
    "Ich löse erst mit Hilfe und danach alleine.",
    "Ich bearbeite Operator-Aufgaben.",
    "Ich versuche eine Street-Legend-Aufgabe.",
    "Ich vergleiche meinen Lösungsweg mit der Musterlösung.",
    "Ich suche gezielt meine Fehler.",
    "Ich schreibe meinen Lösungsweg sauber auf.",
    "Ich erkläre am Ende eine Aufgabe jemandem.",
    "Ich schaue ein Lernvideo und notiere drei wichtige Punkte.",
    "Ich wiederhole ein unsicheres Ziel."
  ];

  const HOW_GOAL_PREFERRED = {
    rookie: [
      "Ich schaue mir zuerst ein Beispiel an.",
      "Ich starte mit Rookie-Aufgaben.",
      "Ich löse erst mit Hilfe und danach alleine.",
      "Ich schaue ein Lernvideo und notiere drei wichtige Punkte.",
      "Ich wiederhole ein unsicheres Ziel."
    ],
    operator: [
      "Ich bearbeite Operator-Aufgaben.",
      "Ich löse erst mit Hilfe und danach alleine.",
      "Ich vergleiche meinen Lösungsweg mit der Musterlösung.",
      "Ich suche gezielt meine Fehler.",
      "Ich schreibe meinen Lösungsweg sauber auf."
    ],
    street_legend: [
      "Ich versuche eine Street-Legend-Aufgabe.",
      "Ich erkläre am Ende eine Aufgabe jemandem.",
      "Ich suche gezielt meine Fehler.",
      "Ich vergleiche meinen Lösungsweg mit der Musterlösung."
    ]
  };

  const LEVEL_OPTIONS = [
    { value: "rookie", label: "Rookie" },
    { value: "operator", label: "Operator" },
    { value: "street_legend", label: "Street Legend" }
  ];
  /** Ask-Wizard: Unterthema → Was-Ziel → Arbeite → Kontrolle → Plan B → Selbstcheck */
  const PLAN_ASK_STEPS = 6;

  const state = {
    date: null,
    timeslot: null,
    subject: null,
    whatGoalId: null,
    whatGoalText: "",
    roleGoalId: null,
    roleWasGoalOptions: [],
    selectedLevel: null,
    levelGoalText: "",
    howGoalText: null,
    startGoals: [],
    controlGoals: [],
    planBStrategies: [],
    workGoals: [],
    socialForm: null,
    confidenceBefore: null,
    detailsText: "",
    socialUnlock: { gruppe: false, frei: false },
    existingEntry: null,
    editingEntryId: null,
    whatGoalOptions: [],
    howGoals: HOW_GOAL_OPTIONS,
    howGoalsBase: HOW_GOAL_OPTIONS,
    levelOptions: LEVEL_OPTIONS,
    nextCheckpoint: null,
    checkpoints: [],
    selectedCheckpointId: null,
    goalSource: "none",
    hasClass: true,
    subjectLocked: false,
    submitting: false,
    errorMsg: "",
    activeStep: 1,
    step3Skipped: false,
    planBAcknowledged: false,
    suggestion: null,
    suggestionApplied: false,
    afterSaveOpen: false,
    groupContext: null,
    handoffUserId: null,
    roleSaving: false,
    /** Shared-Tablet: Hinweis „Tablet an …“ nach Speichern */
    handoffNotice: null,
    /** Shared-Tablet: in dieser Sitzung gespeicherte Personen (userId) */
    quickDoneIds: [],
    pqSeenSection: null
  };

  const ARBEIT_TILE_META = {
    "Konzentriert arbeiten": {
      title: "Konzentriert arbeiten",
      desc: "Ich arbeite fokussiert an meiner Aufgabe.",
      icon: "◎",
      accent: "#a855f7"
    },
    "Kein Handy": {
      title: "Kein Handy",
      desc: "Ich lege mein Handy weg.",
      icon: "▣",
      accent: "#a855f7"
    },
    "Tablet nur für Aufgaben": {
      title: "Tablet nur für Aufgaben",
      desc: "Ich nutze das Tablet nur fürs Lernen.",
      icon: "▤",
      accent: "#a855f7"
    },
    "Nicht ablenken lassen": {
      title: "Nicht ablenken lassen",
      desc: "Ich lasse mich nicht stören.",
      icon: "◌",
      accent: "#a855f7"
    },
    "Ruhig arbeiten": {
      title: "Ruhig arbeiten",
      desc: "Ich arbeite ruhig und sauber.",
      icon: "◍",
      accent: "#a855f7"
    },
    "Hilfe holen wenn nötig": {
      title: "Hilfe gezielt nutzen",
      desc: "Ich nutze Hilfestellung bewusst.",
      icon: "?",
      accent: "#a855f7"
    },
    "Bei Unsicherheit nachfragen": {
      title: "Bei Unsicherheit nachfragen",
      desc: "Wenn ich unsicher bin, frage ich gezielt nach.",
      icon: "?",
      accent: "#f472b6"
    }
  };

  const CONTROL_STRATEGY_TILES = [
    {
      value: "Ergebnis kontrollieren",
      title: "Rechenweg prüfen",
      desc: "Ich prüfe meinen Rechenweg.",
      icon: "≡",
      accent: "#22d3ee"
    },
    {
      value: "Mit Partner vergleichen",
      title: "Mit Musterlösung vergleichen",
      desc: "Ich vergleiche mit der Musterlösung.",
      icon: "⇄",
      accent: "#22d3ee"
    },
    {
      value: "Gegenprobe machen",
      title: "Rückwärts kontrollieren",
      desc: "Ich kontrolliere mein Ergebnis rückwärts.",
      icon: "↩",
      accent: "#22d3ee"
    },
    {
      value: "Lösungsweg erklären",
      title: "Lösung erklären",
      desc: "Ich erkläre meine Lösung am Ende.",
      icon: "💬",
      accent: "#22d3ee"
    },
    {
      value: "Aufgaben Schritt für Schritt",
      title: "Fehler suchen",
      desc: "Ich suche gezielt Fehler in meinem Weg.",
      icon: "⌕",
      accent: "#22d3ee"
    }
  ];

  /** Fach-Packs für „Ich kontrolliere so“ – Keys = Fach lowercase. */
  const SUBJECT_CONTROL_PACKS = {
    physik: [
      {
        value: "Vermutung prüfen",
        title: "Vermutung prüfen",
        desc: "Passt das Ergebnis zu meiner Hypothese?",
        icon: "◎",
        accent: "#22d3ee"
      },
      {
        value: "Versuchsplan checken",
        title: "Versuchsplan checken",
        desc: "Ist Aufbau und Ablauf klar?",
        icon: "▦",
        accent: "#22d3ee"
      },
      {
        value: "Beobachtung vs. Vermutung",
        title: "Beobachtung vergleichen",
        desc: "Beobachtungen mit der Vermutung abgleichen.",
        icon: "⇄",
        accent: "#22d3ee"
      },
      {
        value: "Ergebnis erklären",
        title: "Ergebnis erklären",
        desc: "Kann ich das Ergebnis verständlich sagen?",
        icon: "💬",
        accent: "#22d3ee"
      },
      {
        value: "Sicherheit und Aufbau prüfen",
        title: "Sicherheit & Aufbau",
        desc: "Ist der Versuch sicher und korrekt aufgebaut?",
        icon: "⚠",
        accent: "#22d3ee"
      },
      {
        value: "Recherche oder KI kritisch prüfen",
        title: "Recherche/KI prüfen",
        desc: "Quellen oder KI-Ergebnis kritisch prüfen.",
        icon: "⌕",
        accent: "#22d3ee"
      }
    ]
  };

  const HOW_TO_CONTROL_STRATEGY = {
    "Ich vergleiche meinen Lösungsweg mit der Musterlösung.": "Mit Partner vergleichen",
    "Ich suche gezielt meine Fehler.": "Aufgaben Schritt für Schritt"
  };

  function subjectKey(subject = state.subject) {
    return String(subject || "")
      .trim()
      .toLowerCase();
  }

  function controlTilesForSubject(subject = state.subject) {
    const pack = SUBJECT_CONTROL_PACKS[subjectKey(subject)];
    return Array.isArray(pack) && pack.length ? pack : CONTROL_STRATEGY_TILES;
  }

  function allControlTiles() {
    const map = new Map();
    for (const t of CONTROL_STRATEGY_TILES) map.set(t.value, t);
    for (const pack of Object.values(SUBJECT_CONTROL_PACKS)) {
      for (const t of pack) map.set(t.value, t);
    }
    return [...map.values()];
  }

  const HOW_GOAL_TILE_META = {
    "Ich schaue mir zuerst ein Beispiel an.": {
      cat: "starten",
      title: "Beispiel anschauen",
      desc: "Schau zuerst eine Beispielaufgabe an.",
      icon: "◎",
      accent: "#22d3ee"
    },
    "Ich starte mit Rookie-Aufgaben.": {
      cat: "starten",
      title: "Rookie starten",
      desc: "Beginne mit einfachen Aufgaben.",
      icon: "1",
      accent: "#22d3ee"
    },
    "Ich löse erst mit Hilfe und danach alleine.": {
      cat: "starten",
      title: "Mit Hilfe starten",
      desc: "Löse erst mit Hilfe, dann alleine.",
      icon: "⇄",
      accent: "#22d3ee"
    },
    "Ich schaue ein Lernvideo und notiere drei wichtige Punkte.": {
      cat: "starten",
      title: "Lernvideo nutzen",
      desc: "Video schauen und 3 Punkte notieren.",
      icon: "▶",
      accent: "#22d3ee"
    },
    "Ich wiederhole ein unsicheres Ziel.": {
      cat: "starten",
      title: "Ziel wiederholen",
      desc: "Wiederhole etwas, das noch unsicher ist.",
      icon: "↺",
      accent: "#22d3ee"
    },
    "Ich bearbeite Operator-Aufgaben.": {
      cat: "bearbeiten",
      title: "Operator-Aufgaben",
      desc: "Arbeite auf Operator-Level weiter.",
      icon: "2",
      accent: "#a855f7"
    },
    "Ich versuche eine Street-Legend-Aufgabe.": {
      cat: "bearbeiten",
      title: "Legend versuchen",
      desc: "Probiere eine schwere Aufgabe.",
      icon: "3",
      accent: "#d946ef"
    },
    "Ich schreibe meinen Lösungsweg sauber auf.": {
      cat: "bearbeiten",
      title: "Weg aufschreiben",
      desc: "Halte deinen Rechenweg sauber fest.",
      icon: "✎",
      accent: "#a855f7"
    },
    "Ich erkläre am Ende eine Aufgabe jemandem.": {
      cat: "bearbeiten",
      title: "Aufgabe erklären",
      desc: "Erkläre am Ende jemandem deine Lösung.",
      icon: "💬",
      accent: "#a855f7"
    },
    "Ich vergleiche meinen Lösungsweg mit der Musterlösung.": {
      cat: "kontrollieren",
      title: "Rechenweg prüfen",
      desc: "Vergleiche mit der Musterlösung.",
      icon: "≡",
      accent: "#22d3ee"
    },
    "Ich suche gezielt meine Fehler.": {
      cat: "kontrollieren",
      title: "Fehler suchen",
      desc: "Finde und verbessere Fehler.",
      icon: "⌕",
      accent: "#22d3ee"
    }
  };

  const PLAN_B_TILE_META = {
    "Ich schaue mir eine Beispielaufgabe an.": {
      cat: "starten",
      title: "Beispiel ansehen",
      desc: "Hol dir Orientierung am Beispiel.",
      icon: "◎",
      accent: "#22d3ee"
    },
    "Ich markiere gegeben und gesucht.": {
      cat: "starten",
      title: "Gegeben & gesucht",
      desc: "Markiere, was gegeben und gesucht ist.",
      icon: "◫",
      accent: "#22d3ee"
    },
    "Ich nutze eine Hilfestellung.": {
      cat: "starten",
      title: "Hilfe nutzen",
      desc: "Nutze eine Hilfestellung bewusst.",
      icon: "?",
      accent: "#22d3ee"
    },
    "Ich starte mit einer einfachen Rookie-Aufgabe.": {
      cat: "starten",
      title: "Rookie-Start",
      desc: "Starte klein und einfach.",
      icon: "1",
      accent: "#22d3ee"
    },
    "Ich arbeite 5 Minuten konzentriert an einer kleinen Aufgabe.": {
      cat: "starten",
      title: "5-Minuten-Start",
      desc: "Kurz fokussiert anfangen.",
      icon: "⏱",
      accent: "#22d3ee"
    },
    "Ich teile die Aufgabe in kleine Schritte.": {
      cat: "bearbeiten",
      title: "Schritte teilen",
      desc: "Zerlege die Aufgabe in Teile.",
      icon: "▦",
      accent: "#a855f7"
    },
    "Ich frage eine Partnerin oder einen Partner.": {
      cat: "bearbeiten",
      title: "Partner fragen",
      desc: "Hol dir gezielt Unterstützung.",
      icon: "👥",
      accent: "#a855f7"
    },
    "Ich mache eine Probe oder kontrolliere rückwärts.": {
      cat: "kontrollieren",
      title: "Probe machen",
      desc: "Prüfe dein Ergebnis rückwärts.",
      icon: "↩",
      accent: "#22d3ee"
    },
    "Ich nutze Hilfekarte Stufe 1 (Denkanstoß).": {
      cat: "starten",
      title: "Hilfekarte Stufe 1",
      desc: "Denkanstoß – ohne Lösung.",
      icon: "1",
      accent: "#22d3ee"
    },
    "Ich nutze Hilfekarte Stufe 2 (Hinweis zum Versuch).": {
      cat: "starten",
      title: "Hilfekarte Stufe 2",
      desc: "Hinweis in Richtung Versuch.",
      icon: "2",
      accent: "#22d3ee"
    },
    "Ich nutze Hilfekarte Stufe 3 (konkreter Versuch).": {
      cat: "starten",
      title: "Hilfekarte Stufe 3",
      desc: "Konkreter Versuch vorgegeben.",
      icon: "3",
      accent: "#a855f7"
    },
    "Ich formuliere meine Vermutung neu.": {
      cat: "bearbeiten",
      title: "Vermutung neu",
      desc: "Hypothese überdenken und neu fassen.",
      icon: "↺",
      accent: "#a855f7"
    },
    "Ich vereinfache den Versuch.": {
      cat: "bearbeiten",
      title: "Versuch vereinfachen",
      desc: "Weniger Variablen, klarer Aufbau.",
      icon: "▦",
      accent: "#a855f7"
    },
    "Ich recherchiere oder nutze KI.": {
      cat: "kontrollieren",
      title: "Recherchieren / KI",
      desc: "Gezielt nachschlagen oder KI nutzen.",
      icon: "⌕",
      accent: "#22d3ee"
    },
    "Ich prüfe nochmal die Problemstellung.": {
      cat: "starten",
      title: "Problemstellung checken",
      desc: "Aufgabe und Frage nochmal lesen.",
      icon: "◫",
      accent: "#22d3ee"
    }
  };

  const LEVEL_TILE_META = {
    rookie: { title: "Rookie", desc: "Einstieg und Sicherheit.", icon: "1", accent: "#22d3ee" },
    operator: { title: "Operator", desc: "Sicher anwenden.", icon: "2", accent: "#a855f7" },
    street_legend: { title: "Street Legend", desc: "Meistern und erklären.", icon: "3", accent: "#d946ef" }
  };

  function iconForGoalText(text) {
    const t = String(text || "").toLowerCase();
    if (t.includes("rookie") || t.includes("einfach")) return "1";
    if (t.includes("operator")) return "2";
    if (t.includes("legend") || t.includes("schwer")) return "3";
    if (t.includes("video")) return "▶";
    if (t.includes("beispiel")) return "◎";
    if (t.includes("hilfe")) return "⇄";
    if (
      t.includes("schreib") ||
      t.includes("rechenweg") ||
      t.includes("notier") ||
      t.includes("protokoll")
    ) {
      return "✎";
    }
    if (t.includes("vergleich") || t.includes("muster")) return "≡";
    if (t.includes("fehler")) return "⌕";
    if (t.includes("probe") || t.includes("rückwärts") || t.includes("rueckwaerts")) return "↩";
    if (t.includes("markier") || t.includes("gegeben") || t.includes("gesucht")) return "◫";
    if (t.includes("zerleg") || t.includes("schritt")) return "▦";
    if (t.includes("erklär") || t.includes("erklaer")) return "💬";
    if (t.includes("wiederhol")) return "↺";
    if (t.includes("partner") || t.includes("gruppe")) return "👥";
    if (t.includes("sicher")) return "⚠";
    if (t.includes("versuch") || t.includes("beobacht")) return "◉";
    if (t.includes("recherch")) return "⌕";
    return "◆";
  }

  function howGoalTile(text) {
    const meta = HOW_GOAL_TILE_META[text];
    if (meta) return { value: text, ...meta };
    // Fach-eigene Wie-Ziele: voller Text auf der Karte, kein Ellipsis
    return {
      value: text,
      cat: "starten",
      title: text,
      desc: "",
      icon: iconForGoalText(text),
      accent: "#22d3ee"
    };
  }

  function planBTile(text) {
    const meta = PLAN_B_TILE_META[text];
    if (meta) return { value: text, ...meta };
    return {
      value: text,
      cat: "starten",
      title: text,
      desc: "",
      icon: iconForGoalText(text),
      accent: "#22d3ee"
    };
  }

  function syncStartGoalFromHowGoal() {
    state.howGoalText = joinMulti(state.startGoals);
  }

  function toggleMulti(list, value, max = 3) {
    const idx = list.indexOf(value);
    if (idx >= 0) list.splice(idx, 1);
    else if (list.length < max) list.push(value);
  }

  function joinMulti(list) {
    return (list || []).filter(Boolean).join(" · ") || null;
  }

  function parseMulti(text, allowedValues) {
    if (Array.isArray(text)) {
      return text.filter((v) => !allowedValues || allowedValues.includes(v));
    }
    if (!text) return [];
    const raw = String(text).trim();
    if (!raw) return [];
    if (allowedValues?.includes(raw)) return [raw];
    const parts = raw.split(/\s*·\s*/).map((s) => s.trim()).filter(Boolean);
    const matched = parts.filter((p) => !allowedValues || allowedValues.includes(p));
    if (matched.length) return matched;
    return allowedValues ? [] : parts;
  }

  function controlLabel(value) {
    const tile = allControlTiles().find((t) => t.value === value);
    if (tile) return tile.title;
    return value || "–";
  }

  function arbeitTile(goal) {
    const meta = ARBEIT_TILE_META[goal];
    return {
      value: goal,
      title: meta?.title || goal,
      desc: meta?.desc || "Arbeitsfokus wählen",
      icon: meta?.icon || "◈",
      accent: meta?.accent || "#a855f7"
    };
  }

  function defaultStartGoalTexts() {
    return HOW_GOAL_OPTIONS.filter((text) => howGoalTile(text).cat === "starten");
  }

  function isAllowedStartGoal(text) {
    if (!text) return false;
    return startGoalTiles().some((t) => t.value === text);
  }

  function startGoalTiles() {
    const seen = new Set();
    const tiles = [];
    // Nur API-Fach-Ziele (bzw. Defaults wenn keine eigenen). Keine globale
    // Mathe-Standardliste mehr dazumischen – sonst verdecken sie Physik-Ziele.
    const source =
      Array.isArray(state.howGoals) && state.howGoals.length
        ? state.howGoals
        : HOW_GOAL_OPTIONS;

    for (const text of source) {
      const known = HOW_GOAL_TILE_META[text];
      // Bekannte Arbeit-/Kontroll-Defaults gehören in andere Schritte
      if (known && known.cat !== "starten") continue;
      const tile = howGoalTile(text);
      if (tile.cat !== "starten") continue;
      if (seen.has(tile.value)) continue;
      seen.add(tile.value);
      tiles.push(tile);
    }

    return tiles.length ? tiles : defaultStartGoalTexts().map(howGoalTile);
  }

  function controlGoalTiles() {
    return controlTilesForSubject();
  }

  function arbeitGoalTiles() {
    return C().WORK_GOALS.map(arbeitTile);
  }

  function planBTilesAll() {
    return PLAN_B(state.subject).map(planBTile);
  }

  function syncSubjectScopedSelections() {
    const allowedControl = new Set(controlGoalTiles().map((t) => t.value));
    state.controlGoals = state.controlGoals.filter((g) => allowedControl.has(g));
    const allowedPlanB = new Set(PLAN_B(state.subject));
    state.planBStrategies = state.planBStrategies.filter((g) => allowedPlanB.has(g));
  }

  function todayIso() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function socialFormOptions() {
    return C().SOCIAL_FORMS.map((sf) => {
      const locked = sf.unlockKey && !state.socialUnlock[sf.unlockKey];
      return {
        value: sf.id,
        label: locked ? `${sf.label} (Operator/Street Legend)` : sf.label,
        disabled: locked
      };
    });
  }

  function labelForSocialForm(id) {
    return C().SOCIAL_FORMS.find((s) => s.id === id)?.label || id || "–";
  }

  function levelLabel(value) {
    return state.levelOptions.find((o) => o.value === value)?.label || value || "–";
  }

  function pickedWhatGoal() {
    return state.whatGoalOptions.find((g) => String(g.id) === String(state.whatGoalId)) || null;
  }

  function normalizePracticeUrl(raw) {
    return String(raw ?? "").trim();
  }

  function isValidPracticeUrl(url) {
    const value = normalizePracticeUrl(url);
    if (!value) return false;
    try {
      const parsed = new URL(value);
      return (parsed.protocol === "http:" || parsed.protocol === "https:") && Boolean(parsed.hostname);
    } catch {
      return false;
    }
  }

  function goalPracticeMaterial(goal) {
    const material = goal?.material || null;
    const type = material?.type || goal?.materialType || (goal?.practiceUrl ? "url" : "none");
    const url = type === "url" ? material?.url || goal?.practiceUrl || "" : "";
    const label = String(material?.label || goal?.materialLabel || "").trim();
    const note = String(material?.note || goal?.materialNote || "").trim();
    const hasUrl = type === "url" && isValidPracticeUrl(url);
    const hasHint = (type === "reference" || type === "note") && !!(label || note);
    return {
      type: hasUrl ? "url" : hasHint ? type : "none",
      url: hasUrl ? url : "",
      label,
      note,
      hasUrl,
      hasHint,
      hasMaterial: hasUrl || hasHint
    };
  }

  function followPracticeUrl(practiceUrl) {
    const value = normalizePracticeUrl(practiceUrl);
    if (!isValidPracticeUrl(value)) return false;
    try {
      const parsed = value.startsWith("/") ? new URL(value, window.location.origin) : new URL(value);
      if (parsed.origin === window.location.origin) {
        const match = String(parsed.pathname + parsed.search + parsed.hash).match(
          /^\/student\/([a-z0-9-]+)/i
        );
        if (match && window.StudentRouter?.navigateToSection) {
          teardownPlanNextModal();
          state.afterSaveOpen = false;
          const sectionQuery = parsed.search ? new URLSearchParams(parsed.search) : null;
          window.StudentRouter.navigateToSection(match[1], { query: sectionQuery });
          return true;
        }
        window.location.assign(parsed.href);
        return true;
      }
      window.open(parsed.href, "_blank", "noopener,noreferrer");
      return true;
    } catch {
      return false;
    }
  }

  function lernstandQueryForGoal(goal) {
    const q = new URLSearchParams();
    if (state.subject) q.set("subject", state.subject);
    if (goal?.levelCheckId) q.set("thema", String(goal.levelCheckId));
    if (goal?.id) q.set("goal", String(goal.id));
    q.set("from", "plan");
    return q;
  }

  function goToLernstandFromPlan(goal) {
    teardownPlanNextModal();
    state.afterSaveOpen = false;
    window.StudentRouter?.navigateToSection("levelplan", { query: lernstandQueryForGoal(goal) });
  }

  function goToTodayFromPlan() {
    teardownPlanNextModal();
    state.afterSaveOpen = false;
    window.StudentRouter?.navigateToSection("today");
  }

  function teardownPlanNextModal() {
    document.querySelectorAll("body > .plan-next-modal-backdrop").forEach((el) => el.remove());
  }

  function portalPlanNextModal(root) {
    teardownPlanNextModal();
    root?.querySelectorAll(".plan-next-modal-backdrop").forEach((modal) => {
      document.body.appendChild(modal);
    });
    const after = document.querySelector("[data-plan-after-save]");
    if (!after) return;
    after.querySelectorAll("[data-plan-next]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const action = btn.dataset.planNext;
        const goal = pickedWhatGoal();
        if (action === "practice") {
          const material = goalPracticeMaterial(goal);
          if (!followPracticeUrl(material.url)) {
            goToLernstandFromPlan(goal);
          }
          return;
        }
        if (action === "levelplan") {
          goToLernstandFromPlan(goal);
          return;
        }
        goToTodayFromPlan();
      });
    });
    after.querySelector("[data-plan-next]")?.focus();
  }

  function renderAfterSaveModal() {
    // Nach Speichern geht’s direkt zu Mein Tag – kein Lernstand-/Üben-Dialog mehr.
    return "";
  }

  function levelGoalTextFor(goal, level) {
    if (!goal || !level) return "";
    if (level === "rookie") return String(goal.rookieGoalText || "").trim();
    if (level === "operator") return String(goal.operatorGoalText || "").trim();
    if (level === "street_legend") return String(goal.streetLegendGoalText || "").trim();
    return "";
  }

  function levelMeaningLabel(level) {
    if (level) return "Auf diesem Level heißt das:";
    return "Das bedeutet:";
  }

  function howGoalsForLevel(level, baseList) {
    const all = Array.isArray(baseList) && baseList.length ? baseList : HOW_GOAL_OPTIONS;
    const preferred = level && HOW_GOAL_PREFERRED[level] ? HOW_GOAL_PREFERRED[level] : [];
    const orderedPreferred = preferred.filter((g) => all.includes(g));
    const rest = all.filter((g) => !orderedPreferred.includes(g));
    return orderedPreferred.length ? [...orderedPreferred, ...rest] : all;
  }

  function refreshHowGoals() {
    state.howGoals = howGoalsForLevel(state.selectedLevel, state.howGoalsBase);
    state.startGoals = state.startGoals.filter((g) => isAllowedStartGoal(g));
    state.howGoalText = joinMulti(state.startGoals);
  }

  function syncLevelGoalText() {
    const goal = pickedWhatGoal();
    state.whatGoalText = goal?.text || "";
    state.levelGoalText =
      levelGoalTextFor(goal, state.selectedLevel) ||
      (goal?.source === "group_role" ? String(goal.text || "").trim() : "");
  }

  /** Level nur intern fürs Speichern – keine Rookie/Operator/Street-Legend-Auswahl in der UI. */
  function ensureSilentLevel() {
    const goal = pickedWhatGoal();
    if (!goal) return false;
    if (state.selectedLevel) {
      syncLevelGoalText();
      if (state.levelGoalText) return true;
    }
    const order = (state.levelOptions || []).map((o) => o.value);
    const pick =
      order.find((l) => levelGoalTextFor(goal, l)) ||
      (goal.source === "group_role" ? "rookie" : null);
    if (!pick) return false;
    state.selectedLevel = pick;
    syncLevelGoalText();
    refreshHowGoals();
    return !!state.levelGoalText;
  }

  /** Solo: Was-Ziel = Levelplan-Texte ohne Rookie/Operator/Street-Legend-Label. */
  function wasZielTierOptions() {
    const goal = pickedWhatGoal();
    if (!goal) return [];
    return (state.levelOptions || [])
      .map((o) => ({
        value: o.value,
        label: levelGoalTextFor(goal, o.value)
      }))
      .filter((o) => o.label);
  }

  function checkpointSatisfied() {
    if (!state.checkpoints.length) return true;
    if (state.checkpoints.length === 1) return true;
    return !!state.selectedCheckpointId;
  }

  function isSharedGroupDevice() {
    const gc = state.groupContext;
    return !!(gc?.enabled && gc.hasGroup && String(gc.deviceMode || "shared") !== "personal");
  }

  /** Kurze Kartenzeile – DB-Texte können länger sein. */
  function shortRoleDescription(text) {
    const raw = String(text || "")
      .replace(/\s+/g, " ")
      .trim();
    if (!raw) return "";
    const known = {
      "Du bereitest Versuche vor und führst sie sicher durch.": "Versuche vorbereiten & durchführen",
      "Du hältst Aufbau, Beobachtungen, Bilder und Ergebnisse fest.": "Aufbau & Beobachtungen notieren",
      "Du erklärst die physikalischen Zusammenhänge.": "Zusammenhänge erklären",
      "Du planst, baust, prüfst und verbesserst das Produkt.": "Produkt planen & bauen"
    };
    if (known[raw]) return known[raw];
    if (raw.length <= 42) return raw;
    const cut = raw.slice(0, 40);
    const sp = cut.lastIndexOf(" ");
    return `${(sp > 20 ? cut.slice(0, sp) : cut).trim()}…`;
  }

  function groupMembers() {
    return (state.groupContext?.members || []).filter((m) => m && m.userId != null);
  }

  function memberRoleNames(member) {
    return (member?.roles || [])
      .map((r) => (typeof r === "string" ? r : r?.name))
      .filter(Boolean);
  }

  function memberRoleIds(member) {
    return new Set(
      (member?.roles || [])
        .map((r) => (typeof r === "string" ? null : r?.id))
        .filter(Boolean)
        .map(String)
    );
  }

  function memberHasRole(member) {
    return memberRoleNames(member).length > 0 || memberRoleIds(member).size > 0;
  }

  function pendingPlanMembers() {
    return groupMembers().filter((m) => !memberHasPlan(m));
  }

  /** Shared-Tablet: noch nicht alle Tagesziele – kein Abschluss, Person wählen. */
  function sharedPlanPhaseActive(params) {
    if (!isSharedGroupDevice()) return false;
    if (params?.get?.("entryId")) return false;
    return pendingPlanMembers().length > 0;
  }

  function resolveSharedPlanTargetId(params) {
    const pending = pendingPlanMembers();
    if (!pending.length) return null;
    const urlFor = params?.get?.("forUserId");
    if (urlFor && pending.some((m) => Number(m.userId) === Number(urlFor))) {
      return Number(urlFor);
    }
    const cur = Number(state.handoffUserId);
    if (Number.isFinite(cur) && pending.some((m) => Number(m.userId) === cur)) {
      return cur;
    }
    return Number(pending[0].userId);
  }

  function syncHandoffMember() {
    const gc = state.groupContext;
    if (!gc?.enabled || !gc.hasGroup || !isSharedGroupDevice()) {
      state.handoffUserId = null;
      return null;
    }
    const members = groupMembers();
    if (!members.length) {
      state.handoffUserId = null;
      return null;
    }
    const pending = pendingPlanMembers();
    const current = members.find((m) => Number(m.userId) === Number(state.handoffUserId));
    // Person mit Ziel, aber andere fehlen noch → nächste ohne Ziel (nicht beim Login hängen bleiben)
    if (pending.length && current && memberHasPlan(current)) {
      state.handoffUserId = Number(pending[0].userId);
      return pending[0];
    }
    if (current && !memberHasPlan(current)) return current;
    if (pending.length) {
      state.handoffUserId = Number(pending[0].userId);
      return pending[0];
    }
    if (current) return current;
    const me = members.find((m) => m.isMe) || members[0];
    state.handoffUserId = me ? Number(me.userId) : null;
    return me || null;
  }

  /** Formular für die nächste Person am Shared-Tablet leeren (kein Edit des Vorherigen). */
  function resetPlanFormForHandoff() {
    state.editingEntryId = null;
    state.entryId = null;
    state.existingEntry = null;
    state.whatGoalId = null;
    state.roleGoalId = null;
    state._editRoleGoalText = "";
    state.whatGoalText = "";
    state.selectedLevel = null;
    state.levelGoalText = "";
    state.startGoals = [];
    state.howGoalText = null;
    state.controlGoals = [];
    state.workGoals = [];
    state.planBStrategies = [];
    state.confidenceBefore = null;
    state.detailsText = "";
    state.selectedCheckpointId = null;
    state.activeStep = 1;
    state.planBAcknowledged = false;
    state.step3Skipped = false;
    state.suggestion = null;
    state.suggestionApplied = false;
    state.errorMsg = "";
    state.afterSaveOpen = false;
  }

  function currentHandoffMember() {
    if (!isSharedGroupDevice()) {
      return groupMembers().find((m) => m.isMe) || null;
    }
    return syncHandoffMember();
  }

  function planningTargetRoles() {
    if (isSharedGroupDevice()) {
      const handoff = currentHandoffMember();
      if (handoff) {
        const ids = [...memberRoleIds(handoff)];
        const names = memberRoleNames(handoff);
        if (ids.length || names.length) {
          return ids.map((id, i) => ({ id, name: names[i] || "" }));
        }
      }
    }
    return state.groupContext?.myRoles || [];
  }

  function groupRoleComplete() {
    const gc = state.groupContext;
    if (!gc?.enabled || !gc.hasGroup || gc.needsSetup) return true;
    const available = gc.availableRoles || [];
    if (!available.length) return true;
    if (isSharedGroupDevice()) {
      const handoff = currentHandoffMember();
      return !!(handoff && memberHasRole(handoff));
    }
    return (gc.myRoles || []).length > 0;
  }

  /** Gewählte Gruppenrolle(n) der planenden Person – für Zusammenfassung & Abschluss. */
  function groupRoleSummary() {
    const gc = state.groupContext;
    if (!gc?.enabled || !gc.hasGroup || gc.needsSetup) return null;
    const names = planningTargetRoles()
      .map((r) => String(r?.name || "").trim())
      .filter(Boolean);
    if (!names.length) return null;
    const handoff = isSharedGroupDevice() ? currentHandoffMember() : null;
    return {
      roleText: names.join(", "),
      person: handoff?.displayName || ""
    };
  }

  /** Gruppenarbeit: nach Unterthema zusätzlich ein Was-Ziel zur eigenen Rolle. */
  function roleGoalRequired() {
    return (state.roleWasGoalOptions || []).length > 0;
  }

  function selectedRoleGoal() {
    return (
      (state.roleWasGoalOptions || []).find((g) => String(g.id) === String(state.roleGoalId)) ||
      null
    );
  }

  function roleGoalSatisfied() {
    return !roleGoalRequired() || !!selectedRoleGoal();
  }

  /** Abfolge: (Gruppe: Rolle) → Unterthema → Was-Ziel → Arbeit → Kontrolle → Plan B → Selbstcheck */
  function whatStepComplete() {
    return !!(
      groupRoleComplete() &&
      state.subject &&
      state.whatGoalId &&
      checkpointSatisfied() &&
      state.whatGoalOptions.length
    );
  }

  function wasZielStepComplete() {
    if (!whatStepComplete() || !roleGoalSatisfied()) return false;
    if (roleGoalRequired()) return ensureSilentLevel();
    return !!(state.selectedLevel && state.levelGoalText);
  }

  function levelStepComplete() {
    return wasZielStepComplete();
  }

  function startStepComplete() {
    return true;
  }

  function workStepComplete() {
    return state.workGoals.length >= 1 && state.workGoals.length <= 3;
  }

  function controlStepComplete() {
    return state.controlGoals.length >= 1 && state.controlGoals.length <= 3;
  }

  function planBStepComplete() {
    return !!state.planBAcknowledged;
  }

  function confidenceStepComplete() {
    return state.confidenceBefore != null || state.step3Skipped;
  }

  function step1Complete() {
    return whatStepComplete() && wasZielStepComplete();
  }

  function step2Complete() {
    return workStepComplete() && controlStepComplete();
  }

  function step3Complete() {
    return confidenceStepComplete();
  }

  function syncActiveStep() {
    if (state.activeStep >= 2 && !whatStepComplete()) {
      state.activeStep = 1;
      return;
    }
    if (state.activeStep >= 3 && !wasZielStepComplete()) {
      state.activeStep = 2;
      return;
    }
    if (state.activeStep >= 4 && !workStepComplete()) {
      state.activeStep = 3;
      return;
    }
    if (state.activeStep >= 5 && !controlStepComplete()) {
      state.activeStep = 4;
      return;
    }
    if (state.activeStep >= 6 && !planBStepComplete()) {
      state.activeStep = 5;
      return;
    }
    // Auto: nach Unterthema zum Was-Ziel; Mehrfachauswahl braucht „Weiter“
    if (state.activeStep === 1 && whatStepComplete()) state.activeStep = 2;
    else if (state.activeStep === 6 && confidenceStepComplete()) state.activeStep = 7;
  }

  function openStep(step) {
    state.activeStep = Number(step);
    render();
  }

  function whatStepSummary() {
    const parts = [];
    if (state.subject) parts.push(state.subject);
    const gr = groupRoleSummary();
    if (gr) parts.push(`Gruppenrolle: ${gr.roleText}`);
    if (state.whatGoalText) parts.push(state.whatGoalText);
    const rg = selectedRoleGoal();
    if (rg) parts.push(`Rolle: ${rg.text}`);
    return parts.join(" · ") || "Noch offen";
  }

  function levelStepSummary() {
    return state.selectedLevel ? levelLabel(state.selectedLevel) : "Noch offen";
  }

  function startStepSummary() {
    return state.startGoals.length ? state.startGoals.join(" · ") : "Noch offen";
  }

  function workStepSummary() {
    return state.workGoals.length
      ? state.workGoals.map((g) => arbeitTile(g).title).join(" · ")
      : "Noch offen";
  }

  function controlStepSummary() {
    return state.controlGoals.length
      ? state.controlGoals.map((g) => controlLabel(g)).join(" · ")
      : "Noch offen";
  }

  function planBStepSummary() {
    if (!state.planBAcknowledged) return "Noch offen";
    if (!state.planBStrategies.length) return "Ohne Plan B";
    return joinMulti(state.planBStrategies);
  }

  function step1Summary() {
    return [whatStepSummary(), levelStepSummary()].filter((p) => p !== "Noch offen").join(" · ") || "Noch offen";
  }

  function step2Summary() {
    const parts = [
      ...state.startGoals.slice(0, 1),
      ...state.workGoals.slice(0, 2).map((g) => arbeitTile(g).title),
      ...state.controlGoals.slice(0, 1).map((g) => controlLabel(g))
    ].filter(Boolean);
    return parts.length ? parts.join(" · ") : "Noch offen";
  }

  function step3Summary() {
    if (state.confidenceBefore != null) return `${state.confidenceBefore} / 5`;
    if (state.step3Skipped) return "Übersprungen";
    return "Noch offen";
  }

  function continueRow(id, label, enabled = true) {
    return `<div class="plan-acc__continue">
      <button type="button" class="today-app-btn" id="${id}" ${enabled ? "" : "disabled"}>${label}</button>
    </div>`;
  }

  function renderAskProgress(step, total = PLAN_ASK_STEPS) {
    const current = Math.min(step, total);
    return `<div class="plan-ask__progress" role="navigation" aria-label="Schritte">
      ${Array.from({ length: total }, (_, i) => {
        const n = i + 1;
        const done = n < current || step > total;
        const isCurrent = n === current && step <= total;
        const locked = n > current;
        return `<button type="button" class="plan-ask__dot${done ? " is-done" : ""}${isCurrent ? " is-current" : ""}" data-plan-open="${n}" ${locked ? "disabled" : ""} aria-label="Schritt ${n}"></button>`;
      }).join("")}
    </div>`;
  }

  function renderStepPopup({ step, title, hint, body, showBack = true }) {
    const ui = UI();
    return `
      <div class="plan-next-modal-backdrop plan-next-modal-backdrop--ask" role="dialog" aria-modal="true" aria-label="${title}">
        <div class="plan-next-modal plan-next-modal--ask">
          ${renderAskProgress(step)}
          <p class="plan-next-modal__kicker">Schritt ${step} von ${PLAN_ASK_STEPS}</p>
          <h3 class="plan-next-modal__title">${title}</h3>
          ${hint ? `<p class="plan-next-modal__text">${hint}</p>` : ""}
          ${state.errorMsg ? `<p class="plan-next-modal__text" style="color:#fca5a5">${ui.escapeHtml(state.errorMsg)}</p>` : ""}
          <div class="plan-ask__body">${body}</div>
          <div class="plan-next-modal__actions">
            ${
              showBack
                ? `<button type="button" class="logbuch-btn-ghost today-app-btn today-app-btn--ghost" id="planAskBack">Zurück</button>`
                : `<button type="button" class="logbuch-btn-ghost today-app-btn today-app-btn--ghost" id="planBackBtn">Abbrechen</button>`
            }
          </div>
        </div>
      </div>`;
  }

  function renderMissionPopup(ui, missionReady) {
    return `
      <div class="plan-next-modal-backdrop plan-next-modal-backdrop--ask" role="dialog" aria-modal="true" aria-label="Meine Mission heute">
        <div class="plan-next-modal plan-next-modal--ask">
          ${renderAskProgress(PLAN_ASK_STEPS + 1)}
          <p class="plan-next-modal__kicker">Bereit</p>
          <h3 class="plan-next-modal__title">Meine Mission heute</h3>
          <p class="plan-next-modal__text">Prüfe kurz, dann speichern – danach geht’s weiter zum Üben.</p>
          <div id="planSummaryCard">${renderPlanSummaryContent(ui)}</div>
          ${state.errorMsg ? ui.msg(state.errorMsg) : ""}
          <div class="plan-next-modal__actions">
            <button type="button" class="btn-primary logbuch-submit today-app-btn" id="planSubmitBtn" ${
              state.submitting ? "disabled" : ""
            }>${
              state.submitting
                ? "Speichern…"
                : state.editingEntryId
                  ? "Änderungen speichern"
                  : "Tagesziel speichern (+2 XP)"
            }</button>
            ${
              !missionReady && !state.submitting
                ? `<p class="plan-next-modal__text" style="color:#fcd34d;margin:0">Noch etwas fehlt – Speichern zeigt dir was.</p>`
                : ""
            }
            <button type="button" class="logbuch-btn-ghost today-app-btn today-app-btn--ghost" id="planAskBack">Zurück</button>
          </div>
        </div>
      </div>`;
  }

  function renderAccordionStep(step, title, summary, bodyHtml, opts = {}) {
    const isOpen = state.activeStep === step;
    const isDone = !!opts.done;
    const canOpen = opts.canOpen !== false;
    const statusClass = isOpen ? "is-open" : isDone ? "is-done" : "is-locked";

    return `
      <article class="plan-acc ${statusClass}" data-plan-step="${step}">
        <button
          type="button"
          class="plan-acc__header"
          data-plan-open="${step}"
          ${!canOpen && !isOpen ? "disabled" : ""}
          aria-expanded="${isOpen ? "true" : "false"}"
        >
          <span class="plan-acc__step ${isDone && !isOpen ? "is-done" : ""}">${
            isDone && !isOpen ? "✓" : step
          }</span>
          <span class="plan-acc__titles">
            <span class="plan-acc__title">${title}</span>
            ${
              !isOpen
                ? `<span class="plan-acc__summary">${summary}</span>`
                : `<span class="plan-acc__hint">${opts.hint || "Jetzt ausfüllen"}</span>`
            }
          </span>
          <span class="plan-acc__chevron" aria-hidden="true">${isOpen ? "▾" : "▸"}</span>
        </button>
        ${isOpen ? `<div class="plan-acc__body">${bodyHtml}</div>` : ""}
      </article>`;
  }

  function renderSuggestionBanner(ui) {
    const s = state.suggestion;
    if (!s || state.editingEntryId || state.existingEntry) return "";
    if (state.suggestionApplied) {
      return `
        <div class="plan-suggest plan-suggest--on">
          <p><strong>Vorschlag übernommen</strong> – aus deiner letzten Reflexion in ${ui.escapeHtml(s.subject)}. Du kannst alles noch ändern.</p>
        </div>`;
    }
    return `
      <div class="plan-suggest">
        <div class="plan-suggest__copy">
          <p class="plan-suggest__eyebrow">Aus deiner letzten Reflexion</p>
          <p class="plan-suggest__text">
            ${ui.escapeHtml(s.whatGoalText || "Dein letztes Ziel")}
            ${s.nextStepLabel ? ` → <strong>${ui.escapeHtml(s.nextStepLabel)}</strong>` : ""}
          </p>
        </div>
        <div class="plan-suggest__actions">
          <button type="button" class="today-app-btn" id="planApplySuggestion">Übernehmen</button>
          <button type="button" class="today-app-btn today-app-btn--ghost" id="planDismissSuggestion">Neu starten</button>
        </div>
      </div>`;
  }

  function applySuggestion() {
    const s = state.suggestion;
    if (!s) return;
    if (s.whatGoalId && state.whatGoalOptions.some((g) => String(g.id) === String(s.whatGoalId))) {
      state.whatGoalId = s.whatGoalId;
    }
    if (s.selectedLevel) state.selectedLevel = s.selectedLevel;
    syncLevelGoalText();
    refreshHowGoals();
    if (s.detailsHint) state.detailsText = s.detailsHint.slice(0, 100);
    state.suggestionApplied = true;
    syncActiveStep();
    render();
  }

  function renderMeinWegZumZiel(ui) {
    const V = window.LogbuchVisuals;
    if (!V || !state.whatGoalId || !state.selectedLevel) return "";

    return `
      <div class="way-to-goal">
        <p class="way-to-goal__intro">Wähle aus, <strong>wie</strong> du heute arbeiten willst.</p>
        ${renderStartSection(ui)}
        ${renderWorkSection(ui)}
        ${renderControlSection(ui)}
        ${renderPlanBSection(ui)}
      </div>`;
  }

  function renderStartSection(ui) {
    const V = window.LogbuchVisuals;
    if (!V) return "";
    return `
      <section class="way-section way-section--start way-section--embedded">
        <header class="way-section__head">
          <h4 class="way-section__title">Ich starte so</h4>
          <p class="way-section__hint">1 bis 3 Auswahlen</p>
        </header>
        <p class="way-to-goal__intro">Wähle aus, wie du heute starten willst.</p>
        ${V.strategyTileGrid(startGoalTiles(), state.startGoals, "data-start-goal", { multi: true, max: 3 })}
      </section>`;
  }

  function renderWorkSection(ui) {
    const V = window.LogbuchVisuals;
    if (!V) return "";
    return `
      <section class="way-section way-section--work way-section--embedded">
        <header class="way-section__head">
          <h4 class="way-section__title">Ich arbeite so</h4>
          <p class="way-section__hint">1 bis 3 Karten</p>
        </header>
        <p class="way-to-goal__intro">Wie willst du während der Stunde arbeiten?</p>
        ${V.strategyTileGrid(arbeitGoalTiles(), state.workGoals, "data-work-goal", { multi: true, max: 3 })}
      </section>`;
  }

  /** Kompakte Personenwahl – auf jedem Schritt im Ein-Tablet-Modus. */
  function renderSharedHandoffStrip(ui) {
    if (!isSharedGroupDevice() || !state.groupContext?.hasGroup) return "";
    const members = groupMembers();
    if (members.length < 2) return "";
    const handoff = currentHandoffMember();
    return `
      <div class="plan-handoff-strip" role="group" aria-label="Person am Tablet">
        <p class="plan-handoff-strip__label">Am Tablet</p>
        <div class="plan-handoff-strip__row">
          ${members
            .map((m) => {
              const active = Number(m.userId) === Number(state.handoffUserId);
              const done = memberHasPlan(m);
              return `<button type="button" class="plan-handoff-strip__btn${active ? " is-active" : ""}${
                done ? " is-done" : ""
              }" data-plan-handoff="${ui.escapeHtml(String(m.userId))}" aria-pressed="${
                active ? "true" : "false"
              }">${ui.escapeHtml(m.displayName || "Person")}${done ? " ✓" : ""}</button>`;
            })
            .join("")}
        </div>
        <p class="plan-handoff-strip__hint">Andere Person tippen = Tablet weitergeben</p>
      </div>
      <style>
        .plan-handoff-strip{margin:0 0 14px;padding:12px;border-radius:14px;border:1px solid rgba(34,211,238,.45);background:rgba(8,47,73,.55)}
        .plan-handoff-strip__label{margin:0 0 8px;font-size:.72rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#67e8f9}
        .plan-handoff-strip__row{display:flex;flex-wrap:wrap;gap:8px}
        .plan-handoff-strip__btn{min-height:44px;padding:8px 14px;border-radius:12px;border:2px solid rgba(148,163,184,.4);background:rgba(15,23,42,.45);color:#cbd5e1;font-weight:800;font-size:.95rem;cursor:pointer}
        .plan-handoff-strip__btn.is-active{border-color:#22d3ee;background:linear-gradient(145deg,rgba(14,116,144,.95),rgba(8,47,73,.98));color:#fff;box-shadow:0 0 0 2px rgba(34,211,238,.3)}
        .plan-handoff-strip__btn.is-done:not(.is-active){border-color:rgba(52,211,153,.55);color:#a7f3d0}
        .plan-handoff-strip__hint{margin:8px 0 0;font-size:.78rem;color:#94a3b8}
      </style>`;
  }

  function renderControlSection(ui) {
    const V = window.LogbuchVisuals;
    if (!V) return "";
    const isPhysik = subjectKey() === "physik";
    return `
      <section class="way-section way-section--control way-section--embedded">
        <header class="way-section__head">
          <h4 class="way-section__title">Ich kontrolliere so</h4>
          <p class="way-section__hint">1 bis 3 Auswahlen</p>
        </header>
        <p class="way-to-goal__intro">${
          isPhysik
            ? "Woran merkst du, dass Versuch und Vermutung zusammenpassen?"
            : "Woran merkst du, dass du auf dem Weg bist?"
        }</p>
        ${V.strategyTileGrid(controlGoalTiles(), state.controlGoals, "data-control-goal", { multi: true, max: 3 })}
      </section>`;
  }

  function renderPlanBSection(ui) {
    const V = window.LogbuchVisuals;
    if (!V) return "";
    const isPhysik = subjectKey() === "physik";
    return `
      <section class="way-section way-section--planb way-section--embedded">
        <header class="way-section__head">
          <h4 class="way-section__title">Plan B, wenn ich hänge</h4>
          <p class="way-section__hint">bis 3 Auswahlen · optional</p>
        </header>
        <p class="way-to-goal__intro">${
          isPhysik
            ? "Hilfekarten, Partner oder Versuch neu ansetzen?"
            : "Was machst du, wenn du feststeckst?"
        }</p>
        ${V.strategyTileGrid(planBTilesAll(), state.planBStrategies, "data-plan-b", { multi: true, max: 3 })}
      </section>`;
  }

  function renderLevelTiles(ui) {
    const V = window.LogbuchVisuals;
    if (!V || !state.whatGoalId) return "";
    const tiles = state.levelOptions.map((o) => ({
      value: o.value,
      ...(LEVEL_TILE_META[o.value] || {
        title: o.label,
        desc: "Level wählen",
        icon: "◆",
        accent: "#a855f7"
      })
    }));
    return ui.fieldWrap(
      ui.fieldLabel("Auf welchem Level arbeitest du?", { required: true }),
      `<div class="level-tile-grid">${V.strategyTileGrid(tiles, state.selectedLevel, "data-level")}</div>`
    );
  }

  function renderStrategyLoadout(ui) {
    return renderMeinWegZumZiel(ui);
  }

  function renderConfidenceCards(ui) {
    const V = window.LogbuchVisuals;
    if (!V) return "";
    return ui.fieldWrap(
      ui.fieldLabel("Wie sicher fühlst du dich vorher?", { optional: true }),
      V.confidenceSelector(
        [
          { value: 1, label: "Unsicher", icon: "◎", accent: "#f472b6" },
          { value: 2, label: "Eher unsicher", icon: "◔", accent: "#22d3ee" },
          { value: 3, label: "Mittel", icon: "◑", accent: "#a855f7" },
          { value: 4, label: "Sicher", icon: "◕", accent: "#22d3ee" },
          { value: 5, label: "Sehr sicher", icon: "●", accent: "#22c55e" }
        ],
        state.confidenceBefore
      )
    );
  }

  function renderSocialTiles(ui) {
    const V = window.LogbuchVisuals;
    if (!V) return "";
    const tiles = socialFormOptions().map((opt) => ({
      value: opt.value,
      title: opt.label.replace(" (Operator/Street Legend)", ""),
      desc: opt.disabled ? "Noch gesperrt" : "Sozialform wählen",
      icon: "◉",
      accent: "#a855f7",
      disabled: opt.disabled
    }));
    return ui.fieldWrap(
      ui.fieldLabel("Sozialform", { optional: true }),
      V.strategyTileGrid(
        tiles.filter((t) => !t.disabled),
        state.socialForm,
        "data-social-form"
      )
    );
  }

  function overviewTitles(raw, allowed, tileFn) {
    const parts = parseMulti(raw, allowed);
    if (parts.length) return parts.map((p) => tileFn(p).title);
    const text = String(raw || "").trim();
    return text ? [text] : [];
  }

  function overviewTileHtml(ui, { label, value, chips, accent, wide }) {
    const hasChips = Array.isArray(chips) && chips.length;
    const text = String(value || "").trim();
    if (!hasChips && !text) return "";
    return `
      <article class="plan-overview-tile${wide ? " plan-overview-tile--wide" : ""}" style="--accent:${accent || "#22d3ee"}">
        <p class="plan-overview-tile__label">${ui.escapeHtml(label)}</p>
        ${
          hasChips
            ? `<div class="plan-overview-tile__chips">${chips
                .map((c) => `<span class="plan-overview-chip">${ui.escapeHtml(c)}</span>`)
                .join("")}</div>`
            : `<p class="plan-overview-tile__value">${ui.escapeHtml(text)}</p>`
        }
      </article>`;
  }

  function renderReadonlyHero(ui, dateLabel, entry) {
    const chips = [dateLabel, entry.timeslot, entry.subject].filter(Boolean);
    return `
      <article class="plan-app-hero plan-app-hero--compact plan-app-hero--plan">
        <div class="plan-app-hero__content">
          <div class="plan-app-hero__icon" aria-hidden="true">
            <img src="/icons/student/png/zielsetzung.png" alt="" aria-hidden="true">
          </div>
          <div class="plan-app-hero__copy">
            <p class="plan-app-hero__eyebrow">Abgeschlossen · nur Ansicht</p>
            <h2 class="plan-app-hero__title">Dein Tagesziel</h2>
            <p class="plan-app-hero__meta">Nach dem Tagesabschluss festgehalten – nicht mehr änderbar.</p>
            ${
              chips.length
                ? `<div class="plan-app-hero__chips">${chips
                    .map((c) => `<span class="plan-app-hero__chip">${ui.escapeHtml(c)}</span>`)
                    .join("")}</div>`
                : ""
            }
          </div>
        </div>
        <div class="plan-app-hero__visual" aria-hidden="true">
          <img src="/icons/student/hero/zielsetzung-hero.png?v=6" alt="" aria-hidden="true" loading="lazy">
        </div>
      </article>`;
  }

  function renderExistingEntry(ui, dateLabel) {
    const e = state.existingEntry;
    const workGoals = Array.isArray(e.work_goals) ? e.work_goals : [];
    const workTitles = workGoals.map((g) => arbeitTile(g).title);
    const planBTitles = overviewTitles(e.plan_b_strategy_text, PLAN_B_ALL(), planBTile);
    const controlAllowed = allControlTiles().map((t) => t.value);
    const controlTitles = overviewTitles(e.strategy, controlAllowed, (value) => {
      const tile = allControlTiles().find((t) => t.value === value);
      return tile || { title: controlLabel(value) };
    });
    const details = String(e.details_text || e.freitext || "").trim();
    const mission = e.level_goal_text || "";

    const factTiles = [
      overviewTileHtml(ui, { label: "Fach", value: e.subject, accent: "#22d3ee" }),
      overviewTileHtml(ui, { label: "Unterthema", value: e.what_goal_text, accent: "#38bdf8" }),
      ...(e.role_goal_text
        ? [
            overviewTileHtml(ui, {
              label: e.role_goal_role_name ? `Was-Ziel (${e.role_goal_role_name})` : "Was-Ziel zur Rolle",
              value: e.role_goal_text,
              accent: "#a78bfa"
            })
          ]
        : mission
          ? [
              overviewTileHtml(ui, {
                label: "Was-Ziel",
                value: mission,
                accent: "#a78bfa"
              })
            ]
          : []),
      overviewTileHtml(ui, {
        label: "Nachweis",
        value: e.checkpoint_title || "Kein kommender Nachweis",
        accent: "#f59e0b"
      })
    ]
      .filter(Boolean)
      .join("");

    const pathTiles = [
      overviewTileHtml(ui, { label: "Arbeit", chips: workTitles, accent: "#a855f7" }),
      overviewTileHtml(ui, { label: "Kontrolle", chips: controlTitles, accent: "#38bdf8" }),
      overviewTileHtml(ui, { label: "Plan B", chips: planBTitles, accent: "#f59e0b" }),
      overviewTileHtml(ui, {
        label: "Sozialform",
        value: e.social_form ? labelForSocialForm(e.social_form) : "",
        accent: "#c084fc"
      }),
      overviewTileHtml(ui, {
        label: "Sicherheit vorher",
        value: e.confidence_before != null ? `${e.confidence_before} / 5` : "",
        accent: "#34d399"
      })
    ]
      .filter(Boolean)
      .join("");

    return `
      <div class="plan-overview">
        ${renderReadonlyHero(ui, dateLabel, e)}
        ${
          mission
            ? `<article class="plan-overview-mission">
                <p class="plan-overview-mission__kicker">Ich arbeite an diesem Ziel</p>
                <h3 class="plan-overview-mission__title">${ui.escapeHtml(mission)}</h3>
                ${
                  details
                    ? `<p class="plan-overview-mission__detail">${ui.escapeHtml(details)}</p>`
                    : ""
                }
              </article>`
            : ""
        }
        ${factTiles ? `<div class="plan-overview-grid">${factTiles}</div>` : ""}
        ${
          pathTiles
            ? `<section class="plan-overview-path">
                <p class="plan-overview-path__title">Dein Weg</p>
                <div class="plan-overview-grid plan-overview-grid--path">${pathTiles}</div>
              </section>`
            : ""
        }
        ${ui.btnGhost("Zurück zu Mein Tag", "planBackBtn", "today-app-btn today-app-btn--ghost")}
      </div>`;
  }

  function pickedCheckpoint() {
    if (!state.checkpoints.length) return state.nextCheckpoint;
    return (
      state.checkpoints.find((c) => String(c.id) === String(state.selectedCheckpointId)) ||
      state.nextCheckpoint
    );
  }

  function renderGoalStepCard(step, title, bodyHtml, wide = false) {
    return `
      <article class="goal-step-card ${wide ? "goal-step-card--wide" : ""}">
        <header class="goal-step-card__head">
          <span class="goal-step-card__step">${step}</span>
          <h3 class="goal-step-card__title">${title}</h3>
        </header>
        <div class="goal-step-card__body">${bodyHtml}</div>
      </article>`;
  }

  function renderLevelChips(ui) {
    return renderLevelTiles(ui);
  }

  function renderHowGoalChips(ui) {
    return "";
  }

  function renderSocialChips(ui) {
    return renderSocialTiles(ui);
  }

  function renderConfidenceSegments(ui) {
    return renderConfidenceCards(ui);
  }

  function renderPlanSummaryContent(ui) {
    if (!step1Complete() && !step2Complete()) {
      return `<p class="plan-summary-empty">Dein Ziel wächst hier mit – Schritt für Schritt.</p>`;
    }

    const arbeitLines = state.workGoals.map((goal) => {
      const tile = arbeitTile(goal);
      return tile.title;
    });

    const controlLines = state.controlGoals.map((g) => {
      const tile = allControlTiles().find((t) => t.value === g);
      return tile?.desc || `Ich kontrolliere: ${controlLabel(g)}`;
    });

    const wegLines = [
      ...arbeitLines.map((line) => `Ich arbeite: ${line}`),
      ...controlLines
    ].filter(Boolean);

    const groupRole = groupRoleSummary();
    return `
      <div class="mission-summary">
        ${
          groupRole
            ? `<div class="mission-summary__block">
          <p class="mission-summary__label">Meine Gruppenrolle</p>
          <p class="mission-summary__value"><strong>${ui.escapeHtml(groupRole.roleText)}</strong>${
            groupRole.person ? ` · ${ui.escapeHtml(groupRole.person)}` : ""
          }</p>
        </div>`
            : ""
        }
        ${
          state.subject
            ? `<div class="mission-summary__block">
          <p class="mission-summary__label">Fach${state.whatGoalText ? " · Unterthema" : ""}</p>
          <p class="mission-summary__value">${ui.escapeHtml(
            [state.subject, state.whatGoalText].filter(Boolean).join(" · ")
          )}</p>
        </div>`
            : ""
        }
        ${
          selectedRoleGoal()
            ? `<div class="mission-summary__block">
          <p class="mission-summary__label">Was-Ziel zur Rolle</p>
          <p class="mission-summary__value">${ui.escapeHtml(selectedRoleGoal().text)}</p>
        </div>`
            : state.levelGoalText
              ? `<div class="mission-summary__block">
          <p class="mission-summary__label">Was-Ziel</p>
          <p class="mission-summary__value">${ui.escapeHtml(state.levelGoalText)}</p>
        </div>`
              : ""
        }
        ${
          wegLines.length
            ? `<div class="mission-summary__block">
          <p class="mission-summary__label">Mein Weg zum Ziel</p>
          <ul class="mission-summary__list">
            ${wegLines.map((line) => `<li>${ui.escapeHtml(line)}</li>`).join("")}
          </ul>
        </div>`
            : ""
        }
        ${
          state.planBStrategies.length
            ? `<div class="mission-summary__block">
                <p class="mission-summary__label">Mein Plan B</p>
                <p class="mission-summary__value">${ui.escapeHtml(joinMulti(state.planBStrategies))}</p>
              </div>`
            : ""
        }
        ${
          state.confidenceBefore != null
            ? `<div class="mission-summary__block">
                <p class="mission-summary__label">Sicherheitsgefühl</p>
                <p class="mission-summary__value">${ui.escapeHtml(String(state.confidenceBefore))} / 5</p>
              </div>`
            : ""
        }
        <div class="mission-summary__reward">
          <span class="mission-summary__reward-label">Belohnung</span>
          <span class="mission-summary__reward-value">${state.editingEntryId ? "Kein zusätzliches XP" : "+2 XP"}</span>
        </div>
      </div>`;
  }

  function renderPlanHero(ui, dateLabel) {
    const chips = [
      dateLabel,
      state.timeslot,
      state.subject
    ].filter(Boolean);

    return `
      <article class="plan-app-hero plan-app-hero--compact plan-app-hero--plan">
        <div class="plan-app-hero__content">
          <div class="plan-app-hero__icon" aria-hidden="true">
            <img src="/icons/student/png/zielsetzung.png" alt="" aria-hidden="true">
          </div>
          <div class="plan-app-hero__copy">
            <p class="plan-app-hero__eyebrow">${
              isQuickGroup()
                ? "Gruppe · ein Tablet"
                : `Schritt ${Math.min(state.activeStep, PLAN_ASK_STEPS)} von ${PLAN_ASK_STEPS} · Planen`
            }</p>
            <h2 class="plan-app-hero__title">Tagesziel setzen</h2>
            <p class="plan-app-hero__meta">${
              isQuickGroup()
                ? "Kurz planen, Tablet weitergeben, los geht’s."
                : "Eine Frage nach der anderen – so bleibt der Fokus klar."
            }</p>
            ${
              chips.length
                ? `<div class="plan-app-hero__chips">${chips
                    .map((c) => `<span class="plan-app-hero__chip">${ui.escapeHtml(c)}</span>`)
                    .join("")}</div>`
                : ""
            }
          </div>
        </div>
        <div class="plan-app-hero__visual" aria-hidden="true">
          <img src="/icons/student/hero/zielsetzung-hero.png?v=6" alt="" aria-hidden="true" loading="lazy">
        </div>
        <nav class="phase-rail" aria-label="Lernschritte">
          <span class="phase-rail__item is-active">1 · Tagesziel</span>
          <span class="phase-rail__item">2 · Check</span>
          <span class="phase-rail__item">3 · Abschluss</span>
        </nav>
      </article>`;
  }

  function renderCheckpointField(ui) {
    if (!state.checkpoints.length) {
      const fallbackMsg =
        state.goalSource === "levelplan_fallback"
          ? `<div class="logbuch-msg logbuch-msg-info" style="margin-top:8px">Kein Nachweis geplant – du kannst ein Ziel aus dem Levelplan wählen.</div>`
          : "";
      return ui.fieldWrap(
        ui.fieldLabel("Nachweis"),
        `<div class="plan-subject-locked">Kein Nachweis geplant.</div>${fallbackMsg}`
      );
    }

    if (state.checkpoints.length === 1) {
      const cp = state.checkpoints[0];
      return ui.fieldWrap(
        ui.fieldLabel("Nachweis"),
        `<div class="plan-subject-locked">${ui.escapeHtml(cp.label)}</div>`
      );
    }

    return ui.fieldWrap(
      ui.fieldLabel("Für welchen Nachweis arbeitest du?", { required: true }),
      ui.select(
        "selectedCheckpointId",
        state.checkpoints.map((c) => ({ value: c.id, label: c.label })),
        state.selectedCheckpointId,
        { phase: "plan", placeholder: "Nachweis wählen…" }
      )
    );
  }

  function renderGroupContextBanner(ui) {
    const gc = state.groupContext;
    if (!gc?.enabled) return "";
    if (gc.needsSetup || !gc.hasGroup) {
      const params = new URLSearchParams({ subject: state.subject || gc.subject || "" });
      if (state.date) params.set("date", state.date);
      return `<div class="logbuch-msg logbuch-msg-info">
        Für dieses Fach ist Gruppenmodus an – bitte zuerst die <strong>Gruppe bilden</strong>.
        <button type="button" class="logbuch-link-btn" id="planGoGruppenmodus" data-query="${ui.escapeHtml(
          params.toString()
        )}">Zur Gruppenbildung</button>
      </div>`;
    }
    const names = (gc.members || [])
      .map((m) => m.displayName)
      .filter(Boolean)
      .join(", ");
    const shared = isSharedGroupDevice();
    const handoff = currentHandoffMember();
    const roles = planningTargetRoles()
      .map((r) => r.name)
      .filter(Boolean)
      .join(", ");
    return `<div class="logbuch-msg logbuch-msg-info">
      <strong>Gruppe</strong>${names ? `: ${ui.escapeHtml(names)}` : ""}.
      ${
        shared
          ? handoff
            ? ` Nacheinander am Tablet – jetzt: <strong>${ui.escapeHtml(handoff.displayName || "jemand")}</strong>.`
            : " Nacheinander am Tablet planen."
          : roles
            ? ` Rolle: <strong>${ui.escapeHtml(roles)}</strong>.`
            : " Als Nächstes: <strong>Rolle wählen</strong>."
      }
    </div>`;
  }

  function renderGroupRolePicker(ui) {
    const gc = state.groupContext;
    if (!gc?.enabled || !gc.hasGroup || gc.needsSetup) return "";
    const roles = gc.availableRoles || [];
    if (!roles.length) return "";
    const shared = isSharedGroupDevice();
    const handoff = currentHandoffMember();
    const activeIds = shared
      ? memberRoleIds(handoff)
      : new Set((gc.myRoles || []).map((r) => String(r.id)));
    const members = groupMembers();
    const handoffName = handoff?.displayName || "jemand";
    const doneCount = members.filter((m) => memberHasRole(m)).length;
    return `
      <style>
        .plan-group-roles{display:flex;flex-direction:column;gap:16px;margin:0 0 18px}
        .plan-group-nowbar{position:sticky;top:0;z-index:3;display:flex;align-items:center;justify-content:space-between;gap:10px;margin:0 0 2px;padding:10px 12px;border-radius:12px;border:2px solid rgba(34,211,238,.75);background:rgba(8,47,73,.96);box-shadow:0 8px 20px rgba(0,0,0,.35)}
        .plan-group-nowbar__label{margin:0;font-size:.72rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#67e8f9}
        .plan-group-nowbar__name{margin:2px 0 0;font-size:1.15rem;font-weight:800;color:#f8fafc;line-height:1.2}
        .plan-group-nowbar__meta{margin:0;font-size:.75rem;color:#94a3b8;white-space:nowrap}
        .plan-group-section{display:flex;flex-direction:column;gap:8px;padding:14px;border-radius:16px;border:1px solid rgba(148,163,184,.28);background:rgba(15,23,42,.55)}
        .plan-group-section--roles{border-color:rgba(56,189,248,.4);background:linear-gradient(160deg,rgba(8,47,73,.55),rgba(15,23,42,.5))}
        .plan-group-section__title{margin:0;font-size:.95rem;font-weight:800;color:#e2e8f0}
        .plan-group-section__hint{margin:0;font-size:.8rem;line-height:1.35;color:#94a3b8}
        .plan-group-member-grid{display:grid;gap:10px;grid-template-columns:repeat(auto-fill,minmax(148px,1fr))}
        .plan-group-member-card{position:relative;display:flex;flex-direction:column;align-items:flex-start;gap:4px;min-height:72px;padding:14px 14px 12px;border-radius:14px;border:2px solid rgba(148,163,184,.4);background:rgba(15,23,42,.35);color:#94a3b8;text-align:left;cursor:pointer;-webkit-tap-highlight-color:transparent}
        .plan-group-member-card__name{font-size:1rem;font-weight:800;color:#cbd5e1;line-height:1.2}
        .plan-group-member-card__role{font-size:.75rem;color:#64748b;line-height:1.25}
        .plan-group-member-card__badge{position:absolute;top:8px;right:8px;width:22px;height:22px;border-radius:999px;display:grid;place-items:center;font-size:.75rem;font-weight:800;background:rgba(15,23,42,.7);border:1px solid rgba(148,163,184,.35);color:#94a3b8}
        .plan-group-member-card:not(.is-active){opacity:.72}
        .plan-group-member-card.is-active{opacity:1;border-color:#22d3ee;background:linear-gradient(145deg,rgba(14,116,144,.95),rgba(8,47,73,.98));color:#ecfeff;box-shadow:0 0 0 2px rgba(34,211,238,.35),0 10px 24px rgba(0,0,0,.35);transform:scale(1.02)}
        .plan-group-member-card.is-active .plan-group-member-card__name{color:#fff;font-size:1.08rem}
        .plan-group-member-card.is-active .plan-group-member-card__role{color:#a5f3fc}
        .plan-group-member-card.is-active .plan-group-member-card__badge{background:#22d3ee;border-color:#67e8f9;color:#082f49}
        .plan-group-member-card.is-done:not(.is-active){border-color:rgba(52,211,153,.55);background:rgba(6,78,59,.28)}
        .plan-group-member-card.is-done:not(.is-active) .plan-group-member-card__name{color:#a7f3d0}
        .plan-group-member-card.is-done:not(.is-active) .plan-group-member-card__badge{border-color:rgba(52,211,153,.55);color:#6ee7b7}
        .plan-group-role-grid{display:grid;gap:8px;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));margin-top:2px}
        .plan-group-role-tile{display:grid;gap:4px;text-align:left;padding:12px;border-radius:12px;border:2px solid rgba(56,189,248,.35);background:rgba(8,47,73,.45);color:inherit;cursor:pointer}
        .plan-group-role-tile strong{font-size:.95rem}
        .plan-group-role-tile span,.plan-group-role-tile em{font-size:.8rem;color:#94a3b8;font-style:normal}
        .plan-group-role-tile.is-active{border-color:#22d3ee;box-shadow:0 0 0 2px rgba(34,211,238,.35);background:rgba(8,47,73,.85);color:#ecfeff}
        .plan-group-role-tile:disabled{opacity:.6;cursor:wait}
        .plan-group-topic-section{margin-top:4px;padding-top:14px;border-top:1px solid rgba(148,163,184,.22)}
      </style>
      <div class="plan-group-roles">
        ${
          shared
            ? `<div class="plan-group-nowbar" role="status" aria-live="polite">
                <div>
                  <p class="plan-group-nowbar__label">Wer ist jetzt dran?</p>
                  <p class="plan-group-nowbar__name">${ui.escapeHtml(handoffName)}</p>
                </div>
                <p class="plan-group-nowbar__meta">${doneCount}/${members.length} mit Rolle</p>
              </div>
              <section class="plan-group-section" aria-label="Person wählen">
                <p class="plan-group-section__title">1. Wer füllt jetzt aus?</p>
                <p class="plan-group-section__hint">Nach dem Speichern kommt der Hinweis zum Weitergeben.</p>
                <div class="plan-group-member-grid" role="group" aria-label="Gruppenteilnehmer">
                  ${members
                    .map((m) => {
                      const done = memberHasRole(m);
                      const active = Number(m.userId) === Number(state.handoffUserId);
                      const roleLabel = memberRoleNames(m).join(", ");
                      const name = m.displayName || "Person";
                      return `<button type="button"
                        class="plan-group-member-card ${active ? "is-active" : ""} ${done ? "is-done" : ""}"
                        data-plan-handoff="${ui.escapeHtml(String(m.userId))}"
                        aria-pressed="${active ? "true" : "false"}"
                        aria-label="${ui.escapeHtml(name)}${active ? " – jetzt dran" : ""}${done ? " – Rolle gewählt" : ""}">
                        <span class="plan-group-member-card__badge" aria-hidden="true">${active ? "✓" : done ? "●" : ""}</span>
                        <span class="plan-group-member-card__name">${ui.escapeHtml(name)}</span>
                        <span class="plan-group-member-card__role">${
                          active
                            ? "Jetzt am Tablet"
                            : roleLabel
                              ? ui.escapeHtml(roleLabel)
                              : "Noch keine Rolle"
                        }</span>
                      </button>`;
                    })
                    .join("")}
                </div>
              </section>`
            : ""
        }
        <section class="plan-group-section plan-group-section--roles" aria-label="Rolle wählen">
          <p class="plan-group-section__title">${
            shared ? `2. Rolle für ${ui.escapeHtml(handoffName)}` : "Gruppenrolle"
          } <span class="req">*</span></p>
          <p class="plan-group-section__hint">Gleiche Rolle für mehrere Personen ist ok.</p>
          <div class="plan-group-role-grid">
            ${roles
              .map((role) => {
                const active = activeIds.has(String(role.id));
                const holders = (role.holders || [])
                  .map((h) => h.displayName)
                  .filter(Boolean)
                  .join(", ");
                const desc = shortRoleDescription(role.description || role.name);
                return `
                <button type="button"
                  class="plan-group-role-tile ${active ? "is-active" : ""}"
                  data-plan-role-pick="${ui.escapeHtml(String(role.id))}"
                  data-claim="${active ? "0" : "1"}"
                  ${state.roleSaving ? "disabled" : ""}>
                  <strong>${ui.escapeHtml(role.name)}</strong>
                  ${desc ? `<span>${ui.escapeHtml(desc)}</span>` : ""}
                  <em>${
                    holders
                      ? ui.escapeHtml(holders)
                      : active
                        ? shared
                          ? "Gewählt"
                          : "Du"
                        : "Tippen"
                  }</em>
                </button>`;
              })
              .join("")}
          </div>
        </section>
      </div>`;
  }

  function renderRoleGoalField(ui) {
    if (!roleGoalRequired() || !groupRoleComplete()) return "";
    const roles = planningTargetRoles()
      .map((r) => r.name)
      .filter(Boolean);
    const multiRole = new Set(state.roleWasGoalOptions.map((g) => g.roleName).filter(Boolean)).size > 1;
    const label = roles.length === 1 ? `Was-Ziel für ${roles[0]}` : "Was-Ziel zu deiner Rolle";
    if (!state.whatGoalId) {
      return ui.fieldWrap(
        ui.fieldLabel(label, { required: true }),
        `<div class="plan-subject-locked">Erst Unterthema wählen.</div>`
      );
    }
    return ui.fieldWrap(
      ui.fieldLabel(label, { required: true }),
      ui.select(
        "roleGoalId",
        state.roleWasGoalOptions.map((g) => ({
          value: g.id,
          label: multiRole && g.roleName ? `${g.roleName}: ${g.text}` : g.text
        })),
        state.roleGoalId,
        { phase: "plan", placeholder: "Was-Ziel zur Rolle wählen…" }
      ),
      "Was übernimmst du in deiner Rolle in dieser Stunde?"
    );
  }

  /** Mehrere Themen im zugewiesenen Levelplan: Thema vor das Unterthema setzen. */
  function whatGoalSelectOptions() {
    const options = state.whatGoalOptions || [];
    const topicIds = new Set(
      options.map((g) => g.levelCheckId).filter((id) => id != null && id !== "")
    );
    const showTopic = topicIds.size > 1;
    return options.map((g) => ({
      value: g.id,
      label:
        showTopic && g.levelCheckName && g.source !== "group_role"
          ? `${g.levelCheckName} · ${g.text}`
          : g.text
    }));
  }

  function whatGoalMessage(ui) {
    if (state.whatGoalOptions.length) return "";
    if (state.goalSource === "checkpoint_empty") {
      return ui.msg("Für diesen Nachweis wurden noch keine Ziele hinterlegt.");
    }
    if (state.goalSource === "levelplan_fallback") {
      return ui.msg(
        "Kein kommender Nachweis gefunden. Wähle ein Ziel aus dem Levelplan."
      );
    }
    if (!state.hasClass) {
      return ui.msg("Dir ist noch keine Klasse zugeordnet.");
    }
    return ui.msg("Für dieses Fach wurden noch keine Ziele aus dem Levelplan importiert.");
  }

  function restoreRoleGoalSelection(entry) {
    const opts = state.roleWasGoalOptions || [];
    if (!opts.length) return;
    const entryId = entry?.role_goal_id ?? state.roleGoalId;
    if (entryId != null && opts.some((g) => String(g.id) === String(entryId))) {
      state.roleGoalId = entryId;
      return;
    }
    const text = String(entry?.role_goal_text || state._editRoleGoalText || "").trim();
    if (text) {
      const byText = opts.find((g) => String(g.text || "").trim() === text);
      if (byText) {
        state.roleGoalId = byText.id;
        return;
      }
    }
    if (opts.length === 1) state.roleGoalId = opts[0].id;
  }

  function applyEntryToForm(entry) {
    state.editingEntryId = entry.id;
    state.entryId = entry.id;
    state.subject = entry.subject;
    if (entry.timeslot) state.timeslot = entry.timeslot;
    state.whatGoalId = entry.what_goal_id;
    state.roleGoalId = entry.role_goal_id || null;
    state._editRoleGoalText = entry.role_goal_text || "";
    state.whatGoalText = entry.what_goal_text || "";
    state.selectedLevel = entry.selected_level;
    state.levelGoalText = entry.level_goal_text || "";

    const how = entry.how_goal_text || entry.goal || null;
    // Kein Allowlist-Filter auf HOW_GOAL_OPTIONS – sonst gehen Fach-Wie-Ziele verloren
    state.startGoals = parseMulti(how, null);
    if (!state.startGoals.length && how) {
      const trimmed = String(how).trim();
      if (trimmed) state.startGoals = [trimmed];
    }
    state.howGoalText = joinMulti(state.startGoals);

    const controlAllowed = allControlTiles().map((t) => t.value);
    state.controlGoals = parseMulti(entry.strategy, controlAllowed);
    if (!state.controlGoals.length && how) {
      const mapped = HOW_TO_CONTROL_STRATEGY[how];
      if (mapped) state.controlGoals = [mapped];
    }

    state.planBStrategies = parseMulti(entry.plan_b_strategy_text, PLAN_B_ALL());
    state.detailsText = entry.details_text || entry.freitext || "";
    state.workGoals = Array.isArray(entry.work_goals) ? entry.work_goals : [];
    state.socialForm = entry.social_form || null;
    state.confidenceBefore = entry.confidence_before ?? null;
    state.selectedCheckpointId = entry.checkpoint_id || null;
    state.existingEntry = null;
    refreshHowGoals();
  }

  /* ------------------------------------------------------------------
   * Shared-Tablet (ein Tablet): Schnell-Flow – ein kompakter Bildschirm
   * Person → Rolle → Thema → Ziel zur Rolle → Level → Start → Speichern.
   * Arbeiten/Kontrolle/Plan B bekommen sinnvolle Standardwerte.
   * ------------------------------------------------------------------ */

  const QUICK_START_MAX = 2;
  const QUICK_ROLE_PATTERNS = [
    {
      role: /versuch/i,
      keys: [/versuch/i, /aufbau|aufbauen/i, /durchführ|durchfuehr/i, /phänomen|phaenomen/i, /vermut|hypothes/i, /sicher/i],
      control: "Sicherheit und Aufbau prüfen"
    },
    {
      role: /protokoll/i,
      keys: [/protokoll/i, /notier|festhalt|aufschreib|dokument/i, /messwert|beobacht/i, /skizze|zeichn/i],
      control: "Beobachtung vs. Vermutung"
    },
    {
      role: /ergebnis/i,
      keys: [/ergebnis/i, /erklär|erklaer/i, /regel|ableit/i, /begründ|begruend|übertrag|uebertrag/i, /recherch/i, /phänomen|phaenomen/i],
      control: "Ergebnis erklären"
    },
    {
      role: /produkt/i,
      keys: [/produkt/i, /bau|konstru|modell|prototyp/i, /plan/i, /skizze|entwurf/i, /verbesser|optimier/i],
      control: "Versuchsplan checken"
    }
  ];
  const QUICK_LEVEL_PREFIX = /^\s*(rookie|operator|street[\s-]?legend)\b/i;

  /** Früherer Ein-Tablet-Quick-Pfad: absichtlich aus – normales App-Design + alle Schritte. */
  function isQuickGroup() {
    return false;
  }

  function memberHasPlan(member) {
    if (!member) return false;
    const uid = Number(member.userId);
    const fromCtx = groupMembers().find((m) => Number(m.userId) === uid);
    const serverFlag =
      fromCtx && typeof fromCtx.hasPlan === "boolean" ? fromCtx.hasPlan : !!member.hasPlan;
    return serverFlag || state.quickDoneIds.includes(uid);
  }

  /** Nächste Person (nach der aktuellen), die noch kein Tagesziel hat. */
  function nextPendingMember(currentUserId) {
    const members = groupMembers();
    const cur = Number(currentUserId);
    const idx = members.findIndex((m) => Number(m.userId) === cur);
    const ordered =
      idx >= 0
        ? members.slice(idx + 1).concat(members.slice(0, idx))
        : members.filter((m) => Number(m.userId) !== cur);
    return ordered.find((m) => !memberHasPlan(m)) || null;
  }

  function quickRolePatternFor() {
    const names = planningTargetRoles()
      .map((r) => r.name)
      .filter(Boolean)
      .join(" ");
    return QUICK_ROLE_PATTERNS.filter((p) => p.role.test(names));
  }

  /** 3–5 Start-Karten, passend zu Rolle und Level (statt aller Fach-Ziele). */
  function quickStartTiles() {
    const all = startGoalTiles();
    const lvl = state.selectedLevel;
    const levelOk = (t) => {
      const m = QUICK_LEVEL_PREFIX.exec(t.value);
      if (!m) return true;
      const key = m[1].toLowerCase().replace(/[\s-]+/g, "_");
      return !lvl || key === lvl;
    };
    const pool = all.filter(levelOk);

    const gc = state.groupContext;
    const roleIds = new Set(planningTargetRoles().map((r) => String(r.id)));
    const ownTexts = new Set();
    for (const r of gc?.availableRoles || []) {
      if (!roleIds.has(String(r.id))) continue;
      for (const g of r.howGoals || []) {
        const t = String(g.text || "").trim();
        if (t) ownTexts.add(t);
      }
    }
    const own = pool.filter((t) => ownTexts.has(t.value));

    const patterns = quickRolePatternFor();
    const scored = pool
      .filter((t) => !ownTexts.has(t.value))
      .map((t, i) => {
        let score = 0;
        for (const p of patterns) {
          for (const k of p.keys) if (k.test(t.value)) score += 1;
        }
        if (/meiner rolle|meinen teil/i.test(t.value)) score += 0.5;
        return { t, i, score };
      });
    const matched = scored
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score || a.i - b.i)
      .map((s) => s.t);

    const out = [...own, ...matched].slice(0, Math.max(4, own.length));
    if (out.length < 3) {
      for (const s of scored) {
        if (out.length >= 3) break;
        if (!out.includes(s.t)) out.push(s.t);
      }
    }
    return out;
  }

  function quickControlDefault() {
    const tiles = controlGoalTiles();
    const allowed = new Set(tiles.map((t) => t.value));
    for (const p of quickRolePatternFor()) {
      if (allowed.has(p.control)) return p.control;
    }
    return tiles[0]?.value || null;
  }

  function applyQuickDefaults() {
    if (!state.workGoals.length) state.workGoals = [C().WORK_GOALS[0]];
    if (!state.controlGoals.length) {
      const c = quickControlDefault();
      if (c) state.controlGoals = [c];
    }
    state.planBAcknowledged = true;
  }

  function quickLevelStorageKey() {
    return `sol.quickLevel.${state.handoffUserId || "x"}`;
  }

  /** Level-Vorschlag: zuletzt gewähltes Level der Person, sonst erstes mit Zieltext. */
  function applyQuickLevelDefault() {
    if (state.selectedLevel && state.levelGoalText) return;
    const goal = pickedWhatGoal();
    if (!goal) return;
    const order = (state.levelOptions || []).map((o) => o.value);
    let remembered = null;
    try {
      remembered = window.localStorage.getItem(quickLevelStorageKey());
    } catch (_) {}
    const pick = [remembered, ...order]
      .filter(Boolean)
      .find((l) => levelGoalTextFor(goal, l));
    if (pick) state.selectedLevel = pick;
    syncLevelGoalText();
    refreshHowGoals();
  }

  function rememberQuickLevel() {
    if (!state.selectedLevel) return;
    try {
      window.localStorage.setItem(quickLevelStorageKey(), state.selectedLevel);
    } catch (_) {}
  }

  function quickReady() {
    return !!(whatStepComplete() && roleGoalSatisfied() && ensureSilentLevel());
  }

  function quickMissingLabel() {
    if (!groupRoleComplete()) return "Rolle wählen";
    if (!state.whatGoalId) return "Thema wählen";
    if (!roleGoalSatisfied()) return "Ziel wählen";
    if (state.checkpoints.length > 1 && !state.selectedCheckpointId) return "Nachweis wählen";
    if (!ensureSilentLevel()) return "Ziel fehlt";
    return "";
  }

  function quickStyles() {
    return `<style>
      .pq{display:flex;flex-direction:column;gap:12px;margin-top:6px}
      .pq-label{margin:0 0 5px;font-size:.7rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#67e8f9}
      .pq-row{display:flex;flex-wrap:wrap;gap:8px}
      .pq-list{display:grid;gap:6px}
      .pq-person,.pq-chip{min-height:46px;padding:8px 16px;border-radius:12px;border:2px solid rgba(148,163,184,.4);background:rgba(15,23,42,.45);color:#cbd5e1;font-weight:800;font-size:1rem;cursor:pointer;-webkit-tap-highlight-color:transparent}
      .pq-person.is-done:not(.is-active){border-color:rgba(52,211,153,.55);color:#a7f3d0;background:rgba(6,78,59,.28)}
      .pq-person.is-active,.pq-chip.is-active{border-color:#22d3ee;background:linear-gradient(145deg,rgba(14,116,144,.95),rgba(8,47,73,.98));color:#fff;box-shadow:0 0 0 2px rgba(34,211,238,.3)}
      .pq-chip:disabled{opacity:.45;cursor:default}
      .pq-opt{display:flex;align-items:center;gap:10px;width:100%;min-height:46px;padding:9px 12px;border-radius:12px;border:2px solid rgba(56,189,248,.28);background:rgba(8,47,73,.4);color:#e2e8f0;text-align:left;font-size:.92rem;font-weight:600;line-height:1.3;cursor:pointer;-webkit-tap-highlight-color:transparent}
      .pq-opt__mark{flex:0 0 22px;height:22px;border-radius:999px;border:2px solid rgba(148,163,184,.5);display:grid;place-items:center;font-size:.72rem;font-weight:800;color:transparent}
      .pq-opt.is-active{border-color:#22d3ee;background:rgba(14,116,144,.55);color:#fff}
      .pq-opt.is-active .pq-opt__mark{background:#22d3ee;border-color:#67e8f9;color:#082f49}
      .pq-muted{margin:0;font-size:.78rem;color:#94a3b8}
      .pq-foot{position:sticky;bottom:-16px;margin:8px -16px -16px;padding:12px 16px 16px;background:linear-gradient(180deg,rgba(8,14,35,0),rgba(8,14,35,.97) 28%);display:flex;flex-direction:column;gap:6px}
      .pq-foot .today-app-btn{width:100%;min-height:50px;font-size:1.02rem}
      .pq-next{margin:0;text-align:center;font-size:.8rem;color:#94a3b8}
      .pq-handoff{text-align:center}
      .pq-handoff__name{margin:6px 0 14px;font-size:2.2rem;font-weight:900;line-height:1.1;color:#22d3ee}
      .pq-handoff .today-app-btn{width:100%;min-height:58px;font-size:1.15rem}
      .pq-dots{display:flex;justify-content:center;gap:6px;margin:0 0 12px}
      .pq-dots span{width:10px;height:10px;border-radius:50%;background:rgba(148,163,184,.4)}
      .pq-dots span.is-done{background:#4ade80}
      .pq-dots span.is-next{background:#22d3ee;box-shadow:0 0 10px rgba(34,211,238,.6)}
    </style>`;
  }

  function quickOptList(ui, items, attr, activeFn) {
    return `<div class="pq-list">${items
      .map((it) => {
        const active = activeFn(it);
        return `<button type="button" class="pq-opt${active ? " is-active" : ""}" ${attr}="${ui.escapeHtml(
          String(it.value)
        )}" aria-pressed="${active ? "true" : "false"}"><span class="pq-opt__mark" aria-hidden="true">✓</span><span>${ui.escapeHtml(
          it.label
        )}</span></button>`;
      })
      .join("")}</div>`;
  }

  function renderQuickPopup(ui) {
    const gc = state.groupContext;
    const members = groupMembers();
    const handoff = currentHandoffMember();
    const name = handoff?.displayName || "Person";
    const roles = gc.availableRoles || [];
    const activeIds = memberRoleIds(handoff);
    const roleDone = groupRoleComplete();
    const topicOptions = whatGoalSelectOptions();
    const topicNeedsSelect = topicOptions.length > 8;
    const goal = pickedWhatGoal();
    const roleGoalOpts = state.roleWasGoalOptions || [];
    const multiRole =
      new Set(roleGoalOpts.map((g) => g.roleName).filter(Boolean)).size > 1;
    const roleNames = planningTargetRoles()
      .map((r) => r.name)
      .filter(Boolean);
    const ready = quickReady();
    const next = nextPendingMember(state.handoffUserId);
    const missing = quickMissingLabel();

    const personRow = `
      <div>
        <div class="pq-row" role="group" aria-label="Person">
          ${members
            .map((m) => {
              const active = Number(m.userId) === Number(state.handoffUserId);
              const done = memberHasPlan(m);
              return `<button type="button" class="pq-person${active ? " is-active" : ""}${
                done ? " is-done" : ""
              }" data-plan-handoff="${ui.escapeHtml(String(m.userId))}" aria-pressed="${
                active ? "true" : "false"
              }">${ui.escapeHtml(m.displayName || "Person")}${done ? " ✓" : ""}</button>`;
            })
            .join("")}
        </div>
      </div>`;

    const subjectRow = state.subjectLocked
      ? ""
      : ui.fieldWrap(
          ui.fieldLabel("Fach", { required: true }),
          ui.select(
            "subject",
            C().SUBJECTS.map((s) => ({ value: s, label: s })),
            state.subject,
            { phase: "plan" }
          )
        );

    const checkpointRow =
      state.checkpoints.length > 1
        ? renderCheckpointField(ui)
        : state.checkpoints.length === 1
          ? `<p class="pq-muted">Nachweis: ${ui.escapeHtml(state.checkpoints[0].label)}</p>`
          : "";

    const roleRow = `
      <div>
        <p class="pq-label">Rolle für ${ui.escapeHtml(name)}</p>
        <div class="pq-row" role="group" aria-label="Rolle">
          ${roles
            .map((role) => {
              const active = activeIds.has(String(role.id));
              return `<button type="button" class="pq-chip${active ? " is-active" : ""}" data-plan-role-pick="${ui.escapeHtml(
                String(role.id)
              )}" data-claim="${active ? "0" : "1"}" ${state.roleSaving ? "disabled" : ""}>${ui.escapeHtml(
                role.name
              )}</button>`;
            })
            .join("")}
        </div>
      </div>`;

    let topicRow = "";
    if (roleDone) {
      if (!state.whatGoalOptions.length) {
        topicRow = `<div>${whatGoalMessage(ui)}</div>`;
      } else {
        topicRow = `
      <div data-pq-section="topic">
        <p class="pq-label">Thema</p>
        ${
          topicNeedsSelect
            ? ui.select("whatGoalId", topicOptions, state.whatGoalId, {
                phase: "plan",
                placeholder: "Thema wählen…"
              })
            : quickOptList(ui, topicOptions, "data-quick-topic", (it) =>
                String(it.value) === String(state.whatGoalId)
              )
        }
      </div>`;
      }
    }

    let roleGoalRow = "";
    if (roleDone && state.whatGoalId && roleGoalRequired()) {
      roleGoalRow = `
      <div data-pq-section="rolegoal">
        <p class="pq-label">${
          roleNames.length === 1 ? `Mein Ziel als ${ui.escapeHtml(roleNames[0])}` : "Mein Ziel in der Rolle"
        }</p>
        ${quickOptList(
          ui,
          roleGoalOpts.map((g) => ({
            value: g.id,
            label: multiRole && g.roleName ? `${g.roleName}: ${g.text}` : g.text
          })),
          "data-quick-rolegoal",
          (it) => String(it.value) === String(state.roleGoalId)
        )}
      </div>`;
    }

    if (roleDone && state.whatGoalId && roleGoalSatisfied()) ensureSilentLevel();

    const submitLabel = state.submitting
      ? "Speichern…"
      : state.editingEntryId
        ? "Änderungen speichern"
        : "Speichern · +2 XP";

    return `
      ${quickStyles()}
      <div class="plan-next-modal-backdrop plan-next-modal-backdrop--ask" role="dialog" aria-modal="true" aria-label="Tagesziel Gruppe">
        <div class="plan-next-modal plan-next-modal--ask">
          <p class="plan-next-modal__kicker">Tagesziel · ${ui.escapeHtml(state.subject || "")} · ${
            members.filter(memberHasPlan).length
          }/${members.length} fertig</p>
          ${state.errorMsg ? `<p class="plan-next-modal__text" style="color:#fca5a5;margin:4px 0 0">${ui.escapeHtml(state.errorMsg)}</p>` : ""}
          <div class="pq">
            ${personRow}
            ${subjectRow}
            ${checkpointRow}
            ${roleRow}
            ${topicRow}
            ${roleGoalRow}
          </div>
          <div class="pq-foot">
            <button type="button" class="btn-primary logbuch-submit today-app-btn" id="planSubmitBtn" ${
              state.submitting || !ready ? "disabled" : ""
            }>${ready || state.submitting ? submitLabel : `Noch: ${ui.escapeHtml(missing)}`}</button>
            ${
              ready && !state.editingEntryId && next
                ? `<p class="pq-next">Danach: Tablet an ${ui.escapeHtml(next.displayName || "nächste Person")}</p>`
                : ""
            }
            <button type="button" class="logbuch-btn-ghost today-app-btn today-app-btn--ghost" id="planBackBtn">Abbrechen</button>
          </div>
        </div>
      </div>`;
  }

  function renderHandoffPopup(ui) {
    const n = state.handoffNotice;
    if (!n) return "";
    const members = groupMembers();
    const done = members.filter(memberHasPlan).length;
    return `
      ${quickStyles()}
      <div class="plan-next-modal-backdrop plan-next-modal-backdrop--ask" role="dialog" aria-modal="true" aria-label="Tablet weitergeben">
        <div class="plan-next-modal plan-next-modal--ask pq-handoff">
          <p class="plan-next-modal__kicker">✓ ${ui.escapeHtml(n.savedName || "Gespeichert")} gespeichert</p>
          <div class="pq-dots" aria-label="${done} von ${members.length} fertig">
            ${members
              .map((m) => {
                const isNext = Number(m.userId) === Number(n.nextUserId);
                return `<span class="${memberHasPlan(m) ? "is-done" : isNext ? "is-next" : ""}"></span>`;
              })
              .join("")}
          </div>
          <h3 class="plan-next-modal__title">Gib das Tablet jetzt an</h3>
          <p class="pq-handoff__name">${ui.escapeHtml(n.nextName || "nächste Person")}</p>
          <button type="button" class="btn-primary logbuch-submit today-app-btn" id="planHandoffGo">${ui.escapeHtml(
            n.nextName || "Weiter"
          )} ist dran →</button>
        </div>
      </div>`;
  }

  function pickQuickTopic(id) {
    if (!id || String(id) === String(state.whatGoalId)) return;
    state.whatGoalId = id;
    state.roleGoalId =
      state.roleWasGoalOptions.length === 1 ? state.roleWasGoalOptions[0].id : null;
    state.selectedLevel = null;
    state.levelGoalText = "";
    state.startGoals = [];
    state.howGoalText = null;
    state.controlGoals = [];
    state.errorMsg = "";
    syncLevelGoalText();
    applyQuickLevelDefault();
  }

  function render() {
    const root = document.getElementById("plan-screen-root");
    if (!root) return;

    const ui = UI();
    const dateLabel = new Date(state.date + "T12:00:00").toLocaleDateString("de-DE", {
      weekday: "long",
      day: "2-digit",
      month: "2-digit"
    });

    if (state.existingEntry) {
      root.innerHTML = renderExistingEntry(ui, dateLabel);
      bindStaticHandlers(root);
      return;
    }

    const sWhat = whatStepComplete();
    const sWas = wasZielStepComplete();
    const sWork = workStepComplete();
    const sControl = controlStepComplete();
    const sPlanB = planBStepComplete();
    const missionReady = sWhat && sWas && sWork && sControl && sPlanB;

    const sharedGroup = isSharedGroupDevice() && state.groupContext?.hasGroup && !state.groupContext?.needsSetup;
    const handoffForTopic = sharedGroup ? currentHandoffMember() : null;
    const topicLabel = handoffForTopic
      ? `3. Unterthema · ${handoffForTopic.displayName || "Person"}`
      : "Unterthema";
    const whatBody = `
      <div class="goal-step-card__stack">
        ${
          state.subjectLocked
            ? ui.fieldWrap(
                ui.fieldLabel("Fach"),
                `<div class="plan-subject-locked">${ui.escapeHtml(state.subject || "–")}</div>`,
                "Vom Stundenplan für diese Stunde"
              )
            : ui.fieldWrap(
                ui.fieldLabel("Fach", { required: true }),
                ui.select(
                  "subject",
                  C().SUBJECTS.map((s) => ({ value: s, label: s })),
                  state.subject,
                  { phase: "plan" }
                )
              )
        }
        ${renderGroupRolePicker(ui)}
        <div class="${sharedGroup ? "plan-group-topic-section" : ""}">
          ${renderCheckpointField(ui)}
          ${ui.fieldWrap(
            ui.fieldLabel(topicLabel, { required: true }),
            !groupRoleComplete()
              ? `<div class="logbuch-msg logbuch-msg-info">${
                  sharedGroup
                    ? "Zuerst Person und Rolle wählen — dann Unterthema."
                    : "Zuerst Rolle wählen."
                }</div>`
              : state.whatGoalOptions.length
                ? ui.select(
                    "whatGoalId",
                    whatGoalSelectOptions(),
                    state.whatGoalId,
                    { phase: "plan", placeholder: "Unterthema wählen…" }
                  )
                : whatGoalMessage(ui)
          )}
        </div>
        ${
          sWhat
            ? continueRow("planTopicContinue", "Weiter zum Was-Ziel", true)
            : ""
        }
      </div>`;

    if (state.activeStep === 2 && whatStepComplete()) {
      if (roleGoalRequired()) {
        ensureSilentLevel();
      } else {
        const opts = wasZielTierOptions();
        if (opts.length === 1 && state.selectedLevel !== opts[0].value) {
          state.selectedLevel = opts[0].value;
          syncLevelGoalText();
          refreshHowGoals();
        }
      }
    }

    const wasZielBody = (() => {
      if (roleGoalRequired()) {
        return `<div class="goal-step-card__stack">${renderRoleGoalField(ui)}${continueRow(
          "planWasContinue",
          "Weiter",
          roleGoalSatisfied() && !!state.levelGoalText
        )}</div>`;
      }
      const opts = wasZielTierOptions();
      if (!opts.length) {
        return `<div class="goal-step-card__stack"><div class="logbuch-msg logbuch-msg-info">Für dieses Unterthema sind noch keine Was-Ziele hinterlegt.</div></div>`;
      }
      const V = window.LogbuchVisuals;
      const tiles = opts.map((o) => ({
        value: o.value,
        title: o.label,
        desc: "",
        icon: "◆",
        accent: "#38bdf8"
      }));
      return `<div class="goal-step-card__stack">
        <p class="way-to-goal__intro">Wähle dein Was-Ziel für heute.</p>
        ${
          V
            ? V.strategyTileGrid(tiles, state.selectedLevel, "data-was-tier", {
                multi: false
              })
            : ui.select(
                "selectedLevel",
                opts,
                state.selectedLevel,
                { phase: "plan", placeholder: "Was-Ziel wählen…" }
              )
        }
        ${continueRow("planWasContinue", "Weiter", !!(state.selectedLevel && state.levelGoalText))}
      </div>`;
    })();

    const workBody = `<div class="goal-step-card__stack">${renderWorkSection(ui)}${continueRow(
      "planWorkContinue",
      "Weiter",
      sWork
    )}</div>`;
    const controlBody = `<div class="goal-step-card__stack">${renderControlSection(ui)}${continueRow(
      "planControlContinue",
      "Weiter",
      sControl
    )}</div>`;
    const planBBody = `<div class="goal-step-card__stack">${renderPlanBSection(ui)}${continueRow(
      "planPlanBContinue",
      state.planBStrategies.length
        ? state.planBStrategies.length === 1
          ? "Weiter mit Plan B"
          : `Weiter mit ${state.planBStrategies.length} Plan-B-Karten`
        : "Ohne Plan B weiter",
      true
    )}</div>`;
    const confidenceBody = `<div class="goal-step-card__stack">
      ${renderConfidenceCards(ui)}
      ${continueRow(
        "planStep3Continue",
        state.confidenceBefore != null ? "Weiter zur Mission" : "Ohne Angabe weiter"
      )}
    </div>`;

    const stepPopup = state.afterSaveOpen
      ? ""
      : state.handoffNotice
        ? renderHandoffPopup(ui)
        : state.activeStep >= 7
        ? renderMissionPopup(ui, missionReady)
        : state.activeStep === 1
          ? renderStepPopup({
              step: 1,
              title: "Unterthema wählen",
              hint: state.groupContext?.hasGroup
                ? isSharedGroupDevice()
                  ? "Person → Rolle → Unterthema."
                  : "Rolle, dann Unterthema."
                : "Unterthema für diese Stunde wählen.",
              body: whatBody,
              showBack: false
            })
          : state.activeStep === 2
            ? renderStepPopup({
                step: 2,
                title: roleGoalRequired() ? "Was-Ziel zur Rolle" : "Was-Ziel",
                hint: roleGoalRequired()
                  ? "Was willst du in deiner Rolle heute schaffen?"
                  : "Wähle dein Was-Ziel.",
                body: wasZielBody
              })
            : state.activeStep === 3
              ? renderStepPopup({
                  step: 3,
                  title: "Ich arbeite so",
                  hint: "1 bis 3 Karten – so bleibst du dran.",
                  body: workBody
                })
              : state.activeStep === 4
                ? renderStepPopup({
                    step: 4,
                    title: "Ich kontrolliere so",
                    hint:
                      subjectKey() === "physik"
                        ? "1 bis 3 Karten – Vermutung, Versuch, Ergebnis."
                        : "1 bis 3 Karten – so merkst du, ob du’s kannst.",
                    body: controlBody
                  })
                : state.activeStep === 5
                  ? renderStepPopup({
                      step: 5,
                      title: "Plan B, wenn ich hänge",
                      hint:
                        subjectKey() === "physik"
                          ? "Optional – Hilfekarten, Partner oder neu ansetzen."
                          : "Optional – falls du feststeckst.",
                      body: planBBody
                    })
                  : renderStepPopup({
                      step: 6,
                      title: "Selbstcheck",
                      hint: "Optional – wie sicher fühlst du dich?",
                      body: confidenceBody
                    });

    root.innerHTML = `
      <div class="plan-app plan-app--ask">
        ${renderPlanHero(ui, dateLabel)}
        ${renderGroupContextBanner(ui)}
        ${
          state.editingEntryId
            ? `<div class="logbuch-msg logbuch-msg-info">Du bearbeitest dein Tagesziel – beim Speichern gibt es kein zusätzliches XP.</div>`
            : ""
        }
        ${renderSuggestionBanner(ui)}
      </div>
      ${stepPopup}
      ${renderAfterSaveModal()}`;

    portalPlanNextModal(root);
    bindHandlers(root);
  }

  function bindStaticHandlers(root) {
    root.querySelector("#planBackBtn")?.addEventListener("click", () => {
      window.StudentRouter?.navigateToSection("today");
    });
    root.querySelector("#planGoGruppenmodus")?.addEventListener("click", () => {
      const q = new URLSearchParams(
        root.querySelector("#planGoGruppenmodus")?.dataset?.query || ""
      );
      window.StudentRouter?.navigateToSection("gruppenmodus", { query: q });
    });
  }

  function updatePlanningPreview(root) {
    const box = root.querySelector("#planSummaryCard");
    if (!box) return;
    box.innerHTML = renderPlanSummaryContent(UI());
    const submitBtn = root.querySelector("#planSubmitBtn");
    if (submitBtn) submitBtn.disabled = state.submitting;
  }

  function afterChoiceChange(root) {
    const prev = state.activeStep;
    syncActiveStep();
    if (state.activeStep !== prev || [3, 4, 5].includes(state.activeStep)) {
      render();
      return;
    }
    updatePlanningPreview(root);
  }

  function bindChoiceChips(root, selector, onPick) {
    root.querySelectorAll(selector).forEach((btn) => {
      btn.addEventListener("click", () => {
        if (btn.disabled) return;
        onPick(btn);
      });
    });
  }

  function syncRankedTiles(root, selector, datasetKey, selected) {
    const list = selected || [];
    root.querySelectorAll(selector).forEach((chip) => {
      const rank = list.indexOf(chip.dataset[datasetKey]);
      const active = rank >= 0;
      const full = !active && list.length >= 3;
      chip.classList.toggle("is-active", active);
      chip.disabled = full;
      chip.setAttribute("aria-pressed", active ? "true" : "false");
      let badge = chip.querySelector(".strategy-tile__check");
      if (active) {
        const label = String(rank + 1);
        if (!badge) {
          chip.insertAdjacentHTML(
            "afterbegin",
            `<span class="strategy-tile__check" aria-hidden="true">${label}</span>`
          );
        } else if (badge.textContent !== label) {
          badge.textContent = label;
        }
      } else if (badge) {
        badge.remove();
      }
    });
  }

  function bindChipGroups(root) {
    bindChoiceChips(root, "[data-level]", (btn) => {
      state.selectedLevel = btn.dataset.level;
      state.startGoals = [];
      state.howGoalText = null;
      syncLevelGoalText();
      refreshHowGoals();
      syncActiveStep();
      render();
    });

    bindChoiceChips(root, "[data-start-goal]", (btn) => {
      toggleMulti(state.startGoals, btn.dataset.startGoal, 3);
      syncStartGoalFromHowGoal();
      syncRankedTiles(root, "[data-start-goal]", "startGoal", state.startGoals);
      afterChoiceChange(root);
    });

    bindChoiceChips(root, "[data-control-goal]", (btn) => {
      toggleMulti(state.controlGoals, btn.dataset.controlGoal, 3);
      syncRankedTiles(root, "[data-control-goal]", "controlGoal", state.controlGoals);
      afterChoiceChange(root);
    });

    bindChoiceChips(root, "[data-plan-b]", (btn) => {
      const raw = btn.getAttribute("data-plan-b") || btn.dataset.planB;
      if (!raw) return;
      toggleMulti(state.planBStrategies, raw, 3);
      // Auswahl merken → Button „Weiter“ statt „Ohne Plan B weiter“
      if (state.planBStrategies.length) state.planBAcknowledged = true;
      afterChoiceChange(root);
    });

    bindChoiceChips(root, "[data-confidence]", (btn) => {
      state.confidenceBefore = Number(btn.dataset.confidence);
      state.step3Skipped = false;
      syncActiveStep();
      render();
    });
  }

  function bindWorkGoalChips(root) {
    root.querySelectorAll("[data-work-goal]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const goal = btn.dataset.workGoal;
        if (!goal) return;
        const idx = state.workGoals.indexOf(goal);
        if (idx >= 0) {
          state.workGoals.splice(idx, 1);
        } else if (state.workGoals.length < 3) {
          state.workGoals.push(goal);
        }
        syncRankedTiles(root, "[data-work-goal]", "workGoal", state.workGoals);
        afterChoiceChange(root);
      });
    });
  }

  function planModalScope(root) {
    return document.querySelector("body > .plan-next-modal-backdrop") || root;
  }

  function bindHandlers(root) {
    const scope = planModalScope(root);
    document.getElementById("planGoGruppenmodus")?.addEventListener("click", () => {
      const btn = document.getElementById("planGoGruppenmodus");
      const q = new URLSearchParams(btn?.dataset?.query || "");
      window.StudentRouter?.navigateToSection("gruppenmodus", { query: q });
    });
    scope.querySelectorAll("[data-plan-handoff]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const uid = Number(btn.getAttribute("data-plan-handoff"));
        if (!Number.isFinite(uid) || uid <= 0) return;
        if (uid === Number(state.handoffUserId) && !state.handoffNotice) return;
        state.handoffUserId = uid;
        state.handoffNotice = null;
        state.pqSeenSection = null;
        resetPlanFormForHandoff();
        loadContext().then(render).catch(() => render());
      });
    });
    scope.querySelector("#planHandoffGo")?.addEventListener("click", () => {
      const nextId = Number(state.handoffNotice?.nextUserId);
      state.handoffNotice = null;
      if (Number.isFinite(nextId) && nextId > 0) {
        state.handoffUserId = nextId;
      }
      resetPlanFormForHandoff();
      loadContext().then(render).catch(() => render());
    });
    scope.querySelectorAll("[data-quick-topic]").forEach((btn) => {
      btn.addEventListener("click", () => {
        pickQuickTopic(btn.getAttribute("data-quick-topic"));
        render();
      });
    });
    scope.querySelectorAll("[data-quick-rolegoal]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.roleGoalId = btn.getAttribute("data-quick-rolegoal");
        state.errorMsg = "";
        render();
      });
    });
    scope.querySelectorAll("[data-quick-level]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const lvl = btn.getAttribute("data-quick-level");
        if (!lvl || lvl === state.selectedLevel) return;
        state.selectedLevel = lvl;
        state.startGoals = [];
        state.howGoalText = null;
        state.errorMsg = "";
        syncLevelGoalText();
        refreshHowGoals();
        render();
      });
    });
    scope.querySelectorAll("[data-quick-start]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const v = btn.getAttribute("data-quick-start");
        if (!state.startGoals.includes(v) && state.startGoals.length >= QUICK_START_MAX) {
          state.startGoals.shift();
        }
        toggleMulti(state.startGoals, v, QUICK_START_MAX);
        syncStartGoalFromHowGoal();
        state.errorMsg = "";
        render();
      });
    });
    scope.querySelectorAll("[data-plan-role-pick]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const sessionId = state.groupContext?.sessionId;
        const roleId = btn.getAttribute("data-plan-role-pick");
        const claim = btn.getAttribute("data-claim") !== "0";
        if (!sessionId || !roleId || state.roleSaving) return;
        const shared = isSharedGroupDevice();
        const handoff = currentHandoffMember();
        const targetUserId = shared
          ? Number(handoff?.userId || state.handoffUserId)
          : null;
        if (shared && (!Number.isFinite(targetUserId) || targetUserId <= 0)) {
          state.errorMsg = "Bitte zuerst eine Person wählen.";
          render();
          return;
        }
        state.roleSaving = true;
        state.errorMsg = "";
        try {
          const url = shared
            ? `/api/student/group-sessions/${sessionId}/roles/assign`
            : `/api/student/group-sessions/${sessionId}/roles/claim`;
          const body = shared
            ? { userId: targetUserId, roleId, claim }
            : { roleId, claim };
          const r = await fetch(url, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
            body: JSON.stringify(body)
          });
          const data = await r.json().catch(() => ({}));
          if (!r.ok || data.success === false) {
            throw new Error(data.message || data.error || "Rolle konnte nicht gespeichert werden.");
          }
          if (shared && targetUserId) state.handoffUserId = targetUserId;
          if (isQuickGroup()) {
            // Rolle geändert: passende Start-Auswahl neu
            state.startGoals = [];
            state.howGoalText = null;
            state.controlGoals = [];
            state.roleGoalId = null;
          }
          await loadContext();
          state.roleSaving = false;
          render();
        } catch (err) {
          state.roleSaving = false;
          state.errorMsg = err.message || "Rolle speichern fehlgeschlagen.";
          render();
        }
      });
    });
    UI().bindSelects(scope, state, async (field) => {
      if (field === "subject") {
        state.whatGoalId = null;
        state.roleGoalId = null;
        state.whatGoalText = "";
        state.selectedLevel = null;
        state.levelGoalText = "";
        state.startGoals = [];
        state.howGoalText = null;
        state.controlGoals = [];
        state.planBStrategies = [];
        state.selectedCheckpointId = null;
        state.activeStep = 1;
        state.step3Skipped = false;
        state.planBAcknowledged = false;
        state.suggestionApplied = false;
        await loadContext();
        render();
        return;
      }
      if (field === "selectedCheckpointId") {
        state.whatGoalId = null;
        state.roleGoalId = null;
        state.whatGoalText = "";
        state.selectedLevel = null;
        state.levelGoalText = "";
        state.startGoals = [];
        state.howGoalText = null;
        state.controlGoals = [];
        state.activeStep = 1;
        await loadContext();
        render();
        return;
      }
      if (field === "roleGoalId") {
        ensureSilentLevel();
        if (wasZielStepComplete() && state.activeStep === 2) state.activeStep = 3;
        else syncActiveStep();
        render();
        return;
      }
      if (field === "whatGoalId") {
        state.selectedLevel = null;
        state.levelGoalText = "";
        state.roleGoalId = null;
        state.startGoals = [];
        state.howGoalText = null;
        state.controlGoals = [];
        state.planBAcknowledged = false;
        syncLevelGoalText();
        if (isQuickGroup() && roleGoalSatisfied()) ensureSilentLevel();
        syncActiveStep();
        render();
        return;
      }
      if (field === "selectedLevel") {
        state.startGoals = [];
        state.howGoalText = null;
        state.controlGoals = [];
        syncLevelGoalText();
        refreshHowGoals();
        if (wasZielStepComplete() && state.activeStep === 2) state.activeStep = 3;
        else syncActiveStep();
        render();
        return;
      }
      if (field === "howGoalText" || field === "planBStrategyText") {
        updatePlanningPreview(root);
        return;
      }
    });

    bindWorkGoalChips(scope);
    bindChipGroups(scope);

    scope.querySelectorAll("[data-plan-open]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const step = Number(btn.dataset.planOpen);
        if (!step) return;
        if (step >= 2 && !whatStepComplete() && state.activeStep !== step) return;
        if (step >= 3 && !wasZielStepComplete() && state.activeStep !== step) return;
        if (step >= 4 && !workStepComplete() && state.activeStep !== step) return;
        if (step >= 5 && !controlStepComplete() && state.activeStep !== step) return;
        openStep(step);
      });
    });

    scope.querySelector("#planAskBack")?.addEventListener("click", () => {
      state.activeStep = Math.max(1, Number(state.activeStep) - 1);
      render();
    });

    scope.querySelector("#planTopicContinue")?.addEventListener("click", () => {
      if (!whatStepComplete()) return;
      state.activeStep = 2;
      render();
    });
    scope.querySelector("#planWasContinue")?.addEventListener("click", () => {
      if (roleGoalRequired()) ensureSilentLevel();
      if (!wasZielStepComplete()) return;
      state.activeStep = 3;
      render();
    });
    bindChoiceChips(scope, "[data-was-tier]", (btn) => {
      state.selectedLevel = btn.dataset.wasTier;
      syncLevelGoalText();
      refreshHowGoals();
      state.startGoals = [];
      state.howGoalText = null;
      if (wasZielStepComplete()) state.activeStep = 3;
      render();
    });
    scope.querySelector("#planWorkContinue")?.addEventListener("click", () => {
      if (!workStepComplete()) return;
      state.activeStep = 4;
      render();
    });
    scope.querySelector("#planControlContinue")?.addEventListener("click", () => {
      if (!controlStepComplete()) return;
      state.activeStep = 5;
      render();
    });
    scope.querySelector("#planPlanBContinue")?.addEventListener("click", () => {
      state.planBAcknowledged = true;
      state.activeStep = 6;
      render();
    });
    scope.querySelector("#planStep3Continue")?.addEventListener("click", () => {
      if (state.confidenceBefore == null) state.step3Skipped = true;
      state.activeStep = 7;
      render();
    });

    root.querySelector("#planApplySuggestion")?.addEventListener("click", applySuggestion);
    root.querySelector("#planDismissSuggestion")?.addEventListener("click", () => {
      state.suggestion = null;
      state.suggestionApplied = false;
      render();
    });

    const details = scope.querySelector("#planDetailsText");
    details?.addEventListener("input", () => {
      state.detailsText = details.value.slice(0, 100);
      const count = scope.querySelector("#planDetailsCount");
      if (count) count.textContent = String(state.detailsText.length);
      updatePlanningPreview(scope);
    });

    document.getElementById("planSubmitBtn")?.addEventListener("click", (ev) => {
      ev.preventDefault();
      submitPlan();
    });
    scope.querySelector("#planBackBtn")?.addEventListener("click", () => {
      goToTodayFromPlan();
    });
  }

  async function submitPlan() {
    if (state.submitting) return;

    function fail(msg, step) {
      state.submitting = false;
      state.errorMsg = msg;
      if (step) state.activeStep = step;
      render();
    }

    if (!state.subject) {
      fail("Bitte wähle ein Fach.", 1);
      return;
    }
    if (!state.whatGoalId) {
      fail("Bitte wähle ein Unterthema.", 1);
      return;
    }
    if (state.checkpoints.length > 1 && !state.selectedCheckpointId) {
      fail("Bitte wähle den Nachweis, für den du arbeitest.", 1);
      return;
    }
    if (!roleGoalSatisfied()) {
      fail(
        roleGoalRequired()
          ? "Bitte wähle ein Was-Ziel zu deiner Rolle."
          : "Bitte wähle ein Was-Ziel.",
        2
      );
      return;
    }
    if (roleGoalRequired()) ensureSilentLevel();
    syncLevelGoalText();
    if (!state.selectedLevel || !state.levelGoalText) {
      fail("Bitte wähle ein Was-Ziel.", 2);
      return;
    }
    if (state.workGoals.length < 1) {
      fail("Bitte wähle, wie du arbeitest (1–3 Karten unter „Ich arbeite so“).", 3);
      return;
    }
    if (!state.controlGoals.length) {
      fail("Bitte wähle, wie du kontrollierst (1–3 Karten unter „Ich kontrolliere so“).", 4);
      return;
    }
    if (!state.planBAcknowledged) {
      state.planBAcknowledged = true;
    }

    syncStartGoalFromHowGoal();

    if (state.confidenceBefore != null) {
      state.confidenceBefore = Number(state.confidenceBefore);
    }

    state.errorMsg = "";
    state.submitting = true;
    render();

    const checkpoint = pickedCheckpoint();
    const howJoined = joinMulti(state.startGoals);
    const planBJoined = joinMulti(state.planBStrategies);

    try {
      // Nur echtes Bearbeiten → PATCH; sonst POST (legt an oder aktualisiert denselben Slot)
      const isEdit = !!state.editingEntryId;
      const res = await fetch(
        isEdit
          ? `/api/student/log/plan/${encodeURIComponent(state.editingEntryId)}`
          : "/api/student/log/plan",
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
          date: state.date,
          timeslot: state.timeslot || null,
          subject: state.subject,
          checkpointId: checkpoint?.id || state.selectedCheckpointId || null,
          checkpointTitle: checkpoint
            ? `${checkpoint.typeLabel || "Nachweis"}: ${checkpoint.title}`
            : null,
          whatGoalId: state.whatGoalId,
          roleGoalId: state.roleGoalId || null,
          whatGoalText: state.whatGoalText.trim(),
          selectedLevel: state.selectedLevel,
          howGoalText: state.startGoals,
          goal: howJoined,
          detailsText: state.detailsText.trim() || null,
          workGoals: state.workGoals,
          socialForm: state.socialForm,
          strategy: state.controlGoals,
          confidenceBefore:
            state.confidenceBefore != null ? Number(state.confidenceBefore) : null,
          planBStrategyText: planBJoined,
          freitext: state.detailsText.trim() || null,
          forUserId:
            isSharedGroupDevice() && state.handoffUserId
              ? Number(state.handoffUserId)
              : undefined
        })
      });

      let data = null;
      try {
        data = await res.json();
      } catch (_) {
        state.submitting = false;
        state.errorMsg = `Speichern fehlgeschlagen (Server ${res.status}).`;
        render();
        return;
      }

      if (!data.success) {
        state.submitting = false;
        if (data.readOnly && data.entryId) {
          state.entryId = data.entryId;
          await loadContext();
          render();
          return;
        }
        state.errorMsg = data.message || "Speichern fehlgeschlagen.";
        render();
        return;
      }

      if (typeof window.loadMe === "function") {
        await window.loadMe();
      }

      state.submitting = false;
      // Shared-Tablet: erst nach Speichern weitergeben – großer Handoff-Screen
      if (isSharedGroupDevice()) {
        const members = groupMembers();
        const cur = Number(state.handoffUserId);
        const saved = members.find((m) => Number(m.userId) === cur);
        if (Number.isFinite(cur) && cur > 0 && !state.quickDoneIds.includes(cur)) {
          state.quickDoneIds.push(cur);
        }
        const next = nextPendingMember(cur);
        if (next) {
          state.handoffNotice = {
            savedName: saved?.displayName || "Gespeichert",
            nextUserId: Number(next.userId),
            nextName: next.displayName || "nächste Person"
          };
          state.handoffUserId = Number(next.userId);
          resetPlanFormForHandoff();
          await loadContext();
          render();
          return;
        }
      }
      state.handoffNotice = null;
      state.afterSaveOpen = false;
      goToTodayFromPlan();
    } catch (err) {
      console.error(err);
      state.submitting = false;
      state.errorMsg = "Netzwerkfehler – bitte erneut versuchen.";
      render();
    }
  }

  async function loadContext() {
    const params = new URLSearchParams({ date: state.date });
    if (state.entryId) params.set("entryId", state.entryId);
    if (state.timeslot) params.set("timeslot", state.timeslot);
    if (state.subject) params.set("subject", state.subject);
    if (state.selectedCheckpointId) {
      params.set("checkpointId", state.selectedCheckpointId);
    }
    if (state.handoffUserId && isSharedGroupDevice()) {
      params.set("forUserId", String(state.handoffUserId));
    }

    const res = await fetch(`/api/student/log/plan-context?${params}`);
    if (!res.ok) {
      throw new Error(`Plan-Kontext konnte nicht geladen werden (${res.status})`);
    }
    const data = await res.json();

    state.socialUnlock = data.socialUnlock || { gruppe: false, frei: false };
    state.groupContext = data.groupContext || null;
    const inSharedPlanPhase = sharedPlanPhaseActive(params);
    if (inSharedPlanPhase) {
      state.handoffUserId = resolveSharedPlanTargetId(params);
      params.set("forUserId", String(state.handoffUserId));
    }
    const planningId =
      data.planningUserId != null ? Number(data.planningUserId) : null;
    let existing = inSharedPlanPhase ? null : data.existingEntry || null;
    const existingOwner =
      existing?.user_id != null ? Number(existing.user_id) : null;
    // Nur Tagesziel der Person am Tablet – nie das des Login-Accounts „mitnehmen“
    // (user_id fehlt → Eintrag behalten, nicht verwerfen)
    if (
      existing &&
      planningId &&
      existingOwner != null &&
      Number.isFinite(existingOwner) &&
      existingOwner !== planningId
    ) {
      existing = null;
    }
    state.existingEntry = existing;
    if (
      existing &&
      (!planningId ||
        existingOwner == null ||
        !Number.isFinite(existingOwner) ||
        existingOwner === planningId)
    ) {
      // Gespeichertes Tagesziel anzeigen – nicht erneut den Wizard öffnen
      state.editingEntryId = null;
      state.entryId = existing.id;
      state.existingEntry = existing;
    } else if (existing && planningId && planningId !== Number(data.actorUserId)) {
      // Andere Person hat schon ein Ziel – Formular leer lassen (Handoff-Übersicht)
      state.existingEntry = null;
      state.editingEntryId = null;
      state.entryId = null;
    } else if (!existing) {
      state.editingEntryId = null;
      state.entryId = inSharedPlanPhase ? null : params.get("entryId") || null;
      state.existingEntry = null;
    }
    state.hasClass = data.hasClass !== false;
    state.howGoalsBase = Array.isArray(data.howGoals) ? data.howGoals : HOW_GOAL_OPTIONS;
    refreshHowGoals();
    state.whatGoalOptions = Array.isArray(data.whatGoalOptions) ? data.whatGoalOptions : [];
    state.roleWasGoalOptions = Array.isArray(data.roleWasGoalOptions)
      ? data.roleWasGoalOptions
      : [];
    state.levelOptions = Array.isArray(data.levelOptions) ? data.levelOptions : LEVEL_OPTIONS;
    state.checkpoints = Array.isArray(data.checkpoints) ? data.checkpoints : [];
    state.nextCheckpoint = data.selectedCheckpoint || data.nextCheckpoint || null;
    state.selectedCheckpointId =
      data.selectedCheckpoint?.id ||
      state.selectedCheckpointId ||
      (state.checkpoints.length === 1 ? state.checkpoints[0].id : null);
    state.goalSource = data.goalSource || "none";
    state.subjectLocked = !!data.subjectLocked;
    if (data.planningUserId) {
      const planned = Number(data.planningUserId);
      const wanted = params.has("forUserId") ? Number(params.get("forUserId")) : null;
      if (inSharedPlanPhase && wanted && Number.isFinite(wanted) && wanted > 0) {
        state.handoffUserId = wanted;
        state.editingEntryId = null;
        state.entryId = null;
        state.existingEntry = null;
      } else if (wanted && Number.isFinite(wanted) && wanted > 0 && planned !== wanted) {
        state.handoffUserId = wanted;
        state.editingEntryId = null;
        state.entryId = null;
        state.existingEntry = null;
      } else {
        state.handoffUserId = planned;
      }
    } else if (state.groupContext) {
      syncHandoffMember();
    }

    // Shared: solange nicht alle Ziele da sind → Kontext für die gewählte Person ohne Ziel
    if (inSharedPlanPhase) {
      state.existingEntry = null;
      state.editingEntryId = null;
      state.entryId = null;
      const wantTarget = Number(state.handoffUserId);
      const gotTarget = data.planningUserId != null ? Number(data.planningUserId) : null;
      if (wantTarget && gotTarget !== wantTarget) {
        params.set("forUserId", String(wantTarget));
        const resPending = await fetch(`/api/student/log/plan-context?${params}`);
        if (resPending.ok) {
          const dataPending = await resPending.json();
          state.groupContext = dataPending.groupContext || state.groupContext;
          state.whatGoalOptions = Array.isArray(dataPending.whatGoalOptions)
            ? dataPending.whatGoalOptions
            : state.whatGoalOptions;
          state.roleWasGoalOptions = Array.isArray(dataPending.roleWasGoalOptions)
            ? dataPending.roleWasGoalOptions
            : [];
          state.howGoalsBase = Array.isArray(dataPending.howGoals)
            ? dataPending.howGoals
            : state.howGoalsBase;
          refreshHowGoals();
          if (dataPending.planningUserId) {
            state.handoffUserId = Number(dataPending.planningUserId);
          }
          state.existingEntry = null;
          state.entryId = null;
        }
      }
    }

    if (data.lockedSubject) {
      state.subject = data.lockedSubject;
    } else if (!state.subject && data.suggestedSubject) {
      state.subject = data.suggestedSubject;
    }

    if (!state.editingEntryId && !state.existingEntry) {
      state.suggestion = data.previousSuggestion || null;
    } else {
      state.suggestion = null;
    }

    syncSubjectScopedSelections();

    restoreRoleGoalSelection(
      state.editingEntryId
        ? {
            role_goal_id: state.roleGoalId,
            role_goal_text: state._editRoleGoalText
          }
        : null
    );
    if (state.roleGoalId && !selectedRoleGoal()) {
      restoreRoleGoalSelection({
        role_goal_id: null,
        role_goal_text: state._editRoleGoalText
      });
    }
    if (!state.roleGoalId && state.roleWasGoalOptions.length === 1) {
      state.roleGoalId = state.roleWasGoalOptions[0].id;
    }

    if (state.startGoals.length) {
      state.startGoals = state.startGoals.filter((g) => isAllowedStartGoal(g));
      state.howGoalText = joinMulti(state.startGoals);
    }
    if (state.whatGoalId) {
      const picked = state.whatGoalOptions.find((g) => String(g.id) === String(state.whatGoalId));
      if (picked) {
        syncLevelGoalText();
      } else if (state.editingEntryId) {
        // Beim Bearbeiten Option behalten, auch wenn die Liste neu gefiltert ist
        if (!state.levelGoalText) ensureSilentLevel();
      } else {
        state.whatGoalId = null;
        state.whatGoalText = "";
        state.selectedLevel = null;
        state.levelGoalText = "";
      }
    }
    if (state.editingEntryId) ensureSilentLevel();
    if (!state.editingEntryId) syncActiveStep();

    // Shared: nach erstem Kontext die aktuelle Handoff-Person nachladen (Rollen-/Zielkontext)
    const shared = isSharedGroupDevice();
    const wantFor = shared ? Number(state.handoffUserId) : null;
    const gotFor = data.planningUserId != null ? Number(data.planningUserId) : null;
    if (
      shared &&
      wantFor &&
      gotFor !== wantFor &&
      !params.has("forUserId")
    ) {
      params.set("forUserId", String(wantFor));
      const res2 = await fetch(`/api/student/log/plan-context?${params}`);
      if (res2.ok) {
        const data2 = await res2.json();
        state.groupContext = data2.groupContext || state.groupContext;
        state.whatGoalOptions = Array.isArray(data2.whatGoalOptions)
          ? data2.whatGoalOptions
          : state.whatGoalOptions;
        state.roleWasGoalOptions = Array.isArray(data2.roleWasGoalOptions)
          ? data2.roleWasGoalOptions
          : [];
        if (state.roleGoalId && !selectedRoleGoal()) state.roleGoalId = null;
        state.howGoalsBase = Array.isArray(data2.howGoals) ? data2.howGoals : state.howGoalsBase;
        refreshHowGoals();
        if (data2.planningUserId) state.handoffUserId = Number(data2.planningUserId);
        const e2 = data2.existingEntry;
        if (
          !sharedPlanPhaseActive(params) &&
          e2 &&
          Number(data2.planningUserId) === wantFor &&
          Number(e2.user_id) === wantFor
        ) {
          state.existingEntry = e2;
          state.editingEntryId = null;
          state.entryId = e2.id;
        } else {
          state.editingEntryId = null;
          state.entryId = null;
          state.existingEntry = null;
        }
        if (!state.editingEntryId) syncActiveStep();
      }
    }
  }

  async function init(query) {
    const q = query || new URLSearchParams(location.search);

    state.date = q.get("date") || todayIso();
    state.entryId = q.get("entryId") || null;
    state.timeslot = q.get("timeslot") || null;
    state.subject = q.get("subject") || null;
    state.whatGoalId = null;
    state.roleGoalId = null;
    state.whatGoalText = "";
    state.selectedLevel = null;
    state.levelGoalText = "";
    state.howGoalText = null;
    state.startGoals = [];
    state.controlGoals = [];
    state.planBStrategies = parseMulti(
      window.LogbuchStrategies?.rememberedPlanB() || null,
      PLAN_B(state.subject)
    );
    syncSubjectScopedSelections();
    state.workGoals = [];
    state.socialForm = null;
    state.confidenceBefore = null;
    state.detailsText = "";
    state.whatGoalOptions = [];
    state.roleWasGoalOptions = [];
    state.checkpoints = [];
    state.selectedCheckpointId = null;
    state.nextCheckpoint = null;
    state.goalSource = "none";
    state.existingEntry = null;
    state.editingEntryId = null;
    state.hasClass = true;
    state.subjectLocked = false;
    state.submitting = false;
    state.errorMsg = "";
    state.activeStep = 1;
    state.step3Skipped = false;
    state.planBAcknowledged = false;
    state.suggestion = null;
    state.suggestionApplied = false;
    state.afterSaveOpen = false;
    state.groupContext = null;
    state.handoffUserId = null;
    const forUserInit = q.get("forUserId");
    if (forUserInit && Number.isFinite(Number(forUserInit)) && Number(forUserInit) > 0) {
      state.handoffUserId = Number(forUserInit);
    }
    state.roleSaving = false;
    teardownPlanNextModal();

    const root = document.getElementById("plan-screen-root");
    if (root) {
      root.innerHTML = `<div class="logbuch-loading">Lade Planung…</div>`;
    }

    try {
      await loadContext();
      render();
    } catch (err) {
      console.error(err);
      if (root) {
        root.innerHTML = UI().msg("Planung konnte nicht geladen werden.");
      }
    }
  }

  window.LogbuchPlan = { init };
})();
