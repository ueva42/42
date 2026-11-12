/**
 * Lehrkraft – Wie-Ziele pro Fach (Tagesziel / Plan).
 * Eigene Ziele ersetzen die Standardliste vollständig; × löscht einzelne Ziele.
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

  function ensureGoalsBucket() {
    if (!state.data) state.data = { subjects: subjectsList(), defaultGoals: [], goalsBySubject: {} };
    if (!state.data.goalsBySubject || typeof state.data.goalsBySubject !== "object") {
      state.data.goalsBySubject = {};
    }
  }

  function goalsForSubject(subject) {
    const custom = state.data?.goalsBySubject?.[subject];
    return Array.isArray(custom) ? custom : [];
  }

  function setGoalsForSubject(subject, goals) {
    ensureGoalsBucket();
    state.data.goalsBySubject[subject] = Array.isArray(goals) ? goals : [];
  }

  function usesDefaults(subject) {
    return !goalsForSubject(subject).length;
  }

  function renderGoalRow(goal) {
    return `
      <li class="tc-goal-item">
        <span class="tc-goal-num">${escapeHtml(goal.sortOrder)}.</span>
        <span class="tc-goal-text">${escapeHtml(goal.text)}</span>
        <button type="button" class="tc-delete-btn tc-goal-del" data-goal-id="${escapeHtml(goal.id)}" title="Dieses Wie-Ziel löschen">Löschen</button>
      </li>`;
  }

  function renderDefaultGoalsHint() {
    const defaults = state.data?.defaultGoals || [];
    if (!defaults.length) {
      return `
        <div class="slg-defaults">
          <p class="tc-hint">Noch keine eigenen Wie-Ziele. Unten ein Ziel hinzufügen – dann gilt nur noch deine Liste.</p>
        </div>`;
    }
    return `
      <div class="slg-defaults">
        <p class="tc-hint"><strong>Standardliste aktiv</strong> – die kannst du nicht einzeln ankreuzen oder löschen. Sobald du eigene Ziele anlegst, ersetzen sie diese Liste komplett für ${escapeHtml(state.subject)}.</p>
        <ul class="slg-default-list">
          ${defaults.map((g) => `<li>${escapeHtml(g)}</li>`).join("")}
        </ul>
        <div class="slg-default-actions">
          <button type="button" class="action" id="slgSeedDefaultsBtn">Standard als Vorlage übernehmen und bearbeiten</button>
        </div>
        <p class="tc-hint">Oder unten einfach eigene Ziele eintippen – die Standardliste verschwindet dann für dieses Fach.</p>
      </div>`;
  }

  function renderSubjectGoals() {
    const goals = goalsForSubject(state.subject);
    if (!goals.length) {
      return renderDefaultGoalsHint();
    }

    return `
      <div class="slg-custom">
        <div class="slg-custom-head">
          <p class="tc-hint">Schüler:innen sehen nur diese ${goals.length} Wie-Ziele für ${escapeHtml(state.subject)} (nicht mehr die Standardliste).</p>
          <button type="button" class="tc-delete-btn" id="slgClearAllBtn">Alle löschen → zurück zu Standard</button>
        </div>
        <ol class="tc-goal-list">
          ${goals.map(renderGoalRow).join("")}
        </ol>
      </div>`;
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
        <p class="hint">Eigene Wie-Ziele ersetzen die Standardliste für dieses Fach vollständig. Einzelne Ziele kannst du mit „Löschen“ entfernen; alle weg = wieder Standard.</p>

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
          ${
            usesDefaults(state.subject)
              ? `<span class="slg-badge">Standardziele aktiv</span>`
              : `<span class="slg-badge slg-badge-custom">Eigene Ziele (${goalsForSubject(state.subject).length})</span>`
          }
        </div>

        ${state.message ? `<div class="tc-msg tc-msg-ok">${escapeHtml(state.message)}</div>` : ""}
        ${state.error ? `<div class="tc-msg tc-msg-err">${escapeHtml(state.error)}</div>` : ""}

        ${renderSubjectGoals()}

        <form class="tc-goal-add-form slg-add-form" id="slgAddGoalForm">
          <input type="text" class="tc-goal-input" id="slgGoalInput" maxlength="300"
            placeholder="Neues Wie-Ziel für ${escapeHtml(state.subject)}" required>
          <button type="submit" class="action" id="slgAddGoalBtn" ${state.saving ? "disabled" : ""}>
            ${state.saving ? "Speichern…" : usesDefaults(state.subject) ? "Eigenes Ziel anlegen (ersetzt Standard)" : "Ziel hinzufügen"}
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

    root.querySelector("#slgClearAllBtn")?.addEventListener("click", () => {
      clearAllGoals();
    });

    root.querySelectorAll(".tc-goal-del").forEach((btn) => {
      btn.addEventListener("click", () => deleteGoal(btn.dataset.goalId));
    });
  }

  async function loadData({ keepMessage = false } = {}) {
    state.loading = true;
    state.error = "";
    if (!keepMessage) state.message = "";
    render();

    try {
      const res = await fetch("/api/teacher/subject-lesson-goals", {
        credentials: "same-origin",
        cache: "no-store"
      });
      const data = await res.json().catch(() => null);
      state.loading = false;

      if (!res.ok || !data) {
        state.data = null;
        state.error = data?.error || "Laden fehlgeschlagen.";
        render();
        return;
      }

      state.data = {
        subjects: Array.isArray(data.subjects) ? data.subjects : FALLBACK_SUBJECTS,
        defaultGoals: Array.isArray(data.defaultGoals) ? data.defaultGoals : [],
        goalsBySubject:
          data.goalsBySubject && typeof data.goalsBySubject === "object"
            ? data.goalsBySubject
            : {}
      };
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
    if (!goalText || !state.subject || state.saving) return;

    const subject = state.subject;
    const wasDefaults = usesDefaults(subject);
    state.saving = true;
    state.error = "";
    state.message = "";
    render();

    try {
      const res = await fetch("/api/teacher/subject-lesson-goals", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, goalText })
      });
      const data = await res.json().catch(() => null);
      state.saving = false;

      if (!res.ok || !data?.success || !data.goal) {
        state.error = data?.message || "Speichern fehlgeschlagen.";
        render();
        return;
      }

      const next = goalsForSubject(subject).slice();
      next.push({
        id: data.goal.id,
        text: data.goal.text,
        sortOrder: data.goal.sortOrder
      });
      setGoalsForSubject(subject, next);

      state.message = wasDefaults
        ? "Eigenes Wie-Ziel angelegt – Standardliste für dieses Fach ist ersetzt."
        : "Wie-Ziel hinzugefügt.";
      render();
      await loadData({ keepMessage: true });
    } catch (err) {
      console.error(err);
      state.saving = false;
      state.error = "Netzwerkfehler.";
      render();
    }
  }

  async function seedDefaults() {
    if (!state.subject || state.saving) return;
    if (
      !confirm(
        `Standard-Wie-Ziele für ${state.subject} als bearbeitbare Liste übernehmen?\nDanach kannst du einzelne Ziele löschen oder umformulieren.`
      )
    ) {
      return;
    }

    state.saving = true;
    state.error = "";
    state.message = "";
    render();

    try {
      const res = await fetch("/api/teacher/subject-lesson-goals/seed-defaults", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: state.subject })
      });
      const data = await res.json().catch(() => null);
      state.saving = false;

      if (!res.ok || !data?.success) {
        state.error = data?.message || "Übernehmen fehlgeschlagen.";
        render();
        return;
      }

      if (Array.isArray(data.goals)) {
        setGoalsForSubject(state.subject, data.goals);
      }

      state.message = "Vorlage übernommen – jetzt mit „Löschen“ anpassen oder eigene Ziele ergänzen.";
      render();
      await loadData({ keepMessage: true });
    } catch (err) {
      console.error(err);
      state.saving = false;
      state.error = "Netzwerkfehler.";
      render();
    }
  }

  async function deleteGoal(goalId) {
    if (!goalId || state.saving) return;
    if (!confirm("Dieses Wie-Ziel wirklich löschen?")) return;

    const subject = state.subject;
    state.saving = true;
    state.error = "";
    state.message = "";
    render();

    try {
      const res = await fetch(
        `/api/teacher/subject-lesson-goals/${encodeURIComponent(goalId)}`,
        { method: "DELETE", credentials: "same-origin", cache: "no-store" }
      );
      const data = await res.json().catch(() => null);
      state.saving = false;

      if (!res.ok || !data?.success) {
        state.error = data?.message || "Löschen fehlgeschlagen.";
        render();
        return;
      }

      const next = goalsForSubject(subject).filter((g) => String(g.id) !== String(goalId));
      setGoalsForSubject(subject, next);
      state.message = next.length
        ? "Wie-Ziel gelöscht."
        : "Letztes eigenes Ziel gelöscht – wieder Standardliste aktiv.";
      render();
      await loadData({ keepMessage: true });
    } catch (err) {
      console.error(err);
      state.saving = false;
      state.error = "Netzwerkfehler.";
      render();
    }
  }

  async function clearAllGoals() {
    if (!state.subject || state.saving) return;
    if (
      !confirm(
        `Alle eigenen Wie-Ziele für ${state.subject} löschen?\nSchüler:innen sehen dann wieder die Standardliste.`
      )
    ) {
      return;
    }

    const subject = state.subject;
    state.saving = true;
    state.error = "";
    state.message = "";
    render();

    try {
      const res = await fetch(
        `/api/teacher/subject-lesson-goals?subject=${encodeURIComponent(subject)}`,
        { method: "DELETE", credentials: "same-origin", cache: "no-store" }
      );
      const data = await res.json().catch(() => null);
      state.saving = false;

      if (!res.ok || !data?.success) {
        state.error = data?.message || "Löschen fehlgeschlagen.";
        render();
        return;
      }

      setGoalsForSubject(subject, []);
      state.message = "Eigene Ziele gelöscht – Standardliste wieder aktiv.";
      render();
      await loadData({ keepMessage: true });
    } catch (err) {
      console.error(err);
      state.saving = false;
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
