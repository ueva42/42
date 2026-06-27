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

  let initPromise = null;
  let initGeneration = 0;
  let loadRequestId = 0;

  async function fetchJson(url, options = {}, retries = 1) {
    let lastErr = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await fetch(url, options);
        if (!res.ok) {
          const err = new Error(`HTTP ${res.status}`);
          if (attempt < retries && (res.status === 403 || res.status >= 500)) {
            await new Promise((r) => setTimeout(r, 350));
            continue;
          }
          throw err;
        }
        return await res.json();
      } catch (err) {
        lastErr = err;
        if (attempt < retries) {
          await new Promise((r) => setTimeout(r, 350));
          continue;
        }
      }
    }

    throw lastErr || new Error("Anfrage fehlgeschlagen");
  }

  function isLevelplanPayload(data) {
    return data && typeof data.hasClass === "boolean" && Array.isArray(data.grouped);
  }

  function escapeHtml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderMatrix(levelCheck, tiers) {
    if (!levelCheck.goals?.length) {
      return `<p class="lc-empty-goals">Noch keine Unterthemen in diesem Thema.</p>`;
    }

    const target = levelCheck.target;

    const head = tiers
      .map((t) => {
        const tierTarget = target?.tiers?.find((x) => x.id === t.id);
        const req = tierTarget?.recommended;
        const cur = tierTarget?.current ?? 0;
        const targetSub =
          req != null
            ? `<span class="lc-matrix-target ${tierTarget.onTrack ? "lc-matrix-target-ok" : "lc-matrix-target-need"}">${cur}/${req}</span>`
            : "";
        return `<th class="lc-matrix-tier">${escapeHtml(t.label)}${targetSub}</th>`;
      })
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
              <th class="lc-matrix-corner">Unterthema</th>
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
    const target = levelCheck.target;

    const targetBadge = target?.targetGrade
      ? `<span class="lc-target-badge">Zielnote ${escapeHtml(target.targetGradeLabel || String(target.targetGrade).replace(".", ","))}</span>`
      : `<span class="lc-target-badge lc-target-badge-empty">Zielnote in Zielsetzung wählen</span>`;

    return `
      <article class="lc-check-card">
        <div class="lc-check-head">
          <div>
            <span class="lc-check-badge">${escapeHtml(levelCheck.name)}</span>
            ${targetBadge}
            <p class="lc-check-sub">${total} Unterthemen · ${marked} markiert</p>
          </div>
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
          <p class="lc-empty-hint">Deine Lehrkraft legt im Levelstatus Themen mit Unterthemen an.</p>
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
          Dein <strong>Levelplan</strong>: pro Thema die Unterthemen markieren
          (Rookie, Operator, Street Legend). Zahlen in der Kopfzeile = dein Stand / Ziel aus der Zielsetzung.
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

      await loadData(initGeneration);
    } catch (err) {
      console.error(err);
      state.saving = null;
      state.error = "Netzwerkfehler.";
      render();
    }
  }

  async function loadData(generation = initGeneration) {
    const requestId = ++loadRequestId;

    try {
      const data = await fetchJson("/api/student/levelplan");
      if (requestId !== loadRequestId || generation !== initGeneration) return;
      if (!isLevelplanPayload(data)) throw new Error("Ungültige Levelplan-Antwort");

      state.data = data;
      state.loading = false;
      render();
    } catch (err) {
      console.error(err);
      if (requestId !== loadRequestId || generation !== initGeneration) return;
      state.loading = false;
      state.data = null;
      render();
    }
  }

  async function initInternal() {
    const generation = ++initGeneration;
    state.loading = true;
    state.saving = null;
    state.message = "";
    state.error = "";
    state.data = null;

    const root = document.getElementById("levelplan-screen-root");
    if (root) root.innerHTML = `<div class="logbuch-loading">Lade Levelplan…</div>`;

    await loadData(generation);
  }

  function init() {
    if (initPromise) return initPromise;
    initPromise = initInternal().finally(() => {
      initPromise = null;
    });
    return initPromise;
  }

  window.LogbuchLevelplan = { init };
})();
