/**
 * SRL-Logbuch – PLANEN-Screen (Tagesziel aus Levelplan + Nachweis).
 */
(function () {
  const C = () => window.LOGBUCH;
  const UI = () => window.LogbuchUI;
  const PLAN_B = () => window.LogbuchStrategies?.planBOptions() || window.LOGBUCH_PLAN_B_OPTIONS || [];
  const HOW_GOAL_OPTIONS = [
    "Ich schaue mir zuerst ein Beispiel an.",
    "Ich starte mit Rookie-Aufgaben.",
    "Ich löse erst mit Hilfe und danach alleine.",
    "Ich bearbeite Operator-Aufgaben.",
    "Ich versuche eine Street-Legend-Aufgabe.",
    "Ich vergleiche meinen Lösungsweg mit der Musterlösung.",
    "Ich suche gezielt meine Fehler.",
    "Ich schreibe meinen Lösungsweg sauber auf.",
    "Ich erkläre am Ende eine Aufgabe jemandem.",
    "Ich schaue ein Lernvideo und notiere drei wichtige Punkte.",
    "Ich wiederhole ein unsicheres Ziel."
  ];

  const HOW_GOAL_PREFERRED = {
    rookie: [
      "Ich schaue mir zuerst ein Beispiel an.",
      "Ich starte mit Rookie-Aufgaben.",
      "Ich löse erst mit Hilfe und danach alleine.",
      "Ich schaue ein Lernvideo und notiere drei wichtige Punkte.",
      "Ich wiederhole ein unsicheres Ziel."
    ],
    operator: [
      "Ich bearbeite Operator-Aufgaben.",
      "Ich löse erst mit Hilfe und danach alleine.",
      "Ich vergleiche meinen Lösungsweg mit der Musterlösung.",
      "Ich suche gezielt meine Fehler.",
      "Ich schreibe meinen Lösungsweg sauber auf."
    ],
    street_legend: [
      "Ich versuche eine Street-Legend-Aufgabe.",
      "Ich erkläre am Ende eine Aufgabe jemandem.",
      "Ich suche gezielt meine Fehler.",
      "Ich vergleiche meinen Lösungsweg mit der Musterlösung."
    ]
  };

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
    planBStrategyText: null,
    workGoals: [],
    socialForm: null,
    confidenceBefore: null,
    detailsText: "",
    socialUnlock: { gruppe: false, frei: false },
    existingEntry: null,
    editingEntryId: null,
    whatGoalOptions: [],
    howGoals: HOW_GOAL_OPTIONS,
    howGoalsBase: HOW_GOAL_OPTIONS,
    levelOptions: LEVEL_OPTIONS,
    nextCheckpoint: null,
    checkpoints: [],
    selectedCheckpointId: null,
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

  function levelMeaningLabel(level) {
    if (level === "rookie") return "Auf Rookie-Level heißt das:";
    if (level === "operator") return "Auf Operator-Level heißt das:";
    if (level === "street_legend") return "Auf Street-Legend-Level heißt das:";
    return "Das bedeutet:";
  }

  function howGoalsForLevel(level, baseList) {
    const all = Array.isArray(baseList) && baseList.length ? baseList : HOW_GOAL_OPTIONS;
    const preferred = level && HOW_GOAL_PREFERRED[level] ? HOW_GOAL_PREFERRED[level] : [];
    const orderedPreferred = preferred.filter((g) => all.includes(g));
    const rest = all.filter((g) => !orderedPreferred.includes(g));
    return orderedPreferred.length ? [...orderedPreferred, ...rest] : all;
  }

  function refreshHowGoals() {
    state.howGoals = howGoalsForLevel(state.selectedLevel, state.howGoalsBase);
    if (state.howGoalText && !state.howGoals.includes(state.howGoalText)) {
      state.howGoalText = null;
    }
  }

  function syncLevelGoalText() {
    const goal = pickedWhatGoal();
    state.whatGoalText = goal?.text || "";
    state.levelGoalText = levelGoalTextFor(goal, state.selectedLevel);
  }

  function checkpointSatisfied() {
    if (!state.checkpoints.length) return true;
    if (state.checkpoints.length === 1) return true;
    return !!state.selectedCheckpointId;
  }

  function requiredFieldsComplete() {
    return !!(
      state.subject &&
      state.whatGoalId &&
      state.selectedLevel &&
      state.levelGoalText &&
      state.howGoalText &&
      checkpointSatisfied() &&
      state.whatGoalOptions.length
    );
  }

  function renderWorkGoalChips(ui) {
    const chips = C().WORK_GOALS.map(
      (goal) => `
      <button type="button"
        class="plan-work-chip ${state.workGoals.includes(goal) ? "active" : ""}"
        data-work-goal="${ui.escapeHtml(goal)}">
        ${ui.escapeHtml(goal)}
      </button>`
    ).join("");

    return `<div class="plan-work-goal-chips" id="planWorkGoalChips">${chips}</div>`;
  }

  function dailyGoalBlockHtml(ui, entry) {
    const levelGoal = entry?.level_goal_text || state.levelGoalText;
    const howGoal = entry?.how_goal_text || entry?.goal || state.howGoalText;
    const details = entry?.details_text || state.detailsText;
    if (!levelGoal || !howGoal) return "";

    return `
      <div class="plan-daily-goal">
        <p class="plan-daily-goal-title">Dein Tagesziel heute</p>
        <div class="plan-daily-goal-card">
          <p><strong>Ich arbeite an diesem Ziel:</strong><br>${ui.escapeHtml(levelGoal)}</p>
          <p><strong>Mein Weg:</strong><br>${ui.escapeHtml(howGoal)}</p>
          ${
            details && String(details).trim()
              ? `<p><strong>Konkret:</strong><br>${ui.escapeHtml(String(details).trim())}</p>`
              : ""
          }
          ${
            (entry?.plan_b_strategy_text || state.planBStrategyText)
              ? `<p><strong>Plan B, wenn ich hänge:</strong><br>${ui.escapeHtml(entry?.plan_b_strategy_text || state.planBStrategyText)}</p>`
              : ""
          }
        </div>
      </div>`;
  }

  function pickedCheckpoint() {
    if (!state.checkpoints.length) return state.nextCheckpoint;
    return (
      state.checkpoints.find((c) => String(c.id) === String(state.selectedCheckpointId)) ||
      state.nextCheckpoint
    );
  }

  function renderCheckpointField(ui) {
    if (!state.checkpoints.length) {
      const fallbackMsg =
        state.goalSource === "levelplan_fallback"
          ? `<div class="logbuch-msg logbuch-msg-info" style="margin-top:8px">Kein Nachweis geplant – du kannst ein Ziel aus dem Levelplan wählen.</div>`
          : "";
      return ui.fieldWrap(
        ui.fieldLabel("Nachweis"),
        `<div class="plan-subject-locked">Kein Nachweis geplant.</div>${fallbackMsg}`
      );
    }

    if (state.checkpoints.length === 1) {
      const cp = state.checkpoints[0];
      return ui.fieldWrap(
        ui.fieldLabel("Nachweis"),
        `<div class="plan-subject-locked">${ui.escapeHtml(cp.label)}</div>`
      );
    }

    return ui.fieldWrap(
      ui.fieldLabel("Für welchen Nachweis arbeitest du?", { required: true }),
      ui.select(
        "selectedCheckpointId",
        state.checkpoints.map((c) => ({ value: c.id, label: c.label })),
        state.selectedCheckpointId,
        { phase: "plan", placeholder: "Nachweis wählen…" }
      )
    );
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

  function applyEntryToForm(entry) {
    state.editingEntryId = entry.id;
    state.entryId = entry.id;
    state.subject = entry.subject;
    if (entry.timeslot) state.timeslot = entry.timeslot;
    state.whatGoalId = entry.what_goal_id;
    state.whatGoalText = entry.what_goal_text || "";
    state.selectedLevel = entry.selected_level;
    state.levelGoalText = entry.level_goal_text || "";
    state.howGoalText = entry.how_goal_text || entry.goal || null;
    state.planBStrategyText = entry.plan_b_strategy_text || null;
    state.detailsText = entry.details_text || entry.freitext || "";
    state.workGoals = Array.isArray(entry.work_goals) ? entry.work_goals : [];
    state.socialForm = entry.social_form || null;
    state.confidenceBefore = entry.confidence_before ?? null;
    state.selectedCheckpointId = entry.checkpoint_id || null;
    state.existingEntry = null;
    refreshHowGoals();
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
        "Wie sicher fühlst du dich vorher?",
        e.confidence_before != null ? String(e.confidence_before) : "–"
      ],
      ["Was genau?", e.details_text || e.freitext || "–"]
    ];
    if (e.plan_b_strategy_text) {
      rows.push(["Plan B, wenn ich hänge", e.plan_b_strategy_text]);
    }

    return `
      <div class="logbuch-form logbuch-form-readonly">
        <p class="logbuch-meta">${ui.escapeHtml(dateLabel)}${e.timeslot ? ` · ${ui.escapeHtml(e.timeslot)}` : ""}</p>
        <div class="logbuch-msg logbuch-msg-info">Dein Tagesziel (nur Ansicht – nach dem Tagesabschluss nicht mehr änderbar)</div>
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

    const levelMeaning = state.levelGoalText;
    const showDailyGoal = requiredFieldsComplete();

    root.innerHTML = `
      <div class="app-form-sheet">
        <div class="app-form-header">
          <span class="app-form-header__pill">${ui.escapeHtml(dateLabel)}${state.timeslot ? ` · ${ui.escapeHtml(state.timeslot)}` : ""}</span>
        </div>

        <div class="logbuch-form app-form-body">
        ${
          state.editingEntryId
            ? `<div class="logbuch-msg logbuch-msg-info">Du bearbeitest dein Tagesziel – beim Speichern gibt es kein zusätzliches XP.</div>`
            : ""
        }

        <section class="app-form-section">
          <h3 class="app-form-section__title">Stunde</h3>
          <div class="app-form-section__grid">
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

        ${renderCheckpointField(ui)}
          </div>
        </section>

        <section class="app-form-section">
          <h3 class="app-form-section__title">Dein Lernziel</h3>
          <div class="app-form-section__grid">
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
                <span class="plan-level-meaning-label">${ui.escapeHtml(levelMeaningLabel(state.selectedLevel))}</span>
                <p>${ui.escapeHtml(levelMeaning)}</p>
              </div>`
            : state.selectedLevel && state.whatGoalId
              ? `<div class="logbuch-msg logbuch-msg-info">Für dieses Level wurde noch kein Zieltext hinterlegt.</div>`
              : ""
        }

        ${
          state.whatGoalId && state.selectedLevel
            ? ui.fieldWrap(
                ui.fieldLabel("Wie willst du daran arbeiten?", { required: true }),
                ui.select(
                  "howGoalText",
                  state.howGoals.map((g) => ({ value: g, label: g })),
                  state.howGoalText,
                  { phase: "plan", placeholder: "Arbeitsweg wählen…" }
                )
              )
            : ""
        }

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

        ${
          state.whatGoalId && state.selectedLevel
            ? ui.fieldWrap(
                ui.fieldLabel("Mein Plan B, wenn ich hänge", { optional: true }),
                ui.select(
                  "planBStrategyText",
                  PLAN_B().map((g) => ({ value: g, label: g })),
                  state.planBStrategyText,
                  { phase: "plan", placeholder: "Optional: Strategie wählen…" }
                ),
                "Wähle eine Strategie, die du nutzen willst, wenn du nicht weiterkommst."
              )
            : ""
        }

        <div id="planSummaryBox" ${showDailyGoal ? "" : "hidden"}>
          ${showDailyGoal ? dailyGoalBlockHtml(ui) : ""}
        </div>
          </div>
        </section>

        <section class="app-form-section">
          <h3 class="app-form-section__title">Arbeitsfokus</h3>
          <div class="app-form-section__grid">
        ${ui.fieldWrap(
          ui.fieldLabel("Arbeitsziele", { optional: true }),
          renderWorkGoalChips(ui),
          "Tippe mehrere an – optionaler Arbeitsfokus"
        )}

        ${ui.fieldWrap(
          ui.fieldLabel("Sozialform", { optional: true }),
          ui.select("socialForm", socialFormOptions(), state.socialForm, { phase: "plan" })
        )}

        ${ui.fieldWrap(
          ui.fieldLabel("Wie sicher fühlst du dich vorher?", { optional: true }),
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
          </div>
        </section>

        ${state.errorMsg ? ui.msg(state.errorMsg) : ""}

        <div class="app-form-footer">
        ${ui.btnPrimary(
          state.submitting
            ? "Speichern…"
            : state.editingEntryId
              ? "Änderungen speichern"
              : "Tagesziel speichern (+2 XP)",
          "planSubmitBtn",
          state.submitting || !requiredFieldsComplete(),
          "logbuch-submit-full today-app-btn"
        )}
        ${ui.btnGhost("Abbrechen", "planBackBtn", "today-app-btn today-app-btn--ghost")}
        </div>
        </div>
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
    const ready = requiredFieldsComplete();
    if (!ready) {
      box.hidden = true;
      box.innerHTML = "";
      return;
    }
    box.hidden = false;
    box.innerHTML = dailyGoalBlockHtml(UI());
  }

  function bindWorkGoalChips(root) {
    root.querySelectorAll(".plan-work-chip").forEach((btn) => {
      btn.addEventListener("click", () => {
        const goal = btn.dataset.workGoal;
        if (!goal) return;
        const idx = state.workGoals.indexOf(goal);
        if (idx >= 0) {
          state.workGoals.splice(idx, 1);
        } else {
          state.workGoals.push(goal);
        }
        root.querySelectorAll(".plan-work-chip").forEach((chip) => {
          chip.classList.toggle("active", state.workGoals.includes(chip.dataset.workGoal));
        });
      });
    });
  }

  function bindHandlers(root) {
    UI().bindSelects(root, state, async (field) => {
      if (field === "subject") {
        state.whatGoalId = null;
        state.whatGoalText = "";
        state.selectedLevel = null;
        state.levelGoalText = "";
        state.howGoalText = null;
        state.selectedCheckpointId = null;
        await loadContext();
        render();
        return;
      }
      if (field === "selectedCheckpointId") {
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
        refreshHowGoals();
        render();
        return;
      }
      if (field === "howGoalText" || field === "planBStrategyText") {
        updatePlanningPreview(root);
        const submitBtn = root.querySelector("#planSubmitBtn");
        if (submitBtn) {
          submitBtn.disabled = state.submitting || !requiredFieldsComplete();
        }
        return;
      }
    });

    bindWorkGoalChips(root);

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
    if (state.checkpoints.length > 1 && !state.selectedCheckpointId) {
      state.errorMsg = "Bitte wähle den Nachweis, für den du arbeitest.";
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

    const checkpoint = pickedCheckpoint();

    try {
      const isEdit = !!state.editingEntryId;
      const res = await fetch(
        isEdit
          ? `/api/student/log/plan/${encodeURIComponent(state.editingEntryId)}`
          : "/api/student/log/plan",
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
          date: state.date,
          timeslot: state.timeslot || null,
          subject: state.subject,
          checkpointId: checkpoint?.id || state.selectedCheckpointId || null,
          checkpointTitle: checkpoint
            ? `${checkpoint.typeLabel || "Nachweis"}: ${checkpoint.title}`
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
          planBStrategyText: state.planBStrategyText || null,
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
    if (state.selectedCheckpointId) {
      params.set("checkpointId", state.selectedCheckpointId);
    }

    const res = await fetch(`/api/student/log/plan-context?${params}`);
    if (!res.ok) {
      throw new Error(`Plan-Kontext konnte nicht geladen werden (${res.status})`);
    }
    const data = await res.json();

    state.socialUnlock = data.socialUnlock || { gruppe: false, frei: false };
    state.existingEntry = data.existingEntry || null;
    if (data.existingEntry?.canEdit) {
      applyEntryToForm(data.existingEntry);
    }
    state.hasClass = data.hasClass !== false;
    state.howGoalsBase = Array.isArray(data.howGoals) ? data.howGoals : HOW_GOAL_OPTIONS;
    refreshHowGoals();
    state.whatGoalOptions = Array.isArray(data.whatGoalOptions) ? data.whatGoalOptions : [];
    state.levelOptions = Array.isArray(data.levelOptions) ? data.levelOptions : LEVEL_OPTIONS;
    state.checkpoints = Array.isArray(data.checkpoints) ? data.checkpoints : [];
    state.nextCheckpoint = data.selectedCheckpoint || data.nextCheckpoint || null;
    state.selectedCheckpointId =
      data.selectedCheckpoint?.id ||
      state.selectedCheckpointId ||
      (state.checkpoints.length === 1 ? state.checkpoints[0].id : null);
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
    state.planBStrategyText = window.LogbuchStrategies?.rememberedPlanB() || null;
    state.workGoals = [];
    state.socialForm = null;
    state.confidenceBefore = null;
    state.detailsText = "";
    state.whatGoalOptions = [];
    state.checkpoints = [];
    state.selectedCheckpointId = null;
    state.nextCheckpoint = null;
    state.goalSource = "none";
    state.existingEntry = null;
    state.editingEntryId = null;
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
