/**
 * SRL-Logbuch – TAGESABSCHLUSS / Reflexion (App-Flow mit Kacheln).
 */
(function () {
  const C = () => window.LOGBUCH;
  const UI = () => window.LogbuchUI;
  const V = () => window.LogbuchVisuals;

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

  const DISTURB_LEVELS = ["selten", "manchmal", "oft"];

  const state = {
    entryId: null,
    entry: null,
    existingReflection: null,
    usedStrategyName: null,
    goalReachedAnswer: null,
    helpedItems: [],
    disturbItems: {},
    workPathAnswer: null,
    workPathNote: "",
    strategyHelpedAnswer: null,
    nextStepAnswer: null,
    confidenceAfter: null,
    learnedToday: "",
    submitting: false,
    errorMsg: "",
    activeStep: 1,
    missionSeen: false,
    disturbDone: false,
    groupContext: null,
    handoffNotice: null,
    /** Shared-Tablet: Person gewählt / Handoff bestätigt → Wizard starten */
    personConfirmed: false,
    pickerFocusEntryId: null
  };

  function groupMembers() {
    return (state.groupContext?.members || []).filter((m) => m && m.entryId);
  }

  function isSharedReflect() {
    const gc = state.groupContext;
    return !!(
      gc?.enabled &&
      String(gc.deviceMode || "shared") !== "personal" &&
      groupMembers().length >= 2
    );
  }

  function pendingReflectMembers() {
    return groupMembers().filter((m) => !m.hasReflection);
  }

  function nextPendingReflect(currentUserId) {
    const members = groupMembers();
    const cur = Number(currentUserId);
    const idx = members.findIndex((m) => Number(m.userId) === cur);
    const ordered =
      idx >= 0
        ? members.slice(idx + 1).concat(members.slice(0, idx))
        : members.filter((m) => Number(m.userId) !== cur);
    return ordered.find((m) => m.entryId && !m.hasReflection) || null;
  }

  function reflectHandoffStyles() {
    return `<style>
      .plan-handoff-strip{margin:0 0 14px;padding:12px;border-radius:14px;border:1px solid rgba(34,211,238,.45);background:rgba(8,47,73,.55)}
      .plan-handoff-strip__label{margin:0 0 8px;font-size:.72rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#67e8f9}
      .plan-handoff-strip__row{display:flex;flex-wrap:wrap;gap:8px}
      .plan-handoff-strip__btn{min-height:44px;padding:8px 14px;border-radius:12px;border:2px solid rgba(148,163,184,.4);background:rgba(15,23,42,.45);color:#cbd5e1;font-weight:800;font-size:.95rem;cursor:pointer}
      .plan-handoff-strip__btn.is-active{border-color:#22d3ee;background:linear-gradient(145deg,rgba(14,116,144,.95),rgba(8,47,73,.98));color:#fff;box-shadow:0 0 0 2px rgba(34,211,238,.3)}
      .plan-handoff-strip__btn.is-done:not(.is-active){border-color:rgba(52,211,153,.55);color:#a7f3d0}
      .plan-handoff-strip__hint{margin:8px 0 0;font-size:.78rem;color:#94a3b8}
      .pq-handoff{text-align:center}
      .pq-handoff__name{margin:6px 0 14px;font-size:2.2rem;font-weight:900;line-height:1.1;color:#22d3ee}
      .pq-handoff .today-app-btn{width:100%;min-height:58px;font-size:1.15rem}
      .pq-dots{display:flex;justify-content:center;gap:8px;margin:10px 0 16px}
      .pq-dots span{width:12px;height:12px;border-radius:50%;background:rgba(148,163,184,.35)}
      .pq-dots span.is-done{background:#34d399}
      .pq-dots span.is-next{background:#22d3ee;box-shadow:0 0 0 3px rgba(34,211,238,.35)}
      .reflect-pick__row{display:flex;flex-direction:column;gap:10px;margin:12px 0 18px}
      .reflect-pick__btn{min-height:56px;padding:12px 16px;border-radius:14px;border:2px solid rgba(148,163,184,.4);background:rgba(15,23,42,.55);color:#e2e8f0;font-weight:800;font-size:1.1rem;cursor:pointer;text-align:left}
      .reflect-pick__btn.is-focus{border-color:#22d3ee;background:linear-gradient(145deg,rgba(14,116,144,.95),rgba(8,47,73,.98));color:#fff}
      .reflect-pick__btn.is-done{border-color:rgba(52,211,153,.5);color:#a7f3d0;opacity:.85}
    </style>`;
  }

  function renderReflectHandoffStrip(ui) {
    const members = groupMembers();
    if (!isSharedReflect() || members.length < 2) return "";
    const activeId = Number(state.entry?.user_id);
    return `
      <div class="plan-handoff-strip" role="group" aria-label="Person am Tablet">
        <p class="plan-handoff-strip__label">Tagesabschluss für</p>
        <div class="plan-handoff-strip__row">
          ${members
            .map((m) => {
              const active = Number(m.userId) === activeId;
              const done = !!m.hasReflection;
              return `<button type="button" class="plan-handoff-strip__btn${active ? " is-active" : ""}${
                done ? " is-done" : ""
              }" data-reflect-handoff="${ui.escapeHtml(String(m.entryId))}" aria-pressed="${
                active ? "true" : "false"
              }">${ui.escapeHtml(m.displayName || "Person")}${done ? " ✓" : ""}</button>`;
            })
            .join("")}
        </div>
        <p class="plan-handoff-strip__hint">Andere Person tippen = Tablet weitergeben</p>
      </div>
      ${reflectHandoffStyles()}`;
  }

  function renderReflectPersonPicker(ui) {
    const members = groupMembers();
    const pending = pendingReflectMembers();
    const focusId = Number(
      state.pickerFocusEntryId ||
        pending[0]?.entryId ||
        state.entryId ||
        members[0]?.entryId
    );
    const focus = members.find((m) => Number(m.entryId) === focusId) || pending[0] || members[0];
    const done = members.filter((m) => m.hasReflection).length;
    return `
      ${reflectHandoffStyles()}
      <div class="plan-next-modal-backdrop plan-next-modal-backdrop--ask" role="dialog" aria-modal="true" aria-label="Person wählen">
        <div class="plan-next-modal plan-next-modal--ask">
          <p class="plan-next-modal__kicker">Tagesabschluss · ${done}/${members.length} fertig</p>
          <h3 class="plan-next-modal__title">Wer macht den Abschluss?</h3>
          <p class="plan-next-modal__text">Person tippen, dann Tagesabschluss setzen – danach kommt die nächste Person.</p>
          <div class="reflect-pick__row" role="group" aria-label="Gruppenmitglieder">
            ${members
              .map((m) => {
                const isFocus = Number(m.entryId) === Number(focus?.entryId);
                const doneM = !!m.hasReflection;
                return `<button type="button" class="reflect-pick__btn${isFocus ? " is-focus" : ""}${
                  doneM ? " is-done" : ""
                }" data-reflect-pick="${ui.escapeHtml(String(m.entryId))}" ${
                  doneM ? "disabled" : ""
                }>${ui.escapeHtml(m.displayName || "Person")}${doneM ? " ✓ fertig" : ""}</button>`;
              })
              .join("")}
          </div>
          <button type="button" class="btn-primary logbuch-submit today-app-btn" id="reflectPickGo" ${
            focus && !focus.hasReflection ? "" : "disabled"
          }>${
            focus && !focus.hasReflection
              ? `${ui.escapeHtml(focus.displayName || "Person")} startet →`
              : "Alle fertig"
          }</button>
          <button type="button" class="logbuch-btn-ghost today-app-btn today-app-btn--ghost" id="reflectPickBack" style="margin-top:10px;width:100%">Zurück zu Mein Tag</button>
        </div>
      </div>`;
  }

  function renderReflectHandoffPopup(ui) {
    const n = state.handoffNotice;
    if (!n) return "";
    const members = groupMembers();
    const done = members.filter((m) => m.hasReflection).length;
    return `
      ${reflectHandoffStyles()}
      <div class="plan-next-modal-backdrop plan-next-modal-backdrop--ask" role="dialog" aria-modal="true" aria-label="Tablet weitergeben">
        <div class="plan-next-modal plan-next-modal--ask pq-handoff">
          <p class="plan-next-modal__kicker">✓ ${ui.escapeHtml(n.savedName || "Gespeichert")} gespeichert</p>
          <div class="pq-dots" aria-label="${done} von ${members.length} fertig">
            ${members
              .map((m) => {
                const isNext = Number(m.userId) === Number(n.nextUserId);
                return `<span class="${m.hasReflection ? "is-done" : isNext ? "is-next" : ""}"></span>`;
              })
              .join("")}
          </div>
          <h3 class="plan-next-modal__title">Gib das Tablet jetzt an</h3>
          <p class="pq-handoff__name">${ui.escapeHtml(n.nextName || "nächste Person")}</p>
          <button type="button" class="btn-primary logbuch-submit today-app-btn" id="reflectHandoffGo">${ui.escapeHtml(
            n.nextName || "Weiter"
          )} ist dran →</button>
        </div>
      </div>`;
  }

  function resetReflectForm() {
    state.goalReachedAnswer = null;
    state.helpedItems = [];
    state.disturbItems = {};
    state.workPathAnswer = null;
    state.workPathNote = "";
    state.strategyHelpedAnswer = null;
    state.nextStepAnswer = null;
    state.confidenceAfter = null;
    state.learnedToday = "";
    state.usedStrategyName = null;
    state.existingReflection = null;
    state.errorMsg = "";
    state.activeStep = 1;
    state.missionSeen = false;
    state.disturbDone = false;
    state.submitting = false;
  }

  async function loadReflectEntry(entryId) {
    const res = await fetch(
      `/api/student/log/reflect-context?entryId=${encodeURIComponent(entryId)}`
    );
    const data = await res.json();
    if (!data.entry) {
      state.entry = null;
      state.entryId = entryId;
      return false;
    }
    state.entryId = entryId;
    state.entry = data.entry;
    state.groupContext = data.groupContext || state.groupContext;
    state.usedStrategyName =
      data.entry.used_strategy_name ||
      data.existingCheck?.selected_strategy_name ||
      null;
    state.existingReflection = data.existingReflection || null;
    if (state.existingReflection?.canEdit) applyReflectionToState(state.existingReflection);
    return true;
  }

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
    const match = String(dateStr).match(/^(\d{4}-\d{2}-\d{2})/);
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

  function goalStepCard(step, title, bodyHtml, wide = false) {
    return `
      <article class="goal-step-card ${wide ? "goal-step-card--wide" : ""}">
        <header class="goal-step-card__head">
          <span class="goal-step-card__step">${step}</span>
          <h3 class="goal-step-card__title">${title}</h3>
        </header>
        <div class="goal-step-card__body">${bodyHtml}</div>
      </article>`;
  }

  function step1Complete() {
    return !!state.missionSeen;
  }

  function step2Complete() {
    return !!state.goalReachedAnswer;
  }

  function step3Complete() {
    return state.helpedItems.length > 0;
  }

  function step4Complete() {
    return !!state.disturbDone;
  }

  function step5Complete() {
    return !!(state.nextStepAnswer && state.confidenceAfter != null);
  }

  function requiredComplete() {
    return step2Complete() && step3Complete() && step5Complete();
  }

  function syncActiveStep() {
    if (state.activeStep >= 2 && !step1Complete()) {
      state.activeStep = 1;
      return;
    }
    if (state.activeStep >= 3 && !step2Complete()) {
      state.activeStep = 2;
      return;
    }
    if (state.activeStep >= 4 && !step3Complete()) {
      state.activeStep = 3;
      return;
    }
    if (state.activeStep >= 5 && !step4Complete()) {
      state.activeStep = 4;
      return;
    }
    if (state.activeStep >= 6 && !step5Complete()) {
      state.activeStep = 5;
      return;
    }
    if (state.activeStep === 2 && step2Complete()) state.activeStep = 3;
  }

  function openStep(step) {
    state.activeStep = Number(step);
    render();
  }

  function continueRow(id, label, enabled = true) {
    return `<div class="plan-acc__continue">
      <button type="button" class="today-app-btn" id="${id}" ${enabled ? "" : "disabled"}>${label}</button>
    </div>`;
  }

  function teardownAskModal() {
    document.querySelectorAll("body > .plan-next-modal-backdrop").forEach((el) => el.remove());
  }

  function portalAskModal(root) {
    teardownAskModal();
    root?.querySelectorAll(".plan-next-modal-backdrop").forEach((modal) => {
      document.body.appendChild(modal);
    });
  }

  function askModalScope(root) {
    return document.querySelector("body > .plan-next-modal-backdrop") || root;
  }

  function renderAskProgress(step, total = 5) {
    const current = Math.min(step, total);
    return `<div class="plan-ask__progress" role="navigation" aria-label="Schritte">
      ${Array.from({ length: total }, (_, i) => {
        const n = i + 1;
        const done = n < current || step > total;
        const isCurrent = n === current && step <= total;
        const locked = n > current;
        return `<button type="button" class="plan-ask__dot${done ? " is-done" : ""}${isCurrent ? " is-current" : ""}" data-plan-open="${n}" ${locked ? "disabled" : ""} aria-label="Schritt ${n}"></button>`;
      }).join("")}
    </div>`;
  }

  function renderStepPopup({ step, title, hint, body, showBack = true, total = 5 }) {
    const ui = UI();
    return `
      <div class="plan-next-modal-backdrop plan-next-modal-backdrop--ask" role="dialog" aria-modal="true" aria-label="${ui.escapeHtml(title)}">
        <div class="plan-next-modal plan-next-modal--ask">
          ${renderAskProgress(step, total)}
          <p class="plan-next-modal__kicker">Schritt ${step} von ${total}</p>
          <h3 class="plan-next-modal__title">${ui.escapeHtml(title)}</h3>
          ${hint ? `<p class="plan-next-modal__text">${hint}</p>` : ""}
          ${state.errorMsg ? `<p class="plan-next-modal__text" style="color:#fca5a5">${ui.escapeHtml(state.errorMsg)}</p>` : ""}
          <div class="plan-ask__body">${body}</div>
          <div class="plan-next-modal__actions">
            ${
              showBack
                ? `<button type="button" class="logbuch-btn-ghost today-app-btn today-app-btn--ghost" id="reflectAskBack">Zurück</button>`
                : `<button type="button" class="logbuch-btn-ghost today-app-btn today-app-btn--ghost" id="reflectBackBtn">Abbrechen</button>`
            }
          </div>
        </div>
      </div>`;
  }

  function renderSavePopup(ui) {
    return `
      <div class="plan-next-modal-backdrop plan-next-modal-backdrop--ask" role="dialog" aria-modal="true" aria-label="Das nehme ich mit">
        <div class="plan-next-modal plan-next-modal--ask">
          ${renderAskProgress(6, 5)}
          <p class="plan-next-modal__kicker">Bereit</p>
          <h3 class="plan-next-modal__title">Das nehme ich mit</h3>
          <p class="plan-next-modal__text">Prüfe kurz, dann speichern – danach geht’s zurück zu Mein Tag.</p>
          <div id="reflectSummaryCard">${renderReflectSummary(ui)}</div>
          ${state.errorMsg ? ui.msg(state.errorMsg) : ""}
          <div class="plan-next-modal__actions">
            <button type="button" class="btn-primary logbuch-submit today-app-btn" id="reflectSubmitBtn" ${
              state.submitting || !requiredComplete() ? "disabled" : ""
            }>${
              state.submitting
                ? "Speichern…"
                : state.existingReflection?.canEdit
                  ? "Tagesabschluss speichern"
                  : "Tagesabschluss speichern · +3 XP"
            }</button>
            <button type="button" class="logbuch-btn-ghost today-app-btn today-app-btn--ghost" id="reflectAskBack">Zurück</button>
          </div>
        </div>
      </div>`;
  }

  function renderAccordionStep(step, title, summary, bodyHtml, opts = {}) {
    const isOpen = state.activeStep === step;
    const isDone = !!opts.done;
    const canOpen = opts.canOpen !== false;
    const statusClass = isOpen ? "is-open" : isDone ? "is-done" : "is-locked";

    return `
      <article class="plan-acc ${statusClass}" data-plan-step="${step}">
        <button
          type="button"
          class="plan-acc__header"
          data-plan-open="${step}"
          ${!canOpen && !isOpen ? "disabled" : ""}
          aria-expanded="${isOpen ? "true" : "false"}"
        >
          <span class="plan-acc__step ${isDone && !isOpen ? "is-done" : ""}">${
            isDone && !isOpen ? "✓" : step
          }</span>
          <span class="plan-acc__titles">
            <span class="plan-acc__title">${title}</span>
            ${
              !isOpen
                ? `<span class="plan-acc__summary">${summary}</span>`
                : `<span class="plan-acc__hint">${opts.hint || "Jetzt ausfüllen"}</span>`
            }
          </span>
          <span class="plan-acc__chevron" aria-hidden="true">${isOpen ? "▾" : "▸"}</span>
        </button>
        ${isOpen ? `<div class="plan-acc__body">${bodyHtml}</div>` : ""}
      </article>`;
  }

  function missionSummaryLine(entry) {
    const parts = [
      entry?.what_goal_text,
      levelLabel(entry?.selected_level, entry),
      entry?.subject
    ].filter(Boolean);
    return parts.join(" · ") || "Mission ansehen";
  }

  function afterChoiceChange(root) {
    const prev = state.activeStep;
    syncActiveStep();
    if (state.activeStep !== prev) {
      render();
      return;
    }
    updatePreview(root);
  }

  function renderMissionCard(ui, entry) {
    const items = [
      ["Unterthema", entry.what_goal_text || "–"],
      ...(entry.role_goal_text
        ? [[entry.role_goal_role_name ? `Was-Ziel (${entry.role_goal_role_name})` : "Was-Ziel zur Rolle", entry.role_goal_text]]
        : []),
      ["Level", levelLabel(entry.selected_level, entry)],
      ["Fachliches Ziel", entry.level_goal_text || "–"],
      ["Mein Weg zum Ziel", entry.how_goal_text || entry.goal || "–"],
      ["Plan B", entry.plan_b_strategy_text || "–"]
    ];
    return `
      <div class="mission-facts">
        ${items
          .map(
            ([label, value]) => `
          <div class="mission-fact">
            <span class="mission-fact__label">${ui.escapeHtml(label)}</span>
            <span class="mission-fact__value">${ui.escapeHtml(value)}</span>
          </div>`
          )
          .join("")}
      </div>`;
  }

  function renderDailyGoalCard(ui, entry) {
    return `
      <section class="check-daily-goal">
        <h3 class="check-daily-goal-title">Heutiges Ziel</h3>
        <div class="check-daily-goal-card">
          <p><strong>Unterthema:</strong><br>${ui.escapeHtml(entry.what_goal_text || "–")}</p>
          ${
            entry.role_goal_text
              ? `<p><strong>Was-Ziel zur Rolle${entry.role_goal_role_name ? ` (${ui.escapeHtml(entry.role_goal_role_name)})` : ""}:</strong><br>${ui.escapeHtml(entry.role_goal_text)}</p>`
              : ""
          }
          <p><strong>Level:</strong><br>${ui.escapeHtml(levelLabel(entry.selected_level, entry))}</p>
          <p><strong>Fachliches Ziel:</strong><br>${ui.escapeHtml(entry.level_goal_text || "–")}</p>
          <p><strong>Mein Weg zum Ziel:</strong><br>${ui.escapeHtml(entry.how_goal_text || entry.goal || "–")}</p>
          ${
            entry.plan_b_strategy_text
              ? `<p><strong>Plan B, wenn ich hänge:</strong><br>${ui.escapeHtml(entry.plan_b_strategy_text)}</p>`
              : ""
          }
        </div>
      </section>`;
  }

  function parseStoredExtras(note) {
    const text = String(note || "");
    const helped = [];
    const disturb = {};
    const helpedMatch = text.match(/Geholfen:\s*([^\n|]+)/i);
    if (helpedMatch) {
      helpedMatch[1]
        .split("·")
        .map((s) => s.trim())
        .filter(Boolean)
        .forEach((label) => {
          const hit = (C().REFLECT_HELPED || []).find((h) => h.label === label);
          if (hit) helped.push(hit.id);
        });
    }
    const disturbMatch = text.match(/Gestört:\s*([^\n]+)/i);
    if (disturbMatch) {
      disturbMatch[1].split(";").forEach((part) => {
        const m = part.trim().match(/^(.+?)\s*\((selten|manchmal|oft)\)$/i);
        if (m) disturb[m[1].trim()] = m[2].toLowerCase();
      });
    }
    return { helped, disturb };
  }

  function buildWorkPathNote() {
    const helpedLabels = state.helpedItems
      .map((id) => (C().REFLECT_HELPED || []).find((h) => h.id === id)?.label)
      .filter(Boolean);
    const disturbParts = Object.entries(state.disturbItems).map(
      ([name, level]) => `${name} (${level})`
    );
    const chunks = [];
    if (helpedLabels.length) chunks.push(`Geholfen: ${helpedLabels.join(" · ")}`);
    if (disturbParts.length) chunks.push(`Gestört: ${disturbParts.join("; ")}`);
    if (state.workPathNote && !state.workPathNote.startsWith("Geholfen:")) {
      chunks.push(state.workPathNote);
    }
    return chunks.join(" | ").slice(0, 500);
  }

  function syncDerivedAnswers() {
    if (state.helpedItems.includes("mein_weg")) state.workPathAnswer = "ja_geplant";
    else if (state.helpedItems.length) state.workPathAnswer = "teilweise_abgewichen";
    else state.workPathAnswer = "nein_anders";

    if (!state.helpedItems.length) state.strategyHelpedAnswer = "keine_genutzt";
    else if (state.helpedItems.includes("andere")) state.strategyHelpedAnswer = "nein_andere";
    else if (state.helpedItems.includes("mein_weg") || state.helpedItems.includes("plan_b")) {
      state.strategyHelpedAnswer = "ja_geholfen";
    } else state.strategyHelpedAnswer = "ein_bisschen";

    if (!state.usedStrategyName && state.helpedItems.includes("mein_weg")) {
      state.usedStrategyName = state.entry?.how_goal_text || state.entry?.goal || null;
    }
  }

  function resolveGoalReachedId(reflection) {
    if (reflection.goal_reached_answer) {
      const byLabel = C().GOAL_ACHIEVED.find((x) => x.label === reflection.goal_reached_answer);
      if (byLabel) return byLabel.id;
      const legacyLabels = {
        "Ja, ich bin sicher.": "ja_sicher",
        "Teilweise, ich brauche noch Übung.": "teilweise_uebung",
        "Nein, ich habe es noch nicht verstanden.": "nein_nicht"
      };
      if (legacyLabels[reflection.goal_reached_answer]) {
        return legacyLabels[reflection.goal_reached_answer];
      }
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
    const extras = parseStoredExtras(reflection.work_path_note);
    state.helpedItems = extras.helped;
    state.disturbItems = extras.disturb;
    state.strategyHelpedAnswer = reflection.strategy_helped_answer || null;
    state.nextStepAnswer = resolveNextStepId(reflection);
    state.confidenceAfter = reflection.confidence_after;
    state.learnedToday = reflection.learned_today || "";
    state.usedStrategyName =
      reflection.used_strategy_name || state.usedStrategyName || null;
    state.missionSeen = true;
    state.disturbDone = true;
    if (requiredComplete()) state.activeStep = 6;
    else syncActiveStep();
    return true;
  }

  function currentMemberName() {
    const uid = Number(state.entry?.user_id);
    const m = groupMembers().find((x) => Number(x.userId) === uid);
    return m?.displayName || "";
  }

  function renderHero(ui, e) {
    const who = currentMemberName();
    const chips = [formatMetaLine(e), e.subject, who ? `für ${who}` : null].filter(Boolean);

    return `
      <article class="plan-app-hero plan-app-hero--compact plan-app-hero--reflect">
        <div class="plan-app-hero__content">
          <div class="plan-app-hero__icon" aria-hidden="true">
            <img src="/icons/student/png/lernstand.png" alt="" aria-hidden="true">
          </div>
          <div class="plan-app-hero__copy">
            <p class="plan-app-hero__eyebrow">Schritt 3 von 3 · Abschluss${who ? ` · ${ui.escapeHtml(who)}` : ""}</p>
            <h2 class="plan-app-hero__title">Mein Tagesabschluss</h2>
            <p class="plan-app-hero__meta">Was hat heute funktioniert und was ist dein nächster Schritt?</p>
            ${
              chips.length
                ? `<div class="plan-app-hero__chips">${chips
                    .map((c) => `<span class="plan-app-hero__chip">${ui.escapeHtml(c)}</span>`)
                    .join("")}</div>`
                : ""
            }
          </div>
        </div>
        <div class="plan-app-hero__visual" aria-hidden="true">
          <img src="/icons/student/hero/lernstand-hero.png?v=6" alt="" aria-hidden="true" loading="lazy">
        </div>
        <nav class="phase-rail" aria-label="Lernschritte">
          <span class="phase-rail__item is-done">1 · Tagesziel</span>
          <span class="phase-rail__item is-done">2 · Check</span>
          <span class="phase-rail__item is-active">3 · Abschluss</span>
        </nav>
      </article>`;
  }

  function goalTiles() {
    return (C().GOAL_ACHIEVED || []).map((g, i) => ({
      value: g.id,
      title: g.label.replace(/\.$/, ""),
      desc: g.label,
      icon: ["✓", "◑", "◌", "✎"][i] || "◆",
      accent: ["#22c55e", "#22d3ee", "#f472b6", "#a855f7"][i] || "#a855f7"
    }));
  }

  function helpedTiles() {
    return (C().REFLECT_HELPED || []).map((h) => ({
      value: h.id,
      title: h.label,
      desc: h.desc || "",
      icon: "◈",
      accent: "#a855f7"
    }));
  }

  function disturbTiles() {
    return (C().TIME_WASTERS || []).map((name) => ({
      value: name,
      title: name.replace("Handy / Social Media", "Handy oder Social Media").replace("Gespräche mit Nachbarn", "Gespräche"),
      desc: state.disturbItems[name] ? `Stufe: ${state.disturbItems[name]}` : "Tippen zum Auswählen",
      icon: "!",
      accent: "#f472b6"
    }));
  }

  function nextMissionTiles() {
    return (C().NEXT_STEPS || [])
      .filter((s) =>
        [
          "weiter_gleiches_ziel",
          "operator_weiter",
          "naechstes_level",
          "andere_strategie",
          "nachweis_vorbereiten",
          "hilfestellung"
        ].includes(s.id)
      )
      .map((s, i) => ({
        value: s.id,
        title: s.label,
        desc: "Nächste Mission wählen",
        icon: ["↺", "═", "↑", "↻", "▣", "?"][i] || "◆",
        accent: "#22d3ee"
      }));
  }

  function renderDisturbLevels(ui) {
    const selected = Object.keys(state.disturbItems);
    if (!selected.length) return "";
    return `
      <div class="disturb-levels">
        ${selected
          .map((name) => {
            const level = state.disturbItems[name];
            return `
            <div class="disturb-level-row">
              <span class="disturb-level-row__name">${ui.escapeHtml(name)}</span>
              <div class="disturb-level-segs" role="group" aria-label="${ui.escapeHtml(name)}">
                ${DISTURB_LEVELS.map(
                  (lv) => `
                  <button type="button" class="disturb-seg ${level === lv ? "is-active" : ""}" data-disturb-name="${ui.escapeHtml(name)}" data-disturb-level="${lv}">${lv}</button>`
                ).join("")}
              </div>
            </div>`;
          })
          .join("")}
      </div>`;
  }

  function renderReflectSummary(ui) {
    if (!state.goalReachedAnswer || !state.nextStepAnswer || state.confidenceAfter == null) {
      return `<p class="plan-summary-empty">Wähle Zielstatus und nächsten Schritt – hier siehst du dann deine Zusammenfassung.</p>`;
    }
    const helped =
      state.helpedItems
        .map((id) => (C().REFLECT_HELPED || []).find((h) => h.id === id)?.label)
        .filter(Boolean)
        .join(", ") || "–";
    const disturb =
      Object.entries(state.disturbItems)
        .map(([n, l]) => `${n} (${l})`)
        .join(", ") || "–";

    return `
      <div class="mission-summary">
        <div class="mission-summary__block">
          <p class="mission-summary__label">Zielstatus</p>
          <p class="mission-summary__value">${ui.escapeHtml(labelForOption(C().GOAL_ACHIEVED, state.goalReachedAnswer))}</p>
        </div>
        <div class="mission-summary__block">
          <p class="mission-summary__label">Was hat geholfen</p>
          <p class="mission-summary__value">${ui.escapeHtml(helped)}</p>
        </div>
        <div class="mission-summary__block">
          <p class="mission-summary__label">Was hat gestört</p>
          <p class="mission-summary__value">${ui.escapeHtml(disturb)}</p>
        </div>
        <div class="mission-summary__block">
          <p class="mission-summary__label">Nächster Schritt</p>
          <p class="mission-summary__value">${ui.escapeHtml(labelForNextStep(state.nextStepAnswer))}</p>
        </div>
        <div class="mission-summary__reward">
          <span class="mission-summary__reward-label">Belohnung</span>
          <span class="mission-summary__reward-value">${state.existingReflection?.canEdit ? "Kein zusätzliches XP" : "+3 XP"}</span>
        </div>
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
      ["Mein Weg zum Ziel eingehalten?", workLabel],
      ...(r.work_path_note ? [["Details", r.work_path_note]] : []),
      ...(r.used_strategy_name ? [["Genutzte Strategie", r.used_strategy_name]] : []),
      ...(r.strategy_helped_answer
        ? [["Strategie geholfen?", labelForOption(C().REFLECT_STRATEGY_HELPED, r.strategy_helped_answer)]]
        : []),
      ["Nächster Schritt", labelForNextStep(resolveNextStepId(r))],
      ["Sicherheit jetzt", r.confidence_after != null ? `${r.confidence_after}/5` : "–"],
      ["Mitgenommen", r.learned_today || "–"]
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
    teardownAskModal();
    const root = document.getElementById("reflect-screen-root");
    if (!root) return;
    const ui = UI();
    root.innerHTML = `
      <div class="plan-app">
        <p class="logbuch-meta">${ui.escapeHtml(formatMetaLine(state.entry))}</p>
        ${renderDailyGoalCard(ui, state.entry)}
        <div class="logbuch-msg logbuch-msg-info">
          Deine Reflexion für <b>${ui.escapeHtml(state.entry.subject)}</b> (nur Ansicht)
        </div>
        ${renderReflectionDetails(ui, state.existingReflection)}
        ${ui.btnGhost("Zurück zu Mein Tag", "reflectBackBtn", "today-app-btn today-app-btn--ghost")}
      </div>`;
    root.querySelector("#reflectBackBtn")?.addEventListener("click", () => {
      window.StudentRouter?.navigateToSection("today");
    });
  }

  function renderMissing() {
    teardownAskModal();
    const root = document.getElementById("reflect-screen-root");
    if (!root) return;
    const ui = UI();
    root.innerHTML = `
      <div class="plan-app">
        ${ui.msg("Kein Lern-Eintrag gefunden. Bitte zuerst ein Tagesziel setzen.")}
        ${ui.btnGhost("Zurück zu Mein Tag", "reflectBackBtn", "today-app-btn today-app-btn--ghost")}
      </div>`;
    root.querySelector("#reflectBackBtn")?.addEventListener("click", () => {
      window.StudentRouter?.navigateToSection("today");
    });
  }


  function updatePreview(root) {
    const box = root.querySelector("#reflectSummaryCard");
    if (box) box.innerHTML = renderReflectSummary(UI());
    const submitBtn = root.querySelector("#reflectSubmitBtn");
    if (submitBtn) submitBtn.disabled = state.submitting || !requiredComplete();
    const helpedBtn = root.querySelector("#reflectHelpedContinue");
    if (helpedBtn) helpedBtn.disabled = !step3Complete();
    const nextBtn = root.querySelector("#reflectNextContinue");
    if (nextBtn) nextBtn.disabled = !step5Complete();
  }

  function render() {
    const root = document.getElementById("reflect-screen-root");
    if (!root) return;

    if (!state.entry && !state.handoffNotice) {
      renderMissing();
      return;
    }

    const ui = UI();

    // Shared: nach Speichern Tablet weitergeben
    if (state.handoffNotice) {
      teardownAskModal();
      root.innerHTML = `<div class="plan-app reflect-app plan-app--ask"></div>${renderReflectHandoffPopup(ui)}`;
      portalAskModal(root);
      bindHandoffHandlers();
      return;
    }

    // Shared: zuerst Person wählen (wie beim Tagesziel)
    if (isSharedReflect() && !state.personConfirmed && pendingReflectMembers().length) {
      teardownAskModal();
      root.innerHTML = `<div class="plan-app reflect-app plan-app--ask"></div>${renderReflectPersonPicker(ui)}`;
      portalAskModal(root);
      bindPickerHandlers();
      return;
    }

    if (!state.entry) {
      renderMissing();
      return;
    }

    if (state.existingReflection && !state.existingReflection.canEdit) {
      renderReadOnly();
      return;
    }

    const visuals = V();
    const e = state.entry;
    const tile = (tiles, active, attr, multi) =>
      visuals ? visuals.strategyTileGrid(tiles, active, attr, { multi: !!multi }) : "";

    const confOptions = [
      { value: 1, label: "Sehr unsicher", icon: "1", accent: "#f472b6" },
      { value: 2, label: "Eher unsicher", icon: "2", accent: "#a855f7" },
      { value: 3, label: "Mittel", icon: "3", accent: "#a855f7" },
      { value: 4, label: "Sicher", icon: "4", accent: "#22d3ee" },
      { value: 5, label: "Sehr sicher", icon: "5", accent: "#22c55e" }
    ];

    const missionBody = `
      ${renderMissionCard(ui, e)}
      ${continueRow("reflectMissionContinue", "Weiter zum Abschluss")}`;

    const helpedBody = `
      <p class="way-to-goal__intro">Mehrfachauswahl – inkl. <strong>Mein Weg zum Ziel</strong>.</p>
      ${tile(helpedTiles(), state.helpedItems, "data-helped", true)}
      ${continueRow("reflectHelpedContinue", "Weiter", step3Complete())}`;

    const disturbBody = `
      <p class="way-to-goal__intro">Optional · Mehrfachauswahl</p>
      ${tile(disturbTiles(), Object.keys(state.disturbItems), "data-disturb", true)}
      ${renderDisturbLevels(ui)}
      ${continueRow(
        "reflectDisturbContinue",
        Object.keys(state.disturbItems).length ? "Weiter" : "Ohne Angabe weiter"
      )}`;

    const nextBody = `
      <div class="goal-step-card__stack">
        ${tile(nextMissionTiles(), state.nextStepAnswer, "data-next")}
        <p class="way-section__title">Wie sicher fühlst du dich jetzt?</p>
        ${visuals ? visuals.confidenceSelector(confOptions, state.confidenceAfter) : ""}
        ${ui.fieldWrap(
          ui.fieldLabel("Das nehme ich mir für das nächste Mal vor.", { optional: true }),
          `<input type="text" class="logbuch-input app-input" id="reflectLearned" maxlength="200"
            placeholder="Kurz notieren …" value="${ui.escapeHtml(state.learnedToday)}">
           <div class="logbuch-char-count"><span id="reflectLearnedCount">${state.learnedToday.length}</span>/200</div>`,
          "",
          { wide: true }
        )}
        ${continueRow("reflectNextContinue", "Weiter", step5Complete())}
      </div>`;

    const stepPopup = state.activeStep >= 6
      ? renderSavePopup(ui)
      : state.activeStep === 1
        ? renderStepPopup({
            step: 1,
            title: "Meine Mission",
            hint: "Kurz ansehen, dann weiter.",
            body: missionBody,
            showBack: false
          })
        : state.activeStep === 2
          ? renderStepPopup({
              step: 2,
              title: "Ziel erreicht?",
              hint: "Eine Karte wählen.",
              body: tile(goalTiles(), state.goalReachedAnswer, "data-goal")
            })
          : state.activeStep === 3
            ? renderStepPopup({
                step: 3,
                title: "Was hat geholfen?",
                hint: "Mindestens eine Auswahl.",
                body: helpedBody
              })
            : state.activeStep === 4
              ? renderStepPopup({
                  step: 4,
                  title: "Was hat mich gestört?",
                  hint: "Optional – auch ohne Angabe weiter.",
                  body: disturbBody
                })
              : renderStepPopup({
                  step: 5,
                  title: "Meine nächste Mission",
                  hint: "Nächster Schritt und Sicherheit.",
                  body: nextBody
                });

    root.innerHTML = `
      <div class="plan-app reflect-app plan-app--ask">
        ${renderHero(ui, e)}
        ${renderReflectHandoffStrip(ui)}
        ${
          state.existingReflection?.canEdit
            ? `<div class="logbuch-msg logbuch-msg-info">Du bearbeitest deine Reflexion – beim Speichern gibt es kein zusätzliches XP.</div>`
            : ""
        }
      </div>
      ${stepPopup}`;

    portalAskModal(root);
    bindHandlers(root);
  }

  async function switchReflectPerson(entryId, { confirm = true } = {}) {
    if (!entryId) return false;
    resetReflectForm();
    state.handoffNotice = null;
    state.personConfirmed = !!confirm;
    state.pickerFocusEntryId = entryId;
    const rootEl = document.getElementById("reflect-screen-root");
    if (rootEl) rootEl.innerHTML = `<div class="logbuch-loading">Lade Tagesabschluss…</div>`;
    try {
      const ok = await loadReflectEntry(entryId);
      if (!ok) {
        renderMissing();
        return false;
      }
      if (confirm) state.personConfirmed = true;
      render();
      return true;
    } catch (err) {
      console.error(err);
      if (rootEl) rootEl.innerHTML = UI().msg("Tagesabschluss konnte nicht geladen werden.");
      return false;
    }
  }

  function bindPickerHandlers() {
    const scope = askModalScope();
    scope.querySelectorAll("[data-reflect-pick]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-reflect-pick");
        if (!id) return;
        state.pickerFocusEntryId = id;
        render();
      });
    });
    scope.querySelector("#reflectPickGo")?.addEventListener("click", () => {
      const id = state.pickerFocusEntryId || pendingReflectMembers()[0]?.entryId;
      if (!id) return;
      switchReflectPerson(id, { confirm: true });
    });
    scope.querySelector("#reflectPickBack")?.addEventListener("click", () => {
      teardownAskModal();
      window.StudentRouter?.navigateToSection("today");
    });
  }

  function bindHandoffHandlers() {
    const scope = askModalScope();
    scope.querySelector("#reflectHandoffGo")?.addEventListener("click", () => {
      const nextId = state.handoffNotice?.nextEntryId;
      state.handoffNotice = null;
      if (nextId) {
        switchReflectPerson(nextId, { confirm: true });
        return;
      }
      teardownAskModal();
      window.StudentRouter?.navigateToSection("today");
    });
  }

  function bindHandlers(root) {
    const scope = askModalScope(root);

    root.querySelectorAll("[data-reflect-handoff]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const nextId = btn.getAttribute("data-reflect-handoff");
        if (!nextId || String(nextId) === String(state.entryId)) return;
        switchReflectPerson(nextId, { confirm: true });
      });
    });

    scope.querySelectorAll("[data-plan-open]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const step = Number(btn.dataset.planOpen);
        if (!step) return;
        if (step >= 2 && !step1Complete() && state.activeStep !== step) return;
        if (step >= 3 && !step2Complete() && state.activeStep !== step) return;
        if (step >= 4 && !step3Complete() && state.activeStep !== step) return;
        if (step >= 5 && !step4Complete() && state.activeStep !== step) return;
        if (step >= 6 && !step5Complete() && state.activeStep !== step) return;
        openStep(step);
      });
    });

    scope.querySelector("#reflectAskBack")?.addEventListener("click", () => {
      state.activeStep = Math.max(1, Number(state.activeStep) - 1);
      render();
    });

    scope.querySelector("#reflectMissionContinue")?.addEventListener("click", () => {
      state.missionSeen = true;
      state.activeStep = 2;
      render();
    });

    scope.querySelector("#reflectHelpedContinue")?.addEventListener("click", () => {
      if (!step3Complete()) return;
      state.activeStep = 4;
      render();
    });

    scope.querySelector("#reflectDisturbContinue")?.addEventListener("click", () => {
      state.disturbDone = true;
      state.activeStep = 5;
      render();
    });

    scope.querySelector("#reflectNextContinue")?.addEventListener("click", () => {
      if (!step5Complete()) return;
      state.activeStep = 6;
      render();
    });

    scope.querySelectorAll("[data-goal]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.goalReachedAnswer = btn.dataset.goal;
        scope.querySelectorAll("[data-goal]").forEach((c) => {
          c.classList.toggle("is-active", c.dataset.goal === state.goalReachedAnswer);
        });
        afterChoiceChange(scope);
      });
    });

    scope.querySelectorAll("[data-helped]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.helped;
        const idx = state.helpedItems.indexOf(id);
        if (idx >= 0) state.helpedItems.splice(idx, 1);
        else state.helpedItems.push(id);
        syncDerivedAnswers();
        scope.querySelectorAll("[data-helped]").forEach((c) => {
          c.classList.toggle("is-active", state.helpedItems.includes(c.dataset.helped));
        });
        afterChoiceChange(scope);
      });
    });

    scope.querySelectorAll("[data-disturb]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const name = btn.dataset.disturb;
        if (state.disturbItems[name]) delete state.disturbItems[name];
        else state.disturbItems[name] = "manchmal";
        render();
      });
    });

    scope.querySelectorAll("[data-disturb-level]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const name = btn.dataset.disturbName;
        state.disturbItems[name] = btn.dataset.disturbLevel;
        scope.querySelectorAll(`[data-disturb-name="${name}"]`).forEach((c) => {
          c.classList.toggle("is-active", c.dataset.disturbLevel === state.disturbItems[name]);
        });
        updatePreview(scope);
      });
    });

    scope.querySelectorAll("[data-next]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.nextStepAnswer = btn.dataset.next;
        scope.querySelectorAll("[data-next]").forEach((c) => {
          c.classList.toggle("is-active", c.dataset.next === state.nextStepAnswer);
        });
        afterChoiceChange(scope);
      });
    });

    scope.querySelectorAll("[data-confidence]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.confidenceAfter = Number(btn.dataset.confidence);
        scope.querySelectorAll("[data-confidence]").forEach((c) => {
          c.classList.toggle(
            "is-active",
            Number(c.dataset.confidence) === state.confidenceAfter
          );
        });
        afterChoiceChange(scope);
      });
    });

    const learned = scope.querySelector("#reflectLearned");
    learned?.addEventListener("input", () => {
      state.learnedToday = learned.value.slice(0, 200);
      const count = scope.querySelector("#reflectLearnedCount");
      if (count) count.textContent = String(state.learnedToday.length);
    });

    scope.querySelector("#reflectSubmitBtn")?.addEventListener("click", submitReflect);
    scope.querySelector("#reflectBackBtn")?.addEventListener("click", () => {
      teardownAskModal();
      window.StudentRouter?.navigateToSection("today");
    });
  }

  async function submitReflect() {
    if (state.submitting) return;
    syncDerivedAnswers();

    function fail(msg, step) {
      state.errorMsg = msg;
      if (step) state.activeStep = step;
      render();
    }

    if (!step1Complete()) {
      fail("Bitte sieh dir zuerst deine Mission an.", 1);
      return;
    }
    if (!state.goalReachedAnswer) {
      fail("Bitte wähle, ob du dein Ziel erreicht hast.", 2);
      return;
    }
    if (!state.helpedItems.length) {
      fail("Bitte wähle mindestens etwas unter „Was hat geholfen?“.", 3);
      return;
    }
    if (!step4Complete()) {
      fail("Bitte bestätige den Schritt „Was hat mich gestört?“ (auch ohne Auswahl).", 4);
      return;
    }
    if (!state.nextStepAnswer) {
      fail("Bitte wähle deine nächste Mission.", 5);
      return;
    }
    if (state.confidenceAfter == null) {
      fail("Bitte wähle, wie sicher du dich jetzt fühlst.", 5);
      return;
    }

    state.errorMsg = "";
    state.submitting = true;
    render();

    const payload = {
      logEntryId: state.entryId,
      goalReachedAnswer: state.goalReachedAnswer,
      workPathAnswer: state.workPathAnswer,
      workPathNote: (buildWorkPathNote() || "").slice(0, 200) || null,
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
      // Schon gespeichert (Doppelklick / Retry) → wie Erfolg behandeln, damit Handoff weitergeht
      const alreadyDone =
        !data.success &&
        /bereits abgeschlossen|schon gespeichert/i.test(String(data.message || ""));
      if (!data.success && !alreadyDone) {
        state.submitting = false;
        state.errorMsg = data.message || "Speichern fehlgeschlagen.";
        render();
        return;
      }
      window.LogbuchReminders?.clearForEntry?.(state.entryId, "reflect");
      teardownAskModal();
      if (typeof window.loadMe === "function") await window.loadMe();
      // Shared-Tablet: Handoff wie beim Tagesziel – nächste Person wählen / Tablet weitergeben
      if (isSharedReflect()) {
        const members = groupMembers();
        const curOwner = Number(state.entry?.user_id);
        const saved = members.find((m) => Number(m.userId) === curOwner);
        state.groupContext = {
          ...state.groupContext,
          members: members.map((m) =>
            Number(m.userId) === curOwner ? { ...m, hasReflection: true } : m
          )
        };
        const next = nextPendingReflect(curOwner);
        if (next?.entryId) {
          state.submitting = false;
          state.personConfirmed = false;
          state.pickerFocusEntryId = next.entryId;
          state.handoffNotice = {
            savedName: saved?.displayName || "Gespeichert",
            nextUserId: Number(next.userId),
            nextEntryId: next.entryId,
            nextName: next.displayName || "nächste Person"
          };
          render();
          return;
        }
      }
      state.submitting = false;
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
    state.groupContext = null;
    state.handoffNotice = null;
    state.personConfirmed = false;
    state.pickerFocusEntryId = state.entryId;
    resetReflectForm();
    teardownAskModal();

    const root = document.getElementById("reflect-screen-root");
    if (root) root.innerHTML = `<div class="logbuch-loading">Lade Tagesabschluss…</div>`;

    if (!state.entryId) {
      renderMissing();
      return;
    }

    try {
      const ok = await loadReflectEntry(state.entryId);
      if (!ok) {
        renderMissing();
        return;
      }
      // Shared: Person wählen bevor der Wizard startet
      if (isSharedReflect() && pendingReflectMembers().length) {
        const pending = pendingReflectMembers();
        const urlPending = pending.some((m) => String(m.entryId) === String(state.entryId));
        state.pickerFocusEntryId = urlPending
          ? state.entryId
          : pending[0].entryId;
        state.personConfirmed = false;
      } else {
        state.personConfirmed = true;
      }
      render();
    } catch (err) {
      console.error(err);
      if (root) root.innerHTML = UI().msg("Tagesabschluss konnte nicht geladen werden.");
    }
  }

  window.LogbuchReflect = { init };
})();
