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
    hwCompletingId: null,
    hwNoteDraft: ""
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

  function renderDueTile(hw, editable) {
    const ui = UI();
    const isCompleting = state.hwCompletingId === String(hw.id);
    const overdue = !hw.done && hw.dueDate && hw.dueDate < todayIso();
    const overdueTag = overdue ? `<span class="hw-item__overdue">überfällig</span>` : "";

    if (hw.done) {
      return `
        <article class="hw-tile hw-tile--done">
          <p class="hw-tile__subject">${ui.escapeHtml(hw.subject)} ${overdueTag}</p>
          <h4 class="hw-tile__title">${ui.escapeHtml(hw.title)}</h4>
          ${homeworkClassNoteHtml(hw, ui)}
          ${hw.doneNote ? `<p class="hw-item__note">${ui.escapeHtml(hw.doneNote)}</p>` : ""}
          <p class="hw-tile__due">Erledigt</p>
        </article>`;
    }

    return `
      <article class="hw-tile ${isCompleting ? "is-editing" : ""}">
        <p class="hw-tile__subject">${ui.escapeHtml(hw.subject)} ${overdueTag}</p>
        <h4 class="hw-tile__title">${ui.escapeHtml(hw.title)}</h4>
        ${homeworkClassNoteHtml(hw, ui)}
        <p class="hw-tile__due">Fällig ${ui.escapeHtml(formatDueHint(hw.dueDate))}</p>
        ${
          editable
            ? `<div class="hw-tile__actions">
                <button type="button" class="today-app-btn today-app-btn--ghost hw-btn" data-hw-complete="${ui.escapeHtml(hw.id)}">Erledigt</button>
                <button type="button" class="hw-btn-icon" data-hw-delete="${ui.escapeHtml(hw.id)}" aria-label="Löschen" title="Löschen">×</button>
              </div>
              ${
                isCompleting
                  ? `<div class="hw-complete-form">
                      <label class="hw-label" for="hwNote_${ui.escapeHtml(hw.id)}">Kurz dokumentieren (optional)</label>
                      <input id="hwNote_${ui.escapeHtml(hw.id)}" class="hw-input" type="text" maxlength="400" placeholder="z. B. Aufgaben 1–4 erledigt" value="${ui.escapeHtml(state.hwNoteDraft)}" data-hw-note-input>
                      <div class="hw-complete-actions">
                        <button type="button" class="today-app-btn" data-hw-confirm="${ui.escapeHtml(hw.id)}" ${state.hwBusy ? "disabled" : ""}>${state.hwBusy ? "Speichern…" : "Abhaken"}</button>
                        <button type="button" class="today-app-btn today-app-btn--ghost" data-hw-cancel>Abbrechen</button>
                      </div>
                    </div>`
                  : ""
              }`
            : ""
        }
      </article>`;
  }

  function renderAssignedTile(hw, editable) {
    const ui = UI();
    return `
      <article class="hw-tile ${hw.done ? "hw-tile--done" : ""}">
        <p class="hw-tile__subject">${ui.escapeHtml(hw.subject)}</p>
        <h4 class="hw-tile__title">${ui.escapeHtml(hw.title)}</h4>
        ${homeworkClassNoteHtml(hw, ui)}
        <p class="hw-tile__due">Bis ${ui.escapeHtml(formatDueHint(hw.dueDate))}</p>
        ${
          !hw.done && editable
            ? `<button type="button" class="hw-btn-icon hw-tile__delete" data-hw-delete="${ui.escapeHtml(hw.id)}" aria-label="Löschen" title="Löschen">×</button>`
            : hw.done
              ? `<span class="hw-item__done-tag">✓</span>`
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
    const hw = state.data?.homework || { due: [], assigned: [] };
    const due = hw.due || [];
    const dueIds = new Set(due.map((h) => String(h.id)));
    const assigned = (hw.assigned || []).filter((h) => !dueIds.has(String(h.id)));
    const openDue = due.filter((h) => !h.done);

    const dueSection =
      due.length > 0
        ? `
      <div class="hw-block">
        <div class="hw-block__head">
          <h3 class="hw-block__title">Heute fällig</h3>
          <p class="hw-block__sub">${openDue.length ? `${openDue.length} offen` : "Alles erledigt ✓"}</p>
        </div>
        <div class="hw-tile-grid">${due.map((h) => renderDueTile(h, editable)).join("")}</div>
      </div>`
        : `
      <div class="hw-block hw-block--empty">
        <h3 class="hw-block__title">Heute fällig</h3>
        <p class="hw-block__hint">${editable ? "Nichts fällig – wenn du etwas mitnimmst, setze es unten." : "Keine fälligen Hausaufgaben."}</p>
      </div>`;

    const plannedSection = assigned.length
      ? `
      <div class="hw-block">
        <div class="hw-block__head">
          <h3 class="hw-block__title">Gesetzt</h3>
          <p class="hw-block__sub">${assigned.length} ${assigned.length === 1 ? "Kachel" : "Kacheln"}</p>
        </div>
        <div class="hw-tile-grid">${assigned.map((h) => renderAssignedTile(h, editable)).join("")}</div>
      </div>`
      : "";

    const addSection = editable
      ? `
      <div class="hw-add-row">
        <button type="button" class="today-app-btn hw-add-btn" id="hwOpenModalBtn">Hausaufgabe setzen</button>
        ${state.hwMessage && !state.modalOpen ? `<p class="hw-msg hw-msg--ok">${ui.escapeHtml(state.hwMessage)}</p>` : ""}
        ${state.hwError && !state.modalOpen ? `<p class="hw-msg hw-msg--err">${ui.escapeHtml(state.hwError)}</p>` : ""}
      </div>`
      : "";

    return `
      <section class="hw-panel" aria-label="Hausaufgaben">
        ${dueSection}
        ${addSection}
        ${plannedSection}
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
    root.querySelector("#hwAddBtn")?.addEventListener("click", () => addHomework());

    root.querySelectorAll("[data-hw-complete]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.hwCompletingId = btn.dataset.hwComplete;
        state.hwNoteDraft = "";
        state.hwError = "";
        state.hwMessage = "";
        render();
      });
    });
    root.querySelector("[data-hw-note-input]")?.addEventListener("input", (e) => {
      state.hwNoteDraft = e.target.value;
    });
    root.querySelector("[data-hw-cancel]")?.addEventListener("click", () => {
      state.hwCompletingId = null;
      state.hwNoteDraft = "";
      render();
    });
    root.querySelectorAll("[data-hw-confirm]").forEach((btn) => {
      btn.addEventListener("click", () => completeHomework(btn.dataset.hwConfirm));
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
          dueDate
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
      state.hwMessage = "Gesetzt – du siehst sie als Kachel.";
      await loadDay();
    } catch (err) {
      console.error(err);
      state.hwBusy = false;
      state.hwError = "Netzwerkfehler.";
      render();
    }
  }

  async function completeHomework(id) {
    state.hwBusy = true;
    state.hwError = "";
    render();
    try {
      const res = await fetch(`/api/student/homework/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          done: true,
          doneNote: state.hwNoteDraft || null
        })
      });
      const data = await res.json();
      state.hwBusy = false;
      if (!data.success) {
        state.hwError = data.message || "Abhaken fehlgeschlagen.";
        render();
        return;
      }
      state.hwCompletingId = null;
      state.hwNoteDraft = "";
      state.hwMessage = "Erledigt – dokumentiert.";
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
    state.hwCompletingId = null;
    state.hwNoteDraft = "";
    state.hwMessage = "";
    state.hwError = "";
    loadDay();
  }

  window.LogbuchHomework = { init, reload: () => loadDay() };

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && state.modalOpen) closeModal();
  });
})();
