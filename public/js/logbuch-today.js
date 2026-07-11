/**
 * SRL-Logbuch – MEIN TAG (App-Card Layout).
 */
(function () {
  const UI = () => window.LogbuchUI;

  const state = {
    date: null,
    data: null,
    loading: false,
    slideDir: null
  };

  function todayIso() {
    return new Date().toISOString().slice(0, 10);
  }

  function addSchoolDays(dateIso, delta) {
    const d = new Date(`${dateIso}T12:00:00`);
    const step = delta > 0 ? 1 : -1;
    let remaining = Math.abs(delta);
    while (remaining > 0) {
      d.setDate(d.getDate() + step);
      const day = d.getDay();
      if (day >= 1 && day <= 5) remaining--;
    }
    return d.toISOString().slice(0, 10);
  }

  function isEditableDate(dateIso) {
    return dateIso === todayIso();
  }

  function goalAchievedSymbol(value) {
    if (value === "ja") return "✓";
    if (value === "teilweise") return "◐";
    if (value === "nein") return "✗";
    return "–";
  }

  function blockPhases(entry) {
    return {
      plan: !!entry,
      check: !!entry?.hasCheck,
      reflect: !!entry?.hasReflection
    };
  }

  function visibleBlocks(blocks) {
    return (blocks || []).filter(
      (b) => b?.slot?.subject && b.slot.subject !== "Frei" && !b.isFree
    );
  }

  function renderPhasePills(phases) {
    const items = [
      { key: "plan", label: "Plan" },
      { key: "check", label: "Check" },
      { key: "reflect", label: "Reflexion" }
    ];
    return items
      .map(
        (p) =>
          `<span class="phase-pill ${phases[p.key] ? "is-done" : ""}">${phases[p.key] ? "✓" : "○"} ${p.label}</span>`
      )
      .join("");
  }

  function renderActionSelect(entry) {
    const ui = UI();
    const hasCheck = entry.hasCheck;
    const hasReflection = entry.hasReflection;

    if (hasCheck && hasReflection) {
      return `<p class="today-block-done-label">Alle Schritte erledigt ✓</p>`;
    }

    let options = `<option value="">Nächster Schritt…</option>`;
    if (!hasCheck) {
      options += `<option value="check">Zwischen-Check</option>`;
    } else {
      options += `<option value="" disabled>Check ✓</option>`;
    }
    if (!hasReflection) {
      options += `<option value="reflect">Tagesabschluss</option>`;
    } else {
      options += `<option value="" disabled>Abschluss ✓</option>`;
    }

    return `
      <select class="logbuch-select today-action-select" data-entry-id="${ui.escapeHtml(entry.id)}">
        ${options}
      </select>`;
  }

  function renderDailyGoalBody(ui, entry) {
    if (entry.level_goal_text) {
      const meta = [];
      if (entry.what_goal_text) meta.push(entry.what_goal_text);
      if (entry.level_label) meta.push(entry.level_label);
      return `
        <div class="today-focus-card">
          <p class="today-focus-card-title">Dein Tagesziel</p>
          ${meta.length ? `<p class="today-focus-meta">${ui.escapeHtml(meta.join(" · "))}</p>` : ""}
          <p class="lesson-card__goal"><strong>Ziel:</strong> ${ui.escapeHtml(entry.level_goal_text)}</p>
          ${
            entry.how_goal_text || entry.goal
              ? `<p class="lesson-card__goal"><strong>Weg:</strong> ${ui.escapeHtml(entry.how_goal_text || entry.goal || "")}</p>`
              : ""
          }
        </div>`;
    }
    const titleText = entry.plan_sentence || entry.goal;
    if (!titleText) return "";
    const detailText = entry.details_text ? `Konkret: ${entry.details_text}` : "";
    return `
      <p class="lesson-card__goal">${ui.escapeHtml(titleText)}</p>
      ${detailText ? `<p class="today-block-muted">${ui.escapeHtml(detailText)}</p>` : ""}`;
  }

  function renderCheckSummary(ui, entry) {
    const c = entry.check;
    if (!c?.on_track) return "";

    const isLegacy = ["👍", "😐", "👎"].includes(c.on_track);
    if (isLegacy) {
      return `<p class="today-block-muted">Zwischen-Check abgeschlossen</p>`;
    }

    return `
      <p class="today-block-muted">
        Check: ${ui.escapeHtml(c.on_track)} · Verstanden: ${ui.escapeHtml(c.understands)} · Fortschritt: ${ui.escapeHtml(c.progress)}
      </p>`;
  }

  function renderReflectionSummary(ui, entry) {
    const r = entry.reflection;
    if (!r) return "";

    const goalText =
      r.goal_reached_answer ||
      (r.goal_achieved === "ja"
        ? "Ja"
        : r.goal_achieved === "teilweise"
          ? "Teilweise"
          : r.goal_achieved === "nein"
            ? "Nein"
            : r.goal_achieved || "–");

    return `
      <p class="today-block-muted">
        Reflexion: ${goalAchievedSymbol(r.goal_achieved)} ${ui.escapeHtml(goalText)}
        · Sicherheit ${entry.confidence_before ?? "–"} → ${r.confidence_after}/5
      </p>`;
  }

  function navButton(label, nav, query, primary = false) {
    const ui = UI();
    const cls = primary ? "btn-primary" : "logbuch-btn-ghost";
    return `
      <button type="button" class="${cls}" data-nav="${ui.escapeHtml(nav)}" data-query="${ui.escapeHtml(query)}">
        ${ui.escapeHtml(label)} →
      </button>`;
  }

  function primaryAction(entry, editable) {
    if (!editable || entry.hasReflection) return null;
    if (!entry.hasCheck) {
      return navButton("Zwischen-Check", "check", new URLSearchParams({ entryId: entry.id }).toString(), true);
    }
    return navButton("Tagesabschluss", "reflect", new URLSearchParams({ entryId: entry.id }).toString(), true);
  }

  function renderBlock(block, editable) {
    const ui = UI();
    const slot = block.slot;
    const entry = block.entry;

    if (!entry) {
      if (!editable) {
        return `
          <article class="student-card lesson-card">
            <div class="card-content">
              <div class="lesson-card__head">
                <h3 class="lesson-card__subject">${slot ? ui.escapeHtml(slot.subject) : "Lernzeit"}</h3>
                ${slot?.timeslot ? `<span class="lesson-card__time">${ui.escapeHtml(slot.timeslot)}</span>` : ""}
              </div>
              <p class="today-block-muted">Kein Eintrag</p>
            </div>
          </article>`;
      }

      const params = new URLSearchParams({ date: state.date });
      if (slot?.subject) params.set("subject", slot.subject);
      if (slot?.timeslot) params.set("timeslot", slot.timeslot);

      return `
        <article class="student-card lesson-card">
          <div class="card-content">
            <div class="lesson-card__head">
              <h3 class="lesson-card__subject">${slot ? ui.escapeHtml(slot.subject) : "Lernzeit"}</h3>
              ${slot?.timeslot ? `<span class="lesson-card__time">${ui.escapeHtml(slot.timeslot)}</span>` : ""}
            </div>
            <p class="lesson-card__goal">Noch kein Tagesziel gesetzt.</p>
            <div class="lesson-card__actions">
              ${navButton("Tagesziel setzen", "plan", params.toString(), true)}
            </div>
          </div>
        </article>`;
    }

    const readOnly = !editable;
    const params = new URLSearchParams({ date: state.date });
    if (entry.id) params.set("entryId", entry.id);
    if (entry.subject) params.set("subject", entry.subject);
    if (entry.timeslot) params.set("timeslot", entry.timeslot);

    const checkParams = new URLSearchParams({ entryId: entry.id });
    const reflectParams = new URLSearchParams({ entryId: entry.id });
    const phases = blockPhases(entry);

    const viewPlanBtn = navButton(
      editable && !entry.hasReflection ? "Ziel bearbeiten" : "Ziel ansehen",
      "plan",
      params.toString()
    );
    const viewCheckBtn = entry.hasCheck
      ? navButton(
          editable && !entry.hasReflection ? "Check bearbeiten" : "Check ansehen",
          "check",
          checkParams.toString()
        )
      : "";
    const viewReflectBtn = entry.hasReflection
      ? navButton(editable ? "Reflexion bearbeiten" : "Reflexion ansehen", "reflect", reflectParams.toString())
      : "";

    const primary = primaryAction(entry, editable);
    const secondary = [viewPlanBtn, viewCheckBtn, viewReflectBtn].filter(Boolean).join("");
    const nextSelect = !readOnly && !(entry.hasCheck && entry.hasReflection) ? renderActionSelect(entry) : "";

    const checkpointHint = entry.checkpoint_title
      ? `<p class="today-block-muted">${ui.escapeHtml(entry.checkpoint_title)}</p>`
      : "";

    return `
      <article class="student-card lesson-card">
        <div class="card-content">
          <div class="lesson-card__head">
            <h3 class="lesson-card__subject">${ui.escapeHtml(entry.subject)}</h3>
            ${entry.timeslot ? `<span class="lesson-card__time">${ui.escapeHtml(entry.timeslot)}</span>` : ""}
          </div>
          ${checkpointHint}
          ${renderDailyGoalBody(ui, entry)}
          ${entry.hasCheck ? renderCheckSummary(ui, entry) : ""}
          ${entry.hasReflection ? renderReflectionSummary(ui, entry) : ""}
          <div class="lesson-card__phases">${renderPhasePills(phases)}</div>
          <div class="lesson-card__actions">
            ${primary || ""}
            ${secondary}
            ${nextSelect}
          </div>
        </div>
      </article>`;
  }

  function renderProgressStrip(blockList) {
    const V = window.LogbuchVisuals;
    const total = blockList.length;
    const planned = blockList.filter((b) => b.entry).length;
    const checked = blockList.filter((b) => b.entry?.hasCheck).length;
    const reflected = blockList.filter((b) => b.entry?.hasReflection).length;
    const p = window.__studentProfile || {};
    const dayPct = total ? Math.round((reflected / total) * 100) : 0;

    const stats = V
      ? V.statCards([
          { value: `${planned}/${total || 0}`, label: "Ziele gesetzt", accent: true },
          { value: `${checked}/${total || 0}`, label: "Checks" },
          { value: `${reflected}/${total || 0}`, label: "Reflexionen" },
          { value: Number(p.xp || 0).toLocaleString("de-DE"), label: "XP gesamt", accent: true }
        ])
      : "";

    if (!V) return stats;

    return `
      ${V.progressPanel({
        radial: V.radialProgress(dayPct, `${dayPct}%`, "Tagesfortschritt"),
        stats
      })}`;
  }

  function renderEmptyState(d, editable) {
    const ui = UI();
    if (!d.hasClass) {
      return `
        <div class="student-card empty-state-card">
          <div class="card-content">
            <p class="empty-state-card__eyebrow">Keine Klasse</p>
            <h3 class="empty-state-card__title">Dir ist noch keine Klasse zugeordnet.</h3>
            <p class="empty-state-card__text">Bitte wende dich an deine Lehrkraft.</p>
          </div>
        </div>`;
    }

    return `
      <div class="student-card empty-state-card">
        <img class="card-hero-art" src="/icons/student/hero/mein-tag-hero.png" alt="" aria-hidden="true">
        <div class="card-content">
          <p class="empty-state-card__eyebrow">Keine Stunden</p>
          <h3 class="empty-state-card__title">Heute ist noch nichts eingetragen.</h3>
          <p class="empty-state-card__text">
            Für diesen Tag${d.className ? ` (${ui.escapeHtml(d.className)})` : ""} sind noch keine Unterrichtsstunden im Stundenplan.
            Deine Lehrkraft kann sie im Admin-Bereich eintragen.
          </p>
          ${editable ? `<p class="empty-state-card__hint">Schau später nochmal vorbei.</p>` : ""}
        </div>
      </div>`;
  }

  function renderDayNav(d) {
    const ui = UI();
    return `
      <div class="student-card day-nav-card">
        <button type="button" class="today-arrow" data-dir="prev" aria-label="Vorheriger Tag">‹</button>
        <div class="day-nav-card__center">
          <h3 class="day-nav-card__title">${ui.escapeHtml(d.weekdayLabel)}</h3>
          <p class="day-nav-card__sub">${ui.escapeHtml(d.dateLabel)}</p>
        </div>
        <button type="button" class="today-arrow" data-dir="next" aria-label="Nächster Tag">›</button>
      </div>`;
  }

  function render() {
    const root = document.getElementById("today-screen-root");
    if (!root) return;
    const ui = UI();

    if (state.loading && !state.data) {
      root.innerHTML = `<div class="logbuch-loading">Lade deinen Tag…</div>`;
      return;
    }

    const d = state.data;
    if (!d) {
      root.innerHTML = ui.msg("Tag konnte nicht geladen werden.");
      return;
    }

    const editable = isEditableDate(state.date);
    const slideClass = state.slideDir ? `today-slide-${state.slideDir}` : "";
    const blockList = visibleBlocks(d.blocks);

    const lessonsHtml =
      blockList.length > 0
        ? blockList.map((b) => renderBlock(b, editable)).join("")
        : renderEmptyState(d, editable);

    root.innerHTML = `
      <div class="student-page today-shell" id="todaySwipeArea">
        ${renderDayNav(d)}
        ${renderProgressStrip(blockList)}

        <div class="today-slide-viewport">
          <div class="today-slide-panel ${slideClass}" id="todaySlidePanel">
            <section class="page-grid">
              <div class="section-block">
                <h3 class="section-block__title">${blockList.length ? "Deine Stunden" : "Übersicht"}</h3>
                <div class="today-blocks">${lessonsHtml}</div>
              </div>
            </section>
          </div>
        </div>
      </div>`;

    bindHandlers(root);

    if (state.slideDir) {
      const panel = root.querySelector("#todaySlidePanel");
      requestAnimationFrame(() => {
        panel?.classList.remove(`today-slide-${state.slideDir}`);
        state.slideDir = null;
      });
    }
  }

  function bindHandlers(root) {
    root.querySelector('[data-dir="prev"]')?.addEventListener("click", () => navigateDay(-1));
    root.querySelector('[data-dir="next"]')?.addEventListener("click", () => navigateDay(1));

    root.querySelectorAll("[data-nav]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const nav = btn.dataset.nav;
        const q = new URLSearchParams(btn.dataset.query || "");
        if (nav === "plan" || nav === "check" || nav === "reflect") {
          window.StudentRouter?.navigateToSection(nav, { query: q });
        }
      });
    });

    root.querySelectorAll(".today-action-select").forEach((sel) => {
      sel.addEventListener("change", () => {
        const action = sel.value;
        if (!action) return;
        const entryId = sel.dataset.entryId;
        const q = new URLSearchParams({ entryId });
        window.StudentRouter?.navigateToSection(action, { query: q });
        sel.value = "";
      });
    });

    const swipeArea = root.querySelector("#todaySwipeArea");
    if (swipeArea && window.LogbuchSwipe) {
      window.LogbuchSwipe.attach(swipeArea, {
        onSwipeLeft: () => navigateDay(1),
        onSwipeRight: () => navigateDay(-1)
      });
    }
  }

  async function loadDay(dateIso, slideDir = null) {
    state.date = dateIso;
    state.slideDir = slideDir;
    state.loading = true;
    if (!state.data) render();

    try {
      const res = await fetch(`/api/student/log/today?date=${encodeURIComponent(dateIso)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      state.data = data;
      state.loading = false;
      render();
    } catch (err) {
      console.error(err);
      state.loading = false;
      state.data = null;
      render();
    }
  }

  function navigateDay(delta) {
    if (state.loading) return;
    const next = addSchoolDays(state.date || todayIso(), delta);
    const dir = delta > 0 ? "from-right" : "from-left";
    loadDay(next, dir);
  }

  function init() {
    const q = new URLSearchParams(location.search);
    const date = q.get("date") || state.date || todayIso();
    state.data = null;
    if (typeof window.refreshTodayStatus === "function") {
      window.refreshTodayStatus();
    }
    loadDay(date);
  }

  window.LogbuchToday = { init, reload: () => loadDay(state.date || todayIso()) };
})();
