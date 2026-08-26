/**
 * Lehrkraft – Levelplan-Zuordnung (Übersicht Klasse → Fach → Katalog).
 */
(function () {
  const state = {
    data: null,
    loading: false,
    filterClassId: "",
    filterGrade: "",
    filterSubject: "",
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

  function filteredAssignments() {
    const list = state.data?.assignments || [];
    return list.filter((a) => {
      if (state.filterClassId && !sameId(a.classId, state.filterClassId)) return false;
      if (state.filterGrade && String(a.gradeLevel) !== String(state.filterGrade)) return false;
      if (state.filterSubject && a.subject !== state.filterSubject) return false;
      return true;
    });
  }

  function openLevelplanNeu(catalogId, gradeLevel) {
    const params = new URLSearchParams();
    if (gradeLevel) params.set("grade", String(gradeLevel));
    if (catalogId) params.set("catalogId", String(catalogId));
    const qs = params.toString();
    const url = qs ? `/teacher/levelplan-neu?${qs}` : "/teacher/levelplan-neu";
    history.pushState({ tab: "levelplanNeuTab" }, "", url);
    if (typeof showTab === "function") {
      showTab("levelplanNeuTab", null, { skipHistory: true });
    }
    if (window.TeacherLevelplanNeu) {
      window.TeacherLevelplanNeu.init({
        gradeLevel: gradeLevel || null,
        catalogId: catalogId || null
      });
    }
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
                <td>${escapeHtml(a.catalogName)}</td>
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
          Übersicht: welche Klasse welchen Levelplan für welches Fach nutzt.
          Neue Zuweisungen legst du unter <b>Levelplan neu</b> an.
        </p>

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

        ${state.message ? `<div class="tc-msg tc-msg-ok">${escapeHtml(state.message)}</div>` : ""}
        ${state.error ? `<div class="tc-msg tc-msg-err">${escapeHtml(state.error)}</div>` : ""}

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

    root.querySelectorAll("[data-lpn-open]").forEach((btn) => {
      btn.addEventListener("click", () => {
        openLevelplanNeu(btn.dataset.lpnOpen, btn.dataset.lpnGrade);
      });
    });

    root.querySelectorAll("[data-lpn-remove-class]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const classId = Number(btn.dataset.lpnRemoveClass);
        const subject = btn.dataset.lpnRemoveSubject;
        removeAssignment(classId, subject);
      });
    });
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
