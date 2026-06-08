/**
 * Lehrkraft – Wochenübersicht Klasse (Heatmap Mo–Fr × Schüler).
 */
(function () {
  const LEVEL_CLASS = {
    0: "tw-lvl-0",
    1: "tw-lvl-1",
    2: "tw-lvl-2",
    3: "tw-lvl-3"
  };

  const state = {
    classId: null,
    weekStart: null,
    data: null,
    loading: false,
    slideDir: null
  };

  function todayIso() {
    return new Date().toISOString().slice(0, 10);
  }

  function mondayOfWeek(dateIso) {
    const d = new Date(`${dateIso}T12:00:00`);
    const jsDay = d.getDay();
    const diff = jsDay === 0 ? -6 : 1 - jsDay;
    d.setDate(d.getDate() + diff);
    return d.toISOString().slice(0, 10);
  }

  function addWeeks(dateIso, delta) {
    const d = new Date(`${dateIso}T12:00:00`);
    d.setDate(d.getDate() + delta * 7);
    return mondayOfWeek(d.toISOString().slice(0, 10));
  }

  function escapeHtml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderLegend(legend) {
    return `
      <div class="tw-legend">
        ${(legend || [])
          .map(
            (item) => `
          <span class="tw-legend-item">
            <span class="tw-cell ${LEVEL_CLASS[item.level] || "tw-lvl-0"}"></span>
            ${escapeHtml(item.label)}
          </span>`
          )
          .join("")}
      </div>`;
  }

  function renderHeatmap(data) {
    if (!data.students.length) {
      return `<p class="tw-empty">Keine Schüler:innen in dieser Klasse.</p>`;
    }

    const dayHeaders = data.days
      .map(
        (d) => `
      <th>
        <span class="tw-day-name">${escapeHtml(d.weekday)}</span>
        <span class="tw-day-date">${escapeHtml(d.label)}</span>
      </th>`
      )
      .join("");

    const rows = data.students
      .map((student) => {
        const cells = student.cells
          .map(
            (cell) => `
          <td>
            <div class="tw-cell ${LEVEL_CLASS[cell.level] || "tw-lvl-0"}"
              title="${escapeHtml(student.name)} – ${escapeHtml(cell.detail)}"></div>
          </td>`
          )
          .join("");

        return `
        <tr>
          <th class="tw-student-name">${escapeHtml(student.name)}</th>
          ${cells}
        </tr>`;
      })
      .join("");

    return `
      <div class="tw-table-wrap">
        <table class="tw-table">
          <thead>
            <tr>
              <th class="tw-corner">Schüler:in</th>
              ${dayHeaders}
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }

  function render() {
    const root = document.getElementById("teacherWeekTabRoot");
    if (!root) return;

    if (state.loading && !state.data) {
      root.innerHTML = `<div class="tw-loading">Lade Wochenübersicht…</div>`;
      return;
    }

    if (!state.data) {
      root.innerHTML = `<div class="tw-error">Wochenübersicht konnte nicht geladen werden.</div>`;
      return;
    }

    const d = state.data;
    const slideClass = state.slideDir ? `td-slide-${state.slideDir}` : "";

    root.innerHTML = `
      <div class="tw-shell" id="twSwipeArea">
        <div class="panel">
          <div class="td-toolbar">
            <div class="td-nav">
              <button type="button" class="td-arrow" data-dir="prev">‹</button>
              <div class="td-date-wrap">
                <div class="td-date">Woche Klasse</div>
                <div class="td-date-sub">${escapeHtml(d.weekLabel)}</div>
              </div>
              <button type="button" class="td-arrow" data-dir="next">›</button>
            </div>
            <div class="td-class-select">
              <label>Klasse:</label>
              <select id="twClassSelect"></select>
            </div>
          </div>

          ${renderLegend(d.legend)}

          <div class="td-slide-viewport">
            <div class="td-slide-panel ${slideClass}" id="twSlidePanel">
              ${renderHeatmap(d)}
            </div>
          </div>
        </div>
      </div>`;

    bindHandlers(root);

    const sel = root.querySelector("#twClassSelect");
    if (sel && window.__twClasses) {
      sel.innerHTML = "";
      window.__twClasses.forEach((c) => {
        const opt = document.createElement("option");
        opt.value = c.id;
        opt.textContent = c.name;
        if (String(c.id) === String(state.classId)) opt.selected = true;
        sel.appendChild(opt);
      });
    }

    if (state.slideDir) {
      const panel = root.querySelector("#twSlidePanel");
      requestAnimationFrame(() => panel?.classList.remove(`td-slide-${state.slideDir}`));
      state.slideDir = null;
    }
  }

  function bindHandlers(root) {
    root.querySelector('[data-dir="prev"]')?.addEventListener("click", () => navigateWeek(-1));
    root.querySelector('[data-dir="next"]')?.addEventListener("click", () => navigateWeek(1));

    root.querySelector("#twClassSelect")?.addEventListener("change", (e) => {
      state.classId = e.target.value;
      loadWeek();
    });

    const swipeArea = root.querySelector("#twSwipeArea");
    if (swipeArea && window.LogbuchSwipe) {
      window.LogbuchSwipe.attach(swipeArea, {
        onSwipeLeft: () => navigateWeek(1),
        onSwipeRight: () => navigateWeek(-1)
      });
    }
  }

  async function loadWeek(slideDir = null) {
    if (!state.classId) return;

    state.slideDir = slideDir;
    state.loading = true;
    if (!state.data) render();

    try {
      const res = await fetch(
        `/api/teacher/week?classId=${encodeURIComponent(state.classId)}&weekStart=${encodeURIComponent(state.weekStart)}`
      );
      state.data = await res.json();
      state.loading = false;
      render();
    } catch (err) {
      console.error(err);
      state.loading = false;
      state.data = null;
      render();
    }
  }

  function navigateWeek(delta) {
    if (state.loading) return;
    state.weekStart = addWeeks(state.weekStart || mondayOfWeek(todayIso()), delta);
    const dir = delta > 0 ? "from-right" : "from-left";
    loadWeek(dir);
  }

  async function init() {
    state.weekStart = mondayOfWeek(todayIso());
    state.data = null;

    const root = document.getElementById("teacherWeekTabRoot");
    if (root) root.innerHTML = `<div class="tw-loading">Lade Wochenübersicht…</div>`;

    try {
      if (!window.__twClasses) {
        const r = await fetch("/api/class");
        window.__twClasses = await r.json();
      }

      if (!window.__twClasses.length) {
        if (root) {
          root.innerHTML = `<div class="tw-empty">Bitte zuerst eine Klasse anlegen.</div>`;
        }
        return;
      }

      state.classId = state.classId || window.__twClasses[0].id;
      await loadWeek();
    } catch (err) {
      console.error(err);
      if (root) root.innerHTML = `<div class="tw-error">Fehler beim Laden.</div>`;
    }
  }

  window.TeacherWeek = { init };
})();
