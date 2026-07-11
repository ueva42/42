/**
 * Schüler-Hub – Kontrollzentrum (Game-Hub, ohne Sidebar).
 */
(function () {
  const UI = () => window.LogbuchUI;

  const MAIN_TILES = [
    {
      section: "today",
      title: "Mein Tag",
      text: "Deine Aufgaben für heute. Fokus. Fortschritt. Erfolg.",
      cta: "Heute starten",
      tone: "orange",
      icon: "☀"
    },
    {
      section: "week",
      title: "Meine Woche",
      text: "Dein Wochenplan im Überblick.",
      cta: "Woche ansehen",
      tone: "blue",
      icon: "📅"
    },
    {
      section: "zielsetzung",
      title: "Zielsetzung",
      text: "Setze klare Ziele und verfolge deinen Fortschritt.",
      cta: "Ziele ansehen",
      tone: "green",
      icon: "🎯"
    },
    {
      section: "levelplan",
      title: "Mein Lernstand",
      text: "Sieh, woran du arbeitest und was du schon sicher kannst.",
      cta: "Lernstand öffnen",
      tone: "green",
      icon: "📊"
    },
    {
      section: "taktik-deck",
      title: "Taktik-Deck",
      text: "Strategien, die dir helfen, wenn du festhängst.",
      cta: "Deck öffnen",
      tone: "purple",
      featured: true,
      icon: "⚡"
    },
    {
      section: "checkpoint-plan",
      title: "Meine Checks",
      text: "Tests, Klassenarbeiten und wichtige Termine im Blick.",
      cta: "Plan öffnen",
      tone: "blue",
      icon: "✓"
    }
  ];

  const SECONDARY_TILES = [
    {
      section: "missionen",
      title: "Missionen",
      text: "Nimm Herausforderungen an und sammle XP.",
      tone: "muted",
      icon: "◎"
    },
    {
      section: "belohnungen",
      title: "Belohnungen",
      text: "Schalte Extras frei und feiere Erfolge.",
      tone: "muted",
      icon: "🏆"
    },
    {
      section: "charakter",
      title: "Charakter",
      text: "Passe deinen Charakter an.",
      tone: "muted",
      icon: "👤"
    },
    {
      section: "xp",
      title: "XP-Historie",
      text: "Sieh deine Entwicklung und XP.",
      tone: "muted",
      icon: "XP"
    }
  ];

  const state = {
    todayDate: null,
    blocks: [],
    nextStep: null
  };

  function todayIso() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function visibleBlocks(blocks) {
    return (blocks || []).filter(
      (b) => b?.slot?.subject && b.slot.subject !== "Frei" && !b.isFree
    );
  }

  function computeNextStep(blocks, date) {
    const visible = visibleBlocks(blocks);

    if (visible.length === 0) {
      return {
        label: "Mein Tag öffnen",
        hint: "Schau, was heute ansteht.",
        section: "today",
        query: null
      };
    }

    for (const block of visible) {
      const slot = block.slot || {};
      const entry = block.entry;
      const subject = entry?.subject || slot.subject || "Stunde";

      if (!entry) {
        const params = new URLSearchParams({ date: date || todayIso() });
        if (slot.subject) params.set("subject", slot.subject);
        if (slot.timeslot) params.set("timeslot", slot.timeslot);
        return {
          label: "Tagesziel setzen",
          hint: `${subject} – lege dein Tagesziel fest.`,
          section: "plan",
          query: params
        };
      }

      if (!entry.hasCheck) {
        return {
          label: "Zwischen-Check starten",
          hint: `${subject} – wie läuft's gerade?`,
          section: "check",
          query: new URLSearchParams({ entryId: entry.id })
        };
      }

      if (!entry.hasReflection) {
        return {
          label: "Tagesabschluss machen",
          hint: `${subject} – Reflexion abschließen.`,
          section: "reflect",
          query: new URLSearchParams({ entryId: entry.id })
        };
      }
    }

    return {
      label: "Mein Tag ansehen",
      hint: "Alle Schritte für heute erledigt. Stark!",
      section: "today",
      query: null
    };
  }

  function todayStats(blocks) {
    const visible = visibleBlocks(blocks);
    const withEntry = visible.filter((b) => b.entry);
    return {
      total: visible.length,
      done: withEntry.filter((b) => b.entry?.hasReflection).length,
      planned: withEntry.length
    };
  }

  function navigate(section, query) {
    if (query) {
      window.StudentRouter?.navigateToSection(section, { query });
    } else {
      window.StudentRouter?.navigateToSection(section);
    }
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

  function render() {
    const root = document.getElementById("hub-screen-root");
    if (!root) return;
    const ui = UI();
    const p = window.__studentProfile || {};
    const stats = todayStats(state.blocks);
    const step = state.nextStep || computeNextStep(state.blocks, state.todayDate);
    const focusPct = stats.total > 0 ? Math.round((stats.done / stats.total) * 100) : 0;
    const firstName = (p.name || "").split(/\s+/)[0] || "du";

    root.innerHTML = `
      <div class="hub-page">
        <section class="hub-hero">
          <div class="hub-hero-main">
            <p class="hub-hero-kicker">Dein Tag. Dein Plan.</p>
            <h1 class="hub-hero-title">Hey ${ui.escapeHtml(firstName)}!</h1>
            <p class="hub-hero-sub">Starte mit deinem nächsten Lernschritt.</p>
            <div class="hub-hero-next">
              <span class="hub-hero-next-label">Nächster Schritt</span>
              <p class="hub-hero-next-text" id="hubNextHint">${ui.escapeHtml(step.hint)}</p>
              <button type="button" class="hub-hero-cta" id="hubNextBtn" data-hub-action="next">
                ${ui.escapeHtml(step.label)} →
              </button>
            </div>
          </div>
          <aside class="hub-hero-aside">
            <div class="hub-hero-stat">
              <span class="hub-hero-stat-label">Heute</span>
              <span class="hub-hero-stat-value" id="hubFocusLabel">${stats.done}/${stats.total || 0}</span>
              <span class="hub-hero-stat-sub">Stunden abgeschlossen</span>
              <div class="hub-hero-stat-bar">
                <div class="hub-hero-stat-bar-fill" id="hubFocusBar" style="width:${focusPct}%"></div>
              </div>
            </div>
            <div class="hub-hero-stat hub-hero-stat-xp">
              <span class="hub-hero-stat-label">Level</span>
              <span class="hub-hero-stat-value" id="hubHeroLevel">${ui.escapeHtml(p.levelName || "–")}</span>
              <span class="hub-hero-stat-sub" id="hubHeroNext">${ui.escapeHtml(p.nextLevelLabel || "–")}</span>
            </div>
          </aside>
        </section>

        <header class="hub-section-head">
          <div>
            <h2 class="hub-section-head-title">Dein Kontrollzentrum</h2>
            <p class="hub-section-head-sub">Plane dein Lernen, nutze Taktiken und sammle XP.</p>
          </div>
          <button type="button" class="hub-intro-briefing" id="hubBriefingBtn">
            Start-Briefing ansehen →
          </button>
        </header>

        <section class="hub-section">
          <div class="hub-grid-main">
            ${MAIN_TILES.map((t) => renderMainTile(ui, t)).join("")}
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

    root.querySelector("#hubNextBtn")?.addEventListener("click", () => {
      const s = state.nextStep || step;
      navigate(s.section, s.query);
    });
  }

  async function loadTodayData() {
    try {
      const res = await fetch("/api/student/log/today");
      if (!res.ok) return;
      const data = await res.json();
      state.todayDate = data.date || todayIso();
      state.blocks = data.blocks || [];
      state.nextStep = computeNextStep(state.blocks, state.todayDate);
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

    set("hubHeroLevel", p.levelName || "–");
    set("hubHeroNext", p.nextLevelLabel || "–");
    set("topbarXp", String(p.xp ?? "–"));
    set("topbarLevel", p.levelName || "–");

    const stats = todayStats(state.blocks);
    const focusPct = stats.total > 0 ? Math.round((stats.done / stats.total) * 100) : 0;
    set("hubFocusLabel", `${stats.done}/${stats.total || 0}`);
    const focusBar = document.getElementById("hubFocusBar");
    if (focusBar) focusBar.style.width = `${focusPct}%`;

    const step = state.nextStep;
    if (step) {
      set("hubNextHint", step.hint);
      const btn = document.getElementById("hubNextBtn");
      if (btn) btn.textContent = `${step.label} →`;
    }

    const nameEl = document.getElementById("topbarName");
    if (nameEl) nameEl.textContent = p.name || "";
  }

  async function init() {
    await loadTodayData();
    render();
    refreshStats();
  }

  async function refresh() {
    await loadTodayData();
    render();
    refreshStats();
  }

  window.LogbuchHub = {
    init,
    refresh,
    refreshStats,
    scrollToSecondary: () => {
      document.getElementById("hubSecondary")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };
})();
