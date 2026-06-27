/**
 * SRL-Logbuch – Zielsetzung (Zielnote & Level-Fortschritt pro Thema).
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

  function escapeHtml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderTierBar(tier, totalGoals) {
    const current = tier.current ?? 0;
    const recommended = tier.recommended;
    const pct = totalGoals ? Math.min(100, Math.round((current / totalGoals) * 100)) : 0;
    const recPct =
      recommended != null && totalGoals
        ? Math.min(100, Math.round((recommended / totalGoals) * 100))
        : null;
    const statusClass =
      recommended == null ? "" : tier.onTrack ? "zs-tier-ontrack" : "zs-tier-behind";

    return `
      <div class="zs-tier-row ${statusClass}">
        <div class="zs-tier-head">
          <span class="zs-tier-label">${escapeHtml(tier.label)}</span>
          <span class="zs-tier-count">
            ${current}${recommended != null ? ` / ${recommended}` : ""} von ${totalGoals}
          </span>
        </div>
        <div class="zs-tier-bar">
          <div class="zs-tier-fill" style="width:${pct}%"></div>
          ${recPct != null ? `<div class="zs-tier-marker" style="left:${recPct}%"></div>` : ""}
        </div>
      </div>`;
  }

  function renderTopicCard(topic) {
    const gradeOptions = state.data?.gradeOptions || [1, 2, 3, 4, 5, 6];
    const saving = state.saving === topic.id;

    return `
      <article class="zs-topic-card" data-topic-id="${escapeHtml(topic.id)}">
        <div class="zs-topic-head">
          <div>
            <h4 class="zs-topic-title">${escapeHtml(topic.name)}</h4>
            <p class="zs-topic-meta">${topic.totalGoals} Unterthemen · ${escapeHtml(topic.subject)}</p>
          </div>
          <label class="zs-grade-wrap">
            <span class="zs-grade-label">Zielnote</span>
            <select class="zs-grade-select" data-topic-id="${escapeHtml(topic.id)}" ${saving ? "disabled" : ""}>
              <option value="">–</option>
              ${gradeOptions
                .map(
                  (g) =>
                    `<option value="${g}" ${topic.targetGrade === g ? "selected" : ""}>${g}</option>`
                )
                .join("")}
            </select>
          </label>
        </div>

        ${
          topic.targetGrade
            ? `<p class="zs-topic-hint">Markiere im Levelplan mindestens die angezeigten Häkchen pro Stufe.</p>`
            : `<p class="zs-topic-hint zs-topic-hint-muted">Wähle deine Zielnote – dann siehst du, wie viele Häkchen du setzen solltest.</p>`
        }

        <div class="zs-tiers">
          ${(topic.tiers || []).map((tier) => renderTierBar(tier, topic.totalGoals)).join("")}
        </div>

        ${
          topic.unmarked
            ? `<p class="zs-unmarked">${topic.unmarked} Unterthema${topic.unmarked === 1 ? "" : "n"} noch ohne Markierung im Levelplan</p>`
            : ""
        }
      </article>`;
  }

  function renderGrouped() {
    if (!state.data?.hasClass) {
      return `<div class="lc-empty"><p>Dir ist noch keine Klasse zugeordnet.</p></div>`;
    }

    if (!state.data?.grouped?.length) {
      return `
        <div class="lc-empty">
          <p>Noch keine Themen.</p>
          <p class="lc-empty-hint">Sobald deine Lehrkraft im Levelstatus Themen anlegt, kannst du hier deine Zielnote setzen.</p>
        </div>`;
    }

    return state.data.grouped
      .map(
        (group) => `
        <section class="lc-subject-group">
          <h3 class="lc-subject-title">${escapeHtml(group.subject)}</h3>
          <div class="zs-topics">
            ${(group.topics || []).map(renderTopicCard).join("")}
          </div>
        </section>`
      )
      .join("");
  }

  function render() {
    const root = document.getElementById("zielsetzung-screen-root");
    if (!root) return;

    if (state.loading && !state.data) {
      root.innerHTML = `<div class="logbuch-loading">Lade Zielsetzung…</div>`;
      return;
    }

    if (!state.data) {
      root.innerHTML = `<div class="logbuch-msg logbuch-msg-error">Zielsetzung konnte nicht geladen werden.</div>`;
      return;
    }

    root.innerHTML = `
      <div class="lc-shell zs-shell">
        <p class="lc-intro">
          <strong>Zielsetzung:</strong> Setze pro Klassenarbeit-Thema deine Zielnote.
          Die Balken zeigen, wie viele Rookie-, Operator- und Street-Legend-Häkchen du im Levelplan setzen solltest.
        </p>
        ${state.message ? `<div class="logbuch-msg logbuch-msg-ok">${escapeHtml(state.message)}</div>` : ""}
        ${state.error ? `<div class="logbuch-msg logbuch-msg-error">${escapeHtml(state.error)}</div>` : ""}
        ${renderGrouped()}
      </div>`;

    bindHandlers(root);
  }

  function bindHandlers(root) {
    root.querySelectorAll(".zs-grade-select").forEach((sel) => {
      sel.addEventListener("change", () => saveTargetGrade(sel.dataset.topicId, sel.value));
    });
  }

  async function saveTargetGrade(topicId, value) {
    if (!value) return;

    state.saving = topicId;
    state.error = "";
    state.message = "";
    render();

    try {
      const res = await fetch("/api/student/zielsetzung", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ levelCheckId: topicId, targetGrade: Number(value) })
      });
      const data = await res.json();
      state.saving = null;

      if (!data.success) {
        state.error = data.message || "Speichern fehlgeschlagen.";
        render();
        return;
      }

      state.message = "Zielnote gespeichert.";
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
      const data = await fetchJson("/api/student/zielsetzung");
      if (requestId !== loadRequestId || generation !== initGeneration) return;

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

    const root = document.getElementById("zielsetzung-screen-root");
    if (root) root.innerHTML = `<div class="logbuch-loading">Lade Zielsetzung…</div>`;

    await loadData(generation);
  }

  function init() {
    if (initPromise) return initPromise;
    initPromise = initInternal().finally(() => {
      initPromise = null;
    });
    return initPromise;
  }

  window.LogbuchZielsetzung = { init };
})();
