/**
 * SRL-Logbuch – ZWISCHEN-CHECK (App-Flow mit Kacheln).
 */
(function () {
  const C = () => window.LOGBUCH;
  const UI = () => window.LogbuchUI;
  const V = () => window.LogbuchVisuals;
  const STRATEGIES = () => window.LOGBUCH_STRATEGIES || [];

  const ON_TRACK_TILES = [
    {
      value: "Ja, ich bin gut unterwegs.",
      title: "Gut unterwegs",
      desc: "Ja, ich bin gut unterwegs.",
      icon: "✓",
      accent: "#22c55e"
    },
    {
      value: "Teilweise, ich muss etwas ändern.",
      title: "Etwas ändern",
      desc: "Teilweise, ich muss etwas ändern.",
      icon: "↻",
      accent: "#22d3ee"
    },
    {
      value: "Noch nicht, ich hänge fest.",
      title: "Ich hänge fest",
      desc: "Noch nicht, ich hänge fest.",
      icon: "!",
      accent: "#f472b6"
    },
    {
      value: "Ich habe mein Ziel geändert.",
      title: "Ziel geändert",
      desc: "Ich habe mein Ziel geändert.",
      icon: "✎",
      accent: "#a855f7"
    }
  ];

  const UNDERSTAND_TILES = [
    {
      value: "Ja, ich verstehe sie.",
      title: "Ja",
      desc: "Ich verstehe die Aufgaben.",
      icon: "◎",
      accent: "#22c55e"
    },
    {
      value: "Teilweise, ich brauche noch Hilfe.",
      title: "Teilweise",
      desc: "Noch etwas Hilfe nötig.",
      icon: "◑",
      accent: "#22d3ee"
    },
    {
      value: "Nein, ich weiß nicht, was ich tun soll.",
      title: "Noch nicht",
      desc: "Ich weiß noch nicht genau, was ich tun soll.",
      icon: "◌",
      accent: "#f472b6"
    }
  ];

  const PROGRESS_TILES = [
    {
      value: "Ja, ich komme gut voran.",
      title: "Gut",
      desc: "Ich komme gut voran.",
      icon: "→",
      accent: "#22c55e"
    },
    {
      value: "Teilweise, es geht langsam.",
      title: "Langsam",
      desc: "Es geht eher langsam voran.",
      icon: "…",
      accent: "#a855f7"
    },
    {
      value: "Nein, ich hänge fest.",
      title: "Ich hänge",
      desc: "Ich komme gerade nicht weiter.",
      icon: "✕",
      accent: "#f472b6"
    }
  ];

  const NEXT_TILES = [
    {
      value: "Ich arbeite weiter wie geplant.",
      title: "Weiter wie geplant",
      desc: "Ich bleibe bei meinem Weg zum Ziel.",
      icon: "▶",
      accent: "#22c55e"
    },
    {
      value: "Ich nutze meinen Plan B.",
      title: "Plan B nutzen",
      desc: "Ich nutze meinen Plan B.",
      icon: "B",
      accent: "#a855f7"
    },
    {
      value: "Ich wähle eine andere Strategie.",
      title: "Andere Strategie",
      desc: "Ich wähle eine andere Strategie.",
      icon: "↺",
      accent: "#22d3ee"
    },
    {
      value: "Ich frage gezielt nach Hilfe.",
      title: "Hilfe fragen",
      desc: "Ich frage gezielt nach Hilfe.",
      icon: "?",
      accent: "#22d3ee"
    },
    {
      value: "Ich passe mein Ziel an.",
      title: "Ziel anpassen",
      desc: "Ich passe mein Ziel an.",
      icon: "✎",
      accent: "#d946ef"
    },
    {
      value: "Ich starte mit einer leichteren Aufgabe.",
      title: "Leichter starten",
      desc: "Ich starte mit einer leichteren Aufgabe.",
      icon: "1",
      accent: "#67e8f9"
    }
  ];

  const state = {
    entryId: null,
    entry: null,
    existingCheck: null,
    onTrack: null,
    understands: null,
    progress: null,
    nextStepAnswer: null,
    selectedStrategyName: null,
    selectedStrategyProblem: null,
    selectedStrategyNextStep: null,
    strategyModalOpen: false,
    strategyModalStep: "problem",
    strategyModalId: null,
    submitting: false,
    errorMsg: ""
  };

  function formatDate(dateStr) {
    const iso =
      dateStr instanceof Date
        ? dateStr.toISOString().slice(0, 10)
        : String(dateStr).slice(0, 10);
    return new Date(`${iso}T12:00:00`).toLocaleDateString("de-DE", {
      weekday: "long",
      day: "2-digit",
      month: "2-digit"
    });
  }

  function levelLabel(value, entry) {
    if (entry?.level_label) return entry.level_label;
    if (value === "rookie") return "Rookie";
    if (value === "operator") return "Operator";
    if (value === "street_legend") return "Street Legend";
    return value || "–";
  }

  function isLegacyCheck(check) {
    if (!check) return false;
    return [check.on_track, check.understands, check.progress].some((v) =>
      ["👍", "😐", "👎"].includes(v)
    );
  }

  function strategyById(id) {
    return STRATEGIES().find((s) => s.id === id) || null;
  }

  function activeStrategy() {
    return strategyById(state.strategyModalId);
  }

  function needsTaktikHighlight() {
    return (
      state.onTrack === "Noch nicht, ich hänge fest." ||
      state.progress === "Nein, ich hänge fest." ||
      state.understands === "Nein, ich weiß nicht, was ich tun soll." ||
      state.nextStepAnswer === "Ich wähle eine andere Strategie."
    );
  }

  function goalStepCard(step, title, bodyHtml, wide = false) {
    return `
      <article class="goal-step-card ${wide ? "goal-step-card--wide" : ""}">
        <header class="goal-step-card__head">
          <span class="goal-step-card__step">${step}</span>
          <h3 class="goal-step-card__title">${title}</h3>
        </header>
        <div class="goal-step-card__body">${bodyHtml}</div>
      </article>`;
  }

  function renderMissionCard(ui, entry) {
    const items = [
      ["Was-Ziel", entry.what_goal_text || "–"],
      ["Level", levelLabel(entry.selected_level, entry)],
      ["Fachliches Ziel", entry.level_goal_text || "–"],
      ["Mein Weg zum Ziel", entry.how_goal_text || entry.goal || "–"],
      ["Plan B", entry.plan_b_strategy_text || "–"]
    ];
    return `
      <div class="mission-facts">
        ${items
          .map(
            ([label, value]) => `
          <div class="mission-fact">
            <span class="mission-fact__label">${ui.escapeHtml(label)}</span>
            <span class="mission-fact__value">${ui.escapeHtml(value)}</span>
          </div>`
          )
          .join("")}
      </div>`;
  }

  function renderDailyGoalCard(ui, entry) {
    return `
      <section class="check-daily-goal">
        <h3 class="check-daily-goal-title">Meine Mission</h3>
        <div class="check-daily-goal-card">
          <p><strong>Was-Ziel:</strong><br>${ui.escapeHtml(entry.what_goal_text || "–")}</p>
          <p><strong>Level:</strong><br>${ui.escapeHtml(levelLabel(entry.selected_level, entry))}</p>
          <p><strong>Fachliches Ziel:</strong><br>${ui.escapeHtml(entry.level_goal_text || "–")}</p>
          <p><strong>Mein Weg zum Ziel:</strong><br>${ui.escapeHtml(entry.how_goal_text || entry.goal || "–")}</p>
          ${
            entry.plan_b_strategy_text
              ? `<p><strong>Plan B, wenn ich hänge:</strong><br>${ui.escapeHtml(entry.plan_b_strategy_text)}</p>`
              : ""
          }
        </div>
      </section>`;
  }

  function renderStrategySelected(ui) {
    if (!state.selectedStrategyName) return "";
    return `
      <div class="check-strategy-selected glow-panel glow-panel--violet">
        <span class="check-strategy-selected-label">Gewählte Taktik</span>
        <strong>${ui.escapeHtml(state.selectedStrategyName)}</strong>
      </div>`;
  }

  function renderStrategyBlock(ui) {
    const highlight = needsTaktikHighlight() ? " check-strategy-block--urgent" : "";
    return `
      <div class="check-strategy-block${highlight}">
        <button type="button" class="today-app-btn today-app-btn--ghost" id="strategyOpenBtn">Passende Taktik finden</button>
        <p class="logbuch-hint">Wenn du festhängst, hol dir eine passende Lernstrategie.</p>
        ${renderStrategySelected(ui)}
      </div>`;
  }

  function renderStrategyProblemStep(ui) {
    const items = STRATEGIES()
      .map(
        (s, i) => `
        <button type="button" class="strategy-problem-btn" data-strategy-id="${ui.escapeHtml(s.id)}">
          <span class="strategy-problem-num">${i + 1}.</span>
          <span>${ui.escapeHtml(s.problem)}</span>
        </button>`
      )
      .join("");
    return `
      <h3 class="strategy-modal-title">Was klappt gerade nicht?</h3>
      <div class="strategy-problem-list">${items}</div>`;
  }

  function renderStrategyTutorialStep(ui, strategy) {
    const steps = strategy.steps.map((step) => `<li>${ui.escapeHtml(step)}</li>`).join("");
    return `
      <p class="strategy-modal-kicker">${ui.escapeHtml(strategy.problem)}</p>
      <h3 class="strategy-modal-title">${ui.escapeHtml(strategy.name)}</h3>
      <div class="strategy-tutorial-block">
        <h4>Wann hilft dir das?</h4>
        <p>${ui.escapeHtml(strategy.whenHelps)}</p>
      </div>
      <div class="strategy-tutorial-block">
        <h4>So geht's:</h4>
        <ol class="strategy-steps">${steps}</ol>
      </div>
      <div class="strategy-tutorial-block strategy-next-block">
        <h4>Dein nächster Schritt:</h4>
        <p>${ui.escapeHtml(strategy.nextStep)}</p>
      </div>
      <div class="strategy-modal-actions">
        ${ui.btnPrimary("Diese Taktik nutzen", "strategyApplyBtn")}
        ${ui.btnGhost("Zurück", "strategyBackBtn")}
        ${ui.btnGhost("Abbrechen", "strategyCancelBtn")}
      </div>`;
  }

  function renderStrategyModal() {
    const existing = document.getElementById("strategyOverlay");
    if (existing) existing.remove();
    if (!state.strategyModalOpen) return;

    const ui = UI();
    const strategy = activeStrategy();
    const body =
      state.strategyModalStep === "tutorial" && strategy
        ? renderStrategyTutorialStep(ui, strategy)
        : renderStrategyProblemStep(ui);

    const cancelOnly =
      state.strategyModalStep === "problem"
        ? `<div class="strategy-modal-actions strategy-modal-actions-end">
             ${ui.btnGhost("Abbrechen", "strategyCancelBtn")}
           </div>`
        : "";

    const overlay = document.createElement("div");
    overlay.id = "strategyOverlay";
    overlay.className = "strategy-overlay";
    overlay.innerHTML = `
      <div class="strategy-modal" role="dialog" aria-modal="true">
        ${body}
        ${cancelOnly}
      </div>`;
    document.body.appendChild(overlay);
    bindStrategyModalHandlers(overlay);
  }

  function openStrategyModal() {
    state.strategyModalOpen = true;
    state.strategyModalStep = "problem";
    state.strategyModalId = null;
    renderStrategyModal();
  }

  function closeStrategyModal() {
    state.strategyModalOpen = false;
    state.strategyModalStep = "problem";
    state.strategyModalId = null;
    document.getElementById("strategyOverlay")?.remove();
  }

  function applyStrategy(strategy) {
    state.selectedStrategyName = strategy.name;
    state.selectedStrategyProblem = strategy.problem;
    state.selectedStrategyNextStep = strategy.nextStep;
    state.nextStepAnswer = "Ich wähle eine andere Strategie.";
    closeStrategyModal();
    render();
  }

  function bindStrategyModalHandlers(overlay) {
    overlay.querySelectorAll(".strategy-problem-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.strategyModalId = btn.dataset.strategyId;
        state.strategyModalStep = "tutorial";
        renderStrategyModal();
      });
    });
    overlay.querySelector("#strategyApplyBtn")?.addEventListener("click", () => {
      const strategy = activeStrategy();
      if (strategy) applyStrategy(strategy);
    });
    overlay.querySelector("#strategyBackBtn")?.addEventListener("click", () => {
      state.strategyModalStep = "problem";
      state.strategyModalId = null;
      renderStrategyModal();
    });
    overlay.querySelectorAll("#strategyCancelBtn").forEach((btn) => {
      btn.addEventListener("click", closeStrategyModal);
    });
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closeStrategyModal();
    });
  }

  function shortLabel(list, value) {
    const hit = list.find((t) => t.value === value);
    return hit?.title || value || "–";
  }

  function renderCheckSummary(ui) {
    if (!allQuestionsAnswered()) {
      return `<p class="plan-summary-empty">Wähle Status und nächsten Schritt – hier siehst du dann deine Zusammenfassung.</p>`;
    }
    return `
      <div class="mission-summary">
        <div class="mission-summary__block">
          <p class="mission-summary__label">Status</p>
          <p class="mission-summary__value">${ui.escapeHtml(shortLabel(ON_TRACK_TILES, state.onTrack))}</p>
        </div>
        <div class="mission-summary__block">
          <p class="mission-summary__label">Verständnis</p>
          <p class="mission-summary__value">${ui.escapeHtml(shortLabel(UNDERSTAND_TILES, state.understands))}</p>
        </div>
        <div class="mission-summary__block">
          <p class="mission-summary__label">Vorankommen</p>
          <p class="mission-summary__value">${ui.escapeHtml(shortLabel(PROGRESS_TILES, state.progress))}</p>
        </div>
        <div class="mission-summary__block">
          <p class="mission-summary__label">Nächster Schritt</p>
          <p class="mission-summary__value">${ui.escapeHtml(shortLabel(NEXT_TILES, state.nextStepAnswer) || state.nextStepAnswer)}</p>
        </div>
        ${
          state.selectedStrategyName
            ? `<div class="mission-summary__block">
                <p class="mission-summary__label">Taktik</p>
                <p class="mission-summary__value">${ui.escapeHtml(state.selectedStrategyName)}</p>
              </div>`
            : ""
        }
        <div class="mission-summary__reward">
          <span class="mission-summary__reward-label">Belohnung</span>
          <span class="mission-summary__reward-value">${state.existingCheck?.canEdit ? "Kein zusätzliches XP" : "+3 XP"}</span>
        </div>
      </div>`;
  }

  function renderCheckDetailsList(ui, c) {
    const legacy = isLegacyCheck(c);
    if (legacy) {
      return `${ui.escapeHtml(c.on_track)} ${ui.escapeHtml(c.understands)} ${ui.escapeHtml(c.progress)}${
        c.change_note ? `<br>${ui.escapeHtml(c.change_note)}` : ""
      }`;
    }
    const rows = [
      ["Bin ich auf dem richtigen Weg?", c.on_track],
      ["Verstehe ich die Aufgaben?", c.understands],
      ["Komme ich gut voran?", c.progress],
      ["Was mache ich jetzt?", c.next_step_answer || "–"]
    ];
    if (c.selected_strategy_name) rows.push(["Gewählte Taktik", c.selected_strategy_name]);
    return `
      <dl class="plan-readonly-list">
        ${rows
          .map(
            ([label, value]) => `
          <div class="plan-readonly-row">
            <dt>${ui.escapeHtml(label)}</dt>
            <dd>${ui.escapeHtml(value || "–")}</dd>
          </div>`
          )
          .join("")}
      </dl>`;
  }

  function applyCheckToState(check) {
    if (!check || isLegacyCheck(check)) return false;
    state.onTrack = check.on_track;
    state.understands = check.understands;
    state.progress = check.progress;
    state.nextStepAnswer = check.next_step_answer;
    state.selectedStrategyName = check.selected_strategy_name || null;
    state.selectedStrategyProblem = check.selected_strategy_problem || null;
    state.selectedStrategyNextStep = check.selected_strategy_next_step || null;
    return true;
  }

  function renderHero(ui, e, dateIso) {
    const pct = window.LogbuchReminders?.lessonProgressPct?.(e.timeslot) ?? null;
    const chips = [
      formatDate(dateIso),
      e.timeslot,
      e.subject,
      pct != null ? `${pct} % der Stunde` : null
    ].filter(Boolean);

    return `
      <article class="plan-app-hero plan-app-hero--compact plan-app-hero--check">
        <div class="plan-app-hero__content">
          <div class="plan-app-hero__icon" aria-hidden="true">
            <img src="/icons/student/png/meine-checks.png" alt="" aria-hidden="true">
          </div>
          <div class="plan-app-hero__copy">
            <p class="plan-app-hero__eyebrow">Schritt 2 von 3 · Check</p>
            <h2 class="plan-app-hero__title">Zwischen-Check</h2>
            <p class="plan-app-hero__meta">Wie läuft es gerade in deiner Stunde?</p>
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
          <img src="/icons/student/hero/meine-checks-hero.png?v=6" alt="" aria-hidden="true" loading="lazy">
        </div>
        <nav class="phase-rail" aria-label="Lernschritte">
          <span class="phase-rail__item is-done">1 · Tagesziel</span>
          <span class="phase-rail__item is-active">2 · Check</span>
          <span class="phase-rail__item">3 · Abschluss</span>
        </nav>
      </article>`;
  }

  function renderReadOnly() {
    const root = document.getElementById("check-screen-root");
    if (!root) return;
    const ui = UI();
    const c = state.existingCheck;
    root.innerHTML = `
      <div class="plan-app">
        ${renderDailyGoalCard(ui, state.entry)}
        <div class="logbuch-msg logbuch-msg-info">
          Dein Zwischen-Check für <b>${ui.escapeHtml(state.entry.subject)}</b> (nur Ansicht)
        </div>
        ${renderCheckDetailsList(ui, c)}
        ${ui.btnGhost("Zurück zu Mein Tag", "checkBackBtn", "today-app-btn today-app-btn--ghost")}
      </div>`;
    root.querySelector("#checkBackBtn")?.addEventListener("click", () => {
      window.StudentRouter?.navigateToSection("today");
    });
  }

  function renderMissing() {
    const root = document.getElementById("check-screen-root");
    if (!root) return;
    const ui = UI();
    root.innerHTML = `
      <div class="plan-app">
        ${ui.msg("Kein Lern-Eintrag gefunden. Bitte zuerst ein Tagesziel setzen.")}
        ${ui.btnGhost("Zurück zu Mein Tag", "checkBackBtn", "today-app-btn today-app-btn--ghost")}
      </div>`;
    root.querySelector("#checkBackBtn")?.addEventListener("click", () => {
      window.StudentRouter?.navigateToSection("today");
    });
  }

  function allQuestionsAnswered() {
    return !!(state.onTrack && state.understands && state.progress && state.nextStepAnswer);
  }

  function updatePreview(root) {
    const box = root.querySelector("#checkSummaryCard");
    if (box) box.innerHTML = renderCheckSummary(UI());
    const submitBtn = root.querySelector("#checkSubmitBtn");
    if (submitBtn) submitBtn.disabled = state.submitting || !allQuestionsAnswered();
    const tactic = root.querySelector(".check-strategy-block");
    if (tactic) tactic.classList.toggle("check-strategy-block--urgent", needsTaktikHighlight());
  }

  function bindTiles(root) {
    const pairs = [
      ["[data-on-track]", "onTrack", "data-on-track"],
      ["[data-understands]", "understands", "data-understands"],
      ["[data-progress]", "progress", "data-progress"],
      ["[data-next-step]", "nextStepAnswer", "data-next-step"]
    ];
    pairs.forEach(([sel, field, attr]) => {
      root.querySelectorAll(sel).forEach((btn) => {
        btn.addEventListener("click", () => {
          state[field] = btn.getAttribute(attr);
          if (field === "nextStepAnswer" && state.nextStepAnswer === "Ich nutze meinen Plan B.") {
            const planB = state.entry?.plan_b_strategy_text;
            if (planB && C().CHECK_NEXT_STEP.includes(planB)) {
              // keep UI value; storage uses the chosen next-step label
            }
          }
          if (field === "nextStepAnswer" && state.nextStepAnswer === "Ich wähle eine andere Strategie.") {
            openStrategyModal();
          }
          root.querySelectorAll(sel).forEach((chip) => {
            chip.classList.toggle("is-active", chip.getAttribute(attr) === state[field]);
          });
          updatePreview(root);
        });
      });
    });
  }

  function render() {
    const root = document.getElementById("check-screen-root");
    if (!root) return;

    if (!state.entry) {
      renderMissing();
      return;
    }

    if (state.existingCheck) {
      if (state.existingCheck.canEdit && applyCheckToState(state.existingCheck)) {
        // edit mode
      } else {
        renderReadOnly();
        return;
      }
    }

    const ui = UI();
    const visuals = V();
    const e = state.entry;
    const dateIso =
      e.date instanceof Date ? e.date.toISOString().slice(0, 10) : String(e.date).slice(0, 10);

    const tileGrid = (tiles, active, attr) =>
      visuals
        ? visuals.strategyTileGrid(tiles, active, attr)
        : tiles
            .map(
              (t) =>
                `<button type="button" class="strategy-tile ${active === t.value ? "is-active" : ""}" ${attr}="${ui.escapeHtml(t.value)}">${ui.escapeHtml(t.title)}</button>`
            )
            .join("");

    root.innerHTML = `
      <div class="plan-app check-app">
        ${renderHero(ui, e, dateIso)}
        ${
          state.existingCheck?.canEdit
            ? `<div class="logbuch-msg logbuch-msg-info">Du bearbeitest deinen Zwischen-Check – beim Speichern gibt es kein zusätzliches XP.</div>`
            : ""
        }
        <div class="plan-app-grid plan-app-grid--start">
          ${goalStepCard(1, "Meine Mission", renderMissionCard(ui, e))}
          ${goalStepCard(
            2,
            "Bin ich auf dem richtigen Weg?",
            tileGrid(ON_TRACK_TILES, state.onTrack, "data-on-track")
          )}
          ${goalStepCard(
            3,
            "Kurzer Lern-Check",
            `
            <div class="goal-step-card__stack">
              <p class="way-section__title">Verstehe ich die Aufgaben?</p>
              ${tileGrid(UNDERSTAND_TILES, state.understands, "data-understands")}
              <p class="way-section__title">Komme ich gut voran?</p>
              ${tileGrid(PROGRESS_TILES, state.progress, "data-progress")}
            </div>`
          )}
          ${goalStepCard(
            4,
            "Mein nächster Schritt",
            `
            <div class="goal-step-card__stack">
              <p class="way-to-goal__intro">Was mache ich jetzt?</p>
              ${tileGrid(NEXT_TILES, state.nextStepAnswer, "data-next-step")}
              ${renderStrategyBlock(ui)}
            </div>`
          )}
          ${goalStepCard(
            5,
            "Mein nächster Schritt",
            `
            <div id="checkSummaryCard">${renderCheckSummary(ui)}</div>
            ${state.errorMsg ? ui.msg(state.errorMsg) : ""}
            <div class="plan-app-footer">
              ${ui.btnPrimary(
                state.submitting
                  ? "Speichern…"
                  : state.existingCheck?.canEdit
                    ? "Zwischen-Check speichern"
                    : "Zwischen-Check speichern · +3 XP",
                "checkSubmitBtn",
                state.submitting || !allQuestionsAnswered(),
                "logbuch-submit-full today-app-btn"
              )}
              ${ui.btnGhost("Abbrechen", "checkBackBtn", "today-app-btn today-app-btn--ghost")}
            </div>`,
            true
          )}
        </div>
      </div>`;

    bindHandlers(root);
    renderStrategyModal();
  }

  function bindHandlers(root) {
    bindTiles(root);
    root.querySelector("#strategyOpenBtn")?.addEventListener("click", openStrategyModal);
    root.querySelector("#checkSubmitBtn")?.addEventListener("click", submitCheck);
    root.querySelector("#checkBackBtn")?.addEventListener("click", () => {
      closeStrategyModal();
      window.StudentRouter?.navigateToSection("today");
    });
  }

  async function submitCheck() {
    if (!allQuestionsAnswered()) {
      state.errorMsg = "Bitte beantworte alle Fragen.";
      render();
      return;
    }

    state.errorMsg = "";
    state.submitting = true;
    render();

    const payload = {
      logEntryId: state.entryId,
      onTrack: state.onTrack,
      understands: state.understands,
      progress: state.progress,
      nextStepAnswer: state.nextStepAnswer
    };

    if (state.selectedStrategyName) {
      payload.selectedStrategyName = state.selectedStrategyName;
      payload.selectedStrategyProblem = state.selectedStrategyProblem;
      payload.selectedStrategyNextStep = state.selectedStrategyNextStep;
    }

    const isEdit = !!state.existingCheck?.canEdit;

    try {
      const res = await fetch(
        isEdit
          ? `/api/student/log/check/${encodeURIComponent(state.entryId)}`
          : "/api/student/log/check",
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        }
      );
      const data = await res.json();
      if (!data.success) {
        state.submitting = false;
        state.errorMsg = data.message || "Speichern fehlgeschlagen.";
        render();
        return;
      }
      closeStrategyModal();
      window.LogbuchReminders?.clearForEntry?.(state.entryId, "check");
      if (typeof window.loadMe === "function") await window.loadMe();
      window.StudentRouter?.navigateToSection("today");
    } catch (err) {
      console.error(err);
      state.submitting = false;
      state.errorMsg = "Netzwerkfehler – bitte erneut versuchen.";
      render();
    }
  }

  async function init(query) {
    const q = query || new URLSearchParams(location.search);
    state.entryId = q.get("entryId") || null;
    state.onTrack = null;
    state.understands = null;
    state.progress = null;
    state.nextStepAnswer = null;
    state.selectedStrategyName = null;
    state.selectedStrategyProblem = null;
    state.selectedStrategyNextStep = null;
    state.strategyModalOpen = false;
    state.strategyModalStep = "problem";
    state.strategyModalId = null;
    state.entry = null;
    state.existingCheck = null;
    state.submitting = false;
    state.errorMsg = "";
    closeStrategyModal();

    const root = document.getElementById("check-screen-root");
    if (root) root.innerHTML = `<div class="logbuch-loading">Lade Zwischen-Check…</div>`;

    if (!state.entryId) {
      renderMissing();
      return;
    }

    try {
      const res = await fetch(
        `/api/student/log/check-context?entryId=${encodeURIComponent(state.entryId)}`
      );
      const data = await res.json();
      if (!data.entry) {
        renderMissing();
        return;
      }
      state.entry = data.entry;
      state.existingCheck = data.existingCheck || null;
      if (state.existingCheck?.canEdit) applyCheckToState(state.existingCheck);
      render();
    } catch (err) {
      console.error(err);
      if (root) root.innerHTML = UI().msg("Zwischen-Check konnte nicht geladen werden.");
    }
  }

  window.LogbuchCheck = { init };
})();
