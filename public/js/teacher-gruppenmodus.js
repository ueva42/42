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

  const ROLE_IMPORT_FORMAT_HINT = `Format (eine Zeile = ein Ziel, Felder mit ; getrennt):

Rolle;Rollenbeschreibung;Zielart;Zieltext;Reihenfolge;Aktiv

Zielart ist immer WAS oder WIE.
Aktiv: ja oder nein.
Das Fach musst du nicht eintragen – es ist oben schon gewählt.`;

  function exampleImportText(subject) {
    const s = String(subject || "Physik");
    if (s.toLowerCase() === "sport") {
      return `Rolle;Rollenbeschreibung;Zielart;Zieltext;Reihenfolge;Aktiv
Aufbau;Bereitet Stationen vor;WAS;Ich baue die Übungsstation sicher auf.;1;ja
Aufbau;Bereitet Stationen vor;WIE;Ich prüfe den Aufbau vor dem Start.;1;ja
Coaching;Unterstützt andere beim Verbessern;WAS;Ich beobachte die Bewegung eines Gruppenmitglieds.;1;ja
Coaching;Unterstützt andere beim Verbessern;WIE;Ich gebe eine konkrete und freundliche Rückmeldung.;1;ja`;
    }
    return `Rolle;Rollenbeschreibung;Zielart;Zieltext;Reihenfolge;Aktiv
Versuch;Plant und führt Versuche sicher durch;WAS;Ich plane einen passenden Versuch.;1;ja
Versuch;Plant und führt Versuche sicher durch;WAS;Ich bereite Material und Aufbau vor.;2;ja
Versuch;Plant und führt Versuche sicher durch;WAS;Ich baue den Versuch sicher und richtig auf.;3;ja
Versuch;Plant und führt Versuche sicher durch;WIE;Ich beachte die Sicherheitsregeln.;1;ja
Versuch;Plant und führt Versuche sicher durch;WIE;Ich verändere immer nur eine Bedingung.;2;ja
Protokoll;Dokumentiert Aufbau und Beobachtungen;WAS;Ich halte den Versuchsaufbau und die Beobachtungen fest.;1;ja
Protokoll;Dokumentiert Aufbau und Beobachtungen;WIE;Ich notiere Messwerte mit den passenden Einheiten.;1;ja
Ergebnis;Erklärt Zusammenhänge;WAS;Ich erkläre den Zusammenhang mit eigenen Worten.;1;ja
Ergebnis;Erklärt Zusammenhänge;WIE;Ich nutze Fachbegriffe richtig.;1;ja`;
  }

  function downloadExampleTxt() {
    const text = exampleImportText(state.subject);
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rollen-rollenziele-${String(state.subject || "fach").toLowerCase()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

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

  function className() {
    return state.classes.find((c) => String(c.id) === String(state.classId))?.name || "Klasse";
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
    const enabled = !!state.settings?.enabled;
    const personal = state.settings?.deviceMode === "personal";
    const view = state.view === "import" ? "roles" : state.view;

    return `
      <div class="gm-head">
        <div class="gm-head__title">
          <h2>Gruppenmodus</h2>
          <p>${escapeHtml(className())} · ${escapeHtml(state.subject)}
            <span class="gm-chip ${enabled ? "is-on" : ""}">${enabled ? "eingeschaltet" : "aus"}</span>
            ${
              enabled
                ? `<span class="gm-chip">${personal ? "eigene Geräte" : "ein Tablet"}</span>`
                : ""
            }
          </p>
        </div>
        <div class="gm-head__filters">
          <label>Klasse
            <select id="gmClassSelect">${classOpts}</select>
          </label>
          <label>Fach
            <select id="gmSubjectSelect">${subjectOpts}</select>
          </label>
        </div>
      </div>
      <nav class="gm-tabs" aria-label="Gruppenmodus">
        <button type="button" class="gm-tab ${view === "overview" ? "is-on" : ""}" id="gmViewOverview">Gruppen</button>
        <button type="button" class="gm-tab ${view === "settings" ? "is-on" : ""}" id="gmViewSettings">Einrichten</button>
        <button type="button" class="gm-tab ${view === "roles" ? "is-on" : ""}" id="gmViewRoles">Rollen</button>
      </nav>`;
  }

  function flowRow({ id, checked, title, hint, extraHtml = "" }) {
    return `
      <label class="gm-flow">
        <input type="checkbox" id="${id}" ${checked ? "checked" : ""}/>
        <span class="gm-flow__text">
          <strong>${title}</strong>
          <em>${hint}</em>
        </span>
        ${extraHtml}
      </label>`;
  }

  function renderSettings() {
    const s = state.settings;
    if (!s) return `<p class="tc-hint">Einstellungen werden geladen…</p>`;

    const howText = (s.howGoalOptions || []).join("\n");
    const personal = s.deviceMode === "personal";
    const roles = s.roles || [];
    const activeRoles = roles.filter((r) => r.active !== false);

    return `
      <div class="panel gm-panel">
        <section class="gm-sec">
          <div class="gm-sec__head">
            <span class="gm-step">1</span>
            <div>
              <h3>Einschalten</h3>
              <p>Gilt nur für ${escapeHtml(className())} · ${escapeHtml(state.subject)}.</p>
            </div>
          </div>
          <label class="gm-switch-row">
            <input type="checkbox" id="gmEnabled" ${s.enabled ? "checked" : ""}/>
            <span>
              <strong>Gruppenmodus für dieses Fach nutzen</strong>
              <em>Ohne diesen Schalter sehen die Schüler das Fach im Gruppenmodus nicht.</em>
            </span>
          </label>
        </section>

        <section class="gm-sec">
          <div class="gm-sec__head">
            <span class="gm-step">2</span>
            <div>
              <h3>Wie arbeiten die Schüler?</h3>
              <p>Das ändert, ob das Tablet weitergegeben wird.</p>
            </div>
          </div>
          <div class="gm-choices">
            <label class="gm-choice ${personal ? "" : "is-on"}">
              <input type="radio" name="gmDeviceMode" value="shared" ${personal ? "" : "checked"}/>
              <strong>Ein gemeinsames Tablet</strong>
              <span>Labor ohne 1:1-Ausstattung. Die App reicht das Gerät weiter: „Gib das iPad jetzt an …“.</span>
            </label>
            <label class="gm-choice ${personal ? "is-on" : ""}">
              <input type="radio" name="gmDeviceMode" value="personal" ${personal ? "checked" : ""}/>
              <strong>Jede Person eigenes Tablet</strong>
              <span>Tabletklasse 9/10. Gruppe wählen oder beitreten, Rollen selbst übernehmen, ohne Weitergeben.</span>
            </label>
          </div>
        </section>

        <section class="gm-sec">
          <div class="gm-sec__head">
            <span class="gm-step">3</span>
            <div>
              <h3>Gruppengröße</h3>
              <p>Wie viele Personen gehören fest zusammen.</p>
            </div>
          </div>
          <div class="gm-size">
            <label class="gm-num">
              <span>Mindestens</span>
              <input type="number" id="gmMin" min="2" max="8" value="${s.minMembers}"/>
            </label>
            <span class="gm-size__sep">bis</span>
            <label class="gm-num">
              <span>Höchstens</span>
              <input type="number" id="gmMax" min="2" max="8" value="${s.maxMembers}"/>
            </label>
          </div>
          ${flowRow({
            id: "gmMultiRoles",
            checked: s.allowMultiRoles,
            title: "Mehrere Rollen pro Person",
            hint: "Wenn die Gruppe kleiner ist als die Zahl der Aufgaben."
          })}
          ${flowRow({
            id: "gmRoleSwitch",
            checked: s.allowRoleSwitch,
            title: "Rollen in der nächsten Stunde wechseln",
            hint: "Die Gruppe bleibt, die Aufgaben können rotieren."
          })}
        </section>

        <section class="gm-sec">
          <div class="gm-sec__head">
            <span class="gm-step">4</span>
            <div>
              <h3>Ablauf in der Stunde</h3>
              <p>Nur einschalten, was die Gruppe wirklich braucht.</p>
            </div>
          </div>
          <div class="gm-flow-list">
            ${flowRow({
              id: "gmShared",
              checked: s.enableSharedGoal,
              title: "Gemeinsames Vorhaben",
              hint: "Ein Ziel aus dem Levelplan für die ganze Gruppe."
            })}
            ${flowRow({
              id: "gmWhat",
              checked: s.enableWhatGoals,
              title: "Persönliche Was-Ziele",
              hint: "Was macht jede Person in ihrer Rolle?",
              extraHtml: `<label class="gm-num gm-num--inline"><span>max.</span><input type="number" id="gmMaxWhat" min="1" max="3" value="${s.maxWhatGoals || 3}"/></label>`
            })}
            ${flowRow({
              id: "gmHow",
              checked: s.enableHowGoals,
              title: "Persönliche Wie-Ziele",
              hint: "Wie soll die Arbeit gelingen?",
              extraHtml: `<label class="gm-num gm-num--inline"><span>max.</span><input type="number" id="gmMaxHow" min="1" max="3" value="${s.maxHowGoals || 3}"/></label>`
            })}
            ${flowRow({
              id: "gmMid",
              checked: s.enableMidCheck,
              title: "Zwischencheck",
              hint: "Kurzer Stopp: Bin ich noch auf Kurs?"
            })}
            ${flowRow({
              id: "gmReflect",
              checked: s.enableReflection,
              title: "Abschlussreflexion",
              hint: "Am Ende der Stunde kurz zurückblicken."
            })}
          </div>
          <details class="gm-more">
            <summary>Weitere Optionen</summary>
            ${flowRow({
              id: "gmFreeWhat",
              checked: s.allowFreeWhatGoal,
              title: "Freie Was-Ziele",
              hint: "Schüler dürfen eigene Was-Ziele schreiben (auch ohne Levelplan)."
            })}
            ${flowRow({
              id: "gmFreeHow",
              checked: s.allowFreeHowGoal,
              title: "Freie Wie-Ziele",
              hint: "Schüler dürfen eigene Wie-Ziele schreiben."
            })}
            <label class="gm-fallback">
              <span>Ersatz-Wie-Ziele, falls eine Rolle noch keine eigenen hat</span>
              <textarea id="gmHowOptions" rows="5" class="gm-textarea">${escapeHtml(howText)}</textarea>
            </label>
          </details>
        </section>

        <section class="gm-sec">
          <div class="gm-sec__head">
            <span class="gm-step">5</span>
            <div>
              <h3>Rollen</h3>
              <p>Aufgaben wie Versuch, Protokoll, Ergebnis – mit Was- und Wie-Zielen.</p>
            </div>
          </div>
          ${
            activeRoles.length
              ? `<div class="gm-role-pills">${activeRoles
                  .map(
                    (r) =>
                      `<span class="gm-pill">${escapeHtml(r.name)} · ${(r.wasGoals || []).length} Was · ${(r.howGoals || []).length} Wie</span>`
                  )
                  .join("")}</div>`
              : `<p class="gm-empty-line">Noch keine Rollen für ${escapeHtml(state.subject)}. Bitte anlegen oder importieren.</p>`
          }
          <button type="button" class="action" id="gmGotoRoles">Rollen bearbeiten</button>
        </section>

        <div class="gm-save-row">
          <button type="button" class="action" id="gmSaveSettings" ${state.saving ? "disabled" : ""}>
            ${state.saving ? "Speichern…" : "Einrichtung speichern"}
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
        <h3>Rollen für ${escapeHtml(state.subject)}</h3>
        <p class="hint">Jede Rolle braucht Was-Ziele (Aufgabe) und Wie-Ziele (Arbeitsweise). Die Schüler wählen später, wer welche Rolle übernimmt.</p>
        <div class="gm-role-toolbar">
          <button type="button" class="action" id="gmAddRole">Rolle hinzufügen</button>
          <button type="button" class="action" id="gmImportRoles">Importieren</button>
          <button type="button" class="action" id="gmCopyRoles">Aus anderem Fach kopieren</button>
          <button type="button" class="action" id="gmDownloadExample">Beispieldatei</button>
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
            ? `<div class="gm-import-format">
                 <p><strong>So muss der Text formatiert sein</strong> (Felder mit <code>;</code> getrennt, eine Zeile pro Ziel):</p>
                 <pre class="gm-pre">${escapeHtml(ROLE_IMPORT_FORMAT_HINT)}</pre>
                 <p class="hint">Du kannst den Text hier einfügen oder eine .txt-Datei laden. Das Beispiel unten kannst du anpassen.</p>
               </div>
               <div class="gm-role-toolbar">
                 <button type="button" class="action" id="gmFillExample">Beispiel einfügen</button>
                 <button type="button" class="action" id="gmDownloadExample">Als .txt speichern</button>
                 <label class="action gm-file-label">.txt laden
                   <input type="file" id="gmImportFile" accept=".txt,text/plain" hidden />
                 </label>
               </div>
               <textarea id="gmImportText" class="gm-textarea gm-textarea--import" rows="14" spellcheck="false" placeholder="Text hier einfügen…">${escapeHtml(state.importCsv || exampleImportText(state.subject))}</textarea>
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
    const enabled = !!state.settings?.enabled;
    const setupBanner = !enabled
      ? `<div class="gm-banner">
           <div>
             <strong>Noch nicht eingerichtet</strong>
             <p>Für ${escapeHtml(className())} · ${escapeHtml(state.subject)} ist der Gruppenmodus aus.</p>
           </div>
           <button type="button" class="action" id="gmGotoSetup">Jetzt einrichten</button>
         </div>`
      : "";

    if (!state.sessions.length) {
      return `
        <div class="panel gm-panel">
          ${setupBanner}
          <h3>Gruppen in dieser Stunde</h3>
          <p class="hint">Sobald Schüler eine Gruppe starten, erscheint sie hier – mit Rollen, Zielen und Fortschritt.</p>
        </div>`;
    }

    return `
      <div class="panel gm-panel">
        ${setupBanner}
        <h3>Gruppen in dieser Stunde</h3>
        <div class="gm-session-list">
          ${state.sessions
            .map((bundle) => {
              const s = bundle.session;
              const p = bundle.progress;
              const open = state.expandedId === s.id;
              const names = (bundle.members || [])
                .map((m) => m.displayName)
                .filter(Boolean)
                .join(", ");
              return `
              <article class="gm-session-card">
                <button type="button" class="gm-session-head" data-expand="${s.id}">
                  <div class="gm-session-head__row">
                    <strong>${escapeHtml(s.groupName || names || s.subject)}</strong>
                    <span class="gm-status ${statusClass(s.status)}">${escapeHtml(statusLabel(s.status))}</span>
                  </div>
                  <p>${escapeHtml(s.topicName || "Noch kein Thema")} · ${escapeHtml(s.sharedGoal || "kein Vorhaben")}</p>
                  <p class="gm-progress-line">${escapeHtml(names || "Keine Mitglieder")} · Ziele ${p.goalsDone}/${p.total} · Check ${p.midDone}/${p.total} · Abschluss ${p.reflectDone}/${p.total}</p>
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
        .gm-head{display:flex;flex-wrap:wrap;gap:16px 24px;justify-content:space-between;align-items:flex-end;margin:0 0 14px}
        .gm-head__title h2{margin:0 0 4px;font-size:1.15rem;letter-spacing:.06em;text-transform:uppercase}
        .gm-head__title p{margin:0;color:#94a3b8;display:flex;flex-wrap:wrap;gap:8px;align-items:center}
        .gm-head__filters{display:flex;flex-wrap:wrap;gap:10px}
        .gm-head__filters label{display:flex;flex-direction:column;gap:4px;font-size:.75rem;letter-spacing:.08em;text-transform:uppercase;color:#94a3b8}
        .gm-head__filters select{min-width:140px;margin:0}
        .gm-chip{display:inline-flex;align-items:center;padding:2px 8px;border-radius:999px;font-size:.7rem;letter-spacing:.06em;text-transform:uppercase;border:1px solid rgba(148,163,184,.35);color:#cbd5e1}
        .gm-chip.is-on{border-color:rgba(34,211,238,.55);color:#67e8f9;background:rgba(34,211,238,.12)}
        .gm-tabs{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 16px}
        .gm-tab{min-height:40px;padding:8px 16px;border-radius:999px;border:1px solid rgba(148,163,184,.35);background:rgba(8,24,48,.55);color:#e2e8f0;cursor:pointer;font-weight:700;letter-spacing:.04em}
        .gm-tab.is-on{border-color:rgba(34,211,238,.75);background:rgba(34,211,238,.16);color:#ecfeff;box-shadow:0 0 16px rgba(34,211,238,.18)}
        .gm-panel{color:#e5e7eb}
        .gm-panel h3{margin:0 0 4px}
        .gm-sec{margin:0 0 22px;padding:0 0 18px;border-bottom:1px solid rgba(148,163,184,.16)}
        .gm-sec:last-of-type{border-bottom:0;margin-bottom:8px}
        .gm-sec__head{display:flex;gap:12px;align-items:flex-start;margin:0 0 12px}
        .gm-sec__head p{margin:0;color:#94a3b8;font-size:.9rem}
        .gm-step{flex:0 0 28px;height:28px;border-radius:999px;display:flex;align-items:center;justify-content:center;font-size:.8rem;font-weight:800;background:rgba(34,211,238,.16);color:#67e8f9;border:1px solid rgba(34,211,238,.4)}
        .gm-switch-row,.gm-flow{display:grid;grid-template-columns:auto 1fr auto;gap:12px;align-items:center;padding:12px 14px;border-radius:14px;border:1px solid rgba(148,163,184,.22);background:rgba(8,24,48,.45);margin:0 0 8px;cursor:pointer}
        .gm-switch-row input,.gm-flow input[type="checkbox"],.gm-choice input{min-width:0;width:18px;height:18px;margin:0;accent-color:#22d3ee}
        .gm-switch-row span,.gm-flow__text{display:grid;gap:2px}
        .gm-switch-row em,.gm-flow__text em,.gm-choice span{font-style:normal;color:#94a3b8;font-size:.85rem;font-weight:400}
        .gm-choices{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
        .gm-choice{display:grid;gap:6px;padding:14px 16px;border-radius:16px;border:1px solid rgba(148,163,184,.28);background:rgba(8,24,48,.45);cursor:pointer}
        .gm-choice.is-on{border-color:rgba(34,211,238,.8);box-shadow:0 0 0 1px rgba(34,211,238,.35),0 0 18px rgba(34,211,238,.16);background:rgba(8,47,73,.5)}
        .gm-size{display:flex;flex-wrap:wrap;gap:12px;align-items:end;margin:0 0 10px}
        .gm-size__sep{color:#94a3b8;padding-bottom:10px}
        .gm-num{display:flex;flex-direction:column;gap:4px;font-size:.75rem;letter-spacing:.06em;text-transform:uppercase;color:#94a3b8}
        .gm-num input,.gm-panel input[type="number"]{min-width:0;width:72px;margin:0}
        .gm-num--inline{flex-direction:row;align-items:center;gap:6px}
        .gm-flow-list{display:grid;gap:8px}
        .gm-more{margin-top:10px;color:#cbd5e1}
        .gm-more summary{cursor:pointer;color:#67e8f9;margin-bottom:10px}
        .gm-fallback{display:grid;gap:6px;margin-top:8px;color:#94a3b8;font-size:.85rem}
        .gm-textarea{width:100%;max-width:none;min-height:120px;border-radius:14px;border:1px solid rgba(34,211,238,.28);background:rgba(2,6,23,.9);color:#f8fafc;padding:10px 12px}
        .gm-save-row,.gm-footer-row,.gm-role-toolbar{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-top:12px}
        .gm-ok{color:#4ade80}
        .gm-err{color:#fca5a5}
        .gm-banner{display:flex;flex-wrap:wrap;gap:12px;justify-content:space-between;align-items:center;padding:14px 16px;border-radius:14px;border:1px solid rgba(250,204,21,.4);background:rgba(250,204,21,.08);margin-bottom:16px}
        .gm-banner p{margin:4px 0 0;color:#cbd5e1}
        .gm-empty-line{color:#94a3b8;margin:0 0 10px}
        .gm-role-pills{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 12px}
        .gm-session-card,.gm-role-card{border:1px solid rgba(34,211,238,.2);border-radius:14px;margin-bottom:12px;overflow:hidden;background:rgba(8,24,48,.4)}
        .gm-session-head,.gm-role-card-head{display:block;width:100%;text-align:left;padding:14px 16px;background:transparent;border:0;cursor:pointer;color:inherit}
        .gm-session-head__row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
        .gm-session-head p,.gm-role-card-head p{margin:4px 0 0;color:#94a3b8}
        .gm-status,.gm-pill{display:inline-block;padding:2px 8px;border-radius:999px;font-size:.75rem;background:rgba(34,211,238,.14);color:#a5f3fc;border:1px solid rgba(34,211,238,.28)}
        .gm-pill--warn,.gm-status--warn{background:rgba(250,204,21,.16);color:#fde68a;border-color:rgba(250,204,21,.35)}
        .gm-status--ok{background:rgba(74,222,128,.16);color:#86efac;border-color:rgba(74,222,128,.35)}
        .gm-status--run{background:rgba(56,189,248,.16);color:#7dd3fc;border-color:rgba(56,189,248,.35)}
        .gm-session-body,.gm-role-card-body{padding:0 16px 14px;border-top:1px solid rgba(148,163,184,.12)}
        .gm-member-line{display:grid;grid-template-columns:1.2fr 1.5fr 24px 24px 24px;gap:8px;padding:8px 0;border-bottom:1px solid rgba(148,163,184,.1)}
        .gm-member-detail{font-size:.9rem;color:#cbd5e1;padding:0 0 8px}
        .gm-goal-cols{display:grid;grid-template-columns:1fr 1fr;gap:16px}
        .gm-goal-cols ul{list-style:none;padding:0;margin:0 0 8px}
        .gm-goal-cols li{display:flex;gap:6px;align-items:flex-start;padding:6px 0;border-bottom:1px solid rgba(148,163,184,.1)}
        .gm-goal-cols li span{flex:1}
        .gm-goal-cols li.is-off,.gm-role-card.is-off{opacity:.55}
        .gm-role-actions{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0}
        .gm-pre{white-space:pre-wrap;background:rgba(2,6,23,.7);padding:12px;border-radius:8px;font-size:.9rem;line-height:1.45;border:1px solid rgba(148,163,184,.2)}
        .gm-textarea--import{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:.9rem;min-height:280px}
        .gm-file-label{cursor:pointer;display:inline-flex;align-items:center}
        .gm-import-format{margin-bottom:12px}
        @media (max-width:800px){
          .gm-choices,.gm-member-line,.gm-goal-cols{grid-template-columns:1fr}
          .gm-flow{grid-template-columns:auto 1fr}
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
    const deviceRadio = document.querySelector('input[name="gmDeviceMode"]:checked');
    state.settings.deviceMode = deviceRadio?.value === "personal" ? "personal" : "shared";
    state.settings.minMembers = Number(document.getElementById("gmMin")?.value || 2);
    state.settings.maxMembers = Number(document.getElementById("gmMax")?.value || 4);
    state.settings.allowMultiRoles = !!document.getElementById("gmMultiRoles")?.checked;
    state.settings.allowRoleSwitch = !!document.getElementById("gmRoleSwitch")?.checked;
    state.settings.enableSharedGoal = !!document.getElementById("gmShared")?.checked;
    state.settings.enableWhatGoals = !!document.getElementById("gmWhat")?.checked;
    state.settings.maxWhatGoals = Math.min(3, Math.max(1, Number(document.getElementById("gmMaxWhat")?.value || 3)));
    state.settings.enableHowGoals = !!document.getElementById("gmHow")?.checked;
    state.settings.maxHowGoals = Math.min(3, Math.max(1, Number(document.getElementById("gmMaxHow")?.value || 3)));
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
    document.getElementById("gmGotoSetup")?.addEventListener("click", async () => {
      state.view = "settings";
      await refresh();
    });
    document.getElementById("gmSaveSettings")?.addEventListener("click", async () => {
      readSettingsFromForm();
      await saveSettings();
    });
    document.querySelectorAll('input[name="gmDeviceMode"]').forEach((el) => {
      el.addEventListener("change", () => {
        readSettingsFromForm();
        render();
      });
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
      state.importCsv = exampleImportText(state.subject);
      state.importPreview = null;
      state.importSummary = null;
      state.importMode = "add_new";
      state.error = "";
      render();
    });
    document.getElementById("gmDownloadExample")?.addEventListener("click", () => {
      downloadExampleTxt();
    });
    document.getElementById("gmFillExample")?.addEventListener("click", () => {
      state.importCsv = exampleImportText(state.subject);
      const ta = document.getElementById("gmImportText");
      if (ta) ta.value = state.importCsv;
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
      if (!String(state.importCsv || "").trim()) {
        state.error = "Bitte zuerst Text einfügen oder eine .txt-Datei laden.";
        render();
        return;
      }
      try {
        const r = await fetch("/api/teacher/group-mode/roles-import/preview", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            classId: state.classId,
            subject: state.subject,
            text: state.importCsv
          })
        });
        const data = await r.json().catch(() => ({}));
        if (!r.ok || data.success === false) {
          state.error =
            data.message ||
            data.error ||
            (r.status === 403
              ? "Keine Berechtigung – bitte neu einloggen."
              : "Vorschau fehlgeschlagen");
          render();
          return;
        }
        state.importPreview = data.preview;
        state.importStep = 3;
        state.error = "";
        render();
      } catch (err) {
        state.error = err.message || "Vorschau fehlgeschlagen";
        render();
      }
    });
    document.getElementById("gmImportRun")?.addEventListener("click", async () => {
      state.saving = true;
      render();
      try {
        const r = await fetch("/api/teacher/group-mode/roles-import/confirm", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            classId: state.classId,
            subject: state.subject,
            text: state.importCsv,
            mode: state.importMode
          })
        });
        const data = await r.json().catch(() => ({}));
        if (!r.ok || !data.success) {
          throw new Error(
            data.message ||
              data.error ||
              (r.status === 403
                ? "Keine Berechtigung – bitte neu einloggen."
                : "Import fehlgeschlagen")
          );
        }
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
      await loadSettings();
      if (state.view === "overview") await loadSessions();
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
