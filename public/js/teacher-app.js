/**
 * Lehrer-App Shell – Heute | Klassen | Lernbegleitung | Verlauf
 */
(function () {
  const state = {
    tab: "heute",
    me: null,
    classId: null,
    date: todayIso(),
    today: null,
    hq: null,
    levelCheckId: null,
    hqFilterHelp: false,
    selectedStudentId: null,
    expandedStations: {},
    toast: null,
    classes: [],
    overview: null,
    history: null,
    studentDetail: null,
    detailTab: "heute",
    feedbackDraft: null,
    loading: false
  };

  const appEl = document.getElementById("app");
  const greetingEl = document.getElementById("greeting");
  const sublineEl = document.getElementById("subline");
  const classSelect = document.getElementById("classSelect");
  const dateInput = document.getElementById("dateInput");
  const sheet = document.getElementById("sheet");
  const sheetBody = document.getElementById("sheetBody");
  const sheetBackdrop = document.getElementById("sheetBackdrop");
  const adminSwitchEl = document.getElementById("adminSwitch");

  function isAdminUser(me = state.me) {
    return me?.canAdmin === true || me?.role === "admin";
  }

  function updateAdminSwitch() {
    if (!adminSwitchEl) return;
    adminSwitchEl.classList.toggle("hidden", !isAdminUser());
  }

  function todayIso() {
    return new Date().toISOString().slice(0, 10);
  }

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
        window.location.href = "/login";
        throw new Error("Nicht angemeldet");
      }
    }
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.message || data.error || `HTTP ${res.status}`);
    }
    return res.json();
  }

  function openSheet(html) {
    sheetBody.innerHTML = html;
    sheet.classList.add("open");
    sheetBackdrop.classList.add("open");
  }

  function closeSheet() {
    sheet.classList.remove("open");
    sheetBackdrop.classList.remove("open");
    sheetBody.innerHTML = "";
    state.feedbackDraft = null;
  }

  function setTab(tab) {
    state.tab = tab;
    document.querySelectorAll(".teacher-bottomnav button").forEach((btn) => {
      const on = btn.dataset.tab === tab;
      btn.classList.toggle("active", on);
      if (on) btn.setAttribute("aria-current", "page");
      else btn.removeAttribute("aria-current");
    });
    const pathMap = {
      heute: "/teacher/heute",
      klassen: "/teacher/klassen",
      lernbegleitung: "/teacher/lernbegleitung",
      verlauf: "/teacher/verlauf"
    };
    if (pathMap[tab] && location.pathname !== pathMap[tab] && !location.pathname.startsWith("/teacher/schueler")) {
      history.replaceState({ tab }, "", pathMap[tab]);
    }
    render();
    loadTabData();
  }

  function fillClassSelect(classes) {
    const list = Array.isArray(classes) ? classes : [];
    classSelect.innerHTML = list
      .map(
        (c) =>
          `<option value="${c.id}" ${Number(c.id) === Number(state.classId) ? "selected" : ""}>${escapeHtml(c.name)}</option>`
      )
      .join("");
    if (!list.length) {
      classSelect.innerHTML = `<option value="">Keine Klasse</option>`;
    }
  }

  function studentStatusLabel(s) {
    if (s.needsAttention) return s.topInsight || "Braucht Aufmerksamkeit";
    if (s.positive) return s.topInsight || "Positives Signal";
    if (s.reflected) return "Plan + Reflexion";
    if (s.planned) return "Plan vorhanden";
    return "Noch kein Plan";
  }

  function renderStudentTiles(students, gridClass = "tile-grid--students") {
    if (!students?.length) {
      return `<div class="empty"><strong>Keine Schüler:innen</strong><p>In dieser Klasse sind keine aktiven Schüler:innen hinterlegt.</p></div>`;
    }
    return `<div class="tile-grid ${gridClass}">${students
      .map((s) => {
        const cls = [
          "tile",
          "tile--student",
          s.needsAttention ? "needs-attention" : "",
          s.positive && !s.needsAttention ? "positive-signal" : ""
        ]
          .filter(Boolean)
          .join(" ");
        return `
      <button type="button" class="${cls}" data-open-student="${s.id}" aria-label="${escapeHtml(s.name)}">
        <h3 class="tile-name">${escapeHtml(s.name)}</h3>
        <p class="tile-status">${escapeHtml(studentStatusLabel(s))}</p>
        <div class="status-dots" aria-hidden="true">
          <span class="status-dot ${s.planned ? "on" : ""}" title="Plan"></span>
          <span class="status-dot ${s.reflected ? "reflect" : ""}" title="Reflexion"></span>
          <span class="status-dot ${s.needsAttention ? "attn" : ""}" title="Hinweis"></span>
        </div>
      </button>`;
      })
      .join("")}</div>`;
  }

  // ---------------------------------------------------------
  // Heute = Classroom HQ / Lernstadt
  // ---------------------------------------------------------
  function hqStorageKey() {
    return `sol-teacher-hq-lc-${state.classId || "x"}`;
  }

  function showToast(message) {
    state.toast = message;
    render();
    window.clearTimeout(showToast._t);
    showToast._t = window.setTimeout(() => {
      state.toast = null;
      if (state.tab === "heute") render();
    }, 2600);
  }

  function formatGermanDateUi(iso) {
    if (!iso) return null;
    const s = String(iso).slice(0, 10);
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? `${m[3]}.${m[2]}.${m[1]}` : s;
  }

  function getHqCity() {
    return state.hq?.lernstadt || state.hq?.matrix || null;
  }

  function findHqStudent(id) {
    const city = getHqCity();
    if (!city || id == null) return null;
    return (city.students || []).find((s) => Number(s.id) === Number(id)) || null;
  }

  function renderHqPicker(data) {
    const list = data.levelChecks || [];
    if (!list.length) return "";
    const bySubject = {};
    for (const lc of list) (bySubject[lc.subject] ||= []).push(lc);
    const options = Object.entries(bySubject)
      .map(
        ([subject, items]) => `<optgroup label="${escapeHtml(subject)}">${items
          .map((lc) => {
            const cpBit = lc.checkpointDateLabel
              ? ` · ${escapeHtml(lc.checkpointTypeLabel || "Check")} ${escapeHtml(lc.checkpointDateLabel)}`
              : "";
            const sel = String(lc.id) === String(data.levelCheck?.id) ? "selected" : "";
            return `<option value="${escapeHtml(lc.id)}" ${sel}>${escapeHtml(lc.name)}${cpBit}</option>`;
          })
          .join("")}</optgroup>`
      )
      .join("");
    return `
      <div class="hq-picker">
        <label for="lcSelect">Unterrichtseinheit / Klassenarbeit (Levelcheck)</label>
        <select id="lcSelect" aria-label="Levelcheck wählen">${options}</select>
      </div>`;
  }

  function renderHqStats(city, data) {
    const t = city?.stats || {};
    const lc = data.levelCheck;
    const dateLabel = formatGermanDateUi(data.date) || data.date;
    return `
      <section class="hq-head" aria-label="Klassen-Überblick">
        <div class="hq-head-text">
          <p class="tile-kicker">Classroom HQ · Lernstadt</p>
          <h2>${escapeHtml(data.className || "Klasse")}${lc ? ` · ${escapeHtml(lc.name)}` : ""}</h2>
          <p class="muted">${escapeHtml(dateLabel)}${lc?.subject ? ` · ${escapeHtml(lc.subject)}` : ""} · Position = aktuelles Tagesziel</p>
        </div>
        <div class="hq-stats" aria-label="Kennzahlen">
          <span class="${t.withTagesziel ? "on" : ""}"><strong>${t.withTagesziel ?? 0}</strong> mit Tagesziel</span>
          <span class="${t.openHelp ? "hot" : ""}"><strong>${t.openHelp ?? 0}</strong> offene Hilfe</span>
          <span class="${t.reachedGoals ? "ok" : ""}"><strong>${t.reachedGoals ?? 0}</strong> Tagesziel erreicht</span>
        </div>
      </section>`;
  }

  function renderHqFilter() {
    return `
      <div class="hq-toolbar">
        <label class="hq-filter">
          <input type="checkbox" id="hqHelpOnly" ${state.hqFilterHelp ? "checked" : ""} />
          <span>Nur Hilfe anzeigen</span>
        </label>
        <p class="hq-legend-inline" aria-hidden="true">
          <span>◐ Ziel</span><span>! Hilfe</span><span>◆ Begleitung</span><span>✓ Erreicht</span><span>○ Kein Ziel</span>
        </p>
      </div>`;
  }

  function renderAvatar(student, opts = {}) {
    const selected = Number(state.selectedStudentId) === Number(student.id);
    const helpCls = student.helpActive ? "is-help" : "";
    const statusCls = `st-${escapeHtml(student.statusId || "no_goal")}`;
    const wait =
      student.helpActive && student.waitLabel
        ? `<span class="hq-av-wait">${escapeHtml(student.waitLabel)}</span>`
        : "";
    const img = student.avatarUrl
      ? `<img src="${escapeHtml(student.avatarUrl)}" alt="" loading="lazy" decoding="async" />`
      : `<span class="hq-av-initials" aria-hidden="true">${escapeHtml(student.initials || "?")}</span>`;
    return `
      <button type="button"
        class="hq-avatar ${helpCls} ${statusCls} ${selected ? "selected" : ""}"
        data-select-student="${student.id}"
        aria-pressed="${selected ? "true" : "false"}"
        aria-label="${escapeHtml(student.name)} · ${escapeHtml(student.statusLabel || "")}${opts.station ? ` · ${escapeHtml(opts.station)}` : ""}">
        <span class="hq-av-face">${img}</span>
        <span class="hq-av-meta">
          <span class="hq-av-name">${escapeHtml(student.name)}</span>
          <span class="hq-av-status"><span aria-hidden="true">${escapeHtml(student.statusIcon || "○")}</span> ${escapeHtml(student.statusShort || "")}</span>
          ${wait}
        </span>
      </button>`;
  }

  function renderStation(station) {
    let list = station.students || [];
    if (state.hqFilterHelp) list = list.filter((s) => s.helpActive);
    if (!list.length && state.hqFilterHelp) return "";
    const expanded = Boolean(state.expandedStations[station.id]);
    const limit = station.previewLimit || 4;
    const overflow = !expanded && list.length > limit;
    const shown = overflow ? list.slice(0, limit) : list;
    const rest = overflow ? list.length - limit : 0;
    const helpBadge =
      station.helpCount > 0
        ? `<span class="hq-station-help">${station.helpCount} Hilfe</span>`
        : "";
    return `
      <article class="hq-station ${station.kind === "unassigned" ? "is-unassigned" : ""}" data-station="${escapeHtml(station.id)}">
        <header class="hq-station-head">
          <div>
            <h3>${escapeHtml(station.name)}</h3>
            <p class="muted">${list.length} Person${list.length === 1 ? "" : "en"}</p>
          </div>
          ${helpBadge}
        </header>
        <div class="hq-station-people">
          ${
            shown.length
              ? shown.map((s) => renderAvatar(s, { station: station.name })).join("")
              : `<p class="hq-station-empty">Hier ist gerade niemand.</p>`
          }
          ${
            rest
              ? `<button type="button" class="hq-more" data-expand-station="${escapeHtml(station.id)}">+${rest} weitere</button>`
              : ""
          }
          ${
            expanded && list.length > limit
              ? `<button type="button" class="hq-more" data-collapse-station="${escapeHtml(station.id)}">Weniger zeigen</button>`
              : ""
          }
        </div>
      </article>`;
  }

  function renderGroupHelp(city) {
    const groups = city?.groupHelp || [];
    if (!groups.length) return "";
    return `
      <div class="hq-group-hint" role="note">
        <strong>Kurze Gruppenerklärung möglich</strong>
        ${groups
          .map(
            (g) =>
              `<span>${g.count}× Hilfe bei „${escapeHtml(g.stationName)}“ (${escapeHtml(g.studentNames.slice(0, 4).join(", "))}${g.studentNames.length > 4 ? "…" : ""})</span>`
          )
          .join("")}
      </div>`;
  }

  function renderLernstadtCity(data) {
    const city = data.lernstadt || data.matrix;
    if (!city) return "";
    const stations = (city.stations || []).filter((st) => {
      if (!state.hqFilterHelp) return true;
      return (st.students || []).some((s) => s.helpActive);
    });
    if (!stations.length) {
      return `<div class="empty"><strong>Keine Treffer</strong><p>${state.hqFilterHelp ? "Aktuell keine offenen Hilfe-Anfragen." : "Noch keine Stationen."}</p></div>`;
    }
    return `
      <div class="hq-city" role="region" aria-label="Lernstadt">
        <div class="hq-city-sky" aria-hidden="true"></div>
        ${renderGroupHelp(city)}
        <div class="hq-stations">${stations.map(renderStation).join("")}</div>
      </div>`;
  }

  function renderPersonDetailPanel(student) {
    if (!student) {
      return `
        <aside class="hq-detail" aria-label="Personendetail">
          <div class="hq-detail-empty">
            <strong>Person wählen</strong>
            <p>Tippe auf einen Avatar in der Lernstadt, um Tagesziel, Hilfe und Levelcheck zu sehen.</p>
          </div>
        </aside>`;
    }

    const lc = student.levelcheck || {};
    const levelcheckLine =
      lc.empty || (lc.percent == null && !lc.date)
        ? "Noch kein Levelcheck"
        : [
            lc.percent != null ? `${lc.percent} %` : null,
            lc.date ? formatGermanDateUi(lc.date) : null,
            lc.levelLabel || null
          ]
            .filter(Boolean)
            .join(" · ");

    const zielnote = student.zielnote
      ? `Zielnote ${escapeHtml(student.zielnote)}`
      : "Keine Zielnote hinterlegt";

    const helpBlock = student.help
      ? `
        <div class="hq-detail-help">
          <p><span aria-hidden="true">!</span> <strong>Hilfe angefragt</strong>${student.help.waitLabel ? ` · wartet ${escapeHtml(student.help.waitLabel)}` : ""}</p>
          <p class="hq-concern">${escapeHtml(student.help.concern || "Anliegen nicht näher angegeben")}</p>
          ${student.help.takenOver ? `<p class="muted">Begleitung übernommen${student.help.takenOverByName ? ` von ${escapeHtml(student.help.takenOverByName)}` : ""}</p>` : ""}
        </div>`
      : "";

    const actions = [];
    if (student.helpActive && student.statusId !== "taken_over") {
      actions.push(
        `<button type="button" class="btn btn-primary" data-coach-action="takeover">Begleitung übernehmen</button>`
      );
    }
    if (student.helpActive) {
      actions.push(
        `<button type="button" class="btn btn-ghost" data-coach-action="close_help">Hilfe abschließen</button>`
      );
    }
    actions.push(
      `<button type="button" class="btn btn-ghost" data-coach-action="save_note">Begleitnotiz</button>`
    );
    actions.push(
      `<button type="button" class="btn btn-ghost" data-coach-action="save_next_step">Nächsten Schritt</button>`
    );

    return `
      <aside class="hq-detail" aria-label="Detail ${escapeHtml(student.name)}">
        <button type="button" class="hq-detail-close" data-clear-student aria-label="Detail schließen">×</button>
        <div class="hq-detail-hero">
          <div class="hq-detail-av">
            ${
              student.avatarUrl
                ? `<img src="${escapeHtml(student.avatarUrl)}" alt="" />`
                : `<span>${escapeHtml(student.initials || "?")}</span>`
            }
          </div>
          <div>
            <h2>${escapeHtml(student.name)}</h2>
            <p class="hq-status-pill st-${escapeHtml(student.statusId)}">
              <span aria-hidden="true">${escapeHtml(student.statusIcon)}</span>
              ${escapeHtml(student.statusLabel)}
            </p>
          </div>
        </div>
        <dl class="hq-dl">
          <div><dt>Tagesziel</dt><dd>${escapeHtml(student.tagesziel || "Kein Tagesziel")}</dd></div>
          <div><dt>Unterthema</dt><dd>${escapeHtml(student.unterthema || "Noch nicht zugeordnet")}</dd></div>
          <div><dt>Aktuelles Level</dt><dd>${escapeHtml(student.currentLevelLabel || "–")}</dd></div>
          <div><dt>Geplantes Level</dt><dd>${escapeHtml(student.plannedLevelLabel || "–")}</dd></div>
          <div><dt>Letzter Levelcheck</dt><dd>${escapeHtml(levelcheckLine)}</dd></div>
          <div><dt>Persönliche Zielnote</dt><dd>${zielnote}</dd></div>
          <div><dt>Begleitnotiz</dt><dd>${escapeHtml(student.coaching?.note || "–")}</dd></div>
          <div><dt>Nächster Lernschritt</dt><dd>${escapeHtml(student.nextStepSuggestion || student.coaching?.nextStep || "–")}</dd></div>
        </dl>
        ${helpBlock}
        <div class="hq-actions">${actions.join("")}</div>
        <button type="button" class="btn btn-ghost hq-full-link" data-open-student="${student.id}">Vollständiges Coaching-Detail</button>
      </aside>`;
  }

  function renderToast() {
    if (!state.toast) return "";
    return `<div class="hq-toast" role="status">${escapeHtml(state.toast)}</div>`;
  }

  function renderHeute() {
    const data = state.hq;
    if (state.loading && !data) {
      return `<div class="empty"><strong>Lade Lernstadt…</strong><p>Klassenstand und Tagesziele werden geladen.</p></div>`;
    }
    if (!state.classId || !state.classes.length) {
      return `<div class="empty">
        <strong>Keine Klasse zugewiesen.</strong>
        <p>Zuweisung erfolgt in der Administration. Admins wechseln oben rechts.</p>
        ${isAdminUser() ? `<a class="btn btn-primary" href="/admin#class">Zur Administration</a>` : ""}
      </div>`;
    }
    if (!data) {
      return `<div class="empty"><strong>Keine Daten</strong><p>Lernstadt konnte nicht geladen werden.</p></div>`;
    }
    if (!data.levelCheck) {
      return `
        ${renderToast()}
        ${renderHqPicker(data)}
        <div class="empty">
          <strong>${escapeHtml(data.message || "Kein Levelcheck gewählt.")}</strong>
          <p>Levelchecks mit Unterthemen legst du unter Lernbegleitung → Levelchecks an.</p>
          <a class="btn btn-primary" href="/teacher/levelchecks">Levelchecks öffnen</a>
        </div>`;
    }

    const selected = findHqStudent(state.selectedStudentId);
    return `
      ${renderToast()}
      ${renderHqPicker(data)}
      ${renderHqStats(getHqCity(), data)}
      ${renderHqFilter()}
      <div class="hq-layout ${selected ? "has-selection" : ""}">
        ${renderLernstadtCity(data)}
        ${renderPersonDetailPanel(selected)}
      </div>
      <p class="hq-footnote muted">${escapeHtml(getHqCity()?.legend?.note || "")}</p>`;
  }

  function renderKlassen() {
    const cards = state.overview?.classes || [];
    if (state.loading && !cards.length) {
      return `<div class="empty"><strong>Lade Klassen…</strong><p>Überblick wird vorbereitet.</p></div>`;
    }
    if (!cards.length) {
      return `<div class="empty">
        <strong>Keine zugewiesenen Klassen</strong>
        <p>Sobald dir Klassen zugewiesen sind, siehst du hier den Schnellüberblick.</p>
        ${isAdminUser() ? `<a class="btn btn-primary" href="/admin#class">Klassen zuweisen</a>` : ""}
      </div>`;
    }

    const activeId = Number(state.classId) || cards[0]?.classId;
    const active = cards.find((c) => Number(c.classId) === Number(activeId)) || cards[0];
    const classTiles = `
      <div class="section-head">
        <h2 class="section-title">Deine Klassen</h2>
        <span class="section-count">${cards.length} Klasse${cards.length === 1 ? "" : "n"}</span>
      </div>
      <div class="tile-grid tile-grid--students">${cards
        .map((c) => {
          const activeCls = Number(c.classId) === Number(active?.classId) ? "active" : "";
          const hot = Number(c.needsAttentionCount) > 0;
          return `
        <button type="button" class="tile tile--class ${activeCls}" data-goto-class="${c.classId}" aria-pressed="${activeCls ? "true" : "false"}">
          ${hot ? `<span class="class-badge">${c.needsAttentionCount} Hinweis</span>` : ""}
          <h3>${escapeHtml(c.className)}</h3>
          <div class="tile-metrics">
            <span class="metric"><strong>${c.studentCount}</strong> SuS</span>
            <span class="metric"><strong>${c.plannedCount}</strong> Plan</span>
            <span class="metric ${hot ? "hot" : ""}"><strong>${c.needsAttentionCount}</strong> braucht dich</span>
          </div>
        </button>`;
        })
        .join("")}</div>`;

    const attnStudents = (active?.students || []).filter((s) => s.needsAttention).length;
    return `
      ${classTiles}
      <div class="section-head">
        <h2 class="section-title">${escapeHtml(active?.className || "Schüler:innen")}</h2>
        <span class="section-count ${attnStudents ? "hot" : ""}">${attnStudents ? `${attnStudents} mit Hinweis` : "Tippen für Detail"}</span>
      </div>
      ${renderStudentTiles(active?.students || [])}`;
  }

  function renderLernbegleitung() {
    const groups = [
      {
        title: "Überblick",
        tools: [
          { href: "/teacher/dashboard", title: "Klassenübersicht", desc: "Tagesübersicht mit Logbuch-Hinweisen", accent: "cyan", cta: "Öffnen" },
          { href: "/teacher/week", title: "Wochenübersicht", desc: "Aktivität der Klasse über die Woche", accent: "violet", cta: "Woche ansehen" }
        ]
      },
      {
        title: "Planung",
        tools: [
          { href: "/teacher/timetable", title: "Stundenplan", desc: "Stundenplan der Klasse pflegen", accent: "orange", cta: "Bearbeiten" },
          { href: "/teacher/termine", title: "Termine", desc: "Termine für die Klasse", accent: "amber", cta: "Termine öffnen" },
          { href: "/teacher/levelchecks", title: "Levelchecks", desc: "Nachweise und Checkpoints planen", accent: "green", cta: "Checks öffnen" },
          { href: "/teacher/levelplan", title: "Levelplan", desc: "Ziele und Kataloge", accent: "green", cta: "Levelplan" }
        ]
      },
      {
        title: "Unterricht",
        tools: [
          { href: "/teacher/gruppenmodus", title: "Gruppenmodus", desc: "Rollen und Gruppensettings", accent: "violet", cta: "Starten" },
          { href: "/teacher/materialschrank", title: "Materialschrank", desc: "Materialien für Schüler:innen", accent: "cyan", cta: "Materialien" }
        ]
      }
    ];
    return `
      ${groups
        .map(
          (g) => `
        <div class="section-head">
          <h2 class="section-title">${escapeHtml(g.title)}</h2>
        </div>
        <div class="tile-grid tile-grid--tools">${g.tools
          .map(
            (t) => `
          <a class="tile tile--tool accent-${escapeHtml(t.accent)}" href="${t.href}">
            <p class="tile-kicker">Werkzeug</p>
            <h3>${escapeHtml(t.title)}</h3>
            <p>${escapeHtml(t.desc)}</p>
            <span class="tile-cta">${escapeHtml(t.cta)} →</span>
          </a>`
          )
          .join("")}</div>`
        )
        .join("")}
      <div class="section-head">
        <h2 class="section-title">Konto</h2>
      </div>
      <div class="tile-grid tile-grid--tools">
        ${
          isAdminUser()
            ? `<a class="tile tile--tool tile--admin accent-violet" href="/admin#class">
                <span class="tile-admin-badge">Admin</span>
                <p class="tile-kicker">Verwaltung</p>
                <h3>Administration</h3>
                <p>Klassen, Schüler, XP, Lehrerverwaltung</p>
                <span class="tile-cta">Zur Admin-Oberfläche →</span>
              </a>`
            : ""
        }
        <button type="button" class="tile tile--tool tile--danger" id="logoutBtn">
          <p class="tile-kicker">Session</p>
          <h3>Abmelden</h3>
          <p>Sicher beenden – auf dem nächsten Gerät neu anmelden</p>
          <span class="tile-cta">Abmelden →</span>
        </button>
      </div>`;
  }

  function renderVerlauf() {
    const data = state.history;
    if (state.loading && !data) {
      return `<div class="empty"><strong>Lade Verlauf…</strong><p>Wochenaktivität wird geladen.</p></div>`;
    }
    if (!data?.students?.length) {
      return `<div class="empty">
        <strong>Kein Verlauf</strong>
        <p>Für diese Klasse liegen noch keine beobachtbaren Wochen-Daten vor.</p>
      </div>`;
    }

    const days = [];
    const end = new Date(`${data.end}T12:00:00`);
    for (let i = data.days - 1; i >= 0; i--) {
      const d = new Date(end);
      d.setDate(end.getDate() - i);
      if (d.getDay() === 0 || d.getDay() === 6) continue;
      days.push(d.toISOString().slice(0, 10));
    }

    return `
      <div class="section-head">
        <h2 class="section-title">Wochenansicht</h2>
        <span class="section-count">ohne Ranking</span>
      </div>
      <div class="legend-bar" aria-hidden="true">
        <span><i class="legend-swatch on"></i> P = Plan</span>
        <span><i class="legend-swatch reflect"></i> R = Reflexion</span>
        <span><i class="legend-swatch"></i> · = leer</span>
        <span>Notizen nur für Lehrkräfte</span>
      </div>
      <div class="tile-grid tile-grid--history">${data.students
        .map((s) => {
          const pills = days
            .map((day) => {
              const cell = s.days?.[day];
              if (!cell) return `<span class="day-pill" title="${day}">·</span>`;
              const cls = cell.reflected ? "reflect" : cell.planned ? "on" : "";
              const mark = cell.reflected ? "R" : cell.planned ? "P" : "·";
              return `<span class="day-pill ${cls}" title="${day}">${mark}</span>`;
            })
            .join("");
          const noteCount = (s.notes || []).filter((n) => n.conversationHeld || n.privateNote).length;
          return `
            <button type="button" class="tile tile--history tile--student" data-open-student="${s.id}" aria-label="${escapeHtml(s.name)} Detail">
              <h3 class="tile-name">${escapeHtml(s.name)}</h3>
              <div class="day-row">${pills}</div>
              ${noteCount ? `<span class="tile-hint">${noteCount} Gesprächsnotiz${noteCount === 1 ? "" : "en"}</span>` : `<span class="tile-hint">Tippen für Detail</span>`}
            </button>`;
        })
        .join("")}</div>`;
  }

  function renderStudentDetail() {
    const d = state.studentDetail;
    if (!d) return `<div class="empty">Schüler wird geladen…</div>`;
    const tabs = ["heute", "verlauf", "feedback"];
    const tabBar = `<div class="tabs">${tabs
      .map(
        (t) =>
          `<button type="button" data-detail-tab="${t}" class="${state.detailTab === t ? "active" : ""}">${
            t === "heute" ? "Heute" : t === "verlauf" ? "Verlauf" : "Feedback"
          }</button>`
      )
      .join("")}</div>`;

    let body = "";
    if (state.detailTab === "heute") {
      if (!d.today?.length) body = `<div class="empty">Kein Plan für diesen Tag.</div>`;
      else {
        body = `<div class="detail-stack">${d.today
          .map(
            (e) => `
          <div class="detail-block insight-card">
            <h4>${escapeHtml(e.subject)}${e.timeslot ? ` · ${escapeHtml(e.timeslot)}` : ""}</h4>
            <p><strong>Ziel:</strong> ${escapeHtml(e.goal || "–")}</p>
            <p class="muted">Sicherheit vorher: ${e.confidenceBefore ?? "–"}</p>
            ${
              e.check
                ? `<p>Check: Spur ${escapeHtml(e.check.onTrack)} · Verstehen ${escapeHtml(e.check.understands)} · Fortschritt ${escapeHtml(e.check.progress)}</p>`
                : `<p class="muted">Noch kein Zwischencheck</p>`
            }
            ${
              e.reflection
                ? `<p>Reflexion: Ziel ${escapeHtml(e.reflection.goalAchieved)} · danach ${e.reflection.confidenceAfter ?? "–"}</p>`
                : `<p class="muted">Noch keine Reflexion</p>`
            }
          </div>`
          )
          .join("")}</div>`;
      }
    } else if (state.detailTab === "verlauf") {
      body = !d.history?.length
        ? `<div class="empty">Kein Verlauf.</div>`
        : `<div class="tile-grid tile-grid--insights">${d.history
            .map(
              (h) => `
          <div class="tile tile--insight" style="min-height:96px;cursor:default">
            <strong>${escapeHtml(String(h.date).slice(0, 10))} · ${escapeHtml(h.subject)}</strong>
            <p class="tile-obs" style="-webkit-line-clamp:3">Ziel: ${escapeHtml(h.goal || "–")}</p>
            <span class="tile-hint">Erreicht: ${escapeHtml(h.goalAchieved || "–")} · ${h.confidenceBefore ?? "–"} → ${h.confidenceAfter ?? "–"}</span>
          </div>`
            )
            .join("")}</div>`;
    } else {
      body = `
        <div class="btn-row" style="margin-bottom:12px">
          <button type="button" class="btn btn-primary" data-feedback="${d.student.id}" data-name="${escapeHtml(d.student.name)}">Neue Rückmeldung</button>
        </div>
        ${
          !d.feedback?.length
            ? `<div class="empty">Noch keine Rückmeldungen.</div>`
            : `<div class="tile-grid tile-grid--insights">${d.feedback
                .map((f) => {
                  const chipLabels = Object.fromEntries((d.feedbackChips || []).map((c) => [c.id, c.label]));
                  const chips = (f.chips || []).map((id) => chipLabels[id] || id).join(", ");
                  return `
                  <div class="tile tile--insight" style="min-height:96px;cursor:default">
                    <strong>${escapeHtml(String(f.date).slice(0, 10))}${f.teacherName ? ` · ${escapeHtml(f.teacherName)}` : ""}</strong>
                    ${chips ? `<p class="tile-obs">${escapeHtml(chips)}</p>` : ""}
                    ${f.note ? `<span class="tile-hint">${escapeHtml(f.note)}</span>` : ""}
                    ${f.conversationHeld ? `<span class="tile-hint">Gespräch geführt${f.teacherPrivateNote ? `: ${escapeHtml(f.teacherPrivateNote)}` : ""}</span>` : ""}
                  </div>`;
                })
                .join("")}</div>`
        }`;
    }

    return `
      <div class="btn-row" style="margin-bottom:12px">
        <button type="button" class="btn btn-ghost" id="backFromStudent">← Zurück</button>
        <button type="button" class="btn btn-primary" data-feedback="${d.student.id}" data-name="${escapeHtml(d.student.name)}">Rückmeldung</button>
      </div>
      <div class="detail-hero">
        <h2>${escapeHtml(d.student.name)}</h2>
        <p class="muted" style="margin:0">${escapeHtml(d.student.className || "")} · Coaching-Detail</p>
      </div>
      ${tabBar}
      ${body}`;
  }

  function render() {
    const name = state.me?.name || "";
    if (state.studentDetail && location.pathname.startsWith("/teacher/schueler")) {
      greetingEl.textContent = state.studentDetail.student?.name || "Schülerdetail";
      sublineEl.textContent = "Heute · Verlauf · Feedback";
      document.getElementById("toolbar").classList.add("hidden");
      appEl.innerHTML = renderStudentDetail();
      return;
    }

    document.getElementById("toolbar").classList.remove("hidden");
    if (state.tab === "heute") {
      greetingEl.textContent = name ? `Hallo ${name}` : "Heute";
      sublineEl.textContent = "Classroom HQ · Lernstadt – wer arbeitet woran, wer braucht Begleitung?";
      appEl.innerHTML = renderHeute();
    } else if (state.tab === "klassen") {
      greetingEl.textContent = "Klassen";
      sublineEl.textContent = "Schnellüberblick über zugewiesene Klassen";
      appEl.innerHTML = renderKlassen();
    } else if (state.tab === "lernbegleitung") {
      greetingEl.textContent = "Lernbegleitung";
      sublineEl.textContent = "Werkzeuge für Planung, Überblick und Unterricht";
      appEl.innerHTML = renderLernbegleitung();
    } else {
      greetingEl.textContent = "Verlauf";
      sublineEl.textContent = "Beobachtbare Aktivität – ohne Ranking oder Scores";
      appEl.innerHTML = renderVerlauf();
    }
  }

  function openFeedbackSheet(studentId, studentName) {
    const chips = state.me?.feedbackChips || state.studentDetail?.feedbackChips || [];
    state.feedbackDraft = {
      studentId: Number(studentId),
      studentName,
      chips: new Set(),
      note: "",
      conversationHeld: false,
      teacherPrivateNote: ""
    };
    openSheet(`
      <h2 id="sheetTitle" style="margin:0 0 4px">Rückmeldung</h2>
      <p class="muted" style="margin:0 0 10px">${escapeHtml(studentName)}</p>
      <div class="section-title">Chips</div>
      <div class="chip-grid" id="chipGrid">
        ${chips
          .map(
            (c) =>
              `<button type="button" class="chip" data-chip="${escapeHtml(c.id)}">${escapeHtml(c.label)}</button>`
          )
          .join("")}
      </div>
      <div class="field">
        <label for="fbNote">Rückmeldung an Schüler:in</label>
        <textarea id="fbNote" placeholder="Kurz, konkret, beobachtbar…"></textarea>
      </div>
      <div class="check-row">
        <input type="checkbox" id="fbTalk" />
        <label for="fbTalk">Gespräch geführt (nur für Lehrkräfte sichtbar)</label>
      </div>
      <div class="field" style="margin-top:10px">
        <label for="fbPrivate">Interne Gesprächsnotiz</label>
        <textarea id="fbPrivate" placeholder="Optional, nicht für Schüler sichtbar"></textarea>
      </div>
      <div class="btn-row" style="margin-top:8px">
        <button type="button" class="btn btn-ghost" id="fbCancel">Abbrechen</button>
        <button type="button" class="btn btn-primary" id="fbSave">Speichern</button>
      </div>
    `);
  }

  async function saveFeedback() {
    const draft = state.feedbackDraft;
    if (!draft) return;
    const note = document.getElementById("fbNote")?.value || "";
    const teacherPrivateNote = document.getElementById("fbPrivate")?.value || "";
    const conversationHeld = Boolean(document.getElementById("fbTalk")?.checked);
    await api("/api/teacher/feedback", {
      method: "POST",
      body: JSON.stringify({
        studentId: draft.studentId,
        date: state.date,
        chips: [...draft.chips],
        note,
        conversationHeld,
        teacherPrivateNote
      })
    });
    closeSheet();
    if (state.studentDetail?.student?.id === draft.studentId) {
      await openStudent(draft.studentId);
    } else {
      await loadToday();
    }
  }

  async function openStudent(studentId) {
    history.pushState({ studentId }, "", `/teacher/schueler?id=${studentId}`);
    state.detailTab = "heute";
    state.studentDetail = null;
    render();
    const data = await api(
      `/api/teacher/student/${studentId}?date=${encodeURIComponent(state.date)}`
    );
    state.studentDetail = data;
    render();
  }

  async function loadHq() {
    if (!state.classId) {
      state.hq = null;
      return;
    }
    if (!state.levelCheckId) {
      try {
        state.levelCheckId = localStorage.getItem(hqStorageKey()) || null;
      } catch (_) {
        state.levelCheckId = null;
      }
    }
    const params = new URLSearchParams({
      classId: String(state.classId),
      date: state.date
    });
    if (state.levelCheckId) params.set("levelCheckId", state.levelCheckId);
    const data = await api(`/api/teacher/levelcheck-matrix?${params.toString()}`);
    state.hq = data;
    state.levelCheckId = data.levelCheck?.id || null;
    if (state.levelCheckId) {
      try {
        localStorage.setItem(hqStorageKey(), state.levelCheckId);
      } catch (_) {
        /* ignore */
      }
    }
    if (state.selectedStudentId && !findHqStudent(state.selectedStudentId)) {
      state.selectedStudentId = null;
    }
  }

  async function loadToday() {
    if (!state.classId) {
      state.today = { message: "Keine Klasse zugewiesen.", stats: {}, insights: [] };
      state.hq = null;
      render();
      return;
    }
    state.loading = true;
    render();
    try {
      const todayReq = api(
        `/api/teacher/today?classId=${encodeURIComponent(state.classId)}&date=${encodeURIComponent(state.date)}`
      ).catch((err) => {
        console.warn("Heute-Insights nicht geladen:", err);
        return null;
      });
      try {
        await loadHq();
      } catch (err) {
        console.error("Lernstadt nicht geladen:", err);
        state.hq = {
          levelChecks: [],
          levelCheck: null,
          message: err?.message || "Lernstadt konnte nicht geladen werden."
        };
      }
      const today = await todayReq;
      if (today) {
        state.today = today;
        if (today.classId) state.classId = today.classId;
        fillClassSelect(today.classes || state.classes);
      }
    } finally {
      state.loading = false;
      render();
    }
  }

  async function runCoachAction(action) {
    const student = findHqStudent(state.selectedStudentId);
    if (!student) return;

    if (action === "save_note") {
      openSheet(`
        <h2 id="sheetTitle" style="margin:0 0 8px">Kurze Begleitnotiz</h2>
        <p class="muted" style="margin:0 0 10px">${escapeHtml(student.name)}</p>
        <div class="field">
          <label for="coachNote">Notiz (nur Lehrkräfte)</label>
          <textarea id="coachNote" maxlength="800" placeholder="Kurz und beobachtbar…">${escapeHtml(student.coaching?.note || "")}</textarea>
        </div>
        <div class="btn-row" style="margin-top:8px">
          <button type="button" class="btn btn-ghost" id="coachCancel">Abbrechen</button>
          <button type="button" class="btn btn-primary" id="coachSaveNote">Speichern</button>
        </div>
      `);
      return;
    }
    if (action === "save_next_step") {
      openSheet(`
        <h2 id="sheetTitle" style="margin:0 0 8px">Nächsten Lernschritt vereinbaren</h2>
        <p class="muted" style="margin:0 0 10px">${escapeHtml(student.name)}</p>
        <div class="field">
          <label for="coachNext">Nächster Schritt</label>
          <textarea id="coachNext" maxlength="500" placeholder="z. B. Operator-Aufgaben zu …">${escapeHtml(student.coaching?.nextStep || student.nextStepSuggestion || "")}</textarea>
        </div>
        <div class="btn-row" style="margin-top:8px">
          <button type="button" class="btn btn-ghost" id="coachCancel">Abbrechen</button>
          <button type="button" class="btn btn-primary" id="coachSaveNext">Speichern</button>
        </div>
      `);
      return;
    }

    const body = {
      action,
      studentId: student.id,
      date: state.date,
      logEntryId: student.logEntryId,
      goalId: student.goalId
    };
    const res = await api("/api/teacher/coaching", {
      method: "POST",
      body: JSON.stringify(body)
    });
    showToast(res.message || "Gespeichert.");
    await loadHq();
    render();
  }

  async function loadOverview() {
    state.loading = true;
    render();
    try {
      state.overview = await api(`/api/teacher/class-overview?date=${encodeURIComponent(state.date)}`);
    } finally {
      state.loading = false;
      render();
    }
  }

  async function loadHistory() {
    if (!state.classId) {
      state.history = { students: [] };
      render();
      return;
    }
    state.loading = true;
    render();
    try {
      state.history = await api(
        `/api/teacher/history?classId=${encodeURIComponent(state.classId)}&date=${encodeURIComponent(state.date)}`
      );
    } finally {
      state.loading = false;
      render();
    }
  }

  async function loadTabData() {
    if (state.studentDetail && location.pathname.startsWith("/teacher/schueler")) return;
    if (state.tab === "heute") await loadToday();
    else if (state.tab === "klassen") await loadOverview();
    else if (state.tab === "verlauf") await loadHistory();
    else render();
  }

  appEl.addEventListener("click", async (ev) => {
    const selectBtn = ev.target.closest("[data-select-student]");
    if (selectBtn) {
      state.selectedStudentId = Number(selectBtn.getAttribute("data-select-student"));
      render();
      return;
    }
    if (ev.target.closest("[data-clear-student]")) {
      state.selectedStudentId = null;
      render();
      return;
    }
    const expand = ev.target.closest("[data-expand-station]");
    if (expand) {
      state.expandedStations[expand.getAttribute("data-expand-station")] = true;
      render();
      return;
    }
    const collapse = ev.target.closest("[data-collapse-station]");
    if (collapse) {
      delete state.expandedStations[collapse.getAttribute("data-collapse-station")];
      render();
      return;
    }
    const coach = ev.target.closest("[data-coach-action]");
    if (coach) {
      runCoachAction(coach.getAttribute("data-coach-action")).catch((err) =>
        alert(err.message || "Fehler")
      );
      return;
    }
    const t = ev.target.closest("[data-open-student]");
    if (t) {
      openStudent(t.getAttribute("data-open-student"));
      return;
    }
    const fb = ev.target.closest("[data-feedback]");
    if (fb) {
      openFeedbackSheet(fb.getAttribute("data-feedback"), fb.getAttribute("data-name") || "");
      return;
    }
    const gc = ev.target.closest("[data-goto-class]");
    if (gc) {
      state.classId = Number(gc.getAttribute("data-goto-class"));
      state.levelCheckId = null;
      state.selectedStudentId = null;
      fillClassSelect(state.classes);
      if (classSelect) classSelect.value = String(state.classId);
      if (state.tab === "klassen") {
        render();
        return;
      }
      setTab("heute");
      return;
    }
    if (ev.target.closest("#logoutBtn")) {
      await fetch("/api/logout", { method: "POST", credentials: "same-origin" });
      if (window.SolAuth) window.SolAuth.clear();
      location.href = "/login";
      return;
    }
    if (ev.target.closest("#backFromStudent")) {
      state.studentDetail = null;
      history.replaceState({ tab: state.tab }, "", `/teacher/${state.tab === "klassen" ? "klassen" : "heute"}`);
      render();
      loadTabData();
    }
    const dt = ev.target.closest("[data-detail-tab]");
    if (dt) {
      state.detailTab = dt.getAttribute("data-detail-tab");
      render();
    }
  });

  appEl.addEventListener("change", (ev) => {
    if (ev.target.id === "lcSelect") {
      state.levelCheckId = ev.target.value || null;
      state.selectedStudentId = null;
      try {
        if (state.levelCheckId) localStorage.setItem(hqStorageKey(), state.levelCheckId);
      } catch (_) {
        /* ignore */
      }
      loadToday().catch((err) => alert(err.message || "Fehler"));
      return;
    }
    if (ev.target.id === "hqHelpOnly") {
      state.hqFilterHelp = Boolean(ev.target.checked);
      render();
    }
  });

  sheetBody.addEventListener("click", (ev) => {
    const chip = ev.target.closest("[data-chip]");
    if (chip && state.feedbackDraft) {
      const id = chip.getAttribute("data-chip");
      if (state.feedbackDraft.chips.has(id)) state.feedbackDraft.chips.delete(id);
      else state.feedbackDraft.chips.add(id);
      chip.classList.toggle("active");
      return;
    }
    if (ev.target.closest("#fbCancel") || ev.target.closest("#coachCancel")) closeSheet();
    if (ev.target.closest("#fbSave")) saveFeedback().catch((err) => alert(err.message || "Fehler"));
    if (ev.target.closest("#coachSaveNote")) {
      const student = findHqStudent(state.selectedStudentId);
      const note = document.getElementById("coachNote")?.value || "";
      api("/api/teacher/coaching", {
        method: "POST",
        body: JSON.stringify({
          action: "save_note",
          studentId: student?.id,
          date: state.date,
          logEntryId: student?.logEntryId,
          goalId: student?.goalId,
          note
        })
      })
        .then(async (res) => {
          closeSheet();
          showToast(res.message || "Begleitnotiz gespeichert.");
          await loadHq();
          render();
        })
        .catch((err) => alert(err.message || "Fehler"));
    }
    if (ev.target.closest("#coachSaveNext")) {
      const student = findHqStudent(state.selectedStudentId);
      const nextStep = document.getElementById("coachNext")?.value || "";
      api("/api/teacher/coaching", {
        method: "POST",
        body: JSON.stringify({
          action: "save_next_step",
          studentId: student?.id,
          date: state.date,
          logEntryId: student?.logEntryId,
          goalId: student?.goalId,
          nextStep
        })
      })
        .then(async (res) => {
          closeSheet();
          showToast(res.message || "Nächster Lernschritt vereinbart.");
          await loadHq();
          render();
        })
        .catch((err) => alert(err.message || "Fehler"));
    }
  });

  sheetBackdrop.addEventListener("click", closeSheet);

  document.querySelectorAll(".teacher-bottomnav button").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.studentDetail = null;
      setTab(btn.dataset.tab);
    });
  });

  classSelect.addEventListener("change", () => {
    state.classId = Number(classSelect.value) || null;
    state.levelCheckId = null;
    state.selectedStudentId = null;
    state.expandedStations = {};
    loadTabData();
  });
  dateInput.addEventListener("change", () => {
    state.date = dateInput.value || todayIso();
    loadTabData();
  });

  async function boot() {
    dateInput.value = state.date;
    const session = await api("/api/auth/session");
    if (!session.authenticated || !session.canTeacher) {
      location.href = session.redirectTo || "/login";
      return;
    }
    if (window.SolAuth) window.SolAuth.set(session.role === "teacher" ? "teacher" : "admin");

    state.me = await api("/api/teacher/me");
    state.classes = state.me.classes || [];
    state.classId = state.classes[0]?.id || null;
    fillClassSelect(state.classes);
    updateAdminSwitch();

    const path = location.pathname;
    if (path.startsWith("/teacher/schueler")) {
      const id = Number(new URLSearchParams(location.search).get("id"));
      if (id) {
        await openStudent(id);
        return;
      }
    }
    if (path.includes("klassen")) state.tab = "klassen";
    else if (path.includes("lernbegleitung") || path.includes("profil")) state.tab = "lernbegleitung";
    else if (path.includes("verlauf")) state.tab = "verlauf";
    else state.tab = "heute";

    setTab(state.tab);
  }

  boot().catch((err) => {
    console.error(err);
    appEl.innerHTML = `<div class="empty"><strong>Laden fehlgeschlagen</strong><p>Lehrerbereich konnte nicht geladen werden. Bitte neu anmelden.</p></div>`;
  });
})();
