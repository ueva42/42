/**
 * SRL-Logbuch – MEIN TAG (Default-Screen, Mo–Fr-Swipe).
 */
(function () {
  const state = {
    date: null,
    data: null,
    loading: false,
    slideDir: null
  };

  function todayIso() {
    return new Date().toISOString().slice(0, 10);
  }

  function escapeHtml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
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

  function renderPhaseIndicator(phases) {
    const items = [
      { key: "plan", label: "Planen", phase: "plan" },
      { key: "check", label: "Check", phase: "check" },
      { key: "reflect", label: "Reflektieren", phase: "reflect" }
    ];

    return `
      <div class="today-phases">
        ${items
          .map(
            (p) => `
          <div class="today-phase today-phase-${p.phase} ${phases[p.key] ? "done" : ""}">
            <span class="today-phase-check">${phases[p.key] ? "✓" : ""}</span>
            <span class="today-phase-label">${p.label}</span>
          </div>`
          )
          .join("")}
      </div>`;
  }

  function renderBlock(block, editable) {
    const slot = block.slot;
    const entry = block.entry;

    if (!entry) {
      if (!editable) {
        return `
          <div class="today-block today-block-empty">
            <div class="today-block-head">
              <span class="today-block-subject">${slot ? escapeHtml(slot.subject) : "Lernzeit"}</span>
              ${slot?.timeslot ? `<span class="today-block-slot">${escapeHtml(slot.timeslot)}</span>` : ""}
            </div>
            <p class="today-block-muted">Kein Eintrag</p>
          </div>`;
      }

      const params = new URLSearchParams({ date: state.date });
      if (slot?.subject) params.set("subject", slot.subject);
      if (slot?.timeslot) params.set("timeslot", slot.timeslot);

      return `
        <div class="today-block today-block-open">
          <div class="today-block-head">
            <span class="today-block-subject">${slot ? escapeHtml(slot.subject) : "Lernzeit"}</span>
            ${slot?.timeslot ? `<span class="today-block-slot">${escapeHtml(slot.timeslot)}</span>` : ""}
          </div>
          <button type="button" class="logbuch-btn logbuch-btn-plan today-plan-btn"
            data-nav="plan" data-query="${escapeHtml(params.toString())}">
            Tagesziel setzen
          </button>
        </div>`;
    }

    const hasCheck = entry.hasCheck;
    const hasReflection = entry.hasReflection;
    const readOnly = !editable;

    let actions = "";
    if (!readOnly) {
      const checkDisabled = hasCheck ? "disabled" : "";
      const reflectDisabled = hasReflection ? "disabled" : "";
      actions = `
        <div class="today-block-actions">
          <button type="button" class="logbuch-btn logbuch-btn-check today-action-btn"
            data-nav="check" data-entry-id="${entry.id}" ${checkDisabled}>
            ${hasCheck ? "Check ✓" : "Zwischen-Check"}
          </button>
          <button type="button" class="logbuch-btn logbuch-btn-reflect today-action-btn"
            data-nav="reflect" data-entry-id="${entry.id}" ${reflectDisabled}>
            ${hasReflection ? "Abschluss ✓" : "Abschluss"}
          </button>
        </div>`;
    }

    let summary = "";
    if (readOnly && entry.reflection) {
      summary = `
        <div class="today-block-summary">
          <span>Erreicht: <b>${goalAchievedSymbol(entry.reflection.goal_achieved)}</b></span>
          <span>Selbstwirksamkeit: ${entry.confidence_before ?? "–"} → ${entry.reflection.confidence_after}</span>
        </div>`;
    } else if (readOnly && entry.hasCheck) {
      summary = `<div class="today-block-summary"><span>Zwischen-Check abgeschlossen</span></div>`;
    }

    return `
      <div class="today-block today-block-done">
        <div class="today-block-head">
          <span class="today-block-subject">${escapeHtml(entry.subject)}</span>
          ${entry.timeslot ? `<span class="today-block-slot">${escapeHtml(entry.timeslot)}</span>` : ""}
        </div>
        <p class="today-block-goal">${escapeHtml(entry.goal)}</p>
        ${summary}
        ${actions}
      </div>`;
  }

  function render() {
    const root = document.getElementById("today-screen-root");
    if (!root) return;

    if (state.loading && !state.data) {
      root.innerHTML = `<div class="logbuch-loading">Lade deinen Tag…</div>`;
      return;
    }

    const d = state.data;
    if (!d) {
      root.innerHTML = `<div class="logbuch-msg logbuch-msg-error">Tag konnte nicht geladen werden.</div>`;
      return;
    }

    const editable = isEditableDate(state.date);
    const slideClass = state.slideDir ? `today-slide-${state.slideDir}` : "";

    const tags =
      d.timetableSubjects?.length > 0
        ? `<div class="today-tags">${d.timetableSubjects
            .map((s) => `<span class="today-tag">${escapeHtml(s)}</span>`)
            .join("")}</div>`
        : "";

    const blocks =
      d.blocks?.length > 0
        ? d.blocks.map((b) => renderBlock(b, editable)).join("")
        : editable
          ? renderBlock({ slot: null, entry: null }, true)
          : `<p class="today-block-muted">Keine Einträge an diesem Tag.</p>`;

    root.innerHTML = `
      <div class="today-shell" id="todaySwipeArea">
        <div class="today-nav">
          <button type="button" class="today-arrow" data-dir="prev" aria-label="Vorheriger Tag">‹</button>
          <div class="today-date-wrap">
            <div class="today-date">${escapeHtml(d.weekdayLabel)}</div>
            <div class="today-date-sub">${escapeHtml(d.dateLabel)}</div>
          </div>
          <button type="button" class="today-arrow" data-dir="next" aria-label="Nächster Tag">›</button>
        </div>

        ${tags}
        ${renderPhaseIndicator(d.phases)}

        <div class="today-slide-viewport">
          <div class="today-slide-panel ${slideClass}" id="todaySlidePanel">
            <div class="today-blocks">${blocks}</div>
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
        if (nav === "plan") {
          const q = new URLSearchParams(btn.dataset.query || "");
          window.StudentRouter?.navigateToSection("plan", { query: q });
          return;
        }
        const entryId = btn.dataset.entryId;
        if (!entryId || btn.disabled) return;
        const q = new URLSearchParams({ entryId });
        window.StudentRouter?.navigateToSection(nav, { query: q });
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
      const res = await fetch(
        `/api/student/log/today?date=${encodeURIComponent(dateIso)}`
      );
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
    loadDay(date);
  }

  window.LogbuchToday = { init, reload: () => loadDay(state.date || todayIso()) };
})();
