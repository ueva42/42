/**
 * Lehrkraft – Levelplan per Copy & Paste importieren.
 */
(function () {
  const state = {
    classId: null,
    classes: [],
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

    if (state.loading && !state.classes.length) {
      root.innerHTML = `<div class="tc-loading">Lade Import…</div>`;
      return;
    }

    root.innerHTML = `
      <div class="panel lpi-panel">
        <h2>Levelplan importieren</h2>
        <p class="hint">
          Füge hier deinen Levelplan per Copy &amp; Paste ein. Pro Eintrag brauchst du
          <strong>Fach</strong>, <strong>Thema</strong>, <strong>Unterthema</strong> und die drei Level
          (<strong>Rookie</strong>, <strong>Operator</strong>, <strong>Street Legend</strong>).
          Doppelpunkt ist optional; Leveltexte dürfen auch in der nächsten Zeile stehen.
        </p>

        <div class="lpi-toolbar">
          <label>Klasse:
            <select id="lpiClassSelect">
              ${state.classes
                .map(
                  (c) =>
                    `<option value="${escapeHtml(c.id)}" ${sameId(c.id, state.classId) ? "selected" : ""}>${escapeHtml(c.name)}</option>`
                )
                .join("")}
            </select>
          </label>
        </div>

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
    root.querySelector("#lpiClassSelect")?.addEventListener("change", (e) => {
      state.classId = Number(e.target.value);
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

  async function loadClasses() {
    const r = await fetch("/api/class");
    const payload = await r.json();
    if (!r.ok || !Array.isArray(payload)) {
      throw new Error(payload?.error || "Klassen konnten nicht geladen werden.");
    }
    state.classes = payload;
    if (!state.classId || !payload.some((c) => sameId(c.id, state.classId))) {
      state.classId = Number(payload[0]?.id) || null;
    }
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
    if (!state.classId || !rows.length) {
      state.error = "Keine gültigen Einträge zum Importieren.";
      render();
      return;
    }

    if (!confirm(`${rows.length} Einträge für diese Klasse importieren?`)) return;

    state.saving = true;
    state.error = "";
    state.message = "";
    render();

    try {
      const res = await fetch("/api/teacher/levelplan-import/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          classId: state.classId,
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
      await loadClasses();
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
