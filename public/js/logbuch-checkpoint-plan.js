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
    saving: false,
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

  function renderEventChip(event) {
    const cls = event.type === "test" ? "cp-event-test" : "cp-event-work";
    const typeLabel = event.type === "test" ? "KA" : "Arbeit";
    return `
      <div class="cp-event-chip ${cls}" title="${escapeHtml(event.subject)} – ${escapeHtml(event.title)}">
        <span class="cp-event-type">${typeLabel}</span>
        <span class="cp-event-title">${escapeHtml(event.title)}</span>
      </div>`;
  }

  function renderCalendar() {
    const month = state.month || state.data?.month || currentMonth();
    const byDate = state.data?.eventsByDate || {};
    const today = state.data?.today || new Date().toISOString().slice(0, 10);
    const cells = buildMonthGrid(month);

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
          <span><i class="cp-legend-dot cp-legend-test"></i> Klassenarbeit</span>
          <span><i class="cp-legend-dot cp-legend-work"></i> Arbeits-Checkpoint</span>
        </div>
      </section>`;
  }

  function renderUpcoming() {
    const upcoming = state.data?.upcoming || [];
    if (!upcoming.length) {
      return `
        <section class="cp-upcoming">
          <h3 class="cp-section-title">Was ansteht</h3>
          <p class="cp-empty">Keine anstehenden Termine${state.selectedSubject ? " für dieses Fach" : ""}.</p>
        </section>`;
    }

    return `
      <section class="cp-upcoming">
        <h3 class="cp-section-title">Was ansteht</h3>
        <ul class="cp-upcoming-list">
          ${upcoming
            .map(
              (event) => `
            <li class="cp-upcoming-item cp-upcoming-${escapeHtml(event.type)}">
              <div class="cp-upcoming-main">
                <span class="cp-upcoming-date">${escapeHtml(event.dateLabel || event.date)}</span>
                <span class="cp-upcoming-subject">${escapeHtml(event.subject)}</span>
                <strong class="cp-upcoming-title">${escapeHtml(event.title)}</strong>
                ${event.note ? `<p class="cp-upcoming-note">${escapeHtml(event.note)}</p>` : ""}
              </div>
              ${
                event.editable
                  ? `<button type="button" class="cp-delete-btn" data-event-id="${escapeHtml(event.id)}" title="Entfernen">×</button>`
                  : `<span class="cp-upcoming-badge">${event.type === "test" ? "Klassenarbeit" : "Arbeit"}</span>`
              }
            </li>`
            )
            .join("")}
        </ul>
      </section>`;
  }

  function renderAddForm() {
    const subjects = state.data?.subjects || [];
    const defaultSubject = state.selectedSubject || subjects[0] || "";

    return `
      <section class="cp-add">
        <h3 class="cp-section-title">Arbeits-Checkpoint planen</h3>
        <form id="cpAddForm" class="cp-add-form">
          <label>
            Fach
            <select name="subject" required>
              ${subjects
                .map(
                  (s) =>
                    `<option value="${escapeHtml(s)}" ${s === defaultSubject ? "selected" : ""}>${escapeHtml(s)}</option>`
                )
                .join("")}
            </select>
          </label>
          <label>
            Titel
            <input type="text" name="title" maxlength="120" required placeholder="z. B. Bruchrechnung wiederholen">
          </label>
          <label>
            Datum
            <input type="date" name="checkpointDate" required>
          </label>
          <label>
            Notiz <span class="cp-optional">(optional)</span>
            <input type="text" name="note" maxlength="500" placeholder="z. B. Übungsblatt, Levelplan …">
          </label>
          <button type="submit" class="btn-primary" ${state.saving ? "disabled" : ""}>
            ${state.saving ? "Speichern…" : "Checkpoint speichern"}
          </button>
        </form>
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
      <div class="lc-shell cp-shell">
        <p class="lc-intro">
          <strong>Checkpoint-Plan:</strong> Kalender für Klassenarbeiten und deine Arbeits-Checkpoints.
          Wähle ein Fach, sieh was ansteht und plane deine nächsten Lern-Schritte.
        </p>
        ${renderSubjectToolbar()}
        ${state.message ? `<div class="logbuch-msg logbuch-msg-ok">${escapeHtml(state.message)}</div>` : ""}
        ${state.error ? `<div class="logbuch-msg logbuch-msg-error">${escapeHtml(state.error)}</div>` : ""}
        <div class="cp-layout">
          <div class="cp-main">${renderCalendar()}${renderAddForm()}</div>
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

    root.querySelector("#cpAddForm")?.addEventListener("submit", (e) => {
      e.preventDefault();
      saveCheckpoint(new FormData(e.target));
    });

    root.querySelectorAll(".cp-delete-btn").forEach((btn) => {
      btn.addEventListener("click", () => deleteCheckpoint(btn.dataset.eventId));
    });
  }

  async function saveCheckpoint(formData) {
    state.saving = true;
    state.error = "";
    state.message = "";
    render();

    try {
      const res = await fetch("/api/student/checkpoint-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: formData.get("subject"),
          title: formData.get("title"),
          checkpointDate: formData.get("checkpointDate"),
          note: formData.get("note")
        })
      });
      const data = await res.json();
      state.saving = false;
      if (!data.success) {
        state.error = data.message || "Speichern fehlgeschlagen.";
        render();
        return;
      }
      state.message = "Arbeits-Checkpoint gespeichert.";
      if (data.event?.date?.startsWith(state.month || "")) {
        await loadData(initGeneration);
      } else {
        state.month = (data.event?.date || currentMonth()).slice(0, 7);
        await loadData(initGeneration);
      }
    } catch (err) {
      console.error(err);
      state.saving = false;
      state.error = "Netzwerkfehler beim Speichern.";
      render();
    }
  }

  async function deleteCheckpoint(id) {
    if (!id || !confirm("Diesen Arbeits-Checkpoint wirklich entfernen?")) return;
    state.error = "";
    state.message = "";
    try {
      const res = await fetch(`/api/student/checkpoint-plan/${encodeURIComponent(id)}`, {
        method: "DELETE"
      });
      const data = await res.json();
      if (!data.success) {
        state.error = data.message || "Löschen fehlgeschlagen.";
        render();
        return;
      }
      state.message = "Checkpoint entfernt.";
      await loadData(initGeneration);
    } catch (err) {
      console.error(err);
      state.error = "Netzwerkfehler.";
      render();
    }
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
    state.saving = false;
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
