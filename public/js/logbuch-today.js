/**
 * SRL-Logbuch – MEIN TAG (Default-Screen, Mo–Fr-Swipe).
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

  function renderPhaseIndicator(phases) {
    const items = [
      { key: "plan", label: "Plan" },
      { key: "check", label: "Check" },
      { key: "reflect", label: "Reflexion" }
    ];

    return `
      <p class="today-phases-inline">
        ${items
          .map(
            (p, i) => `
          <span class="today-phase-inline ${phases[p.key] ? "done" : ""}">
            ${phases[p.key] ? "✓" : "○"} ${p.label}
          </span>${i < items.length - 1 ? '<span class="today-phase-sep">·</span>' : ""}`
          )
          .join("")}
      </p>`;
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

  function visibleBlocks(blocks) {
    return (blocks || []).filter(
      (b) => b?.slot?.subject && b.slot.subject !== "Frei" && !b.isFree
    );
  }

  function renderBlock(block, editable) {
    const ui = UI();
    const slot = block.slot;
    const entry = block.entry;

    if (!entry) {
      if (!editable) {
        return `
          <div class="today-block today-block-empty">
            <div class="today-block-head">
              <span class="today-block-subject">${slot ? ui.escapeHtml(slot.subject) : "Lernzeit"}</span>
              ${slot?.timeslot ? `<span class="today-block-slot">${ui.escapeHtml(slot.timeslot)}</span>` : ""}
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
            <span class="today-block-subject">${slot ? ui.escapeHtml(slot.subject) : "Lernzeit"}</span>
            ${slot?.timeslot ? `<span class="today-block-slot">${ui.escapeHtml(slot.timeslot)}</span>` : ""}
          </div>
          <button type="button" class="btn-primary today-plan-btn"
            data-nav="plan" data-query="${ui.escapeHtml(params.toString())}">
            Tagesziel setzen
          </button>
        </div>`;
    }

    const readOnly = !editable;
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

    const params = new URLSearchParams({ date: state.date });
    if (entry.subject) params.set("subject", entry.subject);
    if (entry.timeslot) params.set("timeslot", entry.timeslot);

    const viewPlanBtn = `
      <button type="button" class="logbuch-btn-ghost today-view-plan-btn"
        data-nav="plan" data-query="${ui.escapeHtml(params.toString())}">
        Tagesziel ansehen
      </button>`;

    const actions = !readOnly ? `${viewPlanBtn}${renderActionSelect(entry)}` : viewPlanBtn;

    const statusBits = [];
    if (entry.hasCheck) statusBits.push("Check ✓");
    if (entry.hasReflection) statusBits.push("Abschluss ✓");
    const statusLine =
      !readOnly && statusBits.length
        ? `<p class="today-block-status">${statusBits.join(" · ")}</p>`
        : "";

    return `
      <div class="today-block today-block-done">
        <div class="today-block-head">
          <span class="today-block-subject">${ui.escapeHtml(entry.subject)}</span>
          ${entry.timeslot ? `<span class="today-block-slot">${ui.escapeHtml(entry.timeslot)}</span>` : ""}
        </div>
        <p class="today-block-goal">${ui.escapeHtml(entry.goal)}</p>
        ${statusLine}
        ${summary}
        ${actions}
      </div>`;
  }

  function emptyMessage(d, editable) {
    if (!d.hasClass) {
      return "Dir ist noch keine Klasse zugeordnet – bitte deine Lehrkraft.";
    }
    const cls = d.className ? ` (${d.className})` : "";
    if (editable) {
      return `Für diesen Tag${cls} sind noch keine Unterrichtsstunden im Stundenplan – deine Lehrkraft trägt sie im Admin-Bereich ein.`;
    }
    return `Keine Unterrichtsstunden an diesem Tag${cls}.`;
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

    const blocksHtml =
      blockList.length > 0
        ? blockList.map((b) => renderBlock(b, editable)).join("")
        : `<p class="today-block-muted">${emptyMessage(d, editable)}</p>`;

    const singleOpen =
      blockList.length === 1 && !blockList[0].entry && editable && blockList[0].slot;
    const blocksClass = singleOpen
      ? "today-blocks today-blocks-single"
      : "today-blocks";

    root.innerHTML = `
      <div class="today-shell" id="todaySwipeArea">
        <div class="today-nav">
          <button type="button" class="today-arrow" data-dir="prev" aria-label="Vorheriger Tag">‹</button>
          <div class="today-date-wrap">
            <div class="today-date">${ui.escapeHtml(d.weekdayLabel)}</div>
            <div class="today-date-sub">${ui.escapeHtml(d.dateLabel)}</div>
          </div>
          <button type="button" class="today-arrow" data-dir="next" aria-label="Nächster Tag">›</button>
        </div>

        ${renderPhaseIndicator(d.phases)}

        <div class="today-slide-viewport">
          <div class="today-slide-panel ${slideClass}" id="todaySlidePanel">
            <div class="${blocksClass}">${blocksHtml}</div>
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
      const res = await fetch(
        `/api/student/log/today?date=${encodeURIComponent(dateIso)}`
      );
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
    loadDay(date);
  }

  window.LogbuchToday = { init, reload: () => loadDay(state.date || todayIso()) };
})();
