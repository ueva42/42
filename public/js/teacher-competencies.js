/**
 * Lehrkraft – Kompetenz-Status verwalten.
 */
(function () {
  const state = {
    classId: null,
    studentId: null,
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

  function formatDate(val) {
    if (!val) return "–";
    const d = new Date(val);
    if (Number.isNaN(d.getTime())) return "–";
    return d.toLocaleDateString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    });
  }

  function statusOptions(statuses, selected) {
    return (statuses || [])
      .map(
        (s) =>
          `<option value="${escapeHtml(s.id)}" ${s.id === selected ? "selected" : ""}>${escapeHtml(s.label)}</option>`
      )
      .join("");
  }

  function subjectOptions(subjects, selected) {
    return (subjects || [])
      .map(
        (s) =>
          `<option value="${escapeHtml(s)}" ${s === selected ? "selected" : ""}>${escapeHtml(s)}</option>`
      )
      .join("");
  }

  function renderAddForm() {
    const d = state.data;
    if (!d?.students?.length) {
      return `<p class="tc-empty">Keine Schüler:innen in dieser Klasse.</p>`;
    }

    return `
      <div class="tc-add-form">
        <h3>Neues Thema anlegen</h3>
        <div class="tc-add-grid">
          <label>
            Schüler:in
            <select id="tcAddStudent">
              ${d.students
                .map(
                  (s) =>
                    `<option value="${s.id}" ${state.studentId === s.id ? "selected" : ""}>${escapeHtml(s.name)}</option>`
                )
                .join("")}
            </select>
          </label>
          <label>
            Fach
            <select id="tcAddSubject">
              <option value="">Bitte wählen…</option>
              ${subjectOptions(d.subjects, null)}
            </select>
          </label>
          <label>
            Thema
            <input type="text" id="tcAddTopic" maxlength="200" placeholder="z. B. Bruchrechnung – Erweitern">
          </label>
          <label>
            Status
            <select id="tcAddStatus">
              ${statusOptions(d.statuses, "offen")}
            </select>
          </label>
        </div>
        <button class="action" id="tcAddBtn" ${state.saving ? "disabled" : ""}>
          ${state.saving ? "Speichern…" : "Thema hinzufügen"}
        </button>
      </div>`;
  }

  function renderTable() {
    const entries = state.data?.entries || [];
    if (!entries.length) {
      return `<p class="tc-empty">Noch keine Kompetenz-Einträge für diese Auswahl.</p>`;
    }

    return `
      <div class="tc-table-wrap">
        <table class="tc-table">
          <thead>
            <tr>
              <th>Schüler:in</th>
              <th>Fach</th>
              <th>Thema</th>
              <th>Status</th>
              <th>Aktualisiert</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${entries
              .map(
                (e) => `
              <tr data-entry-id="${escapeHtml(e.id)}">
                <td>${escapeHtml(e.studentName)}</td>
                <td>${escapeHtml(e.subject)}</td>
                <td>${escapeHtml(e.topic)}</td>
                <td>
                  <select class="tc-status-select" data-entry-id="${escapeHtml(e.id)}">
                    ${statusOptions(state.data.statuses, e.status)}
                  </select>
                </td>
                <td>${formatDate(e.updatedAt)}</td>
                <td>
                  <button type="button" class="tc-delete-btn" data-entry-id="${escapeHtml(e.id)}">Löschen</button>
                </td>
              </tr>`
              )
              .join("")}
          </tbody>
        </table>
      </div>`;
  }

  function render() {
    const root = document.getElementById("competenciesTabRoot");
    if (!root) return;

    if (state.loading && !state.data) {
      root.innerHTML = `<div class="tc-loading">Lade Kompetenzen…</div>`;
      return;
    }

    if (!state.data) {
      root.innerHTML = `<div class="tc-error">Kompetenzen konnten nicht geladen werden.</div>`;
      return;
    }

    root.innerHTML = `
      <div class="panel">
        <h2>Kompetenz-Status</h2>
        <p class="hint">Lege pro Schüler:in Fach-Themen an und setze den Lernstand. Schüler:innen sehen das unter „Kompetenzen“ und können ab „In Arbeit“ / „Bereit“ einen Levelaufstieg beantragen.</p>

        <div class="tc-toolbar">
          <label>Klasse:
            <select id="tcClassSelect"></select>
          </label>
          <label>Schüler:in:
            <select id="tcStudentSelect">
              <option value="">Alle</option>
            </select>
          </label>
        </div>

        ${state.message ? `<div class="tc-msg tc-msg-ok">${escapeHtml(state.message)}</div>` : ""}
        ${state.error ? `<div class="tc-msg tc-msg-err">${escapeHtml(state.error)}</div>` : ""}

        ${renderAddForm()}
        ${renderTable()}
      </div>`;

    bindHandlers(root);
    fillClassSelect(root);
    fillStudentSelect(root);
  }

  function fillClassSelect(root) {
    const sel = root.querySelector("#tcClassSelect");
    if (!sel || !window.__tcClasses) return;
    sel.innerHTML = window.__tcClasses
      .map(
        (c) =>
          `<option value="${c.id}" ${c.id === state.classId ? "selected" : ""}>${escapeHtml(c.name)}</option>`
      )
      .join("");
  }

  function fillStudentSelect(root) {
    const sel = root.querySelector("#tcStudentSelect");
    if (!sel || !state.data?.students) return;
    sel.innerHTML =
      `<option value="">Alle</option>` +
      state.data.students
        .map(
          (s) =>
            `<option value="${s.id}" ${state.studentId === s.id ? "selected" : ""}>${escapeHtml(s.name)}</option>`
        )
        .join("");
  }

  function bindHandlers(root) {
    root.querySelector("#tcClassSelect")?.addEventListener("change", (e) => {
      state.classId = Number(e.target.value);
      state.studentId = null;
      state.message = "";
      state.error = "";
      loadCompetencies();
    });

    root.querySelector("#tcStudentSelect")?.addEventListener("change", (e) => {
      state.studentId = e.target.value ? Number(e.target.value) : null;
      state.message = "";
      state.error = "";
      loadCompetencies();
    });

    root.querySelector("#tcAddBtn")?.addEventListener("click", addEntry);

    root.querySelectorAll(".tc-status-select").forEach((sel) => {
      sel.addEventListener("change", () => updateStatus(sel.dataset.entryId, sel.value));
    });

    root.querySelectorAll(".tc-delete-btn").forEach((btn) => {
      btn.addEventListener("click", () => deleteEntry(btn.dataset.entryId));
    });
  }

  async function addEntry() {
    const root = document.getElementById("competenciesTabRoot");
    const userId = Number(root?.querySelector("#tcAddStudent")?.value);
    const subject = root?.querySelector("#tcAddSubject")?.value;
    const topic = root?.querySelector("#tcAddTopic")?.value?.trim();
    const status = root?.querySelector("#tcAddStatus")?.value || "offen";

    if (!userId || !subject || !topic) {
      state.error = "Bitte Schüler:in, Fach und Thema ausfüllen.";
      state.message = "";
      render();
      return;
    }

    state.saving = true;
    state.error = "";
    state.message = "";
    render();

    try {
      const res = await fetch("/api/teacher/competencies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, subject, topic, status })
      });
      const data = await res.json();

      if (!data.success) {
        state.saving = false;
        state.error = data.message || "Speichern fehlgeschlagen.";
        render();
        return;
      }

      state.saving = false;
      state.message = "Thema angelegt.";
      state.studentId = userId;
      await loadCompetencies();
    } catch (err) {
      console.error(err);
      state.saving = false;
      state.error = "Netzwerkfehler.";
      render();
    }
  }

  async function updateStatus(entryId, status) {
    try {
      const res = await fetch(`/api/teacher/competencies/${encodeURIComponent(entryId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status })
      });
      const data = await res.json();

      if (!data.success) {
        state.error = data.message || "Status konnte nicht gespeichert werden.";
        render();
        return;
      }

      state.message = "Status aktualisiert.";
      state.error = "";
      await loadCompetencies();
    } catch (err) {
      console.error(err);
      state.error = "Netzwerkfehler.";
      render();
    }
  }

  async function deleteEntry(entryId) {
    if (!confirm("Diesen Kompetenz-Eintrag wirklich löschen?")) return;

    try {
      const res = await fetch(`/api/teacher/competencies/${encodeURIComponent(entryId)}`, {
        method: "DELETE"
      });
      const data = await res.json();

      if (!data.success) {
        state.error = data.message || "Löschen fehlgeschlagen.";
        render();
        return;
      }

      state.message = "Eintrag gelöscht.";
      state.error = "";
      await loadCompetencies();
    } catch (err) {
      console.error(err);
      state.error = "Netzwerkfehler.";
      render();
    }
  }

  async function loadCompetencies() {
    if (!state.classId) return;

    state.loading = true;
    if (!state.data) render();

    try {
      const params = new URLSearchParams({ classId: String(state.classId) });
      if (state.studentId) params.set("studentId", String(state.studentId));

      const res = await fetch(`/api/teacher/competencies?${params}`);
      state.data = await res.json();
      state.loading = false;
      render();
    } catch (err) {
      console.error(err);
      state.loading = false;
      state.data = null;
      render();
    }
  }

  async function init() {
    state.message = "";
    state.error = "";
    state.data = null;

    const root = document.getElementById("competenciesTabRoot");
    if (root) root.innerHTML = `<div class="tc-loading">Lade Kompetenzen…</div>`;

    try {
      if (!window.__tcClasses) {
        const r = await fetch("/api/class");
        window.__tcClasses = await r.json();
      }

      if (!window.__tcClasses.length) {
        if (root) {
          root.innerHTML = `<div class="tc-empty">Bitte zuerst eine Klasse anlegen.</div>`;
        }
        return;
      }

      state.classId = state.classId || window.__tcClasses[0].id;
      await loadCompetencies();
    } catch (err) {
      console.error(err);
      if (root) root.innerHTML = `<div class="tc-error">Fehler beim Laden.</div>`;
    }
  }

  window.TeacherCompetencies = { init };
})();
