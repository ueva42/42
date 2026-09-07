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
    view: "overview", // overview | settings | roles | import
    classes: [],
    classId: null,
    subject: "Physik",
    settings: null,
    sessions: [],
    expandedId: null,
    expandedRoleId: null,
    loading: false,
    saving: false,
    message: "",
    error: "",
    importStep: 1,
    importCsv: "",
    importPreview: null,
    importMode: "add_new",
    importSummary: null,
    copySourceSubject: "Physik"
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
        <div class="gm-toolbar-actions">
          <button type="button" class="action ${state.view === "overview" ? "gm-btn-active" : ""}" id="gmViewOverview">Offene Gruppen</button>
          <button type="button" class="action ${state.view === "settings" ? "gm-btn-active" : ""}" id="gmViewSettings">Einstellungen</button>
          <button type="button" class="action ${state.view === "roles" || state.view === "import" ? "gm-btn-active" : ""}" id="gmViewRoles">Rollen und Rollenziele</button>
        </div>
      </div>`;
  }

  function renderSettings() {
    const s = state.settings;
    if (!s) return `<p class="tc-hint">Einstellungen werden geladen…</p>`;

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
        <p class="hint">Rollen und persönliche Was-/Wie-Ziele verwaltest du unter „Rollen und Rollenziele“.</p>
        <ul class="gm-role-summary">
          ${(s.roles || [])
            .map(
              (r) =>
                `<li>${escapeHtml(r.name)} · ${(r.wasGoals || []).length} Was · ${(r.howGoals || []).length} Wie ${r.active ? "" : "(inaktiv)"}</li>`
            )
            .join("")}
        </ul>
        <button type="button" class="action" id="gmGotoRoles">Rollen und Rollenziele öffnen</button>

        <h3>Fallback-Wie-Ziele (wenn eine Rolle noch keine eigenen hat)</h3>
        <textarea id="gmHowOptions" rows="6" class="gm-textarea">${escapeHtml(howText)}</textarea>

        <div class="gm-save-row">
          <button type="button" class="action" id="gmSaveSettings" ${state.saving ? "disabled" : ""}>
            ${state.saving ? "Speichern…" : "Einstellungen speichern"}
          </button>
          ${state.message ? `<span class="gm-ok">${escapeHtml(state.message)}</span>` : ""}
          ${state.error ? `<span class="gm-err">${escapeHtml(state.error)}</span>` : ""}
        </div>
      </div>`;
  }

  function renderRoles() {
    const s = state.settings;
    if (!s) return `<p class="tc-hint">Rollen werden geladen…</p>`;
    const roles = s.roles || [];

    const cards = roles
      .map((role) => {
        const open = state.expandedRoleId === role.id;
        const was = role.wasGoals || [];
        const how = role.howGoals || [];
        return `
        <article class="gm-role-card ${role.active ? "" : "is-off"}">
          <button type="button" class="gm-role-card-head" data-expand-role="${role.id}">
            <div>
              <strong>${escapeHtml(role.name)}</strong>
              <span class="gm-pill">${was.length} Was · ${how.length} Wie</span>
              ${role.active ? "" : `<span class="gm-pill gm-pill--warn">inaktiv</span>`}
            </div>
            <p>${escapeHtml(role.description || "Keine Beschreibung")}</p>
          </button>
          ${
            open
              ? `<div class="gm-role-card-body">
                  <div class="gm-role-actions">
                    <button type="button" class="action" data-edit-role="${role.id}">Bearbeiten</button>
                    <button type="button" class="action" data-dup-role="${role.id}">Duplizieren</button>
                    <button type="button" class="action" data-toggle-role="${role.id}">${role.active ? "Deaktivieren" : "Aktivieren"}</button>
                    <button type="button" class="action" data-del-role="${role.id}">Löschen</button>
                  </div>
                  <div class="gm-goal-cols">
                    <div>
                      <h4>Rollen-Was-Ziele</h4>
                      <ul>${was
                        .map(
                          (g) => `
                        <li class="${g.active ? "" : "is-off"}">
                          <span>${escapeHtml(g.text)}</span>
                          <button type="button" data-edit-goal="${g.id}">✎</button>
                          <button type="button" data-del-goal="${g.id}">×</button>
                        </li>`
                        )
                        .join("")}</ul>
                      <button type="button" class="action" data-add-goal="${role.id}" data-goal-type="WAS">Was-Ziel hinzufügen</button>
                    </div>
                    <div>
                      <h4>Rollen-Wie-Ziele</h4>
                      <ul>${how
                        .map(
                          (g) => `
                        <li class="${g.active ? "" : "is-off"}">
                          <span>${escapeHtml(g.text)}</span>
                          <button type="button" data-edit-goal="${g.id}">✎</button>
                          <button type="button" data-del-goal="${g.id}">×</button>
                        </li>`
                        )
                        .join("")}</ul>
                      <button type="button" class="action" data-add-goal="${role.id}" data-goal-type="WIE">Wie-Ziel hinzufügen</button>
                    </div>
                  </div>
                </div>`
              : ""
          }
        </article>`;
      })
      .join("");

    return `
      <div class="panel gm-panel">
        <h2>Rollen und Rollenziele – ${escapeHtml(state.subject)}</h2>
        <p class="hint">Fachbezogen und importierbar. Persönliche Was-/Wie-Ziele gehören zur Rolle, das gemeinsame Ziel kommt aus dem Levelplan.</p>
        <div class="gm-role-toolbar">
          <button type="button" class="action" id="gmAddRole">Rolle hinzufügen</button>
          <button type="button" class="action" id="gmImportRoles">Rollen und Rollenziele importieren</button>
          <button type="button" class="action" id="gmCopyRoles">Vorlage aus anderem Fach übernehmen</button>
          <a class="action" href="/api/teacher/group-mode/role-goals/sample.csv">Beispieldatei</a>
        </div>
        ${state.message ? `<p class="gm-ok">${escapeHtml(state.message)}</p>` : ""}
        ${state.error ? `<p class="gm-err">${escapeHtml(state.error)}</p>` : ""}
        <div class="gm-role-cards">${cards || `<p class="hint">Noch keine Rollen – importieren oder hinzufügen.</p>`}</div>
      </div>`;
  }

  function renderImport() {
    const p = state.importPreview;
    const step = state.importStep;
    return `
      <div class="panel gm-panel">
        <h2>Rollen importieren – ${escapeHtml(state.subject)}</h2>
        <p class="hint">Schritt ${step} von 5</p>
        ${
          step === 1
            ? `<p>Für welches Fach möchtest du Rollen importieren?</p>
               <p><strong>${escapeHtml(state.subject)}</strong> (aktuell gewählt)</p>
               <button type="button" class="action" id="gmImportNext">Weiter</button>`
            : ""
        }
        ${
          step === 2
            ? `<p>Datei auswählen (CSV)</p>
               <input type="file" id="gmImportFile" accept=".csv,text/csv,text/plain" />
               <textarea id="gmImportText" class="gm-textarea" rows="10" placeholder="Oder CSV hier einfügen…">${escapeHtml(state.importCsv)}</textarea>
               <div class="gm-footer-row">
                 <button type="button" class="action" id="gmImportBack">Zurück</button>
                 <button type="button" class="action" id="gmImportPreviewBtn">Import prüfen</button>
               </div>`
            : ""
        }
        ${
          step === 3 && p
            ? `<div class="gm-import-preview">
                 <p><strong>${(p.roles || []).length}</strong> Rollen · <strong>${p.wasCount}</strong> Was · <strong>${p.howCount}</strong> Wie · <strong>${p.duplicateCount}</strong> mögliche Duplikate · <strong>${(p.errors || []).length}</strong> Hinweise</p>
                 <ul>${(p.roles || [])
                   .map(
                     (r) =>
                       `<li>${escapeHtml(r.name)} (${r.was} Was / ${r.how} Wie)${r.exists ? " – Rolle existiert bereits" : " – neu"}</li>`
                   )
                   .join("")}</ul>
                 ${(p.errors || []).length
                   ? `<div class="gm-err"><p>Korrekturen nötig:</p><ul>${p.errors
                       .slice(0, 20)
                       .map((e) => `<li>Zeile ${e.line}: ${escapeHtml(e.message)}</li>`)
                       .join("")}</ul></div>`
                   : ""}
               </div>
               <div class="gm-footer-row">
                 <button type="button" class="action" id="gmImportBack">Zurück</button>
                 <button type="button" class="action" id="gmImportNext">Weiter</button>
               </div>`
            : ""
        }
        ${
          step === 4
            ? `<p>Umgang mit vorhandenen Rollen</p>
               <label class="gm-check"><input type="radio" name="gmImportMode" value="add_new" ${state.importMode === "add_new" ? "checked" : ""}/> Nur neue Rollen und Ziele hinzufügen (sicher)</label>
               <label class="gm-check"><input type="radio" name="gmImportMode" value="merge" ${state.importMode === "merge" ? "checked" : ""}/> Vorhandene Rollen ergänzen</label>
               <label class="gm-check"><input type="radio" name="gmImportMode" value="update" ${state.importMode === "update" ? "checked" : ""}/> Vorhandene Einträge aktualisieren</label>
               <div class="gm-footer-row">
                 <button type="button" class="action" id="gmImportBack">Zurück</button>
                 <button type="button" class="action" id="gmImportNext">Weiter</button>
               </div>`
            : ""
        }
        ${
          step === 5
            ? state.importSummary
              ? `<div class="gm-ok">
                   <p>Import fertig.</p>
                   <ul>
                     <li>Rollen neu: ${state.importSummary.rolesImported}</li>
                     <li>Was-Ziele: ${state.importSummary.wasImported}</li>
                     <li>Wie-Ziele: ${state.importSummary.howImported}</li>
                     <li>übersprungene Duplikate: ${state.importSummary.skippedDuplicates}</li>
                     <li>fehlerhafte Zeilen: ${state.importSummary.errorCount}</li>
                   </ul>
                 </div>
                 <button type="button" class="action" id="gmImportDone">Zurück zu den Rollen</button>`
              : `<p>Bereit zum Importieren.</p>
                 <div class="gm-footer-row">
                   <button type="button" class="action" id="gmImportBack">Zurück</button>
                   <button type="button" class="action" id="gmImportRun" ${state.saving ? "disabled" : ""}>Importieren</button>
                 </div>`
            : ""
        }
        ${state.error ? `<p class="gm-err">${escapeHtml(state.error)}</p>` : ""}
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
          <h2>Offene Gruppen</h2>
          <p class="hint">Noch keine offenen Gruppen für ${escapeHtml(state.subject)}.</p>
          <p class="hint">Gruppen sind themengebunden (Levelplan) und bleiben bestehen, bis sie abgeschlossen oder gelöscht werden.</p>
        </div>`;
    }

    return `
      <div class="panel gm-panel">
        <h2>Offene Gruppen</h2>
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
    const main =
      state.view === "settings"
        ? renderSettings()
        : state.view === "roles"
          ? renderRoles()
          : state.view === "import"
            ? renderImport()
            : renderOverview();
    el.innerHTML = `
      <style>
        .gm-toolbar{display:flex;flex-wrap:wrap;gap:12px;align-items:end;margin-bottom:16px}
        .gm-toolbar label{display:flex;flex-direction:column;gap:4px;font-size:.85rem}
        .gm-toolbar-actions{display:flex;gap:8px;flex-wrap:wrap}
        .gm-btn-active{outline:2px solid #3dd6c6}
        .gm-panel h2{margin-top:0}
        .gm-switch{display:flex;gap:10px;align-items:flex-start;margin:12px 0;font-weight:600}
        .gm-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;margin:12px 0}
        .gm-check{display:flex;gap:8px;align-items:center;margin:6px 0}
        .gm-textarea{width:100%;max-width:720px}
        .gm-save-row,.gm-footer-row,.gm-role-toolbar{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-top:12px}
        .gm-ok{color:#1a7f4b}
        .gm-err{color:#b00020}
        .gm-session-card,.gm-role-card{border:1px solid rgba(0,0,0,.12);border-radius:12px;margin-bottom:12px;overflow:hidden}
        .gm-session-head,.gm-role-card-head{display:block;width:100%;text-align:left;padding:14px 16px;background:#fff;border:0;cursor:pointer}
        .gm-session-head p,.gm-role-card-head p{margin:4px 0 0;color:#555}
        .gm-status,.gm-pill{display:inline-block;margin-left:8px;padding:2px 8px;border-radius:999px;font-size:.75rem;background:#e8f7f5}
        .gm-pill--warn,.gm-status--warn{background:#fff3cd}
        .gm-status--ok{background:#d8f5e5}
        .gm-status--run{background:#d7f0ff}
        .gm-session-body,.gm-role-card-body{padding:0 16px 14px;border-top:1px solid rgba(0,0,0,.06)}
        .gm-member-line{display:grid;grid-template-columns:1.2fr 1.5fr 24px 24px 24px;gap:8px;padding:8px 0;border-bottom:1px solid rgba(0,0,0,.05)}
        .gm-member-detail{font-size:.9rem;color:#444;padding:0 0 8px}
        .gm-goal-cols{display:grid;grid-template-columns:1fr 1fr;gap:16px}
        .gm-goal-cols ul{list-style:none;padding:0;margin:0 0 8px}
        .gm-goal-cols li{display:flex;gap:6px;align-items:flex-start;padding:6px 0;border-bottom:1px solid rgba(0,0,0,.06)}
        .gm-goal-cols li span{flex:1}
        .gm-goal-cols li.is-off,.gm-role-card.is-off{opacity:.55}
        .gm-role-actions{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0}
        .gm-role-summary{margin:8px 0 12px;padding-left:18px}
        @media (max-width:700px){
          .gm-member-line,.gm-goal-cols{grid-template-columns:1fr}
        }
      </style>
      ${renderToolbar()}
      ${state.loading ? `<p class="hint">Laden…</p>` : ""}
      ${state.error && state.view === "overview" ? `<p class="gm-err">${escapeHtml(state.error)}</p>` : ""}
      ${main}
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
    document.getElementById("gmViewOverview")?.addEventListener("click", async () => {
      state.view = "overview";
      await refresh();
    });
    document.getElementById("gmViewSettings")?.addEventListener("click", async () => {
      state.view = "settings";
      await refresh();
    });
    document.getElementById("gmViewRoles")?.addEventListener("click", async () => {
      state.view = "roles";
      state.message = "";
      state.error = "";
      await refresh();
    });
    document.getElementById("gmGotoRoles")?.addEventListener("click", async () => {
      state.view = "roles";
      await refresh();
    });
    document.getElementById("gmSaveSettings")?.addEventListener("click", async () => {
      readSettingsFromForm();
      await saveSettings();
    });
    document.getElementById("gmAddRole")?.addEventListener("click", addRole);

    document.querySelectorAll("[data-expand-role]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-expand-role");
        state.expandedRoleId = state.expandedRoleId === id ? null : id;
        render();
      });
    });
    document.querySelectorAll("[data-edit-role]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-edit-role");
        const role = (state.settings?.roles || []).find((r) => String(r.id) === String(id));
        if (!role) return;
        const name = prompt("Rollenname", role.name);
        if (name == null) return;
        const description = prompt("Kurzbeschreibung", role.description || "");
        if (description == null) return;
        const r = await fetch(`/api/teacher/group-mode/roles/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: name.trim(), description: description.trim() })
        });
        const data = await r.json();
        if (!r.ok) {
          state.error = data.error || "Speichern fehlgeschlagen";
          render();
          return;
        }
        await loadSettings();
        render();
      });
    });
    document.querySelectorAll("[data-dup-role]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-dup-role");
        await fetch(`/api/teacher/group-mode/roles/${id}/duplicate`, { method: "POST" });
        await loadSettings();
        render();
      });
    });
    document.querySelectorAll("[data-toggle-role]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-toggle-role");
        const role = (state.settings?.roles || []).find((r) => String(r.id) === String(id));
        if (!role) return;
        await fetch(`/api/teacher/group-mode/roles/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ active: !role.active })
        });
        await loadSettings();
        render();
      });
    });
    document.querySelectorAll("[data-del-role]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-del-role");
        if (!confirm("Rolle löschen? Bereits verwendete Rollen werden nur deaktiviert.")) return;
        const r = await fetch(`/api/teacher/group-mode/roles/${id}`, { method: "DELETE" });
        const data = await r.json();
        state.message = data.message || (data.deleted ? "Rolle gelöscht." : "Rolle deaktiviert.");
        await loadSettings();
        render();
      });
    });
    document.querySelectorAll("[data-add-goal]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const roleId = btn.getAttribute("data-add-goal");
        const type = btn.getAttribute("data-goal-type");
        const text = prompt(type === "WIE" ? "Neues Wie-Ziel" : "Neues Was-Ziel");
        if (!text || !text.trim()) return;
        await fetch("/api/teacher/group-mode/role-goals", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roleId, type, text: text.trim() })
        });
        await loadSettings();
        render();
      });
    });
    document.querySelectorAll("[data-edit-goal]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-edit-goal");
        let goal = null;
        for (const role of state.settings?.roles || []) {
          goal = [...(role.wasGoals || []), ...(role.howGoals || [])].find(
            (g) => String(g.id) === String(id)
          );
          if (goal) break;
        }
        if (!goal) return;
        const text = prompt("Zieltext", goal.text);
        if (text == null) return;
        await fetch(`/api/teacher/group-mode/role-goals/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: text.trim() })
        });
        await loadSettings();
        render();
      });
    });
    document.querySelectorAll("[data-del-goal]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-del-goal");
        if (!confirm("Ziel löschen? Bereits verwendete Ziele werden nur deaktiviert.")) return;
        await fetch(`/api/teacher/group-mode/role-goals/${id}`, { method: "DELETE" });
        await loadSettings();
        render();
      });
    });

    document.getElementById("gmImportRoles")?.addEventListener("click", () => {
      state.view = "import";
      state.importStep = 1;
      state.importCsv = "";
      state.importPreview = null;
      state.importSummary = null;
      state.importMode = "add_new";
      state.error = "";
      render();
    });
    document.getElementById("gmCopyRoles")?.addEventListener("click", async () => {
      const source = prompt(
        "Aus welchem Fach kopieren?",
        FALLBACK_SUBJECTS.find((s) => s !== state.subject) || "Sport"
      );
      if (!source || source === state.subject) return;
      if (!confirm(`Rollen aus „${source}“ nach „${state.subject}“ kopieren?`)) return;
      const r = await fetch("/api/teacher/group-mode/roles/copy-from-subject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          classId: state.classId,
          sourceSubject: source,
          targetSubject: state.subject
        })
      });
      const data = await r.json();
      if (!r.ok || !data.success) {
        state.error = data.error || "Kopieren fehlgeschlagen";
      } else {
        state.settings = data.settings;
        state.message = `${data.summary.rolesCopied} Rollen, ${data.summary.goalsCopied} Ziele kopiert.`;
      }
      render();
    });

    document.getElementById("gmImportNext")?.addEventListener("click", () => {
      if (state.importStep === 4) {
        const mode = document.querySelector('input[name="gmImportMode"]:checked')?.value;
        if (mode) state.importMode = mode;
      }
      state.importStep = Math.min(5, state.importStep + 1);
      render();
    });
    document.getElementById("gmImportBack")?.addEventListener("click", () => {
      state.importStep = Math.max(1, state.importStep - 1);
      render();
    });
    document.getElementById("gmImportFile")?.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      state.importCsv = await file.text();
      const ta = document.getElementById("gmImportText");
      if (ta) ta.value = state.importCsv;
    });
    document.getElementById("gmImportText")?.addEventListener("input", (e) => {
      state.importCsv = e.target.value;
    });
    document.getElementById("gmImportPreviewBtn")?.addEventListener("click", async () => {
      state.importCsv = document.getElementById("gmImportText")?.value || state.importCsv;
      const r = await fetch("/api/teacher/group-mode/role-goals/import/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          classId: state.classId,
          subject: state.subject,
          csvText: state.importCsv
        })
      });
      const data = await r.json();
      if (!r.ok) {
        state.error = data.error || "Vorschau fehlgeschlagen";
        render();
        return;
      }
      state.importPreview = data.preview;
      state.importStep = 3;
      state.error = "";
      render();
    });
    document.getElementById("gmImportRun")?.addEventListener("click", async () => {
      state.saving = true;
      render();
      try {
        const r = await fetch("/api/teacher/group-mode/role-goals/import/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            classId: state.classId,
            subject: state.subject,
            csvText: state.importCsv,
            mode: state.importMode
          })
        });
        const data = await r.json();
        if (!r.ok || !data.success) throw new Error(data.error || "Import fehlgeschlagen");
        state.importSummary = data.summary;
        state.settings = data.settings;
      } catch (err) {
        state.error = err.message;
      } finally {
        state.saving = false;
        render();
      }
    });
    document.getElementById("gmImportDone")?.addEventListener("click", async () => {
      state.view = "roles";
      await refresh();
    });

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
      if (state.view === "overview") await loadSessions();
      else await loadSettings();
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
