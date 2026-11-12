/**
 * Lehrkraft – App-Module der Schüler-App pro Klasse freischalten.
 */
(function () {
  const GROUPS = [
    {
      id: "lernen",
      title: "Lernen",
      text: "Fortschritt und Ziele",
      modules: [
        { id: "levelplan", label: "Lernstand" },
        { id: "zielsetzung", label: "Zielsetzung" },
        { id: "ueben", label: "Üben zu Hause" },
        { id: "checkpointPlan", label: "Meine Checks" }
      ]
    },
    {
      id: "alltag",
      title: "Alltag",
      text: "Organisation im Schulalltag",
      modules: [
        { id: "week", label: "Meine Woche" },
        { id: "hausaufgaben", label: "Hausaufgaben" },
        { id: "materialschrank", label: "Materialschrank" },
        { id: "gruppenmodus", label: "Gruppenarbeit" },
        { id: "taktikDeck", label: "Taktik-Deck" }
      ]
    },
    {
      id: "spiel",
      title: "Spiel & Profil",
      text: "XP, Missionen und Charakter",
      modules: [
        { id: "missionen", label: "Missionen" },
        { id: "belohnungen", label: "Belohnungen" },
        { id: "charakter", label: "Charakter" },
        { id: "xp", label: "XP-Historie" }
      ]
    }
  ];

  const MODULES = GROUPS.flatMap((g) => g.modules);

  const state = {
    classes: [],
    classId: null,
    modules: null,
    dirty: false,
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

  function currentModules() {
    return state.modules || normalizeModules(selectedClass()?.featureModules);
  }

  function renderRow(m, on) {
    return `
      <label class="tam-row ${on ? "is-on" : ""}">
        <span class="tam-row__label">${escapeHtml(m.label)}</span>
        <span class="tam-switch">
          <input type="checkbox" data-app-module="${escapeHtml(m.id)}" ${on ? "checked" : ""} ${
            state.saving ? "disabled" : ""
          }>
          <span class="tam-switch__ui" aria-hidden="true"></span>
        </span>
      </label>`;
  }

  function render() {
    const root = document.getElementById("appModulesTabRoot");
    if (!root) return;

    if (state.loading && !state.classes.length) {
      root.innerHTML = `<div class="tam"><p class="tam-muted">Lade Klassen…</p></div>`;
      return;
    }

    if (!state.classes.length) {
      root.innerHTML = `
        <div class="tam">
          <header class="tam-head">
            <p class="td-kicker">Schüler-App</p>
            <h2>App-Module</h2>
            <p class="tam-lead">Bitte zuerst eine Klasse anlegen oder zuweisen.</p>
          </header>
          ${state.error ? `<p class="tam-err">${escapeHtml(state.error)}</p>` : ""}
        </div>`;
      return;
    }

    const cls = selectedClass();
    const modules = currentModules();
    const enabledCount = MODULES.filter((m) => modules[m.id]).length;
    const classOptions = state.classes
      .map(
        (c) =>
          `<option value="${c.id}" ${sameId(c.id, state.classId) ? "selected" : ""}>${escapeHtml(
            c.name
          )}</option>`
      )
      .join("");

    const groupsHtml = GROUPS.map((g) => {
      const onCount = g.modules.filter((m) => modules[m.id]).length;
      return `
        <section class="tam-group">
          <div class="tam-group__head">
            <div>
              <h3>${escapeHtml(g.title)}</h3>
              <p>${escapeHtml(g.text)}</p>
            </div>
            <span class="tam-group__count">${onCount}/${g.modules.length}</span>
          </div>
          <div class="tam-list">
            ${g.modules.map((m) => renderRow(m, !!modules[m.id])).join("")}
          </div>
        </section>`;
    }).join("");

    root.innerHTML = `
      <div class="tam">
        <header class="tam-head">
          <p class="td-kicker">Schüler-App</p>
          <h2>App-Module</h2>
          <p class="tam-lead">Was ${
            cls ? `<strong>${escapeHtml(cls.name)}</strong>` : "die Klasse"
          } in der App sieht. Mein Tag bleibt immer an.</p>
        </header>

        <div class="tam-bar">
          <label class="tam-class">
            <span>Klasse</span>
            <select id="tamClassSelect">${classOptions}</select>
          </label>
          <div class="tam-bar__meta">
            <span>${enabledCount} von ${MODULES.length} an</span>
            <button type="button" class="tam-link" id="tamAllOn" ${state.saving ? "disabled" : ""}>Alles an</button>
            <button type="button" class="tam-link" id="tamAllOff" ${state.saving ? "disabled" : ""}>Alles aus</button>
          </div>
          <button type="button" class="tam-save" id="tamSave" ${
            state.saving || !state.classId ? "disabled" : ""
          }>${state.saving ? "Speichern…" : state.dirty ? "Speichern" : "Gespeichert"}</button>
        </div>

        ${state.error ? `<p class="tam-err">${escapeHtml(state.error)}</p>` : ""}
        ${state.message ? `<p class="tam-ok">${escapeHtml(state.message)}</p>` : ""}

        <div class="tam-core">
          <span class="tam-row__label">Mein Tag</span>
          <span class="tam-core__badge">immer an</span>
        </div>

        ${groupsHtml}
      </div>
      <style>
        .tam{max-width:720px;display:grid;gap:18px;padding:4px 0 28px}
        .tam-head h2{margin:4px 0 0;font-family:Orbitron,system-ui,sans-serif;font-size:1.35rem;letter-spacing:.04em;color:#f8fafc}
        .tam-lead{margin:8px 0 0;color:#94a3b8;line-height:1.45;font-size:.95rem}
        .tam-lead strong{color:#e2e8f0;font-weight:700}
        .tam-muted{color:#94a3b8}
        .tam-err{margin:0;color:#fca5a5}
        .tam-ok{margin:0;color:#6ee7b7}
        .tam-bar{display:flex;flex-wrap:wrap;gap:12px;align-items:end;padding:14px;border-radius:16px;border:1px solid rgba(34,211,238,.28);background:rgba(8,15,32,.72)}
        .tam-class{display:grid;gap:6px;min-width:160px}
        .tam-class span{font-size:.72rem;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#67e8f9}
        .tam-class select{min-height:44px;border-radius:12px;border:1px solid rgba(148,163,184,.35);background:rgba(15,23,42,.9);color:#f8fafc;padding:0 12px;font:inherit}
        .tam-bar__meta{display:flex;flex-wrap:wrap;gap:10px;align-items:center;color:#94a3b8;font-size:.9rem;flex:1}
        .tam-link{border:0;background:transparent;color:#67e8f9;font:inherit;font-weight:700;cursor:pointer;padding:0}
        .tam-link:hover{color:#a5f3fc}
        .tam-link:disabled{opacity:.45;cursor:default}
        .tam-save{min-height:44px;padding:0 18px;border-radius:999px;border:1px solid rgba(103,232,249,.45);background:linear-gradient(90deg,#22d3ee,#8b5cf6);color:#041018;font:inherit;font-weight:800;cursor:pointer}
        .tam-save:disabled{opacity:.55;cursor:default}
        .tam-core{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:14px 16px;border-radius:14px;border:1px dashed rgba(148,163,184,.35);background:rgba(15,23,42,.35);color:#cbd5e1}
        .tam-core__badge{font-size:.75rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#94a3b8}
        .tam-group{display:grid;gap:10px}
        .tam-group__head{display:flex;justify-content:space-between;align-items:end;gap:12px}
        .tam-group__head h3{margin:0;font-size:1rem;color:#f8fafc}
        .tam-group__head p{margin:2px 0 0;color:#64748b;font-size:.85rem}
        .tam-group__count{color:#67e8f9;font-size:.8rem;font-weight:700}
        .tam-list{display:grid;gap:8px}
        .tam-row{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:14px 16px;border-radius:14px;border:1px solid rgba(148,163,184,.22);background:rgba(15,23,42,.55);cursor:pointer;transition:border-color .12s ease,background .12s ease}
        .tam-row.is-on{border-color:rgba(34,211,238,.45);background:rgba(8,47,73,.38)}
        .tam-row__label{color:#f1f5f9;font-weight:700;font-size:.98rem}
        .tam-switch{position:relative;display:inline-flex;width:48px;height:28px;flex:0 0 auto}
        .tam-switch input{position:absolute;inset:0;opacity:0;margin:0;cursor:pointer}
        .tam-switch__ui{pointer-events:none;position:absolute;inset:0;border-radius:999px;background:rgba(71,85,105,.9);transition:background .15s ease}
        .tam-switch__ui::after{content:"";position:absolute;top:3px;left:3px;width:22px;height:22px;border-radius:50%;background:#f8fafc;transition:transform .15s ease}
        .tam-switch input:checked + .tam-switch__ui{background:linear-gradient(90deg,#22d3ee,#8b5cf6)}
        .tam-switch input:checked + .tam-switch__ui::after{transform:translateX(20px)}
        @media (max-width:640px){
          .tam-bar{align-items:stretch}
          .tam-save{width:100%}
        }
      </style>`;

    bind(root);
  }

  function syncModulesFromDom(root) {
    const next = normalizeModules({});
    MODULES.forEach((m) => {
      next[m.id] = false;
    });
    root.querySelectorAll("[data-app-module]").forEach((el) => {
      next[el.dataset.appModule] = !!el.checked;
    });
    state.modules = next;
    state.dirty = true;
  }

  function bind(root) {
    root.querySelector("#tamClassSelect")?.addEventListener("change", (e) => {
      state.classId = Number(e.target.value) || null;
      state.message = "";
      state.error = "";
      state.dirty = false;
      state.modules = normalizeModules(selectedClass()?.featureModules);
      render();
    });

    root.querySelectorAll("[data-app-module]").forEach((el) => {
      el.addEventListener("change", () => {
        syncModulesFromDom(root);
        state.message = "";
        render();
      });
    });

    root.querySelector("#tamAllOn")?.addEventListener("click", () => {
      const next = {};
      MODULES.forEach((m) => {
        next[m.id] = true;
      });
      state.modules = next;
      state.dirty = true;
      state.message = "";
      render();
    });

    root.querySelector("#tamAllOff")?.addEventListener("click", () => {
      const next = {};
      MODULES.forEach((m) => {
        next[m.id] = false;
      });
      state.modules = next;
      state.dirty = true;
      state.message = "";
      render();
    });

    root.querySelector("#tamSave")?.addEventListener("click", () => save(root));
  }

  async function save(root) {
    if (!state.classId || state.saving) return;
    syncModulesFromDom(root);
    const featureModules = state.modules;
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
      state.dirty = false;
      state.message = "Gespeichert. Schüler:innen sehen es nach dem nächsten Laden.";
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
      state.modules = normalizeModules(selectedClass()?.featureModules);
      state.dirty = false;
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
    state.dirty = false;
    await loadClasses();
  }

  window.TeacherAppModules = { init };
})();
