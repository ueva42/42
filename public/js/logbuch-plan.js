/**
 * SRL-Logbuch – PLANEN-Screen (Tagesziel aus Levelplan + Nachweis).
 */
(function () {
  const C = () => window.LOGBUCH;
  const UI = () => window.LogbuchUI;
  const PLAN_B = () => window.LogbuchStrategies?.planBOptions() || window.LOGBUCH_PLAN_B_OPTIONS || [];
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

  const state = {
    date: null,
    timeslot: null,
    subject: null,
    whatGoalId: null,
    whatGoalText: "",
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
    afterSaveOpen: false
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

  const HOW_TO_CONTROL_STRATEGY = {
    "Ich vergleiche meinen Lösungsweg mit der Musterlösung.": "Mit Partner vergleichen",
    "Ich suche gezielt meine Fehler.": "Aufgaben Schritt für Schritt"
  };

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
    }
  };

  const LEVEL_TILE_META = {
    rookie: { title: "Rookie", desc: "Einstieg und Sicherheit.", icon: "1", accent: "#22d3ee" },
    operator: { title: "Operator", desc: "Sicher anwenden.", icon: "2", accent: "#a855f7" },
    street_legend: { title: "Street Legend", desc: "Meistern und erklären.", icon: "3", accent: "#d946ef" }
  };

  function howGoalTile(text) {
    const meta = HOW_GOAL_TILE_META[text];
    if (meta) return { value: text, ...meta };
    return {
      value: text,
      cat: "bearbeiten",
      title: text.length > 34 ? `${text.slice(0, 31)}…` : text,
      desc: text,
      icon: "◆",
      accent: "#a855f7"
    };
  }

  function planBTile(text) {
    const meta = PLAN_B_TILE_META[text];
    if (meta) return { value: text, ...meta };
    return {
      value: text,
      cat: "starten",
      title: text.length > 30 ? `${text.slice(0, 27)}…` : text,
      desc: text,
      icon: "◆",
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
    const tile = CONTROL_STRATEGY_TILES.find((t) => t.value === value);
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
    return state.howGoals.includes(text) || defaultStartGoalTexts().includes(text);
  }

  function startGoalTiles() {
    const seen = new Set();
    const tiles = [];
    // Fach-Ziele + Standard-Startkarten: eigene Wie-Ziele haben oft keine cat=starten
    for (const text of [...state.howGoals, ...HOW_GOAL_OPTIONS]) {
      const tile = howGoalTile(text);
      if (tile.cat !== "starten" || seen.has(tile.value)) continue;
      seen.add(tile.value);
      tiles.push(tile);
    }
    return tiles.length ? tiles : defaultStartGoalTexts().map(howGoalTile);
  }

  function controlGoalTiles() {
    return CONTROL_STRATEGY_TILES;
  }

  function arbeitGoalTiles() {
    return C().WORK_GOALS.map(arbeitTile);
  }

  function planBTilesAll() {
    return PLAN_B().map(planBTile);
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
    if (!state.afterSaveOpen) return "";
    const ui = UI();
    const goal = pickedWhatGoal();
    const material = goalPracticeMaterial(goal);
    const goalText = goal?.text || state.whatGoalText || "dein Unterpunkt";
    const materialBits = [material.label, material.note].filter(Boolean);

    let title = "Jetzt üben?";
    let text = "Öffne das hinterlegte Material und starte direkt mit deinem Tagesziel.";
    if (!material.hasMaterial) {
      title = "Weiter zum Lernstand";
      text =
        "Für diesen Unterpunkt ist noch kein Übungsmaterial hinterlegt. Trage im Lernstand ein, was in Arbeit ist und was schon sicher läuft.";
    } else if (!material.hasUrl) {
      title = "Dein Material";
      text =
        "So findest du die Aufgabe. Trage danach im Lernstand ein, was in Arbeit ist und was schon sicher läuft.";
    }

    const primary = material.hasUrl
      ? `<button type="button" class="btn-primary logbuch-submit today-app-btn" data-plan-next="practice">Jetzt üben</button>`
      : `<button type="button" class="btn-primary logbuch-submit today-app-btn" data-plan-next="levelplan">Zum Lernstand</button>`;
    const secondary = material.hasUrl
      ? `<button type="button" class="logbuch-btn-ghost today-app-btn today-app-btn--ghost" data-plan-next="levelplan">Zum Lernstand</button>`
      : "";

    return `
      <div class="plan-next-modal-backdrop" data-plan-after-save role="dialog" aria-modal="true" aria-label="${ui.escapeHtml(title)}">
        <div class="plan-next-modal">
          <p class="plan-next-modal__kicker">Tagesziel gespeichert</p>
          <h3 class="plan-next-modal__title">${ui.escapeHtml(title)}</h3>
          <p class="plan-next-modal__goal">Unterpunkt: <strong>${ui.escapeHtml(goalText)}</strong></p>
          ${
            materialBits.length
              ? `<div class="plan-next-modal__material">
                  <span class="plan-next-modal__material-label">Material</span>
                  <p>${ui.escapeHtml(materialBits.join(" · "))}</p>
                </div>`
              : ""
          }
          <p class="plan-next-modal__text">${ui.escapeHtml(text)}</p>
          <div class="plan-next-modal__actions">
            ${primary}
            ${secondary}
            <button type="button" class="logbuch-btn-ghost today-app-btn today-app-btn--ghost" data-plan-next="today">Zurück zu Mein Tag</button>
          </div>
        </div>
      </div>`;
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
    state.levelGoalText = levelGoalTextFor(goal, state.selectedLevel);
  }

  function checkpointSatisfied() {
    if (!state.checkpoints.length) return true;
    if (state.checkpoints.length === 1) return true;
    return !!state.selectedCheckpointId;
  }

  /** Feine Abfolge: Was → Level → Start → Arbeit → Kontrolle → Plan B → Selbstcheck */
  function whatStepComplete() {
    return !!(
      state.subject &&
      state.whatGoalId &&
      checkpointSatisfied() &&
      state.whatGoalOptions.length
    );
  }

  function levelStepComplete() {
    return !!(state.selectedLevel && state.levelGoalText);
  }

  function startStepComplete() {
    return state.startGoals.length >= 1 && state.startGoals.length <= 3;
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
    return whatStepComplete() && levelStepComplete();
  }

  function step2Complete() {
    return startStepComplete() && workStepComplete() && controlStepComplete();
  }

  function step3Complete() {
    return confidenceStepComplete();
  }

  function syncActiveStep() {
    if (state.activeStep >= 2 && !whatStepComplete()) {
      state.activeStep = 1;
      return;
    }
    if (state.activeStep >= 3 && !levelStepComplete()) {
      state.activeStep = 2;
      return;
    }
    if (state.activeStep >= 4 && !startStepComplete()) {
      state.activeStep = 3;
      return;
    }
    if (state.activeStep >= 5 && !workStepComplete()) {
      state.activeStep = 4;
      return;
    }
    if (state.activeStep >= 6 && !controlStepComplete()) {
      state.activeStep = 5;
      return;
    }
    if (state.activeStep >= 7 && !planBStepComplete()) {
      state.activeStep = 6;
      return;
    }
    // Auto nur bei Einzelschritten; Mehrfachauswahl braucht „Weiter“
    if (state.activeStep === 1 && whatStepComplete()) state.activeStep = 2;
    else if (state.activeStep === 2 && levelStepComplete()) state.activeStep = 3;
    else if (state.activeStep === 7 && confidenceStepComplete()) state.activeStep = 8;
  }

  function openStep(step) {
    state.activeStep = Number(step);
    render();
  }

  function whatStepSummary() {
    const parts = [];
    if (state.subject) parts.push(state.subject);
    if (state.whatGoalText) parts.push(state.whatGoalText);
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

  function renderAskProgress(step, total = 7) {
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
    return `
      <div class="plan-next-modal-backdrop plan-next-modal-backdrop--ask" role="dialog" aria-modal="true" aria-label="${title}">
        <div class="plan-next-modal plan-next-modal--ask">
          ${renderAskProgress(step)}
          <p class="plan-next-modal__kicker">Schritt ${step} von 7</p>
          <h3 class="plan-next-modal__title">${title}</h3>
          ${hint ? `<p class="plan-next-modal__text">${hint}</p>` : ""}
          ${state.errorMsg ? `<p class="plan-next-modal__text" style="color:#fca5a5">${UI().escapeHtml(state.errorMsg)}</p>` : ""}
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
          ${renderAskProgress(8)}
          <p class="plan-next-modal__kicker">Bereit</p>
          <h3 class="plan-next-modal__title">Meine Mission heute</h3>
          <p class="plan-next-modal__text">Prüfe kurz, dann speichern – danach geht’s weiter zum Üben.</p>
          <div id="planSummaryCard">${renderPlanSummaryContent(ui)}</div>
          ${state.errorMsg ? ui.msg(state.errorMsg) : ""}
          <div class="plan-next-modal__actions">
            <button type="button" class="btn-primary logbuch-submit today-app-btn" id="planSubmitBtn" ${
              state.submitting || !missionReady ? "disabled" : ""
            }>${
              state.submitting
                ? "Speichern…"
                : state.editingEntryId
                  ? "Änderungen speichern"
                  : "Tagesziel speichern (+2 XP)"
            }</button>
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
      <section class="way-section way-section--start">
        <header class="way-section__head">
          <h4 class="way-section__title">Ich starte so</h4>
          <p class="way-section__hint">1 bis 3 Auswahlen</p>
        </header>
        <p class="way-to-goal__intro">Wähle aus, wie du heute starten willst.</p>
        ${V.strategyTileGrid(startGoalTiles(), state.startGoals, "data-start-goal", { multi: true })}
      </section>`;
  }

  function renderWorkSection(ui) {
    const V = window.LogbuchVisuals;
    if (!V) return "";
    return `
      <section class="way-section way-section--work">
        <header class="way-section__head">
          <h4 class="way-section__title">Ich arbeite so</h4>
          <p class="way-section__hint">1 bis 3 Auswahlen</p>
        </header>
        <p class="way-to-goal__intro">Wie willst du während der Stunde arbeiten?</p>
        ${V.strategyTileGrid(arbeitGoalTiles(), state.workGoals, "data-work-goal", { multi: true })}
      </section>`;
  }

  function renderControlSection(ui) {
    const V = window.LogbuchVisuals;
    if (!V) return "";
    return `
      <section class="way-section way-section--control">
        <header class="way-section__head">
          <h4 class="way-section__title">Ich kontrolliere so</h4>
          <p class="way-section__hint">1 bis 3 Auswahlen</p>
        </header>
        <p class="way-to-goal__intro">Woran merkst du, dass du auf dem Weg bist?</p>
        ${V.strategyTileGrid(controlGoalTiles(), state.controlGoals, "data-control-goal", { multi: true })}
      </section>`;
  }

  function renderPlanBSection(ui) {
    const V = window.LogbuchVisuals;
    if (!V) return "";
    return `
      <section class="way-section way-section--planb">
        <header class="way-section__head">
          <h4 class="way-section__title">Plan B, wenn ich hänge</h4>
          <p class="way-section__hint">bis 3 Auswahlen · optional</p>
        </header>
        <p class="way-to-goal__intro">Was machst du, wenn du feststeckst?</p>
        ${V.strategyTileGrid(planBTilesAll(), state.planBStrategies, "data-plan-b", { multi: true })}
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
    const startTitles = overviewTitles(e.how_goal_text || e.goal, HOW_GOAL_OPTIONS, howGoalTile);
    const workTitles = workGoals.map((g) => arbeitTile(g).title);
    const planBTitles = overviewTitles(e.plan_b_strategy_text, PLAN_B(), planBTile);
    const controlAllowed = CONTROL_STRATEGY_TILES.map((t) => t.value);
    const controlTitles = overviewTitles(e.strategy, controlAllowed, (value) => {
      const tile = CONTROL_STRATEGY_TILES.find((t) => t.value === value);
      return tile || { title: controlLabel(value) };
    });
    const details = String(e.details_text || e.freitext || "").trim();
    const mission = e.level_goal_text || "";

    const factTiles = [
      overviewTileHtml(ui, { label: "Fach", value: e.subject, accent: "#22d3ee" }),
      overviewTileHtml(ui, {
        label: "Level",
        value: e.selected_level ? levelLabel(e.selected_level) : "",
        accent: "#a855f7"
      }),
      overviewTileHtml(ui, { label: "Unterthema", value: e.what_goal_text, accent: "#38bdf8" }),
      overviewTileHtml(ui, {
        label: "Nachweis",
        value: e.checkpoint_title || "Kein kommender Nachweis",
        accent: "#f59e0b"
      })
    ]
      .filter(Boolean)
      .join("");

    const pathTiles = [
      overviewTileHtml(ui, { label: "Start", chips: startTitles, accent: "#22d3ee" }),
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
      const tile = CONTROL_STRATEGY_TILES.find((t) => t.value === g);
      return tile?.desc || `Ich kontrolliere: ${controlLabel(g)}`;
    });

    const wegLines = [
      ...state.startGoals,
      ...arbeitLines.map((line) => `Ich arbeite: ${line}`),
      ...controlLines
    ].filter(Boolean);

    return `
      <div class="mission-summary">
        ${
          state.levelGoalText
            ? `<div class="mission-summary__block">
          <p class="mission-summary__label">Was ich heute können will</p>
          <p class="mission-summary__value">${ui.escapeHtml(state.levelGoalText)}</p>
        </div>`
            : ""
        }
        ${
          state.selectedLevel
            ? `<div class="mission-summary__block">
          <p class="mission-summary__label">Mein Level</p>
          <p class="mission-summary__value">${ui.escapeHtml(levelLabel(state.selectedLevel))}</p>
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
            <p class="plan-app-hero__eyebrow">Schritt ${Math.min(state.activeStep, 7)} von 7 · Planen</p>
            <h2 class="plan-app-hero__title">Tagesziel setzen</h2>
            <p class="plan-app-hero__meta">Eine Frage nach der anderen – so bleibt der Fokus klar.</p>
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

  function applyEntryToForm(entry) {
    state.editingEntryId = entry.id;
    state.entryId = entry.id;
    state.subject = entry.subject;
    if (entry.timeslot) state.timeslot = entry.timeslot;
    state.whatGoalId = entry.what_goal_id;
    state.whatGoalText = entry.what_goal_text || "";
    state.selectedLevel = entry.selected_level;
    state.levelGoalText = entry.level_goal_text || "";

    const how = entry.how_goal_text || entry.goal || null;
    const startAllowed = HOW_GOAL_OPTIONS;
    state.startGoals = parseMulti(how, startAllowed);
    if (!state.startGoals.length && how) {
      const howCat = howGoalTile(how).cat;
      if (howCat === "starten" || !howCat) state.startGoals = [how];
    }
    state.howGoalText = joinMulti(state.startGoals);

    const controlAllowed = CONTROL_STRATEGY_TILES.map((t) => t.value);
    state.controlGoals = parseMulti(entry.strategy, controlAllowed);
    if (!state.controlGoals.length && how) {
      const mapped = HOW_TO_CONTROL_STRATEGY[how];
      if (mapped) state.controlGoals = [mapped];
    }

    state.planBStrategies = parseMulti(entry.plan_b_strategy_text, PLAN_B());
    state.detailsText = entry.details_text || entry.freitext || "";
    state.workGoals = Array.isArray(entry.work_goals) ? entry.work_goals : [];
    state.socialForm = entry.social_form || null;
    state.confidenceBefore = entry.confidence_before ?? null;
    state.selectedCheckpointId = entry.checkpoint_id || null;
    state.existingEntry = null;
    refreshHowGoals();
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

    const levelMeaning = state.levelGoalText;
    const sWhat = whatStepComplete();
    const sLevel = levelStepComplete();
    const sStart = startStepComplete();
    const sWork = workStepComplete();
    const sControl = controlStepComplete();
    const sPlanB = planBStepComplete();
    const sConf = confidenceStepComplete();
    const missionReady = sWhat && sLevel && sStart && sWork && sControl && sPlanB;

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
        ${renderCheckpointField(ui)}
        ${ui.fieldWrap(
          ui.fieldLabel("Unterthema", { required: true }),
          state.whatGoalOptions.length
            ? ui.select(
                "whatGoalId",
                state.whatGoalOptions.map((g) => ({ value: g.id, label: g.text })),
                state.whatGoalId,
                { phase: "plan", placeholder: "Unterthema wählen…" }
              )
            : whatGoalMessage(ui)
        )}
      </div>`;

    const levelBody = `
      <div class="goal-step-card__stack">
        ${renderLevelTiles(ui)}
        ${
          levelMeaning
            ? `<div class="plan-level-meaning glow-panel glow-panel--violet">
                <span class="plan-level-meaning-label">${ui.escapeHtml(levelMeaningLabel(state.selectedLevel))}</span>
                <p>${ui.escapeHtml(levelMeaning)}</p>
              </div>`
            : state.selectedLevel && state.whatGoalId
              ? `<div class="logbuch-msg logbuch-msg-info">Für dieses Level wurde noch kein Zieltext hinterlegt.</div>`
              : ""
        }
        ${
          state.whatGoalId && state.selectedLevel
            ? ui.fieldWrap(
                ui.fieldLabel("Was genau machst du?", { optional: true }),
                `<input type="text" class="logbuch-input app-input" id="planDetailsText" maxlength="100"
            placeholder="z. B. Rookie 1–4, danach Operator 1–2"
            value="${ui.escapeHtml(state.detailsText)}">
           <div class="logbuch-char-count"><span id="planDetailsCount">${state.detailsText.length}</span>/100</div>`,
                "",
                { wide: true }
              )
            : ""
        }
      </div>`;

    const confidenceBody = `
      <div class="goal-step-card__stack">
        ${renderConfidenceCards(ui)}
        ${continueRow(
          "planStep3Continue",
          state.confidenceBefore != null ? "Weiter zur Mission" : "Ohne Angabe weiter"
        )}
      </div>`;

    const startBody = `<div class="goal-step-card__stack">${renderStartSection(ui)}${continueRow(
      "planStartContinue",
      "Weiter",
      sStart
    )}</div>`;
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
      state.planBStrategies.length ? "Weiter" : "Ohne Plan B weiter",
      true
    )}</div>`;

    const stepPopup = state.afterSaveOpen
      ? ""
      : state.activeStep >= 8
        ? renderMissionPopup(ui, missionReady)
        : state.activeStep === 1
          ? renderStepPopup({
              step: 1,
              title: "Was will ich heute können?",
              hint: "Wähle Fach und Unterthema.",
              body: whatBody,
              showBack: false
            })
          : state.activeStep === 2
            ? renderStepPopup({
                step: 2,
                title: "Mein Level",
                hint: "Rookie, Operator oder Street Legend.",
                body: levelBody
              })
            : state.activeStep === 3
              ? renderStepPopup({
                  step: 3,
                  title: "Ich starte so",
                  hint: "1 bis 3 Karten – so beginnst du.",
                  body: startBody
                })
              : state.activeStep === 4
                ? renderStepPopup({
                    step: 4,
                    title: "Ich arbeite so",
                    hint: "1 bis 3 Karten – so bleibst du dran.",
                    body: workBody
                  })
                : state.activeStep === 5
                  ? renderStepPopup({
                      step: 5,
                      title: "Ich kontrolliere so",
                      hint: "1 bis 3 Karten – so merkst du, ob du’s kannst.",
                      body: controlBody
                    })
                  : state.activeStep === 6
                    ? renderStepPopup({
                        step: 6,
                        title: "Plan B, wenn ich hänge",
                        hint: "Optional – falls du feststeckst.",
                        body: planBBody
                      })
                    : renderStepPopup({
                        step: 7,
                        title: "Selbstcheck",
                        hint: "Optional – wie sicher fühlst du dich?",
                        body: confidenceBody
                      });

    root.innerHTML = `
      <div class="plan-app plan-app--ask">
        ${renderPlanHero(ui, dateLabel)}
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
      root.querySelectorAll("[data-start-goal]").forEach((chip) => {
        const active = state.startGoals.includes(chip.dataset.startGoal);
        chip.classList.toggle("is-active", active);
        const check = chip.querySelector(".strategy-tile__check");
        if (active && !check) {
          chip.insertAdjacentHTML(
            "afterbegin",
            `<span class="strategy-tile__check" aria-hidden="true">✓</span>`
          );
        } else if (!active) check?.remove();
      });
      afterChoiceChange(root);
    });

    bindChoiceChips(root, "[data-control-goal]", (btn) => {
      toggleMulti(state.controlGoals, btn.dataset.controlGoal, 3);
      root.querySelectorAll("[data-control-goal]").forEach((chip) => {
        const active = state.controlGoals.includes(chip.dataset.controlGoal);
        chip.classList.toggle("is-active", active);
        const check = chip.querySelector(".strategy-tile__check");
        if (active && !check) {
          chip.insertAdjacentHTML(
            "afterbegin",
            `<span class="strategy-tile__check" aria-hidden="true">✓</span>`
          );
        } else if (!active) check?.remove();
      });
      afterChoiceChange(root);
    });

    bindChoiceChips(root, "[data-plan-b]", (btn) => {
      toggleMulti(state.planBStrategies, btn.dataset.planB, 3);
      root.querySelectorAll("[data-plan-b]").forEach((chip) => {
        const active = state.planBStrategies.includes(chip.dataset.planB);
        chip.classList.toggle("is-active", active);
        const check = chip.querySelector(".strategy-tile__check");
        if (active && !check) {
          chip.insertAdjacentHTML(
            "afterbegin",
            `<span class="strategy-tile__check" aria-hidden="true">✓</span>`
          );
        } else if (!active) check?.remove();
      });
      updatePlanningPreview(root);
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
        root.querySelectorAll("[data-work-goal]").forEach((chip) => {
          chip.classList.toggle("is-active", state.workGoals.includes(chip.dataset.workGoal));
        });
        afterChoiceChange(root);
      });
    });
  }

  function planModalScope(root) {
    return document.querySelector("body > .plan-next-modal-backdrop") || root;
  }

  function bindHandlers(root) {
    const scope = planModalScope(root);
    UI().bindSelects(scope, state, async (field) => {
      if (field === "subject") {
        state.whatGoalId = null;
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
      if (field === "whatGoalId") {
        state.selectedLevel = null;
        state.levelGoalText = "";
        state.startGoals = [];
        state.howGoalText = null;
        state.controlGoals = [];
        state.planBAcknowledged = false;
        syncLevelGoalText();
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
        syncActiveStep();
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
        if (step >= 3 && !levelStepComplete() && state.activeStep !== step) return;
        if (step >= 4 && !startStepComplete() && state.activeStep !== step) return;
        if (step >= 5 && !workStepComplete() && state.activeStep !== step) return;
        if (step >= 6 && !controlStepComplete() && state.activeStep !== step) return;
        if (step >= 7 && !planBStepComplete() && state.activeStep !== step) return;
        openStep(step);
      });
    });

    scope.querySelector("#planAskBack")?.addEventListener("click", () => {
      state.activeStep = Math.max(1, Number(state.activeStep) - 1);
      render();
    });

    scope.querySelector("#planStartContinue")?.addEventListener("click", () => {
      if (!startStepComplete()) return;
      state.activeStep = 4;
      render();
    });
    scope.querySelector("#planWorkContinue")?.addEventListener("click", () => {
      if (!workStepComplete()) return;
      state.activeStep = 5;
      render();
    });
    scope.querySelector("#planControlContinue")?.addEventListener("click", () => {
      if (!controlStepComplete()) return;
      state.activeStep = 6;
      render();
    });
    scope.querySelector("#planPlanBContinue")?.addEventListener("click", () => {
      state.planBAcknowledged = true;
      state.activeStep = 7;
      render();
    });

    scope.querySelector("#planStep3Continue")?.addEventListener("click", () => {
      if (state.confidenceBefore == null) state.step3Skipped = true;
      syncActiveStep();
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

    scope.querySelector("#planSubmitBtn")?.addEventListener("click", submitPlan);
    scope.querySelector("#planBackBtn")?.addEventListener("click", () => {
      goToTodayFromPlan();
    });
  }

  async function submitPlan() {
    if (state.submitting) return;

    function fail(msg, step) {
      state.errorMsg = msg;
      if (step) state.activeStep = step;
      render();
    }

    if (!state.subject) {
      fail("Bitte wähle ein Fach.", 1);
      return;
    }
    if (!state.whatGoalId) {
      fail("Bitte wähle ein Was-Ziel aus dem Levelplan.", 1);
      return;
    }
    if (state.checkpoints.length > 1 && !state.selectedCheckpointId) {
      fail("Bitte wähle den Nachweis, für den du arbeitest.", 1);
      return;
    }
    if (!state.selectedLevel) {
      fail("Bitte wähle ein Level.", 2);
      return;
    }
    syncLevelGoalText();
    if (!state.levelGoalText) {
      fail("Für dieses Level wurde noch kein Zieltext hinterlegt.", 2);
      return;
    }
    if (!state.startGoals.length) {
      fail("Bitte wähle, wie du startest (1–3 Karten unter „Ich starte so“).", 3);
      return;
    }
    if (state.workGoals.length < 1) {
      fail("Bitte wähle, wie du arbeitest (1–3 Karten unter „Ich arbeite so“).", 4);
      return;
    }
    if (!state.controlGoals.length) {
      fail("Bitte wähle, wie du kontrollierst (1–3 Karten unter „Ich kontrolliere so“).", 5);
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
    const strategyJoined = joinMulti(state.controlGoals);
    const planBJoined = joinMulti(state.planBStrategies);

    try {
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
          freitext: state.detailsText.trim() || null
        })
      });

      const data = await res.json();

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
      state.afterSaveOpen = true;
      render();
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

    const res = await fetch(`/api/student/log/plan-context?${params}`);
    if (!res.ok) {
      throw new Error(`Plan-Kontext konnte nicht geladen werden (${res.status})`);
    }
    const data = await res.json();

    state.socialUnlock = data.socialUnlock || { gruppe: false, frei: false };
    state.existingEntry = data.existingEntry || null;
    if (data.existingEntry?.canEdit) {
      applyEntryToForm(data.existingEntry);
      state.planBAcknowledged = true;
      state.activeStep = 8;
    }
    state.hasClass = data.hasClass !== false;
    state.howGoalsBase = Array.isArray(data.howGoals) ? data.howGoals : HOW_GOAL_OPTIONS;
    refreshHowGoals();
    state.whatGoalOptions = Array.isArray(data.whatGoalOptions) ? data.whatGoalOptions : [];
    state.levelOptions = Array.isArray(data.levelOptions) ? data.levelOptions : LEVEL_OPTIONS;
    state.checkpoints = Array.isArray(data.checkpoints) ? data.checkpoints : [];
    state.nextCheckpoint = data.selectedCheckpoint || data.nextCheckpoint || null;
    state.selectedCheckpointId =
      data.selectedCheckpoint?.id ||
      state.selectedCheckpointId ||
      (state.checkpoints.length === 1 ? state.checkpoints[0].id : null);
    state.goalSource = data.goalSource || "none";
    state.subjectLocked = !!data.subjectLocked;

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

    if (state.startGoals.length) {
      state.startGoals = state.startGoals.filter((g) => isAllowedStartGoal(g));
      state.howGoalText = joinMulti(state.startGoals);
    }
    if (state.whatGoalId) {
      const picked = state.whatGoalOptions.find((g) => String(g.id) === String(state.whatGoalId));
      if (picked) {
        syncLevelGoalText();
      } else {
        state.whatGoalId = null;
        state.whatGoalText = "";
        state.selectedLevel = null;
        state.levelGoalText = "";
      }
    }
    if (!state.editingEntryId) syncActiveStep();
  }

  async function init(query) {
    const q = query || new URLSearchParams(location.search);

    state.date = q.get("date") || todayIso();
    state.entryId = q.get("entryId") || null;
    state.timeslot = q.get("timeslot") || null;
    state.subject = q.get("subject") || null;
    state.whatGoalId = null;
    state.whatGoalText = "";
    state.selectedLevel = null;
    state.levelGoalText = "";
    state.howGoalText = null;
    state.startGoals = [];
    state.controlGoals = [];
    state.planBStrategies = parseMulti(
      window.LogbuchStrategies?.rememberedPlanB() || null,
      PLAN_B()
    );
    state.workGoals = [];
    state.socialForm = null;
    state.confidenceBefore = null;
    state.detailsText = "";
    state.whatGoalOptions = [];
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
