/**
 * Lehrkraft – Stundenplan-Editor (5 Tage × max. 7 Stunden).
 */
(function () {
  const WEEKDAYS = [
    { id: 1, label: "Mo" },
    { id: 2, label: "Di" },
    { id: 3, label: "Mi" },
    { id: 4, label: "Do" },
    { id: 5, label: "Fr" }
  ];

  const DEFAULT_TIMES = [
    "7.50-8.35",
    "8.40-9.25",
    "9.30-10.15",
    "10.35-11.20",
    "11.25-12.10",
    "12.15-13.00",
    "13.05-13.50"
  ];

  const FREE_SUBJECT = "Frei";

  const state = {
    classId: null,
    data: null,
    grid: {},
    loading: false,
    saving: false,
    message: "",
    error: ""
  };

  function escapeHtml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function defaultTimesFor(data) {
    const fromApi = data?.defaultTimeslots;
    return Array.isArray(fromApi) && fromApi.length ? fromApi : DEFAULT_TIMES;
  }

  function emptyGrid(maxSlots, defaultTimes = DEFAULT_TIMES) {
    const grid = {};
    WEEKDAYS.forEach((d) => {
      grid[d.id] = Array.from({ length: maxSlots }, (_, i) => ({
        timeslot: defaultTimes[i] || "",
        subject: "",
        room: ""
      }));
    });
    return grid;
  }

  function gridFromData(data) {
    const maxSlots = data.maxSlotsPerDay || 7;
    const defaultTimes = defaultTimesFor(data);
    const grid = emptyGrid(maxSlots, defaultTimes);
    data.days.forEach((day) => {
      grid[day.id] = day.slots.map((s, idx) => ({
        timeslot: s.timeslot || defaultTimes[idx] || "",
        subject: s.subject || "",
        room: s.room || ""
      }));
      while (grid[day.id].length < maxSlots) {
        const idx = grid[day.id].length;
        grid[day.id].push({
          timeslot: defaultTimes[idx] || "",
          subject: "",
          room: ""
        });
      }
    });
    return grid;
  }

  function isFreeSubject(subject) {
    return subject === FREE_SUBJECT;
  }

  function subjectOptions(subjects, selected) {
    const opts = (subjects || [])
      .map(
        (s) =>
          `<option value="${escapeHtml(s)}" ${s === selected ? "selected" : ""}>${escapeHtml(s)}</option>`
      )
      .join("");
    const isKnown = (subjects || []).includes(selected);
    const isFree = isFreeSubject(selected);
    const other = selected && !isKnown && !isFree ? selected : "";
    const emptySelected = !selected && !isFree && !other;

    return `
      <option value="" ${emptySelected ? "selected" : ""}>— nicht genutzt —</option>
      <option value="${FREE_SUBJECT}" ${isFree ? "selected" : ""}>Frei</option>
      ${opts}
      <option value="__other__" ${other ? "selected" : ""}>Sonstiges…</option>
    `;
  }

  function render() {
    const root = document.getElementById("timetableTabRoot");
    if (!root) return;

    if (state.loading && !state.data) {
      root.innerHTML = `<div class="tt-loading">Lade Stundenplan…</div>`;
      return;
    }

    if (!state.data) {
      root.innerHTML = `<div class="tt-error">Stundenplan konnte nicht geladen werden.</div>`;
      return;
    }

    const maxSlots = state.data.maxSlotsPerDay || 7;
    const subjects = state.data.subjects || [];

    root.innerHTML = `
      <div class="panel">
        <h2>Stundenplan</h2>
        <p class="hint">Pro Klasse: 5 Tage × max. ${maxSlots} Stunden. Zeitslot ist Pflicht. „Frei“ = freie Stunde ohne Logbuch. „Nicht genutzt“ = wird nicht gespeichert (z. B. wenn ihr weniger als ${maxSlots} Stunden nutzt).</p>

        <div class="tt-toolbar">
          <label>Klasse:</label>
          <select id="ttClassSelect"></select>
          <button class="action" id="ttSaveBtn" ${state.saving ? "disabled" : ""}>
            ${state.saving ? "Speichern…" : "Stundenplan speichern"}
          </button>
        </div>

        ${state.error ? `<div class="tt-msg tt-msg-error">${escapeHtml(state.error)}</div>` : ""}
        ${state.message ? `<div class="tt-msg tt-msg-ok">${escapeHtml(state.message)}</div>` : ""}

        <div class="tt-grid">
          ${WEEKDAYS.map((day) => {
            const slots = state.grid[day.id] || [];
            return `
              <div class="tt-day-col">
                <div class="tt-day-head">${day.label}</div>
                ${slots
                  .map(
                    (slot, idx) => `
                  <div class="tt-slot ${isFreeSubject(slot.subject) ? "tt-slot-free" : ""}" data-weekday="${day.id}" data-index="${idx}">
                    <div class="tt-slot-nr">${idx + 1}</div>
                    <input type="text" class="tt-input tt-timeslot" placeholder="7.50-8.35"
                      value="${escapeHtml(slot.timeslot)}" data-field="timeslot">
                    <select class="tt-input tt-subject-select" data-field="subject">
                      ${subjectOptions(subjects, slot.subject)}
                    </select>
                    <input type="text" class="tt-input tt-subject-other" placeholder="Fach eingeben"
                      value="${escapeHtml((subjects.includes(slot.subject) || isFreeSubject(slot.subject) ? "" : slot.subject) || "")}"
                      style="${subjects.includes(slot.subject) || isFreeSubject(slot.subject) || !slot.subject ? "display:none" : ""}">
                    <input type="text" class="tt-input" placeholder="Raum (optional)"
                      value="${escapeHtml(slot.room)}" data-field="room">
                  </div>`
                  )
                  .join("")}
              </div>`;
          }).join("")}
        </div>
      </div>`;

    bindHandlers(root, subjects);
    fillClassSelect(root);
  }

  function fillClassSelect(root) {
    const sel = root.querySelector("#ttClassSelect");
    if (!sel || !window.__ttClasses) return;
    sel.innerHTML = "";
    window.__ttClasses.forEach((c) => {
      const opt = document.createElement("option");
      opt.value = c.id;
      opt.textContent = c.name;
      if (String(c.id) === String(state.classId)) opt.selected = true;
      sel.appendChild(opt);
    });
  }

  function readGridFromDom(root) {
    const grid = emptyGrid(state.data?.maxSlotsPerDay || 7, defaultTimesFor(state.data));
    root.querySelectorAll(".tt-slot").forEach((slotEl) => {
      const weekday = Number(slotEl.dataset.weekday);
      const index = Number(slotEl.dataset.index);
      const timeslot = slotEl.querySelector('[data-field="timeslot"]')?.value.trim() || "";
      const subjectSel = slotEl.querySelector(".tt-subject-select");
      let subject = subjectSel?.value || "";
      const otherInput = slotEl.querySelector(".tt-subject-other");
      if (subject === "__other__") {
        subject = otherInput?.value.trim() || "";
      }
      const room = slotEl.querySelector('[data-field="room"]')?.value.trim() || "";
      grid[weekday][index] = { timeslot, subject, room };
    });
    state.grid = grid;
  }

  function bindHandlers(root, subjects) {
    root.querySelector("#ttClassSelect")?.addEventListener("change", (e) => {
      state.classId = e.target.value;
      state.message = "";
      state.error = "";
      loadTimetable();
    });

    root.querySelectorAll(".tt-subject-select").forEach((sel) => {
      sel.addEventListener("change", () => {
        const slot = sel.closest(".tt-slot");
        const other = slot?.querySelector(".tt-subject-other");
        if (!other || !slot) return;
        slot.classList.toggle("tt-slot-free", sel.value === FREE_SUBJECT);
        if (sel.value === "__other__") {
          other.style.display = "";
          other.focus();
        } else {
          other.style.display = "none";
          other.value = "";
        }
      });
    });

    root.querySelector("#ttSaveBtn")?.addEventListener("click", saveTimetable);
  }

  function collectEntries() {
    const entries = [];
    WEEKDAYS.forEach((day) => {
      (state.grid[day.id] || []).forEach((slot) => {
        if (!slot.timeslot && !slot.subject && !slot.room) return;
        if (!slot.subject) return;
        entries.push({
          weekday: day.id,
          timeslot: slot.timeslot,
          subject: slot.subject,
          room: slot.room
        });
      });
    });
    return entries;
  }

  async function saveTimetable() {
    const root = document.getElementById("timetableTabRoot");
    if (root) readGridFromDom(root);

    state.saving = true;
    state.error = "";
    state.message = "";
    if (root) {
      const btn = root.querySelector("#ttSaveBtn");
      if (btn) {
        btn.disabled = true;
        btn.textContent = "Speichern…";
      }
    }

    try {
      const res = await fetch("/api/teacher/timetable", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          classId: state.classId,
          entries: collectEntries()
        })
      });

      const data = await res.json();

      if (!data.success) {
        state.saving = false;
        state.error = data.message || "Speichern fehlgeschlagen.";
        render();
        return;
      }

      state.saving = false;
      state.message = `Stundenplan gespeichert (${data.saved} Stunden).`;
      await loadTimetable();
    } catch (err) {
      console.error(err);
      state.saving = false;
      state.error = "Netzwerkfehler beim Speichern.";
      render();
    }
  }

  async function loadTimetable() {
    if (!state.classId) return;

    state.loading = true;
    if (!state.data) render();

    try {
      const res = await fetch(
        `/api/teacher/timetable?classId=${encodeURIComponent(state.classId)}`
      );
      state.data = await res.json();
      state.grid = gridFromData(state.data);
      state.loading = false;
      render();
    } catch (err) {
      console.error(err);
      state.loading = false;
      state.data = null;
      render();
    }
  }

  async function init() {
    state.message = "";
    state.error = "";
    state.data = null;

    const root = document.getElementById("timetableTabRoot");
    if (root) root.innerHTML = `<div class="tt-loading">Lade Stundenplan…</div>`;

    try {
      if (!window.__ttClasses) {
        const r = await fetch("/api/class");
        window.__ttClasses = await r.json();
      }

      if (!window.__ttClasses.length) {
        if (root) {
          root.innerHTML = `<div class="tt-empty">Bitte zuerst eine Klasse anlegen.</div>`;
        }
        return;
      }

      state.classId = state.classId || window.__ttClasses[0].id;
      await loadTimetable();
    } catch (err) {
      console.error(err);
      if (root) root.innerHTML = `<div class="tt-error">Fehler beim Laden.</div>`;
    }
  }

  window.TeacherTimetable = { init };
})();
