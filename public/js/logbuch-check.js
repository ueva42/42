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
    plannedWork: null,
    needsMidCheck: true,
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
    errorMsg: "",
    activeStep: 1,
    missionSeen: false,
    missionFactIndex: 0
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

  function step1Complete() {
    return !!state.missionSeen;
  }

  function step2Complete() {
    return !!state.onTrack;
  }

  function step3Complete() {
    return !!(state.understands && state.progress);
  }

  function step4Complete() {
    return !!state.nextStepAnswer;
  }

  function allQuestionsAnswered() {
    return step2Complete() && step3Complete() && step4Complete();
  }

  function syncActiveStep() {
    if (state.activeStep >= 2 && !step1Complete()) {
      state.activeStep = 1;
      return;
    }
    if (state.activeStep >= 3 && !step2Complete()) {
      state.activeStep = 2;
      return;
    }
    if (state.activeStep >= 4 && !step3Complete()) {
      state.activeStep = 3;
      return;
    }
    if (state.activeStep >= 5 && !step4Complete()) {
      state.activeStep = 4;
      return;
    }
    if (state.activeStep === 2 && step2Complete()) state.activeStep = 3;
    else if (state.activeStep === 3 && step3Complete()) state.activeStep = 4;
  }

  function openStep(step) {
    state.activeStep = Number(step);
    render();
  }

  function continueRow(id, label, enabled = true) {
    return `<div class="plan-acc__continue">
      <button type="button" class="today-app-btn" id="${id}" ${enabled ? "" : "disabled"}>${label}</button>
    </div>`;
  }

  function teardownAskModal() {
    document.querySelectorAll("body > .plan-next-modal-backdrop").forEach((el) => el.remove());
  }

  function portalAskModal(root) {
    teardownAskModal();
    root?.querySelectorAll(".plan-next-modal-backdrop").forEach((modal) => {
      document.body.appendChild(modal);
    });
  }

  function askModalScope(root) {
    return document.querySelector("body > .plan-next-modal-backdrop") || root;
  }

  function renderAskProgress(step, total = 4) {
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

  function renderStepPopup({ step, title, hint, body, showBack = true, total = 4 }) {
    const ui = UI();
    return `
      <div class="plan-next-modal-backdrop plan-next-modal-backdrop--ask" role="dialog" aria-modal="true" aria-label="${ui.escapeHtml(title)}">
        <div class="plan-next-modal plan-next-modal--ask">
          ${renderAskProgress(step, total)}
          <p class="plan-next-modal__kicker">Schritt ${step} von ${total}</p>
          <h3 class="plan-next-modal__title">${ui.escapeHtml(title)}</h3>
          ${hint ? `<p class="plan-next-modal__text">${hint}</p>` : ""}
          ${state.errorMsg ? `<p class="plan-next-modal__text" style="color:#fca5a5">${ui.escapeHtml(state.errorMsg)}</p>` : ""}
          <div class="plan-ask__body">${body}</div>
          <div class="plan-next-modal__actions">
            ${
              showBack
                ? `<button type="button" class="logbuch-btn-ghost today-app-btn today-app-btn--ghost" id="checkAskBack">Zurück</button>`
                : `<button type="button" class="logbuch-btn-ghost today-app-btn today-app-btn--ghost" id="checkBackBtn">Abbrechen</button>`
            }
          </div>
        </div>
      </div>`;
  }

  function renderSavePopup(ui) {
    return `
      <div class="plan-next-modal-backdrop plan-next-modal-backdrop--ask" role="dialog" aria-modal="true" aria-label="Mein Check">
        <div class="plan-next-modal plan-next-modal--ask">
          ${renderAskProgress(5, 4)}
          <p class="plan-next-modal__kicker">Bereit</p>
          <h3 class="plan-next-modal__title">Mein Check</h3>
          <p class="plan-next-modal__text">Prüfe kurz, dann speichern – danach geht’s zurück zu Mein Tag.</p>
          <div id="checkSummaryCard">${renderCheckSummary(ui)}</div>
          ${state.errorMsg ? ui.msg(state.errorMsg) : ""}
          <div class="plan-next-modal__actions">
            <button type="button" class="btn-primary logbuch-submit today-app-btn" id="checkSubmitBtn" ${
              state.submitting || !allQuestionsAnswered() ? "disabled" : ""
            }>${
              state.submitting
                ? "Speichern…"
                : state.existingCheck?.canEdit
                  ? "Zwischen-Check speichern"
                  : "Zwischen-Check speichern · +3 XP"
            }</button>
            <button type="button" class="logbuch-btn-ghost today-app-btn today-app-btn--ghost" id="checkAskBack">Zurück</button>
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

  function missionSummaryLine(entry) {
    const work = plannedWorkFromState();
    const parts = [work.whatGoalText, work.levelLabel, work.subject || entry?.subject].filter(Boolean);
    return parts.join(" · ") || "Heute geplant ansehen";
  }

  function plannedWorkFromState() {
    const work = state.plannedWork || {};
    const entry = state.entry || {};
    return {
      whatGoalText: work.whatGoalText || entry.what_goal_text || "",
      howGoalText: work.howGoalText || entry.how_goal_text || entry.goal || "",
      levelGoalText: work.levelGoalText || entry.level_goal_text || "",
      detailsText: work.detailsText || entry.details_text || "",
      levelLabel: work.levelLabel || levelLabel(entry.selected_level, entry),
      planB: work.planB || entry.plan_b_strategy_text || "",
      subject: work.subject || entry.subject || ""
    };
  }

  function missionFacts(entry) {
    const work = plannedWorkFromState();
    const facts = [
      ["Was-Ziel", work.whatGoalText || "–"],
      ["Level", work.levelLabel || "–"],
      ["Fachliches Ziel", work.levelGoalText || "–"],
      ["Mein Weg zum Ziel", work.howGoalText || "–"]
    ];
    if (work.detailsText) facts.push(["Konkret", work.detailsText]);
    if (work.planB) facts.push(["Plan B", work.planB]);
    return facts;
  }

  function missionFactsComplete(entry) {
    const facts = missionFacts(entry || state.entry || {});
    return (Number(state.missionFactIndex) || 0) >= facts.length - 1;
  }

  function renderMissionCard(ui, entry) {
    const facts = missionFacts(entry);
    const idx = Math.min(Math.max(0, Number(state.missionFactIndex) || 0), facts.length - 1);
    const [label, value] = facts[idx];
    const isLast = idx >= facts.length - 1;
    return `
      <section class="check-daily-goal">
        <p class="plan-acc__hint" style="margin:0 0 10px">Mission ${idx + 1} von ${facts.length}</p>
        <div class="check-daily-goal-card">
          <p><strong>${ui.escapeHtml(label)}:</strong><br>${ui.escapeHtml(value)}</p>
        </div>
        ${
          !isLast
            ? `<div class="plan-acc__continue">
                <button type="button" class="today-app-btn" id="checkMissionFactNext">Weiter</button>
              </div>`
            : ""
        }
      </section>`;
  }

  function renderDailyGoalCard(ui, entry) {
    const work = plannedWorkFromState();
    const empty = !work.whatGoalText && !work.howGoalText && !work.levelGoalText;
    return `
      <section class="check-daily-goal">
        <h3 class="check-daily-goal-title">Heute geplant</h3>
        <div class="check-daily-goal-card">
          ${
            empty
              ? `<p>Für ${ui.escapeHtml(work.subject || "dieses Fach")} ist noch kein Was-Ziel hinterlegt. Setze zuerst dein Tagesziel.</p>`
              : `<p><strong>Was-Ziel:</strong><br>${ui.escapeHtml(work.whatGoalText || "–")}</p>
                 <p><strong>Level:</strong><br>${ui.escapeHtml(work.levelLabel || "–")}</p>
                 ${
                   work.levelGoalText
                     ? `<p><strong>Fachliches Ziel:</strong><br>${ui.escapeHtml(work.levelGoalText)}</p>`
                     : ""
                 }
                 ${
                   work.howGoalText
                     ? `<p><strong>Mein Weg zum Ziel:</strong><br>${ui.escapeHtml(work.howGoalText)}</p>`
                     : ""
                 }
                 ${
                   work.detailsText
                     ? `<p><strong>Konkret:</strong><br>${ui.escapeHtml(work.detailsText)}</p>`
                     : ""
                 }`
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
    syncActiveStep();
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
    state.missionSeen = true;
    if (allQuestionsAnswered()) state.activeStep = 5;
    else syncActiveStep();
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
            <p class="plan-app-hero__meta">Wie läuft es mit deinem heutigen Was-Ziel?</p>
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
    teardownAskModal();
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
    teardownAskModal();
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

  function afterChoiceChange(root) {
    const prev = state.activeStep;
    syncActiveStep();
    if (state.activeStep !== prev) {
      render();
      return;
    }
    updatePreview(root);
  }

  function updatePreview(root) {
    const box = root.querySelector("#checkSummaryCard");
    if (box) box.innerHTML = renderCheckSummary(UI());
    const submitBtn = root.querySelector("#checkSubmitBtn");
    if (submitBtn) submitBtn.disabled = state.submitting || !allQuestionsAnswered();
    const nextBtn = root.querySelector("#checkNextContinue");
    if (nextBtn) nextBtn.disabled = !step4Complete();
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
          if (field === "nextStepAnswer" && state.nextStepAnswer === "Ich wähle eine andere Strategie.") {
            openStrategyModal();
          }
          root.querySelectorAll(sel).forEach((chip) => {
            chip.classList.toggle("is-active", chip.getAttribute(attr) === state[field]);
          });
          afterChoiceChange(root);
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

    if (state.existingCheck && !state.existingCheck.canEdit) {
      renderReadOnly();
      return;
    }

    if (state.needsMidCheck === false && !state.existingCheck) {
      teardownAskModal();
      const rootSkip = document.getElementById("check-screen-root");
      if (!rootSkip) return;
      const uiSkip = UI();
      rootSkip.innerHTML = `
        <div class="plan-app">
          ${renderDailyGoalCard(uiSkip, state.entry)}
          <div class="logbuch-msg logbuch-msg-info">
            Heute steht ${uiSkip.escapeHtml(state.entry.subject || "dieses Fach")} nur einmal im Stundenplan – der Zwischen-Check entfällt.
          </div>
          ${uiSkip.btnPrimary("Zum Tagesabschluss", "checkGoReflectBtn", false, "today-app-btn")}
          ${uiSkip.btnGhost("Zurück zu Mein Tag", "checkBackBtn", "today-app-btn today-app-btn--ghost")}
        </div>`;
      rootSkip.querySelector("#checkGoReflectBtn")?.addEventListener("click", () => {
        const q = new URLSearchParams({ entryId: state.entryId });
        window.StudentRouter?.navigateToSection("reflect", { query: q });
      });
      rootSkip.querySelector("#checkBackBtn")?.addEventListener("click", () => {
        window.StudentRouter?.navigateToSection("today");
      });
      return;
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

    const missionBody = `
      ${renderMissionCard(ui, e)}
      ${
        missionFactsComplete(e)
          ? continueRow("checkMissionContinue", "Weiter zum Check")
          : ""
      }`;

    const learnBody = `
      <div class="goal-step-card__stack">
        <p class="way-section__title">Verstehe ich die Aufgaben?</p>
        ${tileGrid(UNDERSTAND_TILES, state.understands, "data-understands")}
        <p class="way-section__title">Komme ich gut voran?</p>
        ${tileGrid(PROGRESS_TILES, state.progress, "data-progress")}
      </div>`;

    const nextBody = `
      <div class="goal-step-card__stack">
        <p class="way-to-goal__intro">Was mache ich jetzt?</p>
        ${tileGrid(NEXT_TILES, state.nextStepAnswer, "data-next-step")}
        ${renderStrategyBlock(ui)}
        ${continueRow("checkNextContinue", "Weiter", step4Complete())}
      </div>`;

    const stepPopup = state.activeStep >= 5
      ? renderSavePopup(ui)
      : state.activeStep === 1
        ? renderStepPopup({
            step: 1,
            title: "Heute geplant",
            hint: "Kurz ansehen, dann weiter.",
            body: missionBody,
            showBack: false
          })
        : state.activeStep === 2
          ? renderStepPopup({
              step: 2,
              title: "Bin ich auf dem richtigen Weg?",
              hint: "Eine Karte wählen.",
              body: tileGrid(ON_TRACK_TILES, state.onTrack, "data-on-track")
            })
          : state.activeStep === 3
            ? renderStepPopup({
                step: 3,
                title: "Kurzer Lern-Check",
                hint: "Verständnis und Vorankommen.",
                body: learnBody
              })
            : renderStepPopup({
                step: 4,
                title: "Mein nächster Schritt",
                hint: "Was machst du jetzt?",
                body: nextBody
              });

    root.innerHTML = `
      <div class="plan-app check-app plan-app--ask">
        ${renderHero(ui, e, dateIso)}
        ${
          state.existingCheck?.canEdit
            ? `<div class="logbuch-msg logbuch-msg-info">Du bearbeitest deinen Zwischen-Check – beim Speichern gibt es kein zusätzliches XP.</div>`
            : ""
        }
      </div>
      ${stepPopup}`;

    portalAskModal(root);
    bindHandlers(root);
    renderStrategyModal();
  }

  function bindHandlers(root) {
    const scope = askModalScope(root);
    bindTiles(scope);

    scope.querySelectorAll("[data-plan-open]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const step = Number(btn.dataset.planOpen);
        if (!step) return;
        if (step >= 2 && !step1Complete() && state.activeStep !== step) return;
        if (step >= 3 && !step2Complete() && state.activeStep !== step) return;
        if (step >= 4 && !step3Complete() && state.activeStep !== step) return;
        if (step >= 5 && !step4Complete() && state.activeStep !== step) return;
        openStep(step);
      });
    });

    scope.querySelector("#checkAskBack")?.addEventListener("click", () => {
      state.activeStep = Math.max(1, Number(state.activeStep) - 1);
      render();
    });

    scope.querySelector("#checkMissionFactNext")?.addEventListener("click", () => {
      const facts = missionFacts(state.entry || {});
      state.missionFactIndex = Math.min(
        (Number(state.missionFactIndex) || 0) + 1,
        Math.max(0, facts.length - 1)
      );
      render();
    });

    scope.querySelector("#checkMissionContinue")?.addEventListener("click", () => {
      state.missionSeen = true;
      state.activeStep = 2;
      render();
    });

    scope.querySelector("#checkNextContinue")?.addEventListener("click", () => {
      if (!step4Complete()) return;
      state.activeStep = 5;
      render();
    });

    scope.querySelector("#strategyOpenBtn")?.addEventListener("click", openStrategyModal);
    scope.querySelector("#checkSubmitBtn")?.addEventListener("click", submitCheck);
    scope.querySelector("#checkBackBtn")?.addEventListener("click", () => {
      closeStrategyModal();
      teardownAskModal();
      window.StudentRouter?.navigateToSection("today");
    });
  }

  async function submitCheck() {
    if (state.submitting) return;

    function fail(msg, step) {
      state.errorMsg = msg;
      if (step) state.activeStep = step;
      render();
    }

    if (!step1Complete()) {
      fail("Bitte sieh dir zuerst deine Mission an.", 1);
      return;
    }
    if (!step2Complete()) {
      fail("Bitte wähle, ob du auf dem richtigen Weg bist.", 2);
      return;
    }
    if (!step3Complete()) {
      fail("Bitte beantworte den kurzen Lern-Check.", 3);
      return;
    }
    if (!step4Complete()) {
      fail("Bitte wähle deinen nächsten Schritt.", 4);
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
      teardownAskModal();
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
    state.plannedWork = null;
    state.needsMidCheck = true;
    state.submitting = false;
    state.errorMsg = "";
    state.activeStep = 1;
    state.missionSeen = false;
    state.missionFactIndex = 0;
    closeStrategyModal();
    teardownAskModal();

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
      state.plannedWork = data.plannedWork || null;
      state.needsMidCheck = data.needsMidCheck !== false;
      if (state.existingCheck?.canEdit) applyCheckToState(state.existingCheck);
      render();
    } catch (err) {
      console.error(err);
      if (root) root.innerHTML = UI().msg("Zwischen-Check konnte nicht geladen werden.");
    }
  }

  window.LogbuchCheck = { init };
})();
