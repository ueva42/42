/**
 * SRL-Logbuch – TAGESABSCHLUSS-Screen (Self-Reflection).
 */
(function () {
  const C = () => window.LOGBUCH;
  const UI = () => window.LogbuchUI;

  const LEGACY_GOAL_MAP = { ja: "ja_sicher", teilweise: "teilweise_uebung", nein: "nein_nicht" };
  const LEGACY_WORK_MAP = {
    konzentriert: "ja_geplant",
    mit_hilfe: "teilweise_abgewichen",
    unruhig: "teilweise_abgewichen",
    abgelenkt: "nein_anders"
  };
  const LEGACY_NEXT_MAP = {
    weiterüben: "weiter_gleiches_ziel",
    hilfe_holen: "hilfestellung",
    levelcheck_machen: "nachweis_vorbereiten",
    test_vorbereiten: "nachweis_vorbereiten",
    neues_thema: "naechstes_level"
  };

  const state = {
    entryId: null,
    entry: null,
    existingReflection: null,
    usedStrategyName: null,
    goalReachedAnswer: null,
    workPathAnswer: null,
    workPathNote: "",
    strategyHelpedAnswer: null,
    nextStepAnswer: null,
    confidenceAfter: null,
    learnedToday: "",
    submitting: false,
    errorMsg: ""
  };

  function mapOptions(items) {
    return items.map((item) => ({
      value: item.id ?? item.value ?? item,
      label: item.label ?? item
    }));
  }

  function labelForOption(items, id) {
    const hit = items.find((item) => (item.id ?? item.value) === id);
    return hit?.label ?? id ?? "–";
  }

  function labelForNextStep(id) {
    const hit = C().NEXT_STEPS.find((item) => item.id === id);
    if (hit) return hit.label;
    const legacy = {
      weiterüben: "Weiterüben",
      hilfe_holen: "Hilfe holen",
      levelcheck_machen: "Zielsetzung prüfen",
      test_vorbereiten: "Test vorbereiten",
      neues_thema: "Neues Thema"
    };
    return legacy[id] || id || "–";
  }

  function isoDatePart(dateStr) {
    if (!dateStr) return null;
    if (dateStr instanceof Date) return dateStr.toISOString().slice(0, 10);
    const raw = String(dateStr);
    const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);
    return match ? match[1] : null;
  }

  function formatMetaLine(entry) {
    const iso = isoDatePart(entry?.date);
    const d = iso ? new Date(`${iso}T12:00:00`) : null;
    const dateLabel =
      d && Number.isFinite(d.getTime())
        ? d.toLocaleDateString("de-DE", { weekday: "long", day: "2-digit", month: "2-digit" })
        : "Heute";
    return entry?.timeslot ? `${dateLabel} · ${entry.timeslot}` : dateLabel;
  }

  function levelLabel(value, entry) {
    if (entry?.level_label) return entry.level_label;
    if (value === "rookie") return "Rookie";
    if (value === "operator") return "Operator";
    if (value === "street_legend") return "Street Legend";
    return value || "–";
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

  function resolveGoalReachedId(reflection) {
    if (reflection.goal_reached_answer) {
      const byLabel = C().GOAL_ACHIEVED.find((x) => x.label === reflection.goal_reached_answer);
      if (byLabel) return byLabel.id;
    }
    const direct = C().GOAL_ACHIEVED.find((x) => x.id === reflection.goal_achieved);
    if (direct) return direct.id;
    return LEGACY_GOAL_MAP[reflection.goal_achieved] || reflection.goal_achieved;
  }

  function resolveWorkPathId(reflection) {
    if (reflection.work_path_answer) return reflection.work_path_answer;
    return LEGACY_WORK_MAP[reflection.how_worked] || reflection.how_worked;
  }

  function resolveNextStepId(reflection) {
    return LEGACY_NEXT_MAP[reflection.next_step] || reflection.next_step;
  }

  function applyReflectionToState(reflection) {
    if (!reflection) return false;
    state.goalReachedAnswer = resolveGoalReachedId(reflection);
    state.workPathAnswer = resolveWorkPathId(reflection);
    state.workPathNote = reflection.work_path_note || "";
    state.strategyHelpedAnswer = reflection.strategy_helped_answer || null;
    state.nextStepAnswer = resolveNextStepId(reflection);
    state.confidenceAfter = reflection.confidence_after;
    state.learnedToday = reflection.learned_today || "";
    state.usedStrategyName =
      reflection.used_strategy_name || state.usedStrategyName || null;
    return true;
  }

  function showWorkPathNoteField() {
    return state.workPathAnswer === "teilweise_abgewichen" || state.workPathAnswer === "nein_anders";
  }

  function renderStrategyBlock(ui) {
    const strategyName = state.usedStrategyName;
    const strategyInfo = strategyName
      ? `<p class="reflect-strategy-used"><strong>Genutzte Strategie:</strong> ${ui.escapeHtml(strategyName)}</p>`
      : "";

    return `
      <div class="reflect-strategy-block">
        ${strategyInfo}
        ${ui.fieldWrap(
          ui.fieldLabel("Hat dir die Strategie geholfen?", { required: true }),
          ui.select(
            "strategyHelpedAnswer",
            mapOptions(C().REFLECT_STRATEGY_HELPED),
            state.strategyHelpedAnswer,
            { phase: "reflect", placeholder: "Bitte wählen…" }
          )
        )}
      </div>`;
  }

  function renderReflectionDetails(ui, r) {
    const goalLabel = r.goal_reached_answer || labelForOption(C().GOAL_ACHIEVED, resolveGoalReachedId(r));
    const workLabel =
      labelForOption(C().HOW_WORKED, resolveWorkPathId(r)) ||
      r.work_path_answer ||
      r.how_worked;
    const rows = [
      ["Ziel erreicht?", goalLabel],
      ["Habe ich meinen Weg eingehalten?", workLabel],
      ...(r.work_path_note ? [["Was war anders?", r.work_path_note]] : []),
      ...(r.used_strategy_name ? [["Genutzte Strategie", r.used_strategy_name]] : []),
      ...(r.strategy_helped_answer
        ? [["Strategie geholfen?", labelForOption(C().REFLECT_STRATEGY_HELPED, r.strategy_helped_answer)]]
        : []),
      ["Nächster Schritt", labelForNextStep(resolveNextStepId(r))],
      ["Wie sicher fühlst du dich jetzt?", r.confidence_after != null ? `${r.confidence_after}/5` : "–"],
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

    root.innerHTML = `
      <div class="logbuch-form logbuch-form-readonly">
        <p class="logbuch-meta">${ui.escapeHtml(formatMetaLine(state.entry))}</p>
        ${renderDailyGoalCard(ui, state.entry)}
        <div class="logbuch-msg logbuch-msg-info">
          Deine Reflexion für <b>${ui.escapeHtml(state.entry.subject)}</b> (nur Ansicht)
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
    const confidenceHint =
      e.confidence_before != null
        ? `<p class="logbuch-reflect-before">Vorher: <b>${e.confidence_before}</b>/5</p>`
        : "";

    const workPathNoteField = showWorkPathNoteField()
      ? ui.fieldWrap(
          ui.fieldLabel("Was war anders?", { optional: true }),
          `<input type="text" class="logbuch-input" id="reflectWorkPathNote" maxlength="200"
            placeholder="Kurz beschreiben …" value="${ui.escapeHtml(state.workPathNote)}">`,
          "",
          { wide: true }
        )
      : "";

    root.innerHTML = `
      <div class="logbuch-form">
        <p class="logbuch-meta">${ui.escapeHtml(formatMetaLine(e))}</p>

        ${renderDailyGoalCard(ui, e)}

        ${
          state.existingReflection?.canEdit
            ? `<div class="logbuch-msg logbuch-msg-info">Du bearbeitest deine Reflexion – beim Speichern gibt es kein zusätzliches XP.</div>`
            : ""
        }

        ${ui.fieldWrap(
          ui.fieldLabel("Ziel erreicht?", { required: true }),
          ui.select("goalReachedAnswer", mapOptions(C().GOAL_ACHIEVED), state.goalReachedAnswer, {
            phase: "reflect",
            placeholder: "Bitte wählen…"
          })
        )}

        ${ui.fieldWrap(
          ui.fieldLabel("Habe ich meinen Weg eingehalten?", { required: true }),
          ui.select("workPathAnswer", mapOptions(C().HOW_WORKED), state.workPathAnswer, {
            phase: "reflect",
            placeholder: "Bitte wählen…"
          })
        )}

        ${workPathNoteField}

        ${renderStrategyBlock(ui)}

        ${ui.fieldWrap(
          ui.fieldLabel("Nächster Schritt", { required: true }),
          ui.select("nextStepAnswer", mapOptions(C().NEXT_STEPS), state.nextStepAnswer, {
            phase: "reflect",
            placeholder: "Bitte wählen…"
          })
        )}

        ${ui.fieldWrap(
          ui.fieldLabel("Wie sicher fühlst du dich jetzt?", { required: true }),
          ui.select(
            "confidenceAfter",
            C().REFLECT_CONFIDENCE,
            state.confidenceAfter != null ? String(state.confidenceAfter) : null,
            { phase: "reflect", placeholder: "Bitte wählen…" }
          ),
          confidenceHint
        )}

        ${ui.fieldWrap(
          ui.fieldLabel("Was habe ich gelernt?", { optional: true }),
          `<input type="text" class="logbuch-input" id="reflectLearned" maxlength="200"
            placeholder="Heute habe ich gelernt, dass …" value="${ui.escapeHtml(state.learnedToday)}">
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
      if (field === "workPathAnswer") {
        render();
      }
    });

    root.querySelector("#reflectWorkPathNote")?.addEventListener("input", (ev) => {
      state.workPathNote = ev.target.value.slice(0, 200);
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
    if (!state.goalReachedAnswer) {
      state.errorMsg = "Bitte wähle, ob du dein Ziel erreicht hast.";
      render();
      return;
    }
    if (!state.workPathAnswer) {
      state.errorMsg = "Bitte beantworte, ob du deinen Weg eingehalten hast.";
      render();
      return;
    }
    if (!state.strategyHelpedAnswer) {
      state.errorMsg = "Bitte beantworte, ob dir die Strategie geholfen hat.";
      render();
      return;
    }
    if (!state.nextStepAnswer) {
      state.errorMsg = "Bitte wähle den nächsten Schritt.";
      render();
      return;
    }
    if (state.confidenceAfter == null) {
      state.errorMsg = "Bitte wähle, wie sicher du dich jetzt fühlst.";
      render();
      return;
    }

    state.errorMsg = "";
    state.submitting = true;
    render();

    const payload = {
      logEntryId: state.entryId,
      goalReachedAnswer: state.goalReachedAnswer,
      workPathAnswer: state.workPathAnswer,
      workPathNote: state.workPathNote.trim() || null,
      strategyHelpedAnswer: state.strategyHelpedAnswer,
      usedStrategyName: state.usedStrategyName,
      nextStepAnswer: state.nextStepAnswer,
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
    state.goalReachedAnswer = null;
    state.workPathAnswer = null;
    state.workPathNote = "";
    state.strategyHelpedAnswer = null;
    state.nextStepAnswer = null;
    state.confidenceAfter = null;
    state.learnedToday = "";
    state.usedStrategyName = null;
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
      state.usedStrategyName =
        data.entry.used_strategy_name ||
        data.existingCheck?.selected_strategy_name ||
        null;
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
