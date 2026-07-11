/**
 * SRL-Logbuch – Taktik-Deck (App-Layout wie Mein Tag).
 */
(function () {
  const UI = () => window.LogbuchUI;
  const STRATEGIES = () => window.LogbuchStrategies?.list() || window.LOGBUCH_STRATEGIES || [];

  const state = {
    modalStrategyId: null,
    selectedCategory: "all"
  };

  function categories(strategies) {
    return [...new Set(strategies.map((s) => s.category).filter(Boolean))];
  }

  function filteredStrategies(strategies) {
    if (state.selectedCategory === "all") return strategies;
    return strategies.filter((s) => s.category === state.selectedCategory);
  }

  function renderStrategyCard(ui, strategy) {
    return `
      <article class="student-card goal-card goal-card--open">
        <div class="card-content">
          <p class="goal-card__subject">${ui.escapeHtml(strategy.category)}</p>
          <p class="goal-card__what">${ui.escapeHtml(strategy.name)}</p>
          <p class="goal-card__what">${ui.escapeHtml(strategy.whenHelps)}</p>
          <div class="lesson-card__actions">
            <button type="button" class="btn-primary taktik-card-btn" data-strategy-id="${ui.escapeHtml(strategy.id)}">
              Taktik ansehen →
            </button>
          </div>
        </div>
      </article>`;
  }

  function renderModalContent(ui, strategy) {
    const steps = strategy.steps
      .map((step) => `<li>${ui.escapeHtml(step)}</li>`)
      .join("");

    return `
      <p class="strategy-modal-kicker">${ui.escapeHtml(strategy.category)}</p>
      <h3 class="strategy-modal-title" id="taktikModalTitle">${ui.escapeHtml(strategy.name)}</h3>

      <div class="strategy-tutorial-block">
        <h4>Wann hilft dir das?</h4>
        <p>${ui.escapeHtml(strategy.whenHelps)}</p>
      </div>

      <div class="strategy-tutorial-block">
        <h4>So geht's:</h4>
        <ol class="strategy-steps">${steps}</ol>
      </div>

      <div class="strategy-tutorial-block strategy-next-block">
        <h4>Nächster Schritt:</h4>
        <p>${ui.escapeHtml(strategy.nextStep)}</p>
      </div>

      <div class="strategy-modal-actions">
        ${ui.btnPrimary("Als Plan B merken", "taktikRememberBtn")}
        ${ui.btnGhost("Schließen", "taktikCloseBtn")}
      </div>`;
  }

  function openModal(strategyId) {
    state.modalStrategyId = strategyId;
    const strategy = STRATEGIES().find((s) => s.id === strategyId);
    if (!strategy) return;

    const existing = document.getElementById("taktikDeckOverlay");
    if (existing) existing.remove();

    const ui = UI();
    const overlay = document.createElement("div");
    overlay.id = "taktikDeckOverlay";
    overlay.className = "strategy-overlay";
    overlay.innerHTML = `
      <div class="strategy-modal" role="dialog" aria-modal="true" aria-labelledby="taktikModalTitle">
        ${renderModalContent(ui, strategy)}
      </div>`;

    document.body.appendChild(overlay);

    overlay.querySelector("#taktikCloseBtn")?.addEventListener("click", closeModal);
    overlay.querySelector("#taktikRememberBtn")?.addEventListener("click", () => {
      const planB =
        window.LogbuchStrategies?.planBFromStrategyName(strategy.name) || strategy.nextStep;
      window.LogbuchStrategies?.rememberPlanB(planB);
      const btn = overlay.querySelector("#taktikRememberBtn");
      if (btn) {
        btn.textContent = "Gemerkt ✓";
        btn.disabled = true;
      }
    });
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closeModal();
    });
  }

  function closeModal() {
    state.modalStrategyId = null;
    document.getElementById("taktikDeckOverlay")?.remove();
  }

  function render() {
    const root = document.getElementById("taktik-deck-screen-root");
    if (!root) return;
    const ui = UI();
    const V = window.LogbuchVisuals;
    const strategies = STRATEGIES();
    const cats = categories(strategies);
    const visible = filteredStrategies(strategies);
    const pct = strategies.length
      ? Math.round((visible.length / strategies.length) * 100)
      : 100;

    const kpi = V?.pageKpi(
      [
        { value: strategies.length, label: "Strategien", accent: true },
        { value: cats.length, label: "Kategorien" },
        { value: visible.length, label: "Sichtbar" }
      ],
      pct,
      String(strategies.length),
      "Taktiken"
    );

    const chipItems = [{ value: "all", label: "Alle" }].concat(
      cats.map((c) => ({ value: c, label: c }))
    );
    const chips = V?.chipBar(chipItems, state.selectedCategory, "data-taktik-cat") || "";

    const cards = visible.length
      ? `<div class="goal-card-grid">${visible.map((s) => renderStrategyCard(ui, s)).join("")}</div>`
      : V?.emptyState({
          title: "Keine Taktiken in dieser Kategorie.",
          text: "Wähle eine andere Kategorie oder stöbere durch alle Strategien."
        }) || "";

    root.innerHTML = V?.pageShell(`
      ${kpi || ""}
      ${chips}
      <div class="student-card">
        <div class="card-content">
          <p class="goal-card__what">Deine Strategien für jede Lernherausforderung – wähle eine Kategorie oder stöbere durch alle Taktiken.</p>
          <button type="button" class="logbuch-btn-ghost taktik-briefing-replay" id="taktikBriefingReplayBtn">
            Start-Briefing nochmal ansehen
          </button>
        </div>
      </div>
      ${V?.sectionBlock("Taktiken", cards) || cards}
    `) || "";

    root.querySelector("#taktikBriefingReplayBtn")?.addEventListener("click", () => {
      window.LogbuchStartBriefing?.openReview();
    });

    root.querySelectorAll("[data-taktik-cat]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.selectedCategory = btn.dataset.taktikCat;
        render();
      });
    });

    root.querySelectorAll(".taktik-card-btn").forEach((btn) => {
      btn.addEventListener("click", () => openModal(btn.dataset.strategyId));
    });
  }

  function init() {
    closeModal();
    render();
  }

  window.LogbuchTaktikDeck = { init };
})();
