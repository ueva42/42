/**
 * SRL-Logbuch – Hausaufgaben (eigene Kachel, nicht mehr in Mein Tag).
 */
(function () {
  const UI = () => window.LogbuchUI;

  const state = {
    date: null,
    data: null,
    loading: false,
    hwSubject: "",
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

  function formatDueHint(dueDate) {
    if (!dueDate) return "";
    if (dueDate === todayIso()) return "heute";
    const d = new Date(`${dueDate}T12:00:00`);
    return d.toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" });
  }

  function homeworkClassNoteHtml(hw, ui) {
    if (!hw.classDoneNote) return "";
    return `<p class="hw-item__note hw-item__note--class">Im Unterricht: ${ui.escapeHtml(hw.classDoneNote)}</p>`;
  }

  function renderHomeworkItem(hw, editable) {
    const ui = UI();
    const isCompleting = state.hwCompletingId === String(hw.id);
    const overdue = !hw.done && hw.dueDate && hw.dueDate < todayIso();
    const overdueTag = overdue
      ? `<span class="hw-item__overdue">überfällig</span>`
      : "";

    if (hw.done) {
      return `
        <li class="hw-item hw-item--done">
          <div class="hw-item__main">
            <span class="hw-item__check" aria-hidden="true">✓</span>
            <div>
              <p class="hw-item__subject">${ui.escapeHtml(hw.subject)}</p>
              <p class="hw-item__title">${ui.escapeHtml(hw.title)}</p>
              ${homeworkClassNoteHtml(hw, ui)}
              ${hw.doneNote ? `<p class="hw-item__note">${ui.escapeHtml(hw.doneNote)}</p>` : ""}
            </div>
          </div>
        </li>`;
    }

    if (!editable) {
      return `
        <li class="hw-item">
          <div class="hw-item__main">
            <span class="hw-item__check hw-item__check--open" aria-hidden="true">○</span>
            <div>
              <p class="hw-item__subject">${ui.escapeHtml(hw.subject)} ${overdueTag}</p>
              <p class="hw-item__title">${ui.escapeHtml(hw.title)}</p>
              ${homeworkClassNoteHtml(hw, ui)}
            </div>
          </div>
        </li>`;
    }

    return `
      <li class="hw-item ${isCompleting ? "is-editing" : ""}">
        <div class="hw-item__main">
          <span class="hw-item__check hw-item__check--open" aria-hidden="true">○</span>
          <div class="hw-item__copy">
            <p class="hw-item__subject">${ui.escapeHtml(hw.subject)} ${overdueTag}</p>
            <p class="hw-item__title">${ui.escapeHtml(hw.title)}</p>
            ${homeworkClassNoteHtml(hw, ui)}
          </div>
          <div class="hw-item__actions">
            <button type="button" class="today-app-btn today-app-btn--ghost hw-btn" data-hw-complete="${ui.escapeHtml(hw.id)}">Erledigt</button>
            <button type="button" class="hw-btn-icon" data-hw-delete="${ui.escapeHtml(hw.id)}" aria-label="Löschen" title="Löschen">×</button>
          </div>
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
        }
      </li>`;
  }

  function renderHomeworkPanel(editable) {
    const ui = UI();
    const hw = state.data?.homework || { due: [], assigned: [] };
    const due = hw.due || [];
    const assigned = hw.assigned || [];
    const openDue = due.filter((h) => !h.done);
    const subjects = homeworkSubjects();
    const selectedSubject = state.hwSubject || subjects[0] || "";
    if (!state.hwSubject && selectedSubject) state.hwSubject = selectedSubject;
    const dueHint = formatDueHint(state.data?.nextSchoolDay);

    const subjectChips = subjects
      .map(
        (s) =>
          `<button type="button" class="choice-chip ${s === selectedSubject ? "is-active" : ""}" data-hw-subject="${ui.escapeHtml(s)}">${ui.escapeHtml(s)}</button>`
      )
      .join("");

    const dueSection =
      due.length > 0
        ? `
      <div class="hw-block">
        <div class="hw-block__head">
          <h3 class="hw-block__title">Heute fällig</h3>
          <p class="hw-block__sub">${openDue.length ? `${openDue.length} offen` : "Alles erledigt ✓"}</p>
        </div>
        <ul class="hw-list">${due.map((h) => renderHomeworkItem(h, editable)).join("")}</ul>
      </div>`
        : `
      <div class="hw-block hw-block--empty">
        <h3 class="hw-block__title">Heute fällig</h3>
        <p class="hw-block__hint">${editable ? "Keine fälligen Aufgaben – super. Du kannst unten welche für morgen setzen." : "Keine fälligen Hausaufgaben."}</p>
      </div>`;

    const assignSection = editable
      ? `
      <div class="hw-block">
        <div class="hw-block__head">
          <h3 class="hw-block__title">Für morgen vormerken</h3>
          <p class="hw-block__sub">Fällig ${ui.escapeHtml(dueHint || "nächster Schultag")}</p>
        </div>
        <p class="hw-block__hint">Was nimmst du mit – und was hast du schon im Unterricht geschafft?</p>
        <div class="hw-form">
          <div class="hw-field">
            <span class="hw-label" id="hwSubjectLabel">Fach</span>
            <div class="choice-chip-group hw-subject-chips" role="group" aria-labelledby="hwSubjectLabel">${subjectChips}</div>
          </div>
          <div class="hw-field">
            <label class="hw-label" for="hwTitleInput">Für zu Hause</label>
            <input id="hwTitleInput" class="hw-input" type="text" maxlength="300" placeholder="z. B. S. 42 Nr. 3–6" value="${ui.escapeHtml(state.hwTitle)}" autocomplete="off">
          </div>
          <div class="hw-field">
            <label class="hw-label" for="hwClassDoneInput">Im Unterricht erledigt <span class="hw-optional">optional</span></label>
            <input id="hwClassDoneInput" class="hw-input" type="text" maxlength="300" placeholder="z. B. Nr. 1–2 schon gemacht" value="${ui.escapeHtml(state.hwClassDone)}" autocomplete="off">
          </div>
          <button type="button" class="today-app-btn" id="hwAddBtn" ${state.hwBusy ? "disabled" : ""}>${state.hwBusy ? "Speichern…" : "Hausaufgabe setzen"}</button>
        </div>
        ${state.hwError ? `<p class="hw-msg hw-msg--err">${ui.escapeHtml(state.hwError)}</p>` : ""}
        ${state.hwMessage ? `<p class="hw-msg hw-msg--ok">${ui.escapeHtml(state.hwMessage)}</p>` : ""}
        ${
          assigned.length
            ? `<ul class="hw-list hw-list--assigned">
                ${assigned
                  .map(
                    (h) => `
                  <li class="hw-item hw-item--assigned">
                    <div class="hw-item__main">
                      <div>
                        <p class="hw-item__subject">${ui.escapeHtml(h.subject)} · bis ${ui.escapeHtml(formatDueHint(h.dueDate))}</p>
                        <p class="hw-item__title">${ui.escapeHtml(h.title)}</p>
                        ${homeworkClassNoteHtml(h, ui)}
                      </div>
                      ${
                        !h.done
                          ? `<button type="button" class="hw-btn-icon" data-hw-delete="${ui.escapeHtml(h.id)}" aria-label="Löschen" title="Löschen">×</button>`
                          : `<span class="hw-item__done-tag">✓</span>`
                      }
                    </div>
                  </li>`
                  )
                  .join("")}
              </ul>`
            : ""
        }
      </div>`
      : "";

    return `
      <section class="hw-panel" aria-label="Hausaufgaben">
        ${dueSection}
        ${assignSection}
      </section>`;
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
  }

  function bindHandlers(root) {
    root.querySelectorAll("[data-hw-subject]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.hwSubject = btn.dataset.hwSubject || "";
        root.querySelectorAll("[data-hw-subject]").forEach((chip) => {
          chip.classList.toggle("is-active", chip.dataset.hwSubject === state.hwSubject);
        });
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
    const subject = state.hwSubject || homeworkSubjects()[0] || "";
    const title = String(state.hwTitle || "").trim();
    const classDoneNote = String(state.hwClassDone || "").trim();
    state.hwError = "";
    state.hwMessage = "";

    if (!subject || !title) {
      state.hwError = "Bitte Fach und Aufgabe für zu Hause angeben.";
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
          dueDate: state.data?.nextSchoolDay
        })
      });
      const data = await res.json();
      state.hwBusy = false;
      if (!data.success) {
        state.hwError = data.message || "Speichern fehlgeschlagen.";
        render();
        return;
      }
      state.hwTitle = "";
      state.hwClassDone = "";
      state.hwMessage = "Gesetzt – morgen kannst du sie abhaken.";
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
    state.hwCompletingId = null;
    state.hwNoteDraft = "";
    state.hwMessage = "";
    state.hwError = "";
    loadDay();
  }

  window.LogbuchHomework = { init, reload: () => loadDay() };
})();
