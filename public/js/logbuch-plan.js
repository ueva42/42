/**
 * SRL-Logbuch – PLANEN-Screen (Forethought).
 */
(function () {
  const C = () => window.LOGBUCH;

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

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function optionButtons(items, selected, field, opts = {}) {
    const multi = !!opts.multi;
    const disabled = !!opts.disabled;
    const getValue = typeof opts.getValue === "function" ? opts.getValue : (x) => x;
    const getLabel = typeof opts.getLabel === "function" ? opts.getLabel : (x) => x;
    const isLocked = typeof opts.isLocked === "function" ? opts.isLocked : () => false;
    const lockHint = opts.lockHint || "Noch gesperrt";

    return items
      .map((item) => {
        const value = getValue(item);
        const label = getLabel(item);
        const locked = isLocked(item);
        const active = multi
          ? (selected || []).includes(value)
          : selected === value;
        const classes = [
          "logbuch-opt",
          active ? "active" : "",
          locked ? "locked" : "",
          disabled || locked ? "disabled" : ""
        ]
          .filter(Boolean)
          .join(" ");

        return `
          <button type="button" class="${classes}"
            data-field="${field}"
            data-value="${escapeHtml(value)}"
            ${locked || disabled ? "disabled" : ""}>
            ${escapeHtml(label)}
            ${locked ? `<span class="logbuch-opt-lock">${lockHint}</span>` : ""}
          </button>`;
      })
      .join("");
  }

  function renderStrategyGroups() {
    const groups = C().STRATEGIES;
    return Object.entries(groups)
      .map(
        ([cat, items]) => `
        <div class="logbuch-strategy-group">
          <div class="logbuch-strategy-cat">${escapeHtml(cat)}</div>
          <div class="logbuch-opt-grid">
            ${optionButtons(items, state.strategy, "strategy")}
          </div>
        </div>`
      )
      .join("");
  }

  function render() {
    const root = document.getElementById("plan-screen-root");
    if (!root) return;

    const dateLabel = new Date(state.date + "T12:00:00").toLocaleDateString("de-DE", {
      weekday: "long",
      day: "2-digit",
      month: "2-digit"
    });

    if (state.existingEntry) {
      root.innerHTML = `
        <div class="logbuch-plan-form">
          <p class="logbuch-plan-date">${escapeHtml(dateLabel)}</p>
          <div class="logbuch-msg logbuch-msg-info">
            Für <b>${escapeHtml(state.existingEntry.subject)}</b> ist heute schon ein Ziel gesetzt:
            <br><span class="logbuch-existing-goal">${escapeHtml(state.existingEntry.goal)}</span>
          </div>
          <button type="button" class="logbuch-btn logbuch-btn-secondary" id="planBackBtn">
            Zurück zu Mein Tag
          </button>
        </div>`;
      bindStaticHandlers(root);
      return;
    }

    root.innerHTML = `
      <div class="logbuch-plan-form">
        <p class="logbuch-plan-date">${escapeHtml(dateLabel)}${state.timeslot ? ` · ${escapeHtml(state.timeslot)}` : ""}</p>

        <section class="logbuch-field">
          <h3 class="logbuch-field-label">Fach <span class="req">*</span></h3>
          <div class="logbuch-opt-grid" id="planSubjects">
            ${optionButtons(C().SUBJECTS, state.subject, "subject")}
          </div>
        </section>

        <section class="logbuch-field">
          <h3 class="logbuch-field-label">Stundenziel <span class="req">*</span></h3>
          <div class="logbuch-opt-grid logbuch-opt-grid-tall">
            ${optionButtons(C().GOALS, state.goal, "goal")}
          </div>
        </section>

        <section class="logbuch-field">
          <h3 class="logbuch-field-label">Arbeitsziele <span class="opt">optional</span></h3>
          <div class="logbuch-opt-grid logbuch-opt-grid-tall">
            ${optionButtons(C().WORK_GOALS, state.workGoals, "workGoals", { multi: true })}
          </div>
        </section>

        <section class="logbuch-field">
          <h3 class="logbuch-field-label">Sozialform <span class="opt">optional</span></h3>
          <div class="logbuch-opt-grid">
            ${optionButtons(C().SOCIAL_FORMS, state.socialForm, "socialForm", {
              getValue: (x) => x.id,
              getLabel: (x) => x.label,
              isLocked: (x) => x.unlockKey && !state.socialUnlock[x.unlockKey],
              lockHint: "Silber/Gold"
            })}
          </div>
        </section>

        <section class="logbuch-field logbuch-field-collapse">
          <button type="button" class="logbuch-collapse-btn" id="planStrategyToggle" aria-expanded="false">
            Lernstrategie <span class="opt">optional</span>
            <span class="logbuch-collapse-icon">▼</span>
          </button>
          <div class="logbuch-collapse-body" id="planStrategyBody" hidden>
            ${renderStrategyGroups()}
          </div>
        </section>

        <section class="logbuch-field">
          <h3 class="logbuch-field-label">Selbstwirksamkeit vorher <span class="opt">optional</span></h3>
          <div class="logbuch-confidence">
            ${[1, 2, 3, 4, 5]
              .map(
                (n) => `
              <button type="button" class="logbuch-conf-btn ${state.confidenceBefore === n ? "active" : ""}"
                data-field="confidenceBefore" data-value="${n}">${n}</button>`
              )
              .join("")}
          </div>
          <div class="logbuch-confidence-hint">
            <span>unsicher</span><span>sicher</span>
          </div>
        </section>

        <section class="logbuch-field">
          <h3 class="logbuch-field-label">Was genau? <span class="opt">optional</span></h3>
          <input type="text" class="logbuch-input" id="planFreitext" maxlength="100"
            placeholder="Kurz beschreiben…" value="${escapeHtml(state.freitext)}">
          <div class="logbuch-char-count"><span id="planFreitextCount">${state.freitext.length}</span>/100</div>
        </section>

        ${state.errorMsg ? `<div class="logbuch-msg logbuch-msg-error">${escapeHtml(state.errorMsg)}</div>` : ""}

        <button type="button" class="logbuch-btn logbuch-btn-plan" id="planSubmitBtn" ${state.submitting ? "disabled" : ""}>
          ${state.submitting ? "Speichern…" : "Tagesziel speichern (+2 XP)"}
        </button>
        <button type="button" class="logbuch-btn logbuch-btn-secondary" id="planBackBtn">Abbrechen</button>
      </div>`;

    bindHandlers(root);
  }

  function bindStaticHandlers(root) {
    root.querySelector("#planBackBtn")?.addEventListener("click", () => {
      window.StudentRouter?.navigateToSection("today");
    });
  }

  function bindHandlers(root) {
    root.querySelectorAll(".logbuch-opt:not(.disabled)").forEach((btn) => {
      btn.addEventListener("click", () => {
        const field = btn.dataset.field;
        const value = btn.dataset.value;
        if (field === "workGoals") {
          const set = new Set(state.workGoals);
          if (set.has(value)) set.delete(value);
          else set.add(value);
          state.workGoals = [...set];
        } else {
          state[field] = state[field] === value ? null : value;
        }
        render();
      });
    });

    root.querySelectorAll(".logbuch-conf-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const n = Number(btn.dataset.value);
        state.confidenceBefore = state.confidenceBefore === n ? null : n;
        render();
      });
    });

    const stratToggle = root.querySelector("#planStrategyToggle");
    const stratBody = root.querySelector("#planStrategyBody");
    stratToggle?.addEventListener("click", () => {
      const open = stratBody.hidden;
      stratBody.hidden = !open;
      stratToggle.setAttribute("aria-expanded", String(open));
      stratToggle.querySelector(".logbuch-collapse-icon").textContent = open ? "▲" : "▼";
    });

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
          confidenceBefore: state.confidenceBefore,
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
        root.innerHTML = `<div class="logbuch-msg logbuch-msg-error">Planung konnte nicht geladen werden.</div>`;
      }
    }
  }

  window.LogbuchPlan = { init };
})();
