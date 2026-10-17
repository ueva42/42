/**
 * SRL-Logbuch – Üben zu Hause (freie Fachwahl, Tagesziel + Abschluss).
 * Schritt 1: „Üben starten“ → Fach-Kacheln; heutige Einträge bleiben sichtbar.
 */
(function () {
  const UI = () => window.LogbuchUI;

  const state = {
    date: null,
    data: null,
    loading: false,
    picking: false
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

  function subjectSlug(name) {
    return String(name || "")
      .toLowerCase()
      .replace(/ä/g, "ae")
      .replace(/ö/g, "oe")
      .replace(/ü/g, "ue")
      .replace(/ß/g, "ss")
      .replace(/[^a-z0-9]+/g, "");
  }

  function subjectAccent(name) {
    const map = {
      mathe: "orange",
      mathematik: "orange",
      deutsch: "cyan",
      englisch: "blue",
      physik: "violet",
      chemie: "magenta",
      biologie: "green",
      geschichte: "gold",
      geo: "teal",
      geographie: "teal",
      musik: "violet",
      bk: "pink",
      sport: "green",
      gk: "purple"
    };
    return map[subjectSlug(name)] || "cyan";
  }

  async function loadDay(dateIso) {
    state.loading = true;
    state.picking = false;
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

  function startPractice(subject) {
    if (!subject) return;
    const q = new URLSearchParams({
      practice: "1",
      date: state.date || todayIso(),
      subject
    });
    window.StudentRouter?.navigateToSection("plan", { query: q });
  }

  function renderStartCta(editable) {
    const ui = UI();
    if (!editable) {
      return `
        <p class="ueben-muted">Heute kannst du kein neues Übungsziel starten – schau dir deine Einträge unten an.</p>`;
    }

    return `
      <button type="button" class="ueben-start-cta hub-accent-cyan" id="uebenStartBtn">
        <span class="ueben-start-cta__glow" aria-hidden="true"></span>
        <span class="ueben-start-cta__copy">
          <span class="ueben-start-cta__eyebrow">Üben zu Hause</span>
          <span class="ueben-start-cta__title">Üben starten</span>
          <span class="ueben-start-cta__hint">Fach wählen, Übungsziel setzen – wie dein Tagesziel in Mein Tag.</span>
        </span>
        <span class="ueben-start-cta__arrow" aria-hidden="true">→</span>
      </button>`;
  }

  function renderSubjectPick(editable) {
    const ui = UI();
    if (!editable) {
      return `
        <p class="ueben-muted">Heute kannst du kein neues Übungsziel starten – schau dir deine Einträge unten an.</p>`;
    }

    const taken = new Set(practiceEntries().map((e) => String(e.subject || "").toLowerCase()));
    const subjects = subjectOptions();

    return `
      <div class="ueben-pick">
        <div class="ueben-pick__bar">
          <button type="button" class="today-app-btn today-app-btn--ghost" id="uebenPickBack">Zurück</button>
        </div>
        <div class="ueben-subject-grid" role="list">
          ${subjects
            .map((s) => {
              const done = taken.has(String(s).toLowerCase());
              const artSrc = window.LogbuchVisuals?.subjectIconSrc(s) || "";
              const accent = subjectAccent(s);
              const art = artSrc
                ? `<span class="ueben-subject-chip__art" aria-hidden="true"><img src="${ui.escapeHtml(
                    artSrc
                  )}" alt="" loading="lazy" decoding="async"></span>`
                : `<span class="ueben-subject-chip__dot" aria-hidden="true"></span>`;
              return `
                <button type="button"
                  class="ueben-subject-chip hub-accent-${accent}${done ? " is-done" : ""}"
                  data-ueben-subject="${ui.escapeHtml(s)}"
                  ${done ? 'title="Heute schon gestartet – unten fortsetzen"' : ""}>
                  ${art}
                  <span class="ueben-subject-chip__label">${ui.escapeHtml(s)}</span>
                  ${done ? `<span class="ueben-subject-chip__badge">läuft</span>` : ""}
                </button>`;
            })
            .join("")}
        </div>
      </div>`;
  }

  function renderStartBlock(editable) {
    if (state.picking && editable) {
      return `
        <section class="ueben-block" id="uebenStartBlock">
          <div class="ueben-block__head">
            <p class="ueben-block__eyebrow">Schritt 1</p>
            <h3 class="ueben-block__title">Fach wählen</h3>
            <p class="ueben-block__text">Tippe ein Fach an – danach setzt du dein Übungsziel wie in Mein Tag.</p>
          </div>
          ${renderSubjectPick(editable)}
        </section>`;
    }

    return `
      <section class="ueben-block" id="uebenStartBlock">
        <div class="ueben-block__head">
          <p class="ueben-block__eyebrow">Neu starten</p>
          <h3 class="ueben-block__title">Bereit zum Üben?</h3>
          <p class="ueben-block__text">Starte eine neue Übung – deine heutigen Einträge siehst du weiterhin unten.</p>
        </div>
        ${renderStartCta(editable)}
      </section>`;
  }

  function renderEntryTile(entry, editable) {
    const ui = UI();
    const subject = entry.subject || "Fach";
    const hint = goalHint(entry);
    const done = !!entry.hasReflection;
    const artSrc = window.LogbuchVisuals?.subjectIconSrc(subject) || "";
    const accent = subjectAccent(subject);

    let cta = "Ansehen";
    let nav = "plan";
    let query = new URLSearchParams({
      entryId: entry.id,
      practice: "1",
      date: state.date || ""
    }).toString();

    if (editable && !entry.hasReflection) {
      cta = "Tagesabschluss";
      nav = "reflect";
      query = new URLSearchParams({
        entryId: entry.id,
        practice: "1"
      }).toString();
    }

    const art = artSrc
      ? `<div class="dashboard-card__artwork hub-tile-art" data-fit="cover" aria-hidden="true">
          <img class="dashboard-card__hero" src="${ui.escapeHtml(artSrc)}" alt="" loading="lazy" decoding="async" style="--art-position: center right">
        </div>`
      : "";

    return `
      <button type="button"
        class="today-subject-tile hub-tile hub-tile-sm dashboard-card app-card hub-accent-${accent}${
          done ? " is-done" : ""
        }${artSrc ? " today-subject-tile--has-art" : ""}"
        data-nav="${ui.escapeHtml(nav)}"
        data-query="${ui.escapeHtml(query)}">
        ${art}
        <span class="today-subject-tile__copy hub-tile-content">
          <span class="today-subject-tile__time">Üben zu Hause</span>
          <span class="today-subject-tile__title">${ui.escapeHtml(subject)}</span>
          <span class="today-subject-tile__text">${ui.escapeHtml(hint)}</span>
          <span class="today-subject-tile__cta">${ui.escapeHtml(cta)} <span class="hub-tile-arrow" aria-hidden="true">→</span></span>
        </span>
      </button>`;
  }

  function styles() {
    return `<style>
      .ueben-page{display:grid;gap:22px;padding:4px 0 28px}
      .ueben-block{display:grid;gap:12px}
      .ueben-block__head{display:grid;gap:4px}
      .ueben-block__eyebrow{margin:0;font-size:.72rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#67e8f9}
      .ueben-block__title{margin:0;font-size:1.35rem;font-weight:900;color:#f8fafc;letter-spacing:.02em}
      .ueben-block__text{margin:0;font-size:.95rem;line-height:1.45;color:#94a3b8;max-width:42rem}
      .ueben-muted{margin:0;color:#94a3b8;font-size:.95rem}
      .ueben-start-cta{position:relative;display:flex;align-items:center;gap:16px;width:100%;max-width:36rem;padding:18px 20px;border-radius:18px;border:1px solid rgba(34,211,238,.45);background:linear-gradient(155deg,rgba(8,47,73,.95),rgba(15,23,42,.92) 55%,rgba(6,78,59,.35));color:#f8fafc;text-align:left;cursor:pointer;-webkit-tap-highlight-color:transparent;overflow:hidden;transition:transform .14s ease,border-color .14s ease,box-shadow .14s ease;box-shadow:0 12px 32px rgba(2,8,23,.4),inset 0 1px 0 rgba(103,232,249,.12)}
      .ueben-start-cta:hover{transform:translateY(-2px);border-color:rgba(103,232,249,.75);box-shadow:0 16px 40px rgba(2,8,23,.45),0 0 28px rgba(34,211,238,.18)}
      .ueben-start-cta:active{transform:translateY(0)}
      .ueben-start-cta__glow{position:absolute;inset:auto -20% -60% 20%;height:120%;border-radius:50%;background:radial-gradient(circle,rgba(34,211,238,.28),transparent 65%);pointer-events:none}
      .ueben-start-cta__copy{position:relative;display:grid;gap:4px;flex:1;min-width:0}
      .ueben-start-cta__eyebrow{font-size:.72rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#67e8f9}
      .ueben-start-cta__title{font-size:1.35rem;font-weight:900;letter-spacing:.02em;line-height:1.15}
      .ueben-start-cta__hint{font-size:.9rem;font-weight:600;line-height:1.4;color:#94a3b8}
      .ueben-start-cta__arrow{position:relative;flex:0 0 auto;font-size:1.35rem;font-weight:900;color:#67e8f9}
      .ueben-pick{display:grid;gap:12px}
      .ueben-pick__bar{display:flex;justify-content:flex-start}
      .ueben-subject-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px}
      .ueben-subject-chip{position:relative;display:flex;align-items:center;gap:10px;min-height:64px;padding:10px 12px;border-radius:16px;border:1px solid rgba(148,163,184,.28);background:linear-gradient(160deg,rgba(15,23,42,.92),rgba(8,47,73,.55));color:#e2e8f0;font-weight:800;font-size:.98rem;text-align:left;cursor:pointer;-webkit-tap-highlight-color:transparent;transition:transform .12s ease,border-color .12s ease,box-shadow .12s ease}
      .ueben-subject-chip:hover{transform:translateY(-1px);border-color:rgba(34,211,238,.55);box-shadow:0 10px 24px rgba(2,8,23,.35)}
      .ueben-subject-chip.is-done{opacity:.72;border-color:rgba(52,211,153,.4)}
      .ueben-subject-chip__art{flex:0 0 36px;width:36px;height:36px;border-radius:10px;overflow:hidden;background:rgba(8,47,73,.8)}
      .ueben-subject-chip__art img{width:100%;height:100%;object-fit:cover;display:block}
      .ueben-subject-chip__dot{flex:0 0 10px;width:10px;height:10px;border-radius:50%;background:var(--hub-accent,#22d3ee);box-shadow:0 0 10px color-mix(in srgb,var(--hub-accent,#22d3ee) 55%,transparent)}
      .ueben-subject-chip__label{flex:1;line-height:1.2}
      .ueben-subject-chip__badge{font-size:.68rem;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:#a7f3d0;background:rgba(6,78,59,.45);border:1px solid rgba(52,211,153,.35);border-radius:999px;padding:3px 8px}
      .ueben-entry-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px}
      @media (max-width:640px){
        .ueben-subject-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
        .ueben-start-cta{padding:16px 14px;gap:12px}
        .ueben-start-cta__title{font-size:1.2rem}
      }
    </style>`;
  }

  function bindHandlers(root) {
    root.querySelector("#uebenStartBtn")?.addEventListener("click", () => {
      state.picking = true;
      render();
      document
        .getElementById("uebenStartBlock")
        ?.scrollIntoView?.({ behavior: "smooth", block: "start" });
    });

    root.querySelector("#uebenPickBack")?.addEventListener("click", () => {
      state.picking = false;
      render();
    });

    root.querySelectorAll("[data-ueben-subject]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const subject = btn.getAttribute("data-ueben-subject");
        const existing = practiceEntries().find(
          (e) =>
            String(e.subject || "").toLowerCase() === String(subject || "").toLowerCase()
        );
        if (existing?.id) {
          if (isEditableDate(state.date) && !existing.hasReflection) {
            window.StudentRouter?.navigateToSection("reflect", {
              query: new URLSearchParams({ entryId: existing.id, practice: "1" })
            });
            return;
          }
          window.StudentRouter?.navigateToSection("plan", {
            query: new URLSearchParams({
              entryId: existing.id,
              practice: "1",
              date: state.date || ""
            })
          });
          return;
        }
        startPractice(subject);
      });
    });

    root.querySelectorAll("[data-nav]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const nav = btn.getAttribute("data-nav");
        const query = new URLSearchParams(btn.getAttribute("data-query") || "");
        window.StudentRouter?.navigateToSection(nav, { query });
      });
    });
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

    if (!editable) state.picking = false;

    const items = practiceEntries();

    root.innerHTML = `
      ${styles()}
      <div class="ueben-page">
        ${renderStartBlock(editable)}

        <section class="ueben-block">
          <div class="ueben-block__head">
            <p class="ueben-block__eyebrow">Heute</p>
            <h3 class="ueben-block__title">${
              items.length ? "Deine Übungen" : "Noch keine Übung gestartet"
            }</h3>
            <p class="ueben-block__text">${
              items.length
                ? "Offene Übungen abschließen – oder oben eine neue starten."
                : "Tippe auf „Üben starten“, um dein erstes Übungsziel zu setzen."
            }</p>
          </div>
          ${
            items.length
              ? `<div class="ueben-entry-grid">${items
                  .map((e) => renderEntryTile(e, editable))
                  .join("")}</div>`
              : ""
          }
        </section>
      </div>`;

    bindHandlers(root);
  }

  function init() {
    loadDay(todayIso());
  }

  window.LogbuchUeben = { init };
})();
