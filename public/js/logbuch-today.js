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

  function blockPhases(entry) {
    return {
      plan: !!entry,
      check: !!entry?.hasCheck,
      reflect: !!entry?.hasReflection
    };
  }

  function renderPhaseIndicator(phases, className = "today-phases-inline") {
    const items = [
      { key: "plan", label: "Plan" },
      { key: "check", label: "Check" },
      { key: "reflect", label: "Reflexion" }
    ];

    return `
      <p class="${className}">
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

  function renderDailyGoalBody(ui, entry) {
    if (entry.level_goal_text) {
      const meta = [];
      if (entry.what_goal_text) meta.push(entry.what_goal_text);
      if (entry.level_label) meta.push(entry.level_label);
      return `
        <div class="today-focus-card">
          <p class="today-focus-card-title">Dein Tagesziel heute</p>
          ${meta.length ? `<p class="today-focus-meta">${ui.escapeHtml(meta.join(" · "))}</p>` : ""}
          <p><strong>Ich arbeite an diesem Ziel:</strong><br>${ui.escapeHtml(entry.level_goal_text)}</p>
          <p><strong>Mein Weg:</strong><br>${ui.escapeHtml(entry.how_goal_text || entry.goal || "")}</p>
          ${
            entry.details_text
              ? `<p><strong>Konkret:</strong><br>${ui.escapeHtml(entry.details_text)}</p>`
              : ""
          }
          ${
            entry.plan_b_strategy_text
              ? `<p><strong>Plan B, wenn ich hänge:</strong><br>${ui.escapeHtml(entry.plan_b_strategy_text)}</p>`
              : ""
          }
        </div>`;
    }
    const titleText = entry.plan_sentence || entry.goal;
    const detailText = entry.details_text ? `Konkret: ${entry.details_text}` : "";
    return `
      <p class="today-block-goal">${ui.escapeHtml(titleText)}</p>
      ${detailText ? `<p class="today-block-muted">${ui.escapeHtml(detailText)}</p>` : ""}`;
  }

  function renderCheckSummary(ui, entry) {
    const c = entry.check;
    if (!c?.on_track) return "";

    const isLegacy = ["👍", "😐", "👎"].includes(c.on_track);
    if (isLegacy) {
      return `
        <div class="today-focus-card today-check-card">
          <p class="today-focus-card-title">Zwischen-Check</p>
          <p class="today-block-muted">Abgeschlossen (älteres Format)</p>
        </div>`;
    }

    return `
      <div class="today-focus-card today-check-card">
        <p class="today-focus-card-title">Zwischen-Check</p>
        <p><strong>Auf dem Weg:</strong> ${ui.escapeHtml(c.on_track)}</p>
        <p><strong>Verstanden:</strong> ${ui.escapeHtml(c.understands)}</p>
        <p><strong>Fortschritt:</strong> ${ui.escapeHtml(c.progress)}</p>
        <p><strong>Jetzt:</strong> ${ui.escapeHtml(c.next_step_answer || "–")}</p>
        ${
          c.selected_strategy_name
            ? `<p><strong>Gewählte Taktik:</strong> ${ui.escapeHtml(c.selected_strategy_name)}</p>`
            : ""
        }
      </div>`;
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
      <div class="today-focus-card today-reflect-card">
        <p class="today-focus-card-title">Reflexion</p>
        <p><strong>Ziel erreicht:</strong> ${goalAchievedSymbol(r.goal_achieved)} ${ui.escapeHtml(goalText)}</p>
        <p><strong>Sicherheit:</strong> ${entry.confidence_before ?? "–"} → ${r.confidence_after}/5</p>
        ${
          r.used_strategy_name
            ? `<p><strong>Strategie:</strong> ${ui.escapeHtml(r.used_strategy_name)}</p>`
            : ""
        }
        ${
          r.learned_today
            ? `<p><strong>Gelernt:</strong> ${ui.escapeHtml(r.learned_today)}</p>`
            : ""
        }
      </div>`;
  }

  function navButton(label, nav, query, primary = false) {
    const ui = UI();
    const cls = primary ? "btn-primary today-plan-btn" : "logbuch-btn-ghost today-view-plan-btn";
    return `
      <button type="button" class="${cls}" data-nav="${ui.escapeHtml(nav)}" data-query="${ui.escapeHtml(query)}">
        ${ui.escapeHtml(label)}
      </button>`;
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

    const params = new URLSearchParams({ date: state.date });
    if (entry.id) params.set("entryId", entry.id);
    if (entry.subject) params.set("subject", entry.subject);
    if (entry.timeslot) params.set("timeslot", entry.timeslot);

    const checkParams = new URLSearchParams({ entryId: entry.id });
    const reflectParams = new URLSearchParams({ entryId: entry.id });

    const viewPlanBtn = navButton(
      editable && !entry.hasReflection ? "Tagesziel bearbeiten" : "Tagesziel ansehen",
      "plan",
      params.toString(),
      editable && !entry.hasReflection
    );

    const viewCheckBtn = entry.hasCheck
      ? navButton(
          editable && !entry.hasReflection ? "Zwischen-Check bearbeiten" : "Zwischen-Check ansehen",
          "check",
          checkParams.toString()
        )
      : "";

    const viewReflectBtn = entry.hasReflection
      ? navButton(
          editable ? "Reflexion bearbeiten" : "Reflexion ansehen",
          "reflect",
          reflectParams.toString()
        )
      : "";

    const phaseButtons = [viewPlanBtn, viewCheckBtn, viewReflectBtn].filter(Boolean).join("");
    const actions = !readOnly
      ? `<div class="today-phase-actions">${phaseButtons}${renderActionSelect(entry)}</div>`
      : `<div class="today-phase-actions">${phaseButtons}</div>`;

    const goalBody = renderDailyGoalBody(ui, entry);
    const checkBody = entry.hasCheck ? renderCheckSummary(ui, entry) : "";
    const reflectBody = entry.hasReflection ? renderReflectionSummary(ui, entry) : "";
    const checkpointHint = entry.checkpoint_title
      ? `<p class="today-block-muted">${ui.escapeHtml(entry.checkpoint_title)}</p>`
      : "";

    return `
      <div class="today-block today-block-done">
        <div class="today-block-head">
          <span class="today-block-subject">${ui.escapeHtml(entry.subject)}</span>
          ${entry.timeslot ? `<span class="today-block-slot">${ui.escapeHtml(entry.timeslot)}</span>` : ""}
        </div>
        ${goalBody}
        ${checkBody}
        ${reflectBody}
        ${entry.level_goal_text ? "" : checkpointHint}
        ${actions}
      </div>`;
  }

  function renderLesson(block, editable) {
    return `
      <div class="today-lesson">
        ${renderPhaseIndicator(blockPhases(block.entry), "today-lesson-phases")}
        ${renderBlock(block, editable)}
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
        ? blockList.map((b) => renderLesson(b, editable)).join("")
        : `<p class="today-block-muted">${emptyMessage(d, editable)}</p>`;

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

        <div class="today-slide-viewport">
          <div class="today-slide-panel ${slideClass}" id="todaySlidePanel">
            <div class="today-blocks">${blocksHtml}</div>
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
    if (typeof window.refreshTodayStatus === "function") {
      window.refreshTodayStatus();
    }
    loadDay(date);
  }

  window.LogbuchToday = { init, reload: () => loadDay(state.date || todayIso()) };
})();
