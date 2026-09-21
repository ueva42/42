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
    return `<span class="ms-tile__glyph" aria-hidden="true"><img src="/icons/student/png/materialschrank.png" alt=""></span>`;
  }

  function subjectArt(ui, tile) {
    const src = window.LogbuchVisuals?.subjectIconSrcFromText(`${tile.title || ""} ${tile.note || ""}`);
    if (!src) return "";
    return `<div class="dashboard-card__artwork hub-tile-art" data-fit="cover" aria-hidden="true">
      <img class="dashboard-card__hero" src="${ui.escapeHtml(src)}" alt="" loading="lazy" decoding="async" style="--art-position: center right">
    </div>`;
  }

  function renderTile(ui, tile, index) {
    const accent = ACCENTS[index % ACCENTS.length];
    const art = subjectArt(ui, tile);
    const note = tile.note
      ? `<span class="ms-tile__note">${ui.escapeHtml(tile.note)}</span>`
      : "";
    const tileClass = art
      ? `ms-tile ms-tile--has-art hub-tile hub-tile-sm dashboard-card app-card hub-accent-${accent}`
      : `ms-tile hub-accent-${accent}`;
    return `
      <a class="${tileClass}" href="${ui.escapeHtml(tile.url)}" target="_blank" rel="noopener noreferrer">
        ${art || cabinetIcon()}
        <span class="${art ? "hub-tile-content" : ""}">
          <span class="ms-tile__title hub-tile-title">${ui.escapeHtml(tile.title)}</span>
          ${note}
        </span>
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
