/**
 * SRL-Logbuch – ZWISCHEN-CHECK-Screen (Performance).
 */
(function () {
  const C = () => window.LOGBUCH;
  const UI = () => window.LogbuchUI;

  const state = {
    entryId: null,
    entry: null,
    existingCheck: null,
    onTrack: null,
    understands: null,
    progress: null,
    changeNote: "",
    submitting: false,
    errorMsg: ""
  };

  function formatDate(dateStr) {
    const iso =
      dateStr instanceof Date
        ? dateStr.toISOString().slice(0, 10)
        : String(dateStr).slice(0, 10);
    return new Date(`${iso}T12:00:00`).toLocaleDateString("de-DE", {
      weekday: "long",
      day: "2-digit",
      month: "2-digit"
    });
  }

  function needsChangeNote() {
    return [state.onTrack, state.understands, state.progress].includes("👎");
  }

  function ratingOptions() {
    return C().CHECK_RATINGS.map((r) => ({ value: r.id, label: r.label }));
  }

  function renderDone() {
    const root = document.getElementById("check-screen-root");
    if (!root) return;
    const ui = UI();
    const c = state.existingCheck;

    root.innerHTML = `
      <div class="logbuch-form">
        <div class="logbuch-msg logbuch-msg-info">
          Zwischen-Check für <b>${ui.escapeHtml(state.entry.subject)}</b> ist bereits abgeschlossen.
          <br>${ui.escapeHtml(c.on_track)} ${ui.escapeHtml(c.understands)} ${ui.escapeHtml(c.progress)}
        </div>
        ${ui.btnGhost("Zurück zu Mein Tag", "checkBackBtn")}
      </div>`;

    root.querySelector("#checkBackBtn")?.addEventListener("click", () => {
      window.StudentRouter?.navigateToSection("today");
    });
  }

  function renderMissing() {
    const root = document.getElementById("check-screen-root");
    if (!root) return;
    const ui = UI();

    root.innerHTML = `
      <div class="logbuch-form">
        ${ui.msg("Kein Lern-Eintrag gefunden. Bitte zuerst ein Tagesziel setzen.")}
        ${ui.btnGhost("Zurück zu Mein Tag", "checkBackBtn")}
      </div>`;

    root.querySelector("#checkBackBtn")?.addEventListener("click", () => {
      window.StudentRouter?.navigateToSection("today");
    });
  }

  function render() {
    const root = document.getElementById("check-screen-root");
    if (!root) return;

    if (!state.entry) {
      renderMissing();
      return;
    }

    if (state.existingCheck) {
      renderDone();
      return;
    }

    const ui = UI();
    const e = state.entry;
    const dateIso =
      e.date instanceof Date
        ? e.date.toISOString().slice(0, 10)
        : String(e.date).slice(0, 10);

    root.innerHTML = `
      <div class="logbuch-form">
        <p class="logbuch-meta">${ui.escapeHtml(formatDate(dateIso))}${e.timeslot ? ` · ${ui.escapeHtml(e.timeslot)}` : ""}</p>
        <div class="logbuch-reflect-goal logbuch-check-goal">
          <span class="logbuch-reflect-subject">${ui.escapeHtml(e.subject)}</span>
          <span class="logbuch-reflect-goal-text">${ui.escapeHtml(e.goal)}</span>
        </div>

        ${ui.fieldWrap(
          ui.fieldLabel("Ich bin auf dem richtigen Weg", { required: true }),
          ui.select("onTrack", ratingOptions(), state.onTrack, { phase: "check" })
        )}

        ${ui.fieldWrap(
          ui.fieldLabel("Ich verstehe die Aufgaben", { required: true }),
          ui.select("understands", ratingOptions(), state.understands, { phase: "check" })
        )}

        ${ui.fieldWrap(
          ui.fieldLabel("Ich komme gut voran", { required: true }),
          ui.select("progress", ratingOptions(), state.progress, { phase: "check" })
        )}

        ${
          needsChangeNote()
            ? ui.fieldWrap(
                ui.fieldLabel("Was ändere ich jetzt?", { required: true }),
                `<input type="text" class="logbuch-input" id="checkChangeNote" maxlength="200"
                  placeholder="Kurz notieren…" value="${ui.escapeHtml(state.changeNote)}">`,
                "",
                { wide: true }
              )
            : ""
        }

        ${state.errorMsg ? ui.msg(state.errorMsg) : ""}

        ${ui.btnPrimary(
          state.submitting ? "Speichern…" : "Zwischen-Check speichern (+3 XP)",
          "checkSubmitBtn",
          state.submitting,
          "logbuch-submit-full"
        )}
        ${ui.btnGhost("Abbrechen", "checkBackBtn")}
      </div>`;

    bindHandlers(root);
  }

  function bindHandlers(root) {
    UI().bindSelects(root, state, () => {
      if (needsChangeNote() !== !!root.querySelector("#checkChangeNote")) {
        render();
      }
    });

    const note = root.querySelector("#checkChangeNote");
    note?.addEventListener("input", () => {
      state.changeNote = note.value.slice(0, 200);
    });

    root.querySelector("#checkSubmitBtn")?.addEventListener("click", submitCheck);
    root.querySelector("#checkBackBtn")?.addEventListener("click", () => {
      window.StudentRouter?.navigateToSection("today");
    });
  }

  async function submitCheck() {
    if (!state.onTrack || !state.understands || !state.progress) {
      state.errorMsg = "Bitte beantworte alle drei Fragen.";
      render();
      return;
    }

    if (needsChangeNote() && !state.changeNote.trim()) {
      state.errorMsg = "Bitte notiere, was du jetzt änderst.";
      render();
      return;
    }

    state.errorMsg = "";
    state.submitting = true;
    render();

    try {
      const res = await fetch("/api/student/log/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          logEntryId: state.entryId,
          onTrack: state.onTrack,
          understands: state.understands,
          progress: state.progress,
          changeNote: state.changeNote.trim() || null
        })
      });

      const data = await res.json();

      if (!data.success) {
        state.submitting = false;
        state.errorMsg = data.message || "Speichern fehlgeschlagen.";
        render();
        return;
      }

      if (typeof window.loadMe === "function") {
        await window.loadMe();
      }

      window.StudentRouter?.navigateToSection("today");
    } catch (err) {
      console.error(err);
      state.submitting = false;
      state.errorMsg = "Netzwerkfehler – bitte erneut versuchen.";
      render();
    }
  }

  async function init(query) {
    const q = query || new URLSearchParams(location.search);
    state.entryId = q.get("entryId") || null;
    state.onTrack = null;
    state.understands = null;
    state.progress = null;
    state.changeNote = "";
    state.entry = null;
    state.existingCheck = null;
    state.submitting = false;
    state.errorMsg = "";

    const root = document.getElementById("check-screen-root");
    if (root) {
      root.innerHTML = `<div class="logbuch-loading">Lade Zwischen-Check…</div>`;
    }

    if (!state.entryId) {
      renderMissing();
      return;
    }

    try {
      const res = await fetch(
        `/api/student/log/check-context?entryId=${encodeURIComponent(state.entryId)}`
      );
      const data = await res.json();

      if (!data.entry) {
        renderMissing();
        return;
      }

      state.entry = data.entry;
      state.existingCheck = data.existingCheck || null;
      render();
    } catch (err) {
      console.error(err);
      if (root) {
        root.innerHTML = UI().msg("Zwischen-Check konnte nicht geladen werden.");
      }
    }
  }

  window.LogbuchCheck = { init };
})();
