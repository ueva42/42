/**
 * SRL-Logbuch – MEINE WOCHE (Aggregation + Zeitfresser-Matrix).
 */
(function () {
  const UI = () => window.LogbuchUI;

  const state = {
    weekStart: null,
    data: null,
    timeWasters: {},
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
      <table class="week-table">
        <thead>
          <tr><th>Tag</th><th>Fach</th><th>Ziel</th><th>✓</th></tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (r) => `
            <tr>
              <td>${ui.escapeHtml(r.weekday)}</td>
              <td>${ui.escapeHtml(r.subject)}</td>
              <td>${ui.escapeHtml(r.goal)}</td>
              <td class="week-achieved">${ui.escapeHtml(r.achieved)}</td>
            </tr>`
            )
            .join("")}
        </tbody>
      </table>`;
  }

  function renderMatrix(items, levels, readonly) {
    const ui = UI();
    const wasters = readonly
      ? state.data.weekReflection?.time_wasters || {}
      : state.timeWasters;

    return `
      <section class="week-matrix">
        <label class="logbuch-label">Zeitfresser-Matrix</label>
        <p class="week-matrix-hint">Wie oft hat dich das diese Woche gestört?</p>
        ${items
          .map((item) => {
            if (readonly) {
              const val = wasters[item] || "–";
              return `
                <div class="week-matrix-row week-matrix-row-readonly">
                  <span class="week-matrix-item">${ui.escapeHtml(item)}</span>
                  <span class="week-matrix-value">${ui.escapeHtml(val)}</span>
                </div>`;
            }
            const opts = levels.map((level) => ({ value: level, label: level }));
            return `
              <div class="week-matrix-row">
                <label class="week-matrix-item" for="tw-${ui.escapeHtml(item)}">${ui.escapeHtml(item)}</label>
                ${ui.select(
                  `tw-${item}`,
                  opts,
                  wasters[item],
                  { id: `tw-${item}`, dataField: "timeWaster", dataItem: item, phase: "week", placeholder: "Bewertung…" }
                )}
              </div>`;
          })
          .join("")}
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
            ${renderMatrix(d.timeWasterItems, d.timeWasterLevels, submitted)}

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

  function bindHandlers(root) {
    root.querySelector('[data-dir="prev"]')?.addEventListener("click", () => navigateWeek(-1));
    root.querySelector('[data-dir="next"]')?.addEventListener("click", () => navigateWeek(1));

    root.querySelectorAll('[data-field="timeWaster"]').forEach((el) => {
      el.addEventListener("change", () => {
        const item = el.dataset.item;
        state.timeWasters[item] = el.value || null;
      });
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
    const items = state.data?.timeWasterItems || [];
    for (const item of items) {
      if (!state.timeWasters[item]) {
        state.errorMsg = "Bitte alle Zeitfresser bewerten.";
        render();
        return;
      }
    }

    state.errorMsg = "";
    state.submitting = true;
    render();

    try {
      const res = await fetch("/api/student/log/week-reflection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          weekStart: state.weekStart,
          timeWasters: state.timeWasters
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
      state.timeWasters = data.weekReflection?.time_wasters
        ? { ...data.weekReflection.time_wasters }
        : emptyWasters(data.timeWasterItems);
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
