/**
 * Lehrkraft – Levelplan (importierter Plan + Übungsseiten pro Unterthema).
 */
(function () {
  const FALLBACK_SUBJECTS = [
    "Mathe",
    "Deutsch",
    "BNT",
    "Englisch",
    "Geo",
    "Geschichte",
    "Projekt",
    "Physik",
    "Chemie",
    "Biologie",
    "AES",
    "Technik",
    "Französisch",
    "GK",
    "Musik",
    "BK",
    "WBS",
    "Religion/Ethik"
  ];

  const MATERIAL_TYPE_OPTIONS = [
    { id: "none", label: "Kein Material" },
    { id: "url", label: "Webseite / Online-Aufgaben" },
    { id: "reference", label: "Arbeitsblatt oder Buch" },
    { id: "note", label: "Freier Materialhinweis" }
  ];

  const ACTIVE_LEVEL_PRESETS = [
    { id: "rookie", label: "Nur Rookie", levels: ["rookie"] },
    { id: "rookie_operator", label: "Rookie + Operator", levels: ["rookie", "operator"] },
    {
      id: "all",
      label: "Alle drei Level",
      levels: ["rookie", "operator", "street_legend"]
    }
  ];

  const state = {
    classId: null,
    subject: null,
    data: null,
    loading: false,
    error: "",
    editingGoalId: null,
    draftMaterials: {},
    savingGoalId: null,
    savingLevels: false,
    goalMessage: "",
    goalError: "",
    levelsMessage: ""
  };

  function escapeHtml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function sameId(a, b) {
    return String(a) === String(b);
  }

  function normalizePracticeUrlInput(raw) {
    if (raw == null) return "";
    return String(raw).trim();
  }

  function isValidPracticeUrl(url) {
    const value = normalizePracticeUrlInput(url);
    if (!value) return false;
    try {
      const parsed = new URL(value);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
      return Boolean(parsed.hostname);
    } catch {
      return false;
    }
  }

  function practiceUrlStatus(url) {
    const trimmed = normalizePracticeUrlInput(url);
    if (!trimmed) return { tone: "none", label: "Kein Link", icon: "○" };
    if (isValidPracticeUrl(trimmed)) return { tone: "ok", label: "Link hinterlegt", icon: "✓" };
    return { tone: "bad", label: "Ungültig", icon: "!" };
  }

  function renderPracticeStatusBadge(url) {
    const status = practiceUrlStatus(url);
    return `<span class="kr-practice-status kr-practice-status--${status.tone}" title="${escapeHtml(status.label)}"><span class="kr-practice-status__icon" aria-hidden="true">${status.icon}</span> ${escapeHtml(status.label)}</span>`;
  }

  function draftForGoal(goal) {
    if (state.draftMaterials[goal.id]) return state.draftMaterials[goal.id];
    const type = goal.materialType || (goal.practiceUrl ? "url" : "none");
    return {
      materialType: type,
      materialLabel: goal.materialLabel || "",
      materialNote: goal.materialNote || "",
      practiceUrl: goal.practiceUrl || ""
    };
  }

  function materialStatusLabel(goal) {
    const draft = draftForGoal(goal);
    if (draft.materialType === "none" && !draft.practiceUrl) return "Kein Material";
    if (draft.materialType === "url") {
      return isValidPracticeUrl(draft.practiceUrl)
        ? draft.materialLabel || "Link hinterlegt"
        : "Ungültiger Link";
    }
    if (draft.materialType === "reference") {
      return [draft.materialLabel, draft.materialNote].filter(Boolean).join(" · ") || "Arbeitsblatt/Buch";
    }
    if (draft.materialType === "note") {
      return draft.materialNote || draft.materialLabel || "Hinweis";
    }
    return "Material";
  }

  function renderMaterialStatusBadge(goal) {
    const draft = draftForGoal(goal);
    let tone = "none";
    if (draft.materialType === "url" && isValidPracticeUrl(draft.practiceUrl)) tone = "ok";
    else if (draft.materialType !== "none") tone = "ok";
    else if (draft.materialType === "url" && draft.practiceUrl) tone = "bad";
    return `<span class="kr-practice-status kr-practice-status--${tone}">${escapeHtml(materialStatusLabel(goal))}</span>`;
  }

  function activeLevelsKey() {
    const levels = (state.data?.activeLevels || []).map((l) => l.id).join(",");
    const preset = ACTIVE_LEVEL_PRESETS.find((p) => p.levels.join(",") === levels);
    return preset?.id || "all";
  }

  function renderActiveLevelsPanel() {
    const current = activeLevelsKey();
    return `
      <div class="kr-levels-panel">
        <h3>Aktive Level für diese Klasse</h3>
        <p class="hint">Gilt zentral für das Kompetenzraster. Nicht aktive Level werden im Schülerbereich ausgeblendet, Daten bleiben erhalten.</p>
        <div class="kr-levels-presets">
          ${ACTIVE_LEVEL_PRESETS.map(
            (preset) => `
            <button
              type="button"
              class="kr-levels-preset ${current === preset.id ? "is-active" : ""}"
              data-kr-levels="${escapeHtml(preset.id)}"
              ${state.savingLevels ? "disabled" : ""}
            >${escapeHtml(preset.label)}</button>`
          ).join("")}
        </div>
        ${state.levelsMessage ? `<p class="kr-practice-card__ok">${escapeHtml(state.levelsMessage)}</p>` : ""}
      </div>`;
  }

  function subjectsList() {
    const fromApi = state.data?.subjects;
    return Array.isArray(fromApi) && fromApi.length ? fromApi : FALLBACK_SUBJECTS;
  }

  function topicSortTime(topic) {
    if (!topic?.createdAt) return 0;
    const t = new Date(topic.createdAt).getTime();
    return Number.isFinite(t) ? t : 0;
  }

  function topicsForSubject() {
    return (state.data?.levelChecks || [])
      .filter((lc) => lc.subject === state.subject)
      .slice()
      .sort((a, b) => {
        const byDate = topicSortTime(b) - topicSortTime(a);
        if (byDate !== 0) return byDate;
        return (b.sortOrder ?? 0) - (a.sortOrder ?? 0);
      });
  }

  function formatTopicDate(topic) {
    if (!topic?.createdAt) return "";
    const d = new Date(topic.createdAt);
    if (!Number.isFinite(d.getTime())) return "";
    return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
  }

  function findGoal(goalId) {
    for (const topic of state.data?.levelChecks || []) {
      const goal = (topic.goals || []).find((g) => sameId(g.id, goalId));
      if (goal) return goal;
    }
    return null;
  }

  function renderMaterialEditor(goal) {
    const draft = draftForGoal(goal);
    const isSaving = state.savingGoalId === String(goal.id);
    const showUrl = draft.materialType === "url";
    const showNote = draft.materialType === "reference" || draft.materialType === "note";

    return `
      <tr class="kr-practice-edit-row">
        <td colspan="5">
          <div class="kr-practice-card">
            <div class="kr-practice-card__head">
              <h4>Material (optional)</h4>
              <p class="hint">Link, Arbeitsblatt, Buch oder freier Hinweis – alles optional.</p>
            </div>
            <label class="kr-practice-card__field">
              <span>Materialart</span>
              <select class="kr-material-type" data-goal-id="${escapeHtml(goal.id)}">
                ${MATERIAL_TYPE_OPTIONS.map(
                  (opt) =>
                    `<option value="${escapeHtml(opt.id)}" ${draft.materialType === opt.id ? "selected" : ""}>${escapeHtml(opt.label)}</option>`
                ).join("")}
              </select>
            </label>
            <label class="kr-practice-card__field">
              <span>Bezeichnung</span>
              <input type="text" class="kr-material-label" data-goal-id="${escapeHtml(goal.id)}" placeholder="z. B. Übungsseite, Arbeitsblatt 3, Buch" value="${escapeHtml(draft.materialLabel)}">
            </label>
            ${
              showUrl
                ? `<label class="kr-practice-card__field">
              <span>URL</span>
              <input type="url" class="kr-practice-input" data-goal-id="${escapeHtml(goal.id)}" placeholder="https://..." value="${escapeHtml(draft.practiceUrl)}" spellcheck="false" autocomplete="url">
            </label>`
                : ""
            }
            ${
              showNote
                ? `<label class="kr-practice-card__field">
              <span>Materialhinweis</span>
              <input type="text" class="kr-material-note" data-goal-id="${escapeHtml(goal.id)}" placeholder="z. B. Seite 84, Nr. 1–6" value="${escapeHtml(draft.materialNote)}">
            </label>`
                : ""
            }
            <div class="kr-practice-card__meta">
              ${renderMaterialStatusBadge(goal)}
              ${state.goalError && sameId(state.editingGoalId, goal.id) ? `<span class="kr-practice-card__err">${escapeHtml(state.goalError)}</span>` : ""}
              ${state.goalMessage && sameId(state.editingGoalId, goal.id) ? `<span class="kr-practice-card__ok">${escapeHtml(state.goalMessage)}</span>` : ""}
            </div>
            <div class="kr-practice-card__actions">
              <button type="button" class="kr-practice-btn" data-kr-save-material="${escapeHtml(goal.id)}" ${isSaving ? "disabled" : ""}>${isSaving ? "Speichern…" : "Speichern"}</button>
              <button type="button" class="kr-practice-btn kr-practice-btn--ghost" data-kr-clear-material="${escapeHtml(goal.id)}" ${isSaving ? "disabled" : ""}>Entfernen</button>
              <button type="button" class="kr-practice-btn kr-practice-btn--ghost" data-kr-cancel-edit="${escapeHtml(goal.id)}">Schließen</button>
            </div>
          </div>
        </td>
      </tr>`;
  }

  function renderTopicBlock(topic) {
    const goals = topic.goals || [];
    const dateLabel = formatTopicDate(topic);

    if (!goals.length) {
      return `
        <div class="kr-topic-block">
          <h3>${escapeHtml(topic.name)}${dateLabel ? ` <span class="hint">(${dateLabel})</span>` : ""}</h3>
          <p class="tc-empty">Noch keine Unterthemen in diesem Thema.</p>
        </div>`;
    }

    const rows = goals
      .map((goal) => {
        const isEditing = sameId(state.editingGoalId, goal.id);
        const row = `
      <tr>
        <td>${escapeHtml(goal.text)}</td>
        <td>${escapeHtml(goal.rookieGoalText || "–")}</td>
        <td>${escapeHtml(goal.operatorGoalText || "–")}</td>
        <td>${escapeHtml(goal.streetLegendGoalText || "–")}</td>
        <td class="kr-practice-cell">
          ${renderMaterialStatusBadge(goal)}
          <button type="button" class="kr-practice-edit-btn" data-kr-edit-goal="${escapeHtml(goal.id)}">
            ${isEditing ? "Bearbeiten…" : "Material"}
          </button>
        </td>
      </tr>`;
        return isEditing ? row + renderMaterialEditor(goal) : row;
      })
      .join("");

    return `
      <div class="kr-topic-block">
        <h3>${escapeHtml(topic.name)}${dateLabel ? ` <span class="hint">(${dateLabel})</span>` : ""}</h3>
        <p class="hint">${goals.length} Unterthemen</p>
        <div class="lpi-table-scroll">
          <table class="lpi-table kr-goals-table">
            <thead>
              <tr>
                <th>Unterthema (Was-Ziel)</th>
                <th>Rookie</th>
                <th>Operator</th>
                <th>Street Legend</th>
                <th>Material</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>`;
  }

  function renderContent() {
    const topics = topicsForSubject();
    if (!topics.length) {
      return `
        <div class="tc-empty">
          <p>Für ${escapeHtml(state.subject)} wurde noch kein Levelplan importiert.</p>
          <p class="hint">Nutze „Levelplan importieren“, um Themen und Zielstufen anzulegen.</p>
        </div>`;
    }

    return topics.map(renderTopicBlock).join("");
  }

  function render() {
    const root = document.getElementById("levelplanTabRoot");
    if (!root) return;

    if (state.loading && !state.data) {
      root.innerHTML = `<div class="tc-loading">Lade Levelplan…</div>`;
      return;
    }

    if (!state.data) {
      root.innerHTML = `<div class="tc-error">${escapeHtml(state.error || "Levelplan konnte nicht geladen werden.")}</div>`;
      return;
    }

    const subjectOptions = subjectsList()
      .map(
        (s) =>
          `<option value="${escapeHtml(s)}" ${s === state.subject ? "selected" : ""}>${escapeHtml(s)}</option>`
      )
      .join("");

    root.innerHTML = `
      <div class="panel">
        <h2>Levelplan</h2>
        <p class="hint">
          Übersicht über importierte Themen und Zielstufen. Pro Unterthema kann optional Material hinterlegt werden.
        </p>

        <div class="tc-toolbar">
          <label>Klasse:
            <select id="lpClassSelect"></select>
          </label>
          <label>Fach:
            <select id="lpSubjectSelect">${subjectOptions}</select>
          </label>
        </div>

        ${renderActiveLevelsPanel()}

        ${state.error ? `<div class="tc-msg tc-msg-err">${escapeHtml(state.error)}</div>` : ""}

        ${renderContent()}
      </div>`;

    fillClassSelect(root);
    bindHandlers(root);
  }

  function fillClassSelect(root) {
    const sel = root.querySelector("#lpClassSelect");
    if (!sel || !window.__lpClasses) return;
    sel.innerHTML = window.__lpClasses
      .map(
        (c) =>
          `<option value="${c.id}" ${sameId(c.id, state.classId) ? "selected" : ""}>${escapeHtml(c.name)}</option>`
      )
      .join("");
  }

  function setDraft(goalId, patch) {
    const current = draftForGoal({ id: goalId, ...findGoal(goalId) });
    state.draftMaterials[goalId] = { ...current, ...patch };
  }

  function openEditor(goalId) {
    const goal = findGoal(goalId);
    if (!goal) return;
    state.editingGoalId = goalId;
    state.goalMessage = "";
    state.goalError = "";
    if (!state.draftMaterials[goalId]) {
      state.draftMaterials[goalId] = draftForGoal(goal);
    }
    render();
  }

  function closeEditor() {
    state.editingGoalId = null;
    state.goalMessage = "";
    state.goalError = "";
    render();
  }

  async function saveMaterial(goalId, draft) {
    const materialType = draft.materialType || "none";
    const materialLabel = String(draft.materialLabel || "").trim();
    const materialNote = String(draft.materialNote || "").trim();
    const practiceUrl = normalizePracticeUrlInput(draft.practiceUrl);

    if (materialType === "url" && practiceUrl && !isValidPracticeUrl(practiceUrl)) {
      state.goalError = "Bitte gib eine vollständige Webadresse ein.";
      state.goalMessage = "";
      render();
      return;
    }

    state.savingGoalId = String(goalId);
    state.goalError = "";
    state.goalMessage = "";
    render();

    try {
      const res = await fetch(`/api/teacher/levelcheck-goals/${encodeURIComponent(goalId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          materialType,
          materialLabel: materialLabel || null,
          materialNote: materialNote || null,
          practiceUrl: materialType === "url" ? practiceUrl || null : null
        })
      });
      const data = await res.json();
      state.savingGoalId = null;

      if (!res.ok || !data.success) {
        state.goalError = data.message || "Speichern fehlgeschlagen.";
        render();
        return;
      }

      const goal = findGoal(goalId);
      if (goal && data.goal) {
        Object.assign(goal, data.goal);
      }
      state.draftMaterials[goalId] = draftForGoal(goal || { id: goalId, ...data.goal });
      state.goalMessage = materialType === "none" ? "Material entfernt." : "Material gespeichert.";
      state.goalError = "";
      render();
    } catch (err) {
      console.error(err);
      state.savingGoalId = null;
      state.goalError = "Netzwerkfehler beim Speichern.";
      render();
    }
  }

  async function saveActiveLevels(presetId) {
    const preset = ACTIVE_LEVEL_PRESETS.find((p) => p.id === presetId);
    if (!preset || !state.classId) return;

    state.savingLevels = true;
    state.levelsMessage = "";
    render();

    try {
      const res = await fetch(`/api/teacher/classes/${state.classId}/active-levels`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activeLevels: preset.levels })
      });
      const data = await res.json();
      state.savingLevels = false;
      if (!res.ok || !data.success) {
        state.error = data.message || "Level-Einstellung konnte nicht gespeichert werden.";
        render();
        return;
      }
      if (state.data) state.data.activeLevels = data.activeLevels || [];
      state.levelsMessage = "Aktive Level gespeichert.";
      render();
    } catch (err) {
      console.error(err);
      state.savingLevels = false;
      state.error = "Netzwerkfehler.";
      render();
    }
  }

  function bindHandlers(root) {
    root.querySelector("#lpClassSelect")?.addEventListener("change", (e) => {
      state.classId = Number(e.target.value);
      state.editingGoalId = null;
      state.draftMaterials = {};
      state.goalMessage = "";
      state.goalError = "";
      state.levelsMessage = "";
      state.error = "";
      loadData();
    });

    root.querySelector("#lpSubjectSelect")?.addEventListener("change", (e) => {
      state.subject = e.target.value;
      state.editingGoalId = null;
      state.draftMaterials = {};
      state.goalMessage = "";
      state.goalError = "";
      render();
    });

    root.querySelectorAll("[data-kr-levels]").forEach((btn) => {
      btn.addEventListener("click", () => saveActiveLevels(btn.dataset.krLevels));
    });

    root.querySelectorAll("[data-kr-edit-goal]").forEach((btn) => {
      btn.addEventListener("click", () => openEditor(btn.dataset.krEditGoal));
    });

    root.querySelectorAll("[data-kr-cancel-edit]").forEach((btn) => {
      btn.addEventListener("click", closeEditor);
    });

    root.querySelectorAll(".kr-material-type").forEach((select) => {
      select.addEventListener("change", () => {
        setDraft(select.dataset.goalId, { materialType: select.value });
        render();
      });
    });

    root.querySelectorAll(".kr-material-label").forEach((input) => {
      input.addEventListener("input", () => setDraft(input.dataset.goalId, { materialLabel: input.value }));
    });

    root.querySelectorAll(".kr-material-note").forEach((input) => {
      input.addEventListener("input", () => setDraft(input.dataset.goalId, { materialNote: input.value }));
    });

    root.querySelectorAll(".kr-practice-input").forEach((input) => {
      input.addEventListener("input", () => setDraft(input.dataset.goalId, { practiceUrl: input.value }));
    });

    root.querySelectorAll("[data-kr-save-material]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const goalId = btn.dataset.krSaveMaterial;
        const goal = findGoal(goalId);
        saveMaterial(goalId, draftForGoal(goal || { id: goalId }));
      });
    });

    root.querySelectorAll("[data-kr-clear-material]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const goalId = btn.dataset.krClearMaterial;
        saveMaterial(goalId, {
          materialType: "none",
          materialLabel: "",
          materialNote: "",
          practiceUrl: ""
        });
      });
    });
  }

  async function loadClasses() {
    const r = await fetch("/api/class");
    const payload = await r.json();
    if (!r.ok || !Array.isArray(payload)) {
      throw new Error(payload?.error || "Klassen konnten nicht geladen werden.");
    }
    window.__lpClasses = payload;
    return payload;
  }

  async function loadData() {
    if (!state.classId) return;

    state.loading = true;
    if (!state.data) render();

    try {
      const params = new URLSearchParams({ classId: String(state.classId) });
      const res = await fetch(`/api/teacher/levelchecks?${params}`);
      const payload = await res.json();

      if (!res.ok) {
        state.loading = false;
        state.data = null;
        state.error = payload.error || "Laden fehlgeschlagen.";
        render();
        return;
      }

      state.data = payload;
      if (!state.subject || !subjectsList().includes(state.subject)) {
        state.subject = subjectsList()[0] || null;
      }
      state.loading = false;
      state.error = "";
      render();
    } catch (err) {
      console.error(err);
      state.loading = false;
      state.data = null;
      state.error = "Netzwerkfehler beim Laden.";
      render();
    }
  }

  async function init() {
    state.error = "";
    const root = document.getElementById("levelplanTabRoot");
    if (root) root.innerHTML = `<div class="tc-loading">Lade Levelplan…</div>`;

    try {
      const classes = await loadClasses();
      if (!classes.length) {
        if (root) {
          root.innerHTML = `<div class="tc-empty">Bitte zuerst eine Klasse anlegen.</div>`;
        }
        return;
      }

      if (!state.classId || !classes.some((c) => sameId(c.id, state.classId))) {
        state.classId = Number(classes[0].id);
      }

      await loadData();
    } catch (err) {
      console.error(err);
      if (root) {
        root.innerHTML = `<div class="tc-error">${escapeHtml(err.message || "Fehler beim Laden.")}</div>`;
      }
    }
  }

  window.TeacherLevelplan = { init };
})();
