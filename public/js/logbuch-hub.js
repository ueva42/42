/**
 * Schüler-Hub – Kontrollzentrum (Game-Hub Layout).
 */
(function () {
  const UI = () => window.LogbuchUI;

  const MAIN_TILES = [
    {
      section: "today",
      title: "Mein Tag",
      text: "Deine heutigen Aufgaben auf einen Blick.",
      cta: "Heute starten",
      tone: "purple",
      icon: "☀"
    },
    {
      section: "week",
      title: "Meine Woche",
      text: "Dein Lernplan für diese Woche.",
      cta: "Woche planen",
      tone: "blue",
      icon: "📅"
    },
    {
      section: "zielsetzung",
      title: "Zielsetzung",
      text: "Setze Ziele und verfolge deinen Fortschritt.",
      cta: "Ziele ansehen",
      tone: "green",
      icon: "🎯"
    },
    {
      section: "levelplan",
      title: "Mein Lernstand",
      text: "Sieh deine Entwicklung und nächste Schritte.",
      cta: "Lernstand öffnen",
      tone: "orange",
      icon: "📊"
    },
    {
      section: "taktik-deck",
      title: "Taktik-Deck",
      text: "Deine Strategien für jede Lernherausforderung.",
      cta: "Taktik-Deck öffnen",
      tone: "pink",
      featured: true,
      icon: "⚡"
    },
    {
      section: "checkpoint-plan",
      title: "Meine Checks",
      text: "Plane deine Etappen und Meilensteine.",
      cta: "Plan öffnen",
      tone: "cyan",
      icon: "🚩"
    }
  ];

  const SECONDARY_TILES = [
    {
      section: "missionen",
      title: "Missionen",
      text: "Nimm Missionen an und sammle XP.",
      tone: "purple",
      icon: "◎"
    },
    {
      section: "belohnungen",
      title: "Belohnungen",
      text: "Schalte Belohnungen frei und feiere Erfolge.",
      tone: "gold",
      icon: "🏆"
    },
    {
      section: "charakter",
      title: "Charakter",
      text: "Passe deinen Charakter an und zeig deinen Style.",
      tone: "blue",
      icon: "👤"
    },
    {
      section: "xp",
      title: "XP-Historie",
      text: "Verfolge deine XP und Lernstatistiken.",
      tone: "pink",
      icon: "XP"
    }
  ];

  const state = { todayFocus: null };

  function navigate(section) {
    window.StudentRouter?.navigateToSection(section);
  }

  function renderMainTile(ui, tile) {
    return `
      <button type="button" class="hub-card hub-card-main hub-tone-${tile.tone} ${tile.featured ? "hub-card-featured" : ""}"
        data-hub-section="${ui.escapeHtml(tile.section)}">
        ${tile.featured ? `<span class="hub-card-badge">Empfohlen</span>` : ""}
        <span class="hub-card-icon" aria-hidden="true">${tile.icon}</span>
        <span class="hub-card-title">${ui.escapeHtml(tile.title)}</span>
        <span class="hub-card-text">${ui.escapeHtml(tile.text)}</span>
        <span class="hub-card-btn">${ui.escapeHtml(tile.cta)} →</span>
      </button>`;
  }

  function renderSecondaryTile(ui, tile) {
    return `
      <button type="button" class="hub-card hub-card-mini hub-tone-${tile.tone}"
        data-hub-section="${ui.escapeHtml(tile.section)}">
        <span class="hub-card-mini-icon">${tile.icon}</span>
        <span class="hub-card-mini-body">
          <span class="hub-card-mini-title">${ui.escapeHtml(tile.title)}</span>
          <span class="hub-card-mini-text">${ui.escapeHtml(tile.text)}</span>
        </span>
        <span class="hub-card-mini-chevron">›</span>
      </button>`;
  }

  function focusRingSvg(done, total) {
    const pct = total > 0 ? done / total : 0;
    const r = 36;
    const c = 2 * Math.PI * r;
    const offset = c * (1 - pct);
    return `
      <svg class="hub-focus-ring" viewBox="0 0 88 88" aria-hidden="true">
        <circle cx="44" cy="44" r="${r}" class="hub-focus-ring-bg"/>
        <circle cx="44" cy="44" r="${r}" class="hub-focus-ring-fill"
          stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${offset.toFixed(2)}"/>
      </svg>`;
  }

  function render() {
    const root = document.getElementById("hub-screen-root");
    if (!root) return;
    const ui = UI();
    const p = window.__studentProfile || {};
    const focus = state.todayFocus || { done: 0, total: 0 };
    const focusPct = focus.total > 0 ? Math.round((focus.done / focus.total) * 100) : 0;
    const xpPct = p.xpPct ?? 0;

    root.innerHTML = `
      <div class="hub-page">
        <header class="hub-page-header">
          <div class="hub-page-brand">
            <h1 class="hub-page-title">Streets of Logic – XP Edition</h1>
            <p class="hub-page-tagline">Strategien lernen. Logik beherrschen. XP verdienen.</p>
          </div>
          <div class="hub-level-card">
            <div class="hub-level-card-icon">XP</div>
            <div class="hub-level-card-body">
              <span class="hub-level-card-label" id="hubHeaderLevel">${ui.escapeHtml(p.levelName || "Level –")}</span>
              <div class="hub-level-card-bar">
                <div class="hub-level-card-bar-fill" id="hubHeaderXpBar" style="width:${xpPct}%"></div>
              </div>
              <span class="hub-level-card-meta" id="hubHeaderXpMeta">${ui.escapeHtml(p.xpProgressLabel || "–")}</span>
            </div>
          </div>
        </header>

        <section class="hub-intro">
          <div>
            <p class="hub-intro-kicker">Student Hub</p>
            <h2 class="hub-intro-title">Dein Kontrollzentrum</h2>
            <p class="hub-intro-sub">Plane dein Lernen, nutze Taktiken und sammle XP.</p>
          </div>
          <button type="button" class="hub-intro-briefing" id="hubBriefingBtn">
            Start-Briefing ansehen →
          </button>
        </section>

        <section class="hub-section">
          <div class="hub-grid-main">
            ${MAIN_TILES.map((t) => renderMainTile(ui, t)).join("")}
          </div>
        </section>

        <section class="hub-focus-row">
          <div class="hub-focus-card">
            <div class="hub-focus-ring-wrap">
              ${focusRingSvg(focus.done, focus.total)}
              <span class="hub-focus-ring-label" id="hubFocusLabel">${focus.done}/${focus.total || 0}</span>
            </div>
            <div class="hub-focus-copy">
              <h3 class="hub-focus-title">Täglicher Fokus</h3>
              <p class="hub-focus-text" id="hubFocusText">
                ${focus.total > 0
                  ? `${focus.done} von ${focus.total} Stunden mit Tagesabschluss.`
                  : "Setze heute dein erstes Tagesziel."}
              </p>
              <div class="hub-focus-bar">
                <div class="hub-focus-bar-fill" id="hubFocusBar" style="width:${focusPct}%"></div>
              </div>
              <button type="button" class="hub-focus-btn" data-hub-section="today">Weiter machen →</button>
            </div>
          </div>

          <div class="hub-xp-card">
            <div class="hub-xp-card-head">
              <div>
                <h3 class="hub-xp-card-title">XP-Fortschritt</h3>
                <p class="hub-xp-card-meta" id="hubXpMeta">${ui.escapeHtml(p.xpProgressLabel || "–")}</p>
                <p class="hub-xp-card-next" id="hubHeroNext">${ui.escapeHtml(p.nextLevelLabel || "–")}</p>
              </div>
              <div class="hub-xp-emblem">XP</div>
            </div>
            <div class="hub-xp-bar">
              <div class="hub-xp-bar-fill" id="hubXpBar" style="width:${xpPct}%"></div>
            </div>
          </div>
        </section>

        <section class="hub-section hub-section-secondary" id="hubSecondary">
          <h3 class="hub-section-title">Weitere Bereiche</h3>
          <div class="hub-grid-secondary">
            ${SECONDARY_TILES.map((t) => renderSecondaryTile(ui, t)).join("")}
          </div>
        </section>

        <footer class="hub-footer">
          <p>Logik bringt dich vom Punkt A zum Punkt B. Strategie entscheidet, welchen Weg du nimmst.</p>
        </footer>
      </div>`;

    root.querySelectorAll("[data-hub-section]").forEach((btn) => {
      btn.addEventListener("click", () => navigate(btn.dataset.hubSection));
    });
    root.querySelector("#hubBriefingBtn")?.addEventListener("click", () => {
      window.LogbuchStartBriefing?.openReview();
    });
  }

  async function loadTodayFocus() {
    try {
      const res = await fetch("/api/student/log/today");
      if (!res.ok) return;
      const data = await res.json();
      const blocks = (data.blocks || []).filter(
        (b) => b?.slot?.subject && b.slot.subject !== "Frei" && !b.isFree
      );
      const withEntry = blocks.filter((b) => b.entry);
      state.todayFocus = {
        total: blocks.length,
        done: withEntry.filter((b) => b.entry?.hasReflection).length,
        planned: withEntry.length
      };
    } catch (err) {
      console.error(err);
    }
  }

  function refreshStats() {
    const p = window.__studentProfile;
    if (!p) return;

    const set = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };

    set("hubHeaderLevel", p.levelName ? `Level · ${p.levelName}` : "Level –");
    set("hubHeaderXpMeta", p.xpProgressLabel || "–");
    set("hubXpMeta", p.xpProgressLabel || "–");
    set("hubHeroNext", p.nextLevelLabel || "–");
    set("topbarXp", String(p.xp ?? "–"));
    set("topbarLevel", p.levelName || "–");

    const barIds = ["hubHeaderXpBar", "hubXpBar"];
    barIds.forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.style.width = `${p.xpPct ?? 0}%`;
    });

    const focus = state.todayFocus || { done: 0, total: 0 };
    const focusPct = focus.total > 0 ? Math.round((focus.done / focus.total) * 100) : 0;
    set("hubFocusLabel", `${focus.done}/${focus.total || 0}`);
    const focusBar = document.getElementById("hubFocusBar");
    if (focusBar) focusBar.style.width = `${focusPct}%`;

    const nameEl = document.getElementById("topbarName");
    if (nameEl) nameEl.textContent = p.name || "";
  }

  async function init() {
    await loadTodayFocus();
    render();
    refreshStats();
  }

  window.LogbuchHub = {
    init,
    refreshStats,
    scrollToSecondary: () => {
      document.getElementById("hubSecondary")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };
})();
