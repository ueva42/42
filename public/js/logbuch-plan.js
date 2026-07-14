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
    planBStrategyText: null,
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
    strategyCategory: "starten",
    planBCategory: "starten"
  };

  const STRATEGY_TABS = [
    { id: "starten", label: "Ich starte", accent: "#fb923c" },
    { id: "bearbeiten", label: "Ich arbeite", accent: "#a855f7" },
    { id: "kontrollieren", label: "Ich kontrolliere", accent: "#22d3ee" }
  ];

  const HOW_GOAL_TILE_META = {
    "Ich schaue mir zuerst ein Beispiel an.": {
      cat: "starten",
      title: "Beispiel anschauen",
      desc: "Schau zuerst eine Beispielaufgabe an.",
      icon: "◎",
      accent: "#fb923c"
    },
    "Ich starte mit Rookie-Aufgaben.": {
      cat: "starten",
      title: "Rookie starten",
      desc: "Beginne mit einfachen Aufgaben.",
      icon: "1",
      accent: "#fb923c"
    },
    "Ich löse erst mit Hilfe und danach alleine.": {
      cat: "starten",
      title: "Mit Hilfe starten",
      desc: "Löse erst mit Hilfe, dann alleine.",
      icon: "⇄",
      accent: "#fb923c"
    },
    "Ich schaue ein Lernvideo und notiere drei wichtige Punkte.": {
      cat: "starten",
      title: "Lernvideo nutzen",
      desc: "Video schauen und 3 Punkte notieren.",
      icon: "▶",
      accent: "#fb923c"
    },
    "Ich wiederhole ein unsicheres Ziel.": {
      cat: "starten",
      title: "Ziel wiederholen",
      desc: "Wiederhole etwas, das noch unsicher ist.",
      icon: "↺",
      accent: "#fb923c"
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
      accent: "#fb923c"
    },
    "Ich markiere gegeben und gesucht.": {
      cat: "starten",
      title: "Gegeben & gesucht",
      desc: "Markiere, was gegeben und gesucht ist.",
      icon: "◫",
      accent: "#fb923c"
    },
    "Ich nutze eine Hilfestellung.": {
      cat: "starten",
      title: "Hilfe nutzen",
      desc: "Nutze eine Hilfestellung bewusst.",
      icon: "?",
      accent: "#fb923c"
    },
    "Ich starte mit einer einfachen Rookie-Aufgabe.": {
      cat: "starten",
      title: "Rookie-Start",
      desc: "Starte klein und einfach.",
      icon: "1",
      accent: "#fb923c"
    },
    "Ich arbeite 5 Minuten konzentriert an einer kleinen Aufgabe.": {
      cat: "starten",
      title: "5-Minuten-Start",
      desc: "Kurz fokussiert anfangen.",
      icon: "⏱",
      accent: "#fb923c"
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
      accent: "#fb923c"
    };
  }

  function syncStrategyCategoryFromSelection() {
    if (state.howGoalText) {
      state.strategyCategory = howGoalTile(state.howGoalText).cat;
    }
    if (state.planBStrategyText) {
      state.planBCategory = planBTile(state.planBStrategyText).cat;
    }
  }

  function filteredHowGoalTiles() {
    return state.howGoals
      .map(howGoalTile)
      .filter((tile) => tile.cat === state.strategyCategory);
  }

  function filteredPlanBTiles() {
    return PLAN_B().map(planBTile).filter((tile) => tile.cat === state.planBCategory);
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
        label: locked ? `${sf.label} (Silber/Gold)` : sf.label,
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

  function levelGoalTextFor(goal, level) {
    if (!goal || !level) return "";
    if (level === "rookie") return String(goal.rookieGoalText || "").trim();
    if (level === "operator") return String(goal.operatorGoalText || "").trim();
    if (level === "street_legend") return String(goal.streetLegendGoalText || "").trim();
    return "";
  }

  function levelMeaningLabel(level) {
    if (level === "rookie") return "Auf Rookie-Level heißt das:";
    if (level === "operator") return "Auf Operator-Level heißt das:";
    if (level === "street_legend") return "Auf Street-Legend-Level heißt das:";
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
    if (state.howGoalText && !state.howGoals.includes(state.howGoalText)) {
      state.howGoalText = null;
    }
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

  function requiredFieldsComplete() {
    return !!(
      state.subject &&
      state.whatGoalId &&
      state.selectedLevel &&
      state.levelGoalText &&
      state.howGoalText &&
      checkpointSatisfied() &&
      state.whatGoalOptions.length
    );
  }

  function renderWorkGoalTiles(ui) {
    const V = window.LogbuchVisuals;
    if (!V) return "";
    const tiles = C().WORK_GOALS.map((goal) => ({
      value: goal,
      title: goal,
      desc: "Arbeitsfokus wählen",
      icon: "◈",
      accent: "#22d3ee"
    }));
    return ui.fieldWrap(
      ui.fieldLabel("Arbeitsfokus", { optional: true }),
      V.strategyTileGrid(tiles, state.workGoals, "data-work-goal", { multi: true }),
      "Wähle optional mehrere Fokus-Karten."
    );
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
      V.strategyTileGrid(tiles, state.selectedLevel, "data-level")
    );
  }

  function renderStrategyLoadout(ui) {
    const V = window.LogbuchVisuals;
    if (!V || !state.whatGoalId || !state.selectedLevel) return "";

    return `
      <div class="loadout-panel">
        <p class="loadout-panel__label">Hauptstrategie</p>
        ${V.strategyCategoryTabs(STRATEGY_TABS, state.strategyCategory)}
        ${V.strategyTileGrid(filteredHowGoalTiles(), state.howGoalText, "data-how-goal")}

        <p class="loadout-panel__label loadout-panel__label--planb">Notfall-Plan B</p>
        ${V.strategyCategoryTabs(STRATEGY_TABS, state.planBCategory, "data-plan-b-category")}
        ${V.strategyTileGrid(filteredPlanBTiles(), state.planBStrategyText, "data-plan-b")}
      </div>`;
  }

  function renderConfidenceCards(ui) {
    const V = window.LogbuchVisuals;
    if (!V) return "";
    return ui.fieldWrap(
      ui.fieldLabel("Wie sicher fühlst du dich vorher?", { optional: true }),
      V.confidenceSelector(
        [
          { value: 1, label: "Unsicher", icon: "◎", accent: "#f472b6" },
          { value: 2, label: "Eher unsicher", icon: "◔", accent: "#fb923c" },
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
      title: opt.label.replace(" (Silber/Gold)", ""),
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

  function dailyGoalBlockHtml(ui, entry) {
    const levelGoal = entry?.level_goal_text || state.levelGoalText;
    const howGoal = entry?.how_goal_text || entry?.goal || state.howGoalText;
    const details = entry?.details_text || state.detailsText;
    if (!levelGoal || !howGoal) return "";

    return `
      <div class="plan-daily-goal">
        <p class="plan-daily-goal-title">Dein Tagesziel heute</p>
        <div class="plan-daily-goal-card">
          <p><strong>Ich arbeite an diesem Ziel:</strong><br>${ui.escapeHtml(levelGoal)}</p>
          <p><strong>Mein Weg:</strong><br>${ui.escapeHtml(howGoal)}</p>
          ${
            details && String(details).trim()
              ? `<p><strong>Konkret:</strong><br>${ui.escapeHtml(String(details).trim())}</p>`
              : ""
          }
          ${
            (entry?.plan_b_strategy_text || state.planBStrategyText)
              ? `<p><strong>Plan B, wenn ich hänge:</strong><br>${ui.escapeHtml(entry?.plan_b_strategy_text || state.planBStrategyText)}</p>`
              : ""
          }
        </div>
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
    if (!requiredFieldsComplete()) {
      return `<p class="plan-summary-empty">Fülle die Karten oben aus – hier siehst du dann deine Zusammenfassung.</p>`;
    }

    const checkpoint = pickedCheckpoint();
    const checkpointLabel =
      checkpoint?.label ||
      (state.checkpoints.length === 1 ? state.checkpoints[0]?.label : null) ||
      "Kein Nachweis geplant";

    const rows = [
      ["Fach", state.subject || "–"],
      ["Nachweis", checkpointLabel],
      ["Unterthema", state.whatGoalText || "–"],
      ["Level", state.selectedLevel ? levelLabel(state.selectedLevel) : "–"],
      ["Ziel", state.levelGoalText || "–"],
      ["Arbeitsweg", state.howGoalText || "–"],
      ["Plan B", state.planBStrategyText || "–"],
      ["Arbeitsziele", state.workGoals.length ? state.workGoals.join(", ") : "–"],
      ["Sozialform", state.socialForm ? labelForSocialForm(state.socialForm) : "–"],
      [
        "Sicherheit",
        state.confidenceBefore != null
          ? `${state.confidenceBefore} / 5`
          : "–"
      ],
      ["Belohnung", state.editingEntryId ? "Kein zusätzliches XP" : "+2 XP"]
    ];

    return `
      <dl class="plan-summary-list">
        ${rows
          .map(
            ([label, value]) => `
          <div class="plan-summary-row">
            <dt>${ui.escapeHtml(label)}</dt>
            <dd>${ui.escapeHtml(value)}</dd>
          </div>`
          )
          .join("")}
      </dl>
      ${dailyGoalBlockHtml(ui)}`;
  }

  function renderPlanHero(ui, dateLabel) {
    return `
      <article class="plan-app-hero">
        <div class="plan-app-hero__content">
          <div class="plan-app-hero__icon" aria-hidden="true">
            <img src="/icons/student/png/mein-tag.png" alt="" aria-hidden="true">
          </div>
          <div class="plan-app-hero__copy">
            <p class="plan-app-hero__eyebrow">Planen</p>
            <h2 class="plan-app-hero__title">Tagesziel setzen</h2>
            <p class="plan-app-hero__meta">${ui.escapeHtml(dateLabel)}${state.timeslot ? ` · ${ui.escapeHtml(state.timeslot)}` : ""}${state.subject ? ` · ${ui.escapeHtml(state.subject)}` : ""}</p>
          </div>
        </div>
        <div class="plan-app-hero__visual" aria-hidden="true">
          <img src="/icons/student/hero/mein-tag-hero.png" alt="" aria-hidden="true" loading="lazy">
        </div>
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
    state.howGoalText = entry.how_goal_text || entry.goal || null;
    state.planBStrategyText = entry.plan_b_strategy_text || null;
    state.detailsText = entry.details_text || entry.freitext || "";
    state.workGoals = Array.isArray(entry.work_goals) ? entry.work_goals : [];
    state.socialForm = entry.social_form || null;
    state.confidenceBefore = entry.confidence_before ?? null;
    state.selectedCheckpointId = entry.checkpoint_id || null;
    state.existingEntry = null;
    refreshHowGoals();
    syncStrategyCategoryFromSelection();
  }

  function renderExistingEntry(ui, dateLabel) {
    const e = state.existingEntry;
    const workGoals = Array.isArray(e.work_goals) ? e.work_goals : [];

    const rows = [
      ["Fach", e.subject],
      ["Nächster Nachweis", e.checkpoint_title || "Kein kommender Nachweis gefunden."],
      ["Was-Ziel", e.what_goal_text || "–"],
      ["Level", e.selected_level ? levelLabel(e.selected_level) : "–"],
      ["Fachliches Ziel", e.level_goal_text || "–"],
      ["Wie-Ziel", e.how_goal_text || e.goal || "–"],
      ["Arbeitsziele", workGoals.length ? workGoals.join(", ") : "–"],
      ["Sozialform", e.social_form ? labelForSocialForm(e.social_form) : "–"],
      [
        "Wie sicher fühlst du dich vorher?",
        e.confidence_before != null ? String(e.confidence_before) : "–"
      ],
      ["Was genau?", e.details_text || e.freitext || "–"]
    ];
    if (e.plan_b_strategy_text) {
      rows.push(["Plan B, wenn ich hänge", e.plan_b_strategy_text]);
    }

    return `
      <div class="logbuch-form logbuch-form-readonly">
        <p class="logbuch-meta">${ui.escapeHtml(dateLabel)}${e.timeslot ? ` · ${ui.escapeHtml(e.timeslot)}` : ""}</p>
        <div class="logbuch-msg logbuch-msg-info">Dein Tagesziel (nur Ansicht – nach dem Tagesabschluss nicht mehr änderbar)</div>
        ${dailyGoalBlockHtml(ui, e)}
        <dl class="plan-readonly-list">
          ${rows
            .map(
              ([label, value]) => `
            <div class="plan-readonly-row">
              <dt>${ui.escapeHtml(label)}</dt>
              <dd>${ui.escapeHtml(value)}</dd>
            </div>`
            )
            .join("")}
        </dl>
        ${ui.btnGhost("Zurück zu Mein Tag", "planBackBtn")}
      </div>`;
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

    root.innerHTML = `
      <div class="plan-app">
        ${renderPlanHero(ui, dateLabel)}

        ${
          state.editingEntryId
            ? `<div class="logbuch-msg logbuch-msg-info">Du bearbeitest dein Tagesziel – beim Speichern gibt es kein zusätzliches XP.</div>`
            : ""
        }

        <div class="plan-app-grid">
          ${renderGoalStepCard(
            1,
            "Rahmen",
            `
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
            </div>`
          )}

          ${renderGoalStepCard(
            2,
            "Lernziel",
            `
            <div class="goal-step-card__stack">
              ${ui.fieldWrap(
                ui.fieldLabel("Was willst du heute können?", { required: true }),
                state.whatGoalOptions.length
                  ? ui.select(
                      "whatGoalId",
                      state.whatGoalOptions.map((g) => ({ value: g.id, label: g.text })),
                      state.whatGoalId,
                      { phase: "plan", placeholder: "Unterthema wählen…" }
                    )
                  : whatGoalMessage(ui)
              )}
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
            </div>`
          )}

          ${renderGoalStepCard(
            3,
            "Dein Loadout",
            `
            <div class="goal-step-card__stack">
              ${renderStrategyLoadout(ui)}
              ${renderSocialTiles(ui)}
              ${renderWorkGoalTiles(ui)}
            </div>`
          )}

          ${renderGoalStepCard(
            4,
            "Selbstcheck",
            `<div class="goal-step-card__stack">${renderConfidenceCards(ui)}</div>`
          )}

          ${renderGoalStepCard(
            5,
            "Mission Summary",
            `
            <div id="planSummaryCard">${renderPlanSummaryContent(ui)}</div>
            ${state.errorMsg ? ui.msg(state.errorMsg) : ""}
            <div class="plan-app-footer">
              ${ui.btnPrimary(
                state.submitting
                  ? "Speichern…"
                  : state.editingEntryId
                    ? "Änderungen speichern"
                    : "Tagesziel speichern (+2 XP)",
                "planSubmitBtn",
                state.submitting || !requiredFieldsComplete(),
                "logbuch-submit-full today-app-btn"
              )}
              ${ui.btnGhost("Abbrechen", "planBackBtn", "today-app-btn today-app-btn--ghost")}
            </div>`,
            true
          )}
        </div>
      </div>`;

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
    if (submitBtn) {
      submitBtn.disabled = state.submitting || !requiredFieldsComplete();
    }
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
      state.howGoalText = null;
      syncLevelGoalText();
      refreshHowGoals();
      render();
    });

    bindChoiceChips(root, "[data-strategy-category]", (btn) => {
      state.strategyCategory = btn.dataset.strategyCategory;
      render();
    });

    bindChoiceChips(root, "[data-plan-b-category]", (btn) => {
      state.planBCategory = btn.dataset.planBCategory;
      render();
    });

    bindChoiceChips(root, "[data-how-goal]", (btn) => {
      state.howGoalText = btn.dataset.howGoal;
      state.strategyCategory = howGoalTile(state.howGoalText).cat;
      root.querySelectorAll("[data-how-goal]").forEach((chip) => {
        chip.classList.toggle("is-active", chip.dataset.howGoal === state.howGoalText);
      });
      updatePlanningPreview(root);
      const submitBtn = root.querySelector("#planSubmitBtn");
      if (submitBtn) submitBtn.disabled = state.submitting || !requiredFieldsComplete();
    });

    bindChoiceChips(root, "[data-plan-b]", (btn) => {
      state.planBStrategyText = btn.dataset.planB;
      state.planBCategory = planBTile(state.planBStrategyText).cat;
      root.querySelectorAll("[data-plan-b]").forEach((chip) => {
        chip.classList.toggle("is-active", chip.dataset.planB === state.planBStrategyText);
      });
      updatePlanningPreview(root);
    });

    bindChoiceChips(root, "[data-social-form]", (btn) => {
      state.socialForm = btn.dataset.socialForm;
      root.querySelectorAll("[data-social-form]").forEach((chip) => {
        chip.classList.toggle("is-active", chip.dataset.socialForm === state.socialForm);
      });
      updatePlanningPreview(root);
    });

    bindChoiceChips(root, "[data-confidence]", (btn) => {
      state.confidenceBefore = Number(btn.dataset.confidence);
      root.querySelectorAll("[data-confidence]").forEach((chip) => {
        chip.classList.toggle("is-active", Number(chip.dataset.confidence) === state.confidenceBefore);
      });
      updatePlanningPreview(root);
    });
  }

  function bindWorkGoalChips(root) {
    root.querySelectorAll("[data-work-goal]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const goal = btn.dataset.workGoal;
        if (!goal) return;
        const idx = state.workGoals.indexOf(goal);
        if (idx >= 0) state.workGoals.splice(idx, 1);
        else state.workGoals.push(goal);
        root.querySelectorAll("[data-work-goal]").forEach((chip) => {
          chip.classList.toggle("is-active", state.workGoals.includes(chip.dataset.workGoal));
        });
        updatePlanningPreview(root);
      });
    });
  }

  function bindHandlers(root) {
    UI().bindSelects(root, state, async (field) => {
      if (field === "subject") {
        state.whatGoalId = null;
        state.whatGoalText = "";
        state.selectedLevel = null;
        state.levelGoalText = "";
        state.howGoalText = null;
        state.selectedCheckpointId = null;
        await loadContext();
        render();
        return;
      }
      if (field === "selectedCheckpointId") {
        state.whatGoalId = null;
        state.whatGoalText = "";
        state.selectedLevel = null;
        state.levelGoalText = "";
        state.howGoalText = null;
        await loadContext();
        render();
        return;
      }
      if (field === "whatGoalId") {
        state.selectedLevel = null;
        state.levelGoalText = "";
        state.howGoalText = null;
        syncLevelGoalText();
        render();
        return;
      }
      if (field === "selectedLevel") {
        state.howGoalText = null;
        syncLevelGoalText();
        refreshHowGoals();
        render();
        return;
      }
      if (field === "howGoalText" || field === "planBStrategyText") {
        updatePlanningPreview(root);
        const submitBtn = root.querySelector("#planSubmitBtn");
        if (submitBtn) {
          submitBtn.disabled = state.submitting || !requiredFieldsComplete();
        }
        return;
      }
    });

    bindWorkGoalChips(root);
    bindChipGroups(root);

    const details = root.querySelector("#planDetailsText");
    details?.addEventListener("input", () => {
      state.detailsText = details.value.slice(0, 100);
      const count = root.querySelector("#planDetailsCount");
      if (count) count.textContent = String(state.detailsText.length);
      updatePlanningPreview(root);
    });

    root.querySelector("#planSubmitBtn")?.addEventListener("click", submitPlan);
    root.querySelector("#planBackBtn")?.addEventListener("click", () => {
      window.StudentRouter?.navigateToSection("today");
    });
  }

  async function submitPlan() {
    if (!state.subject) {
      state.errorMsg = "Bitte wähle ein Fach.";
      render();
      return;
    }
    if (!state.whatGoalId) {
      state.errorMsg = "Bitte wähle ein Was-Ziel aus dem Levelplan.";
      render();
      return;
    }
    if (state.checkpoints.length > 1 && !state.selectedCheckpointId) {
      state.errorMsg = "Bitte wähle den Nachweis, für den du arbeitest.";
      render();
      return;
    }
    if (!state.selectedLevel) {
      state.errorMsg = "Bitte wähle ein Level.";
      render();
      return;
    }
    syncLevelGoalText();
    if (!state.levelGoalText) {
      state.errorMsg = "Für dieses Level wurde noch kein Zieltext hinterlegt.";
      render();
      return;
    }
    if (!state.howGoalText) {
      state.errorMsg = "Bitte wähle, wie du daran arbeitest.";
      render();
      return;
    }

    if (state.confidenceBefore != null) {
      state.confidenceBefore = Number(state.confidenceBefore);
    }

    state.errorMsg = "";
    state.submitting = true;
    render();

    const checkpoint = pickedCheckpoint();

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
          howGoalText: state.howGoalText,
          goal: state.howGoalText,
          detailsText: state.detailsText.trim() || null,
          workGoals: state.workGoals,
          socialForm: state.socialForm,
          confidenceBefore:
            state.confidenceBefore != null ? Number(state.confidenceBefore) : null,
          planBStrategyText: state.planBStrategyText || null,
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

      window.StudentRouter?.navigateToSection("today");
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

    if (state.howGoalText && !state.howGoals.includes(state.howGoalText)) {
      state.howGoalText = null;
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
    state.planBStrategyText = window.LogbuchStrategies?.rememberedPlanB() || null;
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
    state.strategyCategory = "starten";
    state.planBCategory = "starten";

    const root = document.getElementById("plan-screen-root");
    if (root) {
      root.innerHTML = `<div class="logbuch-loading">Lade Planung…</div>`;
    }

    try {
      await loadContext();
      syncStrategyCategoryFromSelection();
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
