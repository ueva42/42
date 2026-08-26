/**
 * Lehrkraft – Levelplan neu (Kataloge nach Klassenstufe + Klasse zuweisen).
 */
(function () {
  const GRADE_LEVELS = ["5", "6", "7", "8", "9", "10"];

  const state = {
    gradeLevel: "10",
    catalogId: null,
    catalogs: [],
    catalogDetail: null,
    classes: [],
    subject: null,
    assignClassId: null,
    expandedTopicIds: new Set(),
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

  function subjectsInCatalog() {
    const fromDetail = (state.catalogDetail?.levelChecks || [])
      .map((t) => t.subject)
      .filter(Boolean);
    return [...new Set(fromDetail)];
  }

  function topicsForSubject() {
    return (state.catalogDetail?.levelChecks || []).filter((t) => t.subject === state.subject);
  }

  function renderTopicBlock(topic) {
    const goals = topic.goals || [];
    const open = state.expandedTopicIds.has(String(topic.id));

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
          Wähle einen Plan und weise ihn einer Klasse zu – ohne zu kopieren.
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

  function bindHandlers(root) {
    root.querySelector("#lpnGradeSelect")?.addEventListener("change", async (e) => {
      state.gradeLevel = e.target.value;
      state.catalogId = null;
      state.catalogDetail = null;
      state.message = "";
      state.error = "";
      await loadCatalogs();
      await loadCatalogDetail();
    });

    root.querySelector("#lpnCatalogSelect")?.addEventListener("change", async (e) => {
      state.catalogId = e.target.value || null;
      state.message = "";
      state.error = "";
      await loadCatalogDetail();
    });

    root.querySelector("#lpnSubjectSelect")?.addEventListener("change", (e) => {
      state.subject = e.target.value;
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
