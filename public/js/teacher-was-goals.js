/**
 * Lehrkraft – Was-Ziele (importierter Levelplan einsehen).
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

  function renderTable() {
    const topics = topicsForSubject();
    if (!topics.length) {
      return `
        <div class="tc-empty">
          <p>Für ${escapeHtml(state.subject)} wurde noch kein Levelplan importiert.</p>
          <p class="hint">Nutze den Reiter „Levelplan importieren“, um Was-Ziele anzulegen.</p>
        </div>`;
    }

    const rows = [];
    for (const topic of topics) {
      for (const goal of topic.goals || []) {
        rows.push(`
          <tr>
            <td>${escapeHtml(topic.name)}</td>
            <td>${escapeHtml(goal.text)}</td>
            <td>${escapeHtml(goal.rookieGoalText || "–")}</td>
            <td>${escapeHtml(goal.operatorGoalText || "–")}</td>
            <td>${escapeHtml(goal.streetLegendGoalText || "–")}</td>
          </tr>`);
      }
    }

    if (!rows.length) {
      return `<div class="tc-empty"><p>Für dieses Fach gibt es Themen, aber noch keine Unterthemen.</p></div>`;
    }

    return `
      <div class="lpi-preview-wrap">
        <p class="hint">${topics.length} Thema/Themen · ${rows.length} Unterthemen</p>
        <div class="lpi-table-scroll">
          <table class="lpi-table">
            <thead>
              <tr>
                <th>Thema</th>
                <th>Unterthema (Was-Ziel)</th>
                <th>Rookie</th>
                <th>Operator</th>
                <th>Street Legend</th>
              </tr>
            </thead>
            <tbody>${rows.join("")}</tbody>
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

    const subjects = subjectsList();
    const subjectOptions = subjects
      .map(
        (s) =>
          `<option value="${escapeHtml(s)}" ${s === state.subject ? "selected" : ""}>${escapeHtml(s)}</option>`
      )
      .join("");

    root.innerHTML = `
      <div class="panel">
        <h2>Was-Ziele</h2>
        <p class="hint">
          Hier siehst du den importierten Levelplan pro Klasse und Fach.
          Die Unterthemen nutzen Schüler:innen später beim Tagesziel („Was will ich heute können?“).
        </p>

        <div class="tc-toolbar">
          <label>Klasse:
            <select id="wgClassSelect"></select>
          </label>
          <label>Fach:
            <select id="wgSubjectSelect">${subjectOptions}</select>
          </label>
        </div>

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
      loadData();
    });

    root.querySelector("#wgSubjectSelect")?.addEventListener("change", (e) => {
      state.subject = e.target.value;
      render();
    });
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
