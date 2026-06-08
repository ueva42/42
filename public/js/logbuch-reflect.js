/**
 * SRL-Logbuch – TAGESABSCHLUSS-Screen (Self-Reflection).
 */
(function () {
  const C = () => window.LOGBUCH;

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

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function optionButtons(items, selected, field) {
    return items
      .map((item) => {
        const value = item.id ?? item;
        const label = item.label ?? item;
        const active = selected === value;
        return `
          <button type="button" class="logbuch-opt logbuch-opt-reflect ${active ? "active" : ""}"
            data-field="${field}" data-value="${escapeHtml(value)}">
            ${escapeHtml(label)}
          </button>`;
      })
      .join("");
  }

  function formatDate(dateStr) {
    return new Date(dateStr + "T12:00:00").toLocaleDateString("de-DE", {
      weekday: "long",
      day: "2-digit",
      month: "2-digit"
    });
  }

  function renderDone() {
    const root = document.getElementById("reflect-screen-root");
    if (!root) return;

    const r = state.existingReflection;
    root.innerHTML = `
      <div class="logbuch-plan-form">
        <div class="logbuch-msg logbuch-msg-info">
          Reflexion für <b>${escapeHtml(state.entry.subject)}</b> ist bereits abgeschlossen.
          <br>Ziel erreicht: <b>${escapeHtml(r.goal_achieved)}</b>
        </div>
        <button type="button" class="logbuch-btn logbuch-btn-secondary" id="reflectBackBtn">
          Zurück zu Mein Tag
        </button>
      </div>`;

    root.querySelector("#reflectBackBtn")?.addEventListener("click", () => {
      window.StudentRouter?.navigateToSection("today");
    });
  }

  function renderMissing() {
    const root = document.getElementById("reflect-screen-root");
    if (!root) return;

    root.innerHTML = `
      <div class="logbuch-plan-form">
        <div class="logbuch-msg logbuch-msg-error">
          Kein Lern-Eintrag gefunden. Bitte zuerst ein Tagesziel setzen.
        </div>
        <button type="button" class="logbuch-btn logbuch-btn-secondary" id="reflectBackBtn">
          Zurück zu Mein Tag
        </button>
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

    const e = state.entry;
    const dateLabel = formatDate(e.date);
    const confidenceHint =
      e.confidence_before != null
        ? `<p class="logbuch-reflect-before">Selbstwirksamkeit vorher: <b>${e.confidence_before}</b>/5</p>`
        : "";

    root.innerHTML = `
      <div class="logbuch-plan-form logbuch-reflect-form">
        <p class="logbuch-plan-date">${escapeHtml(dateLabel)}${e.timeslot ? ` · ${escapeHtml(e.timeslot)}` : ""}</p>
        <div class="logbuch-reflect-goal">
          <span class="logbuch-reflect-subject">${escapeHtml(e.subject)}</span>
          <span class="logbuch-reflect-goal-text">${escapeHtml(e.goal)}</span>
        </div>
        ${confidenceHint}

        <section class="logbuch-field">
          <h3 class="logbuch-field-label">Ziel erreicht? <span class="req req-reflect">*</span></h3>
          <div class="logbuch-opt-grid">
            ${optionButtons(C().GOAL_ACHIEVED, state.goalAchieved, "goalAchieved")}
          </div>
        </section>

        <section class="logbuch-field">
          <h3 class="logbuch-field-label">Wie gearbeitet? <span class="req req-reflect">*</span></h3>
          <div class="logbuch-opt-grid logbuch-opt-grid-tall">
            ${optionButtons(C().HOW_WORKED, state.howWorked, "howWorked")}
          </div>
        </section>

        <section class="logbuch-field">
          <h3 class="logbuch-field-label">Nächster Schritt <span class="req req-reflect">*</span></h3>
          <div class="logbuch-opt-grid logbuch-opt-grid-tall">
            ${optionButtons(C().NEXT_STEPS, state.nextStep, "nextStep")}
          </div>
        </section>

        <section class="logbuch-field">
          <h3 class="logbuch-field-label">Selbstwirksamkeit nachher <span class="req req-reflect">*</span></h3>
          <div class="logbuch-confidence">
            ${[1, 2, 3, 4, 5]
              .map(
                (n) => `
              <button type="button" class="logbuch-conf-btn logbuch-conf-btn-reflect ${state.confidenceAfter === n ? "active" : ""}"
                data-field="confidenceAfter" data-value="${n}">${n}</button>`
              )
              .join("")}
          </div>
          <div class="logbuch-confidence-hint">
            <span>unsicher</span><span>sicher</span>
          </div>
        </section>

        <section class="logbuch-field">
          <h3 class="logbuch-field-label">Was habe ich gelernt? <span class="opt">optional</span></h3>
          <input type="text" class="logbuch-input" id="reflectLearned" maxlength="200"
            placeholder="Ein Satz…" value="${escapeHtml(state.learnedToday)}">
          <div class="logbuch-char-count"><span id="reflectLearnedCount">${state.learnedToday.length}</span>/200</div>
        </section>

        ${state.errorMsg ? `<div class="logbuch-msg logbuch-msg-error">${escapeHtml(state.errorMsg)}</div>` : ""}

        <button type="button" class="logbuch-btn logbuch-btn-reflect" id="reflectSubmitBtn" ${state.submitting ? "disabled" : ""}>
          ${state.submitting ? "Speichern…" : "Tagesabschluss speichern (+3 XP)"}
        </button>
        <button type="button" class="logbuch-btn logbuch-btn-secondary" id="reflectBackBtn">Abbrechen</button>
      </div>`;

    bindHandlers(root);
  }

  function bindHandlers(root) {
    root.querySelectorAll(".logbuch-opt").forEach((btn) => {
      btn.addEventListener("click", () => {
        const field = btn.dataset.field;
        const value = btn.dataset.value;
        state[field] = state[field] === value ? null : value;
        render();
      });
    });

    root.querySelectorAll(".logbuch-conf-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const n = Number(btn.dataset.value);
        state.confidenceAfter = state.confidenceAfter === n ? null : n;
        render();
      });
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
          confidenceAfter: state.confidenceAfter,
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
        root.innerHTML = `<div class="logbuch-msg logbuch-msg-error">Tagesabschluss konnte nicht geladen werden.</div>`;
      }
    }
  }

  window.LogbuchReflect = { init };
})();
