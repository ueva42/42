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

  function labelForOption(items, id) {
    const hit = items.find((item) => (item.id ?? item) === id);
    return hit?.label ?? id ?? "–";
  }

  function applyReflectionToState(reflection) {
    if (!reflection) return false;
    state.goalAchieved = reflection.goal_achieved;
    state.howWorked = reflection.how_worked;
    state.nextStep = reflection.next_step;
    state.confidenceAfter = reflection.confidence_after;
    state.learnedToday = reflection.learned_today || "";
    return true;
  }

  function renderReflectionDetails(ui, r) {
    const rows = [
      ["Ziel erreicht?", labelForOption(C().GOAL_ACHIEVED, r.goal_achieved)],
      ["Wie gearbeitet?", labelForOption(C().HOW_WORKED, r.how_worked)],
      ["Nächster Schritt", labelForOption(C().NEXT_STEPS, r.next_step)],
      ["Selbstwirksamkeit nachher", r.confidence_after != null ? `${r.confidence_after}/5` : "–"],
      ["Was habe ich gelernt?", r.learned_today || "–"]
    ];

    return `
      <dl class="plan-readonly-list">
        ${rows
          .map(
            ([label, value]) => `
          <div class="plan-readonly-row">
            <dt>${ui.escapeHtml(label)}</dt>
            <dd>${ui.escapeHtml(value)}</dd>
          </div>`
          )
          .join("")}
      </dl>`;
  }

  function renderReadOnly() {
    const root = document.getElementById("reflect-screen-root");
    if (!root) return;
    const ui = UI();
    const r = state.existingReflection;
    const e = state.entry;
    const dateLabel = formatDate(e.date);
    const confidenceHint =
      e.confidence_before != null
        ? `<p class="logbuch-reflect-before">Selbstwirksamkeit vorher: <b>${e.confidence_before}</b>/5</p>`
        : "";

    root.innerHTML = `
      <div class="logbuch-form logbuch-form-readonly">
        <p class="logbuch-meta">${ui.escapeHtml(dateLabel)}${e.timeslot ? ` · ${ui.escapeHtml(e.timeslot)}` : ""}</p>
        <div class="logbuch-reflect-goal">
          <span class="logbuch-reflect-subject">${ui.escapeHtml(e.subject)}</span>
          <span class="logbuch-reflect-goal-text">${ui.escapeHtml(e.goal)}</span>
        </div>
        ${confidenceHint}
        <div class="logbuch-msg logbuch-msg-info">
          Deine Reflexion für <b>${ui.escapeHtml(e.subject)}</b> (nur Ansicht)
        </div>
        ${renderReflectionDetails(ui, r)}
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
      if (state.existingReflection.canEdit && applyReflectionToState(state.existingReflection)) {
        // Bearbeitungsmodus
      } else {
        renderReadOnly();
        return;
      }
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

        ${
          state.existingReflection?.canEdit
            ? `<div class="logbuch-msg logbuch-msg-info">Du bearbeitest deine Reflexion – beim Speichern gibt es kein zusätzliches XP.</div>`
            : ""
        }

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
          state.submitting
            ? "Speichern…"
            : state.existingReflection?.canEdit
              ? "Reflexion speichern"
              : "Tagesabschluss speichern (+3 XP)",
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

    const payload = {
      logEntryId: state.entryId,
      goalAchieved: state.goalAchieved,
      howWorked: state.howWorked,
      nextStep: state.nextStep,
      confidenceAfter: Number(state.confidenceAfter),
      learnedToday: state.learnedToday.trim() || null
    };

    const isEdit = !!state.existingReflection?.canEdit;

    try {
      const res = await fetch(
        isEdit
          ? `/api/student/log/reflect/${encodeURIComponent(state.entryId)}`
          : "/api/student/log/reflect",
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        }
      );

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
      if (state.existingReflection?.canEdit) {
        applyReflectionToState(state.existingReflection);
      }
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
