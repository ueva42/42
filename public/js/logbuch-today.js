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

  function blockNeedsMidCheck(block, entry) {
    if (block && typeof block.needsMidCheck === "boolean") return block.needsMidCheck;
    if (entry && typeof entry.needsMidCheck === "boolean") return entry.needsMidCheck;
    return true;
  }

  function blockPhases(entry, needsMidCheck = true) {
    return {
      plan: !!entry,
      check: needsMidCheck ? !!entry?.hasCheck : true,
      reflect: !!entry?.hasReflection,
      checkRequired: needsMidCheck
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
      ...(phases.checkRequired === false ? [] : [{ key: "check", label: "Check" }]),
      { key: "reflect", label: "Reflexion" }
    ];
    return items
      .map(
        (p) =>
          `<span class="phase-pill ${phases[p.key] ? "is-done" : ""}">${phases[p.key] ? "✓" : "○"} ${p.label}</span>`
      )
      .join("");
  }

  function renderActionSelect(entry, needsMidCheck) {
    const ui = UI();
    const hasCheck = entry.hasCheck;
    const hasReflection = entry.hasReflection;
    const checkRequired = needsMidCheck !== false;

    if ((checkRequired ? hasCheck : true) && hasReflection) {
      return `<p class="today-block-done-label">Alle Schritte erledigt ✓</p>`;
    }

    let options = `<option value="">Nächster Schritt…</option>`;
    if (checkRequired) {
      if (!hasCheck) {
        options += `<option value="check">Zwischen-Check</option>`;
      } else {
        options += `<option value="" disabled>Check ✓</option>`;
      }
    }
    if (!hasReflection) {
      options += `<option value="reflect">Tagesabschluss</option>`;
    } else {
      options += `<option value="" disabled>Abschluss ✓</option>`;
    }

    return `
      <select class="logbuch-select today-action-select today-app-select" data-entry-id="${ui.escapeHtml(entry.id)}">
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
              ? `<p class="lesson-card__goal"><strong>Mein Weg zum Ziel:</strong> ${ui.escapeHtml(entry.how_goal_text || entry.goal || "")}</p>`
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

  function navButton(label, nav, query, primary = false, className = "") {
    const ui = UI();
    const cls = className || (primary ? "today-app-btn" : "today-app-btn today-app-btn--ghost");
    return `
      <button type="button" class="${cls}" data-nav="${ui.escapeHtml(nav)}" data-query="${ui.escapeHtml(query)}">
        ${ui.escapeHtml(label)} →
      </button>`;
  }

  function primaryAction(entry, editable, needsMidCheck) {
    if (!editable || entry.hasReflection) return null;
    if (needsMidCheck !== false && !entry.hasCheck) {
      return navButton("Zwischen-Check", "check", new URLSearchParams({ entryId: entry.id }).toString(), true);
    }
    return navButton("Tagesabschluss", "reflect", new URLSearchParams({ entryId: entry.id }).toString(), true);
  }

  function appPrimaryButton(label, nav, query) {
    const ui = UI();
    return `
      <button type="button" class="today-app-btn" data-nav="${ui.escapeHtml(nav)}" data-query="${ui.escapeHtml(query)}">
        ${ui.escapeHtml(label)} <span aria-hidden="true">→</span>
      </button>`;
  }

  function nextStepHint(blockList, editable) {
    if (!blockList.length) return "Heute sind keine Stunden eingetragen.";
    if (!editable) return "Schau dir deine Stunden an.";
    for (const block of blockList) {
      const subject = block.entry?.subject || block.slot?.subject || "deiner Stunde";
      if (groupModeForSubject(subject)) {
        return `Als Nächstes: Gruppenarbeit in ${subject} starten oder fortsetzen.`;
      }
      if (!block.entry) return `Setze als Nächstes dein Tagesziel in ${subject}.`;
      if (blockNeedsMidCheck(block, block.entry) && !block.entry.hasCheck) {
        return `Als Nächstes: Zwischen-Check in ${subject}.`;
      }
      if (!block.entry.hasReflection) return `Als Nächstes: Tagesabschluss in ${subject}.`;
    }
    return "Stark – alle Stunden für heute sind erledigt.";
  }

  function lessonStatus(block) {
    if (!block.entry) return { key: "open", label: "Offen" };
    if (block.entry.hasReflection) return { key: "done", label: "Erledigt" };
    return { key: "active", label: "Begonnen" };
  }

  function lessonStepCount(phases) {
    const parts = [phases.plan, phases.reflect];
    if (phases.checkRequired !== false) parts.splice(1, 0, phases.check);
    return parts.filter(Boolean).length;
  }

  function lessonStepTotal(phases) {
    return phases.checkRequired === false ? 2 : 3;
  }

  function mergeGroupModeFromBootstrap(todayData, bootstrap) {
    const map = { ...(todayData.groupModeBySubject || {}) };
    for (const s of bootstrap?.enabledSubjects || []) {
      const key = String(s.subject || "").trim();
      if (!key || !s.enabled) continue;
      if (!map[key]) {
        map[key] = { enabled: true, activeSessionId: null, status: null };
      } else {
        map[key].enabled = true;
      }
    }
    for (const s of bootstrap?.activeSessions || []) {
      const key = Object.keys(map).find(
        (k) => k.toLowerCase() === String(s.subject || "").toLowerCase()
      ) || String(s.subject || "").trim();
      if (!key) continue;
      if (!map[key]) map[key] = { enabled: true, activeSessionId: null, status: null };
      map[key].enabled = true;
      map[key].activeSessionId = s.id;
      map[key].status = s.status;
    }
    todayData.groupModeBySubject = map;
    return todayData;
  }

  function renderTodayOverview(d, blockList, editable) {
    const ui = UI();

    return `
      <section class="today-overview" aria-label="Mein Tag">
        <article class="today-overview-hero">
          <div class="today-overview-hero__content">
            <div class="today-overview-hero__icon" aria-hidden="true">
              <img src="/icons/student/png/mein-tag.png" alt="" aria-hidden="true">
            </div>
            <div class="today-overview-hero__copy">
              <p class="today-overview-hero__eyebrow">Mein Tag</p>
              <h2 class="today-overview-hero__title">${ui.escapeHtml(d.weekdayLabel)} · ${ui.escapeHtml(d.dateLabel)}</h2>
              <p class="today-overview-hero__hint">${ui.escapeHtml(nextStepHint(blockList, editable))}</p>
            </div>
          </div>
          <div class="today-overview-hero__nav">
            <button type="button" class="today-arrow" data-dir="prev" aria-label="Vorheriger Tag">‹</button>
            <button type="button" class="today-arrow" data-dir="next" aria-label="Nächster Tag">›</button>
          </div>
          <div class="today-overview-hero__visual" aria-hidden="true">
            <img src="/icons/student/hero/mein-tag-hero.png?v=6" alt="" aria-hidden="true" loading="lazy">
          </div>
        </article>
      </section>`;
  }

  function groupModeForSubject(subject) {
    const map = state.data?.groupModeBySubject || {};
    if (!subject) return null;
    if (map[subject]?.enabled) return map[subject];
    const key = Object.keys(map).find(
      (s) => String(s).trim().toLowerCase() === String(subject).trim().toLowerCase()
    );
    return key && map[key]?.enabled ? map[key] : null;
  }

  function renderGroupModeBlock(block, editable) {
    const ui = UI();
    const slot = block.slot;
    const subject = slot?.subject || "";
    const gm = groupModeForSubject(subject);
    const params = new URLSearchParams({ subject });
    if (state.date) params.set("date", state.date);
    if (gm?.activeSessionId) params.set("sessionId", gm.activeSessionId);

    const statusLabel = gm?.activeSessionId
      ? gm.status === "setup"
        ? "Einrichtung offen"
        : "Gruppe aktiv"
      : "Gruppenarbeit";

    const cta = !editable
      ? ""
      : gm?.activeSessionId
        ? appPrimaryButton("Gruppenarbeit fortsetzen", "gruppenmodus", params.toString())
        : appPrimaryButton("Gruppenarbeit starten", "gruppenmodus", params.toString());

    return `
      <article class="subject-lesson-card subject-lesson-card--active">
        <div class="subject-lesson-card__top">
          <div class="subject-lesson-card__icon" aria-hidden="true">
            <img src="/icons/student/png/mein-tag.png" alt="" aria-hidden="true">
          </div>
          <div class="subject-lesson-card__meta">
            <div class="subject-lesson-card__head">
              <h3 class="subject-lesson-card__subject">${ui.escapeHtml(subject || "Lernzeit")}</h3>
              <span class="status-badge status-badge--active">${ui.escapeHtml(statusLabel)}</span>
            </div>
            ${slot?.timeslot ? `<span class="subject-lesson-card__time">${ui.escapeHtml(slot.timeslot)}</span>` : ""}
          </div>
        </div>
        <p class="subject-lesson-card__hint">
          In diesem Fach arbeitet ihr gemeinsam in der Gruppe – nicht mit einem einzelnen Tagesziel.
        </p>
        ${cta}
      </article>`;
  }

  function renderBlock(block, editable) {
    const ui = UI();
    const slot = block.slot;
    const entry = block.entry;
    const gm = groupModeForSubject(slot?.subject || entry?.subject);
    if (gm) {
      return renderGroupModeBlock(block, editable);
    }

    const needsMidCheck = blockNeedsMidCheck(block, entry);
    const status = lessonStatus(block);
    const phases = entry
      ? blockPhases(entry, needsMidCheck)
      : { plan: false, check: false, reflect: false, checkRequired: needsMidCheck };
    const stepsDone = lessonStepCount(phases);
    const stepsTotal = lessonStepTotal(phases);
    const V = window.LogbuchVisuals;
    const miniRing = V
      ? V.circularProgress({
          completed: stepsDone,
          total: stepsTotal,
          size: 56,
          accent: status.key === "done" ? "#22c55e" : status.key === "active" ? "#38bdf8" : "#a855f7"
        })
      : "";

    if (!entry) {
      if (!editable) {
        return `
          <article class="subject-lesson-card subject-lesson-card--${status.key}">
            <div class="subject-lesson-card__top">
              <div class="subject-lesson-card__icon" aria-hidden="true">
                <img src="/icons/student/png/mein-tag.png" alt="" aria-hidden="true">
              </div>
              <div class="subject-lesson-card__meta">
                <div class="subject-lesson-card__head">
                  <h3 class="subject-lesson-card__subject">${slot ? ui.escapeHtml(slot.subject) : "Lernzeit"}</h3>
                  <span class="status-badge status-badge--${status.key}">${status.label}</span>
                </div>
                ${slot?.timeslot ? `<span class="subject-lesson-card__time">${ui.escapeHtml(slot.timeslot)}</span>` : ""}
              </div>
              <div class="subject-lesson-card__ring">${miniRing}</div>
            </div>
            <p class="subject-lesson-card__empty">Kein Eintrag</p>
          </article>`;
      }

      const params = new URLSearchParams({ date: state.date });
      if (slot?.subject) params.set("subject", slot.subject);
      if (slot?.timeslot) params.set("timeslot", slot.timeslot);

      return `
        <article class="subject-lesson-card subject-lesson-card--${status.key}">
          <div class="subject-lesson-card__top">
            <div class="subject-lesson-card__icon" aria-hidden="true">
              <img src="/icons/student/png/mein-tag.png" alt="" aria-hidden="true">
            </div>
            <div class="subject-lesson-card__meta">
              <div class="subject-lesson-card__head">
                <h3 class="subject-lesson-card__subject">${slot ? ui.escapeHtml(slot.subject) : "Lernzeit"}</h3>
                <span class="status-badge status-badge--${status.key}">${status.label}</span>
              </div>
              ${slot?.timeslot ? `<span class="subject-lesson-card__time">${ui.escapeHtml(slot.timeslot)}</span>` : ""}
            </div>
            <div class="subject-lesson-card__ring">${miniRing}</div>
          </div>
          ${renderPhaseStepper(phases)}
          <p class="subject-lesson-card__hint">Noch kein Tagesziel gesetzt.</p>
          ${appPrimaryButton("Tagesziel setzen", "plan", params.toString())}
        </article>`;
    }

    const readOnly = !editable;
    const params = new URLSearchParams({ date: state.date });
    if (entry.id) params.set("entryId", entry.id);
    if (entry.subject) params.set("subject", entry.subject);
    if (entry.timeslot) params.set("timeslot", entry.timeslot);

    const checkParams = new URLSearchParams({ entryId: entry.id });
    const reflectParams = new URLSearchParams({ entryId: entry.id });

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

    const primary = primaryAction(entry, editable, needsMidCheck);
    const secondary = [viewPlanBtn, viewCheckBtn, viewReflectBtn].filter(Boolean);
    const checkRequired = needsMidCheck;
    const allDone = (checkRequired ? entry.hasCheck : true) && entry.hasReflection;
    const nextSelect =
      !readOnly && !allDone ? renderActionSelect(entry, needsMidCheck) : "";

    const checkpointHint = entry.checkpoint_title
      ? `<p class="subject-lesson-card__meta">${ui.escapeHtml(entry.checkpoint_title)}</p>`
      : "";

    return `
      <article class="subject-lesson-card subject-lesson-card--${status.key}">
        <div class="subject-lesson-card__top">
          <div class="subject-lesson-card__icon" aria-hidden="true">
            <img src="/icons/student/png/mein-tag.png" alt="" aria-hidden="true">
          </div>
          <div class="subject-lesson-card__meta">
            <div class="subject-lesson-card__head">
              <h3 class="subject-lesson-card__subject">${ui.escapeHtml(entry.subject)}</h3>
              <span class="status-badge status-badge--${status.key}">${status.label}</span>
            </div>
            ${entry.timeslot ? `<span class="subject-lesson-card__time">${ui.escapeHtml(entry.timeslot)}</span>` : ""}
          </div>
          <div class="subject-lesson-card__ring">${miniRing}</div>
        </div>
        ${checkpointHint}
        ${renderPhaseStepper(phases)}
        <div class="subject-lesson-card__body">
          ${renderDailyGoalBody(ui, entry)}
          ${entry.hasCheck ? renderCheckSummary(ui, entry) : ""}
          ${entry.hasReflection ? renderReflectionSummary(ui, entry) : ""}
        </div>
        <div class="subject-lesson-card__actions">
          ${
            primary ||
            (allDone ? `<p class="subject-lesson-card__done">Alle Schritte erledigt ✓</p>` : "")
          }
          ${
            secondary.length
              ? `<div class="subject-lesson-card__secondary">${secondary.join("")}</div>`
              : ""
          }
          ${nextSelect ? `<div class="subject-lesson-card__select">${nextSelect}</div>` : ""}
        </div>
      </article>`;
  }

  function renderPhaseStepper(phases) {
    const items = [
      { key: "plan", label: "Plan" },
      ...(phases.checkRequired === false ? [] : [{ key: "check", label: "Check" }]),
      { key: "reflect", label: "Abschluss" }
    ];
    return `
      <div class="today-lesson-steps" aria-label="Schritte dieser Stunde">
        ${items
          .map((p, index) => {
            const done = phases[p.key];
            const line =
              index < items.length - 1
                ? `<span class="today-lesson-step__line ${done ? "is-done" : ""}" aria-hidden="true"></span>`
                : "";
            return `
              <div class="today-lesson-step ${done ? "is-done" : ""}">
                <span class="today-lesson-step__dot" aria-hidden="true">${done ? "✓" : index + 1}</span>
                <span class="today-lesson-step__label">${p.label}</span>
              </div>${line}`;
          })
          .join("")}
      </div>`;
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
      <div class="student-card empty-state-card dashboard-card">
        <img class="page-hero__image dashboard-card__hero" src="/icons/student/hero/mein-tag-hero.png?v=6" alt="" aria-hidden="true">
        <div class="card-content dashboard-card__content">
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
      <div class="today-day-nav">
        <button type="button" class="today-arrow" data-dir="prev" aria-label="Vorheriger Tag">‹</button>
        <div class="today-day-nav__center">
          <h3 class="today-day-nav__title">${ui.escapeHtml(d.weekdayLabel)}</h3>
          <p class="today-day-nav__sub">${ui.escapeHtml(d.dateLabel)}</p>
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
      <div class="student-page today-shell today-app" id="todaySwipeArea">
        ${blockList.length ? renderTodayOverview(d, blockList, editable) : renderDayNav(d)}

        <div class="today-slide-viewport">
          <div class="today-slide-panel ${slideClass}" id="todaySlidePanel">
            <div class="today-lesson-list">
              ${
                blockList.length
                  ? `<h3 class="today-lesson-list__title">Deine Stunden</h3>${lessonsHtml}`
                  : lessonsHtml
              }
            </div>
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
        if (!nav) return;
        const q = new URLSearchParams(btn.dataset.query || "");
        window.StudentRouter?.navigateToSection(nav, { query: q });
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
      const [todayRes, bootRes] = await Promise.all([
        fetch(`/api/student/log/today?date=${encodeURIComponent(dateIso)}`, {
          credentials: "same-origin",
          cache: "no-store"
        }),
        fetch("/api/student/group-mode/bootstrap", {
          credentials: "same-origin",
          cache: "no-store"
        }).catch(() => null)
      ]);
      if (!todayRes.ok) throw new Error(`HTTP ${todayRes.status}`);
      let data = await todayRes.json();
      if (bootRes && bootRes.ok) {
        const bootstrap = await bootRes.json().catch(() => null);
        if (bootstrap) data = mergeGroupModeFromBootstrap(data, bootstrap);
      }
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
