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

  function applySubjectToPreviewRows(rows) {
    const list = Array.isArray(rows) ? rows : [];
    return list.map((row) => {
      const fach = state.subject || row.fach || "";
      let thema = String(row.thema || "").trim();
      let unterthema = String(row.unterthema || "").trim();
      if (!thema && unterthema && unterthema !== "Unbenannt") thema = unterthema;
      if (!unterthema && thema) unterthema = thema;
      const missing = [];
      if (!fach) missing.push("fach");
      if (!thema) missing.push("thema");
      if (!unterthema) missing.push("unterthema");
      if (!row.rookieZiel) missing.push("rookie");
      if (!row.operatorZiel) missing.push("operator");
      if (!row.streetLegendZiel) missing.push("streetLegend");
      return {
        ...row,
        fach,
        thema,
        unterthema,
        missing,
        status: missing.length ? "Unvollständig" : "OK"
      };
    });
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
          `<option value="${escapeHtml(c.id)}" ${sameId(c.id, state.catalogId) ? "selected" : ""}>${escapeHtml(c.displayName || c.name)}</option>`
      )
      .join("");

    root.innerHTML = `
      <div class="panel lpi-panel">
        <h2>Levelplan importieren</h2>
        <p class="hint">
          Der Import gehört zu einer <strong>Klassenstufe</strong> (z.&nbsp;B. 9 oder 10) – noch keiner einzelnen Klasse.
          Eine Überschrift vor Rookie/Operator/Street Legend reicht als Thema.
          Für jeden neuen Plan „<strong>— Neuer Levelplan —</strong>“ wählen (sonst werden Themen an den vorhandenen Plan angehängt).
          Klassen weist du den Plan unter <strong>Levelplan</strong> zu.
        </p>

        <div class="lpi-toolbar">
          <label>Klassenstufe:
            <select id="lpiGradeSelect" ${state.saving ? "disabled" : ""}>${gradeOptions}</select>
          </label>
          <label>Levelplan:
            <select id="lpiCatalogSelect" ${state.saving ? "disabled" : ""}>
              <option value="">— Neuer Levelplan —</option>
              ${catalogOptions}
            </select>
          </label>
          <label>Fach:
            <select id="lpiSubjectSelect" ${state.saving ? "disabled" : ""}>
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
          <input id="lpiCatalogName" type="text" placeholder="z. B. Potenzen und Wurzeln" value="${escapeHtml(state.catalogName)}" ${state.saving ? "disabled" : ""}>
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
Ich löse Zählaufgaben sicher und begründe meinen Weg." ${state.saving ? "disabled" : ""}>${escapeHtml(state.text)}</textarea>

        <div class="lpi-actions">
          <button type="button" class="action" id="lpiPreviewBtn" ${state.loading || state.saving ? "disabled" : ""}>
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
      if (state.saving) return;
      state.gradeLevel = e.target.value;
      state.catalogId = null;
      state.message = "";
      state.error = "";
      await loadCatalogs();
      render();
    });

    root.querySelector("#lpiCatalogSelect")?.addEventListener("change", (e) => {
      if (state.saving) return;
      state.catalogId = e.target.value || null;
      state.message = "";
      state.error = "";
      render();
    });

    root.querySelector("#lpiCatalogName")?.addEventListener("input", (e) => {
      state.catalogName = e.target.value;
    });

    root.querySelector("#lpiSubjectSelect")?.addEventListener("change", (e) => {
      if (state.saving) return;
      state.subject = e.target.value;
      state.message = "";
      state.error = "";
      if (hasPreview()) {
        state.previewRows = applySubjectToPreviewRows(state.previewRows);
      }
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
        body: JSON.stringify({ text, subject: state.subject || null })
      });
      const data = await res.json();
      state.loading = false;

      if (!data.success) {
        state.error = data.message || "Vorschau fehlgeschlagen.";
        render();
        return;
      }

      state.previewRows = applySubjectToPreviewRows(Array.isArray(data.rows) ? data.rows : []);
      const ok = okRows().length;
      const incomplete = state.previewRows.length - ok;
      state.message = `Vorschau erstellt: ${ok} OK, ${incomplete} unvollständig.`;
      render();
    } catch (err) {
      console.error(err);
      state.loading = false;
      state.error = "Netzwerkfehler bei der Vorschau.";
      render();
    }
  }

  async function confirmImport() {
    if (state.saving) return;

    const rows = okRows();
    if (!rows.length) {
      state.error = "Keine gültigen Einträge zum Importieren.";
      render();
      return;
    }

    const text = state.text.trim();
    if (!text) {
      state.error = "Levelplan-Text fehlt – bitte erneut Vorschau erstellen.";
      render();
      return;
    }

    if (!state.catalogId && !state.catalogName.trim()) {
      const themes = [
        ...new Set(
          rows
            .filter((r) => r.thema)
            .map((r) => String(r.thema).trim())
            .filter(Boolean)
        )
      ];
      if (themes.length === 1) state.catalogName = themes[0];
      else if (themes.length > 1 && themes.length <= 4) state.catalogName = themes.join(" · ");
      else state.catalogName = `${state.subject || "Levelplan"} Klasse ${state.gradeLevel}`;
    }

    if (!confirm(`${rows.length} Einträge in Levelplan (Klassenstufe ${state.gradeLevel}) importieren?`)) {
      return;
    }

    if (state.catalogId) {
      const existing = catalogsForGrade().find((c) => sameId(c.id, state.catalogId));
      const label = existing?.displayName || existing?.name || "diesen Levelplan";
      if (
        !confirm(
          `Die Einträge werden an „${label}“ angehängt.\n\nFür einen eigenen Plan bitte „— Neuer Levelplan —“ wählen.\nTrotzdem anhängen?`
        )
      ) {
        return;
      }
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
          subject: state.subject || null,
          text
        })
      });
      const data = await res.json().catch(() => ({}));
      state.saving = false;

      if (!res.ok || !data.success) {
        state.error =
          data.message ||
          (res.status === 413
            ? "Der Levelplan ist zu groß. Bitte in kleinere Teile aufteilen."
            : "Import fehlgeschlagen.");
        if (Array.isArray(data.rows) && data.rows.length) {
          state.previewRows = applySubjectToPreviewRows(data.rows);
        }
        render();
        return;
      }

      // Nächster Import startet wieder als neuer Plan (nicht an denselben anhängen).
      state.catalogId = null;
      state.catalogName = "";
      await loadCatalogs();
      state.message =
        (data.message || "Import erfolgreich.") +
        " Unter „Levelplan“ kannst du ihn einer Klasse zuweisen. Für den nächsten Import ist wieder „Neuer Levelplan“ vorausgewählt.";
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
    // Laufenden Import nicht durch Tab-Reinit abbrechen / leeren
    if (state.saving || state.loading) {
      render();
      return;
    }

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
