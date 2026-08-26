/**
 * Lehrkraft – Levelplan neu (Kataloge nach Klassenstufe + Klasse zuweisen + Material).
 */
(function () {
  const GRADE_LEVELS = ["5", "6", "7", "8", "9", "10"];

  const MATERIAL_TYPE_OPTIONS = [
    { id: "none", label: "Kein Material" },
    { id: "url", label: "Webseite / Online-Aufgaben" },
    { id: "reference", label: "Arbeitsblatt oder Buch" },
    { id: "note", label: "Freier Materialhinweis" }
  ];

  const state = {
    gradeLevel: "10",
    catalogId: null,
    catalogs: [],
    catalogDetail: null,
    classes: [],
    subject: null,
    assignClassId: null,
    expandedTopicIds: new Set(),
    editingGoalId: null,
    draftMaterials: {},
    savingGoalId: null,
    goalMessage: "",
    goalError: "",
    loading: false,
    assigning: false,
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

  function subjectsInCatalog() {
    const fromDetail = (state.catalogDetail?.levelChecks || [])
      .map((t) => t.subject)
      .filter(Boolean);
    return [...new Set(fromDetail)];
  }

  function topicsForSubject() {
    return (state.catalogDetail?.levelChecks || []).filter((t) => t.subject === state.subject);
  }

  function findGoal(goalId) {
    for (const topic of state.catalogDetail?.levelChecks || []) {
      const goal = (topic.goals || []).find((g) => sameId(g.id, goalId));
      if (goal) return goal;
    }
    return null;
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

  function isTopicExpanded(topic) {
    const id = String(topic.id);
    if (state.expandedTopicIds.has(id)) return true;
    if (state.editingGoalId) {
      return (topic.goals || []).some((goal) => sameId(goal.id, state.editingGoalId));
    }
    return false;
  }

  function renderTopicBlock(topic) {
    const goals = topic.goals || [];
    const open = isTopicExpanded(topic);

    if (!goals.length) {
      return `
        <details class="kr-topic-block kr-topic-accordion" data-topic-id="${escapeHtml(topic.id)}" ${open ? "open" : ""}>
          <summary class="kr-topic-summary">
            <span class="kr-topic-name">${escapeHtml(topic.name)}</span>
          </summary>
          <div class="kr-topic-body"><p class="tc-empty">Noch keine Unterthemen.</p></div>
        </details>`;
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
      <details class="kr-topic-block kr-topic-accordion" data-topic-id="${escapeHtml(topic.id)}" ${open ? "open" : ""}>
        <summary class="kr-topic-summary">
          <span class="kr-topic-name">${escapeHtml(topic.name)}</span>
        </summary>
        <div class="kr-topic-body">
          <div class="lpi-table-scroll">
            <table class="lpi-table kr-goals-table">
              <thead>
                <tr>
                  <th>Unterthema</th>
                  <th>Rookie</th>
                  <th>Operator</th>
                  <th>Street Legend</th>
                  <th>Material</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        </div>
      </details>`;
  }

  function renderCatalogBody() {
    if (!state.catalogId) {
      return `<div class="tc-empty"><p>Noch kein Levelplan für Klassenstufe ${escapeHtml(state.gradeLevel)}. Bitte zuerst unter „Levelplan importieren“ anlegen.</p></div>`;
    }
    if (state.loading && !state.catalogDetail) {
      return `<div class="tc-loading">Lade Levelplan…</div>`;
    }
    if (!state.catalogDetail) {
      return `<div class="tc-error">${escapeHtml(state.error || "Levelplan konnte nicht geladen werden.")}</div>`;
    }

    const topics = topicsForSubject();
    if (!topics.length) {
      return `<div class="tc-empty"><p>Für ${escapeHtml(state.subject || "dieses Fach")} enthält der Plan noch keine Themen.</p></div>`;
    }

    return `<div class="kr-topic-list">${topics.map(renderTopicBlock).join("")}</div>`;
  }

  function renderAssignments() {
    const list = state.catalogDetail?.assignments || [];
    if (!list.length) {
      return `<p class="hint">Noch keiner Klasse zugewiesen.</p>`;
    }
    return `
      <ul class="lpn-assign-list">
        ${list
          .map(
            (a) =>
              `<li><b>${escapeHtml(a.className)}</b> · ${escapeHtml(a.subject)}</li>`
          )
          .join("")}
      </ul>`;
  }

  function render() {
    const root = document.getElementById("levelplanNeuTabRoot");
    if (!root) return;

    const gradeOptions = GRADE_LEVELS.map(
      (g) =>
        `<option value="${escapeHtml(g)}" ${String(g) === String(state.gradeLevel) ? "selected" : ""}>Klasse ${escapeHtml(g)}</option>`
    ).join("");

    const catalogOptions = state.catalogs
      .map(
        (c) =>
          `<option value="${escapeHtml(c.id)}" ${sameId(c.id, state.catalogId) ? "selected" : ""}>${escapeHtml(c.name)}</option>`
      )
      .join("");

    const subjectOptions = subjectsInCatalog()
      .map(
        (s) =>
          `<option value="${escapeHtml(s)}" ${s === state.subject ? "selected" : ""}>${escapeHtml(s)}</option>`
      )
      .join("");

    const classOptions = state.classes
      .map(
        (c) =>
          `<option value="${c.id}" ${sameId(c.id, state.assignClassId) ? "selected" : ""}>${escapeHtml(c.name)}</option>`
      )
      .join("");

    root.innerHTML = `
      <div class="panel">
        <h2>Levelplan neu</h2>
        <p class="hint">
          Hier siehst du die Levelpläne einer <b>Klassenstufe</b>.
          Material hinterlegen und den Plan einer Klasse zuweisen – ohne zu kopieren.
        </p>

        <div class="tc-toolbar">
          <label>Klassenstufe:
            <select id="lpnGradeSelect">${gradeOptions}</select>
          </label>
          <label>Levelplan:
            <select id="lpnCatalogSelect">
              ${catalogOptions || `<option value="">— noch kein Plan —</option>`}
            </select>
          </label>
          <label>Fach:
            <select id="lpnSubjectSelect">
              ${subjectOptions || `<option value="">—</option>`}
            </select>
          </label>
        </div>

        ${state.message ? `<div class="tc-msg tc-msg-ok">${escapeHtml(state.message)}</div>` : ""}
        ${state.error ? `<div class="tc-msg tc-msg-err">${escapeHtml(state.error)}</div>` : ""}

        <div class="kr-levels-panel" style="margin-top:1.2em">
          <h3>Klasse zuweisen</h3>
          <p class="hint">Die gewählte Klasse nutzt dann diesen Levelplan für das Fach (Schüler:innen &amp; Nachweise).</p>
          <div class="tc-toolbar" style="align-items:flex-end;gap:.6em;flex-wrap:wrap">
            <label>Klasse:
              <select id="lpnAssignClass">${classOptions}</select>
            </label>
            <button type="button" class="kr-practice-btn" id="lpnAssignBtn" ${
              !state.catalogId || !state.subject || state.assigning ? "disabled" : ""
            }>
              ${state.assigning ? "Speichern…" : "Dieser Klasse zuweisen"}
            </button>
            <button type="button" class="kr-practice-btn kr-practice-btn--ghost" id="lpnUnassignBtn" ${
              !state.catalogId || !state.subject || state.assigning ? "disabled" : ""
            }>
              Zuweisung entfernen
            </button>
          </div>
          ${renderAssignments()}
        </div>

        ${renderCatalogBody()}
      </div>`;

    bindHandlers(root);
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

  function bindHandlers(root) {
    root.querySelector("#lpnGradeSelect")?.addEventListener("change", async (e) => {
      state.gradeLevel = e.target.value;
      state.catalogId = null;
      state.catalogDetail = null;
      state.editingGoalId = null;
      state.draftMaterials = {};
      state.message = "";
      state.error = "";
      await loadCatalogs();
      await loadCatalogDetail();
    });

    root.querySelector("#lpnCatalogSelect")?.addEventListener("change", async (e) => {
      state.catalogId = e.target.value || null;
      state.editingGoalId = null;
      state.draftMaterials = {};
      state.message = "";
      state.error = "";
      await loadCatalogDetail();
    });

    root.querySelector("#lpnSubjectSelect")?.addEventListener("change", (e) => {
      state.subject = e.target.value;
      state.editingGoalId = null;
      render();
    });

    root.querySelector("#lpnAssignClass")?.addEventListener("change", (e) => {
      state.assignClassId = Number(e.target.value);
    });

    root.querySelector("#lpnAssignBtn")?.addEventListener("click", () => saveAssignment(true));
    root.querySelector("#lpnUnassignBtn")?.addEventListener("click", () => saveAssignment(false));

    root.querySelectorAll(".kr-topic-accordion").forEach((details) => {
      details.addEventListener("toggle", () => {
        const topicId = details.dataset.topicId;
        if (!topicId) return;
        if (details.open) state.expandedTopicIds.add(String(topicId));
        else state.expandedTopicIds.delete(String(topicId));
      });
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

  async function saveAssignment(assign) {
    if (!state.assignClassId || !state.subject) return;
    if (assign && !state.catalogId) return;

    state.assigning = true;
    state.message = "";
    state.error = "";
    render();

    try {
      const res = await fetch("/api/teacher/level-plan-assignment", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          classId: state.assignClassId,
          subject: state.subject,
          catalogId: assign ? state.catalogId : null
        })
      });
      const data = await res.json();
      state.assigning = false;
      if (!res.ok || !data.success) {
        state.error = data.message || "Zuweisung fehlgeschlagen.";
        render();
        return;
      }
      state.message = assign
        ? `${data.assignment?.className || "Klasse"} nutzt jetzt „${data.assignment?.catalogName || "den Plan"}“ für ${state.subject}.`
        : "Zuweisung entfernt – Klasse nutzt wieder den alten klassengebundenen Plan (falls vorhanden).";
      await loadCatalogDetail();
    } catch (err) {
      console.error(err);
      state.assigning = false;
      state.error = "Netzwerkfehler.";
      render();
    }
  }

  async function loadClasses() {
    const r = await fetch("/api/class");
    const payload = await r.json();
    if (!r.ok || !Array.isArray(payload)) {
      throw new Error(payload?.error || "Klassen konnten nicht geladen werden.");
    }
    state.classes = payload;
    if (!state.assignClassId || !payload.some((c) => sameId(c.id, state.assignClassId))) {
      state.assignClassId = Number(payload[0]?.id) || null;
    }
  }

  async function loadCatalogs() {
    const res = await fetch(
      `/api/teacher/level-plan-catalogs?gradeLevel=${encodeURIComponent(state.gradeLevel)}`
    );
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Kataloge konnten nicht geladen werden.");
    state.catalogs = data.catalogs || [];
    if (!state.catalogId || !state.catalogs.some((c) => sameId(c.id, state.catalogId))) {
      state.catalogId = state.catalogs[0]?.id || null;
    }
  }

  async function loadCatalogDetail() {
    if (!state.catalogId) {
      state.catalogDetail = null;
      state.loading = false;
      render();
      return;
    }

    state.loading = true;
    render();

    try {
      const res = await fetch(`/api/teacher/level-plan-catalogs/${encodeURIComponent(state.catalogId)}`);
      const data = await res.json();
      state.loading = false;
      if (!res.ok) {
        state.catalogDetail = null;
        state.error = data.error || "Laden fehlgeschlagen.";
        render();
        return;
      }
      state.catalogDetail = data;
      const subjects = subjectsInCatalog();
      if (!state.subject || !subjects.includes(state.subject)) {
        state.subject = subjects[0] || null;
      }
      state.error = "";
      render();
    } catch (err) {
      console.error(err);
      state.loading = false;
      state.catalogDetail = null;
      state.error = "Netzwerkfehler beim Laden.";
      render();
    }
  }

  async function init() {
    state.message = "";
    state.error = "";
    const root = document.getElementById("levelplanNeuTabRoot");
    if (root) root.innerHTML = `<div class="tc-loading">Lade Levelplan neu…</div>`;

    try {
      await loadClasses();
      await loadCatalogs();
      await loadCatalogDetail();
    } catch (err) {
      console.error(err);
      if (root) {
        root.innerHTML = `<div class="tc-error">${escapeHtml(err.message || "Fehler beim Laden.")}</div>`;
      }
    }
  }

  window.TeacherLevelplanNeu = { init };
})();
