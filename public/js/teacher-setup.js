/**
 * Geführte Lehrer-Ersteinrichtung – schlanke Checkliste über bestehende Werkzeuge.
 */
(function () {
  const STEPS = [
    {
      id: "class",
      flag: "hasClass",
      title: "Klasse anlegen",
      text: "Gib den Namen deiner Klasse ein. Du wirst automatisch zugewiesen.",
      href: null
    },
    {
      id: "timetable",
      flag: "hasTimetable",
      title: "Stundenplan",
      text: "Trage Fächer und Zeiten für die Woche ein.",
      href: "/teacher/timetable"
    },
    {
      id: "levelplan",
      flag: "hasLevelplan",
      title: "Levelplan hochladen",
      text: "Importiere Unterthemen – daraus entstehen die Was-Ziele.",
      href: "/teacher/levelplan-import"
    },
    {
      id: "was",
      flag: "hasWasGoals",
      title: "Was-Ziele prüfen",
      text: "Sieh die Unterthemen an und ordne bei Bedarf Material zu.",
      href: "/teacher/was-goals"
    },
    {
      id: "wie",
      flag: "hasWieGoals",
      title: "Wie-Ziele fürs Fach",
      text: "Passe an, wie Schüler:innen am Tagesziel arbeiten (oder übernimm Standards).",
      href: "/teacher/lesson-goals"
    },
    {
      id: "material",
      flag: "hasMaterial",
      title: "Materialschrank",
      text: "Verlinke Übungen, Tools oder Arbeitsblätter für die Klasse.",
      href: "/teacher/materialschrank"
    },
    {
      id: "termin",
      flag: "hasTermin",
      title: "Termin anlegen",
      text: "Lege z. B. eine Klassenarbeit oder einen Levelcheck-Termin an.",
      href: "/teacher/termine"
    }
  ];

  const state = {
    open: false,
    stepIndex: 0,
    status: null,
    loading: false,
    saving: false,
    error: "",
    className: "",
    api: null,
    onClassCreated: null
  };

  function esc(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function setupHref(href) {
    if (!href) return "#";
    const url = new URL(href, window.location.origin);
    url.searchParams.set("setup", "1");
    return url.pathname + url.search;
  }

  function stepDone(step) {
    if (!state.status || !step?.flag) return false;
    return !!state.status[step.flag];
  }

  function firstOpenStep() {
    const i = STEPS.findIndex((s) => !stepDone(s));
    return i < 0 ? STEPS.length - 1 : i;
  }

  function ensureRoot() {
    let root = document.getElementById("teacherSetupRoot");
    if (root) return root;
    root = document.createElement("div");
    root.id = "teacherSetupRoot";
    document.body.appendChild(root);
    return root;
  }

  function render() {
    const root = ensureRoot();
    if (!state.open) {
      root.innerHTML = "";
      root.hidden = true;
      document.body.classList.remove("td-setup-open");
      return;
    }
    root.hidden = false;
    document.body.classList.add("td-setup-open");

    const step = STEPS[state.stepIndex] || STEPS[0];
    const done = stepDone(step);
    const n = STEPS.length;
    const idx = state.stepIndex + 1;
    const doneCount = STEPS.filter((s) => stepDone(s)).length;

    const dots = STEPS.map((s, i) => {
      const cls = [
        "td-setup-dot",
        stepDone(s) ? "is-done" : "",
        i === state.stepIndex ? "is-current" : ""
      ]
        .filter(Boolean)
        .join(" ");
      return `<button type="button" class="${cls}" data-setup-goto="${i}" aria-label="Schritt ${i + 1}: ${esc(
        s.title
      )}"></button>`;
    }).join("");

    let body = "";
    if (state.loading && !state.status) {
      body = `<p class="td-setup-lead">Lade Einrichtungsstand…</p>`;
    } else if (step.id === "class" && !stepDone(step)) {
      body = `
        <p class="td-setup-lead">${esc(step.text)}</p>
        <label class="td-setup-label" for="tdSetupClassName">Klassenname</label>
        <input id="tdSetupClassName" class="td-setup-input" type="text" maxlength="80"
          placeholder="z. B. 7a" value="${esc(state.className)}" ${state.saving ? "disabled" : ""} />
        ${state.error ? `<p class="td-setup-error">${esc(state.error)}</p>` : ""}
        <div class="td-setup-actions">
          <button type="button" class="td-btn td-btn-go" data-setup-create-class ${
            state.saving ? "disabled" : ""
          }>${state.saving ? "Anlegen…" : "Klasse anlegen"}</button>
        </div>`;
    } else {
      body = `
        <p class="td-setup-lead">${esc(step.text)}</p>
        ${
          done
            ? `<p class="td-setup-ok">Bereits vorhanden – du kannst trotzdem nochmal öffnen.</p>`
            : ""
        }
        ${state.error ? `<p class="td-setup-error">${esc(state.error)}</p>` : ""}
        <div class="td-setup-actions">
          ${
            step.href
              ? `<a class="td-btn td-btn-go" href="${esc(setupHref(step.href))}">Jetzt einrichten</a>`
              : ""
          }
          <button type="button" class="td-btn td-btn-ghost" data-setup-next>
            ${done ? "Weiter" : "Überspringen"}
          </button>
        </div>`;
    }

    const isLast = state.stepIndex >= STEPS.length - 1;

    root.innerHTML = `
      <div class="td-setup-backdrop" data-setup-dismiss></div>
      <div class="td-setup-panel" role="dialog" aria-modal="true" aria-labelledby="tdSetupTitle">
        <div class="td-setup-head">
          <p class="td-kicker">Ersteinrichtung · ${idx}/${n}</p>
          <h2 id="tdSetupTitle">${esc(step.title)}</h2>
          <p class="td-setup-progress">${doneCount} von ${n} erledigt</p>
          <div class="td-setup-dots" role="tablist">${dots}</div>
        </div>
        <div class="td-setup-body">${body}</div>
        <div class="td-setup-foot">
          <button type="button" class="td-btn td-btn-ghost" data-setup-dismiss>Später</button>
          ${
            isLast
              ? `<button type="button" class="td-btn td-btn-go" data-setup-complete ${
                  state.saving ? "disabled" : ""
                }>Fertig</button>`
              : `<button type="button" class="td-btn td-btn-ghost" data-setup-next>Weiter</button>`
          }
        </div>
      </div>`;

    bind(root);
  }

  function bind(root) {
    root.querySelectorAll("[data-setup-goto]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.stepIndex = Number(btn.getAttribute("data-setup-goto")) || 0;
        state.error = "";
        render();
      });
    });
    root.querySelectorAll("[data-setup-dismiss]").forEach((el) => {
      el.addEventListener("click", () => dismiss());
    });
    root.querySelector("[data-setup-next]")?.addEventListener("click", () => {
      if (state.stepIndex < STEPS.length - 1) {
        state.stepIndex += 1;
        state.error = "";
        render();
      }
    });
    root.querySelector("[data-setup-complete]")?.addEventListener("click", () => complete());
    root.querySelector("[data-setup-create-class]")?.addEventListener("click", () => createClass());
    const input = root.querySelector("#tdSetupClassName");
    if (input) {
      input.addEventListener("input", () => {
        state.className = input.value;
      });
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          createClass();
        }
      });
      input.focus();
    }
  }

  async function refreshStatus() {
    if (!state.api) return null;
    state.loading = true;
    render();
    try {
      const classId = state.status?.classId;
      const q = classId ? `?classId=${encodeURIComponent(classId)}` : "";
      state.status = await state.api(`/api/teacher/setup-status${q}`);
      state.error = "";
      return state.status;
    } catch (err) {
      state.error = err.message || "Status konnte nicht geladen werden.";
      return null;
    } finally {
      state.loading = false;
      render();
    }
  }

  async function createClass() {
    const name = String(state.className || "").trim();
    if (!name) {
      state.error = "Bitte einen Klassennamen eingeben.";
      render();
      return;
    }
    state.saving = true;
    state.error = "";
    render();
    try {
      const res = await state.api("/api/teacher/setup/class", {
        method: "POST",
        body: JSON.stringify({ name })
      });
      if (!res.success) {
        state.error = res.message || "Klasse konnte nicht angelegt werden.";
        return;
      }
      if (typeof state.onClassCreated === "function") {
        await state.onClassCreated(res.class);
      }
      await refreshStatus();
      state.stepIndex = Math.min(state.stepIndex + 1, STEPS.length - 1);
    } catch (err) {
      state.error = err.message || "Netzwerkfehler.";
    } finally {
      state.saving = false;
      render();
    }
  }

  async function dismiss() {
    try {
      if (state.api) {
        await state.api("/api/teacher/setup/dismiss", { method: "POST", body: "{}" });
      }
    } catch (_) {}
    close();
  }

  async function complete() {
    state.saving = true;
    render();
    try {
      if (state.api) {
        await state.api("/api/teacher/setup/complete", { method: "POST", body: "{}" });
      }
      close();
      window.dispatchEvent(new CustomEvent("teacher-setup-finished"));
    } catch (err) {
      state.error = err.message || "Speichern fehlgeschlagen.";
      state.saving = false;
      render();
    }
  }

  function close() {
    state.open = false;
    state.saving = false;
    render();
  }

  async function open(opts = {}) {
    state.api = opts.api || state.api;
    state.onClassCreated = opts.onClassCreated || state.onClassCreated;
    state.open = true;
    state.error = "";
    state.saving = false;
    await refreshStatus();
    state.stepIndex = firstOpenStep();
    render();
  }

  async function maybeAutoOpen(opts = {}) {
    state.api = opts.api || state.api;
    state.onClassCreated = opts.onClassCreated || state.onClassCreated;
    const force = opts.force === true || new URLSearchParams(location.search).get("setup") === "1";
    const me = opts.me || {};
    if (me.setupDone && !force) return false;
    try {
      const status = await state.api(
        `/api/teacher/setup-status${opts.classId ? `?classId=${encodeURIComponent(opts.classId)}` : ""}`
      );
      state.status = status;
      if (status.setupDone && !force) return false;
      if (!force && status.setupDismissedAt && !status.incomplete) return false;
      if (!force && status.setupDismissedAt && status.allDone) return false;
      // Auto: öffnen wenn nicht fertig und nicht dismissed (außer force)
      if (!force && status.setupDismissedAt) return false;
      if (!force && status.allDone) {
        // Alles da → einmalig als fertig markieren, kein Overlay
        try {
          await state.api("/api/teacher/setup/complete", { method: "POST", body: "{}" });
        } catch (_) {}
        return false;
      }
      await open({ api: state.api, onClassCreated: state.onClassCreated });
      return true;
    } catch (err) {
      console.error("teacher setup:", err);
      return false;
    }
  }

  window.TeacherSetup = {
    open,
    close,
    maybeAutoOpen,
    refreshStatus,
    STEPS
  };
})();
