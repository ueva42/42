/**
 * SRL-Logbuch – Levelplan (Matrix pro Levelcheck).
 */
(function () {
  const state = {
    data: null,
    loading: false,
    saving: null,
    message: "",
    error: ""
  };

  function escapeHtml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderMatrix(levelCheck, tiers) {
    if (!levelCheck.goals?.length) {
      return `<p class="lc-empty-goals">Noch keine Ziele in diesem Levelcheck.</p>`;
    }

    const head = tiers
      .map((t) => `<th class="lc-matrix-tier">${escapeHtml(t.label)}</th>`)
      .join("");

    const rows = levelCheck.goals
      .map((goal) => {
        const cells = tiers
          .map((tier) => {
            const active = goal.mark?.tier === tier.id;
            const key = `${goal.id}_${tier.id}`;
            const busy = state.saving === key;
            return `
              <td class="lc-matrix-cell">
                <button
                  type="button"
                  class="lc-matrix-btn ${active ? "lc-matrix-btn-active" : ""}"
                  data-goal-id="${escapeHtml(goal.id)}"
                  data-tier="${escapeHtml(tier.id)}"
                  aria-label="${escapeHtml(goal.text)} – ${escapeHtml(tier.label)}"
                  ${busy ? "disabled" : ""}
                >
                  ${active ? "✓" : ""}
                </button>
              </td>`;
          })
          .join("");

        return `
          <tr>
            <th class="lc-matrix-goal" scope="row">
              <span class="lc-matrix-goal-num">${goal.sortOrder}.</span>
              ${escapeHtml(goal.text)}
            </th>
            ${cells}
          </tr>`;
      })
      .join("");

    return `
      <div class="lc-matrix-wrap">
        <table class="lc-matrix">
          <thead>
            <tr>
              <th class="lc-matrix-corner">Ziel</th>
              ${head}
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }

  function renderLevelCheck(levelCheck, tiers) {
    const marked = (levelCheck.goals || []).filter((g) => g.mark).length;
    const total = (levelCheck.goals || []).length;

    return `
      <article class="lc-check-card">
        <div class="lc-check-head">
          <div>
            <span class="lc-check-badge">${escapeHtml(levelCheck.name)}</span>
            <p class="lc-check-sub">${total} Ziele im Raster</p>
          </div>
          <span class="lc-check-progress">${marked}/${total} markiert</span>
        </div>
        ${renderMatrix(levelCheck, tiers)}
      </article>`;
  }

  function renderGrouped() {
    if (!state.data?.hasClass) {
      return `<div class="lc-empty"><p>Dir ist noch keine Klasse zugeordnet.</p></div>`;
    }

    if (!state.data?.grouped?.length) {
      return `
        <div class="lc-empty">
          <p>Noch kein Levelplan.</p>
          <p class="lc-empty-hint">Deine Lehrkraft legt Levelchecks mit Zielen an.</p>
        </div>`;
    }

    const tiers = state.data.tiers || [];

    return state.data.grouped
      .map(
        (group) => `
        <section class="lc-subject-group">
          <h3 class="lc-subject-title">${escapeHtml(group.subject)}</h3>
          <div class="lc-checks">
            ${group.levelChecks.map((lc) => renderLevelCheck(lc, tiers)).join("")}
          </div>
        </section>`
      )
      .join("");
  }

  function render() {
    const root = document.getElementById("levelplan-screen-root");
    if (!root) return;

    if (state.loading && !state.data) {
      root.innerHTML = `<div class="logbuch-loading">Lade Levelplan…</div>`;
      return;
    }

    if (!state.data) {
      root.innerHTML = `<div class="logbuch-msg logbuch-msg-error">Levelplan konnte nicht geladen werden.</div>`;
      return;
    }

    root.innerHTML = `
      <div class="lc-shell">
        <p class="lc-intro">
          Dein <strong>Levelplan</strong>: pro Levelcheck die Raster-Ziele markieren
          (Rookie, Operator, Street Legend). Nochmal klicken = Markierung entfernen.
        </p>
        ${state.message ? `<div class="logbuch-msg logbuch-msg-ok">${escapeHtml(state.message)}</div>` : ""}
        ${state.error ? `<div class="logbuch-msg logbuch-msg-error">${escapeHtml(state.error)}</div>` : ""}
        ${renderGrouped()}
      </div>`;

    bindHandlers(root);
  }

  function bindHandlers(root) {
    root.querySelectorAll(".lc-matrix-btn").forEach((btn) => {
      btn.addEventListener("click", () => setMark(btn.dataset.goalId, btn.dataset.tier));
    });
  }

  async function setMark(goalId, tier) {
    state.saving = `${goalId}_${tier}`;
    state.error = "";
    state.message = "";
    render();

    try {
      const res = await fetch("/api/student/levelcheck-mark", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goalId, tier })
      });
      const data = await res.json();
      state.saving = null;

      if (!data.success) {
        state.error = data.message || "Speichern fehlgeschlagen.";
        render();
        return;
      }

      await loadData();
    } catch (err) {
      console.error(err);
      state.saving = null;
      state.error = "Netzwerkfehler.";
      render();
    }
  }

  async function loadData() {
    const res = await fetch("/api/student/levelplan");
    state.data = await res.json();
    state.loading = false;
    render();
  }

  async function init() {
    state.loading = true;
    state.saving = null;
    state.message = "";
    state.error = "";
    state.data = null;

    const root = document.getElementById("levelplan-screen-root");
    if (root) root.innerHTML = `<div class="logbuch-loading">Lade Levelplan…</div>`;

    try {
      await loadData();
    } catch (err) {
      console.error(err);
      state.loading = false;
      state.data = null;
      render();
    }
  }

  window.LogbuchLevelplan = { init };
})();
