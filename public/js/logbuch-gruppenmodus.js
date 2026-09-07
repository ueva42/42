/**
 * Schüler – Gruppenmodus (Ein-Gerät-Assistent für Laborarbeit).
 */
(function () {
  const LS_KEY = "sol-group-mode-draft";

  const state = {
    bootstrap: null,
    sessionId: null,
    bundle: null,
    screen: "home", // home | pick-subject | pick-topic | members | roles | shared | handoff | what | how | confirm | overview | work | mid-handoff | mid | reflect-handoff | reflect | done
    selectedMembers: [],
    roleAssignments: {}, // roleId -> userId
    sharedGoal: "",
    currentMemberIdx: 0,
    draftGoal: {
      whatGoalId: null,
      whatGoalText: "",
      selectedLevel: null,
      howGoalText: "",
      customHow: false
    },
    midDraft: {},
    reflectDraft: {},
    saveState: "idle", // idle | saving | saved | error
    message: "",
    error: "",
    loading: false
  };

  function esc(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function root() {
    return document.getElementById("gruppenmodus-screen-root");
  }

  function settings() {
    return state.bundle?.settings || {};
  }

  function members() {
    return state.bundle?.members || [];
  }

  function currentMember() {
    return members()[state.currentMemberIdx] || null;
  }

  function topicGoals() {
    const topicId = state.bundle?.session?.topicId;
    const topics = state.bundle?.topics || [];
    const topic = topics.find((t) => String(t.id) === String(topicId)) || topics[0];
    return topic?.goals || [];
  }

  function persistLocal() {
    try {
      localStorage.setItem(
        LS_KEY,
        JSON.stringify({
          sessionId: state.sessionId,
          screen: state.screen,
          currentMemberIdx: state.currentMemberIdx,
          selectedMembers: state.selectedMembers,
          roleAssignments: state.roleAssignments,
          sharedGoal: state.sharedGoal,
          draftGoal: state.draftGoal,
          midDraft: state.midDraft,
          reflectDraft: state.reflectDraft
        })
      );
    } catch (_) {}
  }

  function restoreLocal() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function setSave(s) {
    state.saveState = s;
    const el = document.getElementById("gmSaveBadge");
    if (!el) return;
    el.textContent =
      s === "saving"
        ? "Wird gespeichert …"
        : s === "saved"
          ? "Gespeichert"
          : s === "error"
            ? "Noch nicht synchronisiert"
            : "";
    el.className = `gm-save-badge gm-save-badge--${s}`;
  }

  async function api(url, options = {}) {
    setSave("saving");
    try {
      const r = await fetch(url, {
        headers: { "Content-Type": "application/json", ...(options.headers || {}) },
        ...options
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        setSave("error");
        throw new Error(data.message || data.error || "Das hat nicht geklappt.");
      }
      if (data.success === false) {
        setSave("error");
        throw new Error(data.message || "Das hat nicht geklappt.");
      }
      setSave("saved");
      return data;
    } catch (err) {
      setSave("error");
      throw err;
    }
  }

  function applyBundle(data) {
    if (data.session) {
      state.bundle = data;
      state.sessionId = data.session.id;
      state.sharedGoal = data.session.sharedGoal || state.sharedGoal;
      if (Array.isArray(data.members) && data.members.length) {
        state.selectedMembers = data.members.map((m) => Number(m.userId));
      }
      if (data.members?.length && Object.keys(state.roleAssignments).length === 0) {
        for (const m of data.members) {
          for (const role of m.roles || []) {
            if (role.roleId) state.roleAssignments[role.roleId] = Number(m.userId);
          }
        }
      }
    }
    persistLocal();
  }

  function sessionStatusLabel(session) {
    if (!session) return "";
    if (session.sharedGoal) return session.sharedGoal;
    const step = session.setupStep;
    if (session.status === "setup") {
      if (step === "members") return "Mitglieder wählen";
      if (step === "roles") return "Rollen verteilen";
      if (step === "shared_goal") return "Gemeinsames Vorhaben";
      if (step === "personal_goals") return "Persönliche Ziele";
      if (step === "overview") return "Bereit zum Start";
      return "Wird eingerichtet";
    }
    if (session.status === "active") return "In Arbeit";
    if (session.status === "midcheck") return "Zwischencheck";
    if (session.status === "reflecting") return "Abschluss";
    if (session.status === "closed") return "Fertig";
    return session.status || "";
  }

  function shell(stepLabel, title, body, footer) {
    return `
      <div class="gm-app">
        <div class="gm-top">
          <button type="button" class="gm-back" id="gmBackBtn" aria-label="Zurück">←</button>
          <div class="gm-top-main">
            ${stepLabel ? `<p class="gm-step">${esc(stepLabel)}</p>` : ""}
            <h2 class="gm-title">${esc(title)}</h2>
          </div>
          <span id="gmSaveBadge" class="gm-save-badge gm-save-badge--${state.saveState}"></span>
        </div>
        ${state.error ? `<div class="gm-banner gm-banner--err">${esc(state.error)}</div>` : ""}
        ${state.message ? `<div class="gm-banner gm-banner--ok">${esc(state.message)}</div>` : ""}
        <div class="gm-body">${body}</div>
        <div class="gm-footer">${footer || ""}</div>
      </div>`;
  }

  function cardGrid(items, selectedId, dataAttr) {
    return `<div class="gm-cards">${items
      .map((item) => {
        const selected = String(item.id) === String(selectedId) || item.selected;
        return `
        <button type="button" class="gm-card ${selected ? "is-selected" : ""} ${item.disabled ? "is-disabled" : ""}"
          data-${dataAttr}="${esc(item.id)}" ${item.disabled ? "disabled" : ""}>
          <span class="gm-card-title">${esc(item.title)}</span>
          ${item.sub ? `<span class="gm-card-sub">${esc(item.sub)}</span>` : ""}
          ${item.badge ? `<span class="gm-card-badge">${esc(item.badge)}</span>` : ""}
        </button>`;
      })
      .join("")}</div>`;
  }

  function renderHome() {
    const enabled = state.bootstrap?.enabledSubjects || [];
    const active = state.bootstrap?.activeSessions || [];
    const body = `
      <p class="gm-lead">Ihr arbeitet zu zweit, zu dritt oder zu viert an einem iPad – themengebunden am Levelplan. Eine angelegte Gruppe bleibt bestehen, bis ihr sie abschließt oder löscht.</p>
      ${
        active.length
          ? `<h3 class="gm-h3">Weiterarbeiten</h3>
             <div class="gm-cards">
               ${active
                 .map(
                   (s) => `
                 <div class="gm-card-wrap">
                   <button type="button" class="gm-card" data-resume="${esc(s.id)}">
                     <span class="gm-card-title">${esc(s.subject)}${s.topicName ? `: ${esc(s.topicName)}` : ""}</span>
                     <span class="gm-card-sub">${esc(sessionStatusLabel(s))}</span>
                   </button>
                   <button type="button" class="gm-delete" data-delete="${esc(s.id)}" aria-label="Gruppe löschen">Löschen</button>
                 </div>`
                 )
                 .join("")}
             </div>`
          : ""
      }
      ${
        enabled.length
          ? `<h3 class="gm-h3">Neue Laborarbeit starten</h3>
             ${cardGrid(
               enabled.map((s) => ({
                 id: s.subject,
                 title: s.subject,
                 sub: `${s.minMembers}–${s.maxMembers} Personen`
               })),
               null,
               "subject"
             )}`
          : `<div class="gm-empty">Eure Lehrkraft hat den Gruppenmodus noch nicht freigeschaltet.</div>`
      }`;
    return shell(null, "Gruppenarbeit", body, "");
  }

  function renderPickTopic() {
    const topics = state.bundle?.topics || [];
    const body =
      topics.length === 0
        ? `<div class="gm-empty">Für dieses Fach gibt es noch kein Kompetenzraster.
             ${
               settings().allowFreeWhatGoal
                 ? "Ihr könnt trotzdem starten und freie Ziele nutzen."
                 : "Bitte fragt eure Lehrkraft oder wählt ein anderes Fach."
             }</div>`
        : cardGrid(
            topics.map((t) => ({
              id: t.id,
              title: t.name,
              sub: `${(t.goals || []).length} Kompetenzen`,
              disabled: !(t.goals || []).length && !settings().allowFreeWhatGoal
            })),
            state.bundle?.session?.topicId,
            "topic"
          );

    const footer =
      topics.length === 0 && settings().allowFreeWhatGoal
        ? `<button type="button" class="gm-primary" id="gmSkipTopic">Ohne Raster weiter</button>`
        : `<button type="button" class="gm-primary" id="gmTopicNext" ${
            state.bundle?.session?.topicId ? "" : "disabled"
          }>Weiter</button>`;

    return shell("Schritt 1 von 5", "Welches Thema bearbeitet ihr?", body, footer);
  }

  function renderMembers() {
    const classmates = state.bundle?.classmates || state.bootstrap?.classmates || [];
    const min = settings().minMembers || 2;
    const max = settings().maxMembers || 4;
    const body = `
      <p class="gm-lead">Tippt auf alle, die heute zusammenarbeiten. (${state.selectedMembers.length} gewählt, ${min}–${max})</p>
      <div class="gm-cards">
        ${classmates
          .map((c) => {
            const selected = state.selectedMembers.some((id) => Number(id) === Number(c.id));
            const busy = c.busyInOtherGroup;
            return `
            <button type="button" class="gm-card ${selected ? "is-selected" : ""} ${busy ? "is-disabled" : ""}"
              data-member="${c.id}" ${busy ? "disabled" : ""}>
              <span class="gm-card-title">${esc(c.displayName)}</span>
              ${busy ? `<span class="gm-card-badge">schon in Gruppe</span>` : ""}
            </button>`;
          })
          .join("")}
      </div>`;
    const ok = state.selectedMembers.length >= min && state.selectedMembers.length <= max;
    return shell(
      "Schritt 2 von 5",
      "Wer arbeitet heute zusammen?",
      body,
      `<button type="button" class="gm-primary" id="gmMembersNext" ${ok ? "" : "disabled"}>Weiter</button>`
    );
  }

  function renderRoles() {
    const roles = (settings().roles || []).filter((r) => r.active);
    const mems = members();
    const body = `
      <p class="gm-lead">Tippt zuerst auf eine Aufgabe, dann auf die Person.</p>
      <div class="gm-role-board">
        ${roles
          .map((role) => {
            const uid = state.roleAssignments[role.id];
            const person = mems.find((m) => String(m.userId) === String(uid));
            return `
            <button type="button" class="gm-role-card ${state._pickedRole === role.id ? "is-picked" : ""}" data-pick-role="${esc(role.id)}">
              <strong>${esc(role.name)}</strong>
              <span>${esc(role.description || "")}</span>
              <em>${person ? esc(person.displayName) : "noch frei"}</em>
            </button>`;
          })
          .join("")}
      </div>
      <div class="gm-people-row">
        ${mems
          .map(
            (m) => `
          <button type="button" class="gm-chip" data-assign-user="${m.userId}">${esc(m.displayName)}</button>`
          )
          .join("")}
      </div>
      <button type="button" class="gm-ghost" id="gmSuggestRoles">Vorschlag übernehmen</button>`;
    return shell(
      "Schritt 3 von 5",
      "Wer übernimmt welche Aufgabe?",
      body,
      `<button type="button" class="gm-primary" id="gmRolesNext">Rollen bestätigen</button>`
    );
  }

  function renderShared() {
    const suggestions = [
      state.bundle?.session?.topicName
        ? `Wir untersuchen ${state.bundle.session.topicName}.`
        : null,
      "Wir führen den Versuch durch und halten unsere Beobachtungen fest.",
      "Wir bauen, testen und verbessern unser Produkt."
    ].filter(Boolean);

    const body = `
      <p class="gm-lead">Woran arbeitet ihr heute gemeinsam?</p>
      <div class="gm-cards">
        ${suggestions
          .map(
            (s) => `
          <button type="button" class="gm-card ${state.sharedGoal === s ? "is-selected" : ""}" data-shared="${esc(s)}">
            <span class="gm-card-title">${esc(s)}</span>
          </button>`
          )
          .join("")}
      </div>
      <label class="gm-label">Oder kurz selbst schreiben
        <textarea id="gmSharedInput" class="gm-textarea" maxlength="400" rows="3">${esc(state.sharedGoal)}</textarea>
      </label>`;
    return shell(
      "Schritt 4 von 5",
      "Woran arbeitet ihr heute gemeinsam?",
      body,
      `<button type="button" class="gm-primary" id="gmSharedNext">Vorhaben übernehmen</button>`
    );
  }

  function renderHandoff(kind) {
    const m = currentMember();
    if (!m) return shell(null, "Fertig", `<p>Alle sind durch.</p>`, "");
    const body = `
      <div class="gm-handoff">
        <p class="gm-handoff-text">Gib das iPad jetzt an <strong>${esc(m.displayName)}</strong>.</p>
        <p class="gm-muted">Die anderen schauen bitte nicht mit.</p>
      </div>`;
    return shell(
      null,
      `Jetzt ist ${m.displayName} dran`,
      body,
      `<button type="button" class="gm-primary" id="gmHandoffGo" data-kind="${esc(kind)}">Ich bin ${esc(m.displayName)} – weiter</button>`
    );
  }

  function renderWhat() {
    const m = currentMember();
    const goals = topicGoals();
    const roles = (m?.roles || []).map((r) => r.name).join(", ");
    const body = `
      <p class="gm-lead">${esc(m.displayName)}, das ist heute deine Aufgabe: <strong>${esc(roles || "–")}</strong></p>
      <p class="gm-h3">Was möchtest du heute können?</p>
      ${
        goals.length
          ? cardGrid(
              goals.map((g) => ({
                id: g.id,
                title: g.text,
                selected: String(state.draftGoal.whatGoalId) === String(g.id)
              })),
              state.draftGoal.whatGoalId,
              "what"
            )
          : settings().allowFreeWhatGoal
            ? `<textarea id="gmFreeWhat" class="gm-textarea" rows="3" placeholder="Dein Was-Ziel…">${esc(state.draftGoal.whatGoalText)}</textarea>`
            : `<div class="gm-empty">Kein Kompetenzraster vorhanden.</div>`
      }
      ${
        state.draftGoal.whatGoalId
          ? `<p class="gm-h3">Stufe (optional)</p>
             <div class="gm-chips">
               ${(state.bundle?.levelOptions || [])
                 .map(
                   (o) => `
                 <button type="button" class="gm-chip ${state.draftGoal.selectedLevel === o.value ? "is-selected" : ""}" data-level="${esc(o.value)}">${esc(o.label)}</button>`
                 )
                 .join("")}
             </div>`
          : ""
      }`;
    return shell(
      null,
      "Was möchtest du heute können?",
      body,
      `<button type="button" class="gm-primary" id="gmWhatNext">Weiter zum Wie-Ziel</button>`
    );
  }

  function renderHow() {
    const options = settings().howGoalOptions || [];
    const body = `
      <p class="gm-lead">Wie möchtest du daran arbeiten?</p>
      ${cardGrid(
        options.map((t) => ({
          id: t,
          title: t,
          selected: !state.draftGoal.customHow && state.draftGoal.howGoalText === t
        })),
        state.draftGoal.customHow ? null : state.draftGoal.howGoalText,
        "how"
      )}
      ${
        settings().allowFreeHowGoal
          ? `<button type="button" class="gm-ghost ${state.draftGoal.customHow ? "is-selected" : ""}" id="gmCustomHow">Eigenes Wie-Ziel schreiben</button>
             ${
               state.draftGoal.customHow
                 ? `<textarea id="gmHowInput" class="gm-textarea" rows="3">${esc(state.draftGoal.howGoalText)}</textarea>`
                 : ""
             }`
          : ""
      }`;
    return shell(
      null,
      "Wie möchtest du daran arbeiten?",
      body,
      `<button type="button" class="gm-primary" id="gmHowNext">Weiter</button>`
    );
  }

  function renderConfirm() {
    const m = currentMember();
    const roles = (m?.roles || []).map((r) => r.name).join(", ");
    const body = `
      <div class="gm-summary">
        <h3>Das hast du dir vorgenommen</h3>
        <p><span>Meine Rolle</span><strong>${esc(roles || "–")}</strong></p>
        <p><span>Mein Was-Ziel</span><strong>${esc(state.draftGoal.whatGoalText || "–")}</strong></p>
        <p><span>Mein Wie-Ziel</span><strong>${esc(state.draftGoal.howGoalText || "–")}</strong></p>
      </div>`;
    return shell(
      null,
      "Passt alles?",
      body,
      `<div class="gm-footer-row">
        <button type="button" class="gm-ghost" id="gmConfirmEdit">Ändern</button>
        <button type="button" class="gm-primary" id="gmConfirmOk">Passt so</button>
      </div>`
    );
  }

  function renderOverview() {
    const body = `
      <p class="gm-lead">${esc(state.bundle?.session?.sharedGoal || "")}</p>
      <div class="gm-cards">
        ${members()
          .map((m) => {
            const roles = (m.roles || []).map((r) => r.name).join(", ");
            return `
            <div class="gm-card gm-card--static ${m.goalsComplete ? "is-selected" : ""}">
              <span class="gm-card-title">${esc(m.displayName)} ${m.goalsComplete ? "✓" : "…"}</span>
              <span class="gm-card-sub">${esc(roles)}</span>
            </div>`;
          })
          .join("")}
      </div>`;
    const ready = state.bundle?.progress?.goalsComplete;
    return shell(
      "Schritt 5 von 5",
      "Ihr könnt starten!",
      body,
      `<button type="button" class="gm-primary" id="gmStartWork" ${ready ? "" : "disabled"}>Laborarbeit starten</button>`
    );
  }

  function renderWork() {
    const p = state.bundle?.progress || {};
    const body = `
      <div class="gm-work-hero">
        <p class="gm-muted">${esc(state.bundle?.session?.subject)} · ${esc(state.bundle?.session?.topicName || "")}</p>
        <h3>${esc(state.bundle?.session?.sharedGoal || "Gemeinsame Arbeit")}</h3>
      </div>
      <div class="gm-status-list">
        ${members()
          .map((m) => {
            const roles = (m.roles || []).map((r) => r.name).join(", ");
            return `<div class="gm-status-row">
              <strong>${esc(m.displayName)}</strong>
              <span>${esc(roles)}</span>
              <span>${m.goalsComplete ? "Ziel ✓" : "Ziel …"} · ${m.midCheckAt ? "Check ✓" : "Check …"} · ${m.reflectionAt ? "Ende ✓" : "Ende …"}</span>
            </div>`;
          })
          .join("")}
      </div>
      <h3 class="gm-h3">Ergebnis festhalten</h3>
      <textarea id="gmDocInput" class="gm-textarea" rows="3" placeholder="Kurze Beobachtung oder Ergebnis…"></textarea>
      <button type="button" class="gm-ghost" id="gmDocSave">Speichern</button>
      <div class="gm-docs">
        ${(state.bundle?.docs || [])
          .map((d) => `<p class="gm-doc">${esc(d.content)}</p>`)
          .join("")}
      </div>`;
    return shell(
      `Fortschritt Ziele ${p.goalsDone}/${p.total}`,
      "Laborarbeit",
      body,
      `<div class="gm-footer-row gm-footer-row--stack">
        ${settings().enableMidCheck ? `<button type="button" class="gm-primary" id="gmStartMid">Zwischencheck starten</button>` : ""}
        ${settings().enableReflection ? `<button type="button" class="gm-primary" id="gmStartReflect">Abschlussrunde starten</button>` : ""}
      </div>`
    );
  }

  function renderMid() {
    const m = currentMember();
    const body = `
      <p class="gm-lead">Dein Was-Ziel: <strong>${esc(m?.whatGoalText || "–")}</strong></p>
      <p class="gm-h3">Bist du auf dem richtigen Weg?</p>
      <div class="gm-choice">${["Ja", "Noch unsicher", "Nein"]
        .map(
          (v) =>
            `<button type="button" class="gm-choice-btn ${state.midDraft.onTrack === v ? "is-selected" : ""}" data-mid="onTrack" data-val="${esc(v)}">${esc(v)}</button>`
        )
        .join("")}</div>
      <p class="gm-h3">Kommst du gut voran?</p>
      <div class="gm-choice">${["Ja", "Teilweise", "Nein"]
        .map(
          (v) =>
            `<button type="button" class="gm-choice-btn ${state.midDraft.progress === v ? "is-selected" : ""}" data-mid="progress" data-val="${esc(v)}">${esc(v)}</button>`
        )
        .join("")}</div>
      <p class="gm-h3">Musst du etwas ändern?</p>
      <div class="gm-choice">${["Nein", "Vielleicht", "Ja"]
        .map(
          (v) =>
            `<button type="button" class="gm-choice-btn ${state.midDraft.changeNeeded === v ? "is-selected" : ""}" data-mid="changeNeeded" data-val="${esc(v)}">${esc(v)}</button>`
        )
        .join("")}</div>
      ${
        state.midDraft.changeNeeded === "Vielleicht" || state.midDraft.changeNeeded === "Ja"
          ? `<p class="gm-h3">Was möchtest du ändern?</p>
             <div class="gm-chips">${["Vorgehen", "Versuch", "Erklärung", "Zusammenarbeit", "Zeitplanung", "anderes"]
               .map(
                 (v) =>
                   `<button type="button" class="gm-chip ${state.midDraft.changeFocus === v ? "is-selected" : ""}" data-mid="changeFocus" data-val="${esc(v)}">${esc(v)}</button>`
               )
               .join("")}</div>`
          : ""
      }`;
    return shell(
      null,
      "Zeit für euren kurzen Check",
      body,
      `<button type="button" class="gm-primary" id="gmMidSave">Weiter</button>`
    );
  }

  function renderReflect() {
    const m = currentMember();
    const body = `
      <p class="gm-lead">Was: <strong>${esc(m?.whatGoalText || "–")}</strong><br/>Wie: <strong>${esc(m?.howGoalText || "–")}</strong></p>
      <p class="gm-h3">Wie weit hast du dein Was-Ziel heute erreicht?</p>
      <div class="gm-choice">${["Erreicht", "Teilweise erreicht", "Noch nicht erreicht"]
        .map(
          (v) =>
            `<button type="button" class="gm-choice-btn ${state.reflectDraft.goalReached === v ? "is-selected" : ""}" data-ref="goalReached" data-val="${esc(v)}">${esc(v)}</button>`
        )
        .join("")}</div>
      <p class="gm-h3">Woran erkennst du das?</p>
      <div class="gm-cards">${[
        "Ich konnte es erklären.",
        "Ich konnte es selbst durchführen.",
        "Ich habe ein richtiges Ergebnis erhalten.",
        "Ich konnte meine Beobachtung begründen.",
        "Ich brauche noch Hilfe.",
        "Ich bin noch unsicher."
      ]
        .map(
          (v) =>
            `<button type="button" class="gm-card ${state.reflectDraft.evidence === v ? "is-selected" : ""}" data-ref="evidence" data-val="${esc(v)}"><span class="gm-card-title">${esc(v)}</span></button>`
        )
        .join("")}</div>
      <p class="gm-h3">Was hat dir heute geholfen?</p>
      <div class="gm-chips">${[
        "der Versuch",
        "die Skizze",
        "die Messwerte",
        "meine Gruppe",
        "eine Erklärung",
        "die Recherche",
        "das Ausprobieren",
        "etwas anderes"
      ]
        .map(
          (v) =>
            `<button type="button" class="gm-chip ${state.reflectDraft.helped === v ? "is-selected" : ""}" data-ref="helped" data-val="${esc(v)}">${esc(v)}</button>`
        )
        .join("")}</div>
      <p class="gm-h3">Was möchtest du beim nächsten Mal besser machen?</p>
      <textarea id="gmNextImprove" class="gm-textarea" rows="2">${esc(state.reflectDraft.nextImprove || "")}</textarea>
      <p class="gm-h3">Möchtest du beim nächsten Mal an diesem Ziel weiterarbeiten?</p>
      <div class="gm-choice">${["Ja", "Vielleicht", "Nein"]
        .map(
          (v) =>
            `<button type="button" class="gm-choice-btn ${state.reflectDraft.continueNextSession === v ? "is-selected" : ""}" data-ref="continueNextSession" data-val="${esc(v)}">${esc(v)}</button>`
        )
        .join("")}</div>
      <p class="gm-h3">Das habe ich meiner Gruppe erklärt</p>
      <textarea id="gmExplained" class="gm-textarea" rows="2">${esc(state.reflectDraft.explainedToGroup || "")}</textarea>
      <p class="gm-h3">Darüber haben mich die anderen informiert</p>
      <textarea id="gmLearned" class="gm-textarea" rows="2">${esc(state.reflectDraft.learnedFromGroup || "")}</textarea>`;
    return shell(
      null,
      "Wie ist es heute gelaufen?",
      body,
      `<button type="button" class="gm-primary" id="gmReflectSave">Fertig – weitergeben</button>`
    );
  }

  function renderDone() {
    const body = `
      <div class="gm-handoff">
        <p class="gm-handoff-text">Eure Laborarbeit ist für heute abgeschlossen.</p>
      </div>
      <div class="gm-cards">
        ${members()
          .map((m) => {
            const roles = (m.roles || []).map((r) => r.name).join(", ");
            return `
            <div class="gm-card gm-card--static is-selected">
              <span class="gm-card-title">${esc(m.displayName)} ✓</span>
              <span class="gm-card-sub">${esc(roles)}</span>
            </div>`;
          })
          .join("")}
      </div>`;
    return shell(
      null,
      "Geschafft!",
      body,
      `<button type="button" class="gm-primary" id="gmBackHome">Zur Übersicht</button>`
    );
  }

  function render() {
    const el = root();
    if (!el) return;
    let html = "";
    switch (state.screen) {
      case "home":
        html = renderHome();
        break;
      case "pick-topic":
        html = renderPickTopic();
        break;
      case "members":
        html = renderMembers();
        break;
      case "roles":
        html = renderRoles();
        break;
      case "shared":
        html = renderShared();
        break;
      case "handoff":
        html = renderHandoff("goals");
        break;
      case "what":
        html = renderWhat();
        break;
      case "how":
        html = renderHow();
        break;
      case "confirm":
        html = renderConfirm();
        break;
      case "overview":
        html = renderOverview();
        break;
      case "work":
        html = renderWork();
        break;
      case "mid-handoff":
        html = renderHandoff("mid");
        break;
      case "mid":
        html = renderMid();
        break;
      case "reflect-handoff":
        html = renderHandoff("reflect");
        break;
      case "reflect":
        html = renderReflect();
        break;
      case "done":
        html = renderDone();
        break;
      default:
        html = renderHome();
    }
    el.innerHTML = styles() + html;
    bind();
    persistLocal();
  }

  function styles() {
    return `<style>
      .gm-app{max-width:820px;margin:0 auto;padding:8px 4px 96px;font-size:1.05rem}
      .gm-top{display:flex;align-items:flex-start;gap:10px;margin-bottom:12px}
      .gm-back{min-width:48px;min-height:48px;border-radius:14px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.06);color:inherit;font-size:1.2rem}
      .gm-title{margin:0;font-size:1.45rem;line-height:1.25}
      .gm-step,.gm-muted{margin:0;opacity:.7;font-size:.9rem}
      .gm-lead{margin:0 0 14px;line-height:1.4}
      .gm-h3{margin:16px 0 8px;font-size:1.05rem}
      .gm-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}
      .gm-card-wrap{display:flex;flex-direction:column;gap:6px}
      .gm-card{text-align:left;min-height:88px;padding:16px;border-radius:18px;border:2px solid rgba(255,255,255,.14);background:rgba(255,255,255,.06);color:inherit;cursor:pointer;display:flex;flex-direction:column;gap:6px}
      .gm-card--static{cursor:default}
      .gm-card.is-selected,.gm-choice-btn.is-selected,.gm-chip.is-selected,.gm-role-card.is-picked{border-color:#3dd6c6;box-shadow:0 0 0 2px rgba(61,214,198,.35)}
      .gm-card.is-disabled{opacity:.45;cursor:not-allowed}
      .gm-card-title{font-weight:700;font-size:1.05rem}
      .gm-card-sub{opacity:.75;font-size:.92rem}
      .gm-card-badge{font-size:.8rem;opacity:.8}
      .gm-delete{min-height:40px;border-radius:12px;border:1px solid rgba(255,120,120,.35);background:rgba(180,40,40,.18);color:inherit;font-size:.9rem;cursor:pointer}
      .gm-primary,.gm-ghost{min-height:52px;padding:12px 18px;border-radius:16px;font-size:1.05rem;font-weight:700;border:0;cursor:pointer}
      .gm-primary{background:#3dd6c6;color:#082028;width:100%}
      .gm-primary:disabled{opacity:.4;cursor:not-allowed}
      .gm-ghost{background:transparent;border:2px solid rgba(255,255,255,.2);color:inherit}
      .gm-footer{position:sticky;bottom:0;padding:12px 0;background:linear-gradient(transparent, rgba(8,16,24,.92) 30%);backdrop-filter:blur(6px)}
      .gm-footer-row{display:flex;gap:10px}
      .gm-footer-row .gm-primary,.gm-footer-row .gm-ghost{flex:1}
      .gm-footer-row--stack{flex-direction:column}
      .gm-textarea{width:100%;border-radius:14px;border:2px solid rgba(255,255,255,.16);background:rgba(0,0,0,.25);color:inherit;padding:12px;font-size:1rem}
      .gm-banner{padding:10px 12px;border-radius:12px;margin-bottom:10px}
      .gm-banner--err{background:rgba(220,60,60,.2)}
      .gm-banner--ok{background:rgba(40,180,100,.2)}
      .gm-save-badge{font-size:.75rem;opacity:.75;white-space:nowrap}
      .gm-handoff{min-height:220px;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;gap:8px}
      .gm-handoff-text{font-size:1.5rem;margin:0}
      .gm-role-board{display:grid;gap:10px;margin-bottom:12px}
      .gm-role-card{text-align:left;padding:14px;border-radius:16px;border:2px solid rgba(255,255,255,.14);background:rgba(255,255,255,.05);color:inherit;display:grid;gap:4px}
      .gm-people-row,.gm-chips{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0}
      .gm-chip{min-height:44px;padding:10px 14px;border-radius:999px;border:2px solid rgba(255,255,255,.16);background:rgba(255,255,255,.05);color:inherit}
      .gm-choice{display:grid;grid-template-columns:1fr;gap:10px;margin-bottom:12px}
      .gm-choice-btn{min-height:56px;border-radius:16px;border:2px solid rgba(255,255,255,.16);background:rgba(255,255,255,.05);color:inherit;font-size:1.1rem;font-weight:700}
      .gm-summary{display:grid;gap:12px;padding:16px;border-radius:18px;background:rgba(255,255,255,.06)}
      .gm-summary p{display:grid;gap:4px;margin:0}
      .gm-summary span{opacity:.7;font-size:.9rem}
      .gm-status-list{display:grid;gap:8px;margin-bottom:16px}
      .gm-status-row{display:grid;gap:2px;padding:12px;border-radius:14px;background:rgba(255,255,255,.05)}
      .gm-docs{margin-top:10px;display:grid;gap:8px}
      .gm-doc{margin:0;padding:10px;border-radius:12px;background:rgba(255,255,255,.05)}
      .gm-empty{padding:20px;border-radius:16px;background:rgba(255,255,255,.05)}
      @media (min-width:700px){
        .gm-choice{grid-template-columns:repeat(3,1fr)}
      }
      @media (prefers-reduced-motion:reduce){
        .gm-card,.gm-primary{transition:none}
      }
    </style>`;
  }

  function clearFlash() {
    state.error = "";
    state.message = "";
  }

  function nextPendingMember(predicate) {
    const list = members();
    for (let i = 0; i < list.length; i++) {
      if (!predicate(list[i])) return i;
    }
    return -1;
  }

  function bind() {
    document.getElementById("gmBackBtn")?.addEventListener("click", onBack);

    document.querySelectorAll("[data-subject]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        try {
          await startSubject(btn.getAttribute("data-subject"));
        } catch (err) {
          state.error = err.message;
          render();
        }
      });
    });

    document.querySelectorAll("[data-resume]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        clearFlash();
        try {
          const id = btn.getAttribute("data-resume");
          state.selectedMembers = [];
          state.roleAssignments = {};
          const full = await api(`/api/student/group-sessions/${id}`);
          applyBundle(full);
          resumeScreenFromBundle();
          render();
        } catch (err) {
          state.error = err.message;
          render();
        }
      });
    });

    document.querySelectorAll("[data-delete]").forEach((btn) => {
      btn.addEventListener("click", async (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        clearFlash();
        const id = btn.getAttribute("data-delete");
        if (!id) return;
        if (!window.confirm("Diese Gruppenarbeit wirklich löschen?")) return;
        try {
          await api(`/api/student/group-sessions/${id}/delete`, { method: "POST" });
          if (String(state.sessionId) === String(id)) {
            state.sessionId = null;
            state.bundle = null;
            state.selectedMembers = [];
            state.roleAssignments = {};
            try {
              localStorage.removeItem(LS_KEY);
            } catch (_) {}
          }
          state.message = "Gruppe gelöscht.";
          await loadBootstrap();
          state.screen = "home";
          render();
        } catch (err) {
          state.error = err.message;
          render();
        }
      });
    });

    document.querySelectorAll("[data-topic]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        clearFlash();
        try {
          const topicId = btn.getAttribute("data-topic");
          const data = await api(`/api/student/group-sessions/${state.sessionId}/topic`, {
            method: "PATCH",
            body: JSON.stringify({ topicId })
          });
          applyBundle(data);
          const full = await api(`/api/student/group-sessions/${state.sessionId}`);
          applyBundle(full);
          render();
        } catch (err) {
          state.error = err.message;
          render();
        }
      });
    });

    document.getElementById("gmTopicNext")?.addEventListener("click", () => {
      state.screen = "members";
      render();
    });
    document.getElementById("gmSkipTopic")?.addEventListener("click", () => {
      state.screen = "members";
      render();
    });

    document.querySelectorAll("[data-member]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = Number(btn.getAttribute("data-member"));
        const max = settings().maxMembers || 4;
        if (state.selectedMembers.some((x) => Number(x) === id)) {
          state.selectedMembers = state.selectedMembers.filter((x) => Number(x) !== id);
        } else if (state.selectedMembers.length < max) {
          state.selectedMembers = [...state.selectedMembers, id];
        }
        render();
      });
    });

    document.getElementById("gmMembersNext")?.addEventListener("click", async () => {
      clearFlash();
      try {
        const data = await api(`/api/student/group-sessions/${state.sessionId}/members`, {
          method: "PATCH",
          body: JSON.stringify({ memberIds: state.selectedMembers })
        });
        applyBundle(data);
        if (data.suggestedAssignments) {
          state.roleAssignments = {};
          for (const a of data.suggestedAssignments) {
            state.roleAssignments[a.roleId] = Number(a.userId);
          }
        }
        state.screen = "roles";
        render();
      } catch (err) {
        state.error = err.message;
        render();
      }
    });

    document.querySelectorAll("[data-pick-role]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state._pickedRole = btn.getAttribute("data-pick-role");
        render();
      });
    });
    document.querySelectorAll("[data-assign-user]").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (!state._pickedRole) {
          state.error = "Tippt zuerst auf eine Aufgabe.";
          render();
          return;
        }
        const uid = Number(btn.getAttribute("data-assign-user"));
        if (!settings().allowMultiRoles) {
          for (const [roleId, userId] of Object.entries(state.roleAssignments)) {
            if (Number(userId) === uid && roleId !== state._pickedRole) {
              delete state.roleAssignments[roleId];
            }
          }
        }
        state.roleAssignments[state._pickedRole] = uid;
        state._pickedRole = null;
        render();
      });
    });
    document.getElementById("gmSuggestRoles")?.addEventListener("click", () => {
      const suggested = state.bundle?.suggestedAssignments || [];
      state.roleAssignments = {};
      for (const a of suggested) state.roleAssignments[a.roleId] = Number(a.userId);
      // if empty, rebuild from members + roles
      if (!suggested.length) {
        const roles = (settings().roles || []).filter((r) => r.active);
        const mems = members();
        roles.forEach((role, idx) => {
          state.roleAssignments[role.id] = mems[idx % mems.length]?.userId;
        });
      }
      render();
    });
    document.getElementById("gmRolesNext")?.addEventListener("click", async () => {
      clearFlash();
      try {
        const assignments = Object.entries(state.roleAssignments).map(([roleId, userId]) => ({
          roleId,
          userId: Number(userId)
        }));
        const data = await api(`/api/student/group-sessions/${state.sessionId}/roles`, {
          method: "PATCH",
          body: JSON.stringify({ assignments })
        });
        applyBundle(data);
        state.screen = settings().enableSharedGoal ? "shared" : "handoff";
        state.currentMemberIdx = nextPendingMember((m) => m.goalsComplete);
        if (state.currentMemberIdx < 0) state.currentMemberIdx = 0;
        render();
      } catch (err) {
        state.error = err.message;
        render();
      }
    });

    document.querySelectorAll("[data-shared]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.sharedGoal = btn.getAttribute("data-shared");
        render();
      });
    });
    document.getElementById("gmSharedInput")?.addEventListener("input", (e) => {
      state.sharedGoal = e.target.value;
    });
    document.getElementById("gmSharedNext")?.addEventListener("click", async () => {
      clearFlash();
      try {
        const text =
          document.getElementById("gmSharedInput")?.value?.trim() || state.sharedGoal;
        const data = await api(`/api/student/group-sessions/${state.sessionId}/shared-goal`, {
          method: "PATCH",
          body: JSON.stringify({ sharedGoal: text })
        });
        applyBundle(data);
        state.currentMemberIdx = nextPendingMember((m) => m.goalsComplete);
        if (state.currentMemberIdx < 0) state.currentMemberIdx = 0;
        state.screen = "handoff";
        state.draftGoal = {
          whatGoalId: null,
          whatGoalText: "",
          selectedLevel: null,
          howGoalText: "",
          customHow: false
        };
        render();
      } catch (err) {
        state.error = err.message;
        render();
      }
    });

    document.getElementById("gmHandoffGo")?.addEventListener("click", (e) => {
      const kind = e.currentTarget.getAttribute("data-kind");
      if (kind === "mid") state.screen = "mid";
      else if (kind === "reflect") state.screen = "reflect";
      else {
        const m = currentMember();
        state.draftGoal = {
          whatGoalId: m?.whatGoalId || null,
          whatGoalText: m?.whatGoalText || "",
          selectedLevel: m?.selectedLevel || null,
          howGoalText: m?.howGoalText || "",
          customHow: false
        };
        state.screen = "what";
      }
      render();
    });

    document.querySelectorAll("[data-what]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-what");
        const goal = topicGoals().find((g) => String(g.id) === String(id));
        state.draftGoal.whatGoalId = id;
        state.draftGoal.whatGoalText = goal?.text || "";
        render();
      });
    });
    document.getElementById("gmFreeWhat")?.addEventListener("input", (e) => {
      state.draftGoal.whatGoalText = e.target.value;
      state.draftGoal.whatGoalId = null;
    });
    document.querySelectorAll("[data-level]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.draftGoal.selectedLevel = btn.getAttribute("data-level");
        render();
      });
    });
    document.getElementById("gmWhatNext")?.addEventListener("click", () => {
      if (!state.draftGoal.whatGoalId && !state.draftGoal.whatGoalText.trim()) {
        state.error = "Bitte wähle, was du heute können möchtest.";
        render();
        return;
      }
      state.screen = "how";
      render();
    });

    document.querySelectorAll("[data-how]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.draftGoal.howGoalText = btn.getAttribute("data-how");
        state.draftGoal.customHow = false;
        render();
      });
    });
    document.getElementById("gmCustomHow")?.addEventListener("click", () => {
      state.draftGoal.customHow = true;
      state.draftGoal.howGoalText = "";
      render();
    });
    document.getElementById("gmHowInput")?.addEventListener("input", (e) => {
      state.draftGoal.howGoalText = e.target.value;
    });
    document.getElementById("gmHowNext")?.addEventListener("click", () => {
      const how =
        document.getElementById("gmHowInput")?.value?.trim() || state.draftGoal.howGoalText;
      if (!how) {
        state.error = "Bitte wähle, wie du daran arbeiten möchtest.";
        render();
        return;
      }
      state.draftGoal.howGoalText = how;
      state.screen = "confirm";
      render();
    });

    document.getElementById("gmConfirmEdit")?.addEventListener("click", () => {
      state.screen = "what";
      render();
    });
    document.getElementById("gmConfirmOk")?.addEventListener("click", async () => {
      clearFlash();
      try {
        const m = currentMember();
        const data = await api(`/api/student/group-sessions/${state.sessionId}/member-goals`, {
          method: "PUT",
          body: JSON.stringify({
            userId: m.userId,
            whatGoalId: state.draftGoal.whatGoalId,
            whatGoalText: state.draftGoal.whatGoalText,
            selectedLevel: state.draftGoal.selectedLevel,
            howGoalText: state.draftGoal.howGoalText
          })
        });
        applyBundle(data);
        // clear personal draft before next person
        state.draftGoal = {
          whatGoalId: null,
          whatGoalText: "",
          selectedLevel: null,
          howGoalText: "",
          customHow: false
        };
        const next = nextPendingMember((mem) => mem.goalsComplete);
        if (next >= 0) {
          state.currentMemberIdx = next;
          state.screen = "handoff";
        } else {
          state.screen = "overview";
        }
        render();
      } catch (err) {
        state.error = err.message;
        render();
      }
    });

    document.getElementById("gmStartWork")?.addEventListener("click", async () => {
      clearFlash();
      try {
        const data = await api(`/api/student/group-sessions/${state.sessionId}/start`, {
          method: "POST",
          body: "{}"
        });
        applyBundle(data);
        state.screen = "work";
        render();
      } catch (err) {
        state.error = err.message;
        render();
      }
    });

    document.getElementById("gmDocSave")?.addEventListener("click", async () => {
      clearFlash();
      try {
        const content = document.getElementById("gmDocInput")?.value?.trim();
        const data = await api(`/api/student/group-sessions/${state.sessionId}/docs`, {
          method: "POST",
          body: JSON.stringify({ content, docType: "note" })
        });
        applyBundle(data);
        state.message = "Gespeichert.";
        render();
      } catch (err) {
        state.error = err.message;
        render();
      }
    });

    document.getElementById("gmStartMid")?.addEventListener("click", () => {
      state.currentMemberIdx = nextPendingMember((m) => m.midCheckAt);
      if (state.currentMemberIdx < 0) {
        state.message = "Alle haben den Check schon gemacht.";
        render();
        return;
      }
      state.midDraft = {};
      state.screen = "mid-handoff";
      render();
    });

    document.getElementById("gmStartReflect")?.addEventListener("click", () => {
      state.currentMemberIdx = nextPendingMember((m) => m.reflectionAt);
      if (state.currentMemberIdx < 0) {
        state.screen = "done";
        render();
        return;
      }
      state.reflectDraft = {};
      state.screen = "reflect-handoff";
      render();
    });

    document.querySelectorAll("[data-mid]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const field = btn.getAttribute("data-mid");
        state.midDraft[field] = btn.getAttribute("data-val");
        render();
      });
    });
    document.getElementById("gmMidSave")?.addEventListener("click", async () => {
      clearFlash();
      try {
        const m = currentMember();
        const data = await api(`/api/student/group-sessions/${state.sessionId}/mid-check`, {
          method: "PUT",
          body: JSON.stringify({ userId: m.userId, ...state.midDraft })
        });
        applyBundle(data);
        state.midDraft = {};
        const next = nextPendingMember((mem) => mem.midCheckAt);
        if (next >= 0) {
          state.currentMemberIdx = next;
          state.screen = "mid-handoff";
        } else {
          state.message = "Danke! Zwischencheck fertig.";
          state.screen = "work";
        }
        render();
      } catch (err) {
        state.error = err.message;
        render();
      }
    });

    document.querySelectorAll("[data-ref]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const field = btn.getAttribute("data-ref");
        state.reflectDraft[field] = btn.getAttribute("data-val");
        render();
      });
    });
    document.getElementById("gmReflectSave")?.addEventListener("click", async () => {
      clearFlash();
      try {
        const m = currentMember();
        state.reflectDraft.nextImprove =
          document.getElementById("gmNextImprove")?.value || "";
        state.reflectDraft.explainedToGroup =
          document.getElementById("gmExplained")?.value || "";
        state.reflectDraft.learnedFromGroup =
          document.getElementById("gmLearned")?.value || "";
        const data = await api(`/api/student/group-sessions/${state.sessionId}/reflection`, {
          method: "PUT",
          body: JSON.stringify({ userId: m.userId, ...state.reflectDraft })
        });
        applyBundle(data);
        state.reflectDraft = {};
        if (data.session?.status === "closed") {
          state.screen = "done";
        } else {
          const next = nextPendingMember((mem) => mem.reflectionAt);
          if (next >= 0) {
            state.currentMemberIdx = next;
            state.screen = "reflect-handoff";
          } else {
            state.screen = "done";
          }
        }
        render();
      } catch (err) {
        state.error = err.message;
        render();
      }
    });

    document.getElementById("gmBackHome")?.addEventListener("click", async () => {
      state.screen = "home";
      state.sessionId = null;
      state.bundle = null;
      await loadBootstrap();
      render();
    });
  }

  function resumeScreenFromBundle() {
    const s = state.bundle?.session;
    if (!s) {
      state.screen = "home";
      return;
    }
    if (s.status === "closed") {
      state.screen = "done";
      return;
    }
    if (s.status === "active" || s.status === "midcheck" || s.status === "reflecting") {
      state.screen = "work";
      return;
    }
    const step = s.setupStep;
    if (step === "members" || !members().length) state.screen = "members";
    else if (step === "roles") state.screen = "roles";
    else if (step === "shared_goal") state.screen = "shared";
    else if (step === "personal_goals") {
      state.currentMemberIdx = nextPendingMember((m) => m.goalsComplete);
      state.screen = state.currentMemberIdx >= 0 ? "handoff" : "overview";
    } else if (step === "overview" || step === "done") state.screen = "overview";
    else state.screen = state.bundle?.session?.topicId ? "members" : "pick-topic";
  }

  function onBack() {
    clearFlash();
    const map = {
      "pick-topic": "home",
      members: "pick-topic",
      roles: "members",
      shared: "roles",
      handoff: "shared",
      what: "handoff",
      how: "what",
      confirm: "how",
      overview: "handoff",
      mid: "mid-handoff",
      "mid-handoff": "work",
      reflect: "reflect-handoff",
      "reflect-handoff": "work",
      work: "home",
      done: "home"
    };
    state.screen = map[state.screen] || "home";
    if (state.screen === "home") {
      state.sessionId = null;
      state.bundle = null;
    }
    render();
  }

  async function loadBootstrap() {
    const r = await fetch("/api/student/group-mode/bootstrap", {
      credentials: "same-origin",
      cache: "no-store"
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      try {
        localStorage.removeItem(LS_KEY);
      } catch (_) {}
      throw new Error(data.message || data.error || "Gruppenarbeit konnte nicht geladen werden.");
    }
    state.bootstrap = data;
  }

  async function startSubject(subject, date) {
    clearFlash();
    const existing = (state.bootstrap?.activeSessions || []).find(
      (s) => String(s.subject || "").toLowerCase() === String(subject || "").toLowerCase()
    );
    if (existing?.id) {
      state.selectedMembers = [];
      state.roleAssignments = {};
      const full = await api(`/api/student/group-sessions/${existing.id}`);
      applyBundle(full);
      resumeScreenFromBundle();
      render();
      return;
    }
    const data = await api("/api/student/group-sessions", {
      method: "POST",
      body: JSON.stringify({ subject, date: date || undefined })
    });
    applyBundle(data);
    try {
      const full = await api(`/api/student/group-sessions/${data.session.id}`);
      applyBundle(full);
    } catch (loadErr) {
      // Session existiert – Themen separat nachladen
      try {
        const t = await fetch(
          `/api/student/group-mode/topics?subject=${encodeURIComponent(subject)}`
        );
        const topicData = await t.json();
        if (state.bundle) state.bundle.topics = topicData.topics || [];
      } catch (_) {}
      console.warn("group session reload:", loadErr);
    }
    state.screen = "pick-topic";
    render();
  }

  let initPromise = null;
  async function init(query) {
    if (initPromise) return initPromise;
    initPromise = (async () => {
      state.loading = true;
      clearFlash();
      const q = query instanceof URLSearchParams ? query : new URLSearchParams(query || "");
      const subjectFromQuery = (q.get("subject") || "").trim();
      const sessionFromQuery = (q.get("sessionId") || "").trim();
      const dateFromQuery = (q.get("date") || "").trim();

      try {
        await loadBootstrap();
        if (!state.bootstrap?.hasClass && state.bootstrap?.error) {
          state.error = state.bootstrap.message || state.bootstrap.error;
        }

        if (sessionFromQuery) {
          try {
            const full = await api(`/api/student/group-sessions/${sessionFromQuery}`);
            applyBundle(full);
            resumeScreenFromBundle();
            render();
            return;
          } catch (err) {
            state.error = err.message || "Gruppe konnte nicht geöffnet werden.";
          }
        }

        if (subjectFromQuery) {
          const enabled = (state.bootstrap?.enabledSubjects || []).some(
            (s) => s.subject === subjectFromQuery
          );
          if (enabled) {
            const existing = (state.bootstrap?.activeSessions || []).find(
              (s) => s.subject === subjectFromQuery
            );
            if (existing) {
              const full = await api(`/api/student/group-sessions/${existing.id}`);
              applyBundle(full);
              resumeScreenFromBundle();
              render();
              return;
            }
            await startSubject(subjectFromQuery, dateFromQuery || state.bootstrap?.date);
            return;
          }
          state.error = `Gruppenmodus für ${subjectFromQuery} ist nicht freigeschaltet.`;
        }

        const draft = restoreLocal();
        if (draft?.sessionId && !subjectFromQuery) {
          try {
            state.selectedMembers = [];
            state.roleAssignments = {};
            const full = await api(`/api/student/group-sessions/${draft.sessionId}`);
            applyBundle(full);
            state.currentMemberIdx = draft.currentMemberIdx || 0;
            if (full.session?.status === "setup") {
              resumeScreenFromBundle();
            } else if (["what", "how", "confirm", "mid", "reflect"].includes(draft.screen)) {
              resumeScreenFromBundle();
            } else {
              state.screen = draft.screen || "work";
            }
          } catch {
            try {
              localStorage.removeItem(LS_KEY);
            } catch (_) {}
            state.screen = "home";
            state.error = "";
          }
        } else if (!subjectFromQuery) {
          state.screen = "home";
        }
      } catch (err) {
        state.error =
          err.message ||
          "Die Gruppenarbeit konnte nicht geladen werden.";
        state.screen = "home";
      } finally {
        state.loading = false;
        render();
      }
    })();
    try {
      await initPromise;
    } finally {
      initPromise = null;
    }
  }

  window.LogbuchGruppenmodus = { init };
})();
