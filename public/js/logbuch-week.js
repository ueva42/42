/**
 * SRL-Logbuch – MEINE WOCHE (App-Card Layout).
 */
(function () {
  const UI = () => window.LogbuchUI;

  const state = {
    weekStart: null,
    data: null,
    timeWasters: {},
    weeklyLearnedText: "",
    nextWeekGoalId: null,
    nextWeekGoalText: "",
    weeklyHelpfulStrategy: null,
    weeklyStrategyHelpedAnswer: null,
    nextWeekFocusGoalText: "",
    nextWeekHowGoalText: "",
    loading: false,
    submitting: false,
    slideDir: null,
    errorMsg: "",
    selectedDay: "all"
  };

  function todayIso() {
    return new Date().toISOString().slice(0, 10);
  }

  function mondayOfWeek(dateIso) {
    const d = new Date(`${dateIso}T12:00:00`);
    const jsDay = d.getDay();
    const diff = jsDay === 0 ? -6 : 1 - jsDay;
    d.setDate(d.getDate() + diff);
    return d.toISOString().slice(0, 10);
  }

  function addWeeks(dateIso, delta) {
    const d = new Date(`${dateIso}T12:00:00`);
    d.setDate(d.getDate() + delta * 7);
    return mondayOfWeek(d.toISOString().slice(0, 10));
  }

  function emptyWasters(items) {
    const obj = {};
    (items || []).forEach((item) => {
      obj[item] = null;
    });
    return obj;
  }

  function mapOptions(items) {
    return (items || []).map((item) => ({
      value: item.id ?? item.value ?? item,
      label: item.label ?? item
    }));
  }

  function strategyHelpedLabel(id, items) {
    const hit = (items || []).find((x) => x.id === id);
    return hit?.label || id || "–";
  }

  function openGoalsSummaryText(openGoals) {
    if (!openGoals?.length) return "Diese Woche ist kein Ziel offen geblieben.";
    return openGoals.map((g) => g.openGoalLabel).join("\n");
  }

  function howGoalsForSelectedEntry() {
    const d = state.data;
    if (!d) return d?.howGoals || [];
    if (state.nextWeekGoalId) {
      const row = d.rows.find((r) => String(r.entryId) === String(state.nextWeekGoalId));
      if (row?.subject && d.howGoalsBySubject?.[row.subject]?.length) {
        return d.howGoalsBySubject[row.subject];
      }
    }
    return d.howGoals || [];
  }

  function goalCardClass(row) {
    if (row.goalAchieved === "ja") return "goal-card--ok";
    if (row.goalAchieved === "teilweise") return "goal-card--part";
    return "goal-card--open";
  }

  function badgeClass(row) {
    if (row.goalAchieved === "ja") return "status-badge--ok";
    if (row.goalAchieved === "teilweise") return "status-badge--part";
    return "status-badge--open";
  }

  function applyReflectionToState(reflection) {
    if (!reflection) return;
    state.weeklyLearnedText = reflection.weekly_learned_text || "";
    state.nextWeekGoalId = reflection.next_week_goal_id || null;
    state.nextWeekGoalText = reflection.next_week_goal_text || "";
    state.weeklyHelpfulStrategy = reflection.weekly_helpful_strategy || null;
    state.weeklyStrategyHelpedAnswer = reflection.weekly_strategy_helped_answer || null;
    state.nextWeekFocusGoalText = reflection.next_week_focus_goal_text || "";
    state.nextWeekHowGoalText = reflection.next_week_how_goal_text || "";
    if (reflection.time_wasters) {
      state.timeWasters = { ...reflection.time_wasters };
    }
  }

  function renderStats(stats, xp, rows) {
    const V = window.LogbuchVisuals;
    const total = stats.gesetzt || 0;

    const statHtml = V
      ? V.statCards([
          { value: stats.gesetzt, label: "Ziele gesetzt", accent: true },
          { value: stats.erreicht, label: "Erreicht" },
          { value: stats.teilweise, label: "Teilweise" },
          { value: stats.offen, label: "Offen" },
          { value: xp, label: "XP Woche", accent: true }
        ])
      : "";

    if (!V) return statHtml;

    const byDay = ["Mo", "Di", "Mi", "Do", "Fr"].map((day) => ({
      label: day,
      value: (rows || []).filter((r) => r.weekday === day).length
    }));

    const erreicht = stats.erreicht || 0;
    const teilweise = stats.teilweise || 0;
    const offen = stats.offen || 0;

    return (
      V.progressPanel({
        radial: V.circularProgress({
          completed: erreicht,
          total,
          label: "Wochenfortschritt",
          sublabel: `${erreicht} von ${total || 0} Zielen erreicht`,
          accent: "#a855f7",
          size: 128
        }),
        stats: statHtml,
        chartTitle: "Ziele pro Tag",
        chart: V.miniBarChart(byDay)
      }) +
      `<div class="week-status-circles">
        ${V.circularProgress({ completed: erreicht, total, label: "Erreicht", size: 92, accent: "#22c55e" })}
        ${V.circularProgress({ completed: teilweise, total, label: "Teilweise", size: 92, accent: "#f59e0b" })}
        ${V.circularProgress({ completed: offen, total, label: "Offen", size: 92, accent: "#64748b" })}
      </div>`
    );
  }

  function renderWeekNav(d) {
    const ui = UI();
    return `
      <div class="student-card day-nav-card">
        <button type="button" class="today-arrow" data-dir="prev" aria-label="Vorherige Woche">‹</button>
        <div class="day-nav-card__center">
          <h3 class="day-nav-card__title">Meine Woche</h3>
          <p class="day-nav-card__sub">${ui.escapeHtml(d.weekLabel)}</p>
        </div>
        <button type="button" class="today-arrow" data-dir="next" aria-label="Nächste Woche">›</button>
      </div>`;
  }

  function renderDayBar(rows) {
    const ui = UI();
    const days = ["Mo", "Di", "Mi", "Do", "Fr"];
    const todayShort = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"][new Date(`${todayIso()}T12:00:00`).getDay()];
    const counts = {};
    days.forEach((d) => {
      counts[d] = rows.filter((r) => r.weekday === d).length;
    });

    const chips = [
      `<button type="button" class="day-chip ${state.selectedDay === "all" ? "is-active" : ""}" data-week-day="all">Alle</button>`
    ]
      .concat(
        days.map((day) => {
          const active = state.selectedDay === day;
          const today = day === todayShort;
          const dot = counts[day] > 0 ? `<span class="day-chip__dot" aria-hidden="true"></span>` : "";
          return `
            <button type="button"
              class="day-chip ${active ? "is-active" : ""} ${today ? "is-today" : ""}"
              data-week-day="${ui.escapeHtml(day)}">
              ${ui.escapeHtml(day)}${dot}
            </button>`;
        })
      )
      .join("");

    return `
      <div class="student-card">
        <div class="card-content">
          <h3 class="section-block__title">Wochentage</h3>
          <div class="day-chip-bar">${chips}</div>
        </div>
      </div>`;
  }

  function filteredRows(rows) {
    if (state.selectedDay === "all") return rows;
    return rows.filter((r) => r.weekday === state.selectedDay);
  }

  function renderGoalCards(rows) {
    const ui = UI();
    const visible = filteredRows(rows);

    if (!rows.length) {
      return `
        <div class="student-card empty-state-card dashboard-card">
          <img class="page-hero__image dashboard-card__hero" src="/icons/student/hero/meine-woche-hero.png" alt="" aria-hidden="true">
          <div class="card-content dashboard-card__content">
            <p class="empty-state-card__eyebrow">Keine Ziele</p>
            <h3 class="empty-state-card__title">Noch keine Ziele in dieser Woche.</h3>
            <p class="empty-state-card__text">Setze in „Mein Tag“ Tagesziele – sie erscheinen hier in deiner Wochenübersicht.</p>
          </div>
        </div>`;
    }

    if (!visible.length) {
      return `
        <div class="student-card empty-state-card">
          <div class="card-content">
            <p class="empty-state-card__title">An diesem Tag keine Ziele.</p>
            <p class="empty-state-card__text">Wähle einen anderen Tag oder „Alle“.</p>
          </div>
        </div>`;
    }

    return `
      <div class="goal-card-grid">
        ${visible
          .map(
            (r) => `
          <article class="goal-card ${goalCardClass(r)}">
            <p class="goal-card__subject">${ui.escapeHtml(r.subject)}</p>
            <p class="goal-card__what">${ui.escapeHtml(r.whatGoal)}</p>
            <div class="goal-card__meta">
              <span class="status-badge ${badgeClass(r)}">${ui.escapeHtml(r.result)}</span>
              <span>Level: ${ui.escapeHtml(r.level)}</span>
              <span>${ui.escapeHtml(r.weekday)}</span>
            </div>
          </article>`
          )
          .join("")}
      </div>`;
  }

  function renderLearnedSection(ui, readonly) {
    if (readonly) {
      const text = state.data.weekReflection?.weekly_learned_text;
      if (!text) return "";
      return `
        <div class="student-card week-form-card">
          <div class="card-content">
            <h3 class="section-block__title">Was habe ich diese Woche gelernt?</h3>
            <p class="week-readonly-text">${ui.escapeHtml(text)}</p>
          </div>
        </div>`;
    }

    return `
      <div class="student-card week-form-card">
        <div class="card-content">
          <h3 class="section-block__title">Was habe ich diese Woche gelernt?</h3>
          ${ui.fieldWrap(
            ui.fieldLabel("Deine Erkenntnis", { optional: true }),
            `<textarea class="logbuch-input logbuch-input-area" id="weekLearnedText" rows="3" maxlength="500"
              placeholder="Diese Woche habe ich gelernt, dass …">${ui.escapeHtml(state.weeklyLearnedText)}</textarea>
             <div class="logbuch-char-count"><span id="weekLearnedCount">${state.weeklyLearnedText.length}</span>/500</div>`,
            "",
            { wide: true }
          )}
        </div>
      </div>`;
  }

  function renderOpenGoalsSection(ui, openGoals, readonly) {
    const chips =
      openGoals?.length > 0
        ? `<div class="open-goal-chips">${openGoals
            .map((g) => `<span class="open-goal-chip">${ui.escapeHtml(g.openGoalLabel)}</span>`)
            .join("")}</div>`
        : `<p class="week-open-empty">Diese Woche ist kein Ziel offen geblieben.</p>`;

    let nextWeekField = "";
    if (!readonly) {
      const options = (openGoals || []).map((g) => ({
        value: g.entryId,
        label: g.openGoalLabel
      }));
      if (!options.length) {
        options.push({
          value: "__new__",
          label: "Ich starte nächste Woche mit einem neuen Ziel."
        });
      }
      nextWeekField = ui.fieldWrap(
        ui.fieldLabel("Woran arbeite ich nächste Woche weiter?"),
        ui.select(
          "nextWeekGoalId",
          options,
          state.nextWeekGoalId || (options[0]?.value ?? null),
          { phase: "week", placeholder: "Bitte wählen…" }
        )
      );
    } else if (state.data.weekReflection?.next_week_goal_text) {
      nextWeekField = `<p class="week-readonly-text"><strong>Nächste Woche:</strong> ${ui.escapeHtml(state.data.weekReflection.next_week_goal_text)}</p>`;
    }

    return `
      <div class="student-card week-form-card">
        <div class="card-content">
          <h3 class="section-block__title">Was ist noch offen?</h3>
          ${chips}
          ${nextWeekField}
        </div>
      </div>`;
  }

  function renderDistractionsSection(ui, items, levels, readonly) {
    const wasters = readonly ? state.data.weekReflection?.time_wasters || {} : state.timeWasters;

    const chips = items
      .map((item) => {
        if (readonly) {
          return `
            <div class="reflection-chip">
              <span class="reflection-chip__label">${ui.escapeHtml(item)}</span>
              <span class="reflection-chip__value">${ui.escapeHtml(wasters[item] || "–")}</span>
            </div>`;
        }
        const opts = levels.map((level) => ({ value: level, label: level }));
        return `
          <div class="reflection-chip">
            <label class="reflection-chip__label" for="tw-${ui.escapeHtml(item)}">${ui.escapeHtml(item)}</label>
            ${ui.select(`tw-${item}`, opts, wasters[item], {
              id: `tw-${item}`,
              dataField: "timeWaster",
              dataItem: item,
              phase: "week",
              placeholder: "Bitte wählen…"
            })}
          </div>`;
      })
      .join("");

    return `
      <div class="student-card week-form-card">
        <div class="card-content">
          <h3 class="section-block__title">Was hat mich beim Lernen gestört?</h3>
          <p class="week-matrix-hint">Wie oft kam das diese Woche vor?</p>
          <div class="reflection-chip-grid">${chips}</div>
        </div>
      </div>`;
  }

  function renderStrategySection(ui, d, readonly) {
    const usedHint =
      d.usedStrategies?.length > 0
        ? `<p class="week-strategy-hint">Diese Woche genutzt: ${ui.escapeHtml(d.usedStrategies.join(", "))}</p>`
        : "";

    if (readonly) {
      const wr = d.weekReflection;
      if (!wr?.weekly_helpful_strategy) return "";
      return `
        <div class="student-card week-form-card">
          <div class="card-content">
            <h3 class="section-block__title">Strategie der Woche</h3>
            <p class="week-readonly-text"><strong>Strategie:</strong> ${ui.escapeHtml(wr.weekly_helpful_strategy)}</p>
            <p class="week-readonly-text"><strong>Geholfen?</strong> ${ui.escapeHtml(strategyHelpedLabel(wr.weekly_strategy_helped_answer, d.weekStrategyHelped))}</p>
          </div>
        </div>`;
    }

    const strategyOpts = (d.weekStrategies || []).map((s) => ({ value: s, label: s }));
    const helpedOpts = mapOptions(d.weekStrategyHelped || []);

    return `
      <div class="student-card week-form-card">
        <div class="card-content">
          <h3 class="section-block__title">Strategie der Woche</h3>
          ${usedHint}
          ${ui.fieldWrap(
            ui.fieldLabel("Welche Strategie hat dir geholfen?", { required: true }),
            ui.select("weeklyHelpfulStrategy", strategyOpts, state.weeklyHelpfulStrategy, {
              phase: "week",
              placeholder: "Bitte wählen…"
            })
          )}
          ${ui.fieldWrap(
            ui.fieldLabel("Hat sie geholfen?", { required: true }),
            ui.select(
              "weeklyStrategyHelpedAnswer",
              helpedOpts,
              state.weeklyStrategyHelpedAnswer,
              { phase: "week", placeholder: "Bitte wählen…" }
            )
          )}
        </div>
      </div>`;
  }

  function renderPlanSection(ui, d, readonly) {
    const howGoals = howGoalsForSelectedEntry().map((g) => ({ value: g, label: g }));

    if (readonly) {
      const wr = d.weekReflection;
      if (!wr?.next_week_focus_goal_text) return "";
      return `
        <div class="student-card week-form-card">
          <div class="card-content">
            <h3 class="section-block__title">Plan für nächste Woche</h3>
            <p class="week-readonly-text"><strong>Ziel:</strong> ${ui.escapeHtml(wr.next_week_focus_goal_text)}</p>
            <p class="week-readonly-text"><strong>Wie:</strong> ${ui.escapeHtml(wr.next_week_how_goal_text || "–")}</p>
          </div>
        </div>`;
    }

    const hasOpen = (d.openGoals || []).length > 0;
    const focusControl = hasOpen
      ? ui.select(
          "nextWeekFocusGoalText",
          (d.openGoals || []).map((g) => ({ value: g.openGoalLabel, label: g.openGoalLabel })),
          state.nextWeekFocusGoalText ||
            (state.nextWeekGoalId
              ? d.openGoals.find((g) => String(g.entryId) === String(state.nextWeekGoalId))?.openGoalLabel
              : d.openGoals[0]?.openGoalLabel),
          { phase: "week", placeholder: "Bitte wählen…" }
        )
      : `<input type="text" class="logbuch-input" id="weekFocusGoalFree" maxlength="300"
          placeholder="Mein wichtigstes Ziel für nächste Woche …"
          value="${ui.escapeHtml(state.nextWeekFocusGoalText)}">`;

    return `
      <div class="student-card week-form-card">
        <div class="card-content">
          <h3 class="section-block__title">Plan für nächste Woche</h3>
          ${ui.fieldWrap(
            ui.fieldLabel("Mein wichtigstes Ziel", { required: true }),
            focusControl
          )}
          ${ui.fieldWrap(
            ui.fieldLabel("Wie arbeite ich daran?", { required: true }),
            ui.select("nextWeekHowGoalText", howGoals, state.nextWeekHowGoalText, {
              phase: "week",
              placeholder: "Bitte wählen…"
            })
          )}
        </div>
      </div>`;
  }

  function render() {
    const root = document.getElementById("week-screen-root");
    if (!root) return;
    const ui = UI();

    if (state.loading && !state.data) {
      root.innerHTML = `<div class="logbuch-loading">Lade Woche…</div>`;
      return;
    }

    const d = state.data;
    if (!d) {
      root.innerHTML = ui.msg("Woche konnte nicht geladen werden.");
      return;
    }

    const submitted = !!d.weekReflection;
    const slideClass = state.slideDir ? `today-slide-${state.slideDir}` : "";

    root.innerHTML = `
      <div class="student-page week-shell" id="weekSwipeArea">
        ${renderWeekNav(d)}
        ${renderStats(d.stats, d.xpThisWeek, d.rows)}

        <div class="today-slide-viewport">
          <div class="today-slide-panel ${slideClass}" id="weekSlidePanel">
            <section class="page-grid">
              ${renderDayBar(d.rows)}
              <div class="section-block">
                <h3 class="section-block__title">Ziele der Woche</h3>
                ${renderGoalCards(d.rows)}
              </div>
              ${renderLearnedSection(ui, submitted)}
              ${renderOpenGoalsSection(ui, d.openGoals, submitted)}
              ${renderDistractionsSection(ui, d.timeWasterItems, d.timeWasterLevels, submitted)}
              ${renderStrategySection(ui, d, submitted)}
              ${renderPlanSection(ui, d, submitted)}

              ${
                submitted
                  ? `<div class="logbuch-msg logbuch-msg-info">Wochenreflexion abgeschlossen ✓</div>`
                  : `
                ${state.errorMsg ? ui.msg(state.errorMsg) : ""}
                ${ui.btnPrimary(
                  state.submitting ? "Speichern…" : "Wochenreflexion abschließen (+10 XP)",
                  "weekSubmitBtn",
                  state.submitting,
                  "logbuch-submit-full"
                )}`
              }
            </section>
          </div>
        </div>
      </div>`;

    bindHandlers(root);

    if (state.slideDir) {
      const panel = root.querySelector("#weekSlidePanel");
      requestAnimationFrame(() => {
        panel?.classList.remove(`today-slide-${state.slideDir}`);
        state.slideDir = null;
      });
    }
  }

  function syncNextWeekFromSelection() {
    const d = state.data;
    if (!d) return;

    if (state.nextWeekGoalId === "__new__" || !state.nextWeekGoalId) {
      state.nextWeekGoalText = "Ich starte nächste Woche mit einem neuen Ziel.";
      state.nextWeekFocusGoalText = state.nextWeekFocusGoalText || "";
      return;
    }

    const row = d.openGoals.find((g) => String(g.entryId) === String(state.nextWeekGoalId));
    if (row) {
      state.nextWeekGoalText = row.openGoalLabel;
      if (!state.nextWeekFocusGoalText) {
        state.nextWeekFocusGoalText = row.openGoalLabel;
      }
    }
  }

  function bindHandlers(root) {
    root.querySelector('[data-dir="prev"]')?.addEventListener("click", () => navigateWeek(-1));
    root.querySelector('[data-dir="next"]')?.addEventListener("click", () => navigateWeek(1));

    root.querySelectorAll("[data-week-day]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.selectedDay = btn.dataset.weekDay;
        render();
      });
    });

    UI().bindSelects(root, state, (field) => {
      if (field === "nextWeekGoalId") {
        syncNextWeekFromSelection();
        render();
      }
      if (field === "nextWeekFocusGoalText" && state.nextWeekFocusGoalText) {
        state.nextWeekGoalText = state.nextWeekFocusGoalText;
      }
    });

    root.querySelectorAll('[data-field="timeWaster"]').forEach((el) => {
      el.addEventListener("change", () => {
        state.timeWasters[el.dataset.item] = el.value || null;
      });
    });

    const learned = root.querySelector("#weekLearnedText");
    learned?.addEventListener("input", () => {
      state.weeklyLearnedText = learned.value.slice(0, 500);
      const count = root.querySelector("#weekLearnedCount");
      if (count) count.textContent = String(state.weeklyLearnedText.length);
    });

    const focusFree = root.querySelector("#weekFocusGoalFree");
    focusFree?.addEventListener("input", () => {
      state.nextWeekFocusGoalText = focusFree.value.slice(0, 300);
      state.nextWeekGoalText = state.nextWeekFocusGoalText;
    });

    root.querySelector("#weekSubmitBtn")?.addEventListener("click", submitWeek);

    const swipeArea = root.querySelector("#weekSwipeArea");
    if (swipeArea && window.LogbuchSwipe) {
      window.LogbuchSwipe.attach(swipeArea, {
        onSwipeLeft: () => navigateWeek(1),
        onSwipeRight: () => navigateWeek(-1)
      });
    }
  }

  async function submitWeek() {
    syncNextWeekFromSelection();

    state.errorMsg = "";
    state.submitting = true;
    render();

    const openSummary = openGoalsSummaryText(state.data?.openGoals);

    try {
      const res = await fetch("/api/student/log/week-reflection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          weekStart: state.weekStart,
          timeWasters: state.timeWasters,
          weeklyLearnedText: state.weeklyLearnedText.trim() || null,
          openGoalsSummary: openSummary,
          nextWeekGoalId: state.nextWeekGoalId === "__new__" ? null : state.nextWeekGoalId,
          nextWeekGoalText: state.nextWeekGoalText || state.nextWeekFocusGoalText || null,
          weeklyHelpfulStrategy: state.weeklyHelpfulStrategy,
          weeklyStrategyHelpedAnswer: state.weeklyStrategyHelpedAnswer,
          nextWeekFocusGoalText: state.nextWeekFocusGoalText,
          nextWeekHowGoalText: state.nextWeekHowGoalText
        })
      });

      const data = await res.json();

      if (!data.success) {
        state.submitting = false;
        state.errorMsg = data.message || "Speichern fehlgeschlagen.";
        render();
        return;
      }

      if (typeof window.loadMe === "function") {
        await window.loadMe();
      }

      await loadWeek(state.weekStart);
      state.submitting = false;
    } catch (err) {
      console.error(err);
      state.submitting = false;
      state.errorMsg = "Netzwerkfehler – bitte erneut versuchen.";
      render();
    }
  }

  function resetFormState(data) {
    state.weeklyLearnedText = "";
    state.nextWeekGoalId = null;
    state.nextWeekGoalText = "";
    state.weeklyHelpfulStrategy = null;
    state.weeklyStrategyHelpedAnswer = null;
    state.nextWeekFocusGoalText = "";
    state.nextWeekHowGoalText = "";
    state.selectedDay = "all";
    state.timeWasters = data.weekReflection?.time_wasters
      ? { ...data.weekReflection.time_wasters }
      : emptyWasters(data.timeWasterItems);

    if (data.weekReflection) {
      applyReflectionToState(data.weekReflection);
      return;
    }

    if (data.openGoals?.length) {
      state.nextWeekGoalId = data.openGoals[0].entryId;
      state.nextWeekGoalText = data.openGoals[0].openGoalLabel;
      state.nextWeekFocusGoalText = data.openGoals[0].openGoalLabel;
    } else {
      state.nextWeekGoalId = "__new__";
      state.nextWeekGoalText = "Ich starte nächste Woche mit einem neuen Ziel.";
    }
  }

  async function loadWeek(weekStart, slideDir = null) {
    state.weekStart = weekStart;
    state.slideDir = slideDir;
    state.loading = true;
    if (!state.data) render();

    try {
      const res = await fetch(`/api/student/log/week?weekStart=${encodeURIComponent(weekStart)}`);
      const data = await res.json();
      state.data = data;
      resetFormState(data);
      state.loading = false;
      state.errorMsg = "";
      render();
    } catch (err) {
      console.error(err);
      state.loading = false;
      state.data = null;
      render();
    }
  }

  function navigateWeek(delta) {
    if (state.loading) return;
    const next = addWeeks(state.weekStart || mondayOfWeek(todayIso()), delta);
    const dir = delta > 0 ? "from-right" : "from-left";
    loadWeek(next, dir);
  }

  function init() {
    const q = new URLSearchParams(location.search);
    const weekStart = q.get("weekStart") || mondayOfWeek(state.weekStart || todayIso());
    state.data = null;
    loadWeek(weekStart);
  }

  window.LogbuchWeek = { init };
})();
