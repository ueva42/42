/**
 * SRL-Logbuch – Levelplan / Mein Lernstand (kompakte Tabellenansicht).
 */
(function () {
  const TIER_META = [
    { id: "rookie", label: "Rookie", textKey: "rookieGoalText", colClass: "lp-col--rookie" },
    { id: "operator", label: "Operator", textKey: "operatorGoalText", colClass: "lp-col--operator" },
    {
      id: "street_legend",
      label: "Street Legend",
      textKey: "streetLegendGoalText",
      colClass: "lp-col--legend"
    }
  ];

  const STATUS_META = {
    offen: { label: "Offen", icon: "○", cellClass: "lp-status-cell--offen" },
    in_arbeit: { label: "In Arbeit", icon: "◑", cellClass: "lp-status-cell--arbeit" },
    sicher: { label: "Sicher", icon: "✓", cellClass: "lp-status-cell--sicher" }
  };

  const DEFAULT_STATUS_OPTIONS = [
    { id: "offen", label: "Offen" },
    { id: "in_arbeit", label: "In Arbeit" },
    { id: "sicher", label: "Sicher" }
  ];

  const STATUS_FILTERS = [
    { id: "all", label: "Alle" },
    { id: "offen", label: "Offen" },
    { id: "in_arbeit", label: "In Arbeit" },
    { id: "sicher", label: "Sicher" }
  ];

  const state = {
    data: null,
    selectedSubject: null,
    selectedThemaId: null,
    statusFilter: "all",
    expandedGoalId: null,
    popover: null,
    loading: false,
    saving: null,
    message: "",
    error: ""
  };

  let initPromise = null;
  let initGeneration = 0;
  let loadRequestId = 0;

  const V = () => window.LogbuchVisuals;

  async function fetchJson(url, options = {}, retries = 1) {
    let lastErr = null;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await fetch(url, options);
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

  function escapeHtml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function activeTiers() {
    const ids = (state.data?.activeLevels || []).map((t) => (typeof t === "string" ? t : t.id));
    const filtered = TIER_META.filter((t) => ids.includes(t.id));
    return filtered.length ? filtered : TIER_META;
  }

  function statusOptions() {
    return Array.isArray(state.data?.statusOptions) && state.data.statusOptions.length
      ? state.data.statusOptions
      : DEFAULT_STATUS_OPTIONS;
  }

  function subjectsWithData() {
    return (state.data?.grouped || []).filter((g) =>
      (g.levelChecks || []).some((lc) => (lc.goals || []).length)
    );
  }

  function levelChecksForSubject(subject) {
    const group = (state.data?.grouped || []).find((g) => g.subject === subject);
    return (group?.levelChecks || []).filter((lc) => (lc.goals || []).length);
  }

  function selectedThema() {
    if (!state.selectedThemaId) return null;
    return levelChecksForSubject(state.selectedSubject).find(
      (lc) => String(lc.id) === String(state.selectedThemaId)
    );
  }

  function tierGoalText(goal, tier) {
    const text = goal[tier.textKey];
    return text && String(text).trim() ? String(text).trim() : "–";
  }

  function tierStatus(goal, tierId) {
    const entry = goal.mark?.tiers?.[tierId];
    if (!entry) return "offen";
    if (typeof entry === "object" && entry.status) return entry.status;
    return "sicher";
  }

  function goalMatchesStatusFilter(goal) {
    if (state.statusFilter === "all") return true;
    return activeTiers().some((tier) => tierStatus(goal, tier.id) === state.statusFilter);
  }

  function ensureSelection() {
    const subjects = subjectsWithData();
    if (!subjects.length) {
      state.selectedSubject = null;
      state.selectedThemaId = null;
      return;
    }
    if (!state.selectedSubject || !subjects.some((g) => g.subject === state.selectedSubject)) {
      state.selectedSubject = subjects[0].subject;
    }
    const themen = levelChecksForSubject(state.selectedSubject);
    if (!themen.length) {
      state.selectedThemaId = null;
      return;
    }
    if (!state.selectedThemaId || !themen.some((t) => String(t.id) === String(state.selectedThemaId))) {
      state.selectedThemaId = themen[0].id;
    }
  }

  function computeProgress() {
    let total = 0;
    let sicher = 0;
    let inArbeit = 0;
    const tiers = activeTiers();
    for (const group of state.data?.grouped || []) {
      for (const lc of group.levelChecks || []) {
        for (const goal of lc.goals || []) {
          for (const tier of tiers) {
            total++;
            const st = tierStatus(goal, tier.id);
            if (st === "sicher") sicher++;
            else if (st === "in_arbeit") inArbeit++;
          }
        }
      }
    }
    const offen = Math.max(0, total - sicher - inArbeit);
    return {
      total,
      sicher,
      inArbeit,
      offen,
      pct: total ? Math.round((sicher / total) * 100) : 0
    };
  }

  function findGoal(goalId) {
    for (const group of state.data?.grouped || []) {
      for (const lc of group.levelChecks || []) {
        const goal = (lc.goals || []).find((g) => String(g.id) === String(goalId));
        if (goal) return goal;
      }
    }
    return null;
  }

  function applyStatusLocally(goalId, tier, status) {
    const goal = findGoal(goalId);
    if (!goal) return;
    if (!goal.mark) goal.mark = { tiers: {} };
    if (!goal.mark.tiers) goal.mark.tiers = {};
    if (status === "offen") {
      delete goal.mark.tiers[tier];
      if (!Object.keys(goal.mark.tiers).length) goal.mark = null;
    } else {
      goal.mark.tiers[tier] = { status };
    }
  }

  function renderMaterialCell(goal) {
    const material = goal.material || null;
    const type = material?.type || goal.materialType || (goal.practiceUrl ? "url" : "none");
    if (type === "url" && (material?.url || goal.practiceUrl)) {
      const url = material?.url || goal.practiceUrl;
      const label = material?.label || goal.materialLabel || "Aufgaben öffnen";
      return `<a class="lp-material-link" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`;
    }
    if (type === "reference" || type === "note") {
      const parts = [material?.label || goal.materialLabel, material?.note || goal.materialNote].filter(Boolean);
      if (parts.length) {
        return `<span class="lp-material-hint">${escapeHtml(parts.join(" · "))}</span>`;
      }
    }
    return `<span class="lp-material-empty" aria-hidden="true">–</span>`;
  }

  function renderStatusButton(goal, tier) {
    const key = `${goal.id}_${tier.id}`;
    const busy = state.saving === key;
    const status = tierStatus(goal, tier.id);
    const meta = STATUS_META[status] || STATUS_META.offen;
    const isOpen =
      state.popover &&
      state.popover.goalId === goal.id &&
      state.popover.tier === tier.id;

    return `
      <div class="lp-status-wrap ${isOpen ? "is-open" : ""}">
        <button
          type="button"
          class="lp-status-cell ${meta.cellClass} ${busy ? "is-busy" : ""}"
          data-lp-status="${escapeHtml(goal.id)}"
          data-lp-tier="${escapeHtml(tier.id)}"
          aria-label="${escapeHtml(tier.label)}: ${escapeHtml(meta.label)}"
          aria-haspopup="listbox"
          aria-expanded="${isOpen ? "true" : "false"}"
          title="Klicken zum Ändern"
          ${busy ? "disabled" : ""}
        >
          <span class="lp-status-cell__icon" aria-hidden="true">${meta.icon}</span>
          <span class="lp-status-cell__label">${escapeHtml(meta.label)}</span>
        </button>
        ${
          isOpen
            ? `<div class="lp-status-picker" role="listbox" aria-label="Status wählen">
                ${statusOptions()
                  .map(
                    (opt) => `
                  <button
                    type="button"
                    class="lp-status-picker__opt ${opt.id === status ? "is-active" : ""}"
                    data-lp-pick="${escapeHtml(opt.id)}"
                    data-lp-pick-goal="${escapeHtml(goal.id)}"
                    data-lp-pick-tier="${escapeHtml(tier.id)}"
                    role="option"
                    aria-selected="${opt.id === status ? "true" : "false"}"
                  >${escapeHtml(opt.label)}</button>`
                  )
                  .join("")}
              </div>`
            : ""
        }
      </div>`;
  }

  function renderStatusCell(goal, tier) {
    return `
      <td class="${tier.colClass}">
        ${renderStatusButton(goal, tier)}
      </td>`;
  }

  function renderDetailRow(goal, colSpan) {
    const tiers = activeTiers();
    return `
      <tr class="lp-detail-row">
        <td colspan="${colSpan}">
          <div class="lp-detail-panel">
            <p class="lp-detail-panel__title">${escapeHtml(goal.text)}</p>
            ${tiers
              .map(
                (tier) => `
              <div class="lp-detail-panel__tier">
                <span class="lp-detail-panel__tier-label ${tier.colClass}">${escapeHtml(tier.label)}</span>
                <p>${escapeHtml(tierGoalText(goal, tier))}</p>
              </div>`
              )
              .join("")}
            <div class="lp-detail-panel__material">${renderMaterialCell(goal)}</div>
          </div>
        </td>
      </tr>`;
  }

  function renderDesktopTable(goals) {
    const tiers = activeTiers();
    const colSpan = 2 + tiers.length;
    const headerCells = tiers
      .map((tier) => `<th class="${tier.colClass}">${escapeHtml(tier.label)}</th>`)
      .join("");

    const rows = goals
      .map((goal) => {
        const expanded = String(state.expandedGoalId) === String(goal.id);
        const main = `
          <tr class="lp-table__row ${expanded ? "is-expanded" : ""}">
            <th scope="row" class="lp-table__topic">
              <button type="button" class="lp-topic-btn" data-lp-expand="${escapeHtml(goal.id)}" aria-expanded="${expanded ? "true" : "false"}">
                <span class="lp-topic-btn__title">${escapeHtml(goal.text)}</span>
              </button>
            </th>
            ${tiers.map((tier) => renderStatusCell(goal, tier)).join("")}
            <td class="lp-table__material">${renderMaterialCell(goal)}</td>
          </tr>`;
        return main + (expanded ? renderDetailRow(goal, colSpan) : "");
      })
      .join("");

    const lernstandHeader = tiers.length === 1 ? "Lernstand" : "";

    return `
      <div class="lp-table-wrap" role="region" aria-label="Lernstandstabelle">
        <table class="lp-table">
          <thead>
            <tr>
              <th>Unterthema</th>
              ${tiers.length === 1 ? `<th>${escapeHtml(lernstandHeader || tiers[0].label)}</th>` : headerCells}
              <th>Material</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }

  function renderMobileCards(goals) {
    const tiers = activeTiers();
    return `
      <div class="lp-mobile-list">
        ${goals
          .map((goal) => {
            const expanded = String(state.expandedGoalId) === String(goal.id);
            return `
            <article class="lp-mobile-card">
              <button type="button" class="lp-mobile-card__head" data-lp-expand="${escapeHtml(goal.id)}" aria-expanded="${expanded ? "true" : "false"}">
                <h4>${escapeHtml(goal.text)}</h4>
              </button>
              <div class="lp-mobile-card__tiers">
                ${tiers
                  .map(
                    (tier) => `
                  <div class="lp-mobile-tier ${tier.colClass}">
                    <span class="lp-mobile-tier__label">${escapeHtml(tier.label)}</span>
                    <div class="lp-mobile-tier__cell">${renderStatusButton(goal, tier)}</div>
                  </div>`
                  )
                  .join("")}
              </div>
              <div class="lp-mobile-card__material">${renderMaterialCell(goal)}</div>
              ${
                expanded
                  ? `<div class="lp-mobile-card__detail">${renderDetailRow(goal, 1)
                      .replace(/<\/?tr[^>]*>/g, "")
                      .replace(/<td[^>]*>/, "")
                      .replace(/<\/td>/, "")}</div>`
                  : ""
              }
            </article>`;
          })
          .join("")}
      </div>`;
  }

  function renderOverview() {
    const visuals = V();
    const { total, sicher, inArbeit, offen, pct } = computeProgress();
    const ring = visuals
      ? visuals.circularProgress({
          completed: sicher,
          total: total || 1,
          label: "Gesamtfortschritt",
          sublabel: `${sicher} von ${total}`,
          size: 96,
          accent: "#22c55e"
        })
      : "";

    return `
      <section class="lp-dash" aria-label="Lernstand Überblick">
        <article class="lp-dash__featured">
          <div class="lp-dash__featured-copy">
            <p class="lp-dash__featured-eyebrow">Mein Lernstand</p>
            <h3 class="lp-dash__featured-title">Gesamtfortschritt</h3>
            <p class="lp-dash__featured-sub">${total} Kompetenzen insgesamt</p>
          </div>
          <div class="lp-dash__ring">${ring}</div>
        </article>
        <div class="lp-dash__row">
          <article class="lp-dash__metric lp-dash__metric--green">
            <p class="lp-dash__metric-label">Sicher</p>
            <p class="lp-dash__metric-value">${sicher}</p>
          </article>
          <article class="lp-dash__metric lp-dash__metric--cyan">
            <p class="lp-dash__metric-label">In Arbeit</p>
            <p class="lp-dash__metric-value">${inArbeit}</p>
          </article>
          <article class="lp-dash__metric lp-dash__metric--muted">
            <p class="lp-dash__metric-label">Offen</p>
            <p class="lp-dash__metric-value">${offen}</p>
          </article>
          <article class="lp-dash__metric lp-dash__metric--violet">
            <p class="lp-dash__metric-label">Kompetenzen</p>
            <p class="lp-dash__metric-value">${total}</p>
            <p class="lp-dash__metric-sub">${pct} % sicher</p>
          </article>
        </div>
      </section>`;
  }

  function renderFilters() {
    const visuals = V();
    const subjects = subjectsWithData();
    const themen = levelChecksForSubject(state.selectedSubject);

    const subjectChips = visuals?.chipBar(
      subjects.map((g) => ({ value: g.subject, label: g.subject })),
      state.selectedSubject,
      "data-lp-subject"
    );

    const themaChips = themen.length
      ? visuals.chipBar(
          themen.map((t) => ({ value: String(t.id), label: t.name })),
          String(state.selectedThemaId),
          "data-lp-thema"
        )
      : "";

    const statusChips = `
      <div class="lp-filter-bar">
        <span class="lp-filter-bar__label">Status</span>
        <div class="day-chip-bar">
          ${STATUS_FILTERS.map(
            (f) =>
              `<button type="button" class="day-chip ${state.statusFilter === f.id ? "is-active" : ""}" data-lp-status-filter="${escapeHtml(f.id)}">${escapeHtml(f.label)}</button>`
          ).join("")}
        </div>
      </div>`;

    return `${subjectChips || ""}${themaChips || ""}${statusChips}`;
  }

  function renderContent() {
    const visuals = V();
    if (!state.data?.hasClass) {
      return (
        visuals?.emptyState({
          title: "Dir ist noch keine Klasse zugeordnet.",
          text: "Bitte wende dich an deine Lehrkraft.",
          heroSrc: "/icons/student/hero/lernstand-hero.png"
        }) || ""
      );
    }

    const subjects = subjectsWithData();
    if (!subjects.length) {
      return (
        visuals?.emptyState({
          title: "Noch kein Levelplan importiert.",
          text: "Deine Lehrkraft legt den Plan im Admin-Bereich an.",
          heroSrc: "/icons/student/hero/lernstand-hero.png"
        }) || ""
      );
    }

    ensureSelection();
    const thema = selectedThema();
    const goals = (thema?.goals || []).filter(goalMatchesStatusFilter);

    if (!thema?.goals?.length) {
      return (
        visuals?.emptyState({
          title: "Noch keine Unterthemen.",
          text: "Für dieses Thema wurden noch keine Ziele angelegt."
        }) || ""
      );
    }

    if (!goals.length) {
      return (
        visuals?.emptyState({
          title: "Keine Treffer.",
          text: "Für diesen Statusfilter gibt es in diesem Thema keine Unterthemen."
        }) || ""
      );
    }

    return `
      <div class="lp-content">
        <p class="lp-table-hint">Tippe auf eine Zelle unter Rookie, Operator oder Street Legend – dann wählst du <strong>Offen</strong>, <strong>In Arbeit</strong> oder <strong>Sicher</strong>.</p>
        <div class="lp-content__desktop">${renderDesktopTable(goals)}</div>
        <div class="lp-content__mobile">${renderMobileCards(goals)}</div>
      </div>`;
  }

  function render() {
    const root = document.getElementById("levelplan-screen-root");
    if (!root) return;
    const visuals = V();

    if (state.loading && !state.data) {
      root.innerHTML = `<div class="logbuch-loading">Lade Levelplan…</div>`;
      return;
    }
    if (!state.data) {
      root.innerHTML = `<div class="logbuch-msg logbuch-msg-error">Levelplan konnte nicht geladen werden.</div>`;
      return;
    }

    root.innerHTML =
      visuals?.pageShell(`
      ${renderOverview()}
      ${state.message ? `<div class="logbuch-msg logbuch-msg-ok">${escapeHtml(state.message)}</div>` : ""}
      ${state.error ? `<div class="logbuch-msg logbuch-msg-error">${escapeHtml(state.error)}</div>` : ""}
      ${renderFilters()}
      ${renderContent()}
    `) || "";

    bindHandlers(root);
  }

  function closePopover() {
    state.popover = null;
  }

  function bindHandlers(root) {
    root.querySelectorAll("[data-lp-subject]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.selectedSubject = btn.dataset.lpSubject;
        state.selectedThemaId = null;
        state.expandedGoalId = null;
        closePopover();
        state.message = "";
        state.error = "";
        ensureSelection();
        render();
      });
    });

    root.querySelectorAll("[data-lp-thema]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.selectedThemaId = btn.dataset.lpThema;
        state.expandedGoalId = null;
        closePopover();
        state.message = "";
        state.error = "";
        render();
      });
    });

    root.querySelectorAll("[data-lp-status-filter]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.statusFilter = btn.dataset.lpStatusFilter;
        state.expandedGoalId = null;
        closePopover();
        render();
      });
    });

    root.querySelectorAll("[data-lp-expand]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.lpExpand;
        state.expandedGoalId = String(state.expandedGoalId) === String(id) ? null : id;
        closePopover();
        render();
      });
    });

    root.querySelectorAll("[data-lp-status]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const goalId = btn.dataset.lpStatus;
        const tier = btn.dataset.lpTier;
        if (
          state.popover &&
          state.popover.goalId === goalId &&
          state.popover.tier === tier
        ) {
          closePopover();
        } else {
          state.popover = { goalId, tier };
        }
        render();
      });
    });

    root.querySelectorAll("[data-lp-pick]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const goalId = btn.dataset.lpPickGoal;
        const tier = btn.dataset.lpPickTier;
        const status = btn.dataset.lpPick;
        closePopover();
        setStatus(goalId, tier, status);
      });
    });

    if (state.popover) {
      const onDocClick = (e) => {
        if (
          !e.target.closest(".lp-status-wrap") &&
          !e.target.closest(".lp-status-picker")
        ) {
          closePopover();
          document.removeEventListener("click", onDocClick);
          render();
        }
      };
      setTimeout(() => document.addEventListener("click", onDocClick), 0);
    }
  }

  async function setStatus(goalId, tier, status) {
    state.saving = `${goalId}_${tier}`;
    state.error = "";
    state.message = "";
    applyStatusLocally(goalId, tier, status);
    render();

    try {
      const res = await fetch("/api/student/levelcheck-mark", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goalId, tier, status })
      });
      const data = await res.json();
      state.saving = null;
      if (!data.success) {
        state.error = data.message || "Speichern fehlgeschlagen.";
        await loadData(initGeneration);
        return;
      }
      state.message = data.statusLabel ? `Status: ${data.statusLabel}` : "Status gespeichert.";
      render();
    } catch (err) {
      console.error(err);
      state.saving = null;
      state.error = "Netzwerkfehler.";
      await loadData(initGeneration);
    }
  }

  async function loadData(generation = initGeneration) {
    const requestId = ++loadRequestId;
    try {
      const data = await fetchJson("/api/student/levelplan");
      if (requestId !== loadRequestId || generation !== initGeneration) return;
      if (!data || typeof data.hasClass !== "boolean" || !Array.isArray(data.grouped)) {
        throw new Error("Ungültige Levelplan-Antwort");
      }
      state.data = data;
      state.loading = false;
      ensureSelection();
      render();
    } catch (err) {
      console.error(err);
      if (requestId !== loadRequestId || generation !== initGeneration) return;
      state.loading = false;
      state.data = null;
      render();
    }
  }

  async function initInternal() {
    const generation = ++initGeneration;
    state.loading = true;
    state.saving = null;
    state.message = "";
    state.error = "";
    state.popover = null;
    const root = document.getElementById("levelplan-screen-root");
    if (root) root.innerHTML = `<div class="logbuch-loading">Lade Levelplan…</div>`;
    await loadData(generation);
  }

  function init() {
    if (initPromise) return initPromise;
    initPromise = initInternal().finally(() => {
      initPromise = null;
    });
    return initPromise;
  }

  window.LogbuchLevelplan = { init };
})();
