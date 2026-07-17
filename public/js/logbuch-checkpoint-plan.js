/**
 * SRL-Logbuch – Meine Checks (Monatskalender + Terminlisten).
 */
(function () {
  const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

  const TYPE_META = {
    klassenarbeit: { label: "Klassenarbeit", short: "KA", accent: "cyan" },
    test: { label: "Test", short: "Test", accent: "blue" },
    levelcheck: { label: "Levelcheck", short: "LC", accent: "violet" },
    praesentation: { label: "Präsentation", short: "Präs.", accent: "magenta" },
    custom: { label: "Eigene Angabe", short: "Eig.", accent: "green" }
  };

  const state = {
    data: null,
    selectedSubject: "",
    selectedType: "all",
    scopeFilter: "upcoming",
    month: "",
    selectedDay: null,
    pastOpen: false,
    loading: false,
    message: "",
    error: ""
  };

  let initPromise = null;
  let initGeneration = 0;

  const V = () => window.LogbuchVisuals;

  function escapeHtml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function currentMonth() {
    return new Date().toISOString().slice(0, 7);
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

  function typeMeta(type) {
    return TYPE_META[type] || TYPE_META.custom;
  }

  function typeAccentClass(type) {
    return `cp-type--${typeMeta(type).accent}`;
  }

  function allEventsFlat() {
    const byDate = state.data?.allEventsByDate || state.data?.eventsByDate || {};
    return Object.values(byDate).flat();
  }

  function monthEventsFlat() {
    return state.data?.events || [];
  }

  function matchesFilters(event) {
    if (state.selectedType !== "all" && event.type !== state.selectedType) return false;
    return true;
  }

  function filteredMonthByDate() {
    const byDate = {};
    for (const event of monthEventsFlat()) {
      if (!matchesFilters(event)) continue;
      if (!byDate[event.date]) byDate[event.date] = [];
      byDate[event.date].push(event);
    }
    return byDate;
  }

  function filteredUpcoming() {
    const today = todayIso();
    return allEventsFlat()
      .filter((e) => matchesFilters(e) && e.date >= today)
      .sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
  }

  function filteredPast() {
    const today = todayIso();
    return allEventsFlat()
      .filter((e) => matchesFilters(e) && e.date < today)
      .sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title));
  }

  function computeKpis() {
    const upcoming = filteredUpcoming();
    const past = filteredPast();
    const monthEv = monthEventsFlat().filter(matchesFilters);
    const monthPast = monthEv.filter((e) => e.date < todayIso());
    const subjects = new Set(upcoming.map((e) => e.subject));
    const next = upcoming[0] || null;
    return {
      upcomingCount: upcoming.length,
      next,
      subjectsWithEvents: subjects.size,
      monthDone: monthPast.length,
      monthTotal: monthEv.length
    };
  }

  function urgencyBadge(event) {
    const today = todayIso();
    if (event.date === today) return { label: "Heute", cls: "cp-badge--today" };
    const t = new Date(`${today}T12:00:00`).getTime();
    const d = new Date(`${event.date}T12:00:00`).getTime();
    const days = Math.round((d - t) / 86400000);
    if (days > 0 && days <= 7) return { label: "Bald", cls: "cp-badge--soon" };
    if (event.date < today) return { label: "Vorbei", cls: "cp-badge--past" };
    return { label: "Offen", cls: "cp-badge--open" };
  }

  function formatWeekdayDate(iso) {
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

  function renderHero() {
    return `
      <article class="cp-hero">
        <div class="cp-hero__content">
          <div class="cp-hero__icon" aria-hidden="true">
            <img src="/icons/student/png/meine-checks.png" alt="">
          </div>
          <div>
            <p class="cp-hero__eyebrow">Leistungsnachweise</p>
            <h2 class="cp-hero__title">Meine Checks</h2>
            <p class="cp-hero__sub">Tests, Klassenarbeiten und wichtige Termine im Blick.</p>
          </div>
        </div>
        <div class="cp-hero__visual" aria-hidden="true">
          <img src="/icons/student/hero/meine-checks-hero.png" alt="" loading="lazy">
        </div>
      </article>`;
  }

  function renderOverview() {
    const visuals = V();
    const kpi = computeKpis();
    const ringTotal = Math.max(1, kpi.upcomingCount || kpi.monthTotal || 1);
    const ringDone = Math.min(kpi.upcomingCount, ringTotal);
    const ring = visuals
      ? visuals.circularProgress({
          completed: ringDone,
          total: ringTotal,
          label: "Anstehende Checks",
          sublabel: `${kpi.upcomingCount} offen`,
          size: 96,
          accent: "#22d3ee"
        })
      : "";

    const nextLabel = kpi.next
      ? `${kpi.next.subject} · ${formatWeekdayDate(kpi.next.date)}`
      : "Kein Termin";

    return `
      <section class="cp-dash" aria-label="Checks Überblick">
        <article class="cp-dash__featured">
          <div class="cp-dash__featured-copy">
            <p class="cp-dash__eyebrow">Überblick</p>
            <h3 class="cp-dash__title">Anstehende Checks</h3>
            <p class="cp-dash__sub">${kpi.upcomingCount} Termin${kpi.upcomingCount === 1 ? "" : "e"} vor dir</p>
          </div>
          <div class="cp-dash__ring">${ring}</div>
        </article>
        <div class="cp-dash__row">
          <article class="cp-dash__metric cp-dash__metric--cyan">
            <p class="cp-dash__label">Anstehend</p>
            <p class="cp-dash__value">${kpi.upcomingCount}</p>
          </article>
          <article class="cp-dash__metric cp-dash__metric--violet">
            <p class="cp-dash__label">Nächster Termin</p>
            <p class="cp-dash__value cp-dash__value--sm">${escapeHtml(nextLabel)}</p>
          </article>
          <article class="cp-dash__metric cp-dash__metric--magenta">
            <p class="cp-dash__label">Fächer</p>
            <p class="cp-dash__value">${kpi.subjectsWithEvents}</p>
          </article>
          <article class="cp-dash__metric cp-dash__metric--green">
            <p class="cp-dash__label">Diesen Monat vorbei</p>
            <p class="cp-dash__value">${kpi.monthDone}</p>
          </article>
        </div>
      </section>`;
  }

  function renderFilters() {
    const subjects = state.data?.subjectsWithTopics?.length
      ? state.data.subjectsWithTopics
      : state.data?.subjects || [];
    const types = state.data?.checkpointTypeOptions?.length
      ? state.data.checkpointTypeOptions
      : CHECKPOINT_FALLBACK().map(([value, label]) => ({ value, label }));

    const subjectChips = [
      { value: "", label: "Alle Fächer" },
      ...subjects.map((s) => ({ value: s, label: s }))
    ];

    const typeChips = [
      { value: "all", label: "Alle Arten" },
      ...types.map((t) => ({
        value: t.value,
        label: t.label
      }))
    ];

    const scopeChips = [
      { value: "upcoming", label: "Nur anstehende" },
      { value: "month", label: "Diesen Monat" },
      { value: "past", label: "Nur erledigte" }
    ];

    return `
      <section class="cp-filters" aria-label="Filter">
        <div class="cp-filter-row">
          <span class="cp-filter-label">Fach</span>
          <div class="day-chip-bar">
            ${subjectChips
              .map(
                (c) => `
              <button type="button" class="day-chip ${state.selectedSubject === c.value ? "is-active" : ""}" data-cp-subject="${escapeHtml(c.value)}">${escapeHtml(c.label)}</button>`
              )
              .join("")}
          </div>
        </div>
        <div class="cp-filter-row">
          <span class="cp-filter-label">Art</span>
          <div class="day-chip-bar">
            ${typeChips
              .map(
                (c) => `
              <button type="button" class="day-chip ${state.selectedType === c.value ? "is-active" : ""}" data-cp-type="${escapeHtml(c.value)}">${escapeHtml(c.label)}</button>`
              )
              .join("")}
          </div>
        </div>
        <div class="cp-filter-row">
          <span class="cp-filter-label">Zeitraum</span>
          <div class="day-chip-bar">
            ${scopeChips
              .map(
                (c) => `
              <button type="button" class="day-chip ${state.scopeFilter === c.value ? "is-active" : ""}" data-cp-scope="${escapeHtml(c.value)}">${escapeHtml(c.label)}</button>`
              )
              .join("")}
          </div>
        </div>
      </section>`;
  }

  function CHECKPOINT_FALLBACK() {
    return [
      ["klassenarbeit", "Klassenarbeit"],
      ["test", "Test"],
      ["levelcheck", "Levelcheck"],
      ["praesentation", "Präsentation"],
      ["custom", "Eigene Angabe"]
    ];
  }

  function renderLegend() {
    const types = state.data?.checkpointTypeOptions || [];
    if (!types.length) return "";
    return `
      <div class="cp-legend" aria-label="Legende">
        ${types
          .map((o) => {
            const meta = typeMeta(o.value);
            return `<span class="cp-legend__item ${typeAccentClass(o.value)}"><i class="cp-legend__dot" aria-hidden="true"></i>${escapeHtml(o.label || meta.label)}</span>`;
          })
          .join("")}
      </div>`;
  }

  function renderCalendar() {
    const month = state.month || state.data?.month || currentMonth();
    const byDate = filteredMonthByDate();
    const today = todayIso();
    const cells = buildMonthGrid(month);
    const monthEv = Object.values(byDate).flat();

    return `
      <section class="cp-calendar" aria-label="Monatskalender">
        <header class="cp-calendar__head">
          <button type="button" class="cp-nav-btn" id="cpPrevMonth" aria-label="Vorheriger Monat">‹</button>
          <div class="cp-calendar__head-center">
            <h3 class="cp-calendar__title">${escapeHtml(monthLabel(month))}</h3>
            <button type="button" class="cp-today-btn" id="cpTodayBtn">Heute</button>
          </div>
          <button type="button" class="cp-nav-btn" id="cpNextMonth" aria-label="Nächster Monat">›</button>
        </header>

        <div class="cp-calendar__weekdays" aria-hidden="true">
          ${WEEKDAYS.map((d) => `<div class="cp-calendar__weekday">${d}</div>`).join("")}
        </div>

        <div class="cp-calendar__grid" role="grid" aria-label="${escapeHtml(monthLabel(month))}">
          ${cells
            .map((iso) => {
              if (!iso) return `<div class="cp-day cp-day--empty" aria-hidden="true"></div>`;
              const events = byDate[iso] || [];
              const isToday = iso === today;
              const isSelected = state.selectedDay === iso;
              const isPast = iso < today;
              const accents = [...new Set(events.map((e) => e.type))].slice(0, 3);
              return `
                <button
                  type="button"
                  class="cp-day ${isToday ? "cp-day--today" : ""} ${events.length ? "cp-day--has" : ""} ${isSelected ? "is-selected" : ""} ${isPast ? "cp-day--past" : ""}"
                  data-cp-day="${escapeHtml(iso)}"
                  aria-label="${escapeHtml(formatWeekdayDate(iso))}${events.length ? `, ${events.length} Termin${events.length === 1 ? "" : "e"}` : ""}"
                  aria-pressed="${isSelected ? "true" : "false"}"
                >
                  <span class="cp-day__num">${Number(iso.slice(8, 10))}</span>
                  ${
                    events.length
                      ? `<span class="cp-day__badge">${events.length}</span>
                         <span class="cp-day__dots" aria-hidden="true">
                           ${accents.map((t) => `<i class="cp-day__dot ${typeAccentClass(t)}"></i>`).join("")}
                         </span>`
                      : ""
                  }
                </button>`;
            })
            .join("")}
        </div>

        ${renderLegend()}
        ${
          !monthEv.length
            ? `<p class="cp-empty-hint">In diesem Monat sind keine Checks eingetragen.</p>`
            : ""
        }
        ${renderDayPanel(byDate)}
      </section>`;
  }

  function renderDayPanel(byDate) {
    if (!state.selectedDay) return "";
    const events = (byDate[state.selectedDay] || []).filter(matchesFilters);
    return `
      <div class="cp-day-panel" role="region" aria-label="Termine am ${escapeHtml(formatWeekdayDate(state.selectedDay))}">
        <div class="cp-day-panel__head">
          <h4>${escapeHtml(formatWeekdayDate(state.selectedDay))}</h4>
          <button type="button" class="cp-day-panel__close" id="cpCloseDay" aria-label="Schließen">×</button>
        </div>
        ${
          events.length
            ? `<div class="cp-day-panel__list">${events.map((e) => renderEventCard(e, { compact: true })).join("")}</div>`
            : `<p class="cp-empty-hint">Keine Termine an diesem Tag.</p>`
        }
      </div>`;
  }

  function renderEventCard(event, opts = {}) {
    const badge = urgencyBadge(event);
    const next = opts.highlight
      ? `<span class="cp-badge cp-badge--next">Als Nächstes</span>`
      : "";
    return `
      <article class="cp-event-card ${typeAccentClass(event.type)} ${opts.highlight ? "cp-event-card--next" : ""} ${opts.compact ? "cp-event-card--compact" : ""}">
        <div class="cp-event-card__top">
          <p class="cp-event-card__subject">${escapeHtml(event.subject)}</p>
          <div class="cp-event-card__badges">
            ${next}
            <span class="cp-badge ${badge.cls}">${escapeHtml(badge.label)}</span>
          </div>
        </div>
        <h4 class="cp-event-card__title">${escapeHtml(event.title)}</h4>
        <div class="cp-event-card__meta">
          <span class="cp-event-card__type">${escapeHtml(event.typeLabel || typeMeta(event.type).label)}</span>
          <span class="cp-event-card__date">${escapeHtml(event.dateLabel || formatWeekdayDate(event.date))}</span>
        </div>
      </article>`;
  }

  function renderSoon() {
    if (state.scopeFilter === "past") return "";
    const upcoming = filteredUpcoming().slice(0, 3);
    if (!upcoming.length) {
      return `
        <section class="cp-section">
          <h3 class="cp-section__title">Demnächst</h3>
          <p class="cp-empty-hint">Gerade stehen keine Leistungsnachweise an.</p>
        </section>`;
    }
    return `
      <section class="cp-section">
        <h3 class="cp-section__title">Demnächst</h3>
        <div class="cp-soon-grid">
          ${upcoming.map((e, i) => renderEventCard(e, { highlight: i === 0 })).join("")}
        </div>
      </section>`;
  }

  function renderUpcomingList() {
    if (state.scopeFilter === "past") return "";
    const list =
      state.scopeFilter === "month"
        ? monthEventsFlat()
            .filter((e) => matchesFilters(e) && e.date >= todayIso())
            .sort((a, b) => a.date.localeCompare(b.date))
        : filteredUpcoming();

    return `
      <section class="cp-section">
        <h3 class="cp-section__title">Alle anstehenden Termine</h3>
        ${
          list.length
            ? `<div class="cp-list-grid">${list.map((e) => renderEventCard(e)).join("")}</div>`
            : `<p class="cp-empty-hint">Keine anstehenden Termine für diese Filter.</p>`
        }
      </section>`;
  }

  function renderPast() {
    const past = filteredPast();
    if (state.scopeFilter === "upcoming" && !past.length) return "";
    if (state.scopeFilter === "month") {
      const monthPast = monthEventsFlat()
        .filter((e) => matchesFilters(e) && e.date < todayIso())
        .sort((a, b) => b.date.localeCompare(a.date));
      return renderPastBlock(monthPast, "Vergangene Checks in diesem Monat");
    }
    if (state.scopeFilter === "past") {
      return renderPastBlock(past, "Vergangene Checks", true);
    }
    return renderPastBlock(past, "Vergangene Checks", false);
  }

  function renderPastBlock(events, title, forceOpen = false) {
    const open = forceOpen || state.pastOpen;
    return `
      <section class="cp-section cp-section--past">
        <button type="button" class="cp-section__toggle" id="cpTogglePast" aria-expanded="${open ? "true" : "false"}">
          <h3 class="cp-section__title">${escapeHtml(title)}</h3>
          <span class="cp-section__chevron" aria-hidden="true">${open ? "▾" : "▸"}</span>
          <span class="cp-section__count">${events.length}</span>
        </button>
        ${
          open
            ? events.length
              ? `<div class="cp-list-grid cp-list-grid--past">${events.map((e) => renderEventCard(e)).join("")}</div>`
              : `<p class="cp-empty-hint">Noch keine vergangenen Termine.</p>`
            : ""
        }
      </section>`;
  }

  function render() {
    const root = document.getElementById("checkpoint-plan-screen-root");
    if (!root) return;
    const visuals = V();

    if (state.loading && !state.data) {
      root.innerHTML = `<div class="logbuch-loading">Lade Checks…</div>`;
      return;
    }

    if (!state.data?.hasClass) {
      root.innerHTML =
        visuals?.pageShell(
          visuals.emptyState({
            title: "Dir ist noch keine Klasse zugeordnet.",
            text: "Bitte wende dich an deine Lehrkraft.",
            heroSrc: "/icons/student/hero/meine-checks-hero.png"
          })
        ) || "";
      return;
    }

    root.innerHTML =
      visuals?.pageShell(`
      <div class="cp-app">
        ${renderHero()}
        ${renderOverview()}
        ${renderFilters()}
        ${state.message ? `<div class="logbuch-msg logbuch-msg-ok">${escapeHtml(state.message)}</div>` : ""}
        ${state.error ? `<div class="logbuch-msg logbuch-msg-error">${escapeHtml(state.error)}</div>` : ""}
        ${renderCalendar()}
        ${renderSoon()}
        ${renderUpcomingList()}
        ${renderPast()}
      </div>
    `) || "";

    bindHandlers(root);
  }

  function bindHandlers(root) {
    root.querySelectorAll("[data-cp-subject]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.selectedSubject = btn.dataset.cpSubject || "";
        state.selectedDay = null;
        state.message = "";
        loadData(initGeneration);
      });
    });

    root.querySelectorAll("[data-cp-type]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.selectedType = btn.dataset.cpType || "all";
        state.selectedDay = null;
        render();
      });
    });

    root.querySelectorAll("[data-cp-scope]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.scopeFilter = btn.dataset.cpScope || "upcoming";
        if (state.scopeFilter === "past") state.pastOpen = true;
        render();
      });
    });

    root.querySelector("#cpPrevMonth")?.addEventListener("click", () => {
      state.month = shiftMonth(state.month || state.data?.month || currentMonth(), -1);
      state.selectedDay = null;
      loadData(initGeneration);
    });

    root.querySelector("#cpNextMonth")?.addEventListener("click", () => {
      state.month = shiftMonth(state.month || state.data?.month || currentMonth(), 1);
      state.selectedDay = null;
      loadData(initGeneration);
    });

    root.querySelector("#cpTodayBtn")?.addEventListener("click", () => {
      const today = todayIso();
      const month = today.slice(0, 7);
      state.selectedDay = today;
      if (state.month !== month) {
        state.month = month;
        loadData(initGeneration);
      } else {
        render();
      }
    });

    root.querySelectorAll("[data-cp-day]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const day = btn.dataset.cpDay;
        state.selectedDay = state.selectedDay === day ? null : day;
        render();
      });
    });

    root.querySelector("#cpCloseDay")?.addEventListener("click", () => {
      state.selectedDay = null;
      render();
    });

    root.querySelector("#cpTogglePast")?.addEventListener("click", () => {
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
      const url = `/api/student/checkpoint-plan${params.toString() ? `?${params}` : ""}`;
      const res = await fetch(url);
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
      state.error = "Checkpoint-Plan konnte nicht geladen werden.";
      render();
    }
  }

  async function initInternal() {
    const generation = ++initGeneration;
    state.loading = true;
    state.message = "";
    state.error = "";
    state.selectedDay = null;
    if (!state.month) state.month = currentMonth();
    const root = document.getElementById("checkpoint-plan-screen-root");
    if (root) root.innerHTML = `<div class="logbuch-loading">Lade Checks…</div>`;
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
