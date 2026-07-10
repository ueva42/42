/**
 * SRL-Logbuch – Taktik-Deck (Strategien jederzeit nachschlagen).
 */
(function () {
  const UI = () => window.LogbuchUI;
  const STRATEGIES = () => window.LogbuchStrategies?.list() || window.LOGBUCH_STRATEGIES || [];

  const state = {
    modalStrategyId: null
  };

  function renderStrategyCard(ui, strategy) {
    return `
      <article class="taktik-card">
        <p class="taktik-card-category">${ui.escapeHtml(strategy.category)}</p>
        <h3 class="taktik-card-title">${ui.escapeHtml(strategy.name)}</h3>
        <p class="taktik-card-when">${ui.escapeHtml(strategy.whenHelps)}</p>
        <button type="button" class="logbuch-btn-ghost taktik-card-btn" data-strategy-id="${ui.escapeHtml(strategy.id)}">
          Taktik ansehen
        </button>
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
    const strategies = STRATEGIES();

    root.innerHTML = `
      <div class="taktik-deck-shell">
        <div class="taktik-deck-intro-card">
          <p class="taktik-deck-intro">
            Hier findest du Strategien, die dir helfen, wenn du beim Lernen festhängst.
          </p>
          <button type="button" class="logbuch-btn-ghost taktik-briefing-replay" id="taktikBriefingReplayBtn">
            Start-Briefing nochmal ansehen
          </button>
        </div>
        <div class="taktik-deck-grid">
          ${strategies.map((s) => renderStrategyCard(ui, s)).join("")}
        </div>
      </div>`;

    root.querySelector("#taktikBriefingReplayBtn")?.addEventListener("click", () => {
      window.LogbuchStartBriefing?.openReview();
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
