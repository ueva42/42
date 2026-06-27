/**
 * SRL-Logbuch – Zielsetzung (Zielnote, erreichte Note & Analyse).
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

  function gradeOptions() {
    const fromApi = state.data?.gradeOptions;
    if (Array.isArray(fromApi) && fromApi.length) {
      return fromApi.map((g) =>
        typeof g === "object" ? g : { value: String(g), label: String(g).replace(/-/g, "−") }
      );
    }
    return ["1", "1-", "2+", "2", "2-", "3+", "3", "3-", "4+", "4", "4-", "5+", "5", "5-", "6"].map(
      (g) => ({ value: g, label: g.replace(/-/g, "−") })
    );
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
    if (tier.recommended == null) return "";

    const current = tier.current ?? 0;
    const recommended = tier.recommended;
    const pct = totalGoals ? Math.min(100, Math.round((current / totalGoals) * 100)) : 0;
    const recPct = totalGoals
      ? Math.min(100, Math.round((recommended / totalGoals) * 100))
      : null;
    const statusClass = tier.onTrack ? "zs-tier-ontrack" : "zs-tier-behind";

    return `
      <div class="zs-tier-row ${statusClass}">
        <div class="zs-tier-head">
          <span class="zs-tier-label">${escapeHtml(tier.label)}</span>
          <span class="zs-tier-count">
            ${current} / ${recommended} von ${totalGoals}
            ${tier.remaining > 0 ? ` · noch ${tier.remaining}` : " · ✓"}
          </span>
        </div>
        <div class="zs-tier-bar">
          <div class="zs-tier-fill" style="width:${pct}%"></div>
          ${recPct != null ? `<div class="zs-tier-marker" style="left:${recPct}%"></div>` : ""}
        </div>
      </div>`;
  }

  function renderAnalysis(topic) {
    if (!topic.analysis) return "";
    const cls = topic.onTrack ? "zs-analysis zs-analysis-ok" : "zs-analysis";
    return `<div class="${cls}">${escapeHtml(topic.analysis)}</div>`;
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
            ${
              topic.computedGradeLabel && topic.computedGradeLabel !== "–"
                ? `<p class="zs-computed-grade">Levelplan-Stand: Note ${escapeHtml(topic.computedGradeLabel)}</p>`
                : ""
            }
          </div>
          <div class="zs-grade-row">
            ${renderGradeSelect(topic.id, "target", targetSelected, saving)}
            ${renderGradeSelect(topic.id, "achieved", achievedSelected, saving)}
          </div>
        </div>

        ${renderAnalysis(topic)}

        ${
          topic.targetGrade
            ? `<div class="zs-tiers">
                ${(topic.tiers || []).map((tier) => renderTierBar(tier, topic.totalGoals)).join("")}
              </div>`
            : `<p class="zs-topic-hint zs-topic-hint-muted">Wähle zuerst deine Zielnote – dann siehst du die nötigen Häkchen.</p>`
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

  function renderRulesHint() {
    const hint = state.data?.gradeRulesHint;
    if (!hint) return "";
    const rows = [
      ["1", hint["1"]],
      ["2", hint["2"]],
      ["3", hint["3"]],
      ["4", hint["4"]],
      ["5", hint["5"]],
      ["6", hint["6"]]
    ].filter(([, text]) => text);
    if (!rows.length) return "";
    return `
      <div class="zs-rules-box">
        <p class="zs-rules-title">Richtwerte pro Zielnote (Kommastufen dazwischen)</p>
        <ul class="zs-rules-list">
          ${rows.map(([g, text]) => `<li><b>Note ${escapeHtml(g)}:</b> ${escapeHtml(text)}</li>`).join("")}
        </ul>
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
      root.innerHTML = `<div class="logbuch-msg logbuch-msg-error">Zielsetzung konnte nicht geladen werden.</div>`;
      return;
    }

    root.innerHTML = `
      <div class="lc-shell zs-shell">
        <p class="lc-intro">
          <strong>Zielsetzung:</strong> Wähle dein Fach, setze pro Überthema deine <em>Zielnote</em>
          und trage deine <em>erreichte Note</em> ein. Die Analyse vergleicht beides mit deinem Levelplan.
        </p>
        ${renderRulesHint()}
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
            ? `Erreichte Note ${value.replace(/-/g, "−")} gespeichert.`
            : "Erreichte Note entfernt."
          : `Zielnote ${value.replace(/-/g, "−")} gespeichert.`;
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
