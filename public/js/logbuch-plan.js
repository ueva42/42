/**
 * SRL-Logbuch – PLANEN-Screen (Tagesziel aus Levelplan + Nachweis).
 */
(function () {
  const C = () => window.LOGBUCH;
  const UI = () => window.LogbuchUI;
  const HOW_GOAL_OPTIONS = [
    "Ich starte mit Rookie-Aufgaben.",
    "Ich löse erst Aufgaben mit Hilfe und danach alleine.",
    "Ich bearbeite Operator-Aufgaben.",
    "Ich versuche eine Street-Legend-Aufgabe.",
    "Ich vergleiche meinen Rechenweg mit der Musterlösung.",
    "Ich suche gezielt meine Fehler.",
    "Ich schreibe meinen Rechenweg sauber auf.",
    "Ich erkläre am Ende eine Aufgabe jemandem.",
    "Ich schaue ein Lernvideo und notiere drei wichtige Punkte.",
    "Ich wiederhole ein unsicheres Unterthema."
  ];

  const LEVEL_OPTIONS = [
    { value: "rookie", label: "Rookie" },
    { value: "operator", label: "Operator" },
    { value: "street_legend", label: "Street Legend" }
  ];

  const state = {
    date: null,
    timeslot: null,
    subject: null,
    whatGoalId: null,
    whatGoalText: "",
    selectedLevel: null,
    levelGoalText: "",
    howGoalText: null,
    workGoals: [],
    socialForm: null,
    confidenceBefore: null,
    detailsText: "",
    socialUnlock: { gruppe: false, frei: false },
    existingEntry: null,
    whatGoalOptions: [],
    howGoals: HOW_GOAL_OPTIONS,
    levelOptions: LEVEL_OPTIONS,
    nextCheckpoint: null,
    goalSource: "none",
    hasClass: true,
    subjectLocked: false,
    submitting: false,
    errorMsg: ""
  };

  function todayIso() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
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

  function levelLabel(value) {
    return state.levelOptions.find((o) => o.value === value)?.label || value || "–";
  }

  function pickedWhatGoal() {
    return state.whatGoalOptions.find((g) => String(g.id) === String(state.whatGoalId)) || null;
  }

  function levelGoalTextFor(goal, level) {
    if (!goal || !level) return "";
    if (level === "rookie") return String(goal.rookieGoalText || "").trim();
    if (level === "operator") return String(goal.operatorGoalText || "").trim();
    if (level === "street_legend") return String(goal.streetLegendGoalText || "").trim();
    return "";
  }

  function syncLevelGoalText() {
    const goal = pickedWhatGoal();
    state.whatGoalText = goal?.text || "";
    state.levelGoalText = levelGoalTextFor(goal, state.selectedLevel);
  }

  function dailyGoalBlockHtml(ui, entry) {
    const levelGoal = entry?.level_goal_text || state.levelGoalText;
    const howGoal = entry?.how_goal_text || entry?.goal || state.howGoalText;
    const details = entry?.details_text || state.detailsText;
    if (!levelGoal || !howGoal) return "";

    return `
      <div class="plan-daily-goal">
        <p class="plan-daily-goal-title">Dein Tagesziel</p>
        <div class="plan-daily-goal-card">
          <p><strong>Heute arbeite ich an diesem Ziel:</strong><br>${ui.escapeHtml(levelGoal)}</p>
          <p><strong>Mein Weg:</strong><br>${ui.escapeHtml(howGoal)}</p>
          ${
            details && String(details).trim()
              ? `<p><strong>Konkret:</strong><br>${ui.escapeHtml(String(details).trim())}</p>`
              : ""
          }
        </div>
      </div>`;
  }

  function whatGoalMessage(ui) {
    if (state.whatGoalOptions.length) return "";
    if (state.goalSource === "checkpoint_empty") {
      return ui.msg("Für diesen Nachweis wurden noch keine Ziele hinterlegt.");
    }
    if (state.goalSource === "levelplan_fallback") {
      return ui.msg(
        "Kein kommender Nachweis gefunden. Wähle ein Ziel aus dem Levelplan."
      );
    }
    if (!state.hasClass) {
      return ui.msg("Dir ist noch keine Klasse zugeordnet.");
    }
    return ui.msg("Für dieses Fach wurden noch keine Ziele aus dem Levelplan importiert.");
  }

  function renderExistingEntry(ui, dateLabel) {
    const e = state.existingEntry;
    const workGoals = Array.isArray(e.work_goals) ? e.work_goals : [];

    const rows = [
      ["Fach", e.subject],
      ["Nächster Nachweis", e.checkpoint_title || "Kein kommender Nachweis gefunden."],
      ["Was-Ziel", e.what_goal_text || "–"],
      ["Level", e.selected_level ? levelLabel(e.selected_level) : "–"],
      ["Fachliches Ziel", e.level_goal_text || "–"],
      ["Wie-Ziel", e.how_goal_text || e.goal || "–"],
      ["Arbeitsziele", workGoals.length ? workGoals.join(", ") : "–"],
      ["Sozialform", e.social_form ? labelForSocialForm(e.social_form) : "–"],
      [
        "Selbstwirksamkeit vorher",
        e.confidence_before != null ? String(e.confidence_before) : "–"
      ],
      ["Was genau?", e.details_text || e.freitext || "–"]
    ];

    return `
      <div class="logbuch-form logbuch-form-readonly">
        <p class="logbuch-meta">${ui.escapeHtml(dateLabel)}${e.timeslot ? ` · ${ui.escapeHtml(e.timeslot)}` : ""}</p>
        <div class="logbuch-msg logbuch-msg-info">Dein Tagesziel (nur Ansicht – nicht änderbar)</div>
        ${dailyGoalBlockHtml(ui, e)}
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

    const checkpoint = state.nextCheckpoint;
    const checkpointText = checkpoint
      ? `${checkpoint.typeLabel || "Nachweis"}: ${checkpoint.title}${
          checkpoint.date ? ` am ${checkpoint.dateLabel}` : ""
        }`
      : "Kein kommender Nachweis gefunden.";
    const levelMeaning = state.levelGoalText;
    const previewReady = !!(state.levelGoalText && state.howGoalText);

    root.innerHTML = `
      <div class="logbuch-form">
        <p class="logbuch-meta">${ui.escapeHtml(dateLabel)}${state.timeslot ? ` · ${ui.escapeHtml(state.timeslot)}` : ""}</p>

        ${
          state.subjectLocked
            ? ui.fieldWrap(
                ui.fieldLabel("Fach"),
                `<div class="plan-subject-locked">${ui.escapeHtml(state.subject || "–")}</div>`,
                "Vom Stundenplan für diese Stunde"
              )
            : ui.fieldWrap(
                ui.fieldLabel("Fach", { required: true }),
                ui.select(
                  "subject",
                  C().SUBJECTS.map((s) => ({ value: s, label: s })),
                  state.subject,
                  { phase: "plan" }
                )
              )
        }

        ${ui.fieldWrap(
          ui.fieldLabel("Nächster Nachweis"),
          `<div class="plan-subject-locked">${ui.escapeHtml(checkpointText)}</div>${
            state.goalSource === "levelplan_fallback"
              ? `<div class="logbuch-msg logbuch-msg-info" style="margin-top:8px">Kein kommender Nachweis – du kannst ein Ziel aus dem Levelplan wählen.</div>`
              : ""
          }`
        )}

        ${ui.fieldWrap(
          ui.fieldLabel("Was willst du heute können?", { required: true }),
          state.whatGoalOptions.length
            ? ui.select(
                "whatGoalId",
                state.whatGoalOptions.map((g) => ({ value: g.id, label: g.text })),
                state.whatGoalId,
                { phase: "plan", placeholder: "Unterthema wählen…" }
              )
            : whatGoalMessage(ui)
        )}

        ${
          state.whatGoalId
            ? ui.fieldWrap(
                ui.fieldLabel("Auf welchem Level arbeitest du daran?", { required: true }),
                ui.select(
                  "selectedLevel",
                  state.levelOptions.map((o) => ({ value: o.value, label: o.label })),
                  state.selectedLevel,
                  { phase: "plan", placeholder: "Level wählen…" }
                )
              )
            : ""
        }

        ${
          levelMeaning
            ? `<div class="plan-level-meaning">
                <span class="plan-level-meaning-label">Das bedeutet:</span>
                <p>${ui.escapeHtml(levelMeaning)}</p>
              </div>`
            : state.selectedLevel && state.whatGoalId
              ? `<div class="logbuch-msg logbuch-msg-info">Für dieses Level wurde noch kein Zieltext hinterlegt.</div>`
              : ""
        }

        ${
          state.whatGoalId && state.selectedLevel
            ? ui.fieldWrap(
                ui.fieldLabel("Wie arbeitest du daran?", { required: true }),
                ui.select(
                  "howGoalText",
                  state.howGoals.map((g) => ({ value: g, label: g })),
                  state.howGoalText,
                  { phase: "plan", placeholder: "Arbeitsweg wählen…" }
                )
              )
            : ""
        }

        <div id="planSummaryBox" ${previewReady ? "" : "hidden"}>
          ${previewReady ? dailyGoalBlockHtml(ui) : ""}
        </div>

        ${
          state.whatGoalId && state.selectedLevel
            ? ui.fieldWrap(
                ui.fieldLabel("Was genau machst du?", { optional: true }),
                `<input type="text" class="logbuch-input" id="planDetailsText" maxlength="100"
            placeholder="z. B. Rookie 1–4, danach Operator 1–2"
            value="${ui.escapeHtml(state.detailsText)}">
           <div class="logbuch-char-count"><span id="planDetailsCount">${state.detailsText.length}</span>/100</div>`,
                "",
                { wide: true }
              )
            : ""
        }

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
          ui.fieldLabel("Selbstwirksamkeit vorher", { optional: true }),
          ui.select(
            "confidenceBefore",
            [1, 2, 3, 4, 5].map((n) => ({
              value: String(n),
              label: `${n} – ${n <= 2 ? "unsicher" : n >= 4 ? "sicher" : "mittel"}`
            })),
            state.confidenceBefore != null ? String(state.confidenceBefore) : null,
            { phase: "plan" }
          )
        )}

        ${state.errorMsg ? ui.msg(state.errorMsg) : ""}

        ${ui.btnPrimary(
          state.submitting ? "Speichern…" : "Tagesziel speichern (+2 XP)",
          "planSubmitBtn",
          state.submitting || !state.whatGoalOptions.length,
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

  function updatePlanningPreview(root) {
    const box = root.querySelector("#planSummaryBox");
    if (!box) return;
    const ready = !!(state.levelGoalText && state.howGoalText);
    if (!ready) {
      box.hidden = true;
      box.innerHTML = "";
      return;
    }
    box.hidden = false;
    box.innerHTML = dailyGoalBlockHtml(UI());
  }

  function bindHandlers(root) {
    UI().bindSelects(root, state, async (field) => {
      if (field === "subject") {
        state.whatGoalId = null;
        state.whatGoalText = "";
        state.selectedLevel = null;
        state.levelGoalText = "";
        state.howGoalText = null;
        await loadContext();
        render();
        return;
      }
      if (field === "whatGoalId") {
        state.selectedLevel = null;
        state.levelGoalText = "";
        state.howGoalText = null;
        syncLevelGoalText();
        render();
        return;
      }
      if (field === "selectedLevel") {
        state.howGoalText = null;
        syncLevelGoalText();
        render();
        return;
      }
      if (field === "howGoalText") {
        updatePlanningPreview(root);
      }
    });

    const details = root.querySelector("#planDetailsText");
    details?.addEventListener("input", () => {
      state.detailsText = details.value.slice(0, 100);
      const count = root.querySelector("#planDetailsCount");
      if (count) count.textContent = String(state.detailsText.length);
      updatePlanningPreview(root);
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
    if (!state.whatGoalId) {
      state.errorMsg = "Bitte wähle ein Was-Ziel aus dem Levelplan.";
      render();
      return;
    }
    if (!state.selectedLevel) {
      state.errorMsg = "Bitte wähle ein Level.";
      render();
      return;
    }
    syncLevelGoalText();
    if (!state.levelGoalText) {
      state.errorMsg = "Für dieses Level wurde noch kein Zieltext hinterlegt.";
      render();
      return;
    }
    if (!state.howGoalText) {
      state.errorMsg = "Bitte wähle, wie du daran arbeitest.";
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
          checkpointId: state.nextCheckpoint?.id || null,
          checkpointTitle: state.nextCheckpoint
            ? `${state.nextCheckpoint.typeLabel || "Nachweis"}: ${state.nextCheckpoint.title}`
            : null,
          whatGoalId: state.whatGoalId,
          whatGoalText: state.whatGoalText.trim(),
          selectedLevel: state.selectedLevel,
          howGoalText: state.howGoalText,
          goal: state.howGoalText,
          detailsText: state.detailsText.trim() || null,
          workGoals: state.workGoals,
          socialForm: state.socialForm,
          confidenceBefore:
            state.confidenceBefore != null ? Number(state.confidenceBefore) : null,
          freitext: state.detailsText.trim() || null
        })
      });

      const data = await res.json();

      if (!data.success) {
        state.submitting = false;
        if (data.readOnly && data.entryId) {
          state.entryId = data.entryId;
          await loadContext();
          render();
          return;
        }
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

  async function loadContext() {
    const params = new URLSearchParams({ date: state.date });
    if (state.entryId) params.set("entryId", state.entryId);
    if (state.timeslot) params.set("timeslot", state.timeslot);
    if (state.subject) params.set("subject", state.subject);

    const res = await fetch(`/api/student/log/plan-context?${params}`);
    if (!res.ok) {
      throw new Error(`Plan-Kontext konnte nicht geladen werden (${res.status})`);
    }
    const data = await res.json();

    state.socialUnlock = data.socialUnlock || { gruppe: false, frei: false };
    state.existingEntry = data.existingEntry || null;
    state.hasClass = data.hasClass !== false;
    state.howGoals = Array.isArray(data.howGoals) ? data.howGoals : HOW_GOAL_OPTIONS;
    state.whatGoalOptions = Array.isArray(data.whatGoalOptions) ? data.whatGoalOptions : [];
    state.levelOptions = Array.isArray(data.levelOptions) ? data.levelOptions : LEVEL_OPTIONS;
    state.nextCheckpoint = data.nextCheckpoint || null;
    state.goalSource = data.goalSource || "none";
    state.subjectLocked = !!data.subjectLocked;

    if (data.lockedSubject) {
      state.subject = data.lockedSubject;
    } else if (!state.subject && data.suggestedSubject) {
      state.subject = data.suggestedSubject;
    }

    if (state.howGoalText && !state.howGoals.includes(state.howGoalText)) {
      state.howGoalText = null;
    }
    if (state.whatGoalId) {
      const picked = state.whatGoalOptions.find((g) => String(g.id) === String(state.whatGoalId));
      if (picked) {
        syncLevelGoalText();
      } else {
        state.whatGoalId = null;
        state.whatGoalText = "";
        state.selectedLevel = null;
        state.levelGoalText = "";
      }
    }
  }

  async function init(query) {
    const q = query || new URLSearchParams(location.search);

    state.date = q.get("date") || todayIso();
    state.entryId = q.get("entryId") || null;
    state.timeslot = q.get("timeslot") || null;
    state.subject = q.get("subject") || null;
    state.whatGoalId = null;
    state.whatGoalText = "";
    state.selectedLevel = null;
    state.levelGoalText = "";
    state.howGoalText = null;
    state.workGoals = [];
    state.socialForm = null;
    state.confidenceBefore = null;
    state.detailsText = "";
    state.whatGoalOptions = [];
    state.nextCheckpoint = null;
    state.goalSource = "none";
    state.existingEntry = null;
    state.hasClass = true;
    state.subjectLocked = false;
    state.submitting = false;
    state.errorMsg = "";

    const root = document.getElementById("plan-screen-root");
    if (root) {
      root.innerHTML = `<div class="logbuch-loading">Lade Planung…</div>`;
    }

    try {
      await loadContext();
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
