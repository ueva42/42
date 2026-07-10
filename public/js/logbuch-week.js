/**
 * SRL-Logbuch – MEINE WOCHE (Wochenabschluss).
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
    errorMsg: ""
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

  function renderStats(stats, xp) {
    return `
      <div class="week-stats">
        <div class="week-stat"><span class="week-stat-n">${stats.gesetzt}</span><span class="week-stat-l">Ziele gesetzt</span></div>
        <div class="week-stat week-stat-ok"><span class="week-stat-n">${stats.erreicht}</span><span class="week-stat-l">Erreicht</span></div>
        <div class="week-stat week-stat-part"><span class="week-stat-n">${stats.teilweise}</span><span class="week-stat-l">Teilweise</span></div>
        <div class="week-stat week-stat-open"><span class="week-stat-n">${stats.offen}</span><span class="week-stat-l">Offen</span></div>
        <div class="week-stat week-stat-xp"><span class="week-stat-n">${xp}</span><span class="week-stat-l">XP Woche</span></div>
      </div>`;
  }

  function renderTable(rows) {
    const ui = UI();
    if (!rows.length) {
      return `<p class="week-empty">Noch keine Ziele in dieser Woche.</p>`;
    }

    return `
      <section class="week-section">
        <h3 class="week-section-title">Meine Ziele der Woche</h3>
        <table class="week-table">
          <thead>
            <tr>
              <th>Tag</th>
              <th>Fach</th>
              <th>Was-Ziel</th>
              <th>Level</th>
              <th>Ergebnis</th>
            </tr>
          </thead>
          <tbody>
            ${rows
              .map(
                (r) => `
              <tr>
                <td>${ui.escapeHtml(r.weekday)}</td>
                <td>${ui.escapeHtml(r.subject)}</td>
                <td>${ui.escapeHtml(r.whatGoal)}</td>
                <td>${ui.escapeHtml(r.level)}</td>
                <td class="week-achieved">${ui.escapeHtml(r.result)}</td>
              </tr>`
              )
              .join("")}
          </tbody>
        </table>
      </section>`;
  }

  function renderLearnedSection(ui, readonly) {
    if (readonly) {
      const text = state.data.weekReflection?.weekly_learned_text;
      if (!text) return "";
      return `
        <section class="week-section">
          <h3 class="week-section-title">Was habe ich diese Woche gelernt?</h3>
          <p class="week-readonly-text">${ui.escapeHtml(text)}</p>
        </section>`;
    }

    return `
      <section class="week-section">
        ${ui.fieldWrap(
          ui.fieldLabel("Was habe ich diese Woche gelernt?", { optional: true }),
          `<textarea class="logbuch-input logbuch-input-area" id="weekLearnedText" rows="3" maxlength="500"
            placeholder="Diese Woche habe ich gelernt, dass …">${ui.escapeHtml(state.weeklyLearnedText)}</textarea>
           <div class="logbuch-char-count"><span id="weekLearnedCount">${state.weeklyLearnedText.length}</span>/500</div>`,
          "",
          { wide: true }
        )}
      </section>`;
  }

  function renderOpenGoalsSection(ui, openGoals, readonly) {
    const list =
      openGoals?.length > 0
        ? `<ul class="week-open-list">${openGoals
            .map((g) => `<li>${ui.escapeHtml(g.openGoalLabel)}</li>`)
            .join("")}</ul>`
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
      <section class="week-section">
        <h3 class="week-section-title">Was ist noch offen?</h3>
        ${list}
        ${nextWeekField}
      </section>`;
  }

  function renderDistractionsSection(ui, items, levels, readonly) {
    const wasters = readonly ? state.data.weekReflection?.time_wasters || {} : state.timeWasters;

    return `
      <section class="week-section week-matrix">
        <h3 class="week-section-title">Was hat mich beim Lernen gestört?</h3>
        <p class="week-matrix-hint">Wie oft kam das diese Woche vor?</p>
        ${items
          .map((item) => {
            if (readonly) {
              return `
                <div class="week-matrix-row week-matrix-row-readonly">
                  <span class="week-matrix-item">${ui.escapeHtml(item)}</span>
                  <span class="week-matrix-value">${ui.escapeHtml(wasters[item] || "–")}</span>
                </div>`;
            }
            const opts = levels.map((level) => ({ value: level, label: level }));
            return `
              <div class="week-matrix-row">
                <label class="week-matrix-item" for="tw-${ui.escapeHtml(item)}">${ui.escapeHtml(item)}</label>
                ${ui.select(`tw-${item}`, opts, wasters[item], {
                  id: `tw-${item}`,
                  dataField: "timeWaster",
                  dataItem: item,
                  phase: "week",
                  placeholder: "Bitte wählen…"
                })}
              </div>`;
          })
          .join("")}
      </section>`;
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
        <section class="week-section">
          <h3 class="week-section-title">Welche Strategie hat dir diese Woche geholfen?</h3>
          <p class="week-readonly-text"><strong>Strategie:</strong> ${ui.escapeHtml(wr.weekly_helpful_strategy)}</p>
          <p class="week-readonly-text"><strong>Geholfen?</strong> ${ui.escapeHtml(strategyHelpedLabel(wr.weekly_strategy_helped_answer, d.weekStrategyHelped))}</p>
        </section>`;
    }

    const strategyOpts = (d.weekStrategies || []).map((s) => ({ value: s, label: s }));
    const helpedOpts = mapOptions(d.weekStrategyHelped || []);

    return `
      <section class="week-section">
        <h3 class="week-section-title">Welche Strategie hat dir diese Woche geholfen?</h3>
        ${usedHint}
        ${ui.fieldWrap(
          ui.fieldLabel("Strategie", { required: true }),
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
      </section>`;
  }

  function renderPlanSection(ui, d, readonly) {
    const howGoals = howGoalsForSelectedEntry().map((g) => ({ value: g, label: g }));

    if (readonly) {
      const wr = d.weekReflection;
      if (!wr?.next_week_focus_goal_text) return "";
      return `
        <section class="week-section">
          <h3 class="week-section-title">Mein Plan für nächste Woche</h3>
          <p class="week-readonly-text"><strong>Ziel:</strong> ${ui.escapeHtml(wr.next_week_focus_goal_text)}</p>
          <p class="week-readonly-text"><strong>Wie:</strong> ${ui.escapeHtml(wr.next_week_how_goal_text || "–")}</p>
        </section>`;
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
      <section class="week-section">
        <h3 class="week-section-title">Mein Plan für nächste Woche</h3>
        ${ui.fieldWrap(
          ui.fieldLabel("Mein wichtigstes Ziel für nächste Woche", { required: true }),
          focusControl
        )}
        ${ui.fieldWrap(
          ui.fieldLabel("Wie arbeite ich daran?", { required: true }),
          ui.select("nextWeekHowGoalText", howGoals, state.nextWeekHowGoalText, {
            phase: "week",
            placeholder: "Bitte wählen…"
          })
        )}
      </section>`;
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
      <div class="week-shell" id="weekSwipeArea">
        <div class="today-nav">
          <button type="button" class="today-arrow" data-dir="prev" aria-label="Vorherige Woche">‹</button>
          <div class="today-date-wrap">
            <div class="today-date">Meine Woche</div>
            <div class="today-date-sub">${ui.escapeHtml(d.weekLabel)}</div>
          </div>
          <button type="button" class="today-arrow" data-dir="next" aria-label="Nächste Woche">›</button>
        </div>

        <div class="today-slide-viewport">
          <div class="today-slide-panel ${slideClass}" id="weekSlidePanel">
            ${renderStats(d.stats, d.xpThisWeek)}
            ${renderTable(d.rows)}
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
      const res = await fetch(
        `/api/student/log/week?weekStart=${encodeURIComponent(weekStart)}`
      );
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
