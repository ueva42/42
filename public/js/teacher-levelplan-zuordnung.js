/**
 * Lehrkraft – Levelplan-Zuordnung (Klasse → Fach → Katalog zuweisen & Übersicht).
 */
(function () {
  const state = {
    data: null,
    loading: false,
    filterClassId: "",
    filterGrade: "",
    filterSubject: "",
    assignGrade: "",
    assignCatalogId: "",
    assignClassId: "",
    assignSubject: "",
    assigning: false,
    message: "",
    error: "",
    removingKey: null
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

  function catalogsForGrade() {
    const catalogs = state.data?.catalogs || [];
    if (!state.assignGrade) return catalogs;
    return catalogs.filter((c) => String(c.gradeLevel) === String(state.assignGrade));
  }

  function ensureAssignDefaults() {
    const grades = state.data?.gradeLevels || [];
    if (!state.assignGrade || !grades.map(String).includes(String(state.assignGrade))) {
      state.assignGrade = grades[0] ? String(grades[0]) : "";
    }

    const catalogs = catalogsForGrade();
    if (!state.assignCatalogId || !catalogs.some((c) => sameId(c.id, state.assignCatalogId))) {
      state.assignCatalogId = catalogs[0]?.id ? String(catalogs[0].id) : "";
    }

    const classes = state.data?.classes || [];
    if (!state.assignClassId || !classes.some((c) => sameId(c.id, state.assignClassId))) {
      state.assignClassId = classes[0]?.id ? String(classes[0].id) : "";
    }

    const subjects = state.data?.subjects || [];
    if (!state.assignSubject || !subjects.includes(state.assignSubject)) {
      state.assignSubject = subjects[0] || "";
    }
  }

  function filteredAssignments() {
    const list = state.data?.assignments || [];
    return list.filter((a) => {
      if (state.filterClassId && !sameId(a.classId, state.filterClassId)) return false;
      if (state.filterGrade && String(a.gradeLevel) !== String(state.filterGrade)) return false;
      if (state.filterSubject && a.subject !== state.filterSubject) return false;
      return true;
    });
  }

  function openLevelplan(catalogId, gradeLevel) {
    const params = new URLSearchParams();
    if (gradeLevel) params.set("grade", String(gradeLevel));
    if (catalogId) params.set("catalogId", String(catalogId));
    const qs = params.toString();
    const url = qs ? `/teacher/levelplan?${qs}` : "/teacher/levelplan";
    history.pushState({ tab: "levelplanTab" }, "", url);
    if (typeof showTab === "function") {
      showTab("levelplanTab", null, { skipHistory: true });
    }
    if (window.TeacherLevelplan) {
      window.TeacherLevelplan.init({
        gradeLevel: gradeLevel || null,
        catalogId: catalogId || null
      });
    }
  }

  function renderAssignForm() {
    ensureAssignDefaults();
    const catalogs = catalogsForGrade();

    const gradeOptions = (state.data?.gradeLevels || [])
      .map(
        (g) =>
          `<option value="${escapeHtml(g)}" ${String(g) === String(state.assignGrade) ? "selected" : ""}>Klasse ${escapeHtml(g)}</option>`
      )
      .join("");

    const catalogOptions = catalogs
      .map(
        (c) =>
          `<option value="${escapeHtml(c.id)}" ${sameId(c.id, state.assignCatalogId) ? "selected" : ""}>${escapeHtml(c.displayName || c.name)}</option>`
      )
      .join("");

    const classOptions = (state.data?.classes || [])
      .map(
        (c) =>
          `<option value="${escapeHtml(c.id)}" ${sameId(c.id, state.assignClassId) ? "selected" : ""}>${escapeHtml(c.name)}</option>`
      )
      .join("");

    const subjectOptions = (state.data?.subjects || [])
      .map(
        (s) =>
          `<option value="${escapeHtml(s)}" ${s === state.assignSubject ? "selected" : ""}>${escapeHtml(s)}</option>`
      )
      .join("");

    const canAssign = state.assignCatalogId && state.assignClassId && state.assignSubject && !state.assigning;

    return `
      <div class="kr-levels-panel" style="margin-bottom:1.4em">
        <h3>Klasse zuweisen</h3>
        <p class="hint">Die gewählte Klasse nutzt dann diesen Levelplan für das Fach (Schüler:innen &amp; Nachweise).</p>
        <div class="tc-toolbar" style="align-items:flex-end;gap:.6em;flex-wrap:wrap">
          <label>Klassenstufe:
            <select id="lpzAssignGrade">${gradeOptions || `<option value="">—</option>`}</select>
          </label>
          <label>Levelplan:
            <select id="lpzAssignCatalog">${catalogOptions || `<option value="">— noch kein Plan —</option>`}</select>
          </label>
          <label>Fach:
            <select id="lpzAssignSubject">${subjectOptions || `<option value="">—</option>`}</select>
          </label>
          <label>Klasse:
            <select id="lpzAssignClass">${classOptions || `<option value="">—</option>`}</select>
          </label>
          <button type="button" class="kr-practice-btn" id="lpzAssignBtn" ${canAssign ? "" : "disabled"}>
            ${state.assigning ? "Speichern…" : "Dieser Klasse zuweisen"}
          </button>
        </div>
      </div>`;
  }

  function renderTable() {
    const rows = filteredAssignments();
    if (!rows.length) {
      return `<p class="tc-empty">Keine Zuordnungen${
        state.filterClassId || state.filterGrade || state.filterSubject ? " für diesen Filter" : ""
      }.</p>`;
    }

    return `
      <div class="lpi-table-scroll">
        <table class="lpi-table lpn-zuordnung-table">
          <thead>
            <tr>
              <th>Klasse</th>
              <th>Fach</th>
              <th>Levelplan</th>
              <th>Klassenstufe</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${rows
              .map((a) => {
                const key = `${a.classId}|${a.subject}`;
                const busy = state.removingKey === key;
                return `
              <tr>
                <td><b>${escapeHtml(a.className)}</b></td>
                <td>${escapeHtml(a.subject)}</td>
                <td>${escapeHtml(a.catalogDisplayName || a.catalogName)}</td>
                <td>Klasse ${escapeHtml(a.gradeLevel)}</td>
                <td class="lpn-zuordnung-actions">
                  <button type="button" class="kr-practice-btn kr-practice-btn--ghost" data-lpn-open="${escapeHtml(a.catalogId)}" data-lpn-grade="${escapeHtml(a.gradeLevel)}">Öffnen</button>
                  <button type="button" class="kr-practice-btn kr-practice-btn--ghost" data-lpn-remove-class="${escapeHtml(a.classId)}" data-lpn-remove-subject="${escapeHtml(a.subject)}" ${busy ? "disabled" : ""}>${busy ? "…" : "Entfernen"}</button>
                </td>
              </tr>`;
              })
              .join("")}
          </tbody>
        </table>
      </div>`;
  }

  function render() {
    const root = document.getElementById("levelplanZuordnungTabRoot");
    if (!root) return;

    if (state.loading && !state.data) {
      root.innerHTML = `<div class="tc-loading">Lade Zuordnungen…</div>`;
      return;
    }

    if (!state.data) {
      root.innerHTML = `<div class="tc-error">${escapeHtml(state.error || "Zuordnungen konnten nicht geladen werden.")}</div>`;
      return;
    }

    const classOptions = (state.data.classes || [])
      .map(
        (c) =>
          `<option value="${c.id}" ${sameId(c.id, state.filterClassId) ? "selected" : ""}>${escapeHtml(c.name)}</option>`
      )
      .join("");

    const gradeOptions = (state.data.gradeLevels || [])
      .map(
        (g) =>
          `<option value="${escapeHtml(g)}" ${String(g) === String(state.filterGrade) ? "selected" : ""}>Klasse ${escapeHtml(g)}</option>`
      )
      .join("");

    const subjectOptions = (state.data.subjects || [])
      .map(
        (s) =>
          `<option value="${escapeHtml(s)}" ${s === state.filterSubject ? "selected" : ""}>${escapeHtml(s)}</option>`
      )
      .join("");

    const total = (state.data.assignments || []).length;
    const shown = filteredAssignments().length;

    root.innerHTML = `
      <div class="panel">
        <h2>Levelplan-Zuordnung</h2>
        <p class="hint">
          Weise einer Klasse einen importierten Levelplan für ein Fach zu.
          Details und Löschen unter <b>Levelplan</b>.
        </p>

        ${state.message ? `<div class="tc-msg tc-msg-ok">${escapeHtml(state.message)}</div>` : ""}
        ${state.error ? `<div class="tc-msg tc-msg-err">${escapeHtml(state.error)}</div>` : ""}

        ${renderAssignForm()}

        <div class="tc-toolbar">
          <label>Klasse:
            <select id="lpzFilterClass">
              <option value="">alle</option>
              ${classOptions}
            </select>
          </label>
          <label>Klassenstufe:
            <select id="lpzFilterGrade">
              <option value="">alle</option>
              ${gradeOptions}
            </select>
          </label>
          <label>Fach:
            <select id="lpzFilterSubject">
              <option value="">alle</option>
              ${subjectOptions}
            </select>
          </label>
        </div>

        <p class="hint">${shown} von ${total} Zuordnung(en)</p>

        ${renderTable()}
      </div>`;

    bindHandlers(root);
  }

  function bindHandlers(root) {
    root.querySelector("#lpzFilterClass")?.addEventListener("change", (e) => {
      state.filterClassId = e.target.value;
      render();
    });
    root.querySelector("#lpzFilterGrade")?.addEventListener("change", (e) => {
      state.filterGrade = e.target.value;
      render();
    });
    root.querySelector("#lpzFilterSubject")?.addEventListener("change", (e) => {
      state.filterSubject = e.target.value;
      render();
    });

    root.querySelector("#lpzAssignGrade")?.addEventListener("change", (e) => {
      state.assignGrade = e.target.value;
      state.assignCatalogId = "";
      render();
    });
    root.querySelector("#lpzAssignCatalog")?.addEventListener("change", (e) => {
      state.assignCatalogId = e.target.value;
    });
    root.querySelector("#lpzAssignSubject")?.addEventListener("change", (e) => {
      state.assignSubject = e.target.value;
    });
    root.querySelector("#lpzAssignClass")?.addEventListener("change", (e) => {
      state.assignClassId = e.target.value;
    });
    root.querySelector("#lpzAssignBtn")?.addEventListener("click", () => saveAssignment());

    root.querySelectorAll("[data-lpn-open]").forEach((btn) => {
      btn.addEventListener("click", () => openLevelplan(btn.dataset.lpnOpen, btn.dataset.lpnGrade));
    });

    root.querySelectorAll("[data-lpn-remove-class]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const classId = Number(btn.dataset.lpnRemoveClass);
        const subject = btn.dataset.lpnRemoveSubject;
        removeAssignment(classId, subject);
      });
    });
  }

  async function saveAssignment() {
    const classId = Number(state.assignClassId);
    const catalogId = state.assignCatalogId;
    const subject = state.assignSubject;
    if (!classId || !catalogId || !subject) return;

    state.assigning = true;
    state.message = "";
    state.error = "";
    render();

    try {
      const res = await fetch("/api/teacher/level-plan-assignment", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classId, subject, catalogId })
      });
      const data = await res.json();
      state.assigning = false;
      if (!res.ok || !data.success) {
        state.error = data.message || "Zuweisung fehlgeschlagen.";
        render();
        return;
      }
      state.message = `${data.assignment?.className || "Klasse"} nutzt jetzt „${
        data.assignment?.catalogDisplayName || data.assignment?.catalogName || "den Plan"
      }“ für ${subject}.`;
      await loadData();
    } catch (err) {
      console.error(err);
      state.assigning = false;
      state.error = "Netzwerkfehler.";
      render();
    }
  }

  async function removeAssignment(classId, subject) {
    if (!classId || !subject) return;
    if (!confirm(`Zuweisung für ${subject} wirklich entfernen?`)) return;

    state.removingKey = `${classId}|${subject}`;
    state.message = "";
    state.error = "";
    render();

    try {
      const res = await fetch("/api/teacher/level-plan-assignment", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classId, subject, catalogId: null })
      });
      const data = await res.json();
      state.removingKey = null;
      if (!res.ok || !data.success) {
        state.error = data.message || "Entfernen fehlgeschlagen.";
        render();
        return;
      }
      state.message = "Zuweisung entfernt.";
      await loadData();
    } catch (err) {
      console.error(err);
      state.removingKey = null;
      state.error = "Netzwerkfehler.";
      render();
    }
  }

  async function loadData() {
    state.loading = true;
    if (!state.data) render();

    try {
      const res = await fetch("/api/teacher/level-plan-assignments");
      const data = await res.json();
      state.loading = false;
      if (!res.ok) {
        state.data = null;
        state.error = data.error || "Laden fehlgeschlagen.";
        render();
        return;
      }
      state.data = data;
      state.error = "";
      ensureAssignDefaults();
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
    await loadData();
  }

  window.TeacherLevelplanZuordnung = { init };
})();
