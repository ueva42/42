/**
 * Lehrkraft – Levelplan (importierter Plan, nur Ansicht).
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
      .map(
        (goal) => `
      <tr>
        <td>${escapeHtml(goal.text)}</td>
        <td>${escapeHtml(goal.rookieGoalText || "–")}</td>
        <td>${escapeHtml(goal.operatorGoalText || "–")}</td>
        <td>${escapeHtml(goal.streetLegendGoalText || "–")}</td>
      </tr>`
      )
      .join("");

    return `
      <div class="kr-topic-block">
        <h3>${escapeHtml(topic.name)}${dateLabel ? ` <span class="hint">(${dateLabel})</span>` : ""}</h3>
        <p class="hint">${goals.length} Unterthemen</p>
        <div class="lpi-table-scroll">
          <table class="lpi-table">
            <thead>
              <tr>
                <th>Unterthema (Was-Ziel)</th>
                <th>Rookie</th>
                <th>Operator</th>
                <th>Street Legend</th>
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
          Übersicht über importierte Themen und Zielstufen (Rookie, Operator, Street Legend) – nur Ansicht.
          Neueste Themen stehen oben.
        </p>

        <div class="tc-toolbar">
          <label>Klasse:
            <select id="lpClassSelect"></select>
          </label>
          <label>Fach:
            <select id="lpSubjectSelect">${subjectOptions}</select>
          </label>
        </div>

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

  function bindHandlers(root) {
    root.querySelector("#lpClassSelect")?.addEventListener("change", (e) => {
      state.classId = Number(e.target.value);
      state.error = "";
      loadData();
    });

    root.querySelector("#lpSubjectSelect")?.addEventListener("change", (e) => {
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
