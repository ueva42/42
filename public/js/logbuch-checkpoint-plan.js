/**
 * SRL-Logbuch – Checkpoint-Plan / Meine Checks (App-Layout wie Mein Tag).
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

  function monthLabel(month) {
    const [y, m] = month.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString("de-DE", { month: "long", year: "numeric" });
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
      cells.push(`${month}-${String(day).padStart(2, "0")}`);
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

  function renderMonthNav() {
    const month = state.month || state.data?.month || currentMonth();
    return `
      <div class="student-card day-nav-card">
        <button type="button" class="today-arrow" id="cpPrevMonth" aria-label="Vorheriger Monat">‹</button>
        <div class="day-nav-card__center">
          <h3 class="day-nav-card__title">${escapeHtml(monthLabel(month))}</h3>
          <p class="day-nav-card__sub">Deine Checks & Termine</p>
        </div>
        <button type="button" class="today-arrow" id="cpNextMonth" aria-label="Nächster Monat">›</button>
      </div>`;
  }

  function renderCalendar() {
    const month = state.month || state.data?.month || currentMonth();
    const byDate = state.data?.eventsByDate || {};
    const today = state.data?.today || new Date().toISOString().slice(0, 10);
    const cells = buildMonthGrid(month);
    const typeOptions = state.data?.checkpointTypeOptions || [];

    return `
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
                <div class="cp-day-events">${events.map(renderEventChip).join("")}</div>
              </div>`;
          })
          .join("")}
      </div>
      <div class="cp-legend">
        ${
          typeOptions.length
            ? typeOptions
                .map((o) => `<span><i class="cp-legend-dot cp-legend-${escapeHtml(o.value)}"></i> ${escapeHtml(o.label)}</span>`)
                .join("")
            : `<span><i class="cp-legend-dot cp-legend-klassenarbeit"></i> Klassenarbeit</span>`
        }
      </div>`;
  }

  function renderUpcomingCards() {
    const upcoming = state.data?.upcoming || [];
    const visuals = V();
    if (!upcoming.length) {
      return visuals?.emptyState({
        title: "Keine anstehenden Termine.",
        text: state.selectedSubject
          ? `Für ${state.selectedSubject} steht gerade nichts an.`
          : "Deine Lehrkraft trägt Termine im Levelstatus ein.",
        heroSrc: "/icons/student/hero/meine-checks-hero.png"
      });
    }

    return `<div class="goal-card-grid">${upcoming
      .map(
        (event) => `
      <article class="student-card goal-card goal-card--open">
        <div class="card-content">
          <p class="goal-card__subject">${escapeHtml(event.subject)}</p>
          <p class="goal-card__what">${escapeHtml(event.title)}</p>
          <div class="goal-card__meta">
            <span class="status-badge status-badge--open">${escapeHtml(event.typeLabel || "Checkpoint")}</span>
            <span>${escapeHtml(event.dateLabel || event.date)}</span>
          </div>
        </div>
      </article>`
      )
      .join("")}</div>`;
  }

  function renderSubjectChips() {
    const subjects = state.data?.subjects || [];
    const visuals = V();
    if (!subjects.length || !visuals) return "";
    return visuals.chipBar(
      [{ value: "", label: "Alle" }].concat(subjects.map((s) => ({ value: s, label: s }))),
      state.selectedSubject,
      "data-cp-subject"
    );
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
            text: "Bitte wende dich an deine Lehrkraft."
          })
        ) || "";
      return;
    }

    const upcoming = state.data.upcoming || [];
    const allEvents = Object.values(state.data.eventsByDate || {}).flat();
    const total = allEvents.length;
    const soon = upcoming.length;

    const kpi = visuals?.pageKpi(
      [
        { value: total, label: "Termine", accent: true },
        { value: soon, label: "Demnächst" },
        { value: state.selectedSubject || "Alle", label: "Fach" }
      ],
      { completed: soon, total: total || soon, label: "Anstehende Checks", accent: "#14b8a6" }
    );

    root.innerHTML = visuals?.pageShell(`
      ${renderMonthNav()}
      ${kpi || ""}
      ${renderSubjectChips()}
      ${state.message ? `<div class="logbuch-msg logbuch-msg-ok">${escapeHtml(state.message)}</div>` : ""}
      ${state.error ? `<div class="logbuch-msg logbuch-msg-error">${escapeHtml(state.error)}</div>` : ""}
      ${visuals.sectionBlock("Kalender", `<div class="student-card"><div class="card-content">${renderCalendar()}</div></div>`)}
      ${visuals.sectionBlock("Was ansteht", renderUpcomingCards())}
    `) || "";

    bindHandlers(root);
  }

  function bindHandlers(root) {
    root.querySelectorAll("[data-cp-subject]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.selectedSubject = btn.dataset.cpSubject;
        state.message = "";
        loadData(initGeneration);
      });
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
