/**
 * SRL-Logbuch – Meine Checks (Kalender + anstehende Termine).
 */
(function () {
  const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

  const TYPE_COLORS = {
    klassenarbeit: "#22d3ee",
    test: "#38bdf8",
    levelcheck: "#a855f7",
    praesentation: "#d946ef",
    custom: "#22c55e"
  };

  const state = {
    data: null,
    selectedSubject: "",
    selectedType: "all",
    month: "",
    selectedDay: null,
    pastOpen: false,
    loading: false,
    error: ""
  };

  let initPromise = null;
  let initGeneration = 0;

  function escapeHtml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function currentMonth() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }

  function todayIso() {
    return state.data?.today || new Date().toISOString().slice(0, 10);
  }

  function monthLabel(month) {
    const [y, m] = String(month || currentMonth()).split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString("de-DE", {
      month: "long",
      year: "numeric"
    });
  }

  function shiftMonth(month, delta) {
    const [y, m] = String(month || currentMonth()).split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }

  function buildMonthGrid(month) {
    const [y, m] = String(month || currentMonth()).split("-").map(Number);
    const first = new Date(y, m - 1, 1);
    const lastDay = new Date(y, m, 0).getDate();
    const startOffset = (first.getDay() + 6) % 7;
    const cells = [];
    for (let i = 0; i < startOffset; i++) cells.push(null);
    for (let day = 1; day <= lastDay; day++) {
      cells.push(`${month}-${String(day).padStart(2, "0")}`);
    }
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }

  function typeColor(type) {
    return TYPE_COLORS[type] || TYPE_COLORS.custom;
  }

  function allEvents() {
    const byDate = state.data?.allEventsByDate || state.data?.eventsByDate || {};
    return Object.values(byDate).flat();
  }

  function matchesFilters(event) {
    if (state.selectedType !== "all" && event.type !== state.selectedType) return false;
    return true;
  }

  function upcomingEvents() {
    const today = todayIso();
    return allEvents()
      .filter((e) => matchesFilters(e) && e.date >= today)
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  function pastEvents() {
    const today = todayIso();
    return allEvents()
      .filter((e) => matchesFilters(e) && e.date < today)
      .sort((a, b) => b.date.localeCompare(a.date));
  }

  function monthByDate() {
    const map = {};
    for (const event of state.data?.events || []) {
      if (!matchesFilters(event)) continue;
      if (!map[event.date]) map[event.date] = [];
      map[event.date].push(event);
    }
    return map;
  }

  function formatDate(iso) {
    if (!iso) return "–";
    const d = new Date(`${iso}T12:00:00`);
    if (!Number.isFinite(d.getTime())) return iso;
    return d.toLocaleDateString("de-DE", {
      weekday: "short",
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    });
  }

  function renderFilters() {
    const subjects = state.data?.subjectsWithTopics?.length
      ? state.data.subjectsWithTopics
      : [];
    const types = state.data?.checkpointTypeOptions || [];

    return `
      <section class="mcp-filters">
        <div class="mcp-filter-row">
          <button type="button" class="mcp-chip ${!state.selectedSubject ? "is-on" : ""}" data-mcp-subject="">Alle Fächer</button>
          ${subjects
            .map(
              (s) =>
                `<button type="button" class="mcp-chip ${state.selectedSubject === s ? "is-on" : ""}" data-mcp-subject="${escapeHtml(s)}">${escapeHtml(s)}</button>`
            )
            .join("")}
        </div>
        <div class="mcp-filter-row">
          <button type="button" class="mcp-chip ${state.selectedType === "all" ? "is-on" : ""}" data-mcp-type="all">Alle Arten</button>
          ${types
            .map(
              (t) =>
                `<button type="button" class="mcp-chip ${state.selectedType === t.value ? "is-on" : ""}" data-mcp-type="${escapeHtml(t.value)}">${escapeHtml(t.label)}</button>`
            )
            .join("")}
        </div>
      </section>`;
  }

  function renderNextCard() {
    const next = upcomingEvents()[0];
    if (!next) {
      return `
        <section class="mcp-next mcp-next--empty">
          <p class="mcp-kicker">Als Nächstes</p>
          <h3>Kein Termin geplant</h3>
          <p>Deine Lehrkraft trägt Checks im Levelplan ein.</p>
        </section>`;
    }
    return `
      <section class="mcp-next">
        <p class="mcp-kicker">Als Nächstes</p>
        <div class="mcp-next__row">
          <div>
            <p class="mcp-next__subject">${escapeHtml(next.subject)}</p>
            <h3 class="mcp-next__title">${escapeHtml(next.title)}</h3>
            <p class="mcp-next__meta">${escapeHtml(next.typeLabel || next.type)} · ${escapeHtml(formatDate(next.date))}</p>
          </div>
          <span class="mcp-pill" style="--mcp-c:${typeColor(next.type)}">${escapeHtml(next.typeLabel || "Check")}</span>
        </div>
      </section>`;
  }

  function renderCalendar() {
    const month = state.month || currentMonth();
    const byDate = monthByDate();
    const today = todayIso();
    const cells = buildMonthGrid(month);
    const weeks = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

    return `
      <section class="mcp-cal">
        <div class="mcp-cal__head">
          <button type="button" class="mcp-nav" id="mcpPrev" aria-label="Vorheriger Monat">‹</button>
          <div class="mcp-cal__center">
            <h3>${escapeHtml(monthLabel(month))}</h3>
            <button type="button" class="mcp-today" id="mcpToday">Heute</button>
          </div>
          <button type="button" class="mcp-nav" id="mcpNext" aria-label="Nächster Monat">›</button>
        </div>
        <table class="mcp-cal__table" role="grid" aria-label="${escapeHtml(monthLabel(month))}">
          <thead>
            <tr>${WEEKDAYS.map((d) => `<th scope="col">${d}</th>`).join("")}</tr>
          </thead>
          <tbody>
            ${weeks
              .map(
                (week) => `
              <tr>
                ${week
                  .map((iso) => {
                    if (!iso) return `<td class="mcp-cell mcp-cell--empty"></td>`;
                    const events = byDate[iso] || [];
                    const isToday = iso === today;
                    const selected = state.selectedDay === iso;
                    const dots = [...new Set(events.map((e) => e.type))]
                      .slice(0, 3)
                      .map(
                        (t) =>
                          `<span class="mcp-dot" style="background:${typeColor(t)}"></span>`
                      )
                      .join("");
                    return `
                      <td class="mcp-cell ${isToday ? "is-today" : ""} ${selected ? "is-selected" : ""} ${events.length ? "has-events" : ""}">
                        <button type="button" class="mcp-daybtn" data-mcp-day="${escapeHtml(iso)}">
                          <span class="mcp-daybtn__n">${Number(iso.slice(8))}</span>
                          ${events.length ? `<span class="mcp-daybtn__count">${events.length}</span>` : ""}
                          <span class="mcp-daybtn__dots">${dots}</span>
                        </button>
                      </td>`;
                  })
                  .join("")}
              </tr>`
              )
              .join("")}
          </tbody>
        </table>
        ${renderDayDetail(byDate)}
      </section>`;
  }

  function renderDayDetail(byDate) {
    if (!state.selectedDay) return "";
    const events = byDate[state.selectedDay] || [];
    return `
      <div class="mcp-daydetail">
        <div class="mcp-daydetail__head">
          <strong>${escapeHtml(formatDate(state.selectedDay))}</strong>
          <button type="button" class="mcp-daydetail__x" id="mcpCloseDay" aria-label="Schließen">×</button>
        </div>
        ${
          events.length
            ? events.map((e) => renderEventRow(e)).join("")
            : `<p class="mcp-muted">Keine Termine an diesem Tag.</p>`
        }
      </div>`;
  }

  function renderEventRow(event) {
    return `
      <article class="mcp-card">
        <div class="mcp-card__top">
          <span class="mcp-card__subject">${escapeHtml(event.subject)}</span>
          <span class="mcp-pill" style="--mcp-c:${typeColor(event.type)}">${escapeHtml(event.typeLabel || event.type)}</span>
        </div>
        <h4 class="mcp-card__title">${escapeHtml(event.title)}</h4>
        <p class="mcp-card__date">${escapeHtml(formatDate(event.date))}</p>
      </article>`;
  }

  function renderUpcoming() {
    const list = upcomingEvents();
    return `
      <section class="mcp-section">
        <h3 class="mcp-section__title">Anstehende Checks</h3>
        ${
          list.length
            ? `<div class="mcp-list">${list.map(renderEventRow).join("")}</div>`
            : `<p class="mcp-muted">Keine anstehenden Checks für diese Filter.</p>`
        }
      </section>`;
  }

  function renderPast() {
    const list = pastEvents();
    if (!list.length) return "";
    return `
      <section class="mcp-section">
        <button type="button" class="mcp-past-toggle" id="mcpPastToggle" aria-expanded="${state.pastOpen ? "true" : "false"}">
          <span>Vergangene Checks</span>
          <span class="mcp-past-toggle__meta">${list.length} ${state.pastOpen ? "▾" : "▸"}</span>
        </button>
        ${state.pastOpen ? `<div class="mcp-list">${list.map(renderEventRow).join("")}</div>` : ""}
      </section>`;
  }

  function render() {
    const root = document.getElementById("checkpoint-plan-screen-root");
    if (!root) return;

    if (state.loading && !state.data) {
      root.innerHTML = `<div class="logbuch-loading">Lade Checks…</div>`;
      return;
    }

    if (!state.data?.hasClass) {
      root.innerHTML = `
        <div class="mcp-app">
          <p class="mcp-muted">Dir ist noch keine Klasse zugeordnet.</p>
        </div>`;
      return;
    }

    root.innerHTML = `
      <div class="mcp-app">
        <header class="mcp-head">
          <p class="mcp-kicker">Leistungsnachweise</p>
          <h2 class="mcp-head__title">Meine Checks</h2>
          <p class="mcp-head__sub">Kalender und anstehende Termine aus dem Levelplan.</p>
        </header>
        ${state.error ? `<div class="logbuch-msg logbuch-msg-error">${escapeHtml(state.error)}</div>` : ""}
        ${renderNextCard()}
        ${renderFilters()}
        ${renderCalendar()}
        ${renderUpcoming()}
        ${renderPast()}
      </div>`;

    bindHandlers(root);
  }

  function bindHandlers(root) {
    root.querySelectorAll("[data-mcp-subject]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.selectedSubject = btn.dataset.mcpSubject || "";
        state.selectedDay = null;
        loadData(initGeneration);
      });
    });

    root.querySelectorAll("[data-mcp-type]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.selectedType = btn.dataset.mcpType || "all";
        state.selectedDay = null;
        render();
      });
    });

    root.querySelector("#mcpPrev")?.addEventListener("click", () => {
      state.month = shiftMonth(state.month || currentMonth(), -1);
      state.selectedDay = null;
      loadData(initGeneration);
    });

    root.querySelector("#mcpNext")?.addEventListener("click", () => {
      state.month = shiftMonth(state.month || currentMonth(), 1);
      state.selectedDay = null;
      loadData(initGeneration);
    });

    root.querySelector("#mcpToday")?.addEventListener("click", () => {
      const today = todayIso();
      state.selectedDay = today;
      const m = today.slice(0, 7);
      if ((state.month || currentMonth()) !== m) {
        state.month = m;
        loadData(initGeneration);
      } else {
        render();
      }
    });

    root.querySelectorAll("[data-mcp-day]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const day = btn.dataset.mcpDay;
        state.selectedDay = state.selectedDay === day ? null : day;
        render();
      });
    });

    root.querySelector("#mcpCloseDay")?.addEventListener("click", () => {
      state.selectedDay = null;
      render();
    });

    root.querySelector("#mcpPastToggle")?.addEventListener("click", () => {
      state.pastOpen = !state.pastOpen;
      render();
    });
  }

  async function loadData(generation = initGeneration) {
    state.loading = true;
    if (!state.data) render();

    const params = new URLSearchParams();
    if (state.selectedSubject) params.set("subject", state.selectedSubject);
    if (state.month) params.set("month", state.month);

    try {
      const res = await fetch(
        `/api/student/checkpoint-plan${params.toString() ? `?${params}` : ""}`
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (generation !== initGeneration) return;
      state.data = data;
      state.month = data.month || state.month || currentMonth();
      state.loading = false;
      state.error = "";
      render();
    } catch (err) {
      console.error(err);
      if (generation !== initGeneration) return;
      state.loading = false;
      state.error = "Checks konnten nicht geladen werden.";
      render();
    }
  }

  async function initInternal() {
    const generation = ++initGeneration;
    state.loading = true;
    state.error = "";
    state.selectedDay = null;
    if (!state.month) state.month = currentMonth();
    await loadData(generation);
  }

  function init() {
    if (initPromise) return initPromise;
    initPromise = initInternal().finally(() => {
      initPromise = null;
    });
    return initPromise;
  }

  window.LogbuchCheckpointPlan = { init };
})();
