/**
 * SRL-Logbuch – Zielsetzung (Zielnote & Fortschritts-Balken).
 */
(function () {
  const state = {
    data: null,
    selectedSubject: "",
    loading: false,
    saving: null,
    message: "",
    error: ""
  };

  let initPromise = null;
  let initGeneration = 0;
  let loadRequestId = 0;

  async function fetchJson(url, options = {}, retries = 2) {
    let lastErr = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await fetch(url, options);
        if (!res.ok) {
          const err = new Error(`HTTP ${res.status}`);
          if (attempt < retries && (res.status === 403 || res.status >= 500)) {
            await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
            continue;
          }
          throw err;
        }
        return await res.json();
      } catch (err) {
        lastErr = err;
        if (attempt < retries) {
          await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
          continue;
        }
      }
    }

    throw lastErr || new Error("Anfrage fehlgeschlagen");
  }

  function isZielsetzungPayload(data) {
    return data && typeof data.hasClass === "boolean" && Array.isArray(data.grouped);
  }

  function escapeHtml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatGradeLabel(value) {
    return String(value ?? "").replace(".", ",");
  }

  function gradeOptions() {
    const fromApi = state.data?.gradeOptions;
    if (Array.isArray(fromApi) && fromApi.length) {
      return fromApi.map((g) =>
        typeof g === "object" ? g : { value: String(g), label: formatGradeLabel(g) }
      );
    }
    return ["1", "1.5", "2", "2.5", "3", "3.5", "4", "4.5", "5", "5.5", "6"].map((g) => ({
      value: g,
      label: formatGradeLabel(g)
    }));
  }

  function availableSubjects() {
    return state.data?.subjects?.length
      ? state.data.subjects
      : (state.data?.grouped || []).map((g) => g.subject);
  }

  function visibleGroups() {
    const groups = state.data?.grouped || [];
    if (!state.selectedSubject) return groups;
    return groups.filter((g) => g.subject === state.selectedSubject);
  }

  function renderGradeSelect(topicId, field, selected, saving) {
    const cls = field === "target" ? "zs-grade-select" : "zs-achieved-select";
    const label = field === "target" ? "Zielnote" : "Erreichte Note";
    const dataField = field === "target" ? "targetGradeKey" : "achievedGradeKey";

    return `
      <label class="zs-grade-wrap">
        <span class="zs-grade-label">${label}</span>
        <select
          class="${cls}"
          data-topic-id="${escapeHtml(topicId)}"
          data-field="${dataField}"
          ${saving ? "disabled" : ""}
        >
          <option value="">– wählen –</option>
          ${gradeOptions()
            .map(
              (g) =>
                `<option value="${escapeHtml(g.value)}" ${selected === String(g.value) ? "selected" : ""}>${escapeHtml(g.label)}</option>`
            )
            .join("")}
        </select>
      </label>`;
  }

  function renderTierBar(tier, totalGoals) {
    const current = tier.current ?? 0;
    const recommended = tier.recommended;
    const hasTarget = recommended != null && totalGoals > 0;
    const pct = totalGoals ? Math.min(100, Math.round((current / totalGoals) * 100)) : 0;
    const recPct =
      hasTarget ? Math.min(100, Math.round((recommended / totalGoals) * 100)) : null;
    const statusClass = hasTarget
      ? tier.onTrack
        ? "zs-tier-ontrack"
        : "zs-tier-behind"
      : "zs-tier-info";

    const countLabel = hasTarget
      ? `${current} / ${recommended} von ${totalGoals}${tier.remaining > 0 ? ` · noch ${tier.remaining}` : " · ✓"}`
      : `${current} von ${totalGoals}`;

    return `
      <div class="zs-tier-row ${statusClass}">
        <div class="zs-tier-head">
          <span class="zs-tier-label">${escapeHtml(tier.label)}</span>
          <span class="zs-tier-count">${countLabel}</span>
        </div>
        <div class="zs-tier-bar">
          <div class="zs-tier-fill" style="width:${pct}%"></div>
          ${recPct != null ? `<div class="zs-tier-marker" style="left:${recPct}%"></div>` : ""}
        </div>
      </div>`;
  }

  function renderTopicCard(topic) {
    const saving = state.saving === topic.id;
    const targetSelected = topic.targetGrade != null ? String(topic.targetGrade) : "";
    const achievedSelected =
      topic.achievedGrade != null ? String(topic.achievedGrade) : "";

    return `
      <article class="zs-topic-card" data-topic-id="${escapeHtml(topic.id)}">
        <div class="zs-topic-head">
          <div>
            <h4 class="zs-topic-title">${escapeHtml(topic.name)}</h4>
            <p class="zs-topic-meta">${topic.totalGoals} Unterthemen</p>
          </div>
          <div class="zs-grade-row">
            ${renderGradeSelect(topic.id, "target", targetSelected, saving)}
            ${renderGradeSelect(topic.id, "achieved", achievedSelected, saving)}
          </div>
        </div>

        ${
          topic.targetGrade
            ? `<div class="zs-tiers">
                ${(topic.tiers || []).map((tier) => renderTierBar(tier, topic.totalGoals)).join("")}
              </div>`
            : `<p class="zs-topic-hint zs-topic-hint-muted">Wähle deine Zielnote – die Balken zeigen Rookie, Operator und Street Legend.</p>`
        }

        ${
          topic.unmarked
            ? `<p class="zs-unmarked">${topic.unmarked} Unterthema${topic.unmarked === 1 ? "" : "n"} noch ohne Markierung im Levelplan</p>`
            : ""
        }
      </article>`;
  }

  function renderSubjectToolbar() {
    const subjects = availableSubjects();
    if (!subjects.length) return "";

    return `
      <div class="zs-toolbar">
        <label>
          Fach
          <select id="zsSubjectSelect" class="zs-subject-select">
            <option value="">Alle Fächer</option>
            ${subjects
              .map(
                (s) =>
                  `<option value="${escapeHtml(s)}" ${state.selectedSubject === s ? "selected" : ""}>${escapeHtml(s)}</option>`
              )
              .join("")}
          </select>
        </label>
      </div>`;
  }

  function renderLoadError() {
    return `
      <div class="lc-empty">
        <p>Zielsetzung konnte nicht geladen werden.</p>
        <p class="lc-empty-hint">Bitte erneut versuchen – manchmal hilft ein kurzer Moment oder Tab-Wechsel.</p>
        <button type="button" class="btn-primary zs-retry-btn" id="zsRetryBtn">Erneut laden</button>
      </div>`;
  }

  function renderGrouped() {
    if (!state.data?.hasClass) {
      return `<div class="lc-empty"><p>Dir ist noch keine Klasse zugeordnet.</p></div>`;
    }

    const groups = visibleGroups();
    if (!state.data?.grouped?.length) {
      return `
        <div class="lc-empty">
          <p>Noch keine Themen.</p>
          <p class="lc-empty-hint">Sobald deine Lehrkraft im Levelstatus Themen anlegt, kannst du hier deine Zielnote setzen.</p>
        </div>`;
    }

    if (!groups.length) {
      return `<div class="lc-empty"><p>Für dieses Fach gibt es noch keine Themen.</p></div>`;
    }

    return groups
      .map(
        (group) => `
        <section class="lc-subject-group">
          ${state.selectedSubject ? "" : `<h3 class="lc-subject-title">${escapeHtml(group.subject)}</h3>`}
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
      root.innerHTML = renderLoadError();
      root.querySelector("#zsRetryBtn")?.addEventListener("click", () => {
        state.error = "";
        loadData(initGeneration);
      });
      return;
    }

    root.innerHTML = `
      <div class="lc-shell zs-shell">
        <p class="lc-intro">
          <strong>Zielsetzung:</strong> Wähle dein Fach und setze pro Überthema deine Zielnote.
          Die Balken zeigen Rookie, Operator und Street Legend – so viele Häkchen wie im Levelplan nötig.
        </p>
        ${renderSubjectToolbar()}
        ${state.message ? `<div class="logbuch-msg logbuch-msg-ok">${escapeHtml(state.message)}</div>` : ""}
        ${state.error ? `<div class="logbuch-msg logbuch-msg-error">${escapeHtml(state.error)}</div>` : ""}
        ${renderGrouped()}
      </div>`;

    bindHandlers(root);
  }

  function bindHandlers(root) {
    root.querySelector("#zsSubjectSelect")?.addEventListener("change", (e) => {
      state.selectedSubject = e.target.value;
      state.message = "";
      render();
    });

    root.querySelectorAll(".zs-grade-select, .zs-achieved-select").forEach((sel) => {
      sel.addEventListener("change", () => {
        saveGrades(sel.dataset.topicId, sel.dataset.field, sel.value);
      });
    });
  }

  async function saveGrades(topicId, field, value) {
    state.saving = topicId;
    state.error = "";
    state.message = "";
    render();

    const body = { levelCheckId: topicId };
    if (field === "targetGradeKey") body.targetGradeKey = value;
    if (field === "achievedGradeKey") body.achievedGradeKey = value;

    try {
      const res = await fetch("/api/student/zielsetzung", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      state.saving = null;

      if (!data.success) {
        state.error = data.message || "Speichern fehlgeschlagen.";
        render();
        return;
      }

      state.message =
        field === "achievedGradeKey"
          ? value
            ? `Erreichte Note ${formatGradeLabel(value)} gespeichert.`
            : "Erreichte Note entfernt."
          : `Zielnote ${formatGradeLabel(value)} gespeichert.`;
      await loadData(initGeneration);
    } catch (err) {
      console.error(err);
      state.saving = null;
      state.error = "Netzwerkfehler beim Speichern.";
      render();
    }
  }

  async function loadData(generation = initGeneration) {
    const requestId = ++loadRequestId;
    state.loading = true;
    if (!state.data) render();

    try {
      const data = await fetchJson("/api/student/zielsetzung");
      if (requestId !== loadRequestId || generation !== initGeneration) return;
      if (!isZielsetzungPayload(data)) throw new Error("Ungültige Zielsetzung-Antwort");

      state.data = data;
      state.error = "";
      const subjects = availableSubjects();
      if (state.selectedSubject && !subjects.includes(state.selectedSubject)) {
        state.selectedSubject = "";
      }
      state.loading = false;
      render();
    } catch (err) {
      console.error(err);
      if (requestId !== loadRequestId || generation !== initGeneration) return;
      state.loading = false;
      if (!state.data) state.data = null;
      state.error = state.data ? "Aktualisieren fehlgeschlagen." : "";
      render();
    }
  }

  async function initInternal() {
    const generation = ++initGeneration;
    state.loading = true;
    state.saving = null;
    state.message = "";
    state.error = "";
    if (!state.data) state.data = null;

    const root = document.getElementById("zielsetzung-screen-root");
    if (root && !state.data) {
      root.innerHTML = `<div class="logbuch-loading">Lade Zielsetzung…</div>`;
    }

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
