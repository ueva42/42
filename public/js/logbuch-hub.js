/**
 * Schüler-Hub – Kontrollzentrum mit Kacheln.
 */
(function () {
  const UI = () => window.LogbuchUI;

  const MAIN_TILES = [
    {
      section: "today",
      title: "Mein Tag",
      text: "Deine Aufgaben für heute. Fokus. Fortschritt. Erfolg.",
      cta: "Heute starten",
      accent: "hub-accent-orange",
      icon: "☀"
    },
    {
      section: "week",
      title: "Meine Woche",
      text: "Dein Wochenplan im Überblick.",
      cta: "Woche ansehen",
      accent: "hub-accent-blue",
      icon: "📅"
    },
    {
      section: "zielsetzung",
      title: "Zielsetzung",
      text: "Setze klare Ziele und verfolge deinen Fortschritt.",
      cta: "Ziele ansehen",
      accent: "hub-accent-blue",
      icon: "🎯"
    },
    {
      section: "levelplan",
      title: "Mein Lernstand",
      text: "Sieh, woran du arbeitest und was du schon sicher kannst.",
      cta: "Lernstand öffnen",
      accent: "hub-accent-green",
      icon: "📊"
    },
    {
      section: "taktik-deck",
      title: "Taktik-Deck",
      text: "Strategien, die dir helfen, wenn du festhängst.",
      cta: "Deck öffnen",
      accent: "hub-accent-purple hub-tile-featured",
      icon: "⚡"
    },
    {
      section: "checkpoint-plan",
      title: "Meine Checks",
      text: "Tests, Klassenarbeiten und wichtige Termine im Blick.",
      cta: "Plan öffnen",
      accent: "hub-accent-blue",
      icon: "✓"
    }
  ];

  const SECONDARY_TILES = [
    {
      section: "missionen",
      title: "Missionen",
      text: "Nimm Herausforderungen an und sammle XP.",
      accent: "hub-accent-muted",
      icon: "M"
    },
    {
      section: "belohnungen",
      title: "Belohnungen",
      text: "Schalte Extras frei und feiere Erfolge.",
      accent: "hub-accent-muted",
      icon: "B"
    },
    {
      section: "charakter",
      title: "Charakter",
      text: "Passe deinen Charakter an.",
      accent: "hub-accent-muted",
      icon: "C"
    },
    {
      section: "xp",
      title: "XP-Historie",
      text: "Sieh deine Entwicklung und XP.",
      accent: "hub-accent-muted",
      icon: "XP"
    }
  ];

  function navigate(section) {
    window.StudentRouter?.navigateToSection(section);
  }

  function renderTile(ui, tile, size) {
    const cls = size === "main" ? "hub-tile hub-tile-main" : "hub-tile hub-tile-secondary";
    return `
      <button type="button" class="${cls} ${tile.accent || ""}" data-hub-section="${ui.escapeHtml(tile.section)}">
        <span class="hub-tile-icon" aria-hidden="true">${tile.icon || "•"}</span>
        <span class="hub-tile-body">
          <span class="hub-tile-title">${ui.escapeHtml(tile.title)}</span>
          <span class="hub-tile-text">${ui.escapeHtml(tile.text)}</span>
          ${tile.cta ? `<span class="hub-tile-cta">${ui.escapeHtml(tile.cta)} →</span>` : ""}
        </span>
      </button>`;
  }

  function render() {
    const root = document.getElementById("hub-screen-root");
    if (!root) return;
    const ui = UI();

    const profile = window.__studentProfile || {};

    root.innerHTML = `
      <div class="hub-page">
        <header class="hub-hero">
          <div class="hub-hero-copy">
            <p class="hub-hero-kicker">Start-Bereich</p>
            <h2 class="hub-hero-title">Dein Kontrollzentrum</h2>
            <p class="hub-hero-sub">Plane dein Lernen, nutze Taktiken und sammle XP.</p>
          </div>
          <div class="hub-hero-stats">
            <div class="hub-stat">
              <span class="hub-stat-label">XP</span>
              <span class="hub-stat-value" id="hubHeroXp">${ui.escapeHtml(String(profile.xp ?? "–"))}</span>
            </div>
            <div class="hub-stat">
              <span class="hub-stat-label">Level</span>
              <span class="hub-stat-value" id="hubHeroLevel">${ui.escapeHtml(profile.levelName || "–")}</span>
            </div>
            <div class="hub-stat hub-stat-wide">
              <span class="hub-stat-label">Nächstes Level</span>
              <span class="hub-stat-value hub-stat-small" id="hubHeroNext">${ui.escapeHtml(profile.nextLevelLabel || "–")}</span>
            </div>
          </div>
        </header>

        <section class="hub-section">
          <h3 class="hub-section-title">Hauptbereiche</h3>
          <div class="hub-grid hub-grid-main">
            ${MAIN_TILES.map((t) => renderTile(ui, t, "main")).join("")}
          </div>
        </section>

        <section class="hub-section hub-section-secondary" id="hubSecondary">
          <h3 class="hub-section-title">Weitere Bereiche</h3>
          <div class="hub-grid hub-grid-secondary">
            ${SECONDARY_TILES.map((t) => renderTile(ui, t, "secondary")).join("")}
          </div>
        </section>
      </div>`;

    root.querySelectorAll("[data-hub-section]").forEach((btn) => {
      btn.addEventListener("click", () => navigate(btn.dataset.hubSection));
    });
  }

  function refreshStats() {
    const p = window.__studentProfile;
    if (!p) return;
    const ui = UI();
    const set = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };
    set("hubHeroXp", String(p.xp ?? "–"));
    set("hubHeroLevel", p.levelName || "–");
    set("hubHeroNext", p.nextLevelLabel || "–");
    set("topbarXp", String(p.xp ?? "–"));
    set("topbarLevel", p.levelName || "–");
    const nameEl = document.getElementById("topbarName");
    if (nameEl) nameEl.textContent = p.name || "";
  }

  function init() {
    render();
    refreshStats();
  }

  window.LogbuchHub = { init, refreshStats, scrollToSecondary: () => {
    document.getElementById("hubSecondary")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }};
})();
