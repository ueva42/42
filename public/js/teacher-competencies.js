/**
 * Lehrkraft – Levelchecks mit Raster-Zielen.
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
    classId: null,
    data: null,
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

  function sameId(a, b) {
    return String(a) === String(b);
  }

  function subjectsList() {
    const fromApi = state.data?.subjects;
    return Array.isArray(fromApi) && fromApi.length ? fromApi : FALLBACK_SUBJECTS;
  }

  function subjectOptions(subjects, selected) {
    return (subjects || [])
      .map(
        (s) =>
          `<option value="${escapeHtml(s)}" ${s === selected ? "selected" : ""}>${escapeHtml(s)}</option>`
      )
      .join("");
  }

  function renderAddLevelCheckForm() {
    return `
      <form class="tc-add-form" id="tcAddLevelCheckForm">
        <h3>Neuer Levelcheck</h3>
        <p class="tc-hint">z. B. „Levelcheck I“ mit mehreren Raster-Zielen (Ziel 1, Ziel 2, …).</p>
        <div class="tc-add-grid">
          <label>
            Fach
            <select id="tcAddSubject" required>
              <option value="">Bitte wählen…</option>
              ${subjectOptions(subjectsList(), null)}
            </select>
          </label>
          <label>
            Name
            <input type="text" id="tcAddName" maxlength="120" required placeholder="z. B. Levelcheck I">
          </label>
        </div>
        <button type="submit" class="action" id="tcAddLevelCheckBtn" ${state.saving ? "disabled" : ""}>
          ${state.saving ? "Speichern…" : "Levelcheck anlegen"}
        </button>
      </form>`;
  }

  function renderGoalRow(checkId, goal) {
    return `
      <li class="tc-goal-item">
        <span class="tc-goal-num">${goal.sortOrder}.</span>
        <span class="tc-goal-text">${escapeHtml(goal.text)}</span>
        <button type="button" class="tc-delete-btn tc-goal-del" data-goal-id="${escapeHtml(goal.id)}">×</button>
      </li>`;
  }

  function renderLevelCheck(lc) {
    return `
      <article class="tc-levelcheck-card" data-check-id="${escapeHtml(lc.id)}">
        <div class="tc-levelcheck-head">
          <div>
            <span class="tc-levelcheck-subject">${escapeHtml(lc.subject)}</span>
            <h4 class="tc-levelcheck-name">${escapeHtml(lc.name)}</h4>
          </div>
          <button type="button" class="tc-delete-btn" data-check-id="${escapeHtml(lc.id)}">Levelcheck löschen</button>
        </div>
        <ol class="tc-goal-list">
          ${(lc.goals || []).map((g) => renderGoalRow(lc.id, g)).join("")}
          ${!(lc.goals || []).length ? `<li class="tc-goal-empty">Noch keine Ziele – unten das erste Ziel eintragen.</li>` : ""}
        </ol>
        <form class="tc-goal-add-form" data-check-id="${escapeHtml(lc.id)}">
          <input type="text" class="tc-goal-input" maxlength="300" placeholder="Neues Raster-Ziel (z. B. Brüche erweitern)" required>
          <button type="submit" class="action tc-goal-add-btn">Ziel hinzufügen</button>
        </form>
      </article>`;
  }

  function renderLevelChecksList() {
    const checks = state.data?.levelChecks || [];
    if (!checks.length) {
      return `<p class="tc-empty">Noch keine Levelchecks. Lege oben den ersten an.</p>`;
    }
    return `<div class="tc-levelcheck-list">${checks.map(renderLevelCheck).join("")}</div>`;
  }

  function render() {
    const root = document.getElementById("competenciesTabRoot");
    if (!root) return;

    if (state.loading && !state.data) {
      root.innerHTML = `<div class="tc-loading">Lade Levelchecks…</div>`;
      return;
    }

    if (!state.data) {
      root.innerHTML = `<div class="tc-error">${escapeHtml(state.error || "Levelchecks konnten nicht geladen werden.")}</div>`;
      return;
    }

    root.innerHTML = `
      <div class="panel">
        <h2>Levelchecks</h2>
        <p class="hint">Pro Levelcheck mehrere Ziele eintragen. Schüler:innen sehen eine Matrix und markieren selbst: Rookie, Operator oder Street Legend.</p>

        <div class="tc-toolbar">
          <label>Klasse:
            <select id="tcClassSelect"></select>
          </label>
        </div>

        ${state.message ? `<div class="tc-msg tc-msg-ok">${escapeHtml(state.message)}</div>` : ""}
        ${state.error ? `<div class="tc-msg tc-msg-err">${escapeHtml(state.error)}</div>` : ""}

        ${renderAddLevelCheckForm()}
        ${renderLevelChecksList()}
      </div>`;

    bindHandlers(root);
    fillClassSelect(root);
  }

  function fillClassSelect(root) {
    const sel = root.querySelector("#tcClassSelect");
    if (!sel || !window.__tcClasses) return;
    sel.innerHTML = window.__tcClasses
      .map(
        (c) =>
          `<option value="${c.id}" ${sameId(c.id, state.classId) ? "selected" : ""}>${escapeHtml(c.name)}</option>`
      )
      .join("");
  }

  function bindHandlers(root) {
    root.querySelector("#tcClassSelect")?.addEventListener("change", (e) => {
      state.classId = Number(e.target.value);
      state.message = "";
      state.error = "";
      loadData();
    });

    root.querySelector("#tcAddLevelCheckForm")?.addEventListener("submit", (e) => {
      e.preventDefault();
      addLevelCheck();
    });

    root.querySelectorAll(".tc-goal-add-form").forEach((form) => {
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        addGoal(form);
      });
    });

    root.querySelectorAll(".tc-levelcheck-head .tc-delete-btn").forEach((btn) => {
      btn.addEventListener("click", () => deleteLevelCheck(btn.dataset.checkId));
    });

    root.querySelectorAll(".tc-goal-del").forEach((btn) => {
      btn.addEventListener("click", () => deleteGoal(btn.dataset.goalId));
    });
  }

  async function addLevelCheck() {
    const root = document.getElementById("competenciesTabRoot");
    const subject = root?.querySelector("#tcAddSubject")?.value;
    const name = root?.querySelector("#tcAddName")?.value?.trim();

    if (!subject || !name) {
      state.error = "Bitte Fach und Levelcheck-Namen ausfüllen.";
      state.message = "";
      render();
      return;
    }

    state.saving = true;
    state.error = "";
    state.message = "";
    render();

    try {
      const res = await fetch("/api/teacher/levelchecks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classId: state.classId, subject, name })
      });
      const data = await res.json();
      state.saving = false;

      if (!data.success) {
        state.error = data.message || "Speichern fehlgeschlagen.";
        render();
        return;
      }

      state.message = `„${name}" angelegt – jetzt Ziele hinzufügen.`;
      await loadData();
    } catch (err) {
      console.error(err);
      state.saving = false;
      state.error = "Netzwerkfehler.";
      render();
    }
  }

  async function addGoal(form) {
    const checkId = form.dataset.checkId;
    const input = form.querySelector(".tc-goal-input");
    const goalText = input?.value?.trim();
    if (!goalText) return;

    try {
      const res = await fetch(`/api/teacher/levelchecks/${encodeURIComponent(checkId)}/goals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goalText })
      });
      const data = await res.json();

      if (!data.success) {
        state.error = data.message || "Ziel konnte nicht gespeichert werden.";
        render();
        return;
      }

      state.message = "Ziel hinzugefügt.";
      state.error = "";
      await loadData();
    } catch (err) {
      console.error(err);
      state.error = "Netzwerkfehler.";
      render();
    }
  }

  async function deleteLevelCheck(checkId) {
    if (!confirm("Diesen Levelcheck und alle Ziele wirklich löschen?")) return;

    try {
      const res = await fetch(`/api/teacher/levelchecks/${encodeURIComponent(checkId)}`, {
        method: "DELETE"
      });
      const data = await res.json();
      if (!data.success) {
        state.error = data.message || "Löschen fehlgeschlagen.";
        render();
        return;
      }
      state.message = "Levelcheck gelöscht.";
      await loadData();
    } catch (err) {
      console.error(err);
      state.error = "Netzwerkfehler.";
      render();
    }
  }

  async function deleteGoal(goalId) {
    if (!confirm("Dieses Ziel wirklich löschen?")) return;

    try {
      const res = await fetch(`/api/teacher/levelcheck-goals/${encodeURIComponent(goalId)}`, {
        method: "DELETE"
      });
      const data = await res.json();
      if (!data.success) {
        state.error = data.message || "Löschen fehlgeschlagen.";
        render();
        return;
      }
      state.message = "Ziel gelöscht.";
      await loadData();
    } catch (err) {
      console.error(err);
      state.error = "Netzwerkfehler.";
      render();
    }
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

  async function loadClasses() {
    const r = await fetch("/api/class");
    const payload = await r.json();
    if (!r.ok || !Array.isArray(payload)) {
      throw new Error(payload?.error || "Klassen konnten nicht geladen werden.");
    }
    window.__tcClasses = payload;
    return payload;
  }

  async function init() {
    state.message = "";
    state.error = "";
    state.data = null;

    const root = document.getElementById("competenciesTabRoot");
    if (root) root.innerHTML = `<div class="tc-loading">Lade Levelchecks…</div>`;

    try {
      const classes = await loadClasses();
      if (!classes.length) {
        if (root) {
          root.innerHTML = `<div class="tc-empty">Bitte zuerst eine Klasse anlegen (Menü „Klassen & Schüler“).</div>`;
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

  window.TeacherCompetencies = { init };
})();
