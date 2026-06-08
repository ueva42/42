/**
 * SRL-Logbuch – TAGESABSCHLUSS-Screen (Self-Reflection).
 */
(function () {
  const C = () => window.LOGBUCH;
  const UI = () => window.LogbuchUI;

  const state = {
    entryId: null,
    entry: null,
    existingReflection: null,
    goalAchieved: null,
    howWorked: null,
    nextStep: null,
    confidenceAfter: null,
    learnedToday: "",
    submitting: false,
    errorMsg: ""
  };

  function formatDate(dateStr) {
    return new Date(dateStr + "T12:00:00").toLocaleDateString("de-DE", {
      weekday: "long",
      day: "2-digit",
      month: "2-digit"
    });
  }

  function mapOptions(items) {
    return items.map((item) => ({
      value: item.id ?? item,
      label: item.label ?? item
    }));
  }

  function renderDone() {
    const root = document.getElementById("reflect-screen-root");
    if (!root) return;
    const ui = UI();
    const r = state.existingReflection;

    root.innerHTML = `
      <div class="logbuch-form">
        <div class="logbuch-msg logbuch-msg-info">
          Reflexion für <b>${ui.escapeHtml(state.entry.subject)}</b> ist bereits abgeschlossen.
          <br>Ziel erreicht: <b>${ui.escapeHtml(r.goal_achieved)}</b>
        </div>
        ${ui.btnGhost("Zurück zu Mein Tag", "reflectBackBtn")}
      </div>`;

    root.querySelector("#reflectBackBtn")?.addEventListener("click", () => {
      window.StudentRouter?.navigateToSection("today");
    });
  }

  function renderMissing() {
    const root = document.getElementById("reflect-screen-root");
    if (!root) return;
    const ui = UI();

    root.innerHTML = `
      <div class="logbuch-form">
        ${ui.msg("Kein Lern-Eintrag gefunden. Bitte zuerst ein Tagesziel setzen.")}
        ${ui.btnGhost("Zurück zu Mein Tag", "reflectBackBtn")}
      </div>`;

    root.querySelector("#reflectBackBtn")?.addEventListener("click", () => {
      window.StudentRouter?.navigateToSection("today");
    });
  }

  function render() {
    const root = document.getElementById("reflect-screen-root");
    if (!root) return;

    if (!state.entry) {
      renderMissing();
      return;
    }

    if (state.existingReflection) {
      renderDone();
      return;
    }

    const ui = UI();
    const e = state.entry;
    const dateLabel = formatDate(e.date);
    const confidenceHint =
      e.confidence_before != null
        ? `<p class="logbuch-reflect-before">Selbstwirksamkeit vorher: <b>${e.confidence_before}</b>/5</p>`
        : "";

    root.innerHTML = `
      <div class="logbuch-form">
        <p class="logbuch-meta">${ui.escapeHtml(dateLabel)}${e.timeslot ? ` · ${ui.escapeHtml(e.timeslot)}` : ""}</p>
        <div class="logbuch-reflect-goal">
          <span class="logbuch-reflect-subject">${ui.escapeHtml(e.subject)}</span>
          <span class="logbuch-reflect-goal-text">${ui.escapeHtml(e.goal)}</span>
        </div>
        ${confidenceHint}

        ${ui.fieldWrap(
          ui.fieldLabel("Ziel erreicht?", { required: true }),
          ui.select("goalAchieved", mapOptions(C().GOAL_ACHIEVED), state.goalAchieved, { phase: "reflect" })
        )}

        ${ui.fieldWrap(
          ui.fieldLabel("Wie gearbeitet?", { required: true }),
          ui.select("howWorked", mapOptions(C().HOW_WORKED), state.howWorked, { phase: "reflect" })
        )}

        ${ui.fieldWrap(
          ui.fieldLabel("Nächster Schritt", { required: true }),
          ui.select("nextStep", mapOptions(C().NEXT_STEPS), state.nextStep, { phase: "reflect" })
        )}

        ${ui.fieldWrap(
          ui.fieldLabel("Selbstwirksamkeit nachher", { required: true }),
          ui.select(
            "confidenceAfter",
            [1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: `${n} – ${n <= 2 ? "unsicher" : n >= 4 ? "sicher" : "mittel"}` })),
            state.confidenceAfter != null ? String(state.confidenceAfter) : null,
            { phase: "reflect" }
          )
        )}

        ${ui.fieldWrap(
          ui.fieldLabel("Was habe ich gelernt?", { optional: true }),
          `<input type="text" class="logbuch-input" id="reflectLearned" maxlength="200"
            placeholder="Ein Satz…" value="${ui.escapeHtml(state.learnedToday)}">
           <div class="logbuch-char-count"><span id="reflectLearnedCount">${state.learnedToday.length}</span>/200</div>`,
          "",
          { wide: true }
        )}

        ${state.errorMsg ? ui.msg(state.errorMsg) : ""}

        ${ui.btnPrimary(
          state.submitting ? "Speichern…" : "Tagesabschluss speichern (+3 XP)",
          "reflectSubmitBtn",
          state.submitting,
          "logbuch-submit-full"
        )}
        ${ui.btnGhost("Abbrechen", "reflectBackBtn")}
      </div>`;

    bindHandlers(root);
  }

  function bindHandlers(root) {
    UI().bindSelects(root, state, (field) => {
      if (field === "confidenceAfter" && state.confidenceAfter != null) {
        state.confidenceAfter = Number(state.confidenceAfter);
      }
    });

    const learned = root.querySelector("#reflectLearned");
    learned?.addEventListener("input", () => {
      state.learnedToday = learned.value.slice(0, 200);
      const count = root.querySelector("#reflectLearnedCount");
      if (count) count.textContent = String(state.learnedToday.length);
    });

    root.querySelector("#reflectSubmitBtn")?.addEventListener("click", submitReflect);
    root.querySelector("#reflectBackBtn")?.addEventListener("click", () => {
      window.StudentRouter?.navigateToSection("today");
    });
  }

  async function submitReflect() {
    if (!state.goalAchieved) {
      state.errorMsg = "Bitte wähle, ob du dein Ziel erreicht hast.";
      render();
      return;
    }
    if (!state.howWorked) {
      state.errorMsg = "Bitte wähle, wie du gearbeitet hast.";
      render();
      return;
    }
    if (!state.nextStep) {
      state.errorMsg = "Bitte wähle den nächsten Schritt.";
      render();
      return;
    }
    if (state.confidenceAfter == null) {
      state.errorMsg = "Bitte wähle deine Selbstwirksamkeit nachher.";
      render();
      return;
    }

    state.errorMsg = "";
    state.submitting = true;
    render();

    try {
      const res = await fetch("/api/student/log/reflect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          logEntryId: state.entryId,
          goalAchieved: state.goalAchieved,
          howWorked: state.howWorked,
          nextStep: state.nextStep,
          confidenceAfter: Number(state.confidenceAfter),
          learnedToday: state.learnedToday.trim() || null
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
    state.goalAchieved = null;
    state.howWorked = null;
    state.nextStep = null;
    state.confidenceAfter = null;
    state.learnedToday = "";
    state.entry = null;
    state.existingReflection = null;
    state.submitting = false;
    state.errorMsg = "";

    const root = document.getElementById("reflect-screen-root");
    if (root) {
      root.innerHTML = `<div class="logbuch-loading">Lade Tagesabschluss…</div>`;
    }

    if (!state.entryId) {
      renderMissing();
      return;
    }

    try {
      const res = await fetch(
        `/api/student/log/reflect-context?entryId=${encodeURIComponent(state.entryId)}`
      );
      const data = await res.json();

      if (!data.entry) {
        renderMissing();
        return;
      }

      state.entry = data.entry;
      state.existingReflection = data.existingReflection || null;
      render();
    } catch (err) {
      console.error(err);
      if (root) {
        root.innerHTML = UI().msg("Tagesabschluss konnte nicht geladen werden.");
      }
    }
  }

  window.LogbuchReflect = { init };
})();
