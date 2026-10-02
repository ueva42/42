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
      btn.classList.toggle("active", btn.dataset.tab === tab);
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

  function renderStats(stats) {
    const s = stats || {};
    return `
      <div class="tile-grid tile-grid--stats">
        <div class="tile tile--stat" role="group" aria-label="Schüler:innen">
          <div class="tile-label">Schüler:innen</div>
          <div class="tile-value">${s.studentCount ?? 0}</div>
        </div>
        <div class="tile tile--stat planned" role="group" aria-label="Mit Plan">
          <div class="tile-label">Mit Plan</div>
          <div class="tile-value">${s.plannedCount ?? 0}</div>
        </div>
        <div class="tile tile--stat attn" role="group" aria-label="Aufmerksamkeit">
          <div class="tile-label">Aufmerksamkeit</div>
          <div class="tile-value">${s.needsAttentionCount ?? 0}</div>
        </div>
        <div class="tile tile--stat positive" role="group" aria-label="Positive Signale">
          <div class="tile-label">Positive Signale</div>
          <div class="tile-value">${s.positiveCount ?? 0}</div>
        </div>
      </div>`;
  }

  function renderInsights(insights) {
    if (!insights?.length) {
      return `<div class="empty">Keine Hinweise für heute – ruhiger Stand oder noch wenig Logbuch-Daten.</div>`;
    }
    return `<div class="tile-grid tile-grid--insights">${insights
      .map(
        (i) => `
      <article class="tile tile--insight priority-${escapeHtml(i.priority)}">
        <div class="tile-meta">
          <span class="name">${escapeHtml(i.studentName)}${i.subject ? ` · ${escapeHtml(i.subject)}` : ""}</span>
          <span class="prio ${escapeHtml(i.priority)}">${escapeHtml(i.priority)}</span>
        </div>
        <h3 class="tile-title">${escapeHtml(i.title)}</h3>
        <p class="tile-obs">${escapeHtml(i.observation)}</p>
        <div class="tile-actions">
          <button type="button" class="btn btn-ghost" data-open-student="${i.studentId}">Ansehen</button>
          <button type="button" class="btn btn-primary" data-feedback="${i.studentId}" data-name="${escapeHtml(i.studentName)}">Rückmeldung</button>
        </div>
      </article>`
      )
      .join("")}</div>`;
  }

  function studentStatusLabel(s) {
    if (s.needsAttention) return s.topInsight || "Braucht Aufmerksamkeit";
    if (s.positive) return s.topInsight || "Positives Signal";
    if (s.reflected) return "Plan + Reflexion";
    if (s.planned) return "Plan vorhanden";
    return "Noch kein Plan";
  }

  function renderStudentTiles(students, gridClass = "tile-grid--students") {
    if (!students?.length) return `<div class="empty">Keine Schüler:innen in dieser Klasse.</div>`;
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
    if (state.loading && !data) return `<div class="empty">Lade Heute…</div>`;
    if (!data) return `<div class="empty">Keine Daten.</div>`;
    if (data.message && !data.stats?.studentCount) {
      return `<div class="empty">${escapeHtml(data.message)}<p class="muted" style="margin-top:8px">Zuweisung erfolgt in der Administration.</p></div>`;
    }
    return `
      ${renderStats(data.stats)}
      <div class="section-title">Heute im Blick</div>
      ${renderInsights(data.insights)}`;
  }

  function renderKlassen() {
    const cards = state.overview?.classes || [];
    if (state.loading && !cards.length) return `<div class="empty">Lade Klassen…</div>`;
    if (!cards.length) return `<div class="empty">Keine zugewiesenen Klassen.</div>`;

    const activeId = Number(state.classId) || cards[0]?.classId;
    const active = cards.find((c) => Number(c.classId) === Number(activeId)) || cards[0];
    const classTiles = `
      <div class="section-title">Klassen</div>
      <div class="tile-grid tile-grid--students">${cards
        .map((c) => {
          const activeCls = Number(c.classId) === Number(active?.classId) ? "active" : "";
          return `
        <button type="button" class="tile tile--class ${activeCls}" data-goto-class="${c.classId}" aria-pressed="${activeCls ? "true" : "false"}">
          <h3>${escapeHtml(c.className)}</h3>
          <div class="tile-metrics">
            <span class="metric"><strong>${c.studentCount}</strong> SuS</span>
            <span class="metric"><strong>${c.plannedCount}</strong> Plan</span>
            <span class="metric"><strong>${c.needsAttentionCount}</strong> Hinweis</span>
          </div>
        </button>`;
        })
        .join("")}</div>`;

    return `
      ${classTiles}
      <div class="section-title">${escapeHtml(active?.className || "Schüler:innen")}</div>
      ${renderStudentTiles(active?.students || [])}`;
  }

  function renderLernbegleitung() {
    const tools = [
      { href: "/teacher/dashboard", title: "Klassenübersicht", desc: "Tagesübersicht mit Logbuch-Hinweisen" },
      { href: "/teacher/week", title: "Wochenübersicht", desc: "Aktivität der Klasse über die Woche" },
      { href: "/teacher/timetable", title: "Stundenplan", desc: "Stundenplan der Klasse pflegen" },
      { href: "/teacher/levelchecks", title: "Levelchecks", desc: "Nachweise und Checkpoints planen" },
      { href: "/teacher/levelplan", title: "Levelplan", desc: "Ziele und Kataloge" },
      { href: "/teacher/termine", title: "Termine", desc: "Termine für die Klasse" },
      { href: "/teacher/gruppenmodus", title: "Gruppenmodus", desc: "Rollen und Gruppensettings" },
      { href: "/teacher/materialschrank", title: "Materialschrank", desc: "Materialien für Schüler:innen" }
    ];
    return `
      <div class="section-title">Lernbegleitung &amp; Planung</div>
      <div class="tile-grid tile-grid--tools">${tools
        .map(
          (t) => `
        <a class="tile tile--tool" href="${t.href}">
          <h3>${escapeHtml(t.title)}</h3>
          <p>${escapeHtml(t.desc)}</p>
        </a>`
        )
        .join("")}</div>
      <div class="section-title">Konto</div>
      <div class="tile-grid tile-grid--tools">
        ${
          isAdminUser()
            ? `<a class="tile tile--tool tile--admin" href="/admin#class">
                <span class="tile-admin-badge">Admin</span>
                <h3>Administration</h3>
                <p>Klassen, Schüler, XP, Lehrerverwaltung</p>
              </a>`
            : ""
        }
        <button type="button" class="tile tile--tool tile--danger" id="logoutBtn">
          <h3>Abmelden</h3>
          <p>Session beenden</p>
        </button>
      </div>`;
  }

  function renderVerlauf() {
    const data = state.history;
    if (state.loading && !data) return `<div class="empty">Lade Verlauf…</div>`;
    if (!data?.students?.length) return `<div class="empty">Kein Verlauf für diese Klasse.</div>`;

    const days = [];
    const end = new Date(`${data.end}T12:00:00`);
    for (let i = data.days - 1; i >= 0; i--) {
      const d = new Date(end);
      d.setDate(end.getDate() - i);
      if (d.getDay() === 0 || d.getDay() === 6) continue;
      days.push(d.toISOString().slice(0, 10));
    }

    return `
      <div class="section-title">Wochenansicht (ohne Ranking)</div>
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
              ${noteCount ? `<span class="tile-hint">${noteCount} Gesprächsnotiz${noteCount === 1 ? "" : "en"}</span>` : `<span class="tile-hint">P = Plan · R = Reflexion</span>`}
            </button>`;
        })
        .join("")}</div>
      <p class="muted" style="margin-top:10px;font-size:.82rem">P = Plan · R = Reflexion · Gesprächsnotizen nur für Lehrkräfte</p>`;
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
      <div class="btn-row" style="margin-bottom:10px">
        <button type="button" class="btn btn-ghost" id="backFromStudent">← Zurück</button>
      </div>
      <h2 style="margin:0 0 4px">${escapeHtml(d.student.name)}</h2>
      <p class="muted" style="margin:0 0 12px">${escapeHtml(d.student.className || "")}</p>
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
      sublineEl.textContent = "Wer braucht heute Unterstützung – und warum?";
      appEl.innerHTML = renderHeute();
    } else if (state.tab === "klassen") {
      greetingEl.textContent = "Klassen";
      sublineEl.textContent = "Schnellüberblick über zugewiesene Klassen";
      appEl.innerHTML = renderKlassen();
    } else if (state.tab === "lernbegleitung") {
      greetingEl.textContent = "Lernbegleitung";
      sublineEl.textContent = "Planung, Stundenplan, Levelchecks & mehr";
      appEl.innerHTML = renderLernbegleitung();
    } else {
      greetingEl.textContent = "Verlauf";
      sublineEl.textContent = "Beobachtbare Aktivität ohne Scores";
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
    appEl.innerHTML = `<div class="empty">Lehrerbereich konnte nicht geladen werden.</div>`;
  });
})();
