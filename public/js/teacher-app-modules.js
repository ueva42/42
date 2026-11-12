/**
 * Lehrkraft – App-Module der Schüler-App pro Klasse freischalten.
 */
(function () {
  const MODULES = [
    { id: "week", label: "Meine Woche", hint: "Wochenübersicht" },
    { id: "ueben", label: "Üben zu Hause", hint: "Freies Üben" },
    { id: "levelplan", label: "Lernstand", hint: "Levelplan / Fortschritt" },
    { id: "zielsetzung", label: "Zielsetzung", hint: "Ziele setzen" },
    { id: "hausaufgaben", label: "Hausaufgaben", hint: "HA-Liste" },
    { id: "checkpointPlan", label: "Meine Checks", hint: "Termine & Checks" },
    { id: "materialschrank", label: "Materialschrank", hint: "Links & Material" },
    { id: "gruppenmodus", label: "Gruppenarbeit", hint: "Gruppenmodus" },
    { id: "taktikDeck", label: "Taktik-Deck", hint: "Strategiekarten" },
    { id: "missionen", label: "Missionen", hint: "XP-Missionen" },
    { id: "belohnungen", label: "Belohnungen", hint: "Einlösen" },
    { id: "charakter", label: "Charakter", hint: "Charakterseite" },
    { id: "xp", label: "XP-Historie", hint: "XP-Verlauf" }
  ];

  const state = {
    classes: [],
    classId: null,
    modules: null,
    loading: false,
    saving: false,
    message: "",
    error: ""
  };

  function escapeHtml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function sameId(a, b) {
    return String(a) === String(b);
  }

  function normalizeModules(raw) {
    const src = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
    const out = {};
    MODULES.forEach((m) => {
      out[m.id] = src[m.id] !== false && src[m.id] !== 0 && src[m.id] !== "false";
    });
    return out;
  }

  function selectedClass() {
    return state.classes.find((c) => sameId(c.id, state.classId)) || null;
  }

  function render() {
    const root = document.getElementById("appModulesTabRoot");
    if (!root) return;

    if (!state.classes.length && !state.loading) {
      root.innerHTML = `
        <div class="panel">
          <h2>App-Module</h2>
          <p class="hint">Bitte zuerst eine Klasse anlegen oder zuweisen.</p>
          ${state.error ? `<p class="msg-error">${escapeHtml(state.error)}</p>` : ""}
        </div>`;
      return;
    }

    const cls = selectedClass();
    const modules = state.modules || normalizeModules(cls?.featureModules);
    const enabledCount = MODULES.filter((m) => modules[m.id]).length;
    const classOptions = state.classes
      .map(
        (c) =>
          `<option value="${c.id}" ${sameId(c.id, state.classId) ? "selected" : ""}>${escapeHtml(
            c.name
          )}</option>`
      )
      .join("");

    const checks = MODULES.map(
      (m) => `
      <label class="tam-check">
        <input type="checkbox" data-app-module="${escapeHtml(m.id)}" ${
          modules[m.id] ? "checked" : ""
        } ${state.saving ? "disabled" : ""}>
        <span class="tam-check__copy">
          <strong>${escapeHtml(m.label)}</strong>
          <em>${escapeHtml(m.hint)}</em>
        </span>
      </label>`
    ).join("");

    root.innerHTML = `
      <div class="panel">
        <h2>App-Module</h2>
        <p class="hint">
          Entscheide pro Klasse, welche Bereiche in der Schüler-App sichtbar sind.
          <strong>Mein Tag</strong> (Planen, Check, Reflect) bleibt immer erreichbar.
        </p>
        <label class="lpi-label" for="tamClassSelect">Klasse
          <select id="tamClassSelect">${classOptions}</select>
        </label>
        <p class="hint" style="margin-top:8px">${enabledCount} von ${MODULES.length} Modulen aktiv${
          cls ? ` · ${escapeHtml(cls.name)}` : ""
        }</p>
        ${state.error ? `<p class="msg-error">${escapeHtml(state.error)}</p>` : ""}
        ${state.message ? `<p class="msg-ok">${escapeHtml(state.message)}</p>` : ""}
      </div>
      <div class="panel">
        <div class="tam-toolbar">
          <button type="button" class="action" id="tamAllOn" ${state.saving ? "disabled" : ""}>Alle an</button>
          <button type="button" class="action" id="tamAllOff" ${state.saving ? "disabled" : ""}>Alle aus</button>
          <button type="button" class="action" id="tamSave" ${state.saving || !state.classId ? "disabled" : ""}>
            ${state.saving ? "Speichern…" : "Module speichern"}
          </button>
        </div>
        <div class="tam-grid">${checks}</div>
      </div>
      <style>
        .tam-toolbar{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px}
        .tam-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px}
        .tam-check{display:flex;gap:10px;align-items:flex-start;padding:12px;border-radius:12px;border:1px solid rgba(148,163,184,.28);background:rgba(15,23,42,.45);cursor:pointer}
        .tam-check input{margin-top:3px;width:18px;height:18px;flex:0 0 auto}
        .tam-check__copy{display:grid;gap:2px;min-width:0}
        .tam-check__copy strong{color:#f8fafc;font-size:.95rem}
        .tam-check__copy em{font-style:normal;color:#94a3b8;font-size:.8rem}
        .tam-check:has(input:checked){border-color:rgba(34,211,238,.55);background:rgba(8,47,73,.4)}
      </style>`;

    bind(root);
  }

  function readChecks(root) {
    const out = {};
    MODULES.forEach((m) => {
      out[m.id] = false;
    });
    root.querySelectorAll("[data-app-module]").forEach((el) => {
      out[el.dataset.appModule] = !!el.checked;
    });
    return out;
  }

  function bind(root) {
    root.querySelector("#tamClassSelect")?.addEventListener("change", (e) => {
      state.classId = Number(e.target.value) || null;
      state.message = "";
      state.error = "";
      const cls = selectedClass();
      state.modules = normalizeModules(cls?.featureModules);
      render();
    });

    root.querySelector("#tamAllOn")?.addEventListener("click", () => {
      root.querySelectorAll("[data-app-module]").forEach((el) => {
        el.checked = true;
      });
    });

    root.querySelector("#tamAllOff")?.addEventListener("click", () => {
      root.querySelectorAll("[data-app-module]").forEach((el) => {
        el.checked = false;
      });
    });

    root.querySelector("#tamSave")?.addEventListener("click", () => save(root));
  }

  async function save(root) {
    if (!state.classId || state.saving) return;
    const featureModules = readChecks(root);
    state.saving = true;
    state.message = "";
    state.error = "";
    render();
    try {
      const res = await fetch(
        `/api/teacher/classes/${encodeURIComponent(state.classId)}/feature-modules`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ featureModules })
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.success === false) {
        state.error = data.message || data.error || "Speichern fehlgeschlagen.";
        return;
      }
      state.modules = normalizeModules(data.featureModules);
      state.classes = state.classes.map((c) =>
        sameId(c.id, state.classId) ? { ...c, featureModules: state.modules } : c
      );
      state.message = "App-Module gespeichert. Schüler:innen sehen die Änderung nach dem nächsten Laden.";
    } catch (err) {
      console.error(err);
      state.error = "Netzwerkfehler.";
    } finally {
      state.saving = false;
      render();
    }
  }

  async function loadClasses() {
    state.loading = true;
    state.error = "";
    render();
    try {
      const res = await fetch("/api/class", { credentials: "same-origin" });
      const data = await res.json();
      if (!res.ok) {
        state.classes = [];
        state.error = data.message || data.error || "Klassen konnten nicht geladen werden.";
        return;
      }
      state.classes = Array.isArray(data) ? data : [];
      if (!state.classId || !state.classes.some((c) => sameId(c.id, state.classId))) {
        state.classId = state.classes[0]?.id || null;
      }
      const cls = selectedClass();
      state.modules = normalizeModules(cls?.featureModules);
    } catch (err) {
      console.error(err);
      state.classes = [];
      state.error = "Netzwerkfehler.";
    } finally {
      state.loading = false;
      render();
    }
  }

  async function init() {
    state.message = "";
    state.error = "";
    await loadClasses();
  }

  window.TeacherAppModules = { init };
})();
