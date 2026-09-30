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
        room: "",
        requiresMidCheck: false
      }));
    });
    return grid;
  }

  function gridFromData(data) {
    const maxSlots = data.maxSlotsPerDay || 7;
    const defaultTimes = defaultTimesFor(data);
    const grid = emptyGrid(maxSlots, defaultTimes);
    data.days.forEach((day) => {
      grid[day.id] = defaultTimes.slice(0, maxSlots).map((timeslot, idx) => {
        const s = day.slots?.[idx] || {};
        return {
          timeslot,
          subject: s.subject || "",
          room: s.room || "",
          requiresMidCheck: !!s.requiresMidCheck
        };
      });
    });
    return grid;
  }

  function isFreeSubject(subject) {
    return subject === FREE_SUBJECT;
  }

  function subjectKey(subject) {
    return String(subject || "")
      .trim()
      .replace(/\s+/g, " ")
      .toLowerCase();
  }

  /** Indices die zu einer Doppelstunde gehören (gleiches Fach direkt hintereinander). */
  function doublePeriodIndexes(slots) {
    const marks = new Set();
    for (let i = 0; i < (slots || []).length - 1; i++) {
      const a = slots[i]?.subject;
      const b = slots[i + 1]?.subject;
      if (!a || !b || isFreeSubject(a) || isFreeSubject(b)) continue;
      if (subjectKey(a) === subjectKey(b)) {
        marks.add(i);
        marks.add(i + 1);
      }
    }
    return marks;
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
        <p class="hint">Pro Klasse: 5 Tage × max. ${maxSlots} Stunden. Zeitslot ist Pflicht. „Frei“ = freie Stunde ohne Logbuch. „Nicht genutzt“ = wird nicht gespeichert.</p>
        <p class="hint">Doppelstunde = gleiches Fach in zwei <strong>aufeinanderfolgenden</strong> Stunden → Zwischencheck automatisch. Alternativ Checkbox „Zwischencheck“ setzen.</p>

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
            const doubles = doublePeriodIndexes(slots);
            return `
              <div class="tt-day-col">
                <div class="tt-day-head">${day.label}</div>
                ${slots
                  .map((slot, idx) => {
                    const isDouble = doubles.has(idx);
                    const midOn = !!slot.requiresMidCheck || isDouble;
                    const showMid =
                      !!slot.subject && !isFreeSubject(slot.subject);
                    return `
                  <div class="tt-slot ${isFreeSubject(slot.subject) ? "tt-slot-free" : ""} ${
                    isDouble ? "tt-slot-double" : ""
                  }" data-weekday="${day.id}" data-index="${idx}">
                    <div class="tt-slot-nr">Stunde ${idx + 1}${
                      isDouble
                        ? ` <span class="tt-double-badge">Doppelstunde</span>`
                        : ""
                    }</div>
                    <div class="tt-slot-time">${escapeHtml(
                      defaultTimesFor(state.data)[idx] || slot.timeslot
                    )}</div>
                    <select class="tt-input tt-subject-select" data-field="subject">
                      ${subjectOptions(subjects, slot.subject)}
                    </select>
                    <input type="text" class="tt-input tt-subject-other" placeholder="Fach eingeben"
                      value="${escapeHtml(
                        (subjects.includes(slot.subject) || isFreeSubject(slot.subject)
                          ? ""
                          : slot.subject) || ""
                      )}"
                      style="${
                        subjects.includes(slot.subject) ||
                        isFreeSubject(slot.subject) ||
                        !slot.subject
                          ? "display:none"
                          : ""
                      }">
                    <input type="text" class="tt-input" placeholder="Raum (optional)"
                      value="${escapeHtml(slot.room)}" data-field="room">
                    ${
                      showMid
                        ? `<label class="tt-mid-check"><input type="checkbox" data-field="requiresMidCheck" ${
                            slot.requiresMidCheck || isDouble ? "checked" : ""
                          } ${isDouble ? "disabled" : ""}> Zwischencheck${
                            isDouble ? " (auto)" : ""
                          }</label>`
                        : ""
                    }
                    ${
                      midOn && showMid
                        ? `<div class="tt-mid-hint">Zwischen-Check aktiv</div>`
                        : ""
                    }
                  </div>`;
                  })
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
    const defaultTimes = defaultTimesFor(state.data);
    const grid = emptyGrid(state.data?.maxSlotsPerDay || 7, defaultTimes);
    root.querySelectorAll(".tt-slot").forEach((slotEl) => {
      const weekday = Number(slotEl.dataset.weekday);
      const index = Number(slotEl.dataset.index);
      const timeslot = defaultTimes[index] || "";
      const subjectSel = slotEl.querySelector(".tt-subject-select");
      let subject = subjectSel?.value || "";
      const otherInput = slotEl.querySelector(".tt-subject-other");
      if (subject === "__other__") {
        subject = otherInput?.value.trim() || "";
      }
      const room = slotEl.querySelector('[data-field="room"]')?.value.trim() || "";
      const midEl = slotEl.querySelector('[data-field="requiresMidCheck"]');
      const requiresMidCheck = !!(midEl && midEl.checked && !midEl.disabled);
      grid[weekday][index] = { timeslot, subject, room, requiresMidCheck };
    });
    // Auto-Doppelstunden brauchen kein Flag; manuell gesetzte behalten
    WEEKDAYS.forEach((day) => {
      const doubles = doublePeriodIndexes(grid[day.id] || []);
      (grid[day.id] || []).forEach((slot, idx) => {
        if (doubles.has(idx)) slot.requiresMidCheck = false;
      });
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

    const refreshFromDom = () => {
      readGridFromDom(root);
      render();
    };

    root.querySelectorAll(".tt-subject-select").forEach((sel) => {
      sel.addEventListener("change", () => {
        const slot = sel.closest(".tt-slot");
        const other = slot?.querySelector(".tt-subject-other");
        if (!other || !slot) return;
        slot.classList.toggle("tt-slot-free", sel.value === FREE_SUBJECT);
        if (sel.value === "__other__") {
          other.style.display = "";
          other.focus();
          return;
        }
        other.style.display = "none";
        other.value = "";
        refreshFromDom();
      });
    });

    root.querySelectorAll(".tt-subject-other").forEach((inp) => {
      inp.addEventListener("change", refreshFromDom);
    });

    root.querySelectorAll('[data-field="requiresMidCheck"]').forEach((cb) => {
      cb.addEventListener("change", refreshFromDom);
    });

    root.querySelector("#ttSaveBtn")?.addEventListener("click", saveTimetable);
  }

  function collectEntries() {
    const defaultTimes = defaultTimesFor(state.data);
    const entries = [];
    WEEKDAYS.forEach((day) => {
      (state.grid[day.id] || []).forEach((slot, idx) => {
        if (!slot.subject) return;
        entries.push({
          weekday: day.id,
          timeslot: defaultTimes[idx] || slot.timeslot,
          subject: slot.subject,
          room: slot.room,
          requiresMidCheck: !!slot.requiresMidCheck
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
