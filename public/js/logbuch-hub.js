/**
 * Schüler-Hub – Kontrollzentrum (App-Hub Layout).
 */
(function () {
  const UI = () => window.LogbuchUI;

  const HUB_ICONS = {
    today: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
    week: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
    target: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>',
    chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M7 16v-5"/><path d="M12 16V8"/><path d="M17 16v-3"/></svg>',
    cards: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="14" height="16" rx="2"/><path d="M8 4v16"/><path d="M18 8h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-2"/></svg>',
    flag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 22V4"/><path d="M4 4h12l-2 4 2 4H4"/></svg>',
    mission: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>',
    trophy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 21h8"/><path d="M12 17v4"/><path d="M7 4h10v5a5 5 0 0 1-10 0V4z"/><path d="M5 5H3v1a3 3 0 0 0 3 3"/><path d="M19 5h2v1a3 3 0 0 1-3 3"/></svg>',
    user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c1.5-4 6-6 8-6s6.5 2 8 6"/></svg>',
    xp: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"/></svg>'
  };

  const MAIN_TILES = [
    {
      section: "today",
      title: "Mein Tag",
      text: "Deine Aufgaben für heute. Fokus. Fortschritt. Erfolg.",
      cta: "Heute starten",
      accent: "orange",
      iconKey: "today"
    },
    {
      section: "week",
      title: "Meine Woche",
      text: "Dein Wochenplan im Überblick. Bleib dran und baue Momentum auf.",
      cta: "Woche ansehen",
      accent: "blue",
      iconKey: "week"
    },
    {
      section: "zielsetzung",
      title: "Zielsetzung",
      text: "Setze klare Ziele und verfolge deinen Fortschritt.",
      cta: "Ziele ansehen",
      accent: "cyan",
      iconKey: "target"
    },
    {
      section: "levelplan",
      title: "Mein Lernstand",
      text: "Sieh, woran du arbeitest und was du schon sicher kannst.",
      cta: "Lernstand öffnen",
      accent: "green",
      iconKey: "chart"
    },
    {
      section: "taktik-deck",
      title: "Taktik-Deck",
      text: "Strategien, die dir helfen, wenn du festhängst.",
      cta: "Deck öffnen",
      accent: "purple",
      featured: true,
      iconKey: "cards"
    },
    {
      section: "checkpoint-plan",
      title: "Meine Checks",
      text: "Tests, Klassenarbeiten und wichtige Termine im Blick.",
      cta: "Plan öffnen",
      accent: "blue",
      iconKey: "flag"
    }
  ];

  const SECONDARY_TILES = [
    {
      section: "missionen",
      title: "Missionen",
      text: "Nimm Herausforderungen an und sammle XP.",
      cta: "Ansehen",
      accent: "purple",
      iconKey: "mission"
    },
    {
      section: "belohnungen",
      title: "Belohnungen",
      text: "Schalte Extras frei und feiere Erfolge.",
      cta: "Ansehen",
      accent: "orange",
      iconKey: "trophy"
    },
    {
      section: "charakter",
      title: "Charakter",
      text: "Passe deinen Charakter an.",
      cta: "Anpassen",
      accent: "blue",
      iconKey: "user"
    },
    {
      section: "xp",
      title: "XP-Historie",
      text: "Sieh deine Entwicklung und XP.",
      cta: "Ansehen",
      accent: "purple",
      iconKey: "xp"
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
        label: "Heute starten",
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

  function streakFlames(done, total) {
    const lit = Math.min(7, Math.max(0, done));
    return "🔥".repeat(lit) + "⚫".repeat(Math.max(0, 7 - lit));
  }

  function navigate(section, query) {
    if (query) {
      window.StudentRouter?.navigateToSection(section, { query });
    } else {
      window.StudentRouter?.navigateToSection(section);
    }
  }

  function renderTile(ui, tile, size) {
    const large = size === "large";
    const svg = HUB_ICONS[tile.iconKey] || HUB_ICONS.today;
    return `
      <button type="button"
        class="hub-tile hub-accent-${tile.accent} ${large ? "hub-tile-lg" : "hub-tile-sm"} ${tile.featured ? "hub-tile-featured" : ""}"
        data-hub-section="${ui.escapeHtml(tile.section)}">
        <span class="hub-tile-glow" aria-hidden="true"></span>
        <span class="hub-tile-shine" aria-hidden="true"></span>
        ${tile.featured ? `<span class="hub-tile-badge">Empfohlen</span>` : ""}
        <span class="hub-tile-icon" aria-hidden="true">${svg}</span>
        <span class="hub-tile-title">${ui.escapeHtml(tile.title)}</span>
        <span class="hub-tile-text">${ui.escapeHtml(tile.text)}</span>
        <span class="hub-tile-cta">${ui.escapeHtml(tile.cta)} <span class="hub-tile-arrow">→</span></span>
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
    const xpPct = p.xpPct ?? 0;
    const remaining = Math.max(0, stats.total - stats.done);
    const missionLabel = step.label === "Tagesziel setzen" ? "5-Minuten-Start" : step.label;
    const missionDone = stats.planned;
    const missionTotal = Math.max(stats.total, 1);
    const missionPct = Math.round((missionDone / missionTotal) * 100);

    root.innerHTML = `
      <div class="hub-page">
        <section class="hub-hero-grid">
          <div class="hub-hero-card">
            <div class="hub-hero-card-bg" aria-hidden="true"></div>
            <p class="hub-hero-kicker">Mein Tag</p>
            <h1 class="hub-hero-title">Dein Tag. Dein Plan.</h1>
            <p class="hub-hero-sub">
              Starte mit deinem nächsten Lernschritt. Plane dein Lernen, nutze
              Taktiken und sammle XP.
            </p>
            <div class="hub-hero-actions">
              <button type="button" class="hub-btn-primary" id="hubNextBtn" data-hub-action="next">
                ${ui.escapeHtml(step.label === "Heute starten" || step.label === "Mein Tag ansehen" ? "Heute starten" : step.label)} →
              </button>
              <button type="button" class="hub-btn-ghost" id="hubBriefingBtn">
                Start-Briefing ansehen
              </button>
            </div>
            <p class="hub-hero-hint" id="hubNextHint">${ui.escapeHtml(step.hint)}</p>
          </div>

          <aside class="hub-streak-card">
            <p class="hub-streak-label">Tages-Streak</p>
            <div class="hub-streak-value-row">
              <span class="hub-streak-value" id="hubStreakDays">${stats.done}</span>
              <span class="hub-streak-unit">Tage</span>
            </div>
            <div class="hub-streak-flames" id="hubStreakFlames">${streakFlames(stats.done, stats.total)}</div>
            <div class="hub-mission-box">
              <p class="hub-mission-label">Heutige Mission</p>
              <p class="hub-mission-title" id="hubMissionTitle">${ui.escapeHtml(missionLabel)}</p>
              <div class="hub-progress-track">
                <div class="hub-progress-fill hub-progress-fill-purple" id="hubMissionBar" style="width:${missionPct}%"></div>
              </div>
              <p class="hub-mission-meta" id="hubMissionMeta">${missionDone} / ${stats.total || 0} erledigt</p>
            </div>
          </aside>
        </section>

        <section class="hub-block">
          <h2 class="hub-block-label">Dein Kontrollzentrum</h2>
          <div class="hub-grid-main">
            ${MAIN_TILES.map((t) => renderTile(ui, t, "large")).join("")}
          </div>
        </section>

        <section class="hub-status-grid">
          <div class="hub-status-card">
            <p class="hub-block-label">Täglicher Fokus</p>
            <div class="hub-focus-row">
              <div class="hub-focus-ring" id="hubFocusLabel">${stats.done}/${stats.total || 0}</div>
              <div class="hub-focus-copy">
                <p class="hub-focus-text">
                  ${remaining > 0
                    ? "Bleib fokussiert. Schließe deine heutigen Aufgaben ab."
                    : "Stark! Deine heutigen Schritte sind erledigt."}
                </p>
                <div class="hub-progress-track hub-progress-track-lg">
                  <div class="hub-progress-fill hub-progress-fill-purple" id="hubFocusBar" style="width:${focusPct}%"></div>
                </div>
                <p class="hub-focus-meta">${remaining > 0 ? `${remaining} Aufgabe${remaining === 1 ? "" : "n"} übrig` : "Alles geschafft"}</p>
              </div>
              <button type="button" class="hub-btn-ghost hub-btn-compact" data-hub-section="today">Weiter machen →</button>
            </div>
          </div>

          <div class="hub-status-card hub-status-card-xp">
            <p class="hub-block-label">XP-Fortschritt</p>
            <div class="hub-xp-row">
              <div>
                <p class="hub-xp-value">
                  <span id="hubXpCurrent">${Number(p.xp || 0).toLocaleString("de-DE")}</span>
                  <span class="hub-xp-value-sub" id="hubXpMeta">${ui.escapeHtml(p.xpProgressLabel || "–")}</span>
                </p>
                <p class="hub-xp-next" id="hubHeroNext">${ui.escapeHtml(p.nextLevelLabel || "–")}</p>
              </div>
              <div class="hub-xp-emblem">XP</div>
            </div>
            <div class="hub-progress-track hub-progress-track-lg">
              <div class="hub-progress-fill hub-progress-fill-xp" id="hubXpBar" style="width:${xpPct}%"></div>
            </div>
          </div>
        </section>

        <section class="hub-block">
          <h2 class="hub-block-label">Weitere Bereiche</h2>
          <div class="hub-grid-secondary">
            ${SECONDARY_TILES.map((t) => renderTile(ui, t, "small")).join("")}
          </div>
        </section>

        <footer class="hub-quote">
          „Logik bringt dich von Punkt A zu Punkt B. Strategie entscheidet, welchen Weg du nimmst.“
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

    set("topbarXp", String(p.xp ?? "–"));
    set("topbarLevel", p.levelName || "–");
    set("hubHeroNext", p.nextLevelLabel || "–");
    set("hubXpCurrent", Number(p.xp || 0).toLocaleString("de-DE"));
    set("hubXpMeta", p.xpProgressLabel || "–");

    const xpBar = document.getElementById("hubXpBar");
    if (xpBar) xpBar.style.width = `${p.xpPct ?? 0}%`;

    const stats = todayStats(state.blocks);
    const focusPct = stats.total > 0 ? Math.round((stats.done / stats.total) * 100) : 0;
    set("hubFocusLabel", `${stats.done}/${stats.total || 0}`);
    set("hubStreakDays", String(stats.done));
    set("hubStreakFlames", streakFlames(stats.done, stats.total));

    const focusBar = document.getElementById("hubFocusBar");
    if (focusBar) focusBar.style.width = `${focusPct}%`;

    const step = state.nextStep;
    if (step) {
      set("hubNextHint", step.hint);
      const btn = document.getElementById("hubNextBtn");
      if (btn) {
        const label = step.label === "Heute starten" || step.label === "Mein Tag ansehen"
          ? "Heute starten"
          : step.label;
        btn.textContent = `${label} →`;
      }
      set("hubMissionTitle", step.label === "Tagesziel setzen" ? "5-Minuten-Start" : step.label);
    }

    const missionDone = stats.planned;
    const missionTotal = Math.max(stats.total, 1);
    set("hubMissionMeta", `${missionDone} / ${stats.total || 0} erledigt`);
    const missionBar = document.getElementById("hubMissionBar");
    if (missionBar) missionBar.style.width = `${Math.round((missionDone / missionTotal) * 100)}%`;

    const nameEl = document.getElementById("topbarName");
    if (nameEl) nameEl.textContent = (p.name || "").split(/\s+/)[0] || "";
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
      document.querySelector(".hub-grid-secondary")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };
})();
