/**
 * SRL-Logbuch – ZWISCHEN-CHECK-Screen (Nachsteuern).
 */
(function () {
  const C = () => window.LOGBUCH;
  const UI = () => window.LogbuchUI;
  const STRATEGIES = () => window.LOGBUCH_STRATEGIES || [];

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

  function selectOptions(items) {
    return items.map((label) => ({ value: label, label }));
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

  function renderDailyGoalCard(ui, entry) {
    const whatGoal = entry.what_goal_text || "–";
    const level = levelLabel(entry.selected_level, entry);
    const levelGoal = entry.level_goal_text || "–";
    const howGoal = entry.how_goal_text || entry.goal || "–";
    const details = entry.details_text;

    return `
      <section class="check-daily-goal">
        <h3 class="check-daily-goal-title">Heutiges Ziel</h3>
        <div class="check-daily-goal-card">
          <p><strong>Was-Ziel:</strong><br>${ui.escapeHtml(whatGoal)}</p>
          <p><strong>Level:</strong><br>${ui.escapeHtml(level)}</p>
          <p><strong>Fachliches Ziel:</strong><br>${ui.escapeHtml(levelGoal)}</p>
          <p><strong>Mein Weg:</strong><br>${ui.escapeHtml(howGoal)}</p>
          ${
            details && String(details).trim()
              ? `<p><strong>Konkret:</strong><br>${ui.escapeHtml(String(details).trim())}</p>`
              : ""
          }
        </div>
      </section>`;
  }

  function renderStrategySelected(ui) {
    if (!state.selectedStrategyName) return "";
    return `
      <div class="check-strategy-selected">
        <span class="check-strategy-selected-label">Gewählte Strategie:</span>
        <strong>${ui.escapeHtml(state.selectedStrategyName)}</strong>
      </div>`;
  }

  function renderStrategyBlock(ui) {
    return `
      <div class="check-strategy-block">
        <button type="button" class="logbuch-btn-strategy" id="strategyOpenBtn">Strategie holen</button>
        <p class="logbuch-hint">Wenn du nicht weiterkommst, hol dir eine passende Lernstrategie.</p>
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
    const steps = strategy.steps
      .map((step, i) => `<li><span>${i + 1}.</span> ${ui.escapeHtml(step)}</li>`)
      .join("");

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
        ${ui.btnPrimary("Diese Strategie nutzen", "strategyApplyBtn")}
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
      <div class="strategy-modal" role="dialog" aria-modal="true" aria-labelledby="strategyModalTitle">
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
    const overlay = document.getElementById("strategyOverlay");
    if (overlay) overlay.remove();
  }

  function applyStrategy(strategy) {
    state.selectedStrategyName = strategy.name;
    state.selectedStrategyProblem = strategy.problem;
    state.selectedStrategyNextStep = strategy.nextStep;
    state.nextStepAnswer = strategy.nextStep;
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

  function renderDone() {
    const root = document.getElementById("check-screen-root");
    if (!root) return;
    const ui = UI();
    const c = state.existingCheck;
    const legacy = isLegacyCheck(c);

    const strategySummary =
      c.selected_strategy_name
        ? `<li><strong>Strategie:</strong> ${ui.escapeHtml(c.selected_strategy_name)}</li>`
        : "";

    const summary = legacy
      ? `${ui.escapeHtml(c.on_track)} ${ui.escapeHtml(c.understands)} ${ui.escapeHtml(c.progress)}${
          c.change_note ? `<br>${ui.escapeHtml(c.change_note)}` : ""
        }`
      : `
        <ul class="check-done-list">
          <li><strong>Auf dem richtigen Weg:</strong> ${ui.escapeHtml(c.on_track)}</li>
          <li><strong>Aufgaben verstanden:</strong> ${ui.escapeHtml(c.understands)}</li>
          <li><strong>Fortschritt:</strong> ${ui.escapeHtml(c.progress)}</li>
          <li><strong>Nächster Schritt:</strong> ${ui.escapeHtml(c.next_step_answer || "–")}</li>
          ${strategySummary}
        </ul>`;

    root.innerHTML = `
      <div class="logbuch-form">
        ${renderDailyGoalCard(ui, state.entry)}
        <div class="logbuch-msg logbuch-msg-info">
          Zwischen-Check für <b>${ui.escapeHtml(state.entry.subject)}</b> ist bereits abgeschlossen.
          <br>${summary}
        </div>
        ${ui.btnGhost("Zurück zu Mein Tag", "checkBackBtn")}
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
      <div class="logbuch-form">
        ${ui.msg("Kein Lern-Eintrag gefunden. Bitte zuerst ein Tagesziel setzen.")}
        ${ui.btnGhost("Zurück zu Mein Tag", "checkBackBtn")}
      </div>`;

    root.querySelector("#checkBackBtn")?.addEventListener("click", () => {
      window.StudentRouter?.navigateToSection("today");
    });
  }

  function allQuestionsAnswered() {
    return !!(state.onTrack && state.understands && state.progress && state.nextStepAnswer);
  }

  function render() {
    const root = document.getElementById("check-screen-root");
    if (!root) return;

    if (!state.entry) {
      renderMissing();
      return;
    }

    if (state.existingCheck) {
      renderDone();
      return;
    }

    const ui = UI();
    const e = state.entry;
    const dateIso =
      e.date instanceof Date
        ? e.date.toISOString().slice(0, 10)
        : String(e.date).slice(0, 10);

    root.innerHTML = `
      <div class="logbuch-form">
        <p class="logbuch-meta">${ui.escapeHtml(formatDate(dateIso))}${e.timeslot ? ` · ${ui.escapeHtml(e.timeslot)}` : ""}</p>

        ${renderDailyGoalCard(ui, e)}

        ${ui.fieldWrap(
          ui.fieldLabel("Bin ich auf dem richtigen Weg?", { required: true }),
          ui.select("onTrack", selectOptions(C().CHECK_ON_TRACK), state.onTrack, {
            phase: "check",
            placeholder: "Bitte wählen…"
          })
        )}

        ${ui.fieldWrap(
          ui.fieldLabel("Verstehe ich die Aufgaben?", { required: true }),
          ui.select("understands", selectOptions(C().CHECK_UNDERSTANDING), state.understands, {
            phase: "check",
            placeholder: "Bitte wählen…"
          })
        )}

        ${ui.fieldWrap(
          ui.fieldLabel("Komme ich gut voran?", { required: true }),
          ui.select("progress", selectOptions(C().CHECK_PROGRESS), state.progress, {
            phase: "check",
            placeholder: "Bitte wählen…"
          })
        )}

        ${ui.fieldWrap(
          ui.fieldLabel("Was mache ich jetzt?", { required: true }),
          ui.select(
            "nextStepAnswer",
            selectOptions(C().CHECK_NEXT_STEP),
            state.nextStepAnswer,
            { phase: "check", placeholder: "Nächsten Schritt wählen…" }
          ),
          "Wähle, wie du jetzt weitermachst."
        )}

        ${renderStrategyBlock(ui)}

        ${state.errorMsg ? ui.msg(state.errorMsg) : ""}

        ${ui.btnPrimary(
          state.submitting ? "Speichern…" : "Zwischen-Check speichern (+3 XP)",
          "checkSubmitBtn",
          state.submitting || !allQuestionsAnswered(),
          "logbuch-submit-full"
        )}
        ${ui.btnGhost("Abbrechen", "checkBackBtn")}
      </div>`;

    bindHandlers(root);
    renderStrategyModal();
  }

  function bindHandlers(root) {
    UI().bindSelects(root, state, () => {
      const submitBtn = root.querySelector("#checkSubmitBtn");
      if (submitBtn) {
        submitBtn.disabled = state.submitting || !allQuestionsAnswered();
      }
    });

    root.querySelector("#strategyOpenBtn")?.addEventListener("click", openStrategyModal);
    root.querySelector("#checkSubmitBtn")?.addEventListener("click", submitCheck);
    root.querySelector("#checkBackBtn")?.addEventListener("click", () => {
      closeStrategyModal();
      window.StudentRouter?.navigateToSection("today");
    });
  }

  async function submitCheck() {
    if (!allQuestionsAnswered()) {
      state.errorMsg = "Bitte beantworte alle vier Fragen.";
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

    try {
      const res = await fetch("/api/student/log/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const data = await res.json();

      if (!data.success) {
        state.submitting = false;
        state.errorMsg = data.message || "Speichern fehlgeschlagen.";
        render();
        return;
      }

      closeStrategyModal();

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
    if (root) {
      root.innerHTML = `<div class="logbuch-loading">Lade Zwischen-Check…</div>`;
    }

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
      render();
    } catch (err) {
      console.error(err);
      if (root) {
        root.innerHTML = UI().msg("Zwischen-Check konnte nicht geladen werden.");
      }
    }
  }

  window.LogbuchCheck = { init };
})();
