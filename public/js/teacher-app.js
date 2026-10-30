/**
 * Lehrer-Dashboard: Heute, Klasse, Schüler:innen, Werkzeuge.
 * Muster kommen von /api/teacher/regulation. Schreiben nur über vorhandene Wege.
 */
(function () {
  const state = {
    tab: "heute",
    me: null,
    classes: [],
    classId: null,
    levelCheckId: null,
    range: "unit",
    heuteMode: "spuren",
    klasseMode: "muster",
    view: null,
    studentId: null,
    query: "",
    loading: false,
    toast: "",
    explain: ""
  };

  const appEl = document.getElementById("app");
  const classSelect = document.getElementById("classSelect");

  function escapeHtml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  async function api(url, options = {}) {
    const res = await fetch(url, {
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      ...options
    });
    if (res.status === 401 || res.status === 403) {
      const data = await res.json().catch(() => ({}));
      if (res.status === 401 || data?.error === "Forbidden") {
        if (window.SolAuth?.goLogin) window.SolAuth.goLogin();
        else window.location.replace(`/login?loggedout=1&t=${Date.now()}`);
        throw new Error("Nicht angemeldet");
      }
    }
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.message || data.error || `HTTP ${res.status}`);
    }
    return res.json();
  }

  async function doLogout() {
    if (window.SolAuth?.logoutAndRedirect) {
      await window.SolAuth.logoutAndRedirect();
      return;
    }
    window.location.replace(`/logout?role=teacher&t=${Date.now()}`);
  }

  function tabFromPath(path) {
    if (path.includes("/werkzeuge") || path.includes("/lernbegleitung") || path.includes("/verlauf") || path.includes("/profil")) {
      return "werkzeuge";
    }
    if (path.includes("/schueler")) return "schueler";
    if (path.includes("/klasse")) return "klasse";
    return "heute";
  }

  function pathFor(tab) {
    if (tab === "klasse") return "/teacher/klasse";
    if (tab === "schueler") return "/teacher/schuelerinnen";
    if (tab === "werkzeuge") return "/teacher/werkzeuge";
    return "/teacher/heute";
  }

  function syncUrl(replace) {
    const params = new URLSearchParams();
    if (state.levelCheckId) params.set("einheit", state.levelCheckId);
    if (state.range === "week") params.set("zeit", "woche");
    if (state.tab === "schueler" && state.studentId) params.set("id", String(state.studentId));
    const query = params.toString();
    const url = query ? `${pathFor(state.tab)}?${query}` : pathFor(state.tab);
    if (location.pathname + location.search === url) return;
    const fn = replace ? "replaceState" : "pushState";
    history[fn]({ tab: state.tab }, "", url);
  }

  function markTabs() {
    document.querySelectorAll(".td-tabs a").forEach((link) => {
      const on = link.dataset.tab === state.tab;
      if (on) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
  }

  function fillClasses() {
    const list = state.classes || [];
    classSelect.innerHTML = list
      .map(
        (item) =>
          `<option value="${item.id}" ${Number(item.id) === Number(state.classId) ? "selected" : ""}>${escapeHtml(item.name)}</option>`
      )
      .join("");
    if (!list.length) classSelect.innerHTML = `<option value="">Keine Klasse</option>`;
  }

  function students() {
    return state.view?.students || [];
  }

  function filteredStudents() {
    const q = state.query.trim().toLowerCase();
    return students().filter((student) => !q || student.name.toLowerCase().includes(q));
  }

  function currentStudent() {
    return students().find((student) => Number(student.id) === Number(state.studentId)) || null;
  }

  function prognosisLabel(key) {
    if (key === "fits") return "passt";
    if (key === "high") return "zu hoch";
    if (key === "low") return "zu niedrig";
    return "noch nicht einschätzbar";
  }

  function levelChip(stand) {
    if (!stand?.tier || !stand.status) {
      return `<span class="td-lv td-lv--open">offen</span>`;
    }
    const tone = stand.tier === "rookie" ? "r" : stand.tier === "operator" ? "o" : "s";
    const mode = stand.status === "sicher" ? "fill" : "work";
    const stateLabel = stand.status === "sicher" ? "sicher" : "in Arbeit";
    return `<span class="td-lv td-lv--${tone} td-lv--${mode}">${escapeHtml(stand.short || "")} · ${escapeHtml(stand.tierLabel || "")} · ${stateLabel}</span>`;
  }

  function toolbar() {
    const view = state.view;
    const units = view?.levelChecks || [];
    const unitOptions = units
      .map(
        (unit) =>
          `<option value="${escapeHtml(unit.id)}" ${String(unit.id) === String(view?.levelCheck?.id) ? "selected" : ""}>${escapeHtml(unit.subject)} · ${escapeHtml(unit.name)}</option>`
      )
      .join("");
    return `
      <div class="td-tools">
        ${
          units.length
            ? `<label class="sr-only" for="unitSelect">Unterrichtseinheit</label>
               <select id="unitSelect" class="td-select" aria-label="Unterrichtseinheit">${unitOptions}</select>`
            : ""
        }
        <div class="td-seg" role="group" aria-label="Zeitraum">
          <button type="button" data-range="unit" aria-pressed="${state.range === "unit" ? "true" : "false"}">Ganze Einheit</button>
          <button type="button" data-range="week" aria-pressed="${state.range === "week" ? "true" : "false"}">Diese Woche</button>
        </div>
      </div>`;
  }

  function waitLabel(minutes) {
    if (minutes == null) return "";
    if (minutes < 1) return "gerade eben";
    return `seit ${minutes} min`;
  }

  function renderHeute() {
    const view = state.view;
    if (!view) return `<div class="td-empty"><strong>Lade den Rundgang…</strong></div>`;
    if (view.message && !view.levelCheck) {
      return `<div class="td-panel td-empty"><strong>${escapeHtml(view.message)}</strong></div>`;
    }
    const exam = view.levelCheck?.examDate
      ? `${escapeHtml(view.levelCheck.examLabel || "Arbeit")} ${escapeHtml(String(view.levelCheck.examDate).split("-").reverse().join("."))}`
      : "kein Termin hinterlegt";
    const head = `
      <div class="td-head">
        <div>
          <p class="td-kicker">${escapeHtml(view.class?.name || "")} · ${escapeHtml(view.levelCheck?.subject || "")} · ${escapeHtml(exam)}</p>
          <h1 class="td-title">Wer braucht mich?</h1>
        </div>
        ${toolbar()}
      </div>
      <div class="td-seg" role="group" aria-label="Ansicht">
        <button type="button" data-heute="spuren" aria-pressed="${state.heuteMode === "spuren" ? "true" : "false"}">Spuren</button>
        <button type="button" data-heute="themen" aria-pressed="${state.heuteMode === "themen" ? "true" : "false"}">Themen</button>
      </div>`;
    if (state.heuteMode === "themen") return `${toast()}${head}${renderTopics()}`;
    return `${toast()}${head}${renderLanes()}`;
  }

  function toast() {
    return state.toast ? `<p class="td-toast" role="status">${escapeHtml(state.toast)}</p>` : "";
  }

  function renderLanes() {
    const live = state.view?.live || { help: [], visit: [], noGoal: [], runningCount: 0, experts: [] };
    const help = (live.help || [])
      .map((item) => {
        const level = item.level ? ` · ${escapeHtml(item.level)}` : "";
        const action = item.takenOver
          ? `<button type="button" class="td-btn td-btn-ghost" data-coach="close_help" data-student="${item.studentId}" data-entry="${escapeHtml(item.entryId || "")}" data-goal="${escapeHtml(item.goalId || "")}">Erledigt</button>`
          : `<button type="button" class="td-btn td-btn-hot" data-coach="takeover" data-student="${item.studentId}" data-entry="${escapeHtml(item.entryId || "")}" data-goal="${escapeHtml(item.goalId || "")}">Bin unterwegs</button>
             <button type="button" class="td-btn td-btn-ghost" data-coach="close_help" data-student="${item.studentId}" data-entry="${escapeHtml(item.entryId || "")}" data-goal="${escapeHtml(item.goalId || "")}">Erledigt</button>`;
        return `
          <article class="td-person">
            <button type="button" class="td-person" data-open-student="${item.studentId}">
              <strong>${escapeHtml(item.name)}</strong>
              <p>${escapeHtml(item.topic || "Hilfe angefragt")}${level} · ${escapeHtml(waitLabel(item.waitMinutes))}</p>
              <p>${escapeHtml(item.concern || "")}</p>
            </button>
            <div class="td-actions">${action}</div>
          </article>`;
      })
      .join("");
    const visit = (live.visit || [])
      .map(
        (item) => `
        <button type="button" class="td-person" data-open-student="${item.studentId}">
          <strong>${escapeHtml(item.name)}</strong>
          <p>${(item.reasons || [])
            .map((reason) => `<span class="td-pill">${escapeHtml(reason.label)}</span>`)
            .join("")}</p>
        </button>`
      )
      .join("");
    const chips = (live.noGoal || [])
      .map(
        (item) =>
          `<button type="button" class="td-chip" data-open-student="${item.studentId}">${escapeHtml(item.name)}</button>`
      )
      .join("");
    const experts = (live.experts || [])
      .map(
        (item) =>
          `<button type="button" class="td-chip" data-open-student="${item.studentId}">${escapeHtml(item.name)} · ${escapeHtml(item.topic)}</button>`
      )
      .join("");
    const lesson = state.view?.lesson?.label
      ? `Stunde ${escapeHtml(state.view.lesson.label)}`
      : "Heute keine laufende Stunde für dieses Fach im Plan";
    return `
      <p class="td-muted">${lesson}. Aktualisiert mit dem Laden der Seite.</p>
      <div class="td-lanes">
        <section class="td-lane td-lane--help" aria-label="Hilfe angefragt">
          <header><h2>Hilfe angefragt</h2><span class="td-count">${live.help.length}</span></header>
          ${help || `<p class="td-muted">Gerade niemand.</p>`}
        </section>
        <section class="td-lane td-lane--visit" aria-label="Mal vorbeischauen">
          <header><h2>Mal vorbeischauen</h2><span class="td-count">${live.visit.length}</span></header>
          ${visit || `<p class="td-muted">Kein Live-Signal und kein Muster „Hilfe bleibt aus“.</p>`}
        </section>
        <section class="td-lane td-lane--goal" aria-label="Noch kein Tagesziel">
          <header><h2>Noch kein Tagesziel</h2><span class="td-count">${live.noGoal.length}</span></header>
          <div class="td-chips">${chips || `<p class="td-muted">Niemand in dieser Spur.</p>`}</div>
          <p class="td-muted">Eine Erinnerung an alle gibt es in der App nicht.</p>
        </section>
        <section class="td-lane td-lane--run" aria-label="Läuft">
          <header><h2>Läuft</h2><span class="td-count">${live.runningCount}</span></header>
          <p>Expert:innen heute</p>
          <div class="td-chips">${experts || `<p class="td-muted">Niemand mit Street Legend sicher am heutigen Unterthema.</p>`}</div>
        </section>
      </div>`;
  }

  function renderTopics() {
    const topics = state.view?.topics || [];
    if (!topics.length) return `<p class="td-muted">Keine Unterthemen.</p>`;
    return `<div class="td-topic-grid">${topics
      .map((topic) => {
        const chips = (topic.people || [])
          .map(
            (person) =>
              `<button type="button" class="td-chip" data-open-student="${person.id}">${escapeHtml(person.name)} ${levelChip(person)}</button>`
          )
          .join("");
        const tips = (topic.tips || []).map((tip) => `<p class="td-tip">${escapeHtml(tip)}</p>`).join("");
        return `
          <article class="td-panel td-topic">
            <h3>${escapeHtml(topic.text)}</h3>
            <div class="td-chips">${chips || `<p class="td-muted">Heute niemand an diesem Unterthema.</p>`}</div>
            ${tips}
          </article>`;
      })
      .join("")}</div>`;
  }

  function renderKlasse() {
    const view = state.view;
    if (!view?.levelCheck) {
      return `<div class="td-panel td-empty"><strong>${escapeHtml(view?.message || "Keine Einheit.")}</strong></div>`;
    }
    const days = view.levelCheck.daysToExam;
    const when =
      days == null
        ? "kein Termin"
        : days === 0
          ? "heute"
          : days > 0
            ? `in ${days} Tagen`
            : "Termin liegt zurück";
    return `
      ${toast()}
      <div class="td-head">
        <div>
          <p class="td-kicker">${escapeHtml(view.class?.name || "")} · ${escapeHtml(view.levelCheck.subject)} · ${escapeHtml(view.levelCheck.examLabel || "Arbeit")} ${escapeHtml(when)}</p>
          <h1 class="td-title">Wie lernt die Klasse?</h1>
        </div>
        ${toolbar()}
      </div>
      <div class="td-seg" role="group" aria-label="Klassenansicht">
        <button type="button" data-klasse="muster" aria-pressed="${state.klasseMode === "muster" ? "true" : "false"}">Für die nächste Stunde</button>
        <button type="button" data-klasse="stand" aria-pressed="${state.klasseMode === "stand" ? "true" : "false"}">Stand</button>
      </div>
      ${state.klasseMode === "stand" ? renderStand() : renderMuster()}`;
  }

  function nameButtons(list) {
    return (list || [])
      .map(
        (person) =>
          `<button type="button" class="td-chip" data-open-student="${person.id}">${escapeHtml(person.name)}</button>`
      )
      .join("");
  }

  function renderMuster() {
    const view = state.view;
    const cards = (view.patterns || [])
      .map(
        (pattern) => `
        <article class="td-panel td-card">
          <p class="td-tag">Gespräch lohnt sich · ${pattern.count}</p>
          <h3>${escapeHtml(pattern.title)}</h3>
          <p class="td-fact">${escapeHtml(pattern.fact)}</p>
          <p class="td-idea">${escapeHtml(pattern.idea)}</p>
          <div class="td-chips">${nameButtons(pattern.names)}</div>
        </article>`
      )
      .join("");
    const buckets = view.buckets || {};
    const total = students().length || 1;
    const seg = (key, cls, label) => {
      const n = buckets[key] || 0;
      if (!n) return "";
      return `<span class="${cls}" style="width:${Math.max(8, Math.round((n / total) * 100))}%">${n} ${label}</span>`;
    };
    const quotes = view.quotes || {};
    const achieved =
      quotes.achievedKnown > 0
        ? `${quotes.achievedYes} von ${quotes.achievedKnown}`
        : "keine Angabe";
    const reflected =
      quotes.entries > 0 ? `${quotes.reflected} von ${quotes.entries}` : "keine Angabe";
    const groups = (view.helpGroups || [])
      .map(
        (group) => `
        <button type="button" class="td-row" data-show-names="${escapeHtml(group.id)}">
          <span>${escapeHtml(group.label)}</span>
          <strong>${group.count}</strong>
        </button>
        <div class="td-names" id="names-${escapeHtml(group.id)}" hidden>${nameButtons(group.names)}</div>`
      )
      .join("");
    const gaps = (view.topicGaps || [])
      .map((gap) => {
        const width = students().length ? Math.round((gap.sureCount / students().length) * 100) : 0;
        const passed = gap.passedKnown
          ? `${gap.sureCount} sicher gemeldet · ${gap.passedCount} bestanden${gap.diff != null ? ` · Differenz ${gap.diff}` : ""}`
          : `${gap.sureCount} sicher gemeldet · bestanden: kein Ergebnis nur für dieses Unterthema`;
        return `
          <article class="td-gap ${gap.highlight ? "is-hot" : ""}">
            <h3>${escapeHtml(gap.text)}</h3>
            <div class="td-bar-row"><span>sicher</span><div class="td-bar"><i style="width:${width}%"></i></div><span>${gap.sureCount}</span></div>
            ${
              gap.passedKnown
                ? `<div class="td-bar-row"><span>bestanden</span><div class="td-bar"><i class="is-pass" style="width:${students().length ? Math.round((gap.passedCount / students().length) * 100) : 0}%"></i></div><span>${gap.passedCount}</span></div>`
                : ""
            }
            <p>${escapeHtml(passed)}</p>
            <div class="td-chips">${nameButtons(gap.sureNames)}</div>
          </article>`;
      })
      .join("");
    return `
      <section class="td-card-grid" style="margin-top:12px">${cards || `<p class="td-muted">Im gewählten Zeitraum kein Muster mit genug Belegen.</p>`}</section>
      <div class="td-grid-2">
        <section class="td-panel">
          <p class="td-kicker">Selbsteinschätzung und Levelcheck</p>
          <div class="td-matrix">
            <span></span>
            <span class="td-axis">Levelcheck bestanden</span>
            <span class="td-axis">nicht bestanden</span>
            <span class="td-axis">meldet sicher</span>
            <button type="button" class="td-cell" data-explain="matrix"><strong>gut eingeschätzt</strong><span>meldet sicher · Levelcheck bestanden</span></button>
            <button type="button" class="td-cell" data-explain="matrix"><strong>überschätzt</strong><span>meldet sicher · Levelcheck nicht bestanden</span></button>
            <span class="td-axis">meldet unsicher</span>
            <button type="button" class="td-cell" data-explain="matrix"><strong>unterschätzt</strong><span>meldet unsicher · Levelcheck bestanden</span></button>
            <button type="button" class="td-cell" data-explain="matrix"><strong>braucht Hilfe</strong><span>meldet unsicher · Levelcheck nicht bestanden</span></button>
          </div>
          <p class="td-note">${escapeHtml(state.explain || "Die vier Felder bleiben leer: ein Levelcheck-Ergebnis pro Unterthema und Level ist nicht gespeichert. Antippen erklärt das.")}</p>
        </section>
        <section class="td-panel">
          <p class="td-kicker">Wo klafft es?</p>
          <div class="td-bars">${gaps}</div>
          <p class="td-muted">Eine Lücke ab 5 wird nur markiert, wenn beide Zahlen wirklich vorliegen.</p>
        </section>
        <section class="td-panel">
          <p class="td-kicker">Hilfe holen</p>
          ${groups}
          <p class="td-help-note">Mehrfachzuordnung möglich. Eine Person kann in mehreren Gruppen stehen${view.multiHelpCount ? ` (${view.multiHelpCount} tun das).` : "."}</p>
        </section>
        <section class="td-panel">
          <p class="td-kicker">Ziele setzen</p>
          <div class="td-bucket">
            ${seg("fits", "td-b-fit", "passt")}
            ${seg("high", "td-b-high", "zu hoch")}
            ${seg("low", "td-b-low", "zu niedrig")}
            ${seg("unknown", "td-b-unk", "offen")}
          </div>
          <div class="td-quotes">
            <div><span class="td-muted">Tagesziele erfasst</span><strong>${quotes.entries}</strong><span class="td-muted">ohne Prozent, Fehltage sind nicht bekannt</span></div>
            <div><span class="td-muted">geschafft</span><strong>${escapeHtml(achieved)}</strong><span class="td-muted">nur Abschlüsse mit klarer Antwort</span></div>
            <div><span class="td-muted">reflektiert</span><strong>${escapeHtml(reflected)}</strong><span class="td-muted">von den Einträgen</span></div>
          </div>
        </section>
      </div>`;
  }

  function renderStand() {
    const cards = students()
      .map((student) => {
        const chips = (student.stands || [])
          .map(
            (stand) =>
              `<span class="td-stand-item"><span class="td-muted">${escapeHtml(stand.text)}</span> ${levelChip(stand)}</span>`
          )
          .join("");
        const grade = student.targetGradeLabel ? `Zielnote ${escapeHtml(student.targetGradeLabel)}` : "keine Zielnote";
        return `
          <article class="td-panel td-stand-card">
            <h3><button type="button" class="td-btn td-btn-ghost" data-open-student="${student.id}">${escapeHtml(student.name)}</button><span>${grade}</span></h3>
            <div class="td-stand-grid">${chips}</div>
          </article>`;
      })
      .join("");
    return `<div class="td-stand-list" style="margin-top:12px">${cards}</div>
      <p class="td-muted">Offen ist gestrichelt. In Arbeit hat einen farbigen Rand. Sicher ist gefüllt. Daneben steht immer das Level im Wort.</p>`;
  }

  function renderListe() {
    const list = filteredStudents();
    const rows = list
      .map((student) => {
        const n = student.hints?.length || 0;
        return `
          <button type="button" class="td-row" data-open-student="${student.id}">
            <span>${escapeHtml(student.name)}</span>
            <span class="td-badge ${n ? "" : "is-none"}">${n ? `${n} Hinweise` : "kein Hinweis"}</span>
          </button>`;
      })
      .join("");
    return `
      <div class="td-head">
        <div>
          <p class="td-kicker">Hinweise, keine Rangliste</p>
          <h1 class="td-title">Schüler:innen</h1>
        </div>
        <input id="studentSearch" class="td-search" type="search" placeholder="Name suchen" value="${escapeHtml(state.query)}" aria-label="Suchen" />
      </div>
      <div class="td-list">${rows || `<p class="td-muted">Niemand passt zur Suche.</p>`}</div>`;
  }

  function renderProfil(student) {
    const list = filteredStudents();
    const index = list.findIndex((item) => Number(item.id) === Number(student.id));
    const exam = state.view?.levelCheck?.examLabel
      ? `${state.view.levelCheck.examLabel}${state.view.levelCheck.examDate ? ` ${String(state.view.levelCheck.examDate).split("-").reverse().join(".")}` : ""}`
      : "kein Termin";
    const hints = (student.hints || [])
      .map(
        (hint) => `
        <article class="td-hint ${hint.kind === "strength" ? "is-strength" : ""}">
          <p class="td-tag">${hint.kind === "strength" ? "Stärke" : "Gespräch lohnt sich"}</p>
          <h3>${escapeHtml(hint.title)}</h3>
          <p class="td-fact">${escapeHtml(hint.fact)}</p>
          <p class="td-idea"><strong>Impuls:</strong> ${escapeHtml(hint.prompt)}</p>
          <p class="td-idea">${escapeHtml(hint.idea)}</p>
        </article>`
      )
      .join("");
    const neutral = (student.neutral || [])
      .map((item) => `<p class="td-note">${escapeHtml(item.text)}</p>`)
      .join("");
    const path = student.path
      ? `Zielpfad zu Note ${escapeHtml(student.targetGradeLabel || "")}: Rookie ${Math.round(student.path.rookie * 100)} %, Operator ${Math.round(student.path.operator * 100)} %, Street Legend ${Math.round(student.path.street_legend * 100)} %.`
      : "Kein Zielpfad, weil keine Zielnote gespeichert ist.";
    const sicher = student.sicher || {};
    const week = (student.week || [])
      .map((day) => {
        const label = ["", "Mo", "Di", "Mi", "Do", "Fr"][new Date(`${day.date}T12:00:00`).getDay()] || day.date;
        const mark = day.reflected ? "R" : day.planned ? "P" : "·";
        const cls = day.reflected ? "is-reflect" : day.planned ? "is-plan" : "";
        return `<span class="td-day ${cls}">${label} ${mark}</span>`;
      })
      .join("");
    const rows = (student.stands || [])
      .map(
        (stand) => `
        <tr>
          <td data-label="Unterthema">${escapeHtml(stand.text)}</td>
          <td data-label="selbst">${levelChip(stand)}</td>
          <td data-label="Levelcheck">nicht zuordenbar</td>
          <td data-label="Einordnung">noch nicht einschätzbar</td>
        </tr>`
      )
      .join("");
    const stats = student.helpStats || {};
    const groups = (student.helpGroups || []).join(", ") || "keinem Muster zugeordnet";
    return `
      ${toast()}
      <div class="td-profile-top">
        <div>
          <p class="td-kicker">${escapeHtml(state.view?.class?.name || "")} · ${escapeHtml(state.view?.levelCheck?.subject || "")}</p>
          <h1 class="td-title">${escapeHtml(student.name)}</h1>
          <p class="td-lead">Zielnote ${escapeHtml(student.targetGradeLabel || "keine")} · ${escapeHtml(exam)} · ${student.levelcheckCount} bewertete Levelchecks</p>
        </div>
        <div class="td-arrows">
          <button type="button" class="td-btn td-btn-ghost" data-step="-1" ${index <= 0 ? "disabled" : ""}>Zurück</button>
          <button type="button" class="td-btn td-btn-ghost" data-step="1" ${index < 0 || index >= list.length - 1 ? "disabled" : ""}>Weiter</button>
          <button type="button" class="td-btn td-btn-go" data-print>Bilanzgespräch vorbereiten</button>
        </div>
      </div>
      <div id="printSheet">
        ${hints || `<p class="td-muted">Im gewählten Zeitraum kein Hinweis mit genug Belegen.</p>`}
        ${neutral}
        ${student.note ? `<p class="td-print-only"><strong>Notiz:</strong> ${escapeHtml(student.note)}</p>` : ""}
      </div>
      <details class="td-fold">
        <summary><span class="td-kicker">Ziele setzen</span><strong>${escapeHtml(prognosisLabel(student.prognosis))}${student.standGradeLabel ? ` · Stand Note ${escapeHtml(student.standGradeLabel)}` : ""}</strong></summary>
        <div class="td-fold-body">
          <p>${escapeHtml(path)}</p>
          <p>Sichere Level: Rookie ${sicher.rookie || 0}, Operator ${sicher.operator || 0}, Street Legend ${sicher.street_legend || 0} von ${student.totalGoals || 0} Unterthemen. ${escapeHtml(student.prognosisReason || "")}.</p>
        </div>
      </details>
      <details class="td-fold">
        <summary><span class="td-kicker">Selbsteinschätzung</span><strong>Levelcheck pro Unterthema fehlt</strong></summary>
        <div class="td-fold-body">
          <table class="td-mini">
            <thead><tr><th>Unterthema</th><th>selbst</th><th>Levelcheck</th><th>Einordnung</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </details>
      <details class="td-fold">
        <summary><span class="td-kicker">Hilfe holen</span><strong>${escapeHtml(groups)}</strong></summary>
        <div class="td-fold-body">
          <p>Hilfe-Signale im Zeitraum: ${stats.helpCount ?? "keine Angabe"}. Coach-Nachrichten: ${stats.coachCount ?? "keine Angabe"}. Gespeicherte Taktik: ${stats.tacticCount ?? "keine Angabe"}. Längster messbarer Stillstand: ${stats.stallMinutes == null ? "nicht messbar" : `${stats.stallMinutes} Minuten`}.</p>
        </div>
      </details>
      <details class="td-fold">
        <summary><span class="td-kicker">Arbeitsweise</span><strong>P = Tagesziel, R = Reflexion</strong></summary>
        <div class="td-fold-body">
          <div class="td-week">${week}</div>
          <p class="td-muted">Leere Tage sind nicht als 0 gewertet. Es ist nur sichtbar, wo ein Eintrag vorliegt.</p>
        </div>
      </details>
      <section class="td-panel" style="margin-top:12px">
        <p class="td-kicker">Notiz fürs Bilanzgespräch · nur für Lehrkräfte</p>
        <textarea class="td-area" id="teacherNote" maxlength="800">${escapeHtml(student.note || "")}</textarea>
        <div class="td-actions">
          <button type="button" class="td-btn td-btn-go" data-save-note="${student.id}">Notiz speichern</button>
          <button type="button" class="td-btn td-btn-ghost" data-back-list>Zur Liste</button>
        </div>
      </section>`;
  }

  function renderSchueler() {
    const student = currentStudent();
    if (student) return renderProfil(student);
    return renderListe();
  }

  function renderWerkzeuge() {
    const tools = [
      ["/teacher/timetable", "Stundenplan", "Stunden der Klasse pflegen"],
      ["/teacher/termine", "Termine", "Klassenarbeiten, Tests, Levelchecks"],
      ["/teacher/levelchecks", "Levelchecks", "Nachweise und Bewertungen"],
      ["/teacher/levelplan", "Levelplan", "Unterthemen und Kataloge"],
      ["/teacher/gruppenmodus", "Gruppenmodus", "Rollen und Gruppen"],
      ["/teacher/materialschrank", "Materialschrank", "Material für die Klasse"],
      ["/teacher/week", "Wochenübersicht", "Aktivität über die Woche, ohne Wertung"]
    ];
    return `
      <p class="td-kicker">Lernbegleitung</p>
      <h1 class="td-title">Werkzeuge</h1>
      <p class="td-lead">Dieselben Funktionen wie bisher. Die Klassenwahl sitzt oben.</p>
      <div class="td-tool-grid">
        ${tools
          .map(
            ([href, title, desc]) => `
            <a class="td-tool" href="${href}">
              <p class="td-kicker">Werkzeug</p>
              <h3>${title}</h3>
              <p>${desc}</p>
              <span>Öffnen →</span>
            </a>`
          )
          .join("")}
        <button type="button" class="td-tool" id="addAccountBtn">
          <p class="td-kicker">Session</p>
          <h3>Weiteres Konto</h3>
          <p>Zum Beispiel die Verwaltung in einem neuen Tab. Diese Anmeldung bleibt.</p>
          <span>Neuer Tab →</span>
        </button>
      </div>`;
  }

  function render() {
    markTabs();
    if (state.loading && !state.view && state.tab !== "werkzeuge") {
      appEl.innerHTML = `<div class="td-panel td-empty"><strong>Lade die Klasse…</strong></div>`;
      return;
    }
    if (state.tab === "heute") appEl.innerHTML = renderHeute();
    else if (state.tab === "klasse") appEl.innerHTML = renderKlasse();
    else if (state.tab === "schueler") appEl.innerHTML = renderSchueler();
    else appEl.innerHTML = renderWerkzeuge();
  }

  async function loadView() {
    if (!state.classId) {
      state.view = { message: "Keine Klasse zugewiesen.", students: [], levelChecks: [] };
      render();
      return;
    }
    state.loading = true;
    render();
    try {
      const params = new URLSearchParams({
        classId: String(state.classId),
        range: state.range
      });
      if (state.levelCheckId) params.set("levelCheckId", state.levelCheckId);
      const data = await api(`/api/teacher/regulation?${params.toString()}`);
      state.view = data;
      state.levelCheckId = data.levelCheck?.id || state.levelCheckId;
      if (state.studentId && !students().some((student) => Number(student.id) === Number(state.studentId))) {
        state.studentId = null;
      }
    } catch (err) {
      state.view = { message: err.message || "Laden fehlgeschlagen", students: [] };
    } finally {
      state.loading = false;
      render();
    }
  }

  function openStudent(id) {
    state.studentId = Number(id);
    state.tab = "schueler";
    syncUrl(false);
    render();
  }

  async function coach(action, button) {
    const studentId = Number(button.getAttribute("data-student"));
    const res = await api("/api/teacher/coaching", {
      method: "POST",
      body: JSON.stringify({
        action,
        studentId,
        date: state.view?.date,
        logEntryId: button.getAttribute("data-entry") || null,
        goalId: button.getAttribute("data-goal") || null
      })
    });
    state.toast = res.message || "Gespeichert.";
    await loadView();
  }

  document.querySelectorAll(".td-tabs a").forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      state.tab = link.dataset.tab;
      if (state.tab !== "schueler") state.studentId = null;
      syncUrl(false);
      render();
    });
  });

  classSelect.addEventListener("change", () => {
    state.classId = Number(classSelect.value) || null;
    state.levelCheckId = null;
    state.studentId = null;
    loadView().catch((err) => {
      state.toast = err.message || "Fehler";
      render();
    });
  });

  document.getElementById("teacherLogoutBtn")?.addEventListener("click", () => {
    doLogout().catch(() => {});
  });

  appEl.addEventListener("click", (event) => {
    const range = event.target.closest("[data-range]");
    if (range) {
      state.range = range.getAttribute("data-range");
      syncUrl(true);
      loadView().catch(() => {});
      return;
    }
    const heute = event.target.closest("[data-heute]");
    if (heute) {
      state.heuteMode = heute.getAttribute("data-heute");
      render();
      return;
    }
    const klasse = event.target.closest("[data-klasse]");
    if (klasse) {
      state.klasseMode = klasse.getAttribute("data-klasse");
      render();
      return;
    }
    const open = event.target.closest("[data-open-student]");
    if (open) {
      openStudent(open.getAttribute("data-open-student"));
      return;
    }
    const step = event.target.closest("[data-step]");
    if (step) {
      const list = filteredStudents();
      const index = list.findIndex((item) => Number(item.id) === Number(state.studentId));
      const next = list[index + Number(step.getAttribute("data-step"))];
      if (next) openStudent(next.id);
      return;
    }
    const back = event.target.closest("[data-back-list]");
    if (back) {
      state.studentId = null;
      syncUrl(true);
      render();
      return;
    }
    const names = event.target.closest("[data-show-names]");
    if (names) {
      const box = document.getElementById(`names-${names.getAttribute("data-show-names")}`);
      if (box) box.hidden = !box.hidden;
      return;
    }
    const explain = event.target.closest("[data-explain]");
    if (explain) {
      state.explain =
        "Noch nicht einschätzbar. Dafür müsste ein Levelcheck-Ergebnis zu genau diesem Unterthema und Level gespeichert sein, passend zum Zeitpunkt der Selbsteinschätzung. Das gibt es so nicht. Deshalb stehen hier keine Namen.";
      render();
      return;
    }
    const coachBtn = event.target.closest("[data-coach]");
    if (coachBtn) {
      event.preventDefault();
      coach(coachBtn.getAttribute("data-coach"), coachBtn).catch((err) => {
        state.toast = err.message || "Das konnte nicht gespeichert werden.";
        render();
      });
      return;
    }
    if (event.target.closest("[data-print]")) {
      document.querySelectorAll("#printSheet details, .td-fold").forEach((el) => {
        el.open = true;
      });
      window.print();
      return;
    }
    if (event.target.closest("[data-save-note]")) {
      const note = document.getElementById("teacherNote")?.value || "";
      api("/api/teacher/feedback", {
        method: "POST",
        body: JSON.stringify({
          studentId: Number(state.studentId),
          date: state.view?.date,
          chips: [],
          note: "",
          conversationHeld: false,
          teacherPrivateNote: note
        })
      })
        .then(() => {
          const student = currentStudent();
          if (student) student.note = note;
          state.toast = "Notiz gespeichert. Sie ist nur für Lehrkräfte sichtbar.";
          render();
        })
        .catch((err) => {
          state.toast = err.message || "Notiz nicht gespeichert.";
          render();
        });
      return;
    }
    if (event.target.closest("#addAccountBtn")) {
      window.SolAuth?.addAccount?.();
    }
  });

  appEl.addEventListener("change", (event) => {
    if (event.target.id === "unitSelect") {
      state.levelCheckId = event.target.value || null;
      syncUrl(true);
      loadView().catch(() => {});
    }
  });

  appEl.addEventListener("input", (event) => {
    if (event.target.id === "studentSearch") {
      state.query = event.target.value || "";
      const list = document.querySelector(".td-list");
      if (!list) return;
      const caret = event.target.selectionStart;
      render();
      const again = document.getElementById("studentSearch");
      if (again) {
        again.focus();
        if (caret != null) again.setSelectionRange(caret, caret);
      }
    }
  });

  window.addEventListener("popstate", () => {
    const params = new URLSearchParams(location.search);
    state.tab = tabFromPath(location.pathname);
    state.range = params.get("zeit") === "woche" ? "week" : "unit";
    state.levelCheckId = params.get("einheit") || state.levelCheckId;
    state.studentId = Number(params.get("id")) || null;
    render();
  });

  async function boot() {
    let session = null;
    if (window.SolAuth?.enforceShell) {
      session = await window.SolAuth.enforceShell(["teacher"]);
      if (!session) {
        if (!window.__authFetchRedirecting) location.replace(`/login?loggedout=1&t=${Date.now()}`);
        return;
      }
    } else {
      session = await api("/api/auth/session");
      if (!session.authenticated || session.role !== "teacher") {
        location.replace(session.redirectTo || `/login?loggedout=1&t=${Date.now()}`);
        return;
      }
    }
    if (window.SolAuth) window.SolAuth.set("teacher");
    state.me = await api("/api/teacher/me");
    state.classes = state.me.classes || [];
    const params = new URLSearchParams(location.search);
    state.tab = tabFromPath(location.pathname);
    state.range = params.get("zeit") === "woche" ? "week" : "unit";
    state.levelCheckId = params.get("einheit") || null;
    state.studentId = Number(params.get("id")) || null;
    state.classId = state.classes[0]?.id || null;
    fillClasses();
    markTabs();
    await loadView();
  }

  boot().catch((err) => {
    console.error(err);
    appEl.innerHTML = `<div class="td-panel td-empty"><strong>Laden fehlgeschlagen</strong><p>Bitte neu anmelden.</p></div>`;
  });
})();
