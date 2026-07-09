/**
 * Lehrkraft – Was-Ziele (importierter Levelplan einsehen & löschen).
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
    themaId: null,
    data: null,
    loading: false,
    deletingId: null,
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

  function topicsForSubject() {
    return (state.data?.levelChecks || []).filter((lc) => lc.subject === state.subject);
  }

  function selectedTopic() {
    if (!state.themaId) return null;
    return topicsForSubject().find((t) => sameId(t.id, state.themaId)) || null;
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
      .map(
        (goal) => `
      <tr>
        <td>${escapeHtml(goal.text)}</td>
        <td>${escapeHtml(goal.rookieGoalText || "–")}</td>
        <td>${escapeHtml(goal.operatorGoalText || "–")}</td>
        <td>${escapeHtml(goal.streetLegendGoalText || "–")}</td>
        <td>
          <button type="button" class="tc-delete-btn wg-goal-del" data-goal-id="${escapeHtml(goal.id)}" ${state.deletingId === String(goal.id) ? "disabled" : ""} title="Was-Ziel löschen">×</button>
        </td>
      </tr>`
      )
      .join("");

    return `
      <div class="lpi-preview-wrap">
        <h3>${escapeHtml(topic.name)}</h3>
        <p class="hint">${goals.length} Unterthemen in diesem Thema</p>
        <div class="lpi-table-scroll">
          <table class="lpi-table">
            <thead>
              <tr>
                <th>Unterthema (Was-Ziel)</th>
                <th>Rookie</th>
                <th>Operator</th>
                <th>Street Legend</th>
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
          `<option value="${escapeHtml(t.id)}" ${sameId(t.id, state.themaId) ? "selected" : ""}>${escapeHtml(t.name)}</option>`
      )
      .join("");

    root.innerHTML = `
      <div class="panel">
        <h2>Was-Ziele</h2>
        <p class="hint">
          Importierten Levelplan pro Thema einsehen. Einzelne Was-Ziele kannst du mit × löschen.
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

  function bindHandlers(root) {
    root.querySelector("#wgClassSelect")?.addEventListener("change", (e) => {
      state.classId = Number(e.target.value);
      state.message = "";
      state.error = "";
      loadData();
    });

    root.querySelector("#wgSubjectSelect")?.addEventListener("change", (e) => {
      state.subject = e.target.value;
      state.themaId = null;
      state.message = "";
      state.error = "";
      render();
    });

    root.querySelector("#wgThemaSelect")?.addEventListener("change", (e) => {
      state.themaId = e.target.value;
      render();
    });

    root.querySelectorAll(".wg-goal-del").forEach((btn) => {
      btn.addEventListener("click", () => deleteGoal(btn.dataset.goalId));
    });
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

      state.message = "Was-Ziel gelöscht.";
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
