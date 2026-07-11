/**
 * SRL-Logbuch – Levelplan / Mein Lernstand (App-Layout wie Mein Tag).
 */
(function () {
  const TIER_META = [
    { id: "rookie", label: "Rookie", textKey: "rookieGoalText" },
    { id: "operator", label: "Operator", textKey: "operatorGoalText" },
    { id: "street_legend", label: "Street Legend", textKey: "streetLegendGoalText" }
  ];

  const DEFAULT_STATUS_OPTIONS = [
    { id: "offen", label: "offen" },
    { id: "in_arbeit", label: "in Arbeit" },
    { id: "sicher", label: "sicher" }
  ];

  const state = {
    data: null,
    selectedSubject: null,
    selectedThemaId: null,
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
    const meta = TIER_META.find((t) => t.id === tier.id);
    const text = meta ? goal[meta.textKey] : null;
    return text && String(text).trim() ? String(text).trim() : "–";
  }

  function tierStatus(goal, tierId) {
    const entry = goal.mark?.tiers?.[tierId];
    if (!entry) return "offen";
    if (typeof entry === "object" && entry.status) return entry.status;
    return "sicher";
  }

  function statusBadgeClass(status) {
    if (status === "sicher") return "status-badge--ok";
    if (status === "in_arbeit") return "status-badge--part";
    return "status-badge--open";
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
    for (const group of state.data?.grouped || []) {
      for (const lc of group.levelChecks || []) {
        for (const goal of lc.goals || []) {
          for (const tier of TIER_META) {
            total++;
            const st = tierStatus(goal, tier.id);
            if (st === "sicher") sicher++;
            else if (st === "in_arbeit") inArbeit++;
          }
        }
      }
    }
    return { total, sicher, inArbeit, pct: total ? Math.round((sicher / total) * 100) : 0 };
  }

  function renderSubtopicCard(goal) {
    const tiers = TIER_META.map((tier) => {
      const key = `${goal.id}_${tier.id}`;
      const busy = state.saving === key;
      const currentStatus = tierStatus(goal, tier.id);
      const options = statusOptions()
        .map(
          (opt) =>
            `<option value="${escapeHtml(opt.id)}" ${opt.id === currentStatus ? "selected" : ""}>${escapeHtml(opt.label)}</option>`
        )
        .join("");

      return `
        <div class="lp-tier-compact">
          <span class="status-badge ${statusBadgeClass(currentStatus)}">${escapeHtml(tier.label)}</span>
          <p class="goal-card__what">${escapeHtml(tierGoalText(goal, tier))}</p>
          <select class="logbuch-select lp-tier-status" data-goal-id="${escapeHtml(goal.id)}" data-tier="${escapeHtml(tier.id)}" ${busy ? "disabled" : ""}>${options}</select>
        </div>`;
    }).join("");

    return `
      <article class="student-card goal-card">
        <div class="card-content">
          <p class="goal-card__subject">${escapeHtml(goal.text)}</p>
          <div class="lp-tier-compact-list">${tiers}</div>
        </div>
      </article>`;
  }

  function renderContent() {
    const visuals = V();
    if (!state.data?.hasClass) {
      return visuals?.emptyState({
        title: "Dir ist noch keine Klasse zugeordnet.",
        text: "Bitte wende dich an deine Lehrkraft.",
        heroSrc: "/icons/student/hero/lernstand-hero.png"
      }) || "";
    }

    const subjects = subjectsWithData();
    if (!subjects.length) {
      return visuals?.emptyState({
        title: "Noch kein Levelplan importiert.",
        text: "Deine Lehrkraft legt den Plan im Admin-Bereich an.",
        heroSrc: "/icons/student/hero/lernstand-hero.png"
      }) || "";
    }

    ensureSelection();
    const themen = levelChecksForSubject(state.selectedSubject);
    const thema = selectedThema();

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

    let body = "";
    if (!thema?.goals?.length) {
      body = visuals?.emptyState({
        title: "Noch keine Unterthemen.",
        text: "Für dieses Thema wurden noch keine Ziele angelegt."
      }) || "";
    } else {
      body = `<div class="goal-card-grid">${thema.goals.map(renderSubtopicCard).join("")}</div>`;
    }

    return `${subjectChips || ""}${themaChips || ""}${visuals?.sectionBlock("Deine Unterthemen", body) || body}`;
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

    const { total, sicher, inArbeit, pct } = computeProgress();
    const kpi = visuals?.pageKpi(
      [
        { value: sicher, label: "Sicher", accent: true },
        { value: inArbeit, label: "In Arbeit" },
        { value: Math.max(0, total - sicher - inArbeit), label: "Offen" },
        { value: total, label: "Level gesamt" }
      ],
      pct,
      `${pct}%`,
      "Fortschritt"
    );

    root.innerHTML = visuals?.pageShell(`
      ${kpi || ""}
      ${state.message ? `<div class="logbuch-msg logbuch-msg-ok">${escapeHtml(state.message)}</div>` : ""}
      ${state.error ? `<div class="logbuch-msg logbuch-msg-error">${escapeHtml(state.error)}</div>` : ""}
      ${renderContent()}
    `) || "";

    bindHandlers(root);
  }

  function bindHandlers(root) {
    root.querySelectorAll("[data-lp-subject]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.selectedSubject = btn.dataset.lpSubject;
        state.selectedThemaId = null;
        state.message = "";
        state.error = "";
        ensureSelection();
        render();
      });
    });

    root.querySelectorAll("[data-lp-thema]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.selectedThemaId = btn.dataset.lpThema;
        state.message = "";
        state.error = "";
        render();
      });
    });

    root.querySelectorAll(".lp-tier-status").forEach((select) => {
      select.addEventListener("change", () =>
        setStatus(select.dataset.goalId, select.dataset.tier, select.value)
      );
    });
  }

  async function setStatus(goalId, tier, status) {
    state.saving = `${goalId}_${tier}`;
    state.error = "";
    state.message = "";
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
        render();
        return;
      }
      state.message = data.statusLabel ? `Status gespeichert: ${data.statusLabel}.` : "Status gespeichert.";
      await loadData(initGeneration);
    } catch (err) {
      console.error(err);
      state.saving = null;
      state.error = "Netzwerkfehler.";
      render();
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
