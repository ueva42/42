/**
 * Lehrkraft – Wie-Ziele pro Fach (Tagesziel / Plan).
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

  const state = {
    data: null,
    subject: null,
    loading: false,
    saving: false,
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

  function subjectsList() {
    const fromApi = state.data?.subjects;
    return Array.isArray(fromApi) && fromApi.length ? fromApi : FALLBACK_SUBJECTS;
  }

  function goalsForSubject(subject) {
    const custom = state.data?.goalsBySubject?.[subject];
    return Array.isArray(custom) ? custom : [];
  }

  function usesDefaults(subject) {
    return !goalsForSubject(subject).length;
  }

  function renderGoalRow(goal) {
    return `
      <li class="tc-goal-item">
        <span class="tc-goal-num">${goal.sortOrder}.</span>
        <span class="tc-goal-text">${escapeHtml(goal.text)}</span>
        <button type="button" class="tc-delete-btn tc-goal-del" data-goal-id="${escapeHtml(goal.id)}">×</button>
      </li>`;
  }

  function renderDefaultGoalsHint() {
    const defaults = state.data?.defaultGoals || [];
    if (!defaults.length) return "";
    return `
      <div class="slg-defaults">
        <p class="tc-hint">Noch keine eigenen Wie-Ziele – Schüler:innen sehen die Standardliste:</p>
        <ul class="slg-default-list">
          ${defaults.map((g) => `<li>${escapeHtml(g)}</li>`).join("")}
        </ul>
        <button type="button" class="action" id="slgSeedDefaultsBtn">Standardziele als Vorlage übernehmen</button>
      </div>`;
  }

  function renderSubjectGoals() {
    const goals = goalsForSubject(state.subject);
    if (!goals.length) {
      return renderDefaultGoalsHint();
    }

    return `
      <ol class="tc-goal-list">
        ${goals.map(renderGoalRow).join("")}
      </ol>
      <p class="tc-hint">Schüler:innen sehen beim Tagesziel setzen nur diese Wie-Ziele für ${escapeHtml(state.subject)}.</p>`;
  }

  function render() {
    const root = document.getElementById("lessonGoalsTabRoot");
    if (!root) return;

    if (state.loading && !state.data) {
      root.innerHTML = `<div class="tc-loading">Lade Wie-Ziele…</div>`;
      return;
    }

    if (!state.data) {
      root.innerHTML = `<div class="tc-error">${escapeHtml(state.error || "Wie-Ziele konnten nicht geladen werden.")}</div>`;
      return;
    }

    root.innerHTML = `
      <div class="panel">
        <h2>Wie-Ziele pro Fach</h2>
        <p class="hint">Lege pro Fach eigene Wie-Ziele an (Wie arbeite ich daran?). Beim Tagesziel setzen sehen Schüler:innen nur die Ziele des gewählten Fachs. Ohne eigene Ziele gelten die Standardziele.</p>

        <div class="tc-toolbar">
          <label>Fach:
            <select id="slgSubjectSelect">
              ${subjectsList()
                .map(
                  (s) =>
                    `<option value="${escapeHtml(s)}" ${s === state.subject ? "selected" : ""}>${escapeHtml(s)}</option>`
                )
                .join("")}
            </select>
          </label>
          ${usesDefaults(state.subject) ? `<span class="slg-badge">Standardziele aktiv</span>` : `<span class="slg-badge slg-badge-custom">Eigene Ziele</span>`}
        </div>

        ${state.message ? `<div class="tc-msg tc-msg-ok">${escapeHtml(state.message)}</div>` : ""}
        ${state.error ? `<div class="tc-msg tc-msg-err">${escapeHtml(state.error)}</div>` : ""}

        ${renderSubjectGoals()}

        <form class="tc-goal-add-form slg-add-form" id="slgAddGoalForm">
          <input type="text" class="tc-goal-input" id="slgGoalInput" maxlength="300"
            placeholder="Neues Wie-Ziel für ${escapeHtml(state.subject)}" required>
          <button type="submit" class="action" id="slgAddGoalBtn" ${state.saving ? "disabled" : ""}>
            ${state.saving ? "Speichern…" : "Ziel hinzufügen"}
          </button>
        </form>
      </div>`;

    bindHandlers(root);
  }

  function bindHandlers(root) {
    root.querySelector("#slgSubjectSelect")?.addEventListener("change", (e) => {
      state.subject = e.target.value;
      state.message = "";
      state.error = "";
      render();
    });

    root.querySelector("#slgAddGoalForm")?.addEventListener("submit", (e) => {
      e.preventDefault();
      addGoal();
    });

    root.querySelector("#slgSeedDefaultsBtn")?.addEventListener("click", () => {
      seedDefaults();
    });

    root.querySelectorAll(".tc-goal-del").forEach((btn) => {
      btn.addEventListener("click", () => deleteGoal(btn.dataset.goalId));
    });
  }

  async function loadData() {
    state.loading = true;
    state.error = "";
    render();

    try {
      const res = await fetch("/api/teacher/subject-lesson-goals");
      const data = await res.json();
      state.loading = false;

      if (!res.ok) {
        state.data = null;
        state.error = data.error || "Laden fehlgeschlagen.";
        render();
        return;
      }

      state.data = data;
      if (!state.subject) {
        state.subject = subjectsList()[0] || null;
      }
      render();
    } catch (err) {
      console.error(err);
      state.loading = false;
      state.data = null;
      state.error = "Netzwerkfehler.";
      render();
    }
  }

  async function addGoal() {
    const root = document.getElementById("lessonGoalsTabRoot");
    const input = root?.querySelector("#slgGoalInput");
    const goalText = input?.value?.trim();
    if (!goalText || !state.subject) return;

    state.saving = true;
    state.error = "";
    state.message = "";
    render();

    try {
      const res = await fetch("/api/teacher/subject-lesson-goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: state.subject, goalText })
      });
      const data = await res.json();
      state.saving = false;

      if (!data.success) {
        state.error = data.message || "Speichern fehlgeschlagen.";
        render();
        return;
      }

      state.message = "Wie-Ziel hinzugefügt.";
      await loadData();
    } catch (err) {
      console.error(err);
      state.saving = false;
      state.error = "Netzwerkfehler.";
      render();
    }
  }

  async function seedDefaults() {
    if (!state.subject) return;
    if (!confirm(`Standard-Wie-Ziele für ${state.subject} übernehmen?`)) return;

    state.saving = true;
    state.error = "";
    state.message = "";
    render();

    try {
      const res = await fetch("/api/teacher/subject-lesson-goals/seed-defaults", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: state.subject })
      });
      const data = await res.json();
      state.saving = false;

      if (!data.success) {
        state.error = data.message || "Übernehmen fehlgeschlagen.";
        render();
        return;
      }

      state.message = "Standardziele übernommen – jetzt anpassen.";
      await loadData();
    } catch (err) {
      console.error(err);
      state.saving = false;
      state.error = "Netzwerkfehler.";
      render();
    }
  }

  async function deleteGoal(goalId) {
    if (!confirm("Dieses Wie-Ziel wirklich löschen?")) return;

    try {
      const res = await fetch(
        `/api/teacher/subject-lesson-goals/${encodeURIComponent(goalId)}`,
        { method: "DELETE" }
      );
      const data = await res.json();

      if (!data.success) {
        state.error = data.message || "Löschen fehlgeschlagen.";
        render();
        return;
      }

      state.message = "Wie-Ziel gelöscht.";
      state.error = "";
      await loadData();
    } catch (err) {
      console.error(err);
      state.error = "Netzwerkfehler.";
      render();
    }
  }

  async function init() {
    state.message = "";
    state.error = "";
    if (!state.subject) {
      state.subject = subjectsList()[0] || null;
    }
    await loadData();
  }

  window.TeacherLessonGoals = { init };
})();
