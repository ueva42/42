/**
 * SRL-Logbuch – ZWISCHEN-CHECK-Screen (Performance).
 */
(function () {
  const C = () => window.LOGBUCH;

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

  function escapeHtml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

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

  function renderRatingRow(question, field) {
    return `
      <section class="logbuch-field">
        <h3 class="logbuch-field-label">${escapeHtml(question)} <span class="req req-check">*</span></h3>
        <div class="logbuch-rating-row">
          ${C().CHECK_RATINGS.map((r) => {
            const active = state[field] === r.id;
            return `
              <button type="button" class="logbuch-rating-btn ${active ? "active" : ""}"
                data-field="${field}" data-value="${escapeHtml(r.id)}">
                ${r.label}
              </button>`;
          }).join("")}
        </div>
      </section>`;
  }

  function renderDone() {
    const root = document.getElementById("check-screen-root");
    if (!root) return;

    const c = state.existingCheck;
    root.innerHTML = `
      <div class="logbuch-plan-form">
        <div class="logbuch-msg logbuch-msg-info">
          Zwischen-Check für <b>${escapeHtml(state.entry.subject)}</b> ist bereits abgeschlossen.
          <br>${escapeHtml(c.on_track)} ${escapeHtml(c.understands)} ${escapeHtml(c.progress)}
        </div>
        <button type="button" class="logbuch-btn logbuch-btn-secondary" id="checkBackBtn">
          Zurück zu Mein Tag
        </button>
      </div>`;

    root.querySelector("#checkBackBtn")?.addEventListener("click", () => {
      window.StudentRouter?.navigateToSection("today");
    });
  }

  function renderMissing() {
    const root = document.getElementById("check-screen-root");
    if (!root) return;

    root.innerHTML = `
      <div class="logbuch-plan-form">
        <div class="logbuch-msg logbuch-msg-error">
          Kein Lern-Eintrag gefunden. Bitte zuerst ein Tagesziel setzen.
        </div>
        <button type="button" class="logbuch-btn logbuch-btn-secondary" id="checkBackBtn">
          Zurück zu Mein Tag
        </button>
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

    const e = state.entry;
    const dateIso =
      e.date instanceof Date
        ? e.date.toISOString().slice(0, 10)
        : String(e.date).slice(0, 10);

    root.innerHTML = `
      <div class="logbuch-plan-form logbuch-check-form">
        <p class="logbuch-plan-date">${escapeHtml(formatDate(dateIso))}${e.timeslot ? ` · ${escapeHtml(e.timeslot)}` : ""}</p>
        <div class="logbuch-reflect-goal logbuch-check-goal">
          <span class="logbuch-reflect-subject">${escapeHtml(e.subject)}</span>
          <span class="logbuch-reflect-goal-text">${escapeHtml(e.goal)}</span>
        </div>

        ${renderRatingRow("Ich bin auf dem richtigen Weg", "onTrack")}
        ${renderRatingRow("Ich verstehe die Aufgaben", "understands")}
        ${renderRatingRow("Ich komme gut voran", "progress")}

        ${
          needsChangeNote()
            ? `
          <section class="logbuch-field">
            <h3 class="logbuch-field-label">Was ändere ich jetzt? <span class="req req-check">*</span></h3>
            <input type="text" class="logbuch-input" id="checkChangeNote" maxlength="200"
              placeholder="Kurz notieren…" value="${escapeHtml(state.changeNote)}">
          </section>`
            : ""
        }

        ${state.errorMsg ? `<div class="logbuch-msg logbuch-msg-error">${escapeHtml(state.errorMsg)}</div>` : ""}

        <button type="button" class="logbuch-btn logbuch-btn-check" id="checkSubmitBtn" ${state.submitting ? "disabled" : ""}>
          ${state.submitting ? "Speichern…" : "Zwischen-Check speichern (+3 XP)"}
        </button>
        <button type="button" class="logbuch-btn logbuch-btn-secondary" id="checkBackBtn">Abbrechen</button>
      </div>`;

    bindHandlers(root);
  }

  function bindHandlers(root) {
    root.querySelectorAll(".logbuch-rating-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const field = btn.dataset.field;
        const value = btn.dataset.value;
        state[field] = state[field] === value ? null : value;
        render();
      });
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
        root.innerHTML = `<div class="logbuch-msg logbuch-msg-error">Zwischen-Check konnte nicht geladen werden.</div>`;
      }
    }
  }

  window.LogbuchCheck = { init };
})();
