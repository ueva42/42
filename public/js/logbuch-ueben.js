/**
 * SRL-Logbuch – Üben zu Hause (freie Fachwahl, Tagesziel + Abschluss).
 * „Üben starten“ → Fach-Modal (Strategy-Tiles) → Plan mit practice=1&subject=…
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

  function subjectAccentHex(name) {
    const map = {
      orange: "#f97316",
      cyan: "#22d3ee",
      blue: "#3b82f6",
      violet: "#a78bfa",
      magenta: "#e879f9",
      green: "#34d399",
      gold: "#fbbf24",
      teal: "#2dd4bf",
      pink: "#f472b6",
      purple: "#a855f7"
    };
    return map[subjectAccent(name)] || "#22d3ee";
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
    closeSubjectModal();
    const q = new URLSearchParams({
      practice: "1",
      date: state.date || todayIso(),
      subject
    });
    window.StudentRouter?.navigateToSection("plan", { query: q });
  }

  function closeSubjectModal() {
    state.picking = false;
    document.removeEventListener("keydown", onSubjectModalKeydown);
    document.querySelectorAll("body > .ueben-subject-modal-backdrop").forEach((el) => el.remove());
  }

  function subjectTiles() {
    const taken = new Set(practiceEntries().map((e) => String(e.subject || "").toLowerCase()));
    return subjectOptions().map((s) => {
      const done = taken.has(String(s).toLowerCase());
      return {
        value: s,
        title: s,
        desc: done ? "Heute schon gestartet" : "Übungsziel setzen",
        icon: "◆",
        accent: subjectAccentHex(s),
        disabled: false
      };
    });
  }

  function onSubjectModalKeydown(ev) {
    if (ev.key === "Escape") closeSubjectModal();
  }

  function openSubjectModal() {
    if (!isEditableDate(state.date)) return;
    closeSubjectModal();
    state.picking = true;
    const ui = UI();
    const V = window.LogbuchVisuals;
    const tiles = subjectTiles();
    const grid = V
      ? V.strategyTileGrid(tiles, null, "data-ueben-subject")
      : `<div class="strategy-tile-grid">${tiles
          .map(
            (t) =>
              `<button type="button" class="strategy-tile" data-ueben-subject="${ui.escapeHtml(
                t.value
              )}" style="--tile-accent:${t.accent}"><span class="strategy-tile__title">${ui.escapeHtml(
                t.title
              )}</span></button>`
          )
          .join("")}</div>`;

    const backdrop = document.createElement("div");
    backdrop.className = "plan-next-modal-backdrop plan-next-modal-backdrop--ask ueben-subject-modal-backdrop";
    backdrop.setAttribute("role", "dialog");
    backdrop.setAttribute("aria-modal", "true");
    backdrop.setAttribute("aria-label", "Fach wählen");
    backdrop.innerHTML = `
      <style>
        .ueben-subject-modal{position:relative}
        .ueben-subject-modal__close{position:absolute;top:10px;right:10px;z-index:2;width:40px;height:40px;border:none;border-radius:12px;background:rgba(15,23,42,.55);color:#e2e8f0;font-size:1.25rem;line-height:1;cursor:pointer;-webkit-tap-highlight-color:transparent}
        .ueben-subject-modal__close:hover{background:rgba(51,65,85,.9);color:#fff}
        .ueben-subject-modal .plan-next-modal__title{padding-right:44px}
      </style>
      <div class="plan-next-modal plan-next-modal--ask ueben-subject-modal">
        <button type="button" class="ueben-subject-modal__close" id="uebenPickClose" aria-label="Schließen">✕</button>
        <h3 class="plan-next-modal__title">Fach wählen</h3>
        <p class="plan-next-modal__text">Tippe ein Fach an – danach setzt du dein Übungsziel.</p>
        <div class="plan-ask__body">${grid}</div>
      </div>`;

    document.body.appendChild(backdrop);
    document.addEventListener("keydown", onSubjectModalKeydown);

    const closeBtn = backdrop.querySelector("#uebenPickClose");
    closeBtn?.addEventListener("click", () => closeSubjectModal());
    closeBtn?.focus();

    backdrop.addEventListener("click", (ev) => {
      if (ev.target === backdrop) closeSubjectModal();
    });

    backdrop.querySelectorAll("[data-ueben-subject]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const subject = btn.getAttribute("data-ueben-subject");
        const existing = practiceEntries().find(
          (e) =>
            String(e.subject || "").toLowerCase() === String(subject || "").toLowerCase()
        );
        if (existing?.id) {
          closeSubjectModal();
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
  }

  function renderStartCta(editable) {
    if (!editable) {
      return `
        <p class="ueben-muted">Heute kannst du kein neues Übungsziel starten – schau dir deine Einträge unten an.</p>`;
    }

    return `
      <button type="button" class="ueben-start-cta hub-accent-cyan" id="uebenStartBtn">
        <span class="ueben-start-cta__glow" aria-hidden="true"></span>
        <span class="ueben-start-cta__copy">
          <span class="ueben-start-cta__title">Üben starten</span>
          <span class="ueben-start-cta__hint">Wähle ein Fach und setze dein Übungsziel.</span>
        </span>
        <span class="ueben-start-cta__arrow" aria-hidden="true">→</span>
      </button>`;
  }

  function renderStartBlock(editable) {
    return `
      <section class="ueben-block" id="uebenStartBlock">
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
          <span class="today-subject-tile__time">${done ? "Abgeschlossen" : "Offen"}</span>
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
      .ueben-block__eyebrow{margin:0;font-size:11px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#67e8f9}
      .ueben-block__title{margin:0;font-family:Orbitron,system-ui,sans-serif;font-size:16px;font-weight:700;color:#f8fafc;letter-spacing:.05em;line-height:1.25}
      .ueben-block__text{margin:0;font-size:13px;line-height:1.45;color:#94a3b8;max-width:42rem}
      .ueben-muted{margin:0;color:#94a3b8;font-size:13px;line-height:1.45}
      .ueben-start-cta{position:relative;display:flex;align-items:center;gap:16px;width:100%;max-width:36rem;padding:18px 20px;border-radius:18px;border:1px solid rgba(34,211,238,.45);background:linear-gradient(155deg,rgba(8,47,73,.95),rgba(15,23,42,.92) 55%,rgba(6,78,59,.35));color:#f8fafc;text-align:left;cursor:pointer;-webkit-tap-highlight-color:transparent;overflow:hidden;transition:transform .14s ease,border-color .14s ease,box-shadow .14s ease;box-shadow:0 12px 32px rgba(2,8,23,.4),inset 0 1px 0 rgba(103,232,249,.12)}
      .ueben-start-cta:hover{transform:translateY(-2px);border-color:rgba(103,232,249,.75);box-shadow:0 16px 40px rgba(2,8,23,.45),0 0 28px rgba(34,211,238,.18)}
      .ueben-start-cta:active{transform:translateY(0)}
      .ueben-start-cta__glow{position:absolute;inset:auto -20% -60% 20%;height:120%;border-radius:50%;background:radial-gradient(circle,rgba(34,211,238,.28),transparent 65%);pointer-events:none}
      .ueben-start-cta__copy{position:relative;display:grid;gap:4px;flex:1;min-width:0}
      .ueben-start-cta__title{font-family:Orbitron,system-ui,sans-serif;font-size:16px;font-weight:700;letter-spacing:.05em;line-height:1.25}
      .ueben-start-cta__hint{font-size:13px;font-weight:600;line-height:1.45;color:#94a3b8}
      .ueben-start-cta__arrow{position:relative;flex:0 0 auto;font-size:16px;font-weight:900;line-height:1;color:#67e8f9}
      .ueben-entry-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px}
      @media (max-width:640px){
        .ueben-start-cta{padding:16px 14px;gap:12px}
        .ueben-start-cta__title{font-size:16px}
      }
    </style>`;
  }

  function bindHandlers(root) {
    root.querySelector("#uebenStartBtn")?.addEventListener("click", () => {
      openSubjectModal();
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

    if (!editable) closeSubjectModal();

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
    closeSubjectModal();
    loadDay(todayIso());
  }

  window.LogbuchUeben = { init, openSubjectModal };
})();
