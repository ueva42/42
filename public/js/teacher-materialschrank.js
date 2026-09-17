/**
 * Lehrkraft – Materialschrank (Kacheln mit Material-Links).
 */
(function () {
  const state = {
    tiles: [],
    loading: false,
    saving: false,
    editingId: null,
    message: "",
    error: "",
    draft: null
  };

  function escapeHtml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function editingTile() {
    return state.tiles.find((t) => String(t.id) === String(state.editingId)) || null;
  }

  function render() {
    const root = document.getElementById("materialschrankTabRoot");
    if (!root) return;
    const edit = editingTile();
    const titleVal = state.draft?.title ?? (edit ? edit.title : "");
    const noteVal = state.draft?.note ?? (edit ? edit.note : "");
    const urlVal = state.draft?.url ?? (edit ? edit.url : "");

    const rows = state.tiles
      .map(
        (tile, index) => `
        <li class="ms-admin-item">
          <div class="ms-admin-item__body">
            <strong>${escapeHtml(tile.title)}</strong>
            ${tile.note ? `<span class="hint">${escapeHtml(tile.note)}</span>` : ""}
            <a class="ms-admin-item__url" href="${escapeHtml(tile.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(tile.url)}</a>
          </div>
          <div class="ms-admin-item__btns">
            <button type="button" class="action" data-ms-up="${tile.id}" ${index === 0 ? "disabled" : ""}>↑</button>
            <button type="button" class="action" data-ms-down="${tile.id}" ${index === state.tiles.length - 1 ? "disabled" : ""}>↓</button>
            <button type="button" class="action" data-ms-edit="${tile.id}">Bearbeiten</button>
            <button type="button" class="delete" data-ms-del="${tile.id}">Löschen</button>
          </div>
        </li>`
      )
      .join("");

    root.innerHTML = `
      <div class="panel">
        <h2>Materialschrank</h2>
        <p class="hint">
          Diese Kacheln sehen Schüler:innen unter „Materialschrank“.
          Ein Klick öffnet den Link in einem neuen Fenster.
        </p>
        ${state.error ? `<p class="msg-error">${escapeHtml(state.error)}</p>` : ""}
        ${state.message ? `<p class="msg-ok">${escapeHtml(state.message)}</p>` : ""}
      </div>
      <div class="panel">
        <h3>${edit ? "Kachel bearbeiten" : "Neue Kachel"}</h3>
        <label class="lpi-label" for="msAdminTitle">Titel
          <input id="msAdminTitle" type="text" maxlength="60" placeholder="z. B. GeoGebra" value="${escapeHtml(titleVal)}" />
        </label>
        <label class="lpi-label" for="msAdminNote">Kurztext (optional)
          <input id="msAdminNote" type="text" maxlength="120" placeholder="z. B. Interaktive Übungen" value="${escapeHtml(noteVal)}" />
        </label>
        <label class="lpi-label" for="msAdminUrl">Link
          <input id="msAdminUrl" type="url" placeholder="https://…" value="${escapeHtml(urlVal)}" />
        </label>
        <button type="button" class="action" id="msAdminSave" ${state.saving ? "disabled" : ""}>
          ${state.saving ? "Speichern…" : edit ? "Änderungen speichern" : "Kachel anlegen"}
        </button>
        ${edit ? `<button type="button" class="action" id="msAdminCancel">Abbrechen</button>` : ""}
      </div>
      <div class="panel">
        <h3>Kacheln (${state.tiles.length})</h3>
        ${
          state.loading && !state.tiles.length
            ? `<p class="hint">Laden…</p>`
            : rows
              ? `<ul class="ms-admin-list">${rows}</ul>`
              : `<p class="hint">Noch keine Kacheln. Lege oben die erste an.</p>`
        }
      </div>`;

    bind();
  }

  function formValues() {
    return {
      title: document.getElementById("msAdminTitle")?.value.trim() || "",
      note: document.getElementById("msAdminNote")?.value.trim() || "",
      url: document.getElementById("msAdminUrl")?.value.trim() || ""
    };
  }

  function bind() {
    const root = document.getElementById("materialschrankTabRoot");
    if (!root) return;

    root.querySelector("#msAdminSave")?.addEventListener("click", saveTile);
    root.querySelector("#msAdminCancel")?.addEventListener("click", () => {
      state.editingId = null;
      state.draft = null;
      state.message = "";
      state.error = "";
      render();
    });

    root.querySelectorAll("[data-ms-edit]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.editingId = btn.getAttribute("data-ms-edit");
        state.draft = null;
        state.message = "";
        state.error = "";
        render();
      });
    });
    root.querySelectorAll("[data-ms-del]").forEach((btn) => {
      btn.addEventListener("click", () => deleteTile(btn.getAttribute("data-ms-del")));
    });
    root.querySelectorAll("[data-ms-up]").forEach((btn) => {
      btn.addEventListener("click", () => moveTile(btn.getAttribute("data-ms-up"), -1));
    });
    root.querySelectorAll("[data-ms-down]").forEach((btn) => {
      btn.addEventListener("click", () => moveTile(btn.getAttribute("data-ms-down"), 1));
    });
  }

  async function loadTiles() {
    state.loading = true;
    state.error = "";
    render();
    try {
      const res = await fetch("/api/admin/materialschrank");
      const data = await res.json();
      if (!res.ok || data.success === false) {
        throw new Error(data.message || "Laden fehlgeschlagen.");
      }
      state.tiles = Array.isArray(data.tiles) ? data.tiles : [];
    } catch (err) {
      console.error(err);
      state.error = err.message || "Materialschrank konnte nicht geladen werden.";
    } finally {
      state.loading = false;
      render();
    }
  }

  async function saveTile() {
    const body = formValues();
    state.draft = body;
    state.saving = true;
    state.error = "";
    state.message = "";
    render();
    try {
      const editing = state.editingId;
      const res = await fetch(
        editing ? `/api/admin/materialschrank/${encodeURIComponent(editing)}` : "/api/admin/materialschrank",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        }
      );
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Speichern fehlgeschlagen.");
      }
      state.tiles = Array.isArray(data.tiles) ? data.tiles : state.tiles;
      state.editingId = null;
      state.draft = null;
      state.message = editing ? "Kachel aktualisiert." : "Kachel angelegt.";
    } catch (err) {
      console.error(err);
      state.error = err.message || "Speichern fehlgeschlagen.";
    } finally {
      state.saving = false;
      render();
    }
  }

  async function deleteTile(id) {
    if (!window.confirm("Diese Kachel wirklich löschen?")) return;
    try {
      const res = await fetch(`/api/admin/materialschrank/${encodeURIComponent(id)}`, {
        method: "DELETE"
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Löschen fehlgeschlagen.");
      }
      state.tiles = Array.isArray(data.tiles) ? data.tiles : state.tiles;
      if (String(state.editingId) === String(id)) state.editingId = null;
      state.message = "Kachel gelöscht.";
      state.error = "";
    } catch (err) {
      console.error(err);
      state.error = err.message || "Löschen fehlgeschlagen.";
    }
    render();
  }

  async function moveTile(id, delta) {
    const index = state.tiles.findIndex((t) => String(t.id) === String(id));
    const other = state.tiles[index + delta];
    if (index < 0 || !other) return;
    try {
      const resA = await fetch(`/api/admin/materialschrank/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sortOrder: other.sortOrder })
      });
      const dataA = await resA.json();
      if (!resA.ok || !dataA.success) throw new Error(dataA.message || "Reihenfolge fehlgeschlagen.");
      const resB = await fetch(`/api/admin/materialschrank/${encodeURIComponent(other.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sortOrder: state.tiles[index].sortOrder })
      });
      const dataB = await resB.json();
      if (!resB.ok || !dataB.success) throw new Error(dataB.message || "Reihenfolge fehlgeschlagen.");
      state.tiles = Array.isArray(dataB.tiles) ? dataB.tiles : state.tiles;
      state.message = "";
      state.error = "";
    } catch (err) {
      console.error(err);
      state.error = err.message || "Reihenfolge konnte nicht geändert werden.";
    }
    render();
  }

  function init() {
    state.message = "";
    state.error = "";
    loadTiles();
  }

  window.TeacherMaterialschrank = { init };
})();
