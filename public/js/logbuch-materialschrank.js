/**
 * SRL-Logbuch – Materialschrank (Kacheln zu externen Materialien).
 */
(function () {
  const UI = () => window.LogbuchUI;
  const ACCENTS = ["cyan", "orange", "purple", "green", "pink", "teal"];

  const state = {
    tiles: [],
    loading: false,
    error: ""
  };

  let initPromise = null;
  let initGeneration = 0;

  function cabinetIcon() {
    return `<span class="ms-tile__glyph" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm0 6h14M5 15h14M16 7.5h.01M16 12h.01M16 18h.01"/></svg></span>`;
  }

  function renderTile(ui, tile, index) {
    const accent = ACCENTS[index % ACCENTS.length];
    const note = tile.note
      ? `<span class="ms-tile__note">${ui.escapeHtml(tile.note)}</span>`
      : "";
    return `
      <a class="ms-tile hub-accent-${accent}" href="${ui.escapeHtml(tile.url)}" target="_blank" rel="noopener noreferrer">
        ${cabinetIcon()}
        <span class="ms-tile__title">${ui.escapeHtml(tile.title)}</span>
        ${note}
        <span class="ms-tile__cta">Öffnen <span aria-hidden="true">→</span></span>
      </a>`;
  }

  function render() {
    const root = document.getElementById("materialschrank-screen-root");
    if (!root) return;
    const ui = UI();
    if (!ui) return;

    if (state.loading && !state.tiles.length) {
      root.innerHTML = `<p class="ms-empty">Lade Materialschrank…</p>`;
      return;
    }

    if (state.error) {
      root.innerHTML = `<p class="ms-empty">${ui.escapeHtml(state.error)}</p>`;
      return;
    }

    if (!state.tiles.length) {
      root.innerHTML = `<p class="ms-empty">Für deine Klasse sind noch keine Materialien hinterlegt. Deine Lehrkraft legt die Kacheln im Admin-Bereich an.</p>`;
      return;
    }

    root.innerHTML = `<div class="ms-grid">${state.tiles.map((tile, i) => renderTile(ui, tile, i)).join("")}</div>`;
  }

  async function loadData(generation) {
    state.loading = true;
    state.error = "";
    render();
    try {
      const res = await fetch("/api/student/materialschrank");
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      if (generation !== initGeneration) return;
      state.tiles = Array.isArray(data.tiles) ? data.tiles : [];
      state.loading = false;
      render();
    } catch (err) {
      console.error(err);
      if (generation !== initGeneration) return;
      state.loading = false;
      state.error = "Materialschrank konnte nicht geladen werden.";
      render();
    }
  }

  function init() {
    if (initPromise) return initPromise;
    const generation = ++initGeneration;
    initPromise = loadData(generation).finally(() => {
      initPromise = null;
    });
    return initPromise;
  }

  window.LogbuchMaterialschrank = { init };
})();
