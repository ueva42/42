/**
 * Lehrkraft – Materialschrank (Kacheln mit Material-Links, pro Klasse).
 */
(function () {
  const state = {
    classes: [],
    classId: null,
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

  function sameId(a, b) {
    return String(a) === String(b);
  }

  function selectedClassName() {
    const match = state.classes.find((c) => sameId(c.id, state.classId));
    return match?.name || "";
  }

  function editingTile() {
    return state.tiles.find((t) => String(t.id) === String(state.editingId)) || null;
  }

  function render() {
    const root = document.getElementById("materialschrankTabRoot");
    if (!root) return;

    if (!state.classes.length && !state.loading) {
      root.innerHTML = `
        <div class="panel">
          <h2>Materialschrank</h2>
          <p class="hint">Bitte zuerst eine Klasse anlegen (Menü „Klassen &amp; Schüler“).</p>
          ${state.error ? `<p class="msg-error">${escapeHtml(state.error)}</p>` : ""}
        </div>`;
      return;
    }

    const edit = editingTile();
    const titleVal = state.draft?.title ?? (edit ? edit.title : "");
    const noteVal = state.draft?.note ?? (edit ? edit.note : "");
    const urlVal = state.draft?.url ?? (edit ? edit.url : "");
    const className = selectedClassName();
    const classOptions = state.classes
      .map(
        (c) =>
          `<option value="${c.id}" ${sameId(c.id, state.classId) ? "selected" : ""}>${escapeHtml(c.name)}</option>`
      )
      .join("");

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

    const canEdit = Boolean(state.classId) && !state.loading;

    root.innerHTML = `
      <div class="panel">
        <h2>Materialschrank</h2>
        <p class="hint">
          Jede Klasse hat einen eigenen Schrank. Die gewählte Klasse sieht genau diese Kacheln.
          Ein Klick öffnet den Link in einem neuen Fenster.
        </p>
        <label class="lpi-label" for="msAdminClass">Klasse
          <select id="msAdminClass">${classOptions}</select>
        </label>
        ${state.error ? `<p class="msg-error">${escapeHtml(state.error)}</p>` : ""}
        ${state.message ? `<p class="msg-ok">${escapeHtml(state.message)}</p>` : ""}
      </div>
      <div class="panel">
        <h3>${edit ? "Kachel bearbeiten" : "Neue Kachel"}${className ? ` · ${escapeHtml(className)}` : ""}</h3>
        <label class="lpi-label" for="msAdminTitle">Titel
          <input id="msAdminTitle" type="text" maxlength="60" placeholder="z. B. GeoGebra" value="${escapeHtml(titleVal)}" ${canEdit ? "" : "disabled"} />
        </label>
        <label class="lpi-label" for="msAdminNote">Kurztext (optional)
          <input id="msAdminNote" type="text" maxlength="120" placeholder="z. B. Interaktive Übungen" value="${escapeHtml(noteVal)}" ${canEdit ? "" : "disabled"} />
        </label>
        <label class="lpi-label" for="msAdminUrl">Link
          <input id="msAdminUrl" type="url" placeholder="https://…" value="${escapeHtml(urlVal)}" ${canEdit ? "" : "disabled"} />
        </label>
        <button type="button" class="action" id="msAdminSave" ${canEdit && !state.saving ? "" : "disabled"}>
          ${state.saving ? "Speichern…" : edit ? "Änderungen speichern" : "Kachel anlegen"}
        </button>
        ${edit ? `<button type="button" class="action" id="msAdminCancel">Abbrechen</button>` : ""}
      </div>
      <div class="panel">
        <h3>Kacheln${className ? ` in ${escapeHtml(className)}` : ""} (${state.tiles.length})</h3>
        ${
          state.loading
            ? `<p class="hint">Laden…</p>`
            : rows
              ? `<ul class="ms-admin-list">${rows}</ul>`
              : `<p class="hint">Noch keine Kacheln für diese Klasse. Lege oben die erste an.</p>`
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

    root.querySelector("#msAdminClass")?.addEventListener("change", (e) => {
      state.classId = Number(e.target.value);
      state.editingId = null;
      state.draft = null;
      state.message = "";
      state.error = "";
      loadTiles();
    });

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

  async function loadClasses() {
    const res = await fetch("/api/class");
    const payload = await res.json();
    if (!res.ok || !Array.isArray(payload)) {
      throw new Error(payload?.error || payload?.message || "Klassen konnten nicht geladen werden.");
    }
    state.classes = payload;
    if (!state.classId || !state.classes.some((c) => sameId(c.id, state.classId))) {
      state.classId = state.classes.length ? Number(state.classes[0].id) : null;
    }
  }

  async function loadTiles() {
    if (!state.classId) {
      state.tiles = [];
      state.loading = false;
      render();
      return;
    }
    state.loading = true;
    state.error = "";
    render();
    try {
      const params = new URLSearchParams({ classId: String(state.classId) });
      const res = await fetch(`/api/admin/materialschrank?${params}`);
      const data = await res.json();
      if (!res.ok || data.success === false) {
        throw new Error(data.message || "Laden fehlgeschlagen.");
      }
      state.tiles = Array.isArray(data.tiles) ? data.tiles : [];
    } catch (err) {
      console.error(err);
      state.error = err.message || "Materialschrank konnte nicht geladen werden.";
      state.tiles = [];
    } finally {
      state.loading = false;
      render();
    }
  }

  async function saveTile() {
    if (!state.classId) return;
    const body = { ...formValues(), classId: state.classId };
    state.draft = formValues();
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

  async function init() {
    state.message = "";
    state.error = "";
    const root = document.getElementById("materialschrankTabRoot");
    if (root && !state.classes.length) {
      root.innerHTML = `<div class="panel"><p class="hint">Lade Materialschrank…</p></div>`;
    }
    try {
      await loadClasses();
      await loadTiles();
    } catch (err) {
      console.error(err);
      state.loading = false;
      state.error = err.message || "Materialschrank konnte nicht geladen werden.";
      render();
    }
  }

  window.TeacherMaterialschrank = { init };
})();
