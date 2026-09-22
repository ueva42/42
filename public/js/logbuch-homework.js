/**
 * SRL-Logbuch – Hausaufgaben (Popup zum Setzen, Kacheln für gesetzte Aufgaben).
 */
(function () {
  const UI = () => window.LogbuchUI;
  const DUE_DAY_COUNT = 6;

  const state = {
    date: null,
    data: null,
    loading: false,
    modalOpen: false,
    modalStep: 0,
    hwSubject: "",
    hwDueDate: "",
    hwTitle: "",
    hwClassDone: "",
    hwBusy: false,
    hwMessage: "",
    hwError: "",
    hwRemind: true
  };

  function todayIso() {
    return new Date().toISOString().slice(0, 10);
  }

  function addDaysIso(dateStr, days) {
    const d = new Date(`${dateStr}T12:00:00`);
    d.setDate(d.getDate() + days);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function isWeekdayIso(iso) {
    const day = new Date(`${iso}T12:00:00`).getDay();
    return day >= 1 && day <= 5;
  }

  function listUpcomingSchoolDays(fromIso, count = DUE_DAY_COUNT) {
    const out = [];
    let cursor = fromIso;
    for (let i = 0; i < 28 && out.length < count; i++) {
      if (isWeekdayIso(cursor)) out.push(cursor);
      cursor = addDaysIso(cursor, 1);
    }
    return out;
  }

  function isEditableDate(dateIso) {
    return dateIso === todayIso();
  }

  function homeworkSubjects() {
    const fromApi = state.data?.subjects;
    const fromTimetable = (state.data?.timetableSubjects || []).filter(Boolean);
    const list =
      Array.isArray(fromApi) && fromApi.length
        ? fromApi
        : window.LOGBUCH?.SUBJECTS || [];
    const preferred = fromTimetable.filter((s) => list.includes(s));
    const rest = list.filter((s) => !preferred.includes(s));
    return [...preferred, ...rest];
  }

  function dueDateOptions() {
    const today = todayIso();
    const next = state.data?.nextSchoolDay || "";
    return listUpcomingSchoolDays(today, DUE_DAY_COUNT).map((iso) => {
      const d = new Date(`${iso}T12:00:00`);
      let label = d.toLocaleDateString("de-DE", {
        weekday: "short",
        day: "2-digit",
        month: "2-digit"
      });
      if (iso === today) label = "Heute";
      else if (iso === next) label = "Morgen";
      return { iso, label };
    });
  }

  function formatDueHint(dueDate) {
    if (!dueDate) return "";
    if (dueDate === todayIso()) return "heute";
    const next = state.data?.nextSchoolDay;
    if (next && dueDate === next) return "morgen";
    const d = new Date(`${dueDate}T12:00:00`);
    return d.toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" });
  }

  function homeworkClassNoteHtml(hw, ui) {
    if (!hw.classDoneNote) return "";
    return `<p class="hw-item__note hw-item__note--class">Im Unterricht: ${ui.escapeHtml(hw.classDoneNote)}</p>`;
  }

  function openModal() {
    const options = dueDateOptions();
    const next = state.data?.nextSchoolDay || options.find((o) => o.iso !== todayIso())?.iso || options[0]?.iso || "";
    state.modalOpen = true;
    state.modalStep = 0;
    state.hwSubject = "";
    state.hwDueDate = next;
    state.hwTitle = "";
    state.hwClassDone = "";
    state.hwRemind = true;
    state.hwError = "";
    state.hwMessage = "";
    render();
  }

  function closeModal() {
    state.modalOpen = false;
    state.modalStep = 0;
    state.hwBusy = false;
    render();
  }

  function allHomeworkItems() {
    const hw = state.data?.homework;
    const raw =
      Array.isArray(hw?.items) && hw.items.length
        ? hw.items
        : [...(hw?.due || []), ...(hw?.assigned || [])];
    const seen = new Set();
    return raw
      .filter((h) => {
        const id = String(h?.id || "");
        if (!id || seen.has(id)) return false;
        seen.add(id);
        return true;
      })
      .sort((a, b) => {
        const due = String(a.dueDate || "").localeCompare(String(b.dueDate || ""));
        if (due) return due;
        return Number(!!a.done) - Number(!!b.done);
      });
  }

  function groupedByDueDate(items) {
    const groups = [];
    const map = new Map();
    for (const h of items) {
      const key = h.dueDate || "";
      if (!map.has(key)) {
        const g = { dueDate: key, items: [] };
        map.set(key, g);
        groups.push(g);
      }
      map.get(key).items.push(h);
    }
    return groups;
  }

  function dueRowTitle(iso) {
    if (!iso) return "Ohne Datum";
    if (iso === todayIso()) return "Heute";
    const next = state.data?.nextSchoolDay;
    if (next && iso === next) return "Morgen";
    const d = new Date(`${iso}T12:00:00`);
    return d.toLocaleDateString("de-DE", {
      weekday: "long",
      day: "2-digit",
      month: "2-digit"
    });
  }

  function renderTile(hw, editable) {
    const ui = UI();
    const id = ui.escapeHtml(hw.id);
    const remindOn = hw.remind !== false && !hw.done;
    return `
      <article class="hw-tile ${hw.done ? "hw-tile--done" : ""}">
        ${
          editable
            ? `<button type="button" class="hw-tile__check ${hw.done ? "is-done" : ""}" data-hw-toggle="${id}" data-done="${hw.done ? "1" : "0"}" aria-pressed="${hw.done ? "true" : "false"}" aria-label="${hw.done ? "Wieder öffnen" : "Als erledigt markieren"}" ${state.hwBusy ? "disabled" : ""}>${hw.done ? "✓" : ""}</button>`
            : `<span class="hw-tile__check ${hw.done ? "is-done" : ""}" aria-hidden="true">${hw.done ? "✓" : ""}</span>`
        }
        <div class="hw-tile__body">
          <p class="hw-tile__subject">${ui.escapeHtml(hw.subject)}</p>
          <h4 class="hw-tile__title">${ui.escapeHtml(hw.title)}</h4>
          ${homeworkClassNoteHtml(hw, ui)}
          ${hw.done && hw.doneNote ? `<p class="hw-item__note">${ui.escapeHtml(hw.doneNote)}</p>` : ""}
          <p class="hw-tile__due">${hw.done ? "Erledigt" : `Bis ${ui.escapeHtml(formatDueHint(hw.dueDate))}`}</p>
        </div>
        ${
          editable
            ? `<div class="hw-tile__tools">
                ${
                  hw.done
                    ? ""
                    : `<button type="button" class="hw-btn-icon hw-btn-icon--remind ${remindOn ? "is-on" : ""}" data-hw-remind="${id}" data-remind="${hw.remind !== false ? "1" : "0"}" aria-pressed="${hw.remind !== false ? "true" : "false"}" aria-label="${hw.remind !== false ? "Erinnerung aus" : "Erinnerung an"}" title="${hw.remind !== false ? "Erinnerung an" : "Erinnerung aus"}">🔔</button>`
                }
                ${
                  hw.done
                    ? ""
                    : `<button type="button" class="hw-btn-icon" data-hw-delete="${id}" aria-label="Löschen" title="Löschen">×</button>`
                }
              </div>`
            : ""
        }
      </article>`;
  }

  function renderModal() {
    if (!state.modalOpen) return "";
    const ui = UI();
    const subjects = homeworkSubjects();
    const dueOptions = dueDateOptions();
    const step = state.modalStep;
    const titles = ["Fach wählen", "Wann ist sie fertig?", "Hausaufgabe setzen"];
    const subs = [
      "Tipp das Fach an.",
      "An welchem Schultag soll sie erledigt sein?",
      "Was nimmst du mit nach Hause?"
    ];

    let body = "";
    if (step === 0) {
      body = `
        <div class="hw-modal__chips" role="group" aria-label="Fach">
          ${subjects
            .map(
              (s) =>
                `<button type="button" class="choice-chip ${s === state.hwSubject ? "is-active" : ""}" data-hw-subject="${ui.escapeHtml(s)}">${ui.escapeHtml(s)}</button>`
            )
            .join("")}
        </div>`;
    } else if (step === 1) {
      body = `
        <div class="hw-modal__chips hw-modal__chips--dates" role="group" aria-label="Fälligkeit">
          ${dueOptions
            .map(
              (opt) =>
                `<button type="button" class="choice-chip ${opt.iso === state.hwDueDate ? "is-active" : ""}" data-hw-due="${ui.escapeHtml(opt.iso)}">${ui.escapeHtml(opt.label)}</button>`
            )
            .join("")}
        </div>`;
    } else {
      body = `
        <div class="hw-form">
          <p class="hw-modal__picked">${ui.escapeHtml(state.hwSubject)} · bis ${ui.escapeHtml(formatDueHint(state.hwDueDate))}</p>
          <div class="hw-field">
            <label class="hw-label" for="hwTitleInput">Für zu Hause</label>
            <input id="hwTitleInput" class="hw-input" type="text" maxlength="300" placeholder="z. B. S. 42 Nr. 3–6" value="${ui.escapeHtml(state.hwTitle)}" autocomplete="off">
          </div>
          <div class="hw-field">
            <label class="hw-label" for="hwClassDoneInput">Im Unterricht erledigt <span class="hw-optional">optional</span></label>
            <input id="hwClassDoneInput" class="hw-input" type="text" maxlength="300" placeholder="z. B. Nr. 1–2 schon gemacht" value="${ui.escapeHtml(state.hwClassDone)}" autocomplete="off">
          </div>
          <label class="hw-remind-toggle">
            <input id="hwRemindInput" type="checkbox" ${state.hwRemind ? "checked" : ""}>
            Erinnern, wenn sie fällig ist
          </label>
          <p class="hw-remind-hint">Die Erinnerung erscheint in der App, solange sie geöffnet ist.</p>
        </div>`;
    }

    return `
      <div class="hw-modal-backdrop" id="hwModalBackdrop" role="dialog" aria-modal="true" aria-label="${ui.escapeHtml(titles[step])}">
        <div class="hw-modal">
          <div class="hw-modal__head">
            <div>
              <p class="hw-modal__kicker">Schritt ${step + 1} von 3</p>
              <h3 class="hw-modal__title">${ui.escapeHtml(titles[step])}</h3>
              <p class="hw-modal__sub">${ui.escapeHtml(subs[step])}</p>
            </div>
            <button type="button" class="hw-modal__close" id="hwModalClose">Schließen</button>
          </div>
          ${body}
          ${state.hwError ? `<p class="hw-msg hw-msg--err">${ui.escapeHtml(state.hwError)}</p>` : ""}
          <div class="hw-modal__foot">
            ${
              step > 0
                ? `<button type="button" class="today-app-btn today-app-btn--ghost" id="hwModalBack">Zurück</button>`
                : ""
            }
            ${
              step === 2
                ? `<button type="button" class="today-app-btn" id="hwAddBtn" ${state.hwBusy ? "disabled" : ""}>${state.hwBusy ? "Speichern…" : "Hausaufgabe setzen"}</button>`
                : `<button type="button" class="today-app-btn" id="hwModalNext" ${
                    (step === 0 && !state.hwSubject) || (step === 1 && !state.hwDueDate) ? "disabled" : ""
                  }>Weiter</button>`
            }
          </div>
        </div>
      </div>`;
  }

  function renderHomeworkPanel(editable) {
    const ui = UI();
    const items = allHomeworkItems();
    const groups = groupedByDueDate(items);
    const openToday = items.filter((h) => !h.done && h.dueDate === todayIso());

    const addSection = editable
      ? `
      <div class="hw-add-row">
        <button type="button" class="today-app-btn hw-add-btn" id="hwOpenModalBtn">Hausaufgabe setzen</button>
        ${state.hwMessage && !state.modalOpen ? `<p class="hw-msg hw-msg--ok">${ui.escapeHtml(state.hwMessage)}</p>` : ""}
        ${state.hwError && !state.modalOpen ? `<p class="hw-msg hw-msg--err">${ui.escapeHtml(state.hwError)}</p>` : ""}
      </div>`
      : "";

    const banner =
      openToday.length && editable
        ? `<p class="hw-remind-banner">${openToday.length === 1 ? "1 Hausaufgabe ist heute fällig." : `${openToday.length} Hausaufgaben sind heute fällig.`} Tippe den Kreis an, wenn du fertig bist.</p>`
        : "";

    const rows = groups.length
      ? groups
          .map((g) => {
            const open = g.items.filter((h) => !h.done).length;
            return `
        <div class="hw-block">
          <div class="hw-block__head">
            <h3 class="hw-block__title">${ui.escapeHtml(dueRowTitle(g.dueDate))}</h3>
            <p class="hw-block__sub">${open ? `${open} offen` : "Alles erledigt ✓"}</p>
          </div>
          <div class="hw-tile-grid">${g.items.map((h) => renderTile(h, editable)).join("")}</div>
        </div>`;
          })
          .join("")
      : `
      <div class="hw-block hw-block--empty">
        <h3 class="hw-block__title">Keine Hausaufgaben</h3>
        <p class="hw-block__hint">${editable ? "Wenn du etwas mitnimmst, setze es oben. Die Kacheln stehen dann nach Fälligkeit untereinander." : "Keine offenen Hausaufgaben."}</p>
      </div>`;

    return `
      <section class="hw-panel" aria-label="Hausaufgaben">
        ${addSection}
        ${banner}
        ${rows}
      </section>
      ${renderModal()}`;
  }

  function render() {
    const root = document.getElementById("hausaufgaben-screen-root");
    if (!root) return;
    const ui = UI();
    if (!ui) return;

    if (state.loading && !state.data) {
      root.innerHTML = `<div class="logbuch-loading">Lade Hausaufgaben…</div>`;
      return;
    }

    if (!state.data) {
      root.innerHTML = ui.msg("Hausaufgaben konnten nicht geladen werden.");
      return;
    }

    const editable = isEditableDate(state.date);
    root.innerHTML = `<div class="hw-page">${renderHomeworkPanel(editable)}</div>`;
    bindHandlers(root);
    if (state.modalOpen && state.modalStep === 2) {
      root.querySelector("#hwTitleInput")?.focus();
    }
  }

  function bindHandlers(root) {
    root.querySelector("#hwOpenModalBtn")?.addEventListener("click", () => openModal());
    root.querySelector("#hwModalClose")?.addEventListener("click", () => closeModal());
    root.querySelector("#hwModalBackdrop")?.addEventListener("click", (e) => {
      if (e.target.id === "hwModalBackdrop") closeModal();
    });
    root.querySelector("#hwModalBack")?.addEventListener("click", () => {
      state.modalStep = Math.max(0, state.modalStep - 1);
      state.hwError = "";
      render();
    });
    root.querySelector("#hwModalNext")?.addEventListener("click", () => {
      if (state.modalStep === 0 && !state.hwSubject) return;
      if (state.modalStep === 1 && !state.hwDueDate) return;
      state.modalStep += 1;
      state.hwError = "";
      render();
    });

    root.querySelectorAll("[data-hw-subject]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.hwSubject = btn.dataset.hwSubject || "";
        state.modalStep = 1;
        state.hwError = "";
        render();
      });
    });

    root.querySelectorAll("[data-hw-due]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.hwDueDate = btn.dataset.hwDue || "";
        state.modalStep = 2;
        state.hwError = "";
        render();
      });
    });

    root.querySelector("#hwTitleInput")?.addEventListener("input", (e) => {
      state.hwTitle = e.target.value;
    });
    root.querySelector("#hwClassDoneInput")?.addEventListener("input", (e) => {
      state.hwClassDone = e.target.value;
    });
    root.querySelector("#hwRemindInput")?.addEventListener("change", (e) => {
      state.hwRemind = !!e.target.checked;
    });
    root.querySelector("#hwAddBtn")?.addEventListener("click", () => addHomework());

    root.querySelectorAll("[data-hw-toggle]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const done = btn.dataset.done === "1";
        toggleHomework(btn.dataset.hwToggle, !done);
      });
    });
    root.querySelectorAll("[data-hw-remind]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const on = btn.dataset.remind === "1";
        toggleRemind(btn.dataset.hwRemind, !on);
      });
    });
    root.querySelectorAll("[data-hw-delete]").forEach((btn) => {
      btn.addEventListener("click", () => deleteHomework(btn.dataset.hwDelete));
    });
  }

  async function addHomework() {
    const subject = state.hwSubject || "";
    const title = String(state.hwTitle || "").trim();
    const classDoneNote = String(state.hwClassDone || "").trim();
    const dueDate = state.hwDueDate || state.data?.nextSchoolDay || "";
    state.hwError = "";
    state.hwMessage = "";

    if (!subject || !title) {
      state.hwError = "Bitte Fach und Aufgabe für zu Hause angeben.";
      render();
      return;
    }
    if (!dueDate) {
      state.hwError = "Bitte wählen, wann die Aufgabe fertig sein soll.";
      state.modalStep = 1;
      render();
      return;
    }

    state.hwBusy = true;
    render();

    try {
      const res = await fetch("/api/student/homework", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject,
          title,
          classDoneNote: classDoneNote || null,
          assignedDate: state.date,
          dueDate,
          remind: state.hwRemind !== false
        })
      });
      const data = await res.json();
      state.hwBusy = false;
      if (!data.success) {
        state.hwError = data.message || "Speichern fehlgeschlagen.";
        render();
        return;
      }
      state.modalOpen = false;
      state.modalStep = 0;
      state.hwTitle = "";
      state.hwClassDone = "";
      state.hwRemind = true;
      state.hwMessage = "Gesetzt – du siehst sie als Kachel.";
      await loadDay();
    } catch (err) {
      console.error(err);
      state.hwBusy = false;
      state.hwError = "Netzwerkfehler.";
      render();
    }
  }

  async function toggleHomework(id, done) {
    if (state.hwBusy || !id) return;
    state.hwBusy = true;
    state.hwError = "";
    state.hwMessage = "";
    render();
    try {
      const res = await fetch(`/api/student/homework/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ done: !!done })
      });
      const data = await res.json();
      state.hwBusy = false;
      if (!data.success) {
        state.hwError = data.message || "Aktualisieren fehlgeschlagen.";
        render();
        return;
      }
      state.hwMessage = done ? "Erledigt." : "Wieder geöffnet.";
      await loadDay();
    } catch (err) {
      console.error(err);
      state.hwBusy = false;
      state.hwError = "Netzwerkfehler.";
      render();
    }
  }

  async function toggleRemind(id, remind) {
    if (state.hwBusy || !id) return;
    state.hwBusy = true;
    state.hwError = "";
    render();
    try {
      const res = await fetch(`/api/student/homework/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ remind: !!remind })
      });
      const data = await res.json();
      state.hwBusy = false;
      if (!data.success) {
        state.hwError = data.message || "Erinnerung konnte nicht geändert werden.";
        render();
        return;
      }
      state.hwMessage = remind ? "Erinnerung an." : "Erinnerung aus.";
      await loadDay();
    } catch (err) {
      console.error(err);
      state.hwBusy = false;
      state.hwError = "Netzwerkfehler.";
      render();
    }
  }

  async function deleteHomework(id) {
    if (!window.confirm("Diese Hausaufgabe löschen?")) return;
    state.hwBusy = true;
    render();
    try {
      const res = await fetch(`/api/student/homework/${encodeURIComponent(id)}`, {
        method: "DELETE"
      });
      const data = await res.json();
      state.hwBusy = false;
      if (!data.success) {
        state.hwError = data.message || "Löschen fehlgeschlagen.";
        render();
        return;
      }
      state.hwMessage = "";
      await loadDay();
    } catch (err) {
      console.error(err);
      state.hwBusy = false;
      state.hwError = "Netzwerkfehler.";
      render();
    }
  }

  async function loadDay() {
    const dateIso = todayIso();
    state.date = dateIso;
    state.loading = true;
    if (!state.data) render();

    try {
      const res = await fetch(`/api/student/log/today?date=${encodeURIComponent(dateIso)}`, {
        credentials: "same-origin",
        cache: "no-store"
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      state.data = await res.json();
      state.loading = false;
      render();
      window.LogbuchReminders?.notifyHomework?.(allHomeworkItems());
    } catch (err) {
      console.error(err);
      state.loading = false;
      state.data = null;
      render();
    }
  }

  function init() {
    state.data = null;
    state.modalOpen = false;
    state.modalStep = 0;
    state.hwRemind = true;
    state.hwMessage = "";
    state.hwError = "";
    loadDay();
  }

  window.LogbuchHomework = { init, reload: () => loadDay() };

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && state.modalOpen) closeModal();
  });
})();
