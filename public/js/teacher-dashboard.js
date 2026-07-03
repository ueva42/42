/**
 * Lehrkraft – Klassenübersicht (Dashboard).
 */
(function () {
  const state = {
    date: null,
    classId: null,
    data: null,
    loading: false,
    slideDir: null,
    detailStudentId: null
  };

  let initPromise = null;
  let initGeneration = 0;
  let loadRequestId = 0;

  async function fetchJson(url, options = {}, retries = 1) {
    let lastErr = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await fetch(url, { credentials: "same-origin", ...options });
        if (!res.ok) {
          const err = new Error(`HTTP ${res.status}`);
          if (attempt < retries && (res.status === 403 || res.status >= 500)) {
            await new Promise((r) => setTimeout(r, 350));
            continue;
          }
          throw err;
        }
        return await res.json();
      } catch (err) {
        lastErr = err;
        if (attempt < retries) {
          await new Promise((r) => setTimeout(r, 350));
          continue;
        }
      }
    }

    throw lastErr || new Error("Anfrage fehlgeschlagen");
  }

  function isDashboardPayload(data) {
    return data && Array.isArray(data.students);
  }

  function todayIso() {
    return new Date().toISOString().slice(0, 10);
  }

  function addSchoolDays(dateIso, delta) {
    const d = new Date(`${dateIso}T12:00:00`);
    const step = delta > 0 ? 1 : -1;
    let remaining = Math.abs(delta);
    while (remaining > 0) {
      d.setDate(d.getDate() + step);
      const day = d.getDay();
      if (day >= 1 && day <= 5) remaining--;
    }
    return d.toISOString().slice(0, 10);
  }

  function escapeHtml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function hintClass(color) {
    return `td-hint td-hint-${color}`;
  }

  function renderTimetable(timetable) {
    if (!timetable?.length) {
      return `<div class="td-timetable-empty">Kein Stundenplan für diesen Tag.</div>`;
    }

    return `
      <div class="td-timetable-bar">
        ${timetable
          .map(
            (slot) => `
          <div class="td-timetable-slot ${slot.subject === "Frei" ? "td-timetable-slot-free" : ""}">
            <span class="td-slot-nr">${slot.slot}</span>
            <span class="td-slot-subject">${escapeHtml(slot.subject)}</span>
            <span class="td-slot-time">${escapeHtml(slot.timeslot)}</span>
          </div>`
          )
          .join("")}
      </div>`;
  }

  function renderTable(students) {
    const rows = Array.isArray(students) ? students : [];
    if (!rows.length) {
      return `<p class="td-empty">Keine Schüler:innen in dieser Klasse.</p>`;
    }

    return `
      <div class="td-table-wrap">
        <table class="td-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Ziel gesetzt</th>
              <th>Erreicht</th>
              <th>Reflexion</th>
              <th>Selbstwirksamkeit</th>
              <th>Nächster Schritt</th>
              <th>Hinweis</th>
            </tr>
          </thead>
          <tbody>
            ${rows
              .map(
                (s) => `
              <tr class="td-row" data-student-id="${s.id}" tabindex="0">
                <td><b>${escapeHtml(s.name)}</b></td>
                <td>${s.goalSet ? (s.goalCount > 1 ? `${s.goalCount}×` : "✓") : "–"}</td>
                <td>${escapeHtml(s.goalAchieved)}</td>
                <td>${s.hasReflection ? "✓" : "–"}</td>
                <td>${escapeHtml(s.confidenceLabel)}</td>
                <td>${escapeHtml(s.nextStepLabel)}</td>
                <td><span class="${hintClass(s.hint.color)}">${escapeHtml(s.hint.tag)}</span></td>
              </tr>`
              )
              .join("")}
          </tbody>
        </table>
      </div>`;
  }

  function renderDetailModal(detail) {
    if (!detail) return "";

    return `
      <div class="td-modal-overlay" id="tdDetailOverlay">
        <div class="td-modal">
          <div class="td-modal-head">
            <h3>Wochenverlauf – ${escapeHtml(detail.student.name)}</h3>
            <button type="button" class="td-modal-close" id="tdDetailClose">✕</button>
          </div>
          <p class="td-modal-sub">KW ${escapeHtml(detail.weekStart)} – ${escapeHtml(detail.weekEnd)}</p>
          ${
            detail.rows.length
              ? `
            <table class="td-detail-table">
              <thead>
                <tr><th>Tag</th><th>Fach</th><th>Ziel</th><th>✓</th><th>Selbstw.</th><th>Nächster Schritt</th></tr>
              </thead>
              <tbody>
                ${detail.rows
                  .map(
                    (r) => `
                  <tr>
                    <td>${escapeHtml(r.weekday)}</td>
                    <td>${escapeHtml(r.subject)}</td>
                    <td>${escapeHtml(r.goal)}</td>
                    <td>${escapeHtml(r.achieved)}</td>
                    <td>${escapeHtml(r.confidenceLabel)}</td>
                    <td>${escapeHtml(r.nextStepLabel)}</td>
                  </tr>`
                  )
                  .join("")}
              </tbody>
            </table>`
              : `<p class="td-empty">Keine Logbuch-Einträge in dieser Woche.</p>`
          }
          <button type="button" class="action" id="tdDetailClose2" style="margin-top:12px;">Schließen</button>
        </div>
      </div>`;
  }

  function render() {
    const root = document.getElementById("dashboardTabRoot");
    if (!root) return;

    if (state.loading && !state.data) {
      root.innerHTML = `<div class="td-loading">Lade Klassenübersicht…</div>`;
      return;
    }

    if (!state.data) {
      root.innerHTML = `<div class="td-error">Klassenübersicht konnte nicht geladen werden.</div>`;
      return;
    }

    const d = state.data;
    const slideClass = state.slideDir ? `td-slide-${state.slideDir}` : "";

    root.innerHTML = `
      <div class="td-shell" id="tdSwipeArea">
        <div class="panel">
          <div class="td-toolbar">
            <div class="td-nav">
              <button type="button" class="td-arrow" data-dir="prev">‹</button>
              <div class="td-date-wrap">
                <div class="td-date">${escapeHtml(d.weekdayLabel)}</div>
                <div class="td-date-sub">${escapeHtml(d.dateLabel)}</div>
              </div>
              <button type="button" class="td-arrow" data-dir="next">›</button>
            </div>
            <div class="td-class-select">
              <label>Klasse:</label>
              <select id="tdClassSelect"></select>
            </div>
          </div>

          <div class="td-slide-viewport">
            <div class="td-slide-panel ${slideClass}" id="tdSlidePanel">
              <h3>Stundenplan</h3>
              ${renderTimetable(d.timetable)}
              <h3 style="margin-top:18px;">Schüler:innen</h3>
              ${renderTable(d.students)}
            </div>
          </div>
        </div>
        <div id="tdDetailMount"></div>
      </div>`;

    bindHandlers(root);

    const sel = root.querySelector("#tdClassSelect");
    if (sel && window.__tdClasses) {
      sel.innerHTML = "";
      window.__tdClasses.forEach((c) => {
        const opt = document.createElement("option");
        opt.value = c.id;
        opt.textContent = c.name;
        if (String(c.id) === String(state.classId)) opt.selected = true;
        sel.appendChild(opt);
      });
    }

    if (state.slideDir) {
      const panel = root.querySelector("#tdSlidePanel");
      requestAnimationFrame(() => panel?.classList.remove(`td-slide-${state.slideDir}`));
      state.slideDir = null;
    }
  }

  async function openStudentDetail(studentId) {
    const mount = document.getElementById("tdDetailMount");
    if (!mount) return;

    try {
      const res = await fetch(
        `/api/teacher/student-week?studentId=${studentId}&date=${encodeURIComponent(state.date)}`
      );
      const detail = await res.json();
      state.detailStudentId = studentId;
      mount.innerHTML = renderDetailModal(detail);

      mount.querySelector("#tdDetailClose")?.addEventListener("click", closeDetail);
      mount.querySelector("#tdDetailClose2")?.addEventListener("click", closeDetail);
      mount.querySelector("#tdDetailOverlay")?.addEventListener("click", (e) => {
        if (e.target.id === "tdDetailOverlay") closeDetail();
      });
    } catch (err) {
      console.error(err);
    }
  }

  function closeDetail() {
    state.detailStudentId = null;
    const mount = document.getElementById("tdDetailMount");
    if (mount) mount.innerHTML = "";
  }

  function bindHandlers(root) {
    root.querySelector('[data-dir="prev"]')?.addEventListener("click", () => navigateDay(-1));
    root.querySelector('[data-dir="next"]')?.addEventListener("click", () => navigateDay(1));

    root.querySelector("#tdClassSelect")?.addEventListener("change", (e) => {
      state.classId = e.target.value;
      loadDashboard();
    });

    root.querySelectorAll(".td-row").forEach((row) => {
      const open = () => openStudentDetail(row.dataset.studentId);
      row.addEventListener("click", open);
      row.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          open();
        }
      });
    });

    const swipeArea = root.querySelector("#tdSwipeArea");
    if (swipeArea && window.LogbuchSwipe) {
      window.LogbuchSwipe.attach(swipeArea, {
        onSwipeLeft: () => navigateDay(1),
        onSwipeRight: () => navigateDay(-1)
      });
    }
  }

  async function loadDashboard(slideDir = null, generation = initGeneration) {
    if (!state.classId) {
      state.loading = false;
      return;
    }

    const requestId = ++loadRequestId;
    state.slideDir = slideDir;
    state.loading = true;
    if (!state.data) render();

    try {
      const data = await fetchJson(
        `/api/teacher/dashboard?classId=${encodeURIComponent(state.classId)}&date=${encodeURIComponent(state.date)}`
      );

      if (requestId !== loadRequestId || generation !== initGeneration) return;
      if (!isDashboardPayload(data)) throw new Error("Ungültige Dashboard-Antwort");

      state.data = data;
      state.loading = false;
      render();
    } catch (err) {
      console.error(err);
      if (requestId !== loadRequestId || generation !== initGeneration) return;
      state.loading = false;
      state.data = null;
      render();
    }
  }

  function navigateDay(delta) {
    if (state.loading) return;
    state.date = addSchoolDays(state.date || todayIso(), delta);
    const dir = delta > 0 ? "from-right" : "from-left";
    loadDashboard(dir);
  }

  async function initInternal() {
    const generation = ++initGeneration;
    state.date = todayIso();
    state.data = null;
    state.loading = true;

    const root = document.getElementById("dashboardTabRoot");
    if (root) root.innerHTML = `<div class="td-loading">Lade Klassenübersicht…</div>`;

    try {
      const classes = await fetchJson("/api/class");
      if (generation !== initGeneration) return;

      if (!Array.isArray(classes) || !classes.length) {
        state.loading = false;
        if (root) {
          root.innerHTML = `<div class="td-empty">Bitte zuerst eine Klasse anlegen.</div>`;
        }
        return;
      }

      window.__tdClasses = classes;
      state.classId = state.classId || classes[0].id;
      await loadDashboard(null, generation);
    } catch (err) {
      console.error(err);
      if (generation !== initGeneration) return;
      state.loading = false;
      state.data = null;
      if (root) root.innerHTML = `<div class="td-error">Fehler beim Laden.</div>`;
    }
  }

  function init() {
    if (initPromise) return initPromise;
    initPromise = initInternal().finally(() => {
      initPromise = null;
    });
    return initPromise;
  }

  window.TeacherDashboard = { init };
})();
