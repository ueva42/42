/**
 * Lehrkraft – Levelplan per Copy & Paste importieren (Klassenstufe / Katalog).
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

  const GRADE_LEVELS = ["5", "6", "7", "8", "9", "10"];

  const state = {
    gradeLevel: "10",
    catalogId: null,
    catalogName: "",
    catalogs: [],
    subject: null,
    subjects: FALLBACK_SUBJECTS,
    text: "",
    previewRows: [],
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

  function hasPreview() {
    return state.previewRows.length > 0;
  }

  function okRows() {
    return state.previewRows.filter((r) => r.status === "OK");
  }

  function catalogsForGrade() {
    return (state.catalogs || []).filter((c) => String(c.gradeLevel) === String(state.gradeLevel));
  }

  function renderPreviewTable() {
    if (!hasPreview()) return "";

    const rows = state.previewRows
      .map(
        (row) => `
      <tr>
        <td>${escapeHtml(row.fach || "–")}</td>
        <td>${escapeHtml(row.thema || "–")}</td>
        <td>${escapeHtml(row.unterthema || "–")}</td>
        <td>${escapeHtml(row.rookieZiel || "–")}</td>
        <td>${escapeHtml(row.operatorZiel || "–")}</td>
        <td>${escapeHtml(row.streetLegendZiel || "–")}</td>
        <td class="${row.status === "OK" ? "lpi-status-ok" : "lpi-status-warn"}">${escapeHtml(row.status)}</td>
      </tr>`
      )
      .join("");

    return `
      <div class="lpi-preview-wrap">
        <h3>Vorschau</h3>
        <p class="hint">${okRows().length} von ${state.previewRows.length} Einträgen sind importierbar (Status OK).</p>
        <div class="lpi-table-scroll">
          <table class="lpi-table">
            <thead>
              <tr>
                <th>Fach</th>
                <th>Thema</th>
                <th>Unterthema</th>
                <th>Rookie</th>
                <th>Operator</th>
                <th>Street Legend</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>`;
  }

  function render() {
    const root = document.getElementById("levelplanImportTabRoot");
    if (!root) return;

    const gradeOptions = GRADE_LEVELS.map(
      (g) =>
        `<option value="${escapeHtml(g)}" ${String(g) === String(state.gradeLevel) ? "selected" : ""}>Klasse ${escapeHtml(g)}</option>`
    ).join("");

    const catalogOptions = catalogsForGrade()
      .map(
        (c) =>
          `<option value="${escapeHtml(c.id)}" ${sameId(c.id, state.catalogId) ? "selected" : ""}>${escapeHtml(c.name)}</option>`
      )
      .join("");

    root.innerHTML = `
      <div class="panel lpi-panel">
        <h2>Levelplan importieren</h2>
        <p class="hint">
          Der Import gehört zu einer <strong>Klassenstufe</strong> (z.&nbsp;B. 9 oder 10) – noch keiner einzelnen Klasse.
          Klassen weist du den Plan später unter <strong>Levelplan neu</strong> zu.
        </p>

        <div class="lpi-toolbar">
          <label>Klassenstufe:
            <select id="lpiGradeSelect">${gradeOptions}</select>
          </label>
          <label>Levelplan:
            <select id="lpiCatalogSelect">
              <option value="">— Neuer Levelplan —</option>
              ${catalogOptions}
            </select>
          </label>
          <label>Fach:
            <select id="lpiSubjectSelect">
              ${state.subjects
                .map(
                  (s) =>
                    `<option value="${escapeHtml(s)}" ${s === state.subject ? "selected" : ""}>${escapeHtml(s)}</option>`
                )
                .join("")}
            </select>
          </label>
        </div>

        <label class="lpi-label" for="lpiCatalogName" style="${state.catalogId ? "display:none" : ""}">
          Name für neuen Levelplan
          <input id="lpiCatalogName" type="text" placeholder="z. B. Mathe Klasse 10" value="${escapeHtml(state.catalogName)}">
        </label>

        ${state.message ? `<div class="tc-msg tc-msg-ok">${escapeHtml(state.message)}</div>` : ""}
        ${state.error ? `<div class="tc-msg tc-msg-err">${escapeHtml(state.error)}</div>` : ""}

        <label class="lpi-label" for="lpiTextInput">Levelplan-Text</label>
        <textarea id="lpiTextInput" class="lpi-textarea" rows="16" placeholder="Fach Mathe
Thema Wahrscheinlichkeit

Richtig zählen
Rookie
Ich schreibe alle Möglichkeiten geordnet auf und zähle sie richtig ab.
Operator
Ich bestimme die Anzahl der Möglichkeiten mit Tabelle oder Baumdiagramm.
Street Legend
Ich löse Zählaufgaben sicher und begründe meinen Weg.">${escapeHtml(state.text)}</textarea>

        <div class="lpi-actions">
          <button type="button" class="action" id="lpiPreviewBtn" ${state.loading ? "disabled" : ""}>
            ${state.loading ? "Erstelle Vorschau…" : "Vorschau erstellen"}
          </button>
          ${
            hasPreview()
              ? `<button type="button" class="action" id="lpiConfirmBtn" ${state.saving || !okRows().length ? "disabled" : ""}>
                  ${state.saving ? "Importiere…" : "Import bestätigen"}
                </button>`
              : ""
          }
        </div>

        ${renderPreviewTable()}
      </div>`;

    bindHandlers(root);
  }

  function bindHandlers(root) {
    root.querySelector("#lpiGradeSelect")?.addEventListener("change", async (e) => {
      state.gradeLevel = e.target.value;
      state.catalogId = null;
      state.message = "";
      state.error = "";
      await loadCatalogs();
      render();
    });

    root.querySelector("#lpiCatalogSelect")?.addEventListener("change", (e) => {
      state.catalogId = e.target.value || null;
      state.message = "";
      state.error = "";
      render();
    });

    root.querySelector("#lpiCatalogName")?.addEventListener("input", (e) => {
      state.catalogName = e.target.value;
    });

    root.querySelector("#lpiSubjectSelect")?.addEventListener("change", (e) => {
      state.subject = e.target.value;
      state.message = "";
      state.error = "";
      render();
    });

    root.querySelector("#lpiTextInput")?.addEventListener("input", (e) => {
      state.text = e.target.value;
    });

    root.querySelector("#lpiPreviewBtn")?.addEventListener("click", createPreview);
    root.querySelector("#lpiConfirmBtn")?.addEventListener("click", confirmImport);
  }

  async function loadSubjects() {
    try {
      const res = await fetch("/api/teacher/subject-lesson-goals");
      const data = await res.json();
      if (res.ok && Array.isArray(data.subjects) && data.subjects.length) {
        state.subjects = data.subjects;
      }
    } catch (err) {
      console.warn("Fächerliste Fallback", err);
    }
    if (!state.subject || !state.subjects.includes(state.subject)) {
      state.subject = state.subjects[0] || null;
    }
  }

  async function loadCatalogs() {
    const res = await fetch(
      `/api/teacher/level-plan-catalogs?gradeLevel=${encodeURIComponent(state.gradeLevel)}`
    );
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Levelpläne konnten nicht geladen werden.");
    state.catalogs = data.catalogs || [];
  }

  async function createPreview() {
    const text = state.text.trim();
    if (!text) {
      state.error = "Bitte zuerst Levelplan-Text einfügen.";
      render();
      return;
    }

    state.loading = true;
    state.error = "";
    state.message = "";
    render();

    try {
      const res = await fetch("/api/teacher/levelplan-import/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text })
      });
      const data = await res.json();
      state.loading = false;

      if (!data.success) {
        state.error = data.message || "Vorschau fehlgeschlagen.";
        render();
        return;
      }

      state.previewRows = Array.isArray(data.rows) ? data.rows : [];
      if (state.subject) {
        state.previewRows = state.previewRows.map((row) => {
          const missing = (row.missing || []).filter((m) => m !== "fach");
          if (!row.thema) missing.push("thema");
          if (!row.unterthema) missing.push("unterthema");
          if (!row.rookieZiel) missing.push("rookie");
          if (!row.operatorZiel) missing.push("operator");
          if (!row.streetLegendZiel) missing.push("streetLegend");
          const uniqueMissing = [...new Set(missing)];
          return {
            ...row,
            fach: state.subject,
            missing: uniqueMissing,
            status: uniqueMissing.length ? "Unvollständig" : "OK"
          };
        });
      }
      state.message = `Vorschau erstellt: ${data.summary?.ok || 0} OK, ${data.summary?.incomplete || 0} unvollständig.`;
      render();
    } catch (err) {
      console.error(err);
      state.loading = false;
      state.error = "Netzwerkfehler bei der Vorschau.";
      render();
    }
  }

  async function confirmImport() {
    const rows = okRows();
    if (!rows.length) {
      state.error = "Keine gültigen Einträge zum Importieren.";
      render();
      return;
    }

    if (!state.catalogId && !state.catalogName.trim()) {
      state.catalogName = `${state.subject || "Levelplan"} Klasse ${state.gradeLevel}`;
    }

    if (!confirm(`${rows.length} Einträge in Levelplan (Klassenstufe ${state.gradeLevel}) importieren?`)) {
      return;
    }

    state.saving = true;
    state.error = "";
    state.message = "";
    render();

    try {
      const res = await fetch("/api/teacher/levelplan-import/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gradeLevel: state.gradeLevel,
          catalogId: state.catalogId || null,
          catalogName: state.catalogName.trim(),
          rows
        })
      });
      const data = await res.json();
      state.saving = false;

      if (!data.success) {
        state.error = data.message || "Import fehlgeschlagen.";
        render();
        return;
      }

      if (data.catalogId) state.catalogId = data.catalogId;
      await loadCatalogs();
      state.message = data.message || "Import erfolgreich.";
      state.previewRows = [];
      render();
    } catch (err) {
      console.error(err);
      state.saving = false;
      state.error = "Netzwerkfehler beim Import.";
      render();
    }
  }

  async function init() {
    state.message = "";
    state.error = "";
    state.previewRows = [];
    render();

    try {
      await loadSubjects();
      await loadCatalogs();
      render();
    } catch (err) {
      console.error(err);
      const root = document.getElementById("levelplanImportTabRoot");
      if (root) {
        root.innerHTML = `<div class="tc-error">${escapeHtml(err.message || "Import konnte nicht geladen werden.")}</div>`;
      }
    }
  }

  window.TeacherLevelplanImport = { init };
})();
