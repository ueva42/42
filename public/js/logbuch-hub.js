/**
 * Schüler-Hub – Kontrollzentrum (App-Hub Layout).
 */
(function () {
  const UI = () => window.LogbuchUI;

  const ICON_V = { hausaufgaben: 4, ueben: 4, "logic-coach": 1 };
  const HERO_V = { hausaufgaben: 5, ueben: 5, "logic-coach": 1 };
  const icon = (slug) => `/icons/student/png/${slug}.png${ICON_V[slug] ? `?v=${ICON_V[slug]}` : ""}`;
  const hero = (slug) => `/icons/student/hero/${slug}-hero.png?v=${HERO_V[slug] || 6}`;

  /** Central artwork mapping for hub tiles (fit/position only — assets stay fixed). */
  const TILE_ARTWORK = {
    "mein-tag": { fit: "cover", position: "center right" },
    "meine-woche": { fit: "cover", position: "center right" },
    zielsetzung: { fit: "cover", position: "center right" },
    lernstand: { fit: "cover", position: "center right" },
    "taktik-deck": { fit: "cover", position: "center right" },
    "meine-checks": { fit: "cover", position: "center right" },
    missionen: { fit: "cover", position: "center right" },
    belohnungen: { fit: "cover", position: "center right" },
    charakter: { fit: "cover", position: "center right" },
    "xp-historie": { fit: "cover", position: "center right" },
    materialschrank: { fit: "cover", position: "center right" },
    hausaufgaben: { fit: "cover", position: "center" },
    ueben: { fit: "cover", position: "center" },
    "logic-coach": { fit: "cover", position: "center right" }
  };

  const COACH_TILE = {
    coach: true,
    section: "logic-coach",
    slug: "logic-coach",
    title: "LOGIC COACH",
    text: "Hängst du fest? Dein Coach hilft dir, selbst auf die Lösung zu kommen.",
    cta: "Coach fragen",
    accent: "magenta"
  };

  const DASHBOARD_HERO = {
    hub: "/icons/student/hero/dein-hub-hero.png?v=6",
    xp: "/icons/student/hero/xp-fortschritt-hero.png?v=6",
    mission: "/icons/student/hero/tages-mission-hero.png?v=6",
    focus: "/icons/student/hero/taeglicher-fokus-hero.png?v=6"
  };

  function featureVisual(src) {
    return `
      <div class="dashboard-feature-card__visual">
        <img
          src="${src}"
          alt=""
          aria-hidden="true"
          loading="lazy"
          decoding="async"
          onerror="this.closest('.dashboard-feature-card')?.classList.add('dashboard-feature-card--no-visual'); this.closest('.dashboard-feature-card__visual')?.remove();"
        />
      </div>`;
  }

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
      section: "ueben",
      slug: "ueben",
      title: "Üben zu Hause",
      text: "Fach selbst wählen – Übungsziel setzen und abschließen.",
      cta: "Üben starten",
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
      section: "zielsetzung",
      slug: "zielsetzung",
      title: "Zielsetzung",
      text: "Setze Ziele und verfolge deinen Fortschritt.",
      cta: "Ziele ansehen",
      accent: "cyan"
    },
    {
      section: "hausaufgaben",
      slug: "hausaufgaben",
      title: "Hausaufgaben",
      text: "Was heute fällig ist – und was du für morgen mitnimmst.",
      cta: "Öffnen",
      accent: "gold"
    },
    {
      section: "checkpoint-plan",
      slug: "meine-checks",
      title: "Meine Checks",
      text: "Tests, Klassenarbeiten und wichtige Termine im Blick.",
      cta: "Plan öffnen",
      accent: "teal"
    },
    {
      section: "materialschrank",
      slug: "materialschrank",
      title: "Materialschrank",
      text: "Links zu Übungen, Tools und Arbeitsblättern.",
      cta: "Öffnen",
      accent: "cyan"
    },
    {
      section: "gruppenmodus",
      slug: "meine-checks",
      title: "Gruppenarbeit",
      text: "Laborarbeit mit eurer Gruppe an einem iPad.",
      cta: "Gruppe starten",
      accent: "green"
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
      section: "taktik-deck",
      slug: "taktik-deck",
      title: "Taktik-Deck",
      text: "Deine Strategien für jede Lernherausforderung.",
      cta: "Deck öffnen",
      accent: "pink",
      featured: true
    }
  ];

  window.StudentAssets = { icon, hero };

  /** Preset-Farben für Crew-Naming (gleich wie Cockpit-Fallback). */
  const CREW_COLOR_SWATCHES = [
    "#22d3ee",
    "#f472b6",
    "#a78bfa",
    "#fbbf24",
    "#34d399",
    "#fb923c",
    "#67e8f9"
  ];

  const state = {
    todayDate: null,
    blocks: [],
    nextStep: null,
    feedback: [],
    feedbackLabels: {},
    coachEnabled: false,
    classGame: null,
    crew: null
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

      const needsMidCheck =
        (typeof block.needsMidCheck === "boolean" ? block.needsMidCheck : null) ??
        (typeof entry.needsMidCheck === "boolean" ? entry.needsMidCheck : false);

      if (needsMidCheck && !entry.hasCheck) {
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

  function regelregalFromProfile() {
    const p = window.__studentProfile || {};
    const url = String(p.regelregalUrl || "").trim();
    if (!url) return null;
    const label = String(p.regelregalLabel || "").trim() || "Regelregal";
    return { url, label };
  }

  function shelfIcon() {
    return `<span class="hub-hero-btn__icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 4h16v2H4V4zm0 4h6v10H4V8zm8 0h8v3h-8V8zm0 5h8v3h-8v-3zm-8 7h16v2H4v-2z"/></svg></span>`;
  }

  function renderRegelregalBtn(ui) {
    const link = regelregalFromProfile();
    if (!link) return "";
    return `<a class="hub-hero-btn hub-hero-btn--shelf" id="hubRegelregalBtn" href="${ui.escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer" title="Material und Regeln – öffnet in einem neuen Fenster">${shelfIcon()}${ui.escapeHtml(link.label)}</a>`;
  }

  function syncRegelregalBtn() {
    const actions = document.querySelector(".hub-hero-actions");
    if (!actions) return;
    const ui = UI();
    if (!ui?.escapeHtml) return;
    const existing = document.getElementById("hubRegelregalBtn");
    const html = renderRegelregalBtn(ui);
    if (!html) {
      existing?.remove();
      return;
    }
    if (existing) {
      existing.outerHTML = html;
    } else {
      actions.insertAdjacentHTML("beforeend", html);
    }
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
    const art = TILE_ARTWORK[tile.slug] || { fit: "contain", position: "center" };
    const fit = art.fit === "cover" ? "cover" : "contain";
    const position = ui.escapeHtml(art.position || "center");
    const action = tile.coach
      ? `data-hub-coach="open"`
      : `data-hub-section="${ui.escapeHtml(tile.section)}"`;
    return `
      <button type="button"
        class="hub-tile dashboard-card app-card hub-accent-${tile.accent} ${large ? "hub-tile-lg" : "hub-tile-sm"} ${tile.featured ? "hub-tile-featured" : ""}"
        ${action}>
        <span class="hub-tile-glow" aria-hidden="true"></span>
        <span class="hub-tile-shine" aria-hidden="true"></span>
        <div class="dashboard-card__artwork hub-tile-art" data-fit="${fit}" aria-hidden="true">
          <img class="dashboard-card__hero" src="${heroSrc}" alt="" loading="lazy" decoding="async" style="--art-position: ${position}" onerror="this.closest('.dashboard-card__artwork')?.remove()">
        </div>
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

  function renderTeacherFeedback(ui) {
    const items = state.feedback || [];
    if (!items.length) return "";
    const labels = state.feedbackLabels || {};
    return `
      <section class="hub-feedback-panel" style="margin:14px 0 4px">
        <p class="hub-block-label">Rückmeldungen von Lehrkräften</p>
        <div class="hub-feedback-list" style="display:grid;gap:8px">
          ${items
            .slice(0, 5)
            .map((f) => {
              const chips = (f.chips || [])
                .map((id) => labels[id] || id)
                .filter(Boolean)
                .join(" · ");
              return `<article class="dashboard-feature-card" style="padding:12px 14px">
                <p class="hub-status-card__title" style="margin:0 0 4px">${ui.escapeHtml(
                  String(f.date || "").slice(0, 10)
                )}${f.teacherName ? ` · ${ui.escapeHtml(f.teacherName)}` : ""}</p>
                ${chips ? `<p class="hub-status-card__meta" style="margin:0 0 4px">${ui.escapeHtml(chips)}</p>` : ""}
                ${f.note ? `<p style="margin:0;color:#cbd5e1">${ui.escapeHtml(f.note)}</p>` : ""}
              </article>`;
            })
            .join("")}
        </div>
      </section>`;
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
        <div class="dashboard-feature-card dashboard-feature-card--mission hub-accent-purple">
          <div class="dashboard-feature-card__content hub-status-card__content">
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
          ${featureVisual(DASHBOARD_HERO.mission)}
        </div>

        <div class="dashboard-feature-card dashboard-feature-card--focus hub-accent-orange">
          <div class="dashboard-feature-card__content hub-status-card__content">
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
          ${featureVisual(DASHBOARD_HERO.focus)}
        </div>
      </section>`;
  }

  /** Eine Karte im Klassen-Spiel (eigene Klasse – nicht dashboard-feature-card, sonst liegt Text unter dem Dark-Overlay). */
  function classGameCard(label, title, meta, opts = {}) {
    const empty = opts.empty ? " hub-class-game-card--empty" : "";
    const metaHtml = meta
      ? `<p class="hub-class-game-card__meta">${meta}</p>`
      : "";
    const bar = opts.pct != null
      ? `<div class="hub-progress-track" aria-hidden="true"><div class="hub-progress-fill ${opts.fillClass || ""}" style="width:${Math.max(0, Math.min(100, opts.pct))}%"></div></div>`
      : "";
    return `<article class="hub-class-game-card${empty}">
      <p class="hub-class-game-card__label">${label}</p>
      <p class="hub-class-game-card__title">${title}</p>
      ${bar}
      ${metaHtml}
    </article>`;
  }

  /** Klassen-Spiel: gemeinsame Ziele der Klasse. Nur Zahlen, keine Namen außer Gewinn und Team. */
  function renderClassGame(ui) {
    const g = state.classGame;
    if (!g) return "";
    const k = g.klassenziel || {};
    const cards = [];

    if (k.target) {
      const pct = Math.max(0, Math.min(100, Math.round((k.total / k.target) * 100)));
      cards.push(classGameCard(
        "Klassenziel",
        ui.escapeHtml(k.title || "Klassenziel"),
        `${k.total} von ${k.target} XP gemeinsam${k.xpToday ? ` · heute +${k.xpToday}` : ""}`,
        { pct, fillClass: "hub-progress-fill-xp" }
      ));
    } else {
      cards.push(classGameCard(
        "Klassenziel",
        "Noch kein Klassenziel",
        "Deine Lehrkraft legt das gemeinsame XP-Ziel in der Verwaltung an.",
        { empty: true }
      ));
    }

    if (g.mission) {
      const m = g.mission;
      const pct = m.total ? Math.round((m.done / m.total) * 100) : 0;
      cards.push(classGameCard(
        "Klassen-Mission",
        ui.escapeHtml(m.title),
        `${m.done} von ${m.total} geschafft · ${m.mine ? "du hast es schon ✔" : "du fehlst noch, du schaffst das"}`,
        { pct }
      ));
    } else {
      cards.push(classGameCard(
        "Klassen-Mission",
        "Noch keine Klassen-Mission",
        "Im Lehrer-Cockpit startet die Lehrkraft eine gemeinsame Mission.",
        { empty: true }
      ));
    }

    const r = g.raffle || {};
    const myTickets = Number(r.myTickets) || 0;
    const raffleTitle = r.drawn
      ? r.drawn.youWon
        ? `Du hast heute gewonnen: +${r.drawn.xp} XP!`
        : `Heute gewonnen: ${ui.escapeHtml(r.drawn.winnerShort)} (+${r.drawn.xp} XP).`
      : r.inPot
        ? `Du bist im Lostopf${myTickets ? ` · ${myTickets} Los${myTickets === 1 ? "" : "e"}` : ""} (${r.eligibleCount} dabei).`
        : "Noch nicht im Lostopf";
    const raffleMeta = r.drawn
      ? "Glückwunsch an die Gewinner:in – morgen geht’s weiter."
      : r.inPot
        ? "Deine Lehrkraft zieht im Cockpit."
        : "Plane, reflektiere, schätze gut ein oder hilf mit – dann gibt’s Lose.";
    cards.push(classGameCard("Glücks-Ziehung", raffleTitle, raffleMeta, { empty: !r.drawn && !r.inPot }));

    if (g.team) {
      const awardMembers = Array.isArray(g.team.members) ? g.team.members.filter(Boolean) : [];
      cards.push(classGameCard(
        "Team des Tages",
        ui.escapeHtml(g.team.name) + (g.team.yours ? ` · dein Team! +${g.team.xpEach} XP` : ""),
        awardMembers.length
          ? `Heute ausgezeichnet: ${awardMembers.map((n) => ui.escapeHtml(n)).join(" · ")}`
          : "Heute ausgezeichnet."
      ));
    } else if (g.myTeam) {
      const mt = g.myTeam;
      const names = Array.isArray(mt.members) ? mt.members.filter(Boolean) : [];
      const topic = mt.sessionTitle ? ` · ${ui.escapeHtml(mt.sessionTitle)}` : "";
      cards.push(classGameCard(
        "Dein Team",
        ui.escapeHtml(mt.name || "Eure Gruppe") + (mt.subject ? ` (${ui.escapeHtml(mt.subject)})` : ""),
        names.length
          ? `Ihr seid zusammen: ${names.map((n) => ui.escapeHtml(n)).join(" · ")}${topic}. Schließt alle den Tag ab – dann kann eure Lehrkraft euch auszeichnen.`
          : `Eure Gruppenarbeit läuft${topic}. Schließt alle den Tag ab – dann kann eure Lehrkraft euch auszeichnen.`
      ));
    } else {
      cards.push(classGameCard(
        "Team des Tages",
        "Noch kein Team ausgezeichnet",
        "Bei aktiver Gruppenarbeit wählt die Lehrkraft im Cockpit ein Team des Tages.",
        { empty: true }
      ));
    }

    return `
      <section class="hub-block hub-class-game" style="margin:14px 0 4px">
        <h2 class="hub-block-label">Klassen-Spiel</h2>
        <div class="hub-class-game-grid">${cards.join("")}</div>
      </section>`;
  }

  /** Crew-Naming: nur wenn API eine Crew liefert. Bearbeiten nur bei canEdit. */
  function renderCrewPanel(ui) {
    const crew = state.crew;
    if (!crew || !crew.id) return "";
    const memberCount = Array.isArray(crew.members) ? crew.members.length : 0;
    const canEdit = crew.canEdit === true;
    const name = crew.name || "";
    const tagText = crew.tagText || "";
    const color = crew.color || CREW_COLOR_SWATCHES[0];
    const swatches = CREW_COLOR_SWATCHES.includes(color)
      ? CREW_COLOR_SWATCHES
      : [color, ...CREW_COLOR_SWATCHES];

    const statusLine = canEdit
      ? "Noch nicht freigegeben – ihr könnt Name, Farbe und Tag festlegen (ein Gerät pro Crew)."
      : "Freigegeben – nur noch lesen.";

    const formHtml = canEdit
      ? `
        <div class="hub-crew-form">
          <label class="hub-crew-label" for="hubCrewName">Crew-Name</label>
          <input class="logbuch-input hub-crew-input" id="hubCrewName" type="text" maxlength="40" value="${ui.escapeHtml(name)}" placeholder="z. B. Neon Riders" autocomplete="off">
          <label class="hub-crew-label" for="hubCrewTag">Tag / Motto</label>
          <input class="logbuch-input hub-crew-input" id="hubCrewTag" type="text" maxlength="40" value="${ui.escapeHtml(tagText)}" placeholder="kurzer Tag" autocomplete="off">
          <p class="hub-crew-label">Farbe</p>
          <div class="hub-crew-swatches" role="group" aria-label="Crew-Farbe">
            ${swatches
              .map(
                (c) => `
              <button type="button" class="hub-crew-swatch${c === color ? " is-active" : ""}" data-crew-color="${ui.escapeHtml(c)}" style="--swatch:${ui.escapeHtml(c)}" aria-label="Farbe ${ui.escapeHtml(c)}" aria-pressed="${c === color ? "true" : "false"}"></button>`
              )
              .join("")}
          </div>
          <input type="hidden" id="hubCrewColor" value="${ui.escapeHtml(color)}">
          <div class="hub-crew-actions">
            <button type="button" class="hub-btn-ghost hub-btn-compact" id="hubCrewSave">Speichern</button>
            <span class="hub-crew-msg" id="hubCrewMsg" hidden></span>
          </div>
        </div>`
      : `
        <div class="hub-crew-readonly">
          <p class="hub-class-game-card__title">${ui.escapeHtml(name || "Ohne Namen")}</p>
          ${tagText ? `<p class="hub-class-game-card__meta">${ui.escapeHtml(tagText)}</p>` : ""}
          <span class="hub-crew-color-dot" style="--swatch:${ui.escapeHtml(color)}" aria-hidden="true"></span>
        </div>`;

    return `
      <section class="hub-block hub-crew" style="margin:14px 0 4px" id="hubCrewPanel">
        <h2 class="hub-block-label">Crew</h2>
        <article class="hub-class-game-card hub-crew-card">
          <p class="hub-class-game-card__label">Eure Crew</p>
          <p class="hub-class-game-card__meta">${memberCount} Mitglied${memberCount === 1 ? "" : "er"} · ${ui.escapeHtml(statusLine)}</p>
          ${formHtml}
        </article>
      </section>`;
  }

  function bindCrewPanel(root) {
    const panel = root.querySelector("#hubCrewPanel");
    if (!panel || !state.crew?.canEdit) return;

    panel.querySelectorAll("[data-crew-color]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const value = btn.getAttribute("data-crew-color") || "";
        const hidden = panel.querySelector("#hubCrewColor");
        if (hidden) hidden.value = value;
        panel.querySelectorAll("[data-crew-color]").forEach((el) => {
          const on = el === btn;
          el.classList.toggle("is-active", on);
          el.setAttribute("aria-pressed", on ? "true" : "false");
        });
      });
    });

    panel.querySelector("#hubCrewSave")?.addEventListener("click", async () => {
      const msg = panel.querySelector("#hubCrewMsg");
      const name = panel.querySelector("#hubCrewName")?.value?.trim() || "";
      const tagText = panel.querySelector("#hubCrewTag")?.value?.trim() || "";
      const color = panel.querySelector("#hubCrewColor")?.value || "";
      const setMsg = (text, ok) => {
        if (!msg) return;
        msg.hidden = !text;
        msg.textContent = text || "";
        msg.classList.toggle("is-ok", !!ok);
        msg.classList.toggle("is-err", !!text && !ok);
      };
      setMsg("Speichern…", true);
      try {
        const res = await fetch("/api/student/cockpit/crew", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            crewId: state.crew.id,
            name: name || null,
            color: color || null,
            tagText: tagText || null
          })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.success === false) {
          setMsg(data.message || "Speichern fehlgeschlagen.", false);
          return;
        }
        state.crew = {
          ...state.crew,
          name: name || state.crew.name,
          color: color || state.crew.color,
          tagText: tagText || state.crew.tagText
        };
        setMsg(data.message || "Gespeichert.", true);
      } catch (err) {
        console.error(err);
        setMsg("Netzwerkfehler.", false);
      }
    });
  }

  function traitListFromProfile(p) {
    return (Array.isArray(p?.traits) ? p.traits : []).map((t) => String(t || "").trim()).filter(Boolean);
  }

  function renderTraitChips(ui, traits) {
    if (!traits.length) {
      return `<p class="hub-identity-empty" id="hubIdentityTraits">Eigenschaften erscheinen, sobald dein Charakter steht.</p>`;
    }
    return `<ul class="hub-identity-traits" id="hubIdentityTraits">${traits
      .map((t) => `<li>${ui.escapeHtml(t)}</li>`)
      .join("")}</ul>`;
  }

  function renderIdentityCard(ui, p) {
    const xpPct = Math.max(0, Math.min(100, Number(p.xpPct) || 0));
    const levelName = p.freedomRankLabel || p.levelName || "Starter";
    const charName = p.characterName || "Dein Charakter";
    const hasCharacter = !!p.characterImage || !!p.characterName;
    const traits = traitListFromProfile(p);
    const initial = (charName || p.name || "?").charAt(0).toUpperCase();
    const portrait = p.characterImage
      ? `<img src="${ui.escapeHtml(p.characterImage)}" alt="" id="hubIdentityImg">`
      : `<span class="hub-identity-initial" id="hubIdentityInitial">${ui.escapeHtml(initial)}</span>`;
    const rankIcon = p.freedomRankIcon
      ? `<img class="hub-identity-rank" src="${ui.escapeHtml(p.freedomRankIcon)}" alt="" width="18" height="18">`
      : "";

    return `
      <button type="button" class="hub-identity-card" id="hubIdentityCard" data-hub-identity="charakter">
        <p class="hub-identity-kicker">Dein Charakter</p>
        <div class="hub-identity-head">
          <div class="hub-identity-portrait" aria-hidden="true">${portrait}</div>
          <div class="hub-identity-copy">
            <h3 class="hub-identity-name" id="hubIdentityName">${ui.escapeHtml(charName)}</h3>
            <p class="hub-identity-level" id="hubXpLevel">${rankIcon}<span>Level ${ui.escapeHtml(levelName)}</span></p>
          </div>
        </div>
        <p class="hub-identity-label">Eigenschaften</p>
        ${renderTraitChips(ui, traits)}
        <div class="hub-identity-xp">
          <div class="hub-identity-xp__row">
            <span id="hubXpMeta">${ui.escapeHtml(p.xpProgressLabel || "–")}</span>
            <span id="hubIdentityXpPct">${xpPct}%</span>
          </div>
          <div class="hub-progress-track hub-progress-track-lg hub-xp-track" aria-hidden="true">
            <div class="hub-progress-fill hub-progress-fill-xp" id="hubXpFill" style="width:${xpPct}%"></div>
          </div>
          <p class="hub-xp-next" id="hubHeroNext">${ui.escapeHtml(p.nextLevelLabel || "–")}</p>
        </div>
        <span class="hub-identity-cta">${hasCharacter ? "Charakter ansehen" : "Charakter wählen"} <span aria-hidden="true">→</span></span>
      </button>`;
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
          <div class="dashboard-feature-card dashboard-feature-card--hub hub-accent-orange">
            <div class="dashboard-feature-card__content hub-hero-card-inner">
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
                ${renderRegelregalBtn(ui)}
              </div>
              <p class="hub-hero-hint" id="hubNextHint">${ui.escapeHtml(step.hint)}</p>
            </div>
            ${featureVisual(DASHBOARD_HERO.hub)}
          </div>

          ${
            window.StudentFeatureModules?.isSectionEnabled?.("charakter") === false
              ? ""
              : renderIdentityCard(ui, p)
          }
        </section>

        ${renderStatusPanel(ui, stats, step)}
        ${renderCrewPanel(ui)}
        ${
          window.StudentFeatureModules?.isModuleEnabled?.("missionen") === false
            ? ""
            : renderClassGame(ui)
        }
        ${renderTeacherFeedback(ui)}

        <section class="hub-block">
          <h2 class="hub-block-label">Dein Kontrollzentrum</h2>
          <div class="hub-grid-main">
            ${(state.coachEnabled ? MAIN_TILES.concat([COACH_TILE]) : MAIN_TILES)
              .filter((t) => window.StudentFeatureModules?.isSectionEnabled?.(t.section) !== false)
              .map((t) => renderTile(ui, t, "large"))
              .join("")}
          </div>
        </section>

        <footer class="hub-quote">
          „Logik bringt dich von Punkt A zu Punkt B. Strategie entscheidet, welchen Weg du nimmst.“
        </footer>
      </div>`;

    root.querySelectorAll("[data-hub-section]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const section = btn.dataset.hubSection;
        navigate(section);
      });
    });

    root.querySelectorAll("[data-hub-coach]").forEach((btn) => {
      btn.addEventListener("click", () => {
        window.LogbuchCoach?.open({ source: "hub" });
      });
    });

    root.querySelector("[data-hub-identity]")?.addEventListener("click", () => {
      if (window.StudentFeatureModules?.isSectionEnabled?.("charakter") === false) return;
      const p = window.__studentProfile || {};
      if (!p.characterImage && !p.characterName && typeof window.openCharacterOverlay === "function") {
        window.openCharacterOverlay();
        return;
      }
      navigate("charakter");
    });

    root.querySelector("#hubBriefingBtn")?.addEventListener("click", () => {
      window.LogbuchStartBriefing?.openReview();
    });

    root.querySelector("#hubNextBtn")?.addEventListener("click", () => {
      const s = state.nextStep || step;
      const target =
        window.StudentFeatureModules?.isSectionEnabled?.(s.section) === false
          ? { section: "today", query: null }
          : s;
      navigate(target.section, target.query);
    });

    bindCrewPanel(root);
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

  async function loadTeacherFeedback() {
    try {
      const res = await fetch("/api/student/feedback", { credentials: "same-origin" });
      if (!res.ok) return;
      const data = await res.json();
      state.feedback = data.feedback || [];
      state.feedbackLabels = data.chipLabels || {};
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
    const topLevel = document.getElementById("topbarLevel");
    if (topLevel) {
      const icon = p.freedomRankIcon
        ? `<img src="${p.freedomRankIcon}" alt="" width="18" height="18" style="vertical-align:-3px;margin-right:4px;object-fit:contain;" aria-hidden="true">`
        : "";
      topLevel.innerHTML = `${icon}Level: ${p.freedomRankLabel || p.levelName || "–"}`;
    }
    set("hubHeroNext", p.nextLevelLabel || "–");
    set("hubXpMeta", p.xpProgressLabel || "–");
    const xpPct = Math.max(0, Math.min(100, Number(p.xpPct) || 0));
    const xpPctEl = document.getElementById("hubIdentityXpPct");
    if (xpPctEl) xpPctEl.textContent = `${xpPct}%`;
    const xpFill = document.getElementById("hubXpFill");
    if (xpFill) {
      xpFill.style.width = `${xpPct}%`;
    }
    const levelEl = document.getElementById("hubXpLevel");
    if (levelEl) {
      const icon = p.freedomRankIcon
        ? `<img class="hub-identity-rank" src="${p.freedomRankIcon}" alt="" width="18" height="18">`
        : "";
      levelEl.innerHTML = `${icon}<span>Level ${p.freedomRankLabel || p.levelName || "–"}</span>`;
    }
    const identityName = document.getElementById("hubIdentityName");
    if (identityName) identityName.textContent = p.characterName || "Dein Charakter";
    const portrait = document.querySelector(".hub-identity-portrait");
    if (portrait) {
      const ui = UI();
      if (p.characterImage) {
        let img = document.getElementById("hubIdentityImg");
        const src = ui.escapeHtml(p.characterImage);
        if (!img) {
          portrait.innerHTML = `<img src="${src}" alt="" id="hubIdentityImg">`;
        } else if (img.getAttribute("src") !== p.characterImage) {
          img.src = p.characterImage;
        }
      } else {
        const initial = (p.characterName || p.name || "?").charAt(0).toUpperCase();
        portrait.innerHTML = `<span class="hub-identity-initial" id="hubIdentityInitial">${ui.escapeHtml(initial)}</span>`;
      }
    }
    const traitsEl = document.getElementById("hubIdentityTraits");
    if (traitsEl) {
      const ui = UI();
      const wrap = document.createElement("div");
      wrap.innerHTML = renderTraitChips(ui, traitListFromProfile(p));
      const next = wrap.firstElementChild;
      if (next) traitsEl.replaceWith(next);
    }

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

    syncRegelregalBtn();
  }

  async function loadCoachFlag() {
    state.coachEnabled = (await window.LogbuchCoach?.refreshStatus?.()) === true;
  }

  async function loadClassGame() {
    try {
      const res = await fetch("/api/student/class-game", { credentials: "same-origin" });
      if (!res.ok) return;
      const data = await res.json();
      state.classGame = data.game || null;
    } catch (err) {
      console.error(err);
    }
  }

  async function loadCrew() {
    try {
      const res = await fetch("/api/student/cockpit/crew", { credentials: "same-origin" });
      if (!res.ok) {
        state.crew = null;
        return;
      }
      const data = await res.json();
      state.crew = data.crew || null;
    } catch (err) {
      console.error(err);
      state.crew = null;
    }
  }

  async function init() {
    await Promise.all([
      loadTodayData(),
      loadTeacherFeedback(),
      loadCoachFlag(),
      loadClassGame(),
      loadCrew()
    ]);
    render();
    refreshStats();
  }

  async function refresh() {
    await Promise.all([
      loadTodayData(),
      loadTeacherFeedback(),
      loadCoachFlag(),
      loadClassGame(),
      loadCrew()
    ]);
    render();
    refreshStats();
  }

  window.LogbuchHub = {
    init,
    refresh,
    refreshStats,
    scrollToSecondary: () => {
      document.querySelector(".hub-identity-card")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };
})();
