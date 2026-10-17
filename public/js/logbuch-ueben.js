/**
 * SRL-Logbuch – Üben zu Hause (freie Fachwahl, Tagesziel + Abschluss).
 */
(function () {
  const UI = () => window.LogbuchUI;

  const state = {
    date: null,
    data: null,
    loading: false
  };

  function todayIso() {
    return new Date().toISOString().slice(0, 10);
  }

  function isEditableDate(dateIso) {
    return dateIso === todayIso();
  }

  function goalHint(entry) {
    if (!entry) return "Noch kein Übungsziel.";
    return (
      entry.level_goal_text ||
      entry.what_goal_text ||
      entry.plan_sentence ||
      entry.goal ||
      "Übungsziel gesetzt."
    );
  }

  function subjectOptions() {
    const fromApi = state.data?.subjects;
    if (Array.isArray(fromApi) && fromApi.length) {
      return fromApi.filter((s) => s && s !== "Frei");
    }
    return (window.LOGBUCH?.SUBJECTS || []).filter((s) => s && s !== "Frei");
  }

  async function loadDay(dateIso) {
    state.loading = true;
    state.date = dateIso || todayIso();
    render();
    try {
      const res = await fetch(
        `/api/student/log/today?date=${encodeURIComponent(state.date)}`
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      state.data = await res.json();
    } catch (err) {
      console.error(err);
      state.data = null;
    } finally {
      state.loading = false;
      render();
    }
  }

  function practiceEntries() {
    return Array.isArray(state.data?.practiceEntries) ? state.data.practiceEntries : [];
  }

  function renderTile(entry, editable) {
    const ui = UI();
    const subject = entry.subject || "Fach";
    const hint = goalHint(entry);
    const done = !!entry.hasReflection;
    let cta = "";
    let nav = "";
    let query = "";

    if (!editable) {
      cta = "Ansehen";
      nav = "plan";
      query = new URLSearchParams({
        entryId: entry.id,
        practice: "1",
        date: state.date || ""
      }).toString();
    } else if (!entry.hasReflection) {
      cta = "Tagesabschluss";
      nav = "reflect";
      query = new URLSearchParams({
        entryId: entry.id,
        practice: "1"
      }).toString();
    } else {
      cta = "Ansehen";
      nav = "plan";
      query = new URLSearchParams({
        entryId: entry.id,
        practice: "1",
        date: state.date || ""
      }).toString();
    }

    return `
      <article class="today-subject-tile ${done ? "is-done" : ""}" data-practice-tile>
        <div class="today-subject-tile__body">
          <p class="today-subject-tile__time">Üben zu Hause</p>
          <h3 class="today-subject-tile__title">${ui.escapeHtml(subject)}</h3>
          <p class="today-subject-tile__hint">${ui.escapeHtml(hint)}</p>
        </div>
        ${
          cta
            ? `<button type="button" class="today-app-btn" data-nav="${ui.escapeHtml(
                nav
              )}" data-query="${ui.escapeHtml(query)}">${ui.escapeHtml(cta)} →</button>`
            : ""
        }
      </article>`;
  }

  function renderStartCard(editable) {
    const ui = UI();
    if (!editable) {
      return `
        <div class="student-card empty-state-card">
          <div class="card-content">
            <p class="empty-state-card__eyebrow">Üben</p>
            <h3 class="empty-state-card__title">Heute kein neues Übungsziel möglich.</h3>
            <p class="empty-state-card__text">Schau dir deine gespeicherten Übungen an oder komm morgen wieder.</p>
          </div>
        </div>`;
    }

    const opts = subjectOptions()
      .map((s) => `<option value="${ui.escapeHtml(s)}">${ui.escapeHtml(s)}</option>`)
      .join("");

    return `
      <article class="today-subject-tile today-subject-tile--start">
        <div class="today-subject-tile__body">
          <p class="today-subject-tile__time">Neues Fach</p>
          <h3 class="today-subject-tile__title">Übungsziel setzen</h3>
          <p class="today-subject-tile__hint">Wähle selbst, welches Fach du zu Hause üben willst – dann Tagesziel und Abschluss wie in Mein Tag.</p>
          <label class="ueben-subject-label" for="uebenSubjectPick">Fach wählen</label>
          <select id="uebenSubjectPick" class="logbuch-input app-input ueben-subject-select">
            <option value="">Fach wählen…</option>
            ${opts}
          </select>
        </div>
        <button type="button" class="today-app-btn" id="uebenStartBtn" disabled>Übungsziel setzen →</button>
      </article>
      <style>
        .ueben-subject-label{display:block;margin:12px 0 6px;font-size:.78rem;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:#94a3b8}
        .ueben-subject-select{width:100%;max-width:420px}
        .today-subject-tile--start{border-style:dashed}
      </style>`;
  }

  function render() {
    const root = document.getElementById("ueben-screen-root");
    if (!root) return;
    const ui = UI();
    const editable = isEditableDate(state.date);

    if (state.loading && !state.data) {
      root.innerHTML = `<div class="logbuch-loading">Lade Übungen…</div>`;
      return;
    }

    if (!state.data) {
      root.innerHTML = `
        <div class="student-card empty-state-card">
          <div class="card-content">
            <h3 class="empty-state-card__title">Übungen konnten nicht geladen werden.</h3>
            <button type="button" class="today-app-btn" id="uebenRetry">Nochmal versuchen</button>
          </div>
        </div>`;
      root.querySelector("#uebenRetry")?.addEventListener("click", () => loadDay(state.date));
      return;
    }

    const items = practiceEntries();
    const dateLabel = new Date(`${state.date}T12:00:00`).toLocaleDateString("de-DE", {
      weekday: "long",
      day: "2-digit",
      month: "2-digit"
    });

    root.innerHTML = `
      <section class="today-overview">
        <article class="today-overview-hero">
          <div class="today-overview-hero__copy">
            <p class="today-overview-hero__eyebrow">Üben zu Hause</p>
            <h2 class="today-overview-hero__title">${ui.escapeHtml(dateLabel)}</h2>
            <p class="today-overview-hero__hint">Fach selbst wählen · Übungsziel setzen · Tagesabschluss – ohne Stundenplan.</p>
          </div>
        </article>
        <div class="today-subject-grid">
          ${renderStartCard(editable)}
          ${items.map((e) => renderTile(e, editable)).join("")}
        </div>
      </section>`;

    const pick = root.querySelector("#uebenSubjectPick");
    const startBtn = root.querySelector("#uebenStartBtn");
    const syncStart = () => {
      if (startBtn) startBtn.disabled = !pick?.value;
    };
    pick?.addEventListener("change", syncStart);
    startBtn?.addEventListener("click", () => {
      const subject = pick?.value;
      if (!subject) return;
      const q = new URLSearchParams({
        practice: "1",
        date: state.date || todayIso(),
        subject
      });
      window.StudentRouter?.navigateToSection("plan", { query: q });
    });

    root.querySelectorAll("[data-nav]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const nav = btn.getAttribute("data-nav");
        const query = new URLSearchParams(btn.getAttribute("data-query") || "");
        window.StudentRouter?.navigateToSection(nav, { query });
      });
    });
  }

  function init() {
    loadDay(todayIso());
  }

  window.LogbuchUeben = { init };
})();
