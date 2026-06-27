/**
 * Lehrkraft – Levelstatus (Fach → Klassenarbeit-Thema → Unterthemen).
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
    subject: null,
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

  function topicsForSubject() {
    const subject = state.subject;
    return (state.data?.levelChecks || []).filter((lc) => lc.subject === subject);
  }

  function renderAddTopicForm() {
    return `
      <form class="tc-add-form" id="tcAddTopicForm">
        <h3>Neues Klassenarbeit-Thema</h3>
        <p class="tc-hint">Überthema für ${escapeHtml(state.subject)} – z. B. „Bruchrechnung“ oder „Satz des Pythagoras“.</p>
        <div class="tc-add-grid tc-add-grid-single">
          <label>
            Thema
            <input type="text" id="tcAddTopicName" maxlength="120" required placeholder="z. B. Bruchrechnung">
          </label>
        </div>
        <button type="submit" class="action" id="tcAddTopicBtn" ${state.saving ? "disabled" : ""}>
          ${state.saving ? "Speichern…" : "Thema anlegen"}
        </button>
      </form>`;
  }

  function renderSubtopicRow(goal) {
    return `
      <li class="tc-goal-item">
        <span class="tc-goal-num">${goal.sortOrder}.</span>
        <span class="tc-goal-text">${escapeHtml(goal.text)}</span>
        <button type="button" class="tc-delete-btn tc-goal-del" data-goal-id="${escapeHtml(goal.id)}">×</button>
      </li>`;
  }

  function renderTopic(topic) {
    return `
      <article class="tc-levelcheck-card" data-check-id="${escapeHtml(topic.id)}">
        <div class="tc-levelcheck-head">
          <div>
            <span class="tc-levelcheck-subject">Klassenarbeit</span>
            <h4 class="tc-levelcheck-name">${escapeHtml(topic.name)}</h4>
          </div>
          <button type="button" class="tc-delete-btn" data-check-id="${escapeHtml(topic.id)}">Thema löschen</button>
        </div>
        <ol class="tc-goal-list">
          ${(topic.goals || []).map(renderSubtopicRow).join("")}
          ${!(topic.goals || []).length ? `<li class="tc-goal-empty">Noch keine Unterthemen – unten das erste eintragen.</li>` : ""}
        </ol>
        <form class="tc-goal-add-form" data-check-id="${escapeHtml(topic.id)}">
          <input type="text" class="tc-goal-input" maxlength="300" placeholder="Neues Unterthema (z. B. Brüche erweitern)" required>
          <button type="submit" class="action tc-goal-add-btn">Unterthema hinzufügen</button>
        </form>
      </article>`;
  }

  function renderTopicsList() {
    const topics = topicsForSubject();
    if (!topics.length) {
      return `<p class="tc-empty">Für ${escapeHtml(state.subject)} noch keine Themen. Lege oben das erste an.</p>`;
    }
    return `<div class="tc-levelcheck-list">${topics.map(renderTopic).join("")}</div>`;
  }

  function render() {
    const root = document.getElementById("competenciesTabRoot");
    if (!root) return;

    if (state.loading && !state.data) {
      root.innerHTML = `<div class="tc-loading">Lade Levelstatus…</div>`;
      return;
    }

    if (!state.data) {
      root.innerHTML = `<div class="tc-error">${escapeHtml(state.error || "Levelstatus konnte nicht geladen werden.")}</div>`;
      return;
    }

    root.innerHTML = `
      <div class="panel">
        <h2>Levelstatus</h2>
        <p class="hint">Pro Fach Klassenarbeit-Themen anlegen und darunter Unterthemen pflegen. Schüler:innen markieren im Levelplan Rookie, Operator oder Street Legend – in der Zielsetzung setzen sie ihre Zielnote.</p>

        <div class="tc-toolbar">
          <label>Klasse:
            <select id="tcClassSelect"></select>
          </label>
          <label>Fach:
            <select id="tcSubjectSelect">${subjectOptions(subjectsList(), state.subject)}</select>
          </label>
        </div>

        ${state.message ? `<div class="tc-msg tc-msg-ok">${escapeHtml(state.message)}</div>` : ""}
        ${state.error ? `<div class="tc-msg tc-msg-err">${escapeHtml(state.error)}</div>` : ""}

        ${renderAddTopicForm()}
        ${renderTopicsList()}
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

    root.querySelector("#tcSubjectSelect")?.addEventListener("change", (e) => {
      state.subject = e.target.value;
      state.message = "";
      state.error = "";
      render();
    });

    root.querySelector("#tcAddTopicForm")?.addEventListener("submit", (e) => {
      e.preventDefault();
      addTopic();
    });

    root.querySelectorAll(".tc-goal-add-form").forEach((form) => {
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        addSubtopic(form);
      });
    });

    root.querySelectorAll(".tc-levelcheck-head .tc-delete-btn").forEach((btn) => {
      btn.addEventListener("click", () => deleteTopic(btn.dataset.checkId));
    });

    root.querySelectorAll(".tc-goal-del").forEach((btn) => {
      btn.addEventListener("click", () => deleteSubtopic(btn.dataset.goalId));
    });
  }

  async function addTopic() {
    const root = document.getElementById("competenciesTabRoot");
    const name = root?.querySelector("#tcAddTopicName")?.value?.trim();

    if (!state.subject || !name) {
      state.error = "Bitte Thema benennen.";
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
        body: JSON.stringify({ classId: state.classId, subject: state.subject, name })
      });
      const data = await res.json();
      state.saving = false;

      if (!data.success) {
        state.error = data.message || "Speichern fehlgeschlagen.";
        render();
        return;
      }

      state.message = `„${name}" angelegt – jetzt Unterthemen hinzufügen.`;
      await loadData();
    } catch (err) {
      console.error(err);
      state.saving = false;
      state.error = "Netzwerkfehler.";
      render();
    }
  }

  async function addSubtopic(form) {
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
        state.error = data.message || "Unterthema konnte nicht gespeichert werden.";
        render();
        return;
      }

      state.message = "Unterthema hinzugefügt.";
      state.error = "";
      await loadData();
    } catch (err) {
      console.error(err);
      state.error = "Netzwerkfehler.";
      render();
    }
  }

  async function deleteTopic(checkId) {
    if (!confirm("Dieses Thema und alle Unterthemen wirklich löschen?")) return;

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
      state.message = "Thema gelöscht.";
      await loadData();
    } catch (err) {
      console.error(err);
      state.error = "Netzwerkfehler.";
      render();
    }
  }

  async function deleteSubtopic(goalId) {
    if (!confirm("Dieses Unterthema wirklich löschen?")) return;

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
      state.message = "Unterthema gelöscht.";
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
    if (root) root.innerHTML = `<div class="tc-loading">Lade Levelstatus…</div>`;

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
