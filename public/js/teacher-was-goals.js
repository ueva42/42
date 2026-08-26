/**
 * Lehrkraft – Was-Ziele (importierter Levelplan einsehen, Material zuordnen, löschen).
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

  const state = {
    classId: null,
    subject: null,
    themaId: null,
    data: null,
    loading: false,
    deletingId: null,
    deletingTopicId: null,
    editingGoalId: null,
    draftMaterials: {},
    savingGoalId: null,
    goalMessage: "",
    goalError: "",
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

  function subjectsList() {
    const fromApi = state.data?.subjects;
    return Array.isArray(fromApi) && fromApi.length ? fromApi : FALLBACK_SUBJECTS;
  }

  function topicsForSubject() {
    return (state.data?.levelChecks || []).filter((lc) => lc.subject === state.subject);
  }

  function selectedTopic() {
    if (!state.themaId) return null;
    return topicsForSubject().find((t) => sameId(t.id, state.themaId)) || null;
  }

  function findGoal(goalId) {
    for (const topic of state.data?.levelChecks || []) {
      const goal = (topic.goals || []).find((g) => sameId(g.id, goalId));
      if (goal) return goal;
    }
    return null;
  }

  function assignmentsForSubject() {
    return (state.data?.assignments || []).filter((a) => a.subject === state.subject);
  }

  function topicOptionLabel(topic) {
    const assignments = assignmentsForSubject();
    const multi = assignments.length > 1 || (state.data?.levelChecks || []).filter((t) => t.subject === state.subject && t.catalogId).length > 1;
    if (multi && topic.catalogName) {
      return `${topic.catalogName}: ${topic.name}`;
    }
    return topic.name;
  }

  function renderAssignedPlans() {
    const list = assignmentsForSubject();
    if (!list.length) {
      return `<p class="hint" style="margin-top:.4em">Für diese Klasse ist für ${escapeHtml(state.subject || "dieses Fach")} noch kein Levelplan unter <b>Levelplan-Zuordnung</b> zugewiesen.</p>`;
    }
    return `
      <div class="kr-levels-panel" style="margin:1em 0">
        <h3>Zugewiesene Levelpläne</h3>
        <ul class="hint" style="margin:.4em 0 0;padding-left:1.2em">
          ${list
            .map(
              (a) =>
                `<li><b>${escapeHtml(a.catalogDisplayName || a.catalogName)}</b> · Klassenstufe ${escapeHtml(a.gradeLevel)}</li>`
            )
            .join("")}
        </ul>
      </div>`;
  }

  function ensureThemaSelection() {
    const topics = topicsForSubject();
    if (!topics.length) {
      state.themaId = null;
      return;
    }
    if (!state.themaId || !topics.some((t) => sameId(t.id, state.themaId))) {
      state.themaId = topics[0].id;
    }
  }

  function draftForGoal(goal) {
    if (!goal) {
      return { materialType: "none", materialLabel: "", materialNote: "", practiceUrl: "" };
    }
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
        <td colspan="6">
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

  function renderTable() {
    const topic = selectedTopic();
    if (!topicsForSubject().length) {
      return `
        <div class="tc-empty">
          <p>Für ${escapeHtml(state.subject)} wurde noch kein Levelplan importiert.</p>
          <p class="hint">Nutze den Reiter „Levelplan importieren“.</p>
        </div>`;
    }

    if (!topic) {
      return `<div class="tc-empty"><p>Bitte ein Thema wählen.</p></div>`;
    }

    const goals = topic.goals || [];
    if (!goals.length) {
      return `<div class="tc-empty"><p>Für „${escapeHtml(topic.name)}“ gibt es noch keine Unterthemen.</p></div>`;
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
        <td>
          <button type="button" class="tc-delete-btn wg-goal-del" data-goal-id="${escapeHtml(goal.id)}" ${state.deletingId === String(goal.id) ? "disabled" : ""} title="Was-Ziel löschen">×</button>
        </td>
      </tr>`;
        return isEditing ? row + renderMaterialEditor(goal) : row;
      })
      .join("");

    return `
      <div class="lpi-preview-wrap">
        <div class="wg-topic-head">
          <div>
            <h3>${escapeHtml(topic.name)}</h3>
            <p class="hint">${goals.length} Unterthemen in diesem Thema · Material optional zuordnen</p>
          </div>
          <button type="button" class="tc-delete-btn tc-topic-delete-btn wg-topic-del" data-topic-id="${escapeHtml(topic.id)}" ${state.deletingTopicId === String(topic.id) ? "disabled" : ""}>
            ${state.deletingTopicId === String(topic.id) ? "Löschen…" : "Gesamtes Thema löschen"}
          </button>
        </div>
        <div class="lpi-table-scroll">
          <table class="lpi-table">
            <thead>
              <tr>
                <th>Unterthema (Was-Ziel)</th>
                <th>Rookie</th>
                <th>Operator</th>
                <th>Street Legend</th>
                <th>Material</th>
                <th></th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>`;
  }

  function render() {
    const root = document.getElementById("wasGoalsTabRoot");
    if (!root) return;

    if (state.loading && !state.data) {
      root.innerHTML = `<div class="tc-loading">Lade Was-Ziele…</div>`;
      return;
    }

    if (!state.data) {
      root.innerHTML = `<div class="tc-error">${escapeHtml(state.error || "Was-Ziele konnten nicht geladen werden.")}</div>`;
      return;
    }

    ensureThemaSelection();
    const topics = topicsForSubject();

    const subjectOptions = subjectsList()
      .map(
        (s) =>
          `<option value="${escapeHtml(s)}" ${s === state.subject ? "selected" : ""}>${escapeHtml(s)}</option>`
      )
      .join("");

    const themaOptions = topics
      .map(
        (t) =>
          `<option value="${escapeHtml(t.id)}" ${sameId(t.id, state.themaId) ? "selected" : ""}>${escapeHtml(topicOptionLabel(t))}</option>`
      )
      .join("");

    root.innerHTML = `
      <div class="panel">
        <h2>Was-Ziele</h2>
        <p class="hint">
          Zugewiesene Levelpläne der Klasse ansehen. Material (Link, Arbeitsblatt, Hinweis) zuordnen.
          Einzelne Was-Ziele mit × oder das ganze Thema löschen.
        </p>

        <div class="tc-toolbar">
          <label>Klasse:
            <select id="wgClassSelect"></select>
          </label>
          <label>Fach:
            <select id="wgSubjectSelect">${subjectOptions}</select>
          </label>
          <label>Thema:
            <select id="wgThemaSelect" ${topics.length ? "" : "disabled"}>${themaOptions}</select>
          </label>
        </div>

        ${state.message ? `<div class="tc-msg tc-msg-ok">${escapeHtml(state.message)}</div>` : ""}
        ${state.error ? `<div class="tc-msg tc-msg-err">${escapeHtml(state.error)}</div>` : ""}

        ${renderAssignedPlans()}
        ${renderTable()}
      </div>`;

    fillClassSelect(root);
    bindHandlers(root);
  }

  function fillClassSelect(root) {
    const sel = root.querySelector("#wgClassSelect");
    if (!sel || !window.__wgClasses) return;
    sel.innerHTML = window.__wgClasses
      .map(
        (c) =>
          `<option value="${c.id}" ${sameId(c.id, state.classId) ? "selected" : ""}>${escapeHtml(c.name)}</option>`
      )
      .join("");
  }

  function setDraft(goalId, patch) {
    const current = draftForGoal(findGoal(goalId) || { id: goalId });
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
    root.querySelector("#wgClassSelect")?.addEventListener("change", (e) => {
      state.classId = Number(e.target.value);
      state.editingGoalId = null;
      state.draftMaterials = {};
      state.message = "";
      state.error = "";
      loadData();
    });

    root.querySelector("#wgSubjectSelect")?.addEventListener("change", (e) => {
      state.subject = e.target.value;
      state.themaId = null;
      state.editingGoalId = null;
      state.message = "";
      state.error = "";
      render();
    });

    root.querySelector("#wgThemaSelect")?.addEventListener("change", (e) => {
      state.themaId = e.target.value;
      state.editingGoalId = null;
      render();
    });

    root.querySelectorAll(".wg-goal-del").forEach((btn) => {
      btn.addEventListener("click", () => deleteGoal(btn.dataset.goalId));
    });

    root.querySelector(".wg-topic-del")?.addEventListener("click", (e) => {
      deleteTopic(e.target.dataset.topicId);
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

  async function deleteTopic(topicId) {
    const topic = topicsForSubject().find((t) => sameId(t.id, topicId));
    const name = topic?.name || "dieses Thema";
    if (!topicId || !confirm(`Thema „${name}“ mit allen Was-Zielen wirklich löschen?`)) return;

    state.deletingTopicId = String(topicId);
    state.error = "";
    render();

    try {
      const encodedId = encodeURIComponent(topicId);
      let res = await fetch(`/api/teacher/levelchecks/${encodedId}`, { method: "DELETE" });
      if (res.status === 404 || res.status === 405) {
        res = await fetch(`/api/teacher/levelchecks/${encodedId}/delete`, { method: "POST" });
      }
      const data = await res.json();
      state.deletingTopicId = null;

      if (!res.ok || !data.success) {
        state.error = data.message || data.error || "Löschen fehlgeschlagen.";
        render();
        return;
      }

      state.themaId = null;
      state.editingGoalId = null;
      state.message = `Thema „${name}“ gelöscht.`;
      await loadData();
    } catch (err) {
      console.error(err);
      state.deletingTopicId = null;
      state.error = "Netzwerkfehler beim Löschen.";
      render();
    }
  }

  async function deleteGoal(goalId) {
    if (!goalId || !confirm("Dieses Was-Ziel wirklich löschen?")) return;

    state.deletingId = String(goalId);
    state.error = "";
    render();

    try {
      const encodedId = encodeURIComponent(goalId);
      let res = await fetch(`/api/teacher/levelcheck-goals/${encodedId}`, { method: "DELETE" });
      if (res.status === 404 || res.status === 405) {
        res = await fetch(`/api/teacher/levelcheck-goals/${encodedId}/delete`, { method: "POST" });
      }
      const data = await res.json();
      state.deletingId = null;

      if (!res.ok || !data.success) {
        state.error = data.message || data.error || "Löschen fehlgeschlagen.";
        render();
        return;
      }

      if (sameId(state.editingGoalId, goalId)) state.editingGoalId = null;
      state.message = "Was-Ziel gelöscht." + (data.topicRemoved ? " Leeres Thema wurde entfernt." : "");
      if (data.topicRemoved) state.themaId = null;
      await loadData();
    } catch (err) {
      console.error(err);
      state.deletingId = null;
      state.error = "Netzwerkfehler beim Löschen.";
      render();
    }
  }

  async function loadClasses() {
    const r = await fetch("/api/class");
    const payload = await r.json();
    if (!r.ok || !Array.isArray(payload)) {
      throw new Error(payload?.error || "Klassen konnten nicht geladen werden.");
    }
    window.__wgClasses = payload;
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
    state.message = "";
    state.error = "";
    state.editingGoalId = null;
    state.draftMaterials = {};
    const root = document.getElementById("wasGoalsTabRoot");
    if (root) root.innerHTML = `<div class="tc-loading">Lade Was-Ziele…</div>`;

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

  window.TeacherWasGoals = { init };
})();
