/**
 * Schüler-Hub – Kontrollzentrum (App-Hub Layout).
 */
(function () {
  const UI = () => window.LogbuchUI;

  const icon = (slug) => `/icons/student/png/${slug}.png`;
  const hero = (slug) => `/icons/student/hero/${slug}-hero.png`;

  const MAIN_TILES = [
    {
      section: "today",
      slug: "mein-tag",
      title: "Mein Tag",
      text: "Deine heutigen Aufgaben auf einen Blick.",
      cta: "Los geht's",
      accent: "orange"
    },
    {
      section: "week",
      slug: "meine-woche",
      title: "Meine Woche",
      text: "Dein Lernplan für diese Woche.",
      cta: "Plan ansehen",
      accent: "purple"
    },
    {
      section: "zielsetzung",
      slug: "zielsetzung",
      title: "Zielsetzung",
      text: "Setze Ziele und verfolge deinen Fortschritt.",
      cta: "Ziele ansehen",
      accent: "cyan"
    },
    {
      section: "levelplan",
      slug: "lernstand",
      title: "Mein Lernstand",
      text: "Sieh deine Entwicklung und was du schon sicher kannst.",
      cta: "Fortschritt ansehen",
      accent: "green"
    },
    {
      section: "taktik-deck",
      slug: "taktik-deck",
      title: "Taktik-Deck",
      text: "Deine Strategien für jede Lernherausforderung.",
      cta: "Deck öffnen",
      accent: "pink",
      featured: true
    },
    {
      section: "checkpoint-plan",
      slug: "meine-checks",
      title: "Meine Checks",
      text: "Tests, Klassenarbeiten und wichtige Termine im Blick.",
      cta: "Plan öffnen",
      accent: "teal"
    }
  ];

  const SECONDARY_TILES = [
    {
      section: "missionen",
      slug: "missionen",
      title: "Missionen",
      text: "Nimm Herausforderungen an und sammle XP.",
      cta: "Ansehen",
      accent: "violet"
    },
    {
      section: "belohnungen",
      slug: "belohnungen",
      title: "Belohnungen",
      text: "Schalte Extras frei und feiere Erfolge.",
      cta: "Ansehen",
      accent: "gold"
    },
    {
      section: "charakter",
      slug: "charakter",
      title: "Charakter",
      text: "Passe deinen Charakter an und zeig deinen Style.",
      cta: "Anpassen",
      accent: "blue"
    },
    {
      section: "xp",
      slug: "xp-historie",
      title: "XP-Historie",
      text: "Verfolge deine XP und Lernstatistiken.",
      cta: "Ansehen",
      accent: "magenta"
    }
  ];

  window.StudentAssets = { icon, hero };

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

  function streakDots(done) {
    const lit = Math.min(7, Math.max(0, done));
    return Array.from({ length: 7 }, (_, i) =>
      `<span class="hub-streak-dot${i < lit ? " is-lit" : ""}" aria-hidden="true"></span>`
    ).join("");
  }

  function firstNameFromProfile(p) {
    return (p?.name || "").split(/\s+/)[0] || "du";
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
    const iconSrc = icon(tile.slug);
    const heroSrc = hero(tile.slug);
    return `
      <button type="button"
        class="hub-tile dashboard-card app-card hub-accent-${tile.accent} ${large ? "hub-tile-lg" : "hub-tile-sm"} ${tile.featured ? "hub-tile-featured" : ""}"
        data-hub-section="${ui.escapeHtml(tile.section)}">
        <span class="hub-tile-glow" aria-hidden="true"></span>
        <span class="hub-tile-shine" aria-hidden="true"></span>
        <img class="page-hero__image dashboard-card__hero" src="${heroSrc}" alt="" loading="lazy" decoding="async" aria-hidden="true" onerror="this.style.display='none'">
        <div class="hub-tile-content dashboard-card__content card-content">
          ${tile.featured ? `<span class="hub-tile-badge">Empfohlen</span>` : ""}
          <div class="student-section-icon" aria-hidden="true">
            <img src="${iconSrc}" alt="" loading="lazy" decoding="async" onerror="this.style.display='none'">
          </div>
          <span class="hub-tile-title">${ui.escapeHtml(tile.title)}</span>
          <span class="hub-tile-text">${ui.escapeHtml(tile.text)}</span>
          <span class="hub-tile-cta">${ui.escapeHtml(tile.cta)} <span class="hub-tile-arrow">→</span></span>
        </div>
      </button>`;
  }

  function renderStatusPanel(ui, stats, step) {
    const V = window.LogbuchVisuals;
    const missionLabel = step.label === "Tagesziel setzen" ? "5-Minuten-Start" : step.label;
    const missionDone = stats.planned;
    const missionTotal = stats.total || 0;
    const remaining = Math.max(0, stats.total - stats.done);

    const missionCircle = V
      ? V.circularProgress({
          completed: missionDone,
          total: missionTotal,
          label: "Tages-Mission",
          sublabel: missionTotal ? `${missionDone} von ${missionTotal} geplant` : "Noch keine Stunden heute",
          size: 104,
          accent: "#a855f7"
        })
      : "";

    const focusCircle = V
      ? V.circularProgress({
          completed: stats.done,
          total: missionTotal,
          label: "Tagesfokus",
          sublabel: remaining > 0 ? `${remaining} Aufgabe${remaining === 1 ? "" : "n"} übrig` : "Alles geschafft!",
          size: 104,
          accent: stats.done >= missionTotal && missionTotal > 0 ? "#22c55e" : "#f97316"
        })
      : "";

    return `
      <section class="hub-status-grid">
        <div class="hub-status-card dashboard-card hub-accent-purple">
          <img class="page-hero__image dashboard-card__hero hub-status-card__hero" src="${hero("mein-tag")}" alt="" aria-hidden="true">
          <div class="hub-status-card__content dashboard-card__content">
            <p class="hub-block-label">Tages-Mission</p>
            <div class="hub-status-card__body">
              ${missionCircle}
              <div class="hub-status-card__copy">
                <p class="hub-status-card__title" id="hubMissionTitle">${ui.escapeHtml(missionLabel)}</p>
                <p class="hub-status-card__meta" id="hubMissionMeta">${missionTotal ? `${missionDone} von ${missionTotal} geplant` : "Keine Stunden eingetragen"}</p>
                <div class="hub-streak-dots" id="hubStreakFlames">${streakDots(stats.done)}</div>
                <button type="button" class="hub-btn-ghost hub-btn-compact" data-hub-section="today">Weiter machen →</button>
              </div>
            </div>
          </div>
        </div>

        <div class="hub-status-card dashboard-card hub-accent-orange">
          <img class="page-hero__image dashboard-card__hero hub-status-card__hero" src="${hero("meine-woche")}" alt="" aria-hidden="true">
          <div class="hub-status-card__content dashboard-card__content">
            <p class="hub-block-label">Täglicher Fokus</p>
            <div class="hub-status-card__body">
              ${focusCircle}
              <div class="hub-status-card__copy">
                <p class="hub-status-card__title" id="hubFocusText">
                  ${remaining > 0
                    ? "Bleib fokussiert und schließe deine heutigen Schritte ab."
                    : "Stark! Deine heutigen Schritte sind erledigt."}
                </p>
                <p class="hub-status-card__meta" id="hubFocusMeta">${remaining > 0 ? `${remaining} Aufgabe${remaining === 1 ? "" : "n"} übrig` : "Alles geschafft"} · ${stats.done}/${missionTotal || 0} Reflexionen</p>
              </div>
            </div>
          </div>
        </div>
      </section>`;
  }

  function renderXpPanel(ui, p) {
    const V = window.LogbuchVisuals;
    const xpPct = p.xpPct ?? 0;
    const levelCircle = V
      ? V.circularProgress({
          value: xpPct,
          label: p.levelName || "Level",
          size: 88,
          accent: "#d946ef"
        })
      : "";

    return `
      <aside class="hub-xp-panel dashboard-card hub-accent-violet">
        <img class="page-hero__image dashboard-card__hero hub-xp-panel__hero" src="${hero("xp-historie")}" alt="" aria-hidden="true">
        <div class="hub-xp-panel__content dashboard-card__content">
          <p class="hub-xp-panel-label">XP-Fortschritt</p>
          <div class="hub-xp-panel-body hub-xp-panel-body--compact">
            ${levelCircle}
            <div class="hub-xp-panel-copy">
              <p class="hub-xp-meta" id="hubXpMeta">${ui.escapeHtml(p.xpProgressLabel || "–")}</p>
              <p class="hub-xp-next" id="hubHeroNext">${ui.escapeHtml(p.nextLevelLabel || "–")}</p>
            </div>
          </div>
        </div>
      </aside>`;
  }

  function render() {
    const root = document.getElementById("hub-screen-root");
    if (!root) return;
    const ui = UI();
    const p = window.__studentProfile || {};
    const stats = todayStats(state.blocks);
    const step = state.nextStep || computeNextStep(state.blocks, state.todayDate);

    const firstName = firstNameFromProfile(p);

    root.innerHTML = `
      <div class="hub-page">
        <section class="hub-hero-grid">
          <div class="hub-hero-card hub-hero-greeting dashboard-card hub-accent-orange">
            <img class="page-hero__image dashboard-card__hero" src="${hero("mein-tag")}" alt="" aria-hidden="true">
            <div class="hub-hero-card-inner dashboard-card__content">
              <div class="student-section-icon hub-hero-card__icon" aria-hidden="true">
                <img src="${icon("mein-tag")}" alt="" aria-hidden="true">
              </div>
              <p class="page-eyebrow">Dein Hub</p>
              <h2 class="page-hero__title hub-hero-greeting-title" id="hubGreetingTitle">Hey ${ui.escapeHtml(firstName)}!</h2>
              <p class="page-hero__sub hub-hero-sub">
                Bereit, heute etwas zu lernen und XP zu sammeln?
              </p>
              <div class="hub-hero-actions">
                <button type="button" class="hub-hero-btn hub-hero-btn--primary" id="hubNextBtn" data-hub-action="next">
                  ${ui.escapeHtml(step.label === "Heute starten" || step.label === "Mein Tag ansehen" ? "Heute starten" : step.label)} <span aria-hidden="true">→</span>
                </button>
                <button type="button" class="hub-hero-btn hub-hero-btn--secondary" id="hubBriefingBtn">
                  Start-Briefing ansehen
                </button>
              </div>
              <p class="hub-hero-hint" id="hubNextHint">${ui.escapeHtml(step.hint)}</p>
            </div>
          </div>

          ${renderXpPanel(ui, p)}
        </section>

        ${renderStatusPanel(ui, stats, step)}

        <section class="hub-block">
          <h2 class="hub-block-label">Dein Kontrollzentrum</h2>
          <div class="hub-grid-main">
            ${MAIN_TILES.map((t) => renderTile(ui, t, "large")).join("")}
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

    const firstName = firstNameFromProfile(p);
    set("hubGreetingTitle", `Hey ${firstName}!`);
    set("topbarXp", String(p.xp ?? "–"));
    set("topbarLevel", p.levelName || "–");
    set("hubHeroNext", p.nextLevelLabel || "–");
    set("hubXpMeta", p.xpProgressLabel || "–");

    const stats = todayStats(state.blocks);
    const remaining = Math.max(0, stats.total - stats.done);
    set("hubFocusMeta", `${remaining > 0 ? `${remaining} Aufgabe${remaining === 1 ? "" : "n"} übrig` : "Alles geschafft"} · ${stats.done}/${stats.total || 0} Reflexionen`);

    const focusText = document.getElementById("hubFocusText");
    if (focusText) {
      focusText.textContent = remaining > 0
        ? "Bleib fokussiert und schließe deine heutigen Schritte ab."
        : "Stark! Deine heutigen Schritte sind erledigt.";
    }

    const streakEl = document.getElementById("hubStreakFlames");
    if (streakEl) streakEl.innerHTML = streakDots(stats.done);

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
    set("hubMissionMeta", stats.total ? `${missionDone} von ${stats.total} geplant` : "Keine Stunden eingetragen");

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
