/**
 * Lehrkraft – Gruppenmodus: Einstellungen + Stundenübersicht.
 */
(function () {
  const FALLBACK_SUBJECTS = (window.LOGBUCH && window.LOGBUCH.SUBJECTS) || [
    "Mathe",
    "Deutsch",
    "Physik",
    "Chemie",
    "Biologie"
  ];

  const state = {
    view: "overview", // overview | settings
    classes: [],
    classId: null,
    subject: "Physik",
    date: new Date().toISOString().slice(0, 10),
    settings: null,
    sessions: [],
    expandedId: null,
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

  function root() {
    return document.getElementById("gruppenmodusTabRoot");
  }

  function statusLabel(status) {
    const map = {
      setup: "Einrichtung",
      active: "In Arbeit",
      midcheck: "Zwischencheck",
      reflecting: "Abschluss",
      closed: "Abgeschlossen"
    };
    return map[status] || status;
  }

  function statusClass(status) {
    if (status === "closed") return "gm-status--ok";
    if (status === "setup") return "gm-status--warn";
    return "gm-status--run";
  }

  async function loadClasses() {
    const r = await fetch("/api/class");
    const data = await r.json();
    state.classes = Array.isArray(data) ? data : data.classes || [];
    if (!state.classId && state.classes.length) {
      state.classId = state.classes[0].id;
    }
  }

  async function loadSettings() {
    if (!state.classId || !state.subject) return;
    const r = await fetch(
      `/api/teacher/group-mode/settings?classId=${state.classId}&subject=${encodeURIComponent(state.subject)}`
    );
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || "Einstellungen laden fehlgeschlagen");
    state.settings = data.settings;
  }

  async function loadSessions() {
    if (!state.classId) return;
    const q = new URLSearchParams({
      classId: String(state.classId),
      date: state.date,
      subject: state.subject || ""
    });
    const r = await fetch(`/api/teacher/group-sessions?${q}`);
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || "Gruppen laden fehlgeschlagen");
    state.sessions = data.sessions || [];
  }

  async function saveSettings() {
    if (!state.settings) return;
    state.saving = true;
    state.message = "";
    state.error = "";
    render();
    try {
      const r = await fetch("/api/teacher/group-mode/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          classId: state.classId,
          subject: state.subject,
          ...state.settings,
          roles: state.settings.roles
        })
      });
      const data = await r.json();
      if (!data.success) throw new Error(data.error || data.message || "Speichern fehlgeschlagen");
      state.settings = data.settings;
      state.message = "Einstellungen gespeichert.";
    } catch (err) {
      state.error = err.message || "Speichern fehlgeschlagen.";
    } finally {
      state.saving = false;
      render();
    }
  }

  async function addRole() {
    const name = prompt("Name der neuen Aufgabe/Rolle:");
    if (!name || !name.trim() || !state.settings?.id) return;
    const r = await fetch("/api/teacher/group-mode/roles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        settingsId: state.settings.id,
        name: name.trim(),
        description: ""
      })
    });
    const data = await r.json();
    if (data.role) {
      state.settings.roles = [...(state.settings.roles || []), data.role];
      render();
    }
  }

  function renderToolbar() {
    const classOpts = state.classes
      .map(
        (c) =>
          `<option value="${c.id}" ${String(c.id) === String(state.classId) ? "selected" : ""}>${escapeHtml(c.name)}</option>`
      )
      .join("");
    const subjectOpts = FALLBACK_SUBJECTS.map(
      (s) =>
        `<option value="${escapeHtml(s)}" ${s === state.subject ? "selected" : ""}>${escapeHtml(s)}</option>`
    ).join("");

    return `
      <div class="gm-toolbar">
        <label>Klasse
          <select id="gmClassSelect">${classOpts}</select>
        </label>
        <label>Fach
          <select id="gmSubjectSelect">${subjectOpts}</select>
        </label>
        <label>Datum
          <input type="date" id="gmDateInput" value="${escapeHtml(state.date)}" />
        </label>
        <div class="gm-toolbar-actions">
          <button type="button" class="action ${state.view === "overview" ? "gm-btn-active" : ""}" id="gmViewOverview">Gruppen heute</button>
          <button type="button" class="action ${state.view === "settings" ? "gm-btn-active" : ""}" id="gmViewSettings">Einstellungen</button>
        </div>
      </div>`;
  }

  function renderSettings() {
    const s = state.settings;
    if (!s) return `<p class="tc-hint">Einstellungen werden geladen…</p>`;

    const rolesHtml = (s.roles || [])
      .map(
        (role, idx) => `
      <div class="gm-role-row ${role.active ? "" : "gm-role-row--off"}" data-role-idx="${idx}">
        <input type="text" class="gm-role-name" value="${escapeHtml(role.name)}" aria-label="Rollenname" />
        <input type="text" class="gm-role-desc" value="${escapeHtml(role.description || "")}" placeholder="Kurzbeschreibung" />
        <label class="gm-check"><input type="checkbox" class="gm-role-active" ${role.active ? "checked" : ""}/> aktiv</label>
      </div>`
      )
      .join("");

    const howText = (s.howGoalOptions || []).join("\n");

    return `
      <div class="panel gm-panel">
        <h2>Gruppenmodus – ${escapeHtml(state.subject)}</h2>
        <p class="hint">Mehrere Lernende arbeiten gemeinsam an einem Gerät (z.&nbsp;B. Laborarbeit).</p>

        <label class="gm-switch">
          <input type="checkbox" id="gmEnabled" ${s.enabled ? "checked" : ""}/>
          <span>Gruppenmodus aktivieren – mehrere Lernende arbeiten gemeinsam an einem Gerät</span>
        </label>

        <div class="gm-grid">
          <label>Min. Gruppengröße <input type="number" id="gmMin" min="2" max="8" value="${s.minMembers}" /></label>
          <label>Max. Gruppengröße <input type="number" id="gmMax" min="2" max="8" value="${s.maxMembers}" /></label>
          <label class="gm-check"><input type="checkbox" id="gmMultiRoles" ${s.allowMultiRoles ? "checked" : ""}/> Mehrfachrollen erlauben</label>
          <label class="gm-check"><input type="checkbox" id="gmRoleSwitch" ${s.allowRoleSwitch ? "checked" : ""}/> Rollenwechsel zwischen Stunden</label>
          <label class="gm-check"><input type="checkbox" id="gmShared" ${s.enableSharedGoal ? "checked" : ""}/> Gemeinsames Vorhaben</label>
          <label class="gm-check"><input type="checkbox" id="gmWhat" ${s.enableWhatGoals ? "checked" : ""}/> Persönliche Was-Ziele</label>
          <label>Anzahl Was-Ziele <input type="number" id="gmMaxWhat" min="1" max="3" value="${s.maxWhatGoals}" /></label>
          <label class="gm-check"><input type="checkbox" id="gmHow" ${s.enableHowGoals ? "checked" : ""}/> Persönliche Wie-Ziele</label>
          <label class="gm-check"><input type="checkbox" id="gmMid" ${s.enableMidCheck ? "checked" : ""}/> Zwischencheck</label>
          <label class="gm-check"><input type="checkbox" id="gmReflect" ${s.enableReflection ? "checked" : ""}/> Abschlussreflexion</label>
          <label class="gm-check"><input type="checkbox" id="gmFreeWhat" ${s.allowFreeWhatGoal ? "checked" : ""}/> Freie Was-Ziele erlauben</label>
          <label class="gm-check"><input type="checkbox" id="gmFreeHow" ${s.allowFreeHowGoal ? "checked" : ""}/> Freie Wie-Ziele erlauben</label>
        </div>

        <h3>Aufgaben / Rollen</h3>
        <div class="gm-roles">${rolesHtml}</div>
        <button type="button" class="action" id="gmAddRole">Rolle hinzufügen</button>

        <h3>Vorbereitete Wie-Ziele</h3>
        <textarea id="gmHowOptions" rows="8" class="gm-textarea">${escapeHtml(howText)}</textarea>

        <div class="gm-save-row">
          <button type="button" class="action" id="gmSaveSettings" ${state.saving ? "disabled" : ""}>
            ${state.saving ? "Speichern…" : "Einstellungen speichern"}
          </button>
          ${state.message ? `<span class="gm-ok">${escapeHtml(state.message)}</span>` : ""}
          ${state.error ? `<span class="gm-err">${escapeHtml(state.error)}</span>` : ""}
        </div>
      </div>`;
  }

  function renderMemberLine(m) {
    const roles = (m.roles || []).map((r) => r.name).join(", ") || "–";
    const goalOk = m.goalsComplete ? "✓" : "○";
    const midOk = m.midCheckAt ? "✓" : "○";
    const refOk = m.reflectionAt ? "✓" : "○";
    return `
      <div class="gm-member-line">
        <strong>${escapeHtml(m.displayName)}</strong>
        <span>${escapeHtml(roles)}</span>
        <span title="Ziel">${goalOk}</span>
        <span title="Check">${midOk}</span>
        <span title="Reflexion">${refOk}</span>
      </div>
      ${
        state.expandedId === m.id || true
          ? `<div class="gm-member-detail">
              <p><em>Was:</em> ${escapeHtml(m.whatGoalText || "–")}</p>
              <p><em>Wie:</em> ${escapeHtml(m.howGoalText || "–")}</p>
              ${
                m.reflection
                  ? `<p><em>Selbsteinschätzung:</em> ${escapeHtml(m.reflection.goalReached || "–")}
                     · ${escapeHtml(m.reflection.evidence || "")}</p>`
                  : ""
              }
            </div>`
          : ""
      }`;
  }

  function renderOverview() {
    if (!state.sessions.length) {
      return `
        <div class="panel gm-panel">
          <h2>Gruppen heute</h2>
          <p class="hint">Noch keine Gruppen für ${escapeHtml(state.date)} in ${escapeHtml(state.subject)}.</p>
          <p class="hint">Schüler:innen starten den Gruppenmodus am iPad, sobald er unter Einstellungen aktiviert ist.</p>
        </div>`;
    }

    return `
      <div class="panel gm-panel">
        <h2>Gruppen heute</h2>
        <div class="gm-session-list">
          ${state.sessions
            .map((bundle) => {
              const s = bundle.session;
              const p = bundle.progress;
              const open = state.expandedId === s.id;
              return `
              <article class="gm-session-card">
                <button type="button" class="gm-session-head" data-expand="${s.id}">
                  <div>
                    <strong>${escapeHtml(s.groupName || s.subject)}</strong>
                    <span class="gm-status ${statusClass(s.status)}">${escapeHtml(statusLabel(s.status))}</span>
                  </div>
                  <p>${escapeHtml(s.topicName || "ohne Thema")} · ${escapeHtml(s.sharedGoal || "kein Vorhaben")}</p>
                  <p class="gm-progress-line">
                    Ziele ${p.goalsDone}/${p.total} · Check ${p.midDone}/${p.total} · Reflexion ${p.reflectDone}/${p.total}
                  </p>
                </button>
                ${
                  open
                    ? `<div class="gm-session-body">
                        ${(bundle.members || []).map(renderMemberLine).join("")}
                        <div class="gm-session-actions">
                          ${
                            s.status !== "closed"
                              ? `<button type="button" class="action gm-close-force" data-close="${s.id}">Stunde beenden</button>`
                              : `<button type="button" class="action gm-reopen" data-reopen="${s.id}">Wieder öffnen</button>`
                          }
                          <button type="button" class="action gm-delete-session" data-delete="${s.id}">Gruppe löschen</button>
                        </div>
                      </div>`
                    : ""
                }
              </article>`;
            })
            .join("")}
        </div>
      </div>`;
  }

  function render() {
    const el = root();
    if (!el) return;
    el.innerHTML = `
      <style>
        .gm-toolbar{display:flex;flex-wrap:wrap;gap:12px;align-items:end;margin-bottom:16px}
        .gm-toolbar label{display:flex;flex-direction:column;gap:4px;font-size:.85rem}
        .gm-toolbar-actions{display:flex;gap:8px}
        .gm-btn-active{outline:2px solid #3dd6c6}
        .gm-panel h2{margin-top:0}
        .gm-switch{display:flex;gap:10px;align-items:flex-start;margin:12px 0;font-weight:600}
        .gm-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;margin:12px 0}
        .gm-check{display:flex;gap:8px;align-items:center}
        .gm-role-row{display:grid;grid-template-columns:1fr 2fr auto;gap:8px;margin-bottom:8px}
        .gm-role-row--off{opacity:.5}
        .gm-textarea{width:100%;max-width:640px}
        .gm-save-row{display:flex;gap:12px;align-items:center;margin-top:12px}
        .gm-ok{color:#1a7f4b}
        .gm-err{color:#b00020}
        .gm-session-card{border:1px solid rgba(0,0,0,.12);border-radius:12px;margin-bottom:12px;overflow:hidden}
        .gm-session-head{display:block;width:100%;text-align:left;padding:14px 16px;background:#fff;border:0;cursor:pointer}
        .gm-session-head p{margin:4px 0 0;color:#555}
        .gm-status{display:inline-block;margin-left:8px;padding:2px 8px;border-radius:999px;font-size:.75rem}
        .gm-status--ok{background:#d8f5e5}
        .gm-status--warn{background:#fff3cd}
        .gm-status--run{background:#d7f0ff}
        .gm-session-body{padding:0 16px 14px;border-top:1px solid rgba(0,0,0,.06)}
        .gm-member-line{display:grid;grid-template-columns:1.2fr 1.5fr 24px 24px 24px;gap:8px;padding:8px 0;border-bottom:1px solid rgba(0,0,0,.05)}
        .gm-member-detail{font-size:.9rem;color:#444;padding:0 0 8px}
        .gm-session-actions{margin-top:10px}
        @media (max-width:700px){
          .gm-role-row,.gm-member-line{grid-template-columns:1fr}
        }
      </style>
      ${renderToolbar()}
      ${state.loading ? `<p class="hint">Laden…</p>` : ""}
      ${state.error && state.view === "overview" ? `<p class="gm-err">${escapeHtml(state.error)}</p>` : ""}
      ${state.view === "settings" ? renderSettings() : renderOverview()}
    `;
    bind();
  }

  function readSettingsFromForm() {
    if (!state.settings) return;
    state.settings.enabled = !!document.getElementById("gmEnabled")?.checked;
    state.settings.minMembers = Number(document.getElementById("gmMin")?.value || 2);
    state.settings.maxMembers = Number(document.getElementById("gmMax")?.value || 4);
    state.settings.allowMultiRoles = !!document.getElementById("gmMultiRoles")?.checked;
    state.settings.allowRoleSwitch = !!document.getElementById("gmRoleSwitch")?.checked;
    state.settings.enableSharedGoal = !!document.getElementById("gmShared")?.checked;
    state.settings.enableWhatGoals = !!document.getElementById("gmWhat")?.checked;
    state.settings.maxWhatGoals = Number(document.getElementById("gmMaxWhat")?.value || 1);
    state.settings.enableHowGoals = !!document.getElementById("gmHow")?.checked;
    state.settings.enableMidCheck = !!document.getElementById("gmMid")?.checked;
    state.settings.enableReflection = !!document.getElementById("gmReflect")?.checked;
    state.settings.allowFreeWhatGoal = !!document.getElementById("gmFreeWhat")?.checked;
    state.settings.allowFreeHowGoal = !!document.getElementById("gmFreeHow")?.checked;
    const howRaw = document.getElementById("gmHowOptions")?.value || "";
    state.settings.howGoalOptions = howRaw
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    document.querySelectorAll(".gm-role-row").forEach((row) => {
      const idx = Number(row.dataset.roleIdx);
      if (!state.settings.roles[idx]) return;
      state.settings.roles[idx].name = row.querySelector(".gm-role-name")?.value || "";
      state.settings.roles[idx].description = row.querySelector(".gm-role-desc")?.value || "";
      state.settings.roles[idx].active = !!row.querySelector(".gm-role-active")?.checked;
    });
  }

  function bind() {
    document.getElementById("gmClassSelect")?.addEventListener("change", async (e) => {
      state.classId = Number(e.target.value);
      await refresh();
    });
    document.getElementById("gmSubjectSelect")?.addEventListener("change", async (e) => {
      state.subject = e.target.value;
      await refresh();
    });
    document.getElementById("gmDateInput")?.addEventListener("change", async (e) => {
      state.date = e.target.value;
      await refresh();
    });
    document.getElementById("gmViewOverview")?.addEventListener("click", async () => {
      state.view = "overview";
      await refresh();
    });
    document.getElementById("gmViewSettings")?.addEventListener("click", async () => {
      state.view = "settings";
      await refresh();
    });
    document.getElementById("gmSaveSettings")?.addEventListener("click", async () => {
      readSettingsFromForm();
      await saveSettings();
    });
    document.getElementById("gmAddRole")?.addEventListener("click", addRole);
    document.querySelectorAll("[data-expand]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-expand");
        state.expandedId = state.expandedId === id ? null : id;
        render();
      });
    });
    document.querySelectorAll("[data-close]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-close");
        await fetch(`/api/teacher/group-sessions/${id}/close`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ force: true })
        });
        await refresh();
      });
    });
    document.querySelectorAll("[data-reopen]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-reopen");
        await fetch(`/api/teacher/group-sessions/${id}/reopen`, { method: "POST" });
        await refresh();
      });
    });
    document.querySelectorAll("[data-delete]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-delete");
        if (!window.confirm("Diese Gruppe wirklich löschen?")) return;
        await fetch(`/api/teacher/group-sessions/${id}/delete`, { method: "POST" });
        await refresh();
      });
    });
  }

  async function refresh() {
    state.loading = true;
    state.error = "";
    render();
    try {
      if (state.view === "settings") await loadSettings();
      else await loadSessions();
    } catch (err) {
      state.error = err.message || "Laden fehlgeschlagen.";
    } finally {
      state.loading = false;
      render();
    }
  }

  let initPromise = null;
  async function init() {
    if (initPromise) return initPromise;
    initPromise = (async () => {
      await loadClasses();
      await refresh();
    })();
    try {
      await initPromise;
    } finally {
      initPromise = null;
    }
  }

  window.TeacherGruppenmodus = { init };
})();
