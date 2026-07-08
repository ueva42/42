/**
 * SRL-Logbuch – PLANEN-Screen (Forethought, Stebner Was/Wie).
 */
(function () {
  const C = () => window.LOGBUCH;
  const UI = () => window.LogbuchUI;
  const HOW_GOAL_OPTIONS = [
    "Ich starte mit Rookie-Aufgaben.",
    "Ich löse erst Aufgaben mit Hilfe und danach alleine.",
    "Ich bearbeite Operator-Aufgaben und bleibe dran.",
    "Ich versuche eine Street-Legend-Aufgabe.",
    "Ich vergleiche meinen Rechenweg mit der Musterlösung.",
    "Ich suche gezielt meine Fehler.",
    "Ich erkläre am Ende eine Aufgabe jemandem.",
    "Ich arbeite ein Lernvideo durch und schreibe das Wichtigste heraus.",
    "Ich wiederhole ein Thema gezielt.",
    "Ich bereite mich auf den nächsten Levelcheck vor."
  ];

  const state = {
    date: null,
    timeslot: null,
    subject: null,
    whatGoalId: null,
    whatGoalText: "",
    howGoalText: null,
    workGoals: [],
    socialForm: null,
    confidenceBefore: null,
    detailsText: "",
    socialUnlock: { gruppe: false, frei: false },
    existingEntry: null,
    whatGoalOptions: [],
    howGoals: HOW_GOAL_OPTIONS,
    nextCheckpoint: null,
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

  function howGoalForSentence(howGoalText) {
    let text = String(howGoalText || "").trim();
    if (text.toLowerCase().startsWith("ich ")) text = text.slice(4);
    if (text.endsWith(".")) text = text.slice(0, -1);
    return text.trim();
  }

  function planningSentenceFromParts(whatGoalText, howGoalText) {
    const what = String(whatGoalText || "").trim();
    const how = howGoalForSentence(howGoalText);
    if (!what || !how) return what || howGoalText || "–";
    return `Heute übe ich ${what}, indem ich ${how}.`;
  }

  function planningSentence() {
    if (!state.whatGoalText || !state.howGoalText) return "";
    const how = howGoalForSentence(state.howGoalText);
    return `Heute übe ich ${state.whatGoalText}, indem ich ${how}.`;
  }

  function planningDetailsLine() {
    if (!state.detailsText || !state.detailsText.trim()) return "";
    return `Konkret: ${state.detailsText.trim()}`;
  }

  function updatePlanningPreview(root) {
    const box = root.querySelector("#planSummaryBox");
    if (!box) return;
    const sentence = planningSentence();
    const details = planningDetailsLine();
    if (!sentence) {
      box.hidden = true;
      box.innerHTML = "";
      return;
    }
    box.hidden = false;
    box.innerHTML = `${UI().escapeHtml(sentence)}${
      details ? `<br>${UI().escapeHtml(details)}` : ""
    }`;
  }

  function renderExistingEntry(ui, dateLabel) {
    const e = state.existingEntry;
    const workGoals = Array.isArray(e.work_goals) ? e.work_goals : [];
    const whatGoal = e.what_goal_text || "–";
    const howGoal = e.how_goal_text || e.goal || "–";
    const details = e.details_text || e.freitext || "–";
    const sentence =
      e.what_goal_text && (e.how_goal_text || e.goal)
        ? planningSentenceFromParts(e.what_goal_text, e.how_goal_text || e.goal)
        : e.goal || "–";

    const rows = [
      ["Fach", e.subject],
      ["Nächster Checkpoint", e.checkpoint_title || "Kein kommender Checkpoint gefunden."],
      ["Was-Ziel", whatGoal],
      ["Wie-Ziel", howGoal],
      ["Planungssatz", sentence],
      ["Arbeitsziele", workGoals.length ? workGoals.join(", ") : "–"],
      ["Sozialform", e.social_form ? labelForSocialForm(e.social_form) : "–"],
      [
        "Selbstwirksamkeit vorher",
        e.confidence_before != null ? String(e.confidence_before) : "–"
      ],
      ["Was genau?", details]
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

    const checkpoint = state.nextCheckpoint;
    const checkpointText = checkpoint
      ? `${checkpoint.typeLabel || "Checkpoint"}: ${checkpoint.title}${
          checkpoint.date ? ` am ${checkpoint.dateLabel}` : ""
        }`
      : "Kein kommender Checkpoint gefunden.";
    const summarySentence = planningSentence();
    const summaryDetails = planningDetailsLine();

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
          ui.fieldLabel("Nächster Checkpoint"),
          `<div class="plan-subject-locked">${ui.escapeHtml(checkpointText)}</div>${
            !state.hasClass
              ? `<div class="logbuch-msg logbuch-msg-info" style="margin-top:8px">Dir ist noch keine Klasse zugeordnet – Termine aus dem Levelplan können so nicht geladen werden.</div>`
              : ""
          }`
        )}

        ${ui.fieldWrap(
          ui.fieldLabel("Was will ich heute können?", { required: true }),
          state.whatGoalOptions.length
            ? ui.select(
                "whatGoalId",
                state.whatGoalOptions.map((g) => ({ value: g.id, label: g.text })),
                state.whatGoalId,
                { phase: "plan", placeholder: "Kompetenzziel wählen…" }
              )
            : `<div class="logbuch-msg logbuch-msg-info">Für dieses Fach wurden noch keine Kompetenzziele angelegt.</div>
               <input type="text" class="logbuch-input" id="planWhatGoalText" maxlength="300"
                 placeholder="Eigenes Was-Ziel eintragen" value="${ui.escapeHtml(state.whatGoalText)}">`
        )}

        ${ui.fieldWrap(
          ui.fieldLabel("Wie arbeite ich daran?", { required: true }),
          ui.select(
            "howGoalText",
            state.howGoals.map((g) => ({ value: g, label: g })),
            state.howGoalText,
            { phase: "plan", placeholder: "Wie-Ziel wählen…" }
          )
        )}

        <div class="logbuch-msg logbuch-msg-info" id="planSummaryBox" ${summarySentence ? "" : "hidden"}>
          ${summarySentence
            ? `${ui.escapeHtml(summarySentence)}${summaryDetails ? `<br>${ui.escapeHtml(summaryDetails)}` : ""}`
            : ""}
        </div>

        ${ui.fieldWrap(
          ui.fieldLabel("Was genau?", { optional: true }),
          `<input type="text" class="logbuch-input" id="planDetailsText" maxlength="100"
            placeholder="z. B. Rookie 1–4, danach Operator 1–2"
            value="${ui.escapeHtml(state.detailsText)}">
           <div class="logbuch-char-count"><span id="planDetailsCount">${state.detailsText.length}</span>/100</div>`,
          "",
          { wide: true }
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
    UI().bindSelects(root, state, async (field) => {
      if (field === "subject") {
        state.whatGoalId = null;
        state.whatGoalText = "";
        state.howGoalText = null;
        await loadContext();
        render();
        return;
      }
      if (field === "whatGoalId") {
        const picked = state.whatGoalOptions.find((g) => String(g.id) === String(state.whatGoalId));
        state.whatGoalText = picked?.text || "";
        updatePlanningPreview(root);
        return;
      }
      if (field === "howGoalText") {
        updatePlanningPreview(root);
      }
    });

    const whatGoalTextInput = root.querySelector("#planWhatGoalText");
    whatGoalTextInput?.addEventListener("input", () => {
      state.whatGoalText = whatGoalTextInput.value.slice(0, 300);
      updatePlanningPreview(root);
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
    if (!state.whatGoalText || !state.whatGoalText.trim()) {
      state.errorMsg = "Bitte wähle ein Was-Ziel.";
      render();
      return;
    }
    if (!state.howGoalText) {
      state.errorMsg = "Bitte wähle ein Wie-Ziel.";
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
            ? `${state.nextCheckpoint.typeLabel || "Checkpoint"}: ${state.nextCheckpoint.title}`
            : null,
          whatGoalId: state.whatGoalId || null,
          whatGoalText: state.whatGoalText.trim(),
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
    state.nextCheckpoint = data.nextCheckpoint || null;
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
        state.whatGoalText = picked.text;
      } else {
        state.whatGoalId = null;
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
    state.howGoalText = null;
    state.workGoals = [];
    state.socialForm = null;
    state.confidenceBefore = null;
    state.detailsText = "";
    state.whatGoalOptions = [];
    state.nextCheckpoint = null;
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
