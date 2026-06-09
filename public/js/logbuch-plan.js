/**
 * SRL-Logbuch – PLANEN-Screen (Forethought).
 */
(function () {
  const C = () => window.LOGBUCH;
  const UI = () => window.LogbuchUI;

  const state = {
    date: null,
    timeslot: null,
    subject: null,
    goal: null,
    workGoals: [],
    socialForm: null,
    strategy: null,
    confidenceBefore: null,
    freitext: "",
    socialUnlock: { gruppe: false, frei: false },
    existingEntry: null,
    submitting: false,
    errorMsg: ""
  };

  function todayIso() {
    return new Date().toISOString().slice(0, 10);
  }

  function socialFormOptions() {
    return C().SOCIAL_FORMS.map((sf) => {
      const locked = sf.unlockKey && !state.socialUnlock[sf.unlockKey];
      return {
        value: sf.id,
        label: locked ? `${sf.label} (Silber/Gold)` : sf.label,
        disabled: locked
      };
    });
  }

  function labelForSocialForm(id) {
    return C().SOCIAL_FORMS.find((s) => s.id === id)?.label || id || "–";
  }

  function renderExistingEntry(ui, dateLabel) {
    const e = state.existingEntry;
    const workGoals = Array.isArray(e.work_goals) ? e.work_goals : [];
    const rows = [
      ["Fach", e.subject],
      ["Stundenziel", e.goal],
      ["Arbeitsziele", workGoals.length ? workGoals.join(", ") : "–"],
      ["Sozialform", e.social_form ? labelForSocialForm(e.social_form) : "–"],
      ["Lernstrategie", e.strategy || "–"],
      [
        "Selbstwirksamkeit vorher",
        e.confidence_before != null ? String(e.confidence_before) : "–"
      ],
      ["Was genau?", e.freitext || "–"]
    ];

    return `
      <div class="logbuch-form logbuch-form-readonly">
        <p class="logbuch-meta">${ui.escapeHtml(dateLabel)}${e.timeslot ? ` · ${ui.escapeHtml(e.timeslot)}` : ""}</p>
        <div class="logbuch-msg logbuch-msg-info">Dein Tagesziel (nur Ansicht – nicht änderbar)</div>
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
        </dl>
        ${ui.btnGhost("Zurück zu Mein Tag", "planBackBtn")}
      </div>`;
  }

  function render() {
    const root = document.getElementById("plan-screen-root");
    if (!root) return;

    const ui = UI();
    const dateLabel = new Date(state.date + "T12:00:00").toLocaleDateString("de-DE", {
      weekday: "long",
      day: "2-digit",
      month: "2-digit"
    });

    if (state.existingEntry) {
      root.innerHTML = renderExistingEntry(ui, dateLabel);
      bindStaticHandlers(root);
      return;
    }

    root.innerHTML = `
      <div class="logbuch-form">
        <p class="logbuch-meta">${ui.escapeHtml(dateLabel)}${state.timeslot ? ` · ${ui.escapeHtml(state.timeslot)}` : ""}</p>

        ${ui.fieldWrap(
          ui.fieldLabel("Fach", { required: true }),
          ui.select("subject", C().SUBJECTS.map((s) => ({ value: s, label: s })), state.subject, { phase: "plan" })
        )}

        ${ui.fieldWrap(
          ui.fieldLabel("Stundenziel", { required: true }),
          ui.select("goal", C().GOALS.map((g) => ({ value: g, label: g })), state.goal, { phase: "plan" })
        )}

        ${ui.fieldWrap(
          ui.fieldLabel("Arbeitsziele", { optional: true }),
          ui.select(
            "workGoals",
            C().WORK_GOALS.map((g) => ({ value: g, label: g })),
            state.workGoals,
            { multiple: true, size: 4, hidePlaceholder: true, phase: "plan" }
          ),
          "Mehrere mit Strg/Cmd wählen",
          { wide: true }
        )}

        ${ui.fieldWrap(
          ui.fieldLabel("Sozialform", { optional: true }),
          ui.select("socialForm", socialFormOptions(), state.socialForm, { phase: "plan" })
        )}

        ${ui.fieldWrap(
          ui.fieldLabel("Lernstrategie", { optional: true }),
          ui.selectOptgroups("strategy", C().STRATEGIES, state.strategy, { phase: "plan" }),
          "",
          { wide: true }
        )}

        ${ui.fieldWrap(
          ui.fieldLabel("Selbstwirksamkeit vorher", { optional: true }),
          ui.select(
            "confidenceBefore",
            [1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: `${n} – ${n <= 2 ? "unsicher" : n >= 4 ? "sicher" : "mittel"}` })),
            state.confidenceBefore != null ? String(state.confidenceBefore) : null,
            { phase: "plan" }
          )
        )}

        ${ui.fieldWrap(
          ui.fieldLabel("Was genau?", { optional: true }),
          `<input type="text" class="logbuch-input" id="planFreitext" maxlength="100"
            placeholder="Kurz beschreiben…" value="${ui.escapeHtml(state.freitext)}">
           <div class="logbuch-char-count"><span id="planFreitextCount">${state.freitext.length}</span>/100</div>`,
          "",
          { wide: true }
        )}

        ${state.errorMsg ? ui.msg(state.errorMsg) : ""}

        ${ui.btnPrimary(
          state.submitting ? "Speichern…" : "Tagesziel speichern (+2 XP)",
          "planSubmitBtn",
          state.submitting,
          "logbuch-submit-full"
        )}
        ${ui.btnGhost("Abbrechen", "planBackBtn")}
      </div>`;

    bindHandlers(root);
  }

  function bindStaticHandlers(root) {
    root.querySelector("#planBackBtn")?.addEventListener("click", () => {
      window.StudentRouter?.navigateToSection("today");
    });
  }

  function bindHandlers(root) {
    UI().bindSelects(root, state);

    const freitext = root.querySelector("#planFreitext");
    freitext?.addEventListener("input", () => {
      state.freitext = freitext.value.slice(0, 100);
      const count = root.querySelector("#planFreitextCount");
      if (count) count.textContent = String(state.freitext.length);
    });

    root.querySelector("#planSubmitBtn")?.addEventListener("click", submitPlan);
    root.querySelector("#planBackBtn")?.addEventListener("click", () => {
      window.StudentRouter?.navigateToSection("today");
    });
  }

  async function submitPlan() {
    if (!state.subject) {
      state.errorMsg = "Bitte wähle ein Fach.";
      render();
      return;
    }
    if (!state.goal) {
      state.errorMsg = "Bitte wähle ein Stundenziel.";
      render();
      return;
    }

    if (state.confidenceBefore != null) {
      state.confidenceBefore = Number(state.confidenceBefore);
    }

    state.errorMsg = "";
    state.submitting = true;
    render();

    try {
      const res = await fetch("/api/student/log/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: state.date,
          timeslot: state.timeslot || null,
          subject: state.subject,
          goal: state.goal,
          workGoals: state.workGoals,
          socialForm: state.socialForm,
          strategy: state.strategy,
          confidenceBefore:
            state.confidenceBefore != null ? Number(state.confidenceBefore) : null,
          freitext: state.freitext.trim() || null
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

  async function loadContext(query) {
    const params = new URLSearchParams({
      date: state.date,
      ...(state.timeslot ? { timeslot: state.timeslot } : {}),
      ...(state.subject ? { subject: state.subject } : {})
    });

    const res = await fetch(`/api/student/log/plan-context?${params}`);
    const data = await res.json();

    state.socialUnlock = data.socialUnlock || { gruppe: false, frei: false };
    state.existingEntry = data.existingEntry || null;

    if (!state.subject && data.suggestedSubject) {
      state.subject = data.suggestedSubject;
    }
  }

  async function init(query) {
    const q = query || new URLSearchParams(location.search);

    state.date = q.get("date") || todayIso();
    state.timeslot = q.get("timeslot") || null;
    state.subject = q.get("subject") || null;
    state.goal = null;
    state.workGoals = [];
    state.socialForm = null;
    state.strategy = null;
    state.confidenceBefore = null;
    state.freitext = "";
    state.existingEntry = null;
    state.submitting = false;
    state.errorMsg = "";

    const root = document.getElementById("plan-screen-root");
    if (root) {
      root.innerHTML = `<div class="logbuch-loading">Lade Planung…</div>`;
    }

    try {
      await loadContext(q);
      render();
    } catch (err) {
      console.error(err);
      if (root) {
        root.innerHTML = UI().msg("Planung konnte nicht geladen werden.");
      }
    }
  }

  window.LogbuchPlan = { init };
})();
