/**
 * SRL-Logbuch – Meine Checks (Hero, Als Nächstes, Filter, Monatskalender).
 */
(function () {
  const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
  const UPCOMING_LIMIT = 5;

  const TYPE_COLORS = {
    test: "#22d3ee",
    klassenarbeit: "#3b82f6",
    levelcheck: "#a855f7",
    praesentation: "#ec4899",
    custom: "#22c55e"
  };

  const state = {
    data: null,
    selectedSubject: "",
    selectedType: "all",
    month: "",
    selectedDay: null,
    pastOpen: false,
    showAllUpcoming: false,
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

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function buildMonthGrid(month) {
    const [y, m] = String(month || currentMonth()).split("-").map(Number);
    const first = new Date(y, m - 1, 1);
    const lastDay = new Date(y, m, 0).getDate();
    const startOffset = (first.getDay() + 6) % 7;
    const cells = [];

    const prevLast = new Date(y, m - 1, 0).getDate();
    const prevM = m === 1 ? 12 : m - 1;
    const prevY = m === 1 ? y - 1 : y;
    for (let i = startOffset - 1; i >= 0; i -= 1) {
      const day = prevLast - i;
      cells.push({
        iso: `${prevY}-${pad2(prevM)}-${pad2(day)}`,
        inMonth: false
      });
    }

    for (let day = 1; day <= lastDay; day += 1) {
      cells.push({
        iso: `${month}-${pad2(day)}`,
        inMonth: true
      });
    }

    const nextM = m === 12 ? 1 : m + 1;
    const nextY = m === 12 ? y + 1 : y;
    let nextDay = 1;
    while (cells.length % 7 !== 0) {
      cells.push({
        iso: `${nextY}-${pad2(nextM)}-${pad2(nextDay)}`,
        inMonth: false
      });
      nextDay += 1;
    }
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
    if (state.selectedSubject && event.subject !== state.selectedSubject) return false;
    return true;
  }

  function eventsForDate(iso) {
    const byDate = state.data?.allEventsByDate || state.data?.eventsByDate || {};
    return (byDate[iso] || []).filter(matchesFilters);
  }

  function upcomingEvents() {
    const today = todayIso();
    return allEvents()
      .filter((e) => matchesFilters(e) && e.date >= today)
      .sort((a, b) => a.date.localeCompare(b.date) || String(a.title).localeCompare(String(b.title)));
  }

  function pastEvents() {
    const today = todayIso();
    return allEvents()
      .filter((e) => matchesFilters(e) && e.date < today)
      .sort((a, b) => b.date.localeCompare(a.date) || String(a.title).localeCompare(String(b.title)));
  }

  function daysUntil(iso) {
    const t0 = new Date(`${todayIso()}T12:00:00`);
    const t1 = new Date(`${iso}T12:00:00`);
    return Math.round((t1 - t0) / 86400000);
  }

  function countdownLabel(iso) {
    const d = daysUntil(iso);
    if (d === 0) return "HEUTE";
    if (d === 1) return "NOCH 1 TAG";
    if (d > 1) return `NOCH ${d} TAGE`;
    if (d === -1) return "GESTERN";
    return `VOR ${Math.abs(d)} TAGEN`;
  }

  function countdownShort(iso) {
    const d = daysUntil(iso);
    if (d === 0) return "HEUTE";
    if (d === 1) return "IN 1 TAG";
    if (d > 1) return `IN ${d} TAGEN`;
    return countdownLabel(iso);
  }

  function formatDate(iso, opts) {
    if (!iso) return "–";
    const d = new Date(`${iso}T12:00:00`);
    if (!Number.isFinite(d.getTime())) return iso;
    return d.toLocaleDateString(
      "de-DE",
      opts || {
        weekday: "long",
        day: "2-digit",
        month: "2-digit",
        year: "numeric"
      }
    );
  }

  function formatDateShort(iso) {
    return formatDate(iso, {
      weekday: "short",
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    });
  }

  function renderHero() {
    return `
      <header class="mcp-hero">
        <div class="mcp-hero__content">
          <p class="mcp-kicker">Leistungsnachweise</p>
          <h2 class="mcp-hero__title">Meine Checks</h2>
          <p class="mcp-hero__sub">Behalte Tests, Klassenarbeiten und Präsentationen im Blick.</p>
        </div>
        <img
          class="mcp-hero__img"
          src="/icons/student/hero/meine-checks-hero.png"
          alt=""
          aria-hidden="true"
          onerror="this.style.display='none'"
        >
      </header>`;
  }

  function renderFilters() {
    const subjects = state.data?.subjectsWithTopics?.length
      ? state.data.subjectsWithTopics
      : [];
    const types = state.data?.checkpointTypeOptions || [];

    return `
      <section class="mcp-filters" aria-label="Filter">
        <div>
          <p class="mcp-filter-label">Fach</p>
          <div class="mcp-filter-row">
            <button type="button" class="mcp-chip ${!state.selectedSubject ? "is-on" : ""}" data-mcp-subject="">Alle</button>
            ${subjects
              .map(
                (s) =>
                  `<button type="button" class="mcp-chip ${state.selectedSubject === s ? "is-on" : ""}" data-mcp-subject="${escapeHtml(s)}">${escapeHtml(s)}</button>`
              )
              .join("")}
          </div>
        </div>
        <div>
          <p class="mcp-filter-label">Art</p>
          <div class="mcp-filter-row">
            <button type="button" class="mcp-chip ${state.selectedType === "all" ? "is-on" : ""}" data-mcp-type="all">Alle Arten</button>
            ${types
              .map(
                (t) =>
                  `<button type="button" class="mcp-chip ${state.selectedType === t.value ? "is-on" : ""}" data-mcp-type="${escapeHtml(t.value)}">${escapeHtml(t.label)}</button>`
              )
              .join("")}
          </div>
        </div>
      </section>`;
  }

  function renderNextCard() {
    const next = upcomingEvents()[0];
    if (!next) {
      return `
        <section class="mcp-next mcp-next--empty">
          <p class="mcp-kicker">Als Nächstes</p>
          <p class="mcp-muted" style="margin-top:10px">Aktuell steht kein Leistungsnachweis an.</p>
        </section>`;
    }
    const color = typeColor(next.type);
    return `
      <section class="mcp-next">
        <p class="mcp-kicker">Als Nächstes</p>
        <div class="mcp-next__row">
          <div class="mcp-next__main">
            <div class="mcp-next__badges">
              <span class="mcp-pill" style="--mcp-c:${color}">${escapeHtml(next.typeLabel || next.type)}</span>
            </div>
            <p class="mcp-next__subject">${escapeHtml(next.subject)}</p>
            <h3 class="mcp-next__title">${escapeHtml(next.title)}</h3>
            <p class="mcp-next__meta">${escapeHtml(formatDate(next.date))}</p>
          </div>
          <div class="mcp-next__countdown" aria-label="${escapeHtml(countdownLabel(next.date))}">
            <span class="mcp-next__countdown-label">Countdown</span>
            <span class="mcp-next__countdown-value">${escapeHtml(countdownLabel(next.date))}</span>
          </div>
        </div>
      </section>`;
  }

  function renderDayCell(cell) {
    const { iso, inMonth } = cell;
    const events = eventsForDate(iso);
    const isToday = iso === todayIso();
    const selected = state.selectedDay === iso;
    const dayNum = Number(iso.slice(8));
    const dots = [...new Set(events.map((e) => e.type))]
      .slice(0, 3)
      .map((t) => `<span class="mcp-dot" style="background:${typeColor(t)}"></span>`)
      .join("");

    let meta = "";
    if (events.length === 1) {
      meta = `<span class="mcp-day__meta">${escapeHtml(events[0].typeShort || events[0].typeLabel || "Termin")}</span>`;
    } else if (events.length > 1) {
      meta = `<span class="mcp-day__meta">${events.length} Termine</span>`;
    }

    return `
      <button
        type="button"
        class="mcp-day ${inMonth ? "" : "is-out"} ${isToday ? "is-today" : ""} ${selected ? "is-selected" : ""} ${events.length ? "has-events" : ""}"
        data-mcp-day="${escapeHtml(iso)}"
        aria-label="${escapeHtml(formatDate(iso))}${events.length ? `, ${events.length} Termine` : ""}"
      >
        <span class="mcp-day__n">${dayNum}</span>
        ${isToday ? `<span class="mcp-day__today">Heute</span>` : ""}
        ${meta}
        ${dots ? `<span class="mcp-day__dots">${dots}</span>` : ""}
      </button>`;
  }

  function renderCalendar() {
    const month = state.month || currentMonth();
    const cells = buildMonthGrid(month);

    return `
      <section class="mcp-panel mcp-cal" aria-label="Monatskalender">
        <div class="mcp-cal__head">
          <button type="button" class="mcp-nav" id="mcpPrev" aria-label="Vorheriger Monat">←</button>
          <div class="mcp-cal__center">
            <h3>${escapeHtml(monthLabel(month))}</h3>
            <button type="button" class="mcp-today" id="mcpToday">Heute</button>
          </div>
          <button type="button" class="mcp-nav" id="mcpNext" aria-label="Nächster Monat">→</button>
        </div>
        <div class="mcp-cal__weekdays" aria-hidden="true">
          ${WEEKDAYS.map((d) => `<div class="mcp-cal__weekday">${d}</div>`).join("")}
        </div>
        <div class="mcp-cal__grid" role="grid" aria-label="${escapeHtml(monthLabel(month))}">
          ${cells.map(renderDayCell).join("")}
        </div>
      </section>`;
  }

  function renderEventCard(event, opts = {}) {
    const color = opts.past ? "#64748b" : typeColor(event.type);
    const classes = ["mcp-card"];
    if (opts.isNext) classes.push("is-next");
    if (opts.past) classes.push("is-past");

    return `
      <article class="${classes.join(" ")}" style="--mcp-c:${color}">
        <div class="mcp-card__top">
          <span class="mcp-card__subject">${escapeHtml(event.subject)}</span>
          ${
            opts.past
              ? `<span class="mcp-pill" style="--mcp-c:${color}">${escapeHtml(event.typeLabel || event.type)}</span>`
              : `<span class="mcp-card__countdown">${escapeHtml(countdownShort(event.date))}</span>`
          }
        </div>
        <h4 class="mcp-card__title">${escapeHtml(event.title)}</h4>
        <p class="mcp-card__date">
          <span class="mcp-pill" style="--mcp-c:${color}">${escapeHtml(event.typeLabel || event.type)}</span>
          · ${escapeHtml(formatDateShort(event.date))}
        </p>
      </article>`;
  }

  function renderUpcoming() {
    const list = upcomingEvents();
    const visible = state.showAllUpcoming ? list : list.slice(0, UPCOMING_LIMIT);
    const hasMore = list.length > UPCOMING_LIMIT;

    return `
      <section class="mcp-panel mcp-upcoming" aria-label="Kommende Checks">
        <h3 class="mcp-panel__title">Kommende Checks</h3>
        ${
          visible.length
            ? visible.map((e, i) => renderEventCard(e, { isNext: i === 0 })).join("")
            : `<p class="mcp-muted">Keine anstehenden Checks für diese Filter.</p>`
        }
        ${
          hasMore
            ? `<button type="button" class="mcp-more" id="mcpShowAllUpcoming">
                ${state.showAllUpcoming ? "Weniger anzeigen" : "Alle Termine anzeigen"}
              </button>`
            : ""
        }
      </section>`;
  }

  function renderDayDrawer() {
    if (!state.selectedDay) return "";
    const events = eventsForDate(state.selectedDay);
    return `
      <div class="mcp-drawer-backdrop" id="mcpDrawerBackdrop" aria-hidden="true"></div>
      <aside class="mcp-drawer" role="dialog" aria-modal="true" aria-label="Tagesdetails">
        <div class="mcp-drawer__head">
          <strong>${escapeHtml(formatDate(state.selectedDay))}</strong>
          <button type="button" class="mcp-drawer__x" id="mcpCloseDay" aria-label="Schließen">×</button>
        </div>
        <div class="mcp-drawer__list">
          ${
            events.length
              ? events.map((e) => renderEventCard(e, { past: e.date < todayIso() })).join("")
              : `<p class="mcp-muted">Keine Termine an diesem Tag.</p>`
          }
        </div>
      </aside>`;
  }

  function renderPast() {
    const list = pastEvents();
    if (!list.length) return "";
    const countLabel = list.length === 1 ? "1 Termin" : `${list.length} Termine`;
    return `
      <section class="mcp-past">
        <button type="button" class="mcp-past-toggle" id="mcpPastToggle" aria-expanded="${state.pastOpen ? "true" : "false"}">
          <span class="mcp-past-toggle__label">Vergangene Checks</span>
          <span class="mcp-past-toggle__meta">${escapeHtml(countLabel)} ${state.pastOpen ? "▾" : "▸"}</span>
        </button>
        ${
          state.pastOpen
            ? `<div class="mcp-past__body">${list.map((e) => renderEventCard(e, { past: true })).join("")}</div>`
            : ""
        }
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
          ${renderHero()}
          <p class="mcp-muted">Dir ist noch keine Klasse zugeordnet.</p>
        </div>`;
      return;
    }

    root.innerHTML = `
      <div class="mcp-app">
        ${renderHero()}
        ${state.error ? `<div class="logbuch-msg logbuch-msg-error">${escapeHtml(state.error)}</div>` : ""}
        ${renderNextCard()}
        ${renderFilters()}
        <div class="mcp-dash">
          ${renderCalendar()}
          ${renderUpcoming()}
        </div>
        ${renderPast()}
        ${renderDayDrawer()}
      </div>`;

    bindHandlers(root);
  }

  function bindHandlers(root) {
    root.querySelectorAll("[data-mcp-subject]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.selectedSubject = btn.dataset.mcpSubject || "";
        state.selectedDay = null;
        state.showAllUpcoming = false;
        loadData(initGeneration);
      });
    });

    root.querySelectorAll("[data-mcp-type]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.selectedType = btn.dataset.mcpType || "all";
        state.selectedDay = null;
        state.showAllUpcoming = false;
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

    const closeDay = () => {
      state.selectedDay = null;
      render();
    };
    root.querySelector("#mcpCloseDay")?.addEventListener("click", closeDay);
    root.querySelector("#mcpDrawerBackdrop")?.addEventListener("click", closeDay);

    root.querySelector("#mcpPastToggle")?.addEventListener("click", () => {
      state.pastOpen = !state.pastOpen;
      render();
    });

    root.querySelector("#mcpShowAllUpcoming")?.addEventListener("click", () => {
      state.showAllUpcoming = !state.showAllUpcoming;
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
    state.showAllUpcoming = false;
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
