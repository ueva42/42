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
    classes: [],
    overview: null,
    history: null,
    studentDetail: null,
    detailTab: "heute",
    feedbackDraft: null,
    selectedStudentId: null,
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

  function pct(part, total) {
    const t = Number(total) || 0;
    const p = Number(part) || 0;
    if (t <= 0) return 0;
    return Math.max(0, Math.min(100, Math.round((p / t) * 100)));
  }

  function studentStatusLabel(s) {
    if (s.needsAttention) return s.topInsight || "Braucht Aufmerksamkeit";
    if (s.positive) return s.topInsight || "Positives Signal";
    if (s.reflected) return "Plan + Reflexion";
    if (s.planned) return "Plan vorhanden";
    return "Noch kein Plan";
  }

  function rosterStatus(s) {
    if (s.needsAttention) return { icon: "!", cls: "hud-status--attn", tag: "Hinweis" };
    if (s.reflected) return { icon: "✓", cls: "hud-status--ok", tag: "Reflexion" };
    if (s.planned || s.checked) return { icon: "◐", cls: "hud-status--mid", tag: s.checked ? "Arbeit" : "Plan" };
    return { icon: "·", cls: "", tag: "offen" };
  }

  function deriveLessonPhases(stats) {
    const s = stats || {};
    const total = Number(s.studentCount) || 0;
    const planned = Number(s.plannedCount) || 0;
    const checked = Number(s.checkedCount) || 0;
    const reflected = Number(s.reflectedCount) || 0;
    const planPct = pct(planned, total);
    const workPct = pct(Math.max(checked, Math.min(planned, total - reflected)), total);
    const reflectPct = pct(reflected, total);

    let active = "plan";
    if (total > 0) {
      if (planPct < 55) active = "plan";
      else if (reflectPct < 40) active = "arbeit";
      else active = "reflexion";
    }

    const phases = [
      {
        id: "plan",
        title: "Plan",
        meta: total ? `${planned}/${total} Ziele gesetzt` : "Keine SuS",
        pct: planPct,
        done: planPct >= 70
      },
      {
        id: "arbeit",
        title: "Arbeit",
        meta: total
          ? `${checked}/${total} mit Check · ${Math.max(0, planned - reflected)} offen`
          : "Wartet auf Plan",
        pct: workPct,
        done: reflectPct >= 40 && planPct >= 55
      },
      {
        id: "reflexion",
        title: "Reflexion",
        meta: total ? `${reflected}/${total} reflektiert` : "Noch nicht gestartet",
        pct: reflectPct,
        done: reflectPct >= 70
      }
    ];

    return phases.map((p) => ({
      ...p,
      state: p.id === active ? "active" : p.done ? "done" : "upcoming"
    }));
  }

  function focusCopy(stats, insights) {
    const attn = stats?.needsAttentionCount ?? 0;
    const high = (insights || []).filter((i) => i.priority === "hoch").length;
    const n = Math.max(attn, high);
    if (n > 0) {
      return {
        title: n === 1 ? "1 Person im Blick" : `${n} Personen im Blick`,
        text: "Zuerst Hinweise mit Priorität „hoch“ – Roster tippen oder Impuls öffnen.",
        badge: String(n),
        calm: false
      };
    }
    if ((stats?.studentCount || 0) > 0 && (stats?.plannedCount || 0) === 0) {
      return {
        title: "Noch wenig Aktivität",
        text: "Bisher keine Pläne für diesen Tag. Kurz erinnern oder später erneut schauen.",
        badge: "·",
        calm: false
      };
    }
    return {
      title: "Ruhiger Stand",
      text: "Keine hoch priorisierten Hinweise – guter Moment für kurze positive Rückmeldungen.",
      badge: "✓",
      calm: true
    };
  }

  function renderHudTopbar(stats) {
    const s = stats || {};
    const total = s.studentCount ?? 0;
    const set = s.plannedCount ?? 0;
    const reached = s.goalsReachedCount ?? 0;
    const open = s.reflectionOpenCount ?? Math.max(0, set - (s.reflectedCount ?? 0));
    const hints = s.needsAttentionCount ?? 0;
    const progress = pct(s.reflectedCount ?? 0, total);
    return `
      <section class="hud-topbar hud-glass" aria-label="Klasse jetzt">
        <div class="hud-metric hud-metric--set" role="group" aria-label="Ziele gesetzt">
          <span class="hud-metric__label">Gesetzt</span>
          <span class="hud-metric__value">${set}</span>
        </div>
        <div class="hud-metric hud-metric--ok" role="group" aria-label="Ziele erreicht">
          <span class="hud-metric__label">Erreicht</span>
          <span class="hud-metric__value">${reached}</span>
        </div>
        <div class="hud-metric hud-metric--open" role="group" aria-label="Reflexion offen">
          <span class="hud-metric__label">Offen</span>
          <span class="hud-metric__value">${open}</span>
        </div>
        <div class="hud-metric hud-metric--hint" role="group" aria-label="Hinweise">
          <span class="hud-metric__label">Hinweise</span>
          <span class="hud-metric__value">${hints}</span>
        </div>
        <div class="hud-topbar__progress" aria-hidden="true"><span style="width:${progress}%"></span></div>
      </section>`;
  }

  function renderHudTimeline(stats) {
    const phases = deriveLessonPhases(stats);
    return `
      <aside class="hud-timeline hud-glass" aria-label="Stunden-Phasen">
        <div class="hud-panel-head">
          <h2>Phasen</h2>
          <span>Plan → Arbeit → Reflexion</span>
        </div>
        <div class="hud-phases-row">
          ${phases
            .map((p) => {
              const stateCls =
                p.state === "active" ? "is-active" : p.state === "done" ? "is-done" : "is-upcoming";
              const mark = p.state === "done" ? "✓" : p.state === "active" ? "▶" : "·";
              return `
            <div class="hud-phase ${stateCls}" data-phase="${escapeHtml(p.id)}">
              <span class="hud-phase__mark" aria-hidden="true">${mark}</span>
              <span class="hud-phase__body">
                <span class="hud-phase__title">${escapeHtml(p.title)}</span>
                <span class="hud-phase__meta">${escapeHtml(p.meta)}</span>
              </span>
              <span class="hud-phase__bar" aria-hidden="true"><i style="width:${p.pct}%"></i></span>
            </div>`;
            })
            .join("")}
        </div>
      </aside>`;
  }

  function renderHudRoster(students) {
    if (!students?.length) {
      return `
        <aside class="hud-roster hud-glass" aria-label="Schüler-Liste">
          <div class="hud-panel-head"><h2>Roster</h2><span>0</span></div>
          <div class="hud-empty-inline">Keine Schüler:innen in dieser Klasse.</div>
        </aside>`;
    }
    const selected = Number(state.selectedStudentId);
    return `
      <aside class="hud-roster hud-glass" aria-label="Schüler-Liste">
        <div class="hud-panel-head">
          <h2>Roster</h2>
          <span>${students.length} SuS</span>
        </div>
        <ul class="hud-roster-list">
          ${students
            .map((s) => {
              const st = rosterStatus(s);
              const sel = Number(s.id) === selected ? "is-selected" : "";
              const attn = s.needsAttention ? "is-attn" : "";
              const hint = studentStatusLabel(s);
              return `
            <li>
              <button type="button" class="hud-roster-row ${sel} ${attn}" data-open-student="${s.id}" data-select-student="${s.id}" aria-label="${escapeHtml(s.name)}: ${escapeHtml(hint)}">
                <span class="hud-status ${st.cls}" aria-hidden="true">${st.icon}</span>
                <span>
                  <span class="hud-roster-name">${escapeHtml(s.name)}</span>
                  <span class="hud-roster-hint">${escapeHtml(hint)}</span>
                </span>
                <span class="hud-roster-tag">${escapeHtml(st.tag)}</span>
              </button>
            </li>`;
            })
            .join("")}
        </ul>
      </aside>`;
  }

  function renderHudFocus(data) {
    const focus = focusCopy(data.stats, data.insights);
    return `
      <section class="hud-focus hud-glass" aria-live="polite">
        <p class="hud-focus__kicker">${escapeHtml(data.className || "Klasse")} · ${escapeHtml(data.date || state.date)}</p>
        <h2 class="hud-focus__title">${escapeHtml(focus.title)}</h2>
        <p class="hud-focus__text">${escapeHtml(focus.text)}</p>
        <div class="hud-focus__attn ${focus.calm ? "is-calm" : ""}" aria-hidden="true">${escapeHtml(focus.badge)}</div>
      </section>`;
  }

  function renderHudCoaching(insights, insightTotal) {
    const list = insights || [];
    const total = insightTotal ?? list.length;
    const head = `
      <div class="hud-panel-head">
        <h2>Heute im Blick</h2>
        <span class="${list.length ? "section-count hot" : ""}">${
          list.length ? `${list.length}${total > list.length ? ` / ${total}` : ""} Impulse` : "Keine Impulse"
        }</span>
      </div>`;
    if (!list.length) {
      return `
        <section class="hud-coaching hud-glass" aria-label="Coaching-Impulse">
          ${head}
          <div class="hud-empty-inline">Keine offenen Coaching-Hinweise – ruhiger Stand oder noch wenig Logbuch-Daten.</div>
        </section>`;
    }
    return `
      <section class="hud-coaching hud-glass" aria-label="Coaching-Impulse">
        ${head}
        <div class="hud-coaching-track">
          ${list
            .map(
              (i, idx) => `
            <button type="button" class="hud-coach-card priority-${escapeHtml(i.priority || "mittel")}" data-insight-idx="${idx}" aria-label="Impuls: ${escapeHtml(i.title)}">
              <div class="hud-coach-card__meta">
                <span class="name">${escapeHtml(i.studentName)}${i.subject ? ` · ${escapeHtml(i.subject)}` : ""}</span>
                <span class="prio ${escapeHtml(i.priority || "")}">${escapeHtml(i.priority || "")}</span>
              </div>
              <h3 class="hud-coach-card__title">${escapeHtml(i.title)}</h3>
              ${i.prompt ? `<p class="hud-coach-card__prompt">${escapeHtml(i.prompt)}</p>` : `<p class="hud-coach-card__prompt">${escapeHtml(i.observation || "")}</p>`}
            </button>`
            )
            .join("")}
        </div>
      </section>`;
  }

  function openInsightSheet(insight) {
    if (!insight) return;
    openSheet(`
      <h2 id="sheetTitle" style="margin:0 0 4px">${escapeHtml(insight.title || "Impuls")}</h2>
      <p class="muted" style="margin:0 0 12px">${escapeHtml(insight.studentName || "")}${
        insight.subject ? ` · ${escapeHtml(insight.subject)}` : ""
      }${insight.priority ? ` · <span class="prio ${escapeHtml(insight.priority)}">${escapeHtml(insight.priority)}</span>` : ""}</p>
      <p style="margin:0 0 10px;line-height:1.45">${escapeHtml(insight.observation || "")}</p>
      ${
        insight.prompt
          ? `<div class="insight-prompt"><strong>Gesprächsimpuls</strong><br>${escapeHtml(insight.prompt)}</div>`
          : ""
      }
      <div class="btn-row" style="margin-top:14px">
        <button type="button" class="btn btn-ghost" data-open-student="${insight.studentId}">Schülerdetail</button>
        <button type="button" class="btn btn-primary" data-feedback="${insight.studentId}" data-name="${escapeHtml(insight.studentName || "")}">Rückmeldung</button>
      </div>
    `);
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

  function renderHeute() {
    const data = state.today;
    if (state.loading && !data) {
      return `<div class="empty"><strong>Lade Heute…</strong><p>Klassenstand und Hinweise werden geladen.</p></div>`;
    }
    if (!data) {
      return `<div class="empty"><strong>Keine Daten</strong><p>Heute-Ansicht konnte nicht geladen werden.</p></div>`;
    }
    if (data.message && !data.stats?.studentCount) {
      return `<div class="empty">
        <strong>${escapeHtml(data.message)}</strong>
        <p>Zuweisung erfolgt in der Administration. Admins wechseln oben rechts.</p>
        ${isAdminUser() ? `<a class="btn btn-primary" href="/admin#class">Zur Administration</a>` : ""}
      </div>`;
    }
    return `
      <div class="live-hud" data-hud="heute">
        ${renderHudTopbar(data.stats)}
        <div class="hud-mid">
          ${renderHudTimeline(data.stats)}
          ${renderHudFocus(data)}
          ${renderHudRoster(data.students || [])}
        </div>
        ${renderHudCoaching(data.insights, data.insightTotal)}
      </div>`;
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
    const onStudent = state.studentDetail && location.pathname.startsWith("/teacher/schueler");
    const hudHeute = !onStudent && state.tab === "heute";
    document.body.classList.toggle("hud-heute", hudHeute);

    if (onStudent) {
      greetingEl.textContent = state.studentDetail.student?.name || "Schülerdetail";
      sublineEl.textContent = "Heute · Verlauf · Feedback";
      document.getElementById("toolbar").classList.add("hidden");
      appEl.innerHTML = renderStudentDetail();
      return;
    }

    document.getElementById("toolbar").classList.remove("hidden");
    if (state.tab === "heute") {
      const className = state.today?.className;
      greetingEl.textContent = className ? `Klasse jetzt · ${className}` : name ? `Hallo ${name}` : "Heute";
      sublineEl.textContent = "Live-HUD · beobachtbare Signale";
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

  async function loadToday() {
    if (!state.classId) {
      state.today = { message: "Keine Klasse zugewiesen.", stats: {}, insights: [] };
      render();
      return;
    }
    state.loading = true;
    render();
    try {
      state.today = await api(
        `/api/teacher/today?classId=${encodeURIComponent(state.classId)}&date=${encodeURIComponent(state.date)}`
      );
      if (state.today.classId) state.classId = state.today.classId;
      fillClassSelect(state.today.classes || state.classes);
    } finally {
      state.loading = false;
      render();
    }
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
    const insightBtn = ev.target.closest("[data-insight-idx]");
    if (insightBtn) {
      const idx = Number(insightBtn.getAttribute("data-insight-idx"));
      const insight = state.today?.insights?.[idx];
      if (insight) {
        state.selectedStudentId = insight.studentId;
        render();
        openInsightSheet(insight);
      }
      return;
    }
    const selectRow = ev.target.closest("[data-select-student]");
    if (selectRow) {
      state.selectedStudentId = Number(selectRow.getAttribute("data-select-student")) || null;
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

  sheetBody.addEventListener("click", (ev) => {
    const chip = ev.target.closest("[data-chip]");
    if (chip && state.feedbackDraft) {
      const id = chip.getAttribute("data-chip");
      if (state.feedbackDraft.chips.has(id)) state.feedbackDraft.chips.delete(id);
      else state.feedbackDraft.chips.add(id);
      chip.classList.toggle("active");
      return;
    }
    const openFromSheet = ev.target.closest("[data-open-student]");
    if (openFromSheet) {
      closeSheet();
      openStudent(openFromSheet.getAttribute("data-open-student"));
      return;
    }
    const fbFromSheet = ev.target.closest("[data-feedback]");
    if (fbFromSheet) {
      openFeedbackSheet(
        fbFromSheet.getAttribute("data-feedback"),
        fbFromSheet.getAttribute("data-name") || ""
      );
      return;
    }
    if (ev.target.closest("#fbCancel")) closeSheet();
    if (ev.target.closest("#fbSave")) saveFeedback().catch((err) => alert(err.message || "Fehler"));
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
