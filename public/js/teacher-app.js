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
      <div class="stats-grid">
        <div class="stat-card"><div class="label">Schüler:innen</div><div class="value">${s.studentCount ?? 0}</div></div>
        <div class="stat-card"><div class="label">Mit Plan</div><div class="value">${s.plannedCount ?? 0}</div></div>
        <div class="stat-card"><div class="label">Aufmerksamkeit</div><div class="value">${s.needsAttentionCount ?? 0}</div></div>
        <div class="stat-card"><div class="label">Positive Signale</div><div class="value">${s.positiveCount ?? 0}</div></div>
      </div>`;
  }

  function renderInsights(insights) {
    if (!insights?.length) {
      return `<div class="empty">Keine Hinweise für heute – ruhiger Stand oder noch wenig Logbuch-Daten.</div>`;
    }
    return `<div class="insight-list">${insights
      .map(
        (i) => `
      <article class="insight-card priority-${escapeHtml(i.priority)}">
        <div class="insight-meta">
          <span>${escapeHtml(i.studentName)}${i.subject ? ` · ${escapeHtml(i.subject)}` : ""}</span>
          <span class="prio ${escapeHtml(i.priority)}">${escapeHtml(i.priority)}</span>
        </div>
        <h3>${escapeHtml(i.title)}</h3>
        <p>${escapeHtml(i.observation)}</p>
        <div class="insight-prompt">${escapeHtml(i.prompt)}</div>
        <div class="btn-row">
          <button type="button" class="btn btn-ghost" data-open-student="${i.studentId}">Ansehen</button>
          <button type="button" class="btn btn-primary" data-feedback="${i.studentId}" data-name="${escapeHtml(i.studentName)}">Rückmeldung</button>
        </div>
      </article>`
      )
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
    return `<div class="class-list">${cards
      .map(
        (c) => `
      <article class="class-card">
        <h3>${escapeHtml(c.className)}</h3>
        <p>${c.studentCount} Schüler:innen · ${c.plannedCount} mit Plan · ${c.needsAttentionCount} mit Hinweis</p>
        <div class="btn-row">
          <button type="button" class="btn btn-primary" data-goto-class="${c.classId}">Heute öffnen</button>
        </div>
      </article>`
      )
      .join("")}</div>`;
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
      <div class="tool-list">${tools
        .map(
          (t) => `
        <a class="tool-card" href="${t.href}" style="text-decoration:none;color:inherit;display:block">
          <h3>${escapeHtml(t.title)}</h3>
          <p>${escapeHtml(t.desc)}</p>
        </a>`
        )
        .join("")}</div>
      <div class="section-title" style="margin-top:18px">Konto</div>
      <div class="tool-list">
        ${
          state.me?.canAdmin
            ? `<a class="tool-card" href="/admin#class" style="text-decoration:none;color:inherit;display:block">
                <h3>Administration</h3>
                <p>Klassen, Schüler, XP, Lehrerverwaltung</p>
              </a>`
            : ""
        }
        <button type="button" class="tool-card btn-ghost" id="logoutBtn" style="text-align:left;width:100%">
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
      <div class="history-list">${data.students
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
          const notes = (s.notes || [])
            .filter((n) => n.conversationHeld || n.privateNote)
            .slice(0, 2)
            .map(
              (n) =>
                `<div class="muted" style="font-size:.82rem;margin-top:6px">Gespräch ${escapeHtml(String(n.date).slice(0, 10))}${
                  n.privateNote ? `: ${escapeHtml(n.privateNote)}` : ""
                }</div>`
            )
            .join("");
          return `
            <article class="student-row">
              <div style="display:flex;justify-content:space-between;gap:8px;align-items:center">
                <strong>${escapeHtml(s.name)}</strong>
                <button type="button" class="btn btn-ghost" data-open-student="${s.id}" style="min-height:40px">Detail</button>
              </div>
              <div style="margin-top:8px">${pills}</div>
              ${notes}
            </article>`;
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
        body = d.today
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
          .join("");
      }
    } else if (state.detailTab === "verlauf") {
      body = !d.history?.length
        ? `<div class="empty">Kein Verlauf.</div>`
        : d.history
            .map(
              (h) => `
          <div class="student-row">
            <strong>${escapeHtml(String(h.date).slice(0, 10))} · ${escapeHtml(h.subject)}</strong>
            <p class="muted" style="margin:6px 0 0">Ziel: ${escapeHtml(h.goal || "–")}</p>
            <p class="muted" style="margin:4px 0 0">Erreicht: ${escapeHtml(h.goalAchieved || "–")} · ${h.confidenceBefore ?? "–"} → ${h.confidenceAfter ?? "–"}</p>
          </div>`
            )
            .join("");
    } else {
      body = `
        <div class="btn-row" style="margin-bottom:12px">
          <button type="button" class="btn btn-primary" data-feedback="${d.student.id}" data-name="${escapeHtml(d.student.name)}">Neue Rückmeldung</button>
        </div>
        ${
          !d.feedback?.length
            ? `<div class="empty">Noch keine Rückmeldungen.</div>`
            : d.feedback
                .map((f) => {
                  const chipLabels = Object.fromEntries((d.feedbackChips || []).map((c) => [c.id, c.label]));
                  const chips = (f.chips || []).map((id) => chipLabels[id] || id).join(", ");
                  return `
                  <div class="student-row">
                    <strong>${escapeHtml(String(f.date).slice(0, 10))}${f.teacherName ? ` · ${escapeHtml(f.teacherName)}` : ""}</strong>
                    ${chips ? `<p style="margin:6px 0 0">${escapeHtml(chips)}</p>` : ""}
                    ${f.note ? `<p class="muted" style="margin:6px 0 0">${escapeHtml(f.note)}</p>` : ""}
                    ${f.conversationHeld ? `<p class="muted" style="margin:6px 0 0">Gespräch geführt${f.teacherPrivateNote ? `: ${escapeHtml(f.teacherPrivateNote)}` : ""}</p>` : ""}
                  </div>`;
                })
                .join("")
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
      classSelect.value = String(state.classId);
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
