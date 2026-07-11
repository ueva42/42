/**
 * SRL-Logbuch – Checkpoint-Plan (Kalender & anstehende Termine).
 */
(function () {
  const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

  const state = {
    data: null,
    selectedSubject: "",
    month: "",
    loading: false,
    message: "",
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
    return new Date().toISOString().slice(0, 7);
  }

  function monthLabel(month) {
    const [y, m] = month.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString("de-DE", {
      month: "long",
      year: "numeric"
    });
  }

  function shiftMonth(month, delta) {
    const [y, m] = month.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }

  function buildMonthGrid(month) {
    const [y, m] = month.split("-").map(Number);
    const first = new Date(y, m - 1, 1);
    const lastDay = new Date(y, m, 0).getDate();
    const startOffset = (first.getDay() + 6) % 7;
    const cells = [];

    for (let i = 0; i < startOffset; i++) cells.push(null);
    for (let day = 1; day <= lastDay; day++) {
      const iso = `${month}-${String(day).padStart(2, "0")}`;
      cells.push(iso);
    }
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }

  function eventChipClass(type) {
    if (type === "test") return "cp-event-test";
    if (type === "praesentation") return "cp-event-praesentation";
    if (type === "custom") return "cp-event-custom";
    return "cp-event-klassenarbeit";
  }

  function renderEventChip(event) {
    const cls = eventChipClass(event.type);
    const typeLabel = event.typeShort || event.typeLabel || "CP";
    return `
      <div class="cp-event-chip ${cls}" title="${escapeHtml(event.subject)} · ${escapeHtml(event.typeLabel || "")} – ${escapeHtml(event.title)}">
        <span class="cp-event-type">${escapeHtml(typeLabel)}</span>
        <span class="cp-event-title">${escapeHtml(event.title)}</span>
      </div>`;
  }

  function renderCalendar() {
    const month = state.month || state.data?.month || currentMonth();
    const byDate = state.data?.eventsByDate || {};
    const today = state.data?.today || new Date().toISOString().slice(0, 10);
    const cells = buildMonthGrid(month);
    const typeOptions = state.data?.checkpointTypeOptions || [];

    return `
      <section class="cp-calendar">
        <div class="cp-calendar-head">
          <button type="button" class="cp-nav-btn" id="cpPrevMonth" aria-label="Vorheriger Monat">‹</button>
          <h3 class="cp-calendar-title">${escapeHtml(monthLabel(month))}</h3>
          <button type="button" class="cp-nav-btn" id="cpNextMonth" aria-label="Nächster Monat">›</button>
        </div>
        <div class="cp-calendar-grid cp-calendar-weekdays">
          ${WEEKDAYS.map((d) => `<div class="cp-weekday">${d}</div>`).join("")}
        </div>
        <div class="cp-calendar-grid">
          ${cells
            .map((iso) => {
              if (!iso) return `<div class="cp-day cp-day-empty"></div>`;
              const events = byDate[iso] || [];
              const isToday = iso === today;
              return `
                <div class="cp-day ${isToday ? "cp-day-today" : ""} ${events.length ? "cp-day-has-events" : ""}">
                  <div class="cp-day-num">${Number(iso.slice(8, 10))}</div>
                  <div class="cp-day-events">
                    ${events.map(renderEventChip).join("")}
                  </div>
                </div>`;
            })
            .join("")}
        </div>
        <div class="cp-legend">
          ${
            typeOptions.length
              ? typeOptions
                  .map(
                    (o) =>
                      `<span><i class="cp-legend-dot cp-legend-${escapeHtml(o.value)}"></i> ${escapeHtml(o.label)}</span>`
                  )
                  .join("")
              : `<span><i class="cp-legend-dot cp-legend-klassenarbeit"></i> Klassenarbeit</span>`
          }
        </div>
      </section>`;
  }

  function renderCheckpointStats() {
    const V = window.LogbuchVisuals;
    if (!V || !state.data) return "";
    const upcoming = state.data.upcoming || [];
    const allEvents = Object.values(state.data.eventsByDate || {}).flat();
    const total = allEvents.length;
    const soon = upcoming.length;
    const pct = total ? Math.round(((total - soon) / total) * 100) : 0;

    return V.progressPanel({
      radial: V.radialProgress(Math.max(0, pct), `${soon}`, "Anstehend"),
      stats: V.statCards([
        { value: total, label: "Termine", accent: true },
        { value: soon, label: "Demnächst" },
        { value: state.selectedSubject || "Alle", label: "Fachfilter" }
      ])
    });
  }

  function renderUpcoming() {
    const upcoming = state.data?.upcoming || [];
    if (!upcoming.length) {
      return `
        <section class="cp-upcoming">
          <h3 class="cp-section-title">Was ansteht</h3>
          <p class="cp-empty">Keine anstehenden Termine${state.selectedSubject ? " für dieses Fach" : ""}.</p>
          <p class="cp-empty cp-empty-hint">Deine Lehrkraft trägt Termine im Levelstatus ein.</p>
        </section>`;
    }

    return `
      <section class="cp-upcoming student-card app-card">
        <div class="card-content">
        <h3 class="section-block__title">Was ansteht</h3>
        <div class="checkpoint-card-grid">
          ${upcoming
            .map(
              (event) => `
            <article class="student-card checkpoint-card cp-upcoming-item cp-upcoming-${escapeHtml(event.type)}">
              <div class="card-content">
                <span class="cp-upcoming-date">${escapeHtml(event.dateLabel || event.date)}</span>
                <span class="cp-upcoming-subject">${escapeHtml(event.subject)} · ${escapeHtml(event.typeLabel || "")}</span>
                <strong class="cp-upcoming-title">${escapeHtml(event.title)}</strong>
                <span class="status-badge status-badge--open">${escapeHtml(event.typeLabel || "Checkpoint")}</span>
              </div>
            </article>`
            )
            .join("")}
        </div>
        </div>
      </section>`;
  }

  function renderSubjectToolbar() {
    const subjects = state.data?.subjects || [];
    return `
      <div class="cp-toolbar">
        <label>
          Fach
          <select id="cpSubjectSelect" class="cp-subject-select">
            <option value="">Alle Fächer</option>
            ${subjects
              .map(
                (s) =>
                  `<option value="${escapeHtml(s)}" ${state.selectedSubject === s ? "selected" : ""}>${escapeHtml(s)}</option>`
              )
              .join("")}
          </select>
        </label>
      </div>`;
  }

  function render() {
    const root = document.getElementById("checkpoint-plan-screen-root");
    if (!root) return;

    if (state.loading && !state.data) {
      root.innerHTML = `<div class="logbuch-loading">Lade Checkpoint-Plan…</div>`;
      return;
    }

    if (!state.data?.hasClass) {
      root.innerHTML = `<div class="lc-empty"><p>Dir ist noch keine Klasse zugeordnet.</p></div>`;
      return;
    }

    root.innerHTML = `
      <div class="student-page lc-shell cp-shell">
        ${renderCheckpointStats()}
        ${renderSubjectToolbar()}
        ${state.message ? `<div class="logbuch-msg logbuch-msg-ok">${escapeHtml(state.message)}</div>` : ""}
        ${state.error ? `<div class="logbuch-msg logbuch-msg-error">${escapeHtml(state.error)}</div>` : ""}
        <div class="cp-layout">
          <div class="cp-main student-card app-card"><div class="card-content">${renderCalendar()}</div></div>
          <aside class="cp-aside">${renderUpcoming()}</aside>
        </div>
      </div>`;

    bindHandlers(root);
  }

  function bindHandlers(root) {
    root.querySelector("#cpSubjectSelect")?.addEventListener("change", (e) => {
      state.selectedSubject = e.target.value;
      state.message = "";
      loadData(initGeneration);
    });

    root.querySelector("#cpPrevMonth")?.addEventListener("click", () => {
      state.month = shiftMonth(state.month || state.data?.month || currentMonth(), -1);
      loadData(initGeneration);
    });

    root.querySelector("#cpNextMonth")?.addEventListener("click", () => {
      state.month = shiftMonth(state.month || state.data?.month || currentMonth(), 1);
      loadData(initGeneration);
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
    if (!state.month) state.month = currentMonth();

    const root = document.getElementById("checkpoint-plan-screen-root");
    if (root) root.innerHTML = `<div class="logbuch-loading">Lade Checkpoint-Plan…</div>`;

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
