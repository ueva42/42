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
      whatGoals: [],
      selectedLevel: null,
      howGoalId: null,
      howGoalText: "",
      howGoals: [],
      customHow: false
    },
    draftSharedGoalId: null,
    midDraft: { changeStrategies: [] },
    reflectDraft: {},
    midStep: 1,
    reflectStep: 1,
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
    const topicName = state.bundle?.session?.topicName;
    const topics = state.bundle?.topics || [];
    let topic = topics.find((t) => String(t.id) === String(topicId));
    if (!topic && topicName) {
      topic = topics.find(
        (t) =>
          String(t.name || "")
            .trim()
            .toLowerCase() === String(topicName).trim().toLowerCase()
      );
    }
    if (!topic) topic = topics[0];
    return topic?.goals || [];
  }

  /** Aktive Rollen-Was-/Wie-Ziele für das aktuelle Mitglied (nach zugewiesenen Rollen). */
  function roleGoalsForCurrentMember(type) {
    const m = currentMember();
    const want = String(type || "WAS").toUpperCase() === "WIE" ? "WIE" : "WAS";
    const assigned = m?.roles || [];
    const defs = settings().roles || [];
    const out = [];
    const seen = new Set();
    for (const role of assigned) {
      const def =
        defs.find((r) => String(r.id) === String(role.roleId)) ||
        defs.find((r) => normalizeText(r.name) === normalizeText(role.name));
      if (!def || def.active === false) continue;
      const list = want === "WIE" ? def.howGoals || [] : def.wasGoals || [];
      for (const g of list) {
        if (g.active === false) continue;
        const key = String(g.id || g.text);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
          ...g,
          roleName: role.name || def.name,
          roleId: def.id
        });
      }
    }
    return out;
  }

  function normalizeText(s) {
    return String(s || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
  }

  function levelGoalCardText(goal) {
    const tiers = state.bundle?.levelOptions || [];
    const bits = [goal.text];
    if (goal.rookieGoalText || goal.operatorGoalText || goal.streetLegendGoalText) {
      const labels = [];
      if (goal.rookieGoalText) labels.push("Rookie");
      if (goal.operatorGoalText) labels.push("Operator");
      if (goal.streetLegendGoalText) labels.push("Street Legend");
      if (labels.length) bits.push(labels.join(" · "));
    } else if (tiers.length) {
      /* no-op */
    }
    return bits;
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
      const prevTopics = state.bundle?.topics;
      state.bundle = data;
      state.sessionId = data.session.id;
      state.sharedGoal = data.session.sharedGoal || state.sharedGoal;
      // Levelplan-Themen nicht verlieren, wenn eine Antwort sie nicht mitschickt
      if (!Array.isArray(state.bundle.topics) || !state.bundle.topics.length) {
        if (Array.isArray(data.topics) && data.topics.length) {
          state.bundle.topics = data.topics;
        } else if (Array.isArray(prevTopics) && prevTopics.length) {
          state.bundle.topics = prevTopics;
        }
      }
      if (Array.isArray(data.members) && data.members.length) {
        state.selectedMembers = data.members.map((m) => Number(m.userId));
      }
      if (data.members?.length && Object.keys(state.roleAssignments).length === 0) {
        for (const m of data.members) {
          for (const role of m.roles || []) {
            if (role.roleId) state.roleAssignments[String(role.roleId)] = Number(m.userId);
          }
        }
      }
    }
    persistLocal();
  }

  async function ensureTopicsLoaded() {
    const subject = state.bundle?.session?.subject;
    if (!subject) return;
    if ((state.bundle?.topics || []).some((t) => (t.goals || []).length)) return;
    try {
      const t = await fetch(
        `/api/student/group-mode/topics?subject=${encodeURIComponent(subject)}`,
        { credentials: "same-origin", cache: "no-store" }
      );
      const topicData = await t.json().catch(() => ({}));
      if (t.ok && state.bundle) {
        state.bundle.topics = topicData.topics || [];
      }
    } catch (_) {}
  }

  function sessionStatusLabel(session) {
    if (!session) return "";
    const members =
      Array.isArray(session.memberNames) && session.memberNames.length
        ? session.memberNames.join(", ")
        : "";
    if (session.sharedGoal) {
      return members ? `${session.sharedGoal} · ${members}` : session.sharedGoal;
    }
    const step = session.setupStep;
    let status = "";
    if (session.status === "setup") {
      if (step === "members") status = "Mitglieder wählen";
      else if (step === "roles") status = "Rollen verteilen";
      else if (step === "shared_goal") status = "Gemeinsames Vorhaben";
      else if (step === "personal_goals") status = "Persönliche Ziele";
      else if (step === "overview") status = "Bereit zum Start";
      else status = "Wird eingerichtet";
    } else if (session.status === "active") status = "In Arbeit";
    else if (session.status === "midcheck") status = "Zwischencheck";
    else if (session.status === "reflecting") status = "Abschluss";
    else if (session.status === "closed") status = "Fertig";
    else status = session.status || "";
    return members ? `${status} · ${members}` : status;
  }

  function shell(stepLabel, title, body, footer) {
    return `
      <div class="gm-app plan-app plan-app--accordion">
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

  function gmAccDone(stepNum, title, summary) {
    return `
      <article class="plan-acc is-done gm-acc-static">
        <div class="plan-acc__header" aria-disabled="true">
          <span class="plan-acc__step is-done">✓</span>
          <span class="plan-acc__titles">
            <span class="plan-acc__title">${esc(title)}</span>
            <span class="plan-acc__summary">${esc(summary || "–")}</span>
          </span>
        </div>
      </article>`;
  }

  function gmAccOpen(stepNum, title, hint, bodyHtml) {
    return `
      <article class="plan-acc is-open">
        <div class="plan-acc__header">
          <span class="plan-acc__step">${stepNum}</span>
          <span class="plan-acc__titles">
            <span class="plan-acc__title">${esc(title)}</span>
            <span class="plan-acc__hint">${esc(hint || "Jetzt ausfüllen")}</span>
          </span>
          <span class="plan-acc__chevron" aria-hidden="true">▾</span>
        </div>
        <div class="plan-acc__body">${bodyHtml}</div>
      </article>`;
  }

  function gmAccLocked(stepNum, title) {
    return `
      <article class="plan-acc is-locked gm-acc-static">
        <div class="plan-acc__header" aria-disabled="true">
          <span class="plan-acc__step">${stepNum}</span>
          <span class="plan-acc__titles">
            <span class="plan-acc__title">${esc(title)}</span>
            <span class="plan-acc__summary">Noch offen</span>
          </span>
        </div>
      </article>`;
  }

  function tileAccentFor(item) {
    if (item.accent) return item.accent;
    const hay = `${item.meta || ""} ${item.sub || ""} ${item.badge || ""} ${item.title || ""}`.toLowerCase();
    if (/versuch|experiment|mess/.test(hay)) return "#22d3ee";
    if (/protokoll|dokument|notiz/.test(hay)) return "#a855f7";
    if (/produkt|modell|bau|prototyp/.test(hay)) return "#f472b6";
    if (/partner|team|gruppe/.test(hay)) return "#34d399";
    return "#22d3ee";
  }

  function tileIconFor(item) {
    if (item.icon) return item.icon;
    const hay = `${item.meta || ""} ${item.sub || ""} ${item.badge || ""} ${item.title || ""}`.toLowerCase();
    if (/versuch|experiment|mess/.test(hay)) return "⚗";
    if (/protokoll|dokument|notiz/.test(hay)) return "▤";
    if (/produkt|modell|bau|prototyp/.test(hay)) return "◈";
    if (/partner|team|gruppe/.test(hay)) return "◎";
    if (/hilfe|frage/.test(hay)) return "?";
    return "◆";
  }

  function cardGrid(items, selectedId, dataAttr) {
    return `<div class="strategy-tile-grid gm-tile-grid">${items
      .map((item) => {
        const selected = String(item.id) === String(selectedId) || item.selected;
        const accent = tileAccentFor(item);
        const desc = item.desc || item.sub || item.meta || item.badge || "";
        const extra = item.dataShared
          ? ` data-shared="${esc(item.dataShared)}"`
          : "";
        return `
        <button type="button"
          class="strategy-tile ${selected ? "is-active" : ""} ${item.disabled ? "is-disabled" : ""}"
          data-${dataAttr}="${esc(item.id)}"${extra}
          style="--tile-accent:${accent}"
          ${item.disabled ? "disabled" : ""}>
          ${selected ? `<span class="strategy-tile__check" aria-hidden="true">✓</span>` : ""}
          <span class="strategy-tile__icon" aria-hidden="true">${esc(tileIconFor(item))}</span>
          <span class="strategy-tile__title">${esc(item.title)}</span>
          ${desc ? `<span class="strategy-tile__desc">${esc(desc)}</span>` : ""}
        </button>`;
      })
      .join("")}</div>`;
  }

  function missionBlock(label, valueHtml) {
    return `<div class="mission-summary__block">
      <p class="mission-summary__label">${esc(label)}</p>
      ${valueHtml}
    </div>`;
  }

  function missionValue(text) {
    return `<p class="mission-summary__value">${esc(text || "–")}</p>`;
  }

  function missionList(items) {
    const list = (items || []).map((g) => (typeof g === "string" ? g : g?.text)).filter(Boolean);
    if (!list.length) return missionValue("–");
    return `<ul class="mission-summary__list">${list
      .map((t) => `<li>${esc(t)}</li>`)
      .join("")}</ul>`;
  }

  function renderMissionCard({ title, step, ready, blocks, status }) {
    return `
      <article class="goal-step-card goal-step-card--wide plan-mission-live gm-mission-card ${
        ready ? "is-ready" : ""
      }">
        <header class="goal-step-card__head">
          <span class="goal-step-card__step">${ready ? "✓" : step || "★"}</span>
          <h3 class="goal-step-card__title">${esc(title)}</h3>
          ${
            status
              ? `<span class="gm-mission-status ${ready ? "is-ready" : ""}">${esc(status)}</span>`
              : ""
          }
        </header>
        <div class="mission-summary">${blocks}</div>
      </article>`;
  }

  function emptyDraftGoal() {
    return {
      whatGoalId: null,
      whatGoalText: "",
      whatGoals: [],
      selectedLevel: null,
      howGoalId: null,
      howGoalText: "",
      howGoals: [],
      customHow: false
    };
  }

  /** Pro Rolle bis zu 3 Ziele – bei mehreren Rollen entsprechend mehr. */
  function perRoleGoalLimit() {
    return 3;
  }

  function memberRoleCount(member) {
    const roles = (member || currentMember())?.roles || [];
    return Math.max(1, roles.length);
  }

  function goalPickLimit(member) {
    return perRoleGoalLimit() * memberRoleCount(member);
  }

  function countGoalsForRole(list, roleName) {
    const key = String(roleName || "").trim().toLowerCase();
    return (list || []).filter(
      (g) => String(g.roleName || "").trim().toLowerCase() === key
    ).length;
  }

  function toggleDraftGoal(kind, goal) {
    const key = kind === "how" ? "howGoals" : "whatGoals";
    const max = goalPickLimit();
    const perRole = perRoleGoalLimit();
    const list = [...(state.draftGoal[key] || [])];
    const idx = list.findIndex((g) => String(g.id) === String(goal.id));
    if (idx >= 0) list.splice(idx, 1);
    else {
      // gleiche Texte nicht doppelt
      if (list.some((g) => String(g.text).trim() === String(goal.text || "").trim())) {
        return true;
      }
      if (list.length >= max) {
        state.error = `Höchstens ${max} verschiedene ${kind === "how" ? "Wie" : "Was"}-Ziele (${perRole} pro Rolle).`;
        return false;
      }
      if (countGoalsForRole(list, goal.roleName) >= perRole) {
        state.error = goal.roleName
          ? `Für „${goal.roleName}“ höchstens ${perRole} Ziele.`
          : `Höchstens ${perRole} Ziele pro Rolle.`;
        return false;
      }
      list.push({ id: goal.id, text: goal.text, roleName: goal.roleName || null });
    }
    state.draftGoal[key] = list;
    if (kind === "how") {
      state.draftGoal.howGoalId = list[0]?.id || null;
      state.draftGoal.howGoalText = list.map((g) => g.text).join(" · ");
      state.draftGoal.customHow = false;
    } else {
      state.draftGoal.whatGoalId = list[0]?.id || null;
      state.draftGoal.whatGoalText = list.map((g) => g.text).join(" · ");
    }
    return true;
  }

  function selectedGoalsPanel(kind) {
    const list = kind === "how" ? state.draftGoal.howGoals || [] : state.draftGoal.whatGoals || [];
    const max = goalPickLimit();
    const perRole = perRoleGoalLimit();
    const roles = memberRoleCount();
    const label = kind === "how" ? "Wie-Ziele" : "Was-Ziele";
    const hint =
      roles > 1
        ? `Bis zu ${perRole} pro Rolle (max. ${max} ${label}).`
        : `Bis zu ${max} verschiedene ${label}.`;
    if (!list.length) {
      return `<p class="gm-muted">Noch keine Auswahl – tippe auf die Karten. ${hint}</p>`;
    }
    return `<div class="gm-selected-panel open">
      <p class="gm-label">Deine Auswahl (${list.length}/${max})</p>
      <ul class="gm-selected-list">${list
        .map(
          (g) =>
            `<li><strong>${esc(g.text)}</strong>${
              g.roleName ? ` <span class="gm-muted">(${esc(g.roleName)})</span>` : ""
            }</li>`
        )
        .join("")}</ul>
    </div>`;
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
        ? `<div class="gm-empty">Für dieses Fach gibt es noch keinen Levelplan.
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
      ${cardGrid(
        classmates.map((c) => ({
          id: c.id,
          title: c.displayName,
          desc: c.busyInOtherGroup ? "schon in Gruppe" : "Tippen zum Auswählen",
          icon: "◎",
          accent: "#22d3ee",
          selected: state.selectedMembers.some((id) => Number(id) === Number(c.id)),
          disabled: !!c.busyInOtherGroup
        })),
        null,
        "member"
      )}`;
    const ok = state.selectedMembers.length >= min && state.selectedMembers.length <= max;
    return shell(
      "Schritt 2 von 5",
      "Wer arbeitet heute zusammen?",
      body,
      `<button type="button" class="gm-primary" id="gmMembersNext" ${ok ? "" : "disabled"}>Weiter</button>`
    );
  }

  function renderRoles() {
    const roles = (settings().roles || []).filter((r) => r && r.active !== false);
    const mems = members();
    if (!mems.length) {
      return shell(
        "Schritt 3 von 5",
        "Wer übernimmt welche Aufgabe?",
        `<div class="gm-empty">Es sind keine Gruppenmitglieder gespeichert. Bitte einen Schritt zurück und die Personen erneut wählen.</div>`,
        `<button type="button" class="gm-primary" id="gmRolesBackMembers">Zurück zu den Personen</button>`
      );
    }
    const body = `
      <p class="gm-lead">Tippt bei jeder Aufgabe auf die Person, die sie übernimmt.</p>
      <div class="gm-role-board">
        ${roles
          .map((role, idx) => {
            const roleId = String(role.id);
            const uid = state.roleAssignments[roleId];
            const person = mems.find((m) => String(m.userId) === String(uid));
            const accent = tileAccentFor({ meta: role.name, title: role.name });
            return `
            <article class="goal-step-card goal-step-card--wide plan-mission-live gm-mission-card ${
              person ? "is-ready" : ""
            }">
              <header class="goal-step-card__head">
                <span class="goal-step-card__step" style="--tile-accent:${accent}">${
                  person ? "✓" : String(idx + 1)
                }</span>
                <h3 class="goal-step-card__title">${esc(role.name)}</h3>
                ${
                  person
                    ? `<span class="gm-mission-status is-ready">${esc(person.displayName)}</span>`
                    : `<span class="gm-mission-status">Noch frei</span>`
                }
              </header>
              <div class="mission-summary">
                ${missionBlock(
                  "Aufgabe",
                  missionValue(role.description || "Rollenaufgabe in der Gruppe")
                )}
                ${missionBlock(
                  "Wer übernimmt das?",
                  cardGrid(
                    mems.map((m) => ({
                      id: `${roleId}:${m.userId}`,
                      title: m.displayName,
                      desc: String(uid) === String(m.userId) ? `Macht ${role.name}` : "Tippen zum Zuweisen",
                      meta: role.name,
                      icon: "◎",
                      accent,
                      selected: String(uid) === String(m.userId)
                    })),
                    null,
                    "role-assign"
                  )
                )}
              </div>
            </article>`;
          })
          .join("")}
      </div>
      <button type="button" class="gm-ghost" id="gmSuggestRoles">Vorschlag übernehmen</button>`;
    const allAssigned =
      roles.length > 0 && roles.every((r) => state.roleAssignments[String(r.id)]);
    return shell(
      "Schritt 3 von 5",
      "Wer übernimmt welche Aufgabe?",
      body,
      `<button type="button" class="gm-primary" id="gmRolesNext" ${allAssigned ? "" : "disabled"}>Rollen bestätigen</button>`
    );
  }

  function renderShared() {
    const goals = topicGoals();
    const topicName = state.bundle?.session?.topicName || "";

    const body = `
      <p class="gm-lead">Woran möchtet ihr heute gemeinsam arbeiten?</p>
      ${
        topicName
          ? `<p class="gm-muted">Thema: <strong>${esc(topicName)}</strong></p>`
          : ""
      }
      ${
        goals.length
          ? cardGrid(
              goals.map((g) => {
                const selected =
                  state.sharedGoal === g.text ||
                  String(state.draftSharedGoalId) === String(g.id);
                const meta = levelGoalCardText(g);
                return {
                  id: g.id,
                  title: g.text,
                  desc: meta[1] || "Gemeinsames Levelplan-Ziel",
                  meta: meta[1] || "",
                  icon: "★",
                  accent: "#22d3ee",
                  selected,
                  dataShared: g.text
                };
              }),
              null,
              "shared-goal-id"
            )
          : `<div class="gm-empty">Kein Levelplan für dieses Thema hinterlegt. Schreibt euer gemeinsames Ziel kurz selbst.</div>`
      }
      <label class="gm-label">Oder kurz selbst schreiben
        <textarea id="gmSharedInput" class="gm-textarea" maxlength="400" rows="3">${esc(state.sharedGoal)}</textarea>
      </label>`;
    return shell(
      "Schritt 4 von 5",
      "Woran möchtet ihr heute gemeinsam arbeiten?",
      body,
      `<button type="button" class="gm-primary" id="gmSharedNext">Das ist unser Ziel</button>`
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
    const goals = roleGoalsForCurrentMember("WAS");
    const roles = (m?.roles || []).map((r) => r.name).join(", ");
    const shared = state.bundle?.session?.sharedGoal || state.sharedGoal || "";
    const multi = (m?.roles || []).length > 1;
    const selectedIds = new Set((state.draftGoal.whatGoals || []).map((g) => String(g.id)));
    const maxWhat = goalPickLimit();
    const perRole = perRoleGoalLimit();
    const rolesN = memberRoleCount();
    const whatHint =
      rolesN > 1
        ? `Bis zu ${perRole} Was-Ziele pro Rolle (max. ${maxWhat}).`
        : `Mehrere möglich – bis zu ${maxWhat} verschiedene Was-Ziele.`;
    const pickBody = `
      <p class="gm-lead">${esc(m.displayName)}, das ist heute deine Aufgabe: <strong>${esc(roles || "–")}</strong></p>
      <p class="gm-muted">${whatHint}</p>
      ${selectedGoalsPanel("what")}
      ${
        goals.length
          ? cardGrid(
              goals.map((g) => ({
                id: g.id,
                title: g.text,
                meta: g.roleName || "",
                desc: g.roleName ? `Rolle: ${g.roleName}` : "Was-Ziel",
                selected: selectedIds.has(String(g.id))
              })),
              null,
              "what"
            )
          : settings().allowFreeWhatGoal
            ? `<textarea id="gmFreeWhat" class="gm-textarea" rows="3" placeholder="Dein Beitrag in deiner Rolle…">${esc(state.draftGoal.whatGoalText)}</textarea>`
            : `<div class="gm-empty">Für deine Rolle sind noch keine Was-Ziele hinterlegt. Bitte deine Lehrkraft, Rollen-Ziele zu importieren.</div>`
      }`;
    const body = `
      <div class="plan-acc-stack">
        ${gmAccDone(1, "Deine Rolle", roles || "–")}
        ${shared ? gmAccDone(2, "Gemeinsames Ziel", shared) : ""}
        ${gmAccOpen(shared ? 3 : 2, "Was ist heute dein Beitrag?", whatHint, pickBody)}
        ${gmAccLocked(shared ? 4 : 3, "Wie setzt du das um?")}
      </div>`;
    return shell(
      null,
      "Was ist heute dein Beitrag?",
      body,
      `<button type="button" class="gm-primary" id="gmWhatNext">Weiter zum Wie-Ziel</button>`
    );
  }

  function renderHow() {
    const roleHow = roleGoalsForCurrentMember("WIE");
    const fallback = settings().howGoalOptions || [];
    const multi = (currentMember()?.roles || []).length > 1;
    const selectedIds = new Set((state.draftGoal.howGoals || []).map((g) => String(g.id)));
    const selectedTexts = new Set((state.draftGoal.howGoals || []).map((g) => g.text));
    const maxHow = goalPickLimit();
    const perRoleHow = perRoleGoalLimit();
    const rolesHow = memberRoleCount();
    const howHint =
      rolesHow > 1
        ? `Bis zu ${perRoleHow} Wie-Ziele pro Rolle (max. ${maxHow}).`
        : `Mehrere möglich – bis zu ${maxHow} verschiedene Wie-Ziele.`;
    const whatSummary =
      (state.draftGoal.whatGoals || []).map((g) => g.text).join(" · ") ||
      state.draftGoal.whatGoalText ||
      "–";
    const options = roleHow.length
      ? roleHow.map((g) => ({
          id: g.id,
          title: g.text,
          meta: g.roleName || "",
          desc: g.roleName ? `Rolle: ${g.roleName}` : "Wie-Ziel",
          selected: selectedIds.has(String(g.id))
        }))
      : fallback.map((t) => ({
          id: t,
          title: t,
          desc: "Wie-Ziel",
          selected: !state.draftGoal.customHow && selectedTexts.has(t)
        }));
    const pickBody = `
      <p class="gm-lead">Wie möchtest du deinen Beitrag umsetzen?</p>
      <p class="gm-muted">${howHint}</p>
      ${selectedGoalsPanel("how")}
      ${cardGrid(options, null, roleHow.length ? "how-id" : "how")}
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
    const body = `
      <div class="plan-acc-stack">
        ${gmAccDone(1, "Dein Was-Ziel", whatSummary)}
        ${gmAccOpen(2, "Wie setzt du das um?", howHint, pickBody)}
        ${gmAccLocked(3, "Bestätigung")}
      </div>`;
    return shell(
      null,
      "Wie möchtest du dabei arbeiten?",
      body,
      `<button type="button" class="gm-primary" id="gmHowNext">Weiter</button>`
    );
  }

  function renderConfirm() {
    const m = currentMember();
    const roles = (m?.roles || []).map((r) => r.name).join(", ");
    const shared = state.bundle?.session?.sharedGoal || state.sharedGoal || "";
    const whatList = state.draftGoal.whatGoals || [];
    const howList = state.draftGoal.howGoals || [];
    const myPlan = renderMissionCard({
      title: "Dein Plan für heute",
      step: "★",
      ready: true,
      blocks: [
        missionBlock("Unser gemeinsames Ziel", missionValue(shared || "–")),
        missionBlock("Meine Rolle", missionValue(roles || "–")),
        missionBlock(
          "Meine Was-Ziele",
          whatList.length ? missionList(whatList) : missionValue(state.draftGoal.whatGoalText || "–")
        ),
        missionBlock(
          "Meine Wie-Ziele",
          howList.length ? missionList(howList) : missionValue(state.draftGoal.howGoalText || "–")
        )
      ].join("")
    });
    const body = `
      ${myPlan}
      <div class="gm-overview-stack">
        <p class="gm-label">Gruppenübersicht</p>
        ${renderGroupOverviewInner()}
      </div>`;
    return shell(
      null,
      "Passt alles?",
      body,
      `<div class="gm-footer-row">
        <button type="button" class="gm-ghost" id="gmConfirmEdit">Ändern</button>
        <button type="button" class="gm-primary" id="gmConfirmOk">Passt so – weitergeben</button>
      </div>`
    );
  }

  function renderGroupOverviewInner(opts = {}) {
    const shared = state.bundle?.session?.sharedGoal || state.sharedGoal || "";
    const withProgress = !!opts.withProgress;
    return `<div class="gm-overview-missions">
      ${members()
        .map((m, idx) => {
          const roles = (m.roles || []).map((r) => r.name).join(", ");
          const whatList = m.whatGoals || [];
          const howList = m.howGoals || [];
          const phases = [
            { label: "Ziele gesetzt", done: !!m.goalsComplete },
            { label: "Zwischen-Check", done: !!m.midCheckAt },
            { label: "Abschluss", done: !!m.reflectionAt }
          ];
          const openPhases = phases.filter((p) => !p.done);
          const allDone = openPhases.length === 0;
          const blocks = [
            shared ? missionBlock("Gemeinsames Ziel", missionValue(shared)) : "",
            missionBlock("Rolle", missionValue(roles || "–")),
            missionBlock(
              "Was-Ziele",
              whatList.length
                ? missionList(whatList)
                : missionValue(m.whatGoalText || "–")
            ),
            missionBlock(
              "Wie-Ziele",
              howList.length
                ? missionList(howList)
                : missionValue(m.howGoalText || "–")
            )
          ];
          if (withProgress) {
            blocks.push(
              missionBlock(
                allDone ? "Alles erledigt" : "Was fehlt noch?",
                `<ul class="mission-summary__list gm-progress-list">${phases
                  .map(
                    (p) =>
                      `<li class="${p.done ? "is-done" : "is-open"}">${
                        p.done ? "✓" : "○"
                      } ${esc(p.label)}${p.done ? "" : " – noch offen"}</li>`
                  )
                  .join("")}</ul>`
              )
            );
          }
          return renderMissionCard({
            title: m.displayName,
            step: String(idx + 1),
            ready: withProgress ? allDone : !!m.goalsComplete,
            status: withProgress
              ? allDone
                ? "Fertig"
                : `${openPhases.length} offen`
              : m.goalsComplete
                ? "Fertig"
                : "Offen",
            blocks: blocks.join("")
          });
        })
        .join("")}
    </div>`;
  }

  function renderOverview() {
    const shared = state.bundle?.session?.sharedGoal || "";
    const body = `
      ${
        shared
          ? renderMissionCard({
              title: "Euer gemeinsames Ziel",
              step: "★",
              ready: true,
              blocks: missionBlock("Levelplan", missionValue(shared))
            })
          : ""
      }
      <div class="gm-overview-stack">
        <p class="gm-label">Gruppenübersicht</p>
        ${renderGroupOverviewInner()}
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
      ${renderMissionCard({
        title: state.bundle?.session?.sharedGoal || "Gemeinsame Arbeit",
        step: "★",
        ready: true,
        blocks: missionBlock(
          "Fach / Thema",
          missionValue(
            [state.bundle?.session?.subject, state.bundle?.session?.topicName]
              .filter(Boolean)
              .join(" · ") || "–"
          )
        )
      })}
      <div class="gm-overview-stack">
        <p class="gm-label">Gruppenübersicht – was fehlt noch?</p>
        ${renderGroupOverviewInner({ withProgress: true })}
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

  function memberWhatList(m) {
    if ((m?.whatGoals || []).length) return m.whatGoals;
    if (m?.whatGoalText) {
      return String(m.whatGoalText)
        .split(/\s*[·•|]\s*/)
        .map((t) => t.trim())
        .filter(Boolean)
        .map((text) => ({ text }));
    }
    return [];
  }

  function memberHowList(m) {
    if ((m?.howGoals || []).length) return m.howGoals;
    if (m?.howGoalText) {
      return String(m.howGoalText)
        .split(/\s*[·•|]\s*/)
        .map((t) => t.trim())
        .filter(Boolean)
        .map((text) => ({ text }));
    }
    return [];
  }

  function renderMemberMissionSummary(m, opts = {}) {
    const roles = (m?.roles || []).map((r) => r.name).join(", ");
    const midRaw = m?.midCheck;
    const mid =
      midRaw && typeof midRaw === "string"
        ? (() => {
            try {
              return JSON.parse(midRaw);
            } catch {
              return {};
            }
          })()
        : midRaw || {};
    const blocks = [
      missionBlock("Rolle", missionValue(roles || "–")),
      missionBlock("Was-Ziele", missionList(memberWhatList(m))),
      missionBlock("Wie-Ziele", missionList(memberHowList(m)))
    ];
    if (opts.withMid && m?.midCheckAt) {
      blocks.push(
        missionBlock(
          "Dein Zwischencheck",
          `<ul class="mission-summary__list">
            <li>Weg: ${esc(mid.onTrack || "–")}</li>
            <li>Vorankommen: ${esc(mid.progress || "–")}</li>
            <li>Ändern: ${esc(mid.changeNeeded || "–")}${
              mid.changeFocus ? ` (${esc(mid.changeFocus)})` : ""
            }</li>
            ${
              (mid.changeStrategies || []).length
                ? `<li>Strategie: ${esc((mid.changeStrategies || []).join(" · "))}</li>`
                : ""
            }
          </ul>`
        )
      );
    }
    return renderMissionCard({
      title: opts.title || "Deine Mission",
      step: "★",
      ready: true,
      blocks: blocks.join("")
    });
  }

  const MID_ON_TRACK = [
    { value: "Ja", title: "Gut unterwegs", desc: "Ich bin auf dem richtigen Weg.", icon: "✓", accent: "#22c55e" },
    { value: "Noch unsicher", title: "Noch unsicher", desc: "Es könnte noch kippen.", icon: "?", accent: "#22d3ee" },
    { value: "Nein", title: "Ich hänge fest", desc: "So komme ich nicht weiter.", icon: "!", accent: "#f472b6" }
  ];
  const MID_PROGRESS = [
    { value: "Ja", title: "Gut voran", desc: "Ich komme klar voran.", icon: "◎", accent: "#22c55e" },
    { value: "Teilweise", title: "Teilweise", desc: "Etwas läuft, etwas stockt.", icon: "◑", accent: "#a855f7" },
    { value: "Nein", title: "Stockt", desc: "Kaum Fortschritt bisher.", icon: "◌", accent: "#f472b6" }
  ];
  const MID_CHANGE = [
    { value: "Nein", title: "Nichts ändern", desc: "Ich bleibe bei meinem Plan.", icon: "✓", accent: "#22c55e" },
    { value: "Vielleicht", title: "Vielleicht", desc: "Kleine Anpassung prüfen.", icon: "↻", accent: "#22d3ee" },
    { value: "Ja", title: "Ja, ändern", desc: "Ich stelle etwas um.", icon: "✎", accent: "#a855f7" }
  ];
  const MID_CHANGE_FOCUS = [
    { value: "Vorgehen", title: "Vorgehen", desc: "Reihenfolge oder Methode anpassen.", icon: "↻", accent: "#22d3ee" },
    { value: "Versuch", title: "Versuch", desc: "Aufbau oder Durchführung verbessern.", icon: "⚗", accent: "#22d3ee" },
    { value: "Erklärung", title: "Erklärung", desc: "Besser erklären oder nachfragen.", icon: "◎", accent: "#a855f7" },
    { value: "Zusammenarbeit", title: "Zusammenarbeit", desc: "Rollen oder Absprache klären.", icon: "👥", accent: "#a855f7" },
    { value: "Zeitplanung", title: "Zeitplanung", desc: "Tempo und Prioritäten neu setzen.", icon: "⏱", accent: "#22d3ee" },
    { value: "anderes", title: "Anderes", desc: "Etwas anderes anpassen.", icon: "◆", accent: "#f472b6" }
  ];

  function midStrategyTiles() {
    const fromLib = (window.LOGBUCH_STRATEGIES || []).map((s) => ({
      value: s.nextStep || s.name,
      title: s.name,
      desc: s.whenHelps || s.problem || "",
      icon: "◆",
      accent: "#a855f7",
      meta: s.category || ""
    }));
    if (fromLib.length) return fromLib;
    return (window.LOGBUCH_PLAN_B_OPTIONS || []).map((t) => ({
      value: t,
      title: t.length > 34 ? `${t.slice(0, 31)}…` : t,
      desc: "Plan-B-Strategie aus dem Tagesziel",
      icon: "◆",
      accent: "#22d3ee"
    }));
  }

  function pickTiles(tiles, active, dataAttr, multi = false) {
    const V = window.LogbuchVisuals;
    if (V?.strategyTileGrid) {
      return V.strategyTileGrid(tiles, active, dataAttr, { multi });
    }
    return cardGrid(
      tiles.map((t) => ({
        id: t.value,
        title: t.title,
        desc: t.desc,
        icon: t.icon,
        accent: t.accent,
        selected: multi
          ? (Array.isArray(active) ? active : []).includes(t.value)
          : String(active) === String(t.value)
      })),
      null,
      dataAttr.replace(/^data-/, "")
    );
  }

  function renderMid() {
    const m = currentMember();
    const step = Math.min(4, Math.max(1, Number(state.midStep) || 1));
    const needsChange =
      state.midDraft.changeNeeded === "Vielleicht" || state.midDraft.changeNeeded === "Ja";
    const strategies = state.midDraft.changeStrategies || [];

    const step1Body = `
      ${renderMemberMissionSummary(m)}
      <div class="plan-acc__continue">
        <button type="button" class="gm-primary" id="gmMidStep1Next">Weiter zum Check</button>
      </div>`;
    const step2Body = pickTiles(MID_ON_TRACK, state.midDraft.onTrack, "data-mid-onTrack");
    const step3Body = pickTiles(MID_PROGRESS, state.midDraft.progress, "data-mid-progress");
    const step4Body = `
      ${pickTiles(MID_CHANGE, state.midDraft.changeNeeded, "data-mid-changeNeeded")}
      ${
        needsChange
          ? `<p class="way-section__title" style="margin-top:14px">Was möchtest du ändern?</p>
             <p class="gm-muted">Kurz wählen – und optional eine Strategie aus dem Tagesziel.</p>
             ${pickTiles(MID_CHANGE_FOCUS, state.midDraft.changeFocus, "data-mid-changeFocus")}
             <p class="way-section__title" style="margin-top:14px">Welche Strategie hilft dir jetzt?</p>
             <p class="gm-muted">Bis zu 3 – wie Plan B beim Tagesziel.</p>
             ${pickTiles(midStrategyTiles(), strategies, "data-mid-strategy", true)}`
          : ""
      }`;

    const body = `
      <div class="plan-acc-stack">
        ${
          step === 1
            ? gmAccOpen(1, "Meine Ziele", "Kurz ansehen, dann weiter", step1Body)
            : gmAccDone(1, "Meine Ziele", "angesehen")
        }
        ${
          step === 2
            ? gmAccOpen(2, "Bist du auf dem richtigen Weg?", "Eine Karte wählen", step2Body)
            : step > 2
              ? gmAccDone(2, "Auf dem Weg?", state.midDraft.onTrack || "–")
              : gmAccLocked(2, "Auf dem Weg?")
        }
        ${
          step === 3
            ? gmAccOpen(3, "Kommst du gut voran?", "Eine Karte wählen", step3Body)
            : step > 3
              ? gmAccDone(3, "Vorankommen", state.midDraft.progress || "–")
              : gmAccLocked(3, "Vorankommen")
        }
        ${
          step === 4
            ? gmAccOpen(4, "Musst du etwas ändern?", "Bei Bedarf Strategie wählen", step4Body)
            : gmAccLocked(4, "Etwas ändern?")
        }
      </div>`;

    return shell(
      null,
      "Zeit für euren kurzen Check",
      body,
      step === 4
        ? `<button type="button" class="gm-primary" id="gmMidSave">Zwischencheck speichern</button>`
        : ""
    );
  }

  function renderReflect() {
    const m = currentMember();
    const step = Math.min(5, Math.max(1, Number(state.reflectStep) || 1));
    const reachedTiles = [
      { value: "Erreicht", title: "Erreicht", desc: "Mein Was-Ziel ist geschafft.", icon: "✓", accent: "#22c55e" },
      {
        value: "Teilweise erreicht",
        title: "Teilweise",
        desc: "Ein Teil hat schon geklappt.",
        icon: "◑",
        accent: "#22d3ee"
      },
      {
        value: "Noch nicht erreicht",
        title: "Noch nicht",
        desc: "Heute noch nicht geschafft.",
        icon: "○",
        accent: "#f472b6"
      }
    ];
    const evidenceTiles = [
      "Ich konnte es erklären.",
      "Ich konnte es selbst durchführen.",
      "Ich habe ein richtiges Ergebnis erhalten.",
      "Ich konnte meine Beobachtung begründen.",
      "Ich brauche noch Hilfe.",
      "Ich bin noch unsicher."
    ].map((t, i) => ({
      value: t,
      title: t.replace(/^Ich |^Ich konnte |^Ich habe /, "").replace(/\.$/, ""),
      desc: t,
      icon: String(i + 1),
      accent: i < 4 ? "#22d3ee" : "#a855f7"
    }));
    const helpedTiles = [
      "der Versuch",
      "die Skizze",
      "die Messwerte",
      "meine Gruppe",
      "eine Erklärung",
      "die Recherche",
      "das Ausprobieren",
      "etwas anderes"
    ].map((t) => ({
      value: t,
      title: t,
      desc: `Heute hat mir ${t} geholfen.`,
      icon: "◆",
      accent: "#a855f7"
    }));
    const continueTiles = [
      { value: "Ja", title: "Ja", desc: "Beim nächsten Mal weiter daran arbeiten.", icon: "✓", accent: "#22c55e" },
      { value: "Vielleicht", title: "Vielleicht", desc: "Noch unklar.", icon: "?", accent: "#22d3ee" },
      { value: "Nein", title: "Nein", desc: "Neues Ziel wählen.", icon: "○", accent: "#94a3b8" }
    ];

    const step1Body = `
      ${renderMemberMissionSummary(m, { withMid: true, title: "Deine Ziele heute" })}
      <div class="plan-acc__continue">
        <button type="button" class="gm-primary" id="gmReflectStep1Next">Weiter zur Reflexion</button>
      </div>`;

    const body = `
      <div class="plan-acc-stack">
        ${
          step === 1
            ? gmAccOpen(1, "Meine Ziele & Check", "Übersichtlich ansehen", step1Body)
            : gmAccDone(1, "Meine Ziele & Check", "angesehen")
        }
        ${
          step === 2
            ? gmAccOpen(
                2,
                "Ziel erreicht?",
                "Eine Karte wählen",
                pickTiles(reachedTiles, state.reflectDraft.goalReached, "data-ref-goalReached")
              )
            : step > 2
              ? gmAccDone(2, "Ziel erreicht?", state.reflectDraft.goalReached || "–")
              : gmAccLocked(2, "Ziel erreicht?")
        }
        ${
          step === 3
            ? gmAccOpen(
                3,
                "Woran erkennst du das?",
                "Eine Karte wählen",
                pickTiles(evidenceTiles, state.reflectDraft.evidence, "data-ref-evidence")
              )
            : step > 3
              ? gmAccDone(3, "Woran erkennst du das?", state.reflectDraft.evidence || "–")
              : gmAccLocked(3, "Woran erkennst du das?")
        }
        ${
          step === 4
            ? gmAccOpen(
                4,
                "Was hat geholfen?",
                "Eine Karte wählen",
                `${pickTiles(helpedTiles, state.reflectDraft.helped, "data-ref-helped")}
                 <p class="way-section__title" style="margin-top:14px">Nächstes Mal besser?</p>
                 <textarea id="gmNextImprove" class="gm-textarea" rows="2" placeholder="Kurz notieren…">${esc(
                   state.reflectDraft.nextImprove || ""
                 )}</textarea>
                 <p class="way-section__title" style="margin-top:14px">Weiter an diesem Ziel?</p>
                 ${pickTiles(
                   continueTiles,
                   state.reflectDraft.continueNextSession,
                   "data-ref-continueNextSession"
                 )}
                 <div class="plan-acc__continue">
                   <button type="button" class="gm-primary" id="gmReflectStep4Next">Weiter</button>
                 </div>`
              )
            : step > 4
              ? gmAccDone(4, "Was hat geholfen?", state.reflectDraft.helped || "–")
              : gmAccLocked(4, "Was hat geholfen?")
        }
        ${
          step === 5
            ? gmAccOpen(
                5,
                "Mit der Gruppe",
                "Kurz austauschen",
                `<p class="way-section__title">Das habe ich meiner Gruppe erklärt</p>
                 <textarea id="gmExplained" class="gm-textarea" rows="2" placeholder="Optional…">${esc(
                   state.reflectDraft.explainedToGroup || ""
                 )}</textarea>
                 <p class="way-section__title" style="margin-top:12px">Darüber haben mich die anderen informiert</p>
                 <textarea id="gmLearned" class="gm-textarea" rows="2" placeholder="Optional…">${esc(
                   state.reflectDraft.learnedFromGroup || ""
                 )}</textarea>`
              )
            : gmAccLocked(5, "Mit der Gruppe")
        }
      </div>`;

    return shell(
      null,
      "Wie ist es heute gelaufen?",
      body,
      step === 5
        ? `<button type="button" class="gm-primary" id="gmReflectSave">Fertig – weitergeben</button>`
        : ""
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
    if (
      (state.screen === "shared" || state.screen === "pick-topic") &&
      !(state.bundle?.topics || []).some((t) => (t.goals || []).length) &&
      !state._topicsLoading
    ) {
      state._topicsLoading = true;
      ensureTopicsLoaded().finally(() => {
        state._topicsLoading = false;
        if ((state.bundle?.topics || []).some((t) => (t.goals || []).length)) {
          render();
        }
      });
    }
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
      .gm-app{max-width:820px;margin:0 auto;padding:8px 4px 110px;font-size:1.05rem;color:inherit}
      .gm-top{display:flex;align-items:flex-start;gap:10px;margin-bottom:14px}
      .gm-back{min-width:48px;min-height:48px;border-radius:14px;border:1px solid rgba(34,211,238,.28);background:rgba(8,24,48,.72);color:#e0f2fe;font-size:1.2rem}
      .gm-title{margin:0;font-family:Orbitron,"Bebas Neue",system-ui,sans-serif;letter-spacing:.04em;font-size:1.45rem;line-height:1.2;text-transform:uppercase}
      .gm-step{margin:0 0 4px;font-size:.78rem;letter-spacing:.12em;text-transform:uppercase;color:#67e8f9;opacity:.9}
      .gm-muted{margin:0 0 10px;opacity:.72;font-size:.92rem}
      .gm-label{margin:0 0 6px;font-family:Orbitron,system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase;font-size:.82rem;color:#a5f3fc}
      .gm-lead{margin:0 0 14px;line-height:1.45}
      .gm-h3{margin:16px 0 8px;font-size:1.05rem}
      .gm-acc-static .plan-acc__header{cursor:default}
      .gm-tile-grid{margin:10px 0 4px}
      .gm-app .strategy-tile{min-height:100px}
      .gm-app .strategy-tile__title{font-size:13px;padding-right:22px}
      .gm-app .strategy-tile.is-disabled,.gm-app .strategy-tile:disabled{opacity:.45;cursor:not-allowed;transform:none}
      .gm-overview-stack{margin-top:18px;display:grid;gap:12px}
      .gm-overview-missions{display:grid;gap:14px}
      .gm-mission-card .goal-step-card__head{justify-content:flex-start}
      .gm-mission-status{margin-left:auto;font-size:10px;letter-spacing:.1em;text-transform:uppercase;padding:6px 10px;border-radius:999px;border:1px solid rgba(148,163,184,.35);color:#94a3b8}
      .gm-mission-status.is-ready{border-color:rgba(34,211,238,.55);color:#67e8f9;background:rgba(34,211,238,.12);box-shadow:0 0 14px rgba(34,211,238,.2)}
      .gm-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}
      .gm-card-wrap{display:flex;flex-direction:column;gap:6px}
      .gm-card{position:relative;text-align:left;min-height:88px;padding:16px 44px 16px 16px;border-radius:16px;border:1px solid rgba(148,163,184,.28);background:rgba(8,24,48,.55);color:inherit;cursor:pointer;display:flex;flex-direction:column;gap:6px;transition:border-color .15s,box-shadow .15s,transform .15s}
      .gm-card-check{position:absolute;right:14px;top:14px;width:22px;height:22px;border-radius:999px;border:1px solid rgba(148,163,184,.45);display:flex;align-items:center;justify-content:center;font-size:.8rem;color:transparent;background:transparent}
      .gm-card.is-selected .gm-card-check{background:#22d3ee;border-color:#22d3ee;color:#082f49;font-weight:800}
      .gm-card--static{cursor:default;padding:16px}
      .gm-card.is-selected,.gm-choice-btn.is-selected,.gm-chip.is-selected,.gm-role-card.is-picked{
        border-color:rgba(34,211,238,.85);
        box-shadow:0 0 0 1px rgba(34,211,238,.45),0 0 18px rgba(34,211,238,.22);
        background:rgba(8,47,73,.42);
      }
      .gm-card.is-disabled{opacity:.45;cursor:not-allowed}
      .gm-card-title{font-weight:700;font-size:1.05rem}
      .gm-card-sub,.gm-card-meta{opacity:.75;font-size:.92rem}
      .gm-card-badge{font-size:.8rem;opacity:.8}
      .gm-delete{min-height:40px;border-radius:12px;border:1px solid rgba(255,120,120,.35);background:rgba(180,40,40,.18);color:inherit;font-size:.9rem;cursor:pointer}
      .gm-primary,.gm-ghost{min-height:52px;padding:12px 18px;border-radius:14px;font-size:1.05rem;font-weight:700;border:0;cursor:pointer}
      .gm-primary{background:linear-gradient(90deg,#22d3ee,#a855f7);color:#fff;width:100%;box-shadow:0 8px 28px rgba(34,211,238,.28)}
      .gm-primary:disabled{opacity:.4;cursor:not-allowed;box-shadow:none}
      .gm-ghost{background:transparent;border:1px solid rgba(34,211,238,.35);color:inherit}
      .gm-footer{position:sticky;bottom:0;padding:12px 0;background:linear-gradient(transparent, rgba(8,16,24,.94) 28%);backdrop-filter:blur(8px);pointer-events:none}
      .gm-footer > *{pointer-events:auto}
      .gm-footer-row{display:flex;gap:10px}
      .gm-footer-row .gm-primary,.gm-footer-row .gm-ghost{flex:1}
      .gm-footer-row--stack{flex-direction:column}
      .gm-textarea,.gm-select{width:100%;border-radius:14px;border:1px solid rgba(34,211,238,.35);background:rgba(8,24,48,.9);color:#f9fafb;padding:12px;font-size:1rem}
      .gm-banner{padding:10px 12px;border-radius:12px;margin-bottom:10px}
      .gm-banner--err{background:rgba(220,60,60,.2)}
      .gm-banner--ok{background:rgba(34,211,238,.16);border:1px solid rgba(34,211,238,.28)}
      .gm-save-badge{font-size:.75rem;opacity:.75;white-space:nowrap}
      .gm-handoff{min-height:220px;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;gap:8px}
      .gm-handoff-text{font-size:1.5rem;margin:0}
      .gm-role-board{display:grid;gap:16px;margin-bottom:12px}
      .gm-progress-list li.is-done{color:#67e8f9}
      .gm-progress-list li.is-open{color:#94a3b8}
      .gm-role-assign-label{display:grid;gap:6px;font-size:.92rem}
      .gm-select{min-height:52px;font-weight:600;-webkit-appearance:menulist;appearance:auto}
      .gm-people-row,.gm-chips{display:flex;flex-wrap:wrap;gap:8px;margin:0}
      .gm-chip{min-height:48px;padding:10px 14px;border-radius:999px;border:1px solid rgba(148,163,184,.35);background:rgba(8,24,48,.45);color:inherit;cursor:pointer;font-size:1rem;font-weight:600}
      .gm-choice{display:grid;grid-template-columns:1fr;gap:10px;margin-bottom:12px}
      .gm-choice-btn{min-height:56px;border-radius:16px;border:1px solid rgba(148,163,184,.35);background:rgba(8,24,48,.45);color:inherit;font-size:1.1rem;font-weight:700}
      .gm-summary,.gm-selected-panel{display:grid;gap:12px;padding:16px;border-radius:16px;background:rgba(8,24,48,.55);border:1px solid rgba(34,211,238,.22);margin-bottom:14px}
      .gm-summary.open,.gm-selected-panel.open{display:grid}
      .gm-summary p{display:grid;gap:4px;margin:0}
      .gm-summary span{opacity:.7;font-size:.85rem;letter-spacing:.04em;text-transform:uppercase}
      .gm-selected-list{margin:0;padding-left:1.1em;display:grid;gap:6px}
      .gm-status-list{display:grid;gap:8px;margin:16px 0}
      .gm-status-row{display:grid;gap:2px;padding:12px;border-radius:14px;background:rgba(8,24,48,.45)}
      .gm-docs{margin-top:10px;display:grid;gap:8px}
      .gm-doc{margin:0;padding:10px;border-radius:12px;background:rgba(8,24,48,.45)}
      .gm-empty{padding:20px;border-radius:16px;background:rgba(8,24,48,.45);border:1px dashed rgba(34,211,238,.35)}
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
          // Nächste Stunde / bestehende Gruppe: Mitglieder überspringen → Rollen
          if (data.resumed || data.continueGroup || members().length) {
            const st = data.session?.status || state.bundle?.session?.status;
            if (["active", "midcheck", "reflecting"].includes(st)) {
              state.screen = "work";
              state.message = "Gruppe fortgesetzt – weiter in der Laborarbeit.";
            } else {
              state.screen = members().length ? "roles" : "members";
              state.message =
                members().length
                  ? "Gruppe fortgesetzt – weiter bei den Rollen."
                  : state.message;
            }
          }
          render();
        } catch (err) {
          state.error = err.message;
          render();
        }
      });
    });

    document.getElementById("gmTopicNext")?.addEventListener("click", () => {
      if (members().length) {
        resumeScreenFromBundle();
        if (state.screen === "members") state.screen = "roles";
      } else {
        state.screen = "members";
      }
      render();
    });
    document.getElementById("gmSkipTopic")?.addEventListener("click", () => {
      state.screen = members().length ? "roles" : "members";
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
            if (a.roleId != null) state.roleAssignments[String(a.roleId)] = Number(a.userId);
          }
        }
        state.screen = "roles";
        render();
      } catch (err) {
        state.error = err.message;
        render();
      }
    });

    document.querySelectorAll("[data-role-assign]").forEach((btn) => {
      btn.addEventListener("click", () => {
        clearFlash();
        const raw = String(btn.getAttribute("data-role-assign") || "");
        const sep = raw.indexOf(":");
        if (sep < 1) return;
        const roleId = raw.slice(0, sep);
        const uid = Number(raw.slice(sep + 1));
        if (!roleId || !Number.isFinite(uid) || uid <= 0) {
          state.error = "Diese Person konnte nicht zugeordnet werden.";
          render();
          return;
        }
        if (String(state.roleAssignments[roleId]) === String(uid)) {
          delete state.roleAssignments[roleId];
          render();
          return;
        }
        if (!settings().allowMultiRoles) {
          for (const [rid, userId] of Object.entries(state.roleAssignments)) {
            if (Number(userId) === uid && rid !== roleId) {
              delete state.roleAssignments[rid];
            }
          }
        }
        state.roleAssignments[roleId] = uid;
        render();
      });
    });
    document.getElementById("gmRolesBackMembers")?.addEventListener("click", () => {
      state.screen = "members";
      render();
    });
    document.getElementById("gmSuggestRoles")?.addEventListener("click", () => {
      const suggested = state.bundle?.suggestedAssignments || [];
      state.roleAssignments = {};
      for (const a of suggested) {
        if (a.roleId != null) state.roleAssignments[String(a.roleId)] = Number(a.userId);
      }
      if (!Object.keys(state.roleAssignments).length) {
        const roles = (settings().roles || []).filter((r) => r && r.active !== false);
        const mems = members();
        roles.forEach((role, idx) => {
          const uid = mems[idx % mems.length]?.userId;
          if (uid != null) state.roleAssignments[String(role.id)] = Number(uid);
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
        state.draftSharedGoalId = btn.getAttribute("data-shared-goal-id");
        render();
      });
    });
    document.getElementById("gmSharedInput")?.addEventListener("input", (e) => {
      state.sharedGoal = e.target.value;
      state.draftSharedGoalId = null;
    });
    document.getElementById("gmSharedNext")?.addEventListener("click", async () => {
      clearFlash();
      try {
        const text =
          document.getElementById("gmSharedInput")?.value?.trim() || state.sharedGoal;
        if (!text) {
          state.error = "Bitte wählt ein gemeinsames Ziel.";
          render();
          return;
        }
        const data = await api(`/api/student/group-sessions/${state.sessionId}/shared-goal`, {
          method: "PATCH",
          body: JSON.stringify({ sharedGoal: text })
        });
        applyBundle(data);
        state.currentMemberIdx = nextPendingMember((m) => m.goalsComplete);
        if (state.currentMemberIdx < 0) state.currentMemberIdx = 0;
        state.screen = "handoff";
        state.draftGoal = emptyDraftGoal();
        render();
      } catch (err) {
        state.error = err.message;
        render();
      }
    });

    document.getElementById("gmHandoffGo")?.addEventListener("click", (e) => {
      const kind = e.currentTarget.getAttribute("data-kind");
      if (kind === "mid") {
        state.midDraft = { changeStrategies: [] };
        state.midStep = 1;
        state.screen = "mid";
      } else if (kind === "reflect") {
        state.reflectDraft = {};
        state.reflectStep = 1;
        state.screen = "reflect";
      } else {
        const m = currentMember();
        const whatGoals = (m?.whatGoals || []).length
          ? m.whatGoals
          : m?.whatGoalText
            ? [{ id: m.whatGoalId, text: m.whatGoalText }]
            : [];
        const howGoals = (m?.howGoals || []).length
          ? m.howGoals
          : m?.howGoalText
            ? [{ id: m.howGoalId, text: m.howGoalText }]
            : [];
        state.draftGoal = {
          ...emptyDraftGoal(),
          whatGoals,
          howGoals,
          whatGoalId: whatGoals[0]?.id || null,
          whatGoalText: whatGoals.map((g) => g.text).join(" · "),
          howGoalId: howGoals[0]?.id || null,
          howGoalText: howGoals.map((g) => g.text).join(" · ")
        };
        state.screen = "what";
      }
      render();
    });

    document.querySelectorAll("[data-what]").forEach((btn) => {
      btn.addEventListener("click", () => {
        clearFlash();
        const id = btn.getAttribute("data-what");
        const goal = roleGoalsForCurrentMember("WAS").find((g) => String(g.id) === String(id));
        if (!goal) return;
        toggleDraftGoal("what", goal);
        render();
      });
    });
    document.getElementById("gmFreeWhat")?.addEventListener("input", (e) => {
      state.draftGoal.whatGoalText = e.target.value;
      state.draftGoal.whatGoalId = null;
      state.draftGoal.whatGoals = e.target.value.trim()
        ? [{ id: null, text: e.target.value.trim() }]
        : [];
    });
    document.getElementById("gmWhatNext")?.addEventListener("click", () => {
      if (!(state.draftGoal.whatGoals || []).length && !state.draftGoal.whatGoalText.trim()) {
        state.error = "Bitte wähle mindestens ein Was-Ziel.";
        render();
        return;
      }
      state.screen = "how";
      render();
    });

    document.querySelectorAll("[data-how-id]").forEach((btn) => {
      btn.addEventListener("click", () => {
        clearFlash();
        const id = btn.getAttribute("data-how-id");
        const goal = roleGoalsForCurrentMember("WIE").find((g) => String(g.id) === String(id));
        if (!goal) return;
        toggleDraftGoal("how", goal);
        render();
      });
    });
    document.querySelectorAll("[data-how]").forEach((btn) => {
      btn.addEventListener("click", () => {
        clearFlash();
        const textVal = btn.getAttribute("data-how");
        toggleDraftGoal("how", { id: textVal, text: textVal });
        render();
      });
    });
    document.getElementById("gmCustomHow")?.addEventListener("click", () => {
      state.draftGoal.customHow = true;
      state.draftGoal.howGoalId = null;
      state.draftGoal.howGoalText = "";
      state.draftGoal.howGoals = [];
      render();
    });
    document.getElementById("gmHowInput")?.addEventListener("input", (e) => {
      state.draftGoal.howGoalText = e.target.value;
      state.draftGoal.howGoalId = null;
      state.draftGoal.howGoals = e.target.value.trim()
        ? [{ id: null, text: e.target.value.trim() }]
        : [];
    });
    document.getElementById("gmHowNext")?.addEventListener("click", () => {
      const how =
        document.getElementById("gmHowInput")?.value?.trim() || state.draftGoal.howGoalText;
      if (!(state.draftGoal.howGoals || []).length && !how) {
        state.error = "Bitte wähle mindestens ein Wie-Ziel.";
        render();
        return;
      }
      if (state.draftGoal.customHow && how) {
        state.draftGoal.howGoals = [{ id: null, text: how }];
        state.draftGoal.howGoalText = how;
      }
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
            whatGoals: state.draftGoal.whatGoals || [],
            howGoals: state.draftGoal.howGoals || [],
            whatGoalId: state.draftGoal.whatGoalId,
            whatGoalText: state.draftGoal.whatGoalText,
            selectedLevel: state.draftGoal.selectedLevel,
            howGoalId: state.draftGoal.howGoalId,
            howGoalText: state.draftGoal.howGoalText
          })
        });
        applyBundle(data);
        // clear personal draft before next person
        state.draftGoal = emptyDraftGoal();
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
      state.midDraft = { changeStrategies: [] };
      state.midStep = 1;
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
      state.reflectStep = 1;
      state.screen = "reflect-handoff";
      render();
    });

    document.getElementById("gmMidStep1Next")?.addEventListener("click", () => {
      state.midStep = 2;
      render();
    });

    const midFieldMap = {
      "data-mid-onTrack": "onTrack",
      "data-mid-progress": "progress",
      "data-mid-changeNeeded": "changeNeeded",
      "data-mid-changeFocus": "changeFocus"
    };
    Object.entries(midFieldMap).forEach(([attr, field]) => {
      document.querySelectorAll(`[${attr}]`).forEach((btn) => {
        btn.addEventListener("click", () => {
          clearFlash();
          state.midDraft[field] = btn.getAttribute(attr);
          if (field === "changeNeeded" && state.midDraft.changeNeeded === "Nein") {
            state.midDraft.changeFocus = null;
            state.midDraft.changeStrategies = [];
          }
          if (field === "onTrack") state.midStep = 3;
          else if (field === "progress") state.midStep = 4;
          render();
        });
      });
    });

    document.querySelectorAll("[data-mid-strategy]").forEach((btn) => {
      btn.addEventListener("click", () => {
        clearFlash();
        const val = btn.getAttribute("data-mid-strategy");
        const list = [...(state.midDraft.changeStrategies || [])];
        const idx = list.indexOf(val);
        if (idx >= 0) list.splice(idx, 1);
        else if (list.length < 3) list.push(val);
        else {
          state.error = "Höchstens 3 Strategien.";
          render();
          return;
        }
        state.midDraft.changeStrategies = list;
        render();
      });
    });

    document.getElementById("gmMidSave")?.addEventListener("click", async () => {
      clearFlash();
      try {
        const m = currentMember();
        if (!state.midDraft.onTrack || !state.midDraft.progress || !state.midDraft.changeNeeded) {
          state.error = "Bitte beantworte die kurzen Fragen.";
          render();
          return;
        }
        if (
          (state.midDraft.changeNeeded === "Ja" || state.midDraft.changeNeeded === "Vielleicht") &&
          !state.midDraft.changeFocus
        ) {
          state.error = "Bitte wähle kurz, was du ändern möchtest.";
          render();
          return;
        }
        const data = await api(`/api/student/group-sessions/${state.sessionId}/mid-check`, {
          method: "PUT",
          body: JSON.stringify({
            userId: m.userId,
            onTrack: state.midDraft.onTrack,
            progress: state.midDraft.progress,
            changeNeeded: state.midDraft.changeNeeded,
            changeFocus: state.midDraft.changeFocus || null,
            changeStrategies: state.midDraft.changeStrategies || [],
            note: (state.midDraft.changeStrategies || []).join(" · ") || null
          })
        });
        applyBundle(data);
        state.midDraft = { changeStrategies: [] };
        state.midStep = 1;
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

    document.getElementById("gmReflectStep1Next")?.addEventListener("click", () => {
      state.reflectStep = 2;
      render();
    });
    document.getElementById("gmReflectStep4Next")?.addEventListener("click", () => {
      state.reflectDraft.nextImprove =
        document.getElementById("gmNextImprove")?.value || state.reflectDraft.nextImprove || "";
      if (!state.reflectDraft.helped) {
        state.error = "Bitte wähle, was dir geholfen hat.";
        render();
        return;
      }
      state.reflectStep = 5;
      render();
    });

    const refFieldMap = {
      "data-ref-goalReached": "goalReached",
      "data-ref-evidence": "evidence",
      "data-ref-helped": "helped",
      "data-ref-continueNextSession": "continueNextSession"
    };
    Object.entries(refFieldMap).forEach(([attr, field]) => {
      document.querySelectorAll(`[${attr}]`).forEach((btn) => {
        btn.addEventListener("click", () => {
          clearFlash();
          state.reflectDraft[field] = btn.getAttribute(attr);
          if (field === "goalReached") state.reflectStep = 3;
          else if (field === "evidence") state.reflectStep = 4;
          render();
        });
      });
    });

    document.getElementById("gmReflectSave")?.addEventListener("click", async () => {
      clearFlash();
      try {
        const m = currentMember();
        state.reflectDraft.nextImprove =
          document.getElementById("gmNextImprove")?.value || state.reflectDraft.nextImprove || "";
        state.reflectDraft.explainedToGroup =
          document.getElementById("gmExplained")?.value || "";
        state.reflectDraft.learnedFromGroup =
          document.getElementById("gmLearned")?.value || "";
        if (
          !state.reflectDraft.goalReached ||
          !state.reflectDraft.evidence ||
          !state.reflectDraft.helped
        ) {
          state.error = "Bitte beantworte die wichtigsten Fragen.";
          render();
          return;
        }
        const data = await api(`/api/student/group-sessions/${state.sessionId}/reflection`, {
          method: "PUT",
          body: JSON.stringify({ userId: m.userId, ...state.reflectDraft })
        });
        applyBundle(data);
        state.reflectDraft = {};
        state.reflectStep = 1;
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
    const mems = members();
    const hasMembers = mems.length > 0;
    const hasRoles = mems.some((m) => (m.roles || []).length);
    const step = s.setupStep;
    if (!s.topicId) {
      state.screen = "pick-topic";
      return;
    }
    if (!hasMembers) {
      state.screen = "members";
      return;
    }
    // Gruppe schon eingeteilt → Rollen / weiter im Setup
    if (!hasRoles || step === "roles" || step === "members") {
      state.screen = "roles";
      return;
    }
    if (step === "shared_goal" || (settings().enableSharedGoal && !s.sharedGoal)) {
      state.screen = "shared";
      return;
    }
    if (step === "personal_goals" || !state.bundle?.progress?.goalsComplete) {
      state.currentMemberIdx = nextPendingMember((m) => m.goalsComplete);
      state.screen = state.currentMemberIdx >= 0 ? "handoff" : "overview";
      return;
    }
    state.screen = "overview";
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
      try {
        const full = await api(`/api/student/group-sessions/${existing.id}`);
        applyBundle(full);
        resumeScreenFromBundle();
        render();
        return;
      } catch (err) {
        // Kaputte/alte Session: löschen und neu starten
        try {
          await api(`/api/student/group-sessions/${existing.id}/delete`, { method: "POST" });
        } catch (_) {}
        state.bootstrap.activeSessions = (state.bootstrap.activeSessions || []).filter(
          (s) => String(s.id) !== String(existing.id)
        );
      }
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
      try {
        const t = await fetch(
          `/api/student/group-mode/topics?subject=${encodeURIComponent(subject)}`,
          { credentials: "same-origin" }
        );
        const topicData = await t.json();
        if (state.bundle) state.bundle.topics = topicData.topics || [];
      } catch (_) {}
      console.warn("group session reload:", loadErr);
    }
    state.screen = "pick-topic";
    if (data.resumed) resumeScreenFromBundle();
    else state.screen = data.session?.topicId ? "members" : "pick-topic";
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
