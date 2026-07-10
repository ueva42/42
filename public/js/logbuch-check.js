/**
 * SRL-Logbuch – ZWISCHEN-CHECK-Screen (Nachsteuern).
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
    nextStepAnswer: null,
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

  function levelLabel(value, entry) {
    if (entry?.level_label) return entry.level_label;
    if (value === "rookie") return "Rookie";
    if (value === "operator") return "Operator";
    if (value === "street_legend") return "Street Legend";
    return value || "–";
  }

  function selectOptions(items) {
    return items.map((label) => ({ value: label, label }));
  }

  function isLegacyCheck(check) {
    if (!check) return false;
    return [check.on_track, check.understands, check.progress].some((v) =>
      ["👍", "😐", "👎"].includes(v)
    );
  }

  function renderDailyGoalCard(ui, entry) {
    const whatGoal = entry.what_goal_text || "–";
    const level = levelLabel(entry.selected_level, entry);
    const levelGoal = entry.level_goal_text || "–";
    const howGoal = entry.how_goal_text || entry.goal || "–";
    const details = entry.details_text;

    return `
      <section class="check-daily-goal">
        <h3 class="check-daily-goal-title">Heutiges Ziel</h3>
        <div class="check-daily-goal-card">
          <p><strong>Was-Ziel:</strong><br>${ui.escapeHtml(whatGoal)}</p>
          <p><strong>Level:</strong><br>${ui.escapeHtml(level)}</p>
          <p><strong>Fachliches Ziel:</strong><br>${ui.escapeHtml(levelGoal)}</p>
          <p><strong>Mein Weg:</strong><br>${ui.escapeHtml(howGoal)}</p>
          ${
            details && String(details).trim()
              ? `<p><strong>Konkret:</strong><br>${ui.escapeHtml(String(details).trim())}</p>`
              : ""
          }
        </div>
      </section>`;
  }

  function renderDone() {
    const root = document.getElementById("check-screen-root");
    if (!root) return;
    const ui = UI();
    const c = state.existingCheck;
    const legacy = isLegacyCheck(c);

    const summary = legacy
      ? `${ui.escapeHtml(c.on_track)} ${ui.escapeHtml(c.understands)} ${ui.escapeHtml(c.progress)}${
          c.change_note ? `<br>${ui.escapeHtml(c.change_note)}` : ""
        }`
      : `
        <ul class="check-done-list">
          <li><strong>Auf dem richtigen Weg:</strong> ${ui.escapeHtml(c.on_track)}</li>
          <li><strong>Aufgaben verstanden:</strong> ${ui.escapeHtml(c.understands)}</li>
          <li><strong>Fortschritt:</strong> ${ui.escapeHtml(c.progress)}</li>
          <li><strong>Nächster Schritt:</strong> ${ui.escapeHtml(c.next_step_answer || "–")}</li>
        </ul>`;

    root.innerHTML = `
      <div class="logbuch-form">
        ${renderDailyGoalCard(ui, state.entry)}
        <div class="logbuch-msg logbuch-msg-info">
          Zwischen-Check für <b>${ui.escapeHtml(state.entry.subject)}</b> ist bereits abgeschlossen.
          <br>${summary}
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

  function allQuestionsAnswered() {
    return !!(state.onTrack && state.understands && state.progress && state.nextStepAnswer);
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

        ${renderDailyGoalCard(ui, e)}

        ${ui.fieldWrap(
          ui.fieldLabel("Bin ich auf dem richtigen Weg?", { required: true }),
          ui.select("onTrack", selectOptions(C().CHECK_ON_TRACK), state.onTrack, {
            phase: "check",
            placeholder: "Bitte wählen…"
          })
        )}

        ${ui.fieldWrap(
          ui.fieldLabel("Verstehe ich die Aufgaben?", { required: true }),
          ui.select("understands", selectOptions(C().CHECK_UNDERSTANDING), state.understands, {
            phase: "check",
            placeholder: "Bitte wählen…"
          })
        )}

        ${ui.fieldWrap(
          ui.fieldLabel("Komme ich gut voran?", { required: true }),
          ui.select("progress", selectOptions(C().CHECK_PROGRESS), state.progress, {
            phase: "check",
            placeholder: "Bitte wählen…"
          })
        )}

        ${ui.fieldWrap(
          ui.fieldLabel("Was mache ich jetzt?", { required: true }),
          ui.select(
            "nextStepAnswer",
            selectOptions(C().CHECK_NEXT_STEP),
            state.nextStepAnswer,
            { phase: "check", placeholder: "Nächsten Schritt wählen…" }
          ),
          "Wähle, wie du jetzt weitermachst."
        )}

        ${state.errorMsg ? ui.msg(state.errorMsg) : ""}

        ${ui.btnPrimary(
          state.submitting ? "Speichern…" : "Zwischen-Check speichern (+3 XP)",
          "checkSubmitBtn",
          state.submitting || !allQuestionsAnswered(),
          "logbuch-submit-full"
        )}
        ${ui.btnGhost("Abbrechen", "checkBackBtn")}
      </div>`;

    bindHandlers(root);
  }

  function bindHandlers(root) {
    UI().bindSelects(root, state, () => {
      const submitBtn = root.querySelector("#checkSubmitBtn");
      if (submitBtn) {
        submitBtn.disabled = state.submitting || !allQuestionsAnswered();
      }
    });

    root.querySelector("#checkSubmitBtn")?.addEventListener("click", submitCheck);
    root.querySelector("#checkBackBtn")?.addEventListener("click", () => {
      window.StudentRouter?.navigateToSection("today");
    });
  }

  async function submitCheck() {
    if (!allQuestionsAnswered()) {
      state.errorMsg = "Bitte beantworte alle vier Fragen.";
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
          nextStepAnswer: state.nextStepAnswer
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
    state.nextStepAnswer = null;
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
