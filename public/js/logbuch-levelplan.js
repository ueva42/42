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
    focusGoalId: null,
    fromPlan: false,
    pendingSubject: null,
    pendingThemaId: null,
    pendingGoalId: null,
    popover: null,
    loading: false,
    saving: null,
    message: "",
    error: "",
    focusLevelcheckGoals: true
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

  function isUpcomingGradedThema(thema) {
    const t = thema?.target;
    if (!t) return false;
    if (t.isPastArbeit) return false;
    if (!t.checkpointDate) return false;
    if (t.hasGradedCheckpoint !== true && t.requiresTargetGrade !== true) return false;
    const type = String(t.checkpointType || "").toLowerCase();
    return !type || type === "klassenarbeit" || type === "test";
  }

  function isDeepLinkedThema(thema) {
    const id = String(thema?.id || "");
    if (state.pendingThemaId && String(state.pendingThemaId) === id) return true;
    if (
      state.pendingGoalId &&
      (thema?.goals || []).some((g) => String(g.id) === String(state.pendingGoalId))
    ) {
      return true;
    }
    return false;
  }

  function subjectsWithData() {
    return (state.data?.grouped || []).filter((g) => levelChecksForSubject(g.subject).length);
  }

  function levelChecksForSubject(subject) {
    const group = (state.data?.grouped || []).find((g) => g.subject === subject);
    return (group?.levelChecks || []).filter((lc) => {
      if (!(lc.goals || []).length) return false;
      return isUpcomingGradedThema(lc) || isDeepLinkedThema(lc);
    });
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

  function applyArrivalQuery(query) {
    const raw = query instanceof URLSearchParams ? query : new URLSearchParams(location.search || "");
    state.pendingSubject = raw.get("subject") || null;
    state.pendingThemaId = raw.get("thema") || raw.get("levelCheckId") || null;
    state.pendingGoalId = raw.get("goal") || raw.get("goalId") || null;
    state.fromPlan = raw.get("from") === "plan";
    if (!state.pendingGoalId) state.focusGoalId = null;
  }

  function ensureSelection() {
    const subjects = subjectsWithData();
    if (!subjects.length) {
      state.selectedSubject = null;
      state.selectedThemaId = null;
      state.pendingSubject = null;
      state.pendingThemaId = null;
      state.pendingGoalId = null;
      return;
    }
    if (state.pendingSubject && subjects.some((g) => g.subject === state.pendingSubject)) {
      state.selectedSubject = state.pendingSubject;
    } else if (!state.selectedSubject || !subjects.some((g) => g.subject === state.selectedSubject)) {
      state.selectedSubject = subjects[0].subject;
    }
    const themen = levelChecksForSubject(state.selectedSubject);
    if (!themen.length) {
      state.selectedThemaId = null;
      state.pendingSubject = null;
      state.pendingThemaId = null;
      state.pendingGoalId = null;
      return;
    }
    if (state.pendingThemaId && themen.some((t) => String(t.id) === String(state.pendingThemaId))) {
      state.selectedThemaId = state.pendingThemaId;
    } else if (
      !state.selectedThemaId ||
      !themen.some((t) => String(t.id) === String(state.selectedThemaId))
    ) {
      // Prefer theme with an upcoming/past scheduled levelcheck
      const lc = levelchecksForSubject(state.selectedSubject)[0];
      const match = lc
        ? themen.find((t) => String(t.id) === String(lc.levelCheckId))
        : null;
      state.selectedThemaId = match?.id || themen[0].id;
    }
    if (state.pendingGoalId) {
      let found = (selectedThema()?.goals || []).some(
        (g) => String(g.id) === String(state.pendingGoalId)
      );
      if (!found) {
        const matchThema = themen.find((t) =>
          (t.goals || []).some((g) => String(g.id) === String(state.pendingGoalId))
        );
        if (matchThema) {
          state.selectedThemaId = matchThema.id;
          found = true;
        }
      }
      if (found) {
        state.expandedGoalId = state.pendingGoalId;
        state.focusGoalId = state.pendingGoalId;
      }
    }
    state.pendingSubject = null;
    state.pendingThemaId = null;
    state.pendingGoalId = null;
  }

  function passPercent() {
    const n = Number(state.data?.levelcheckPassPercent);
    return Number.isFinite(n) ? n : 70;
  }

  function levelchecksForSubject(subject) {
    return (state.data?.scheduledLevelchecks || []).filter(
      (lc) => !subject || lc.subject === subject
    );
  }

  function levelchecksForThema(themaId) {
    return levelchecksForSubject(state.selectedSubject).filter(
      (lc) => String(lc.levelCheckId) === String(themaId)
    );
  }

  function linkedGoalIdsForThema(themaId) {
    const ids = new Set();
    for (const lc of levelchecksForThema(themaId)) {
      for (const id of lc.linkedGoalIds || []) ids.add(String(id));
    }
    return ids;
  }

  function isLevelcheckLinkedGoal(goalId) {
    return linkedGoalIdsForThema(selectedThema()?.id).has(String(goalId));
  }

  function formatGradeLabel(key) {
    if (!key) return "–";
    return String(key).replace(".", ",");
  }

  function recommendedTierCounts(totalGoals, targetGradeKey) {
    const rules = window.LOGBUCH?.getGradeRequirements?.(targetGradeKey);
    const total = Math.max(0, Number(totalGoals) || 0);
    if (!rules || !total) return null;
    const out = {};
    for (const tier of TIER_META) {
      out[tier.id] = Math.ceil(total * (Number(rules[tier.id]) || 0));
    }
    return out;
  }

  function computeTopicProgress(thema) {
    const goals = thema?.goals || [];
    const tiers = activeTiers();
    const targetGrade = thema?.target?.targetGrade || null;
    const recommended = targetGrade ? recommendedTierCounts(goals.length, targetGrade) : null;

    const required = { total: 0, sicher: 0, inArbeit: 0, offen: 0 };
    const challenge = { total: 0, sicher: 0, inArbeit: 0, offen: 0 };
    const all = { total: 0, sicher: 0, inArbeit: 0, offen: 0 };

    const bump = (bucket, status) => {
      bucket.total++;
      if (status === "sicher") bucket.sicher++;
      else if (status === "in_arbeit") bucket.inArbeit++;
      else bucket.offen++;
    };

    for (const tier of tiers) {
      const requiredCount = recommended?.[tier.id] ?? 0;
      goals.forEach((goal, index) => {
        const status = tierStatus(goal, tier.id);
        if (!targetGrade) {
          bump(all, status);
          return;
        }
        const isRequired = requiredCount > 0 && index < requiredCount;
        bump(isRequired ? required : challenge, status);
      });
    }

    const scope = targetGrade ? required : all;
    const pct = scope.total ? Math.round((scope.sicher / scope.total) * 100) : 0;

    return {
      goalCount: goals.length,
      targetGrade,
      targetGradeLabel: formatGradeLabel(thema?.target?.targetGradeLabel || targetGrade),
      achievedGradeLabel: formatGradeLabel(
        thema?.target?.achievedGradeLabel || thema?.target?.achievedGrade
      ),
      hasTarget: !!targetGrade,
      required,
      challenge,
      all,
      pct,
      recommended
    };
  }

  function computeProgress() {
    const thema = selectedThema();
    if (!thema) {
      return {
        total: 0,
        sicher: 0,
        inArbeit: 0,
        offen: 0,
        pct: 0,
        goalCount: 0,
        hasTarget: false
      };
    }
    const p = computeTopicProgress(thema);
    const bucket = p.hasTarget ? p.required : p.all;
    return {
      total: bucket.total,
      sicher: bucket.sicher,
      inArbeit: bucket.inArbeit,
      offen: bucket.offen,
      pct: p.pct,
      goalCount: p.goalCount,
      hasTarget: p.hasTarget,
      topicProgress: p
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

  function hasQuizMaterial(goal) {
    const material = goal.material || null;
    const type = material?.type || goal.materialType || (goal.practiceUrl ? "url" : "none");
    return type !== "none" || !!goal.practiceUrl;
  }

  function practicePercentOf(goal) {
    const n = Number(goal?.practicePercent);
    return Number.isInteger(n) && n >= 0 && n <= 100 ? n : null;
  }

  function materialLinkLabel(goal, material) {
    const raw = String(material?.label || goal.materialLabel || "").trim();
    if (!raw || /^(quiz|lerncheck)(\s+öffnen)?$/i.test(raw)) return "Material";
    return raw;
  }

  function renderPracticeDial(goal) {
    if (isLevelcheckLinkedGoal(goal.id)) return "";
    if (!hasQuizMaterial(goal)) return "";
    const pct = practicePercentOf(goal);
    const shown = pct == null ? 0 : pct;
    const passed = pct != null && pct >= passPercent();
    return `
      <div class="lp-practice-slider ${passed ? "is-pass" : ""}" data-lp-practice-wrap data-goal-id="${escapeHtml(goal.id)}">
        <div class="lp-practice-slider__row">
          <input
            type="range"
            class="lp-practice-range"
            min="0"
            max="100"
            step="1"
            value="${shown}"
            aria-label="Lernnachweis in Prozent"
          />
          <strong class="lp-practice-slider__value" data-lp-practice-value>${pct == null ? "–" : `${pct} %`}</strong>
        </div>
        <p class="lp-practice-caption">Lernnachweis</p>
      </div>`;
  }

  function renderMaterialCell(goal) {
    const material = goal.material || null;
    const type = material?.type || goal.materialType || (goal.practiceUrl ? "url" : "none");
    let body = `<span class="lp-material-empty" aria-hidden="true">–</span>`;
    if (type === "url" && (material?.url || goal.practiceUrl)) {
      const url = material?.url || goal.practiceUrl;
      const label = materialLinkLabel(goal, material);
      body = `<a class="lp-material-link" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`;
    } else if (type === "reference" || type === "note") {
      const parts = [material?.label || goal.materialLabel, material?.note || goal.materialNote].filter(Boolean);
      if (parts.length) {
        body = `<span class="lp-material-hint">${escapeHtml(parts.join(" · "))}</span>`;
      }
    }
    const lcNote = isLevelcheckLinkedGoal(goal.id)
      ? `<p class="lp-practice-caption">Levelcheck – Ergebnis nur am Regler oben</p>`
      : "";
    return `<div class="lp-material-cell">${body}${renderPracticeDial(goal)}${lcNote}</div>`;
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
    const linked = linkedGoalIdsForThema(selectedThema()?.id);
    const headerCells = tiers
      .map((tier) => `<th class="${tier.colClass}">${escapeHtml(tier.label)}</th>`)
      .join("");

    const rows = goals
      .map((goal) => {
        const expanded = String(state.expandedGoalId) === String(goal.id);
        const isChecked = linked.has(String(goal.id));
        const isFocus = String(state.focusGoalId) === String(goal.id);
        const main = `
          <tr class="lp-table__row ${expanded ? "is-expanded" : ""} ${isChecked ? "is-levelcheck-goal" : ""} ${isFocus ? "is-plan-focus" : ""}">
            <th scope="row" class="lp-table__topic">
              <button type="button" class="lp-topic-btn" data-lp-expand="${escapeHtml(goal.id)}" aria-expanded="${expanded ? "true" : "false"}">
                <span class="lp-topic-btn__title">${escapeHtml(goal.text)}</span>
                ${isChecked ? `<span class="lp-lc-tag">im Levelcheck</span>` : ""}
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
    const linked = linkedGoalIdsForThema(selectedThema()?.id);
    return `
      <div class="lp-mobile-list">
        ${goals
          .map((goal) => {
            const expanded = String(state.expandedGoalId) === String(goal.id);
            const isChecked = linked.has(String(goal.id));
            const isFocus = String(state.focusGoalId) === String(goal.id);
            return `
            <article class="lp-mobile-card ${isChecked ? "is-levelcheck-goal" : ""} ${isFocus ? "is-plan-focus" : ""}">
              <button type="button" class="lp-mobile-card__head" data-lp-expand="${escapeHtml(goal.id)}" aria-expanded="${expanded ? "true" : "false"}">
                <h4>${escapeHtml(goal.text)}${isChecked ? ` <span class="lp-lc-tag">im Levelcheck</span>` : ""}</h4>
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

  function renderLevelcheckBanner(thema) {
    const checks = levelchecksForThema(thema?.id);
    if (!checks.length) return "";

    const cards = checks
      .map((lc) => {
        const threshold = lc.unlockThreshold || passPercent();
        const pct = lc.levelcheckPercent;
        const linkedCount = (lc.linkedGoalIds || []).length;
        const goalsText = (lc.linkedGoalLabels || []).slice(0, 3).join(" · ");
        const status =
          pct == null
            ? lc.isPast
              ? "Ergebnis eintragen"
              : "Vorbereiten"
            : lc.levelcheckPassed
              ? `Bestanden (${pct} %)`
              : `${pct} % · unter ${threshold} %`;

        return `
        <article class="lp-lc-card ${lc.isPast ? "is-past" : "is-upcoming"} ${lc.levelcheckPassed ? "is-pass" : ""}" data-lp-lc-id="${escapeHtml(lc.id)}">
          <div class="lp-lc-card__top">
            <span class="lp-lc-card__badge">Levelcheck</span>
            <span class="lp-lc-card__date">${escapeHtml(lc.dateLabel || lc.date)}</span>
          </div>
          <p class="lp-lc-card__title">${escapeHtml(lc.topicName)}</p>
          <p class="lp-lc-card__meta">${linkedCount} geprüfte Ziel(e)${goalsText ? ` · ${escapeHtml(goalsText)}${(lc.linkedGoalLabels || []).length > 3 ? " …" : ""}` : ""}</p>
          <p class="lp-lc-card__status">${escapeHtml(status)}</p>
          <div class="lp-lc-dial-wrap" data-lp-lc-dial data-topic-id="${escapeHtml(lc.levelCheckId)}" data-threshold="${threshold}" data-pct="${pct == null ? 70 : pct}">
            <div class="lc-dial ${pct != null && pct >= threshold ? "is-pass" : ""} is-editable" data-lc-dial data-topic-id="${escapeHtml(lc.levelCheckId)}" data-threshold="${threshold}" style="--pct:${pct == null ? 70 : pct}; --threshold:${threshold}; --accent:${pct != null && pct >= threshold ? "#22c55e" : "#22d3ee"}" role="slider" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct == null ? 70 : pct}" tabindex="0">
              <div class="lc-dial__ring" aria-hidden="true"></div>
              <div class="lc-dial__threshold" aria-hidden="true"></div>
              <div class="lc-dial__knob" aria-hidden="true"></div>
              <div class="lc-dial__center"><strong data-lc-dial-value>${pct == null ? 70 : pct} %</strong><span>richtig</span></div>
            </div>
            <input type="range" class="lc-dial__range" min="0" max="100" step="1" value="${pct == null ? 70 : pct}" aria-label="Levelcheck Prozent" />
            <button type="button" class="zielpfad-btn" data-lp-save-lc-percent data-topic-id="${escapeHtml(lc.levelCheckId)}">${pct == null ? "Ergebnis speichern" : "Ergebnis aktualisieren"}</button>
            ${
              lc.isUpcoming && pct == null
                ? `<p class="lp-lc-card__hint">Ein Regler für alle geprüften Ziele. Nach dem Termin hier die % eintragen.</p>`
                : ""
            }
          </div>
        </article>`;
      })
      .join("");

    return `
      <section class="lp-lc-banner" aria-label="Levelchecks">
        <div class="lp-lc-banner__head">
          <h3>Levelcheck</h3>
          <p>Für die gelb markierten Ziele gilt nur dieser eine Regler – kein eigener Lernnachweis.</p>
        </div>
        <div class="lp-lc-grid">${cards}</div>
      </section>`;
  }

  function renderTargetRings(thema, p) {
    if (!p.hasTarget) {
      return `
        <p class="lp-dash__featured-meta">
          Zielnote noch nicht gesetzt – unter <span class="lp-dash__link">Ziele</span> festlegen.
          Danach siehst du hier, wie viel Prozent Rookie, Operator und Street Legend du für die Arbeit brauchst.
        </p>`;
    }

    const rules = window.LOGBUCH?.getGradeRequirements?.(p.targetGrade);
    const accents = { rookie: "#22d3ee", operator: "#a855f7", street_legend: "#f472b6" };
    const serverTiers = thema.target?.tiers || [];

    const cards = TIER_META.map((meta) => {
      const pctRequired = rules ? Math.round((Number(rules[meta.id]) || 0) * 100) : 0;
      const server = serverTiers.find((t) => t.id === meta.id) || {};
      const recommended = Number(server.recommended ?? p.recommended?.[meta.id]) || 0;
      const current = Number(server.current) || 0;
      const isFree = pctRequired <= 0 || recommended <= 0;
      const stand = isFree
        ? current > 0
          ? `Stand: ${current} (Vertiefung)`
          : "nicht nötig für diese Zielnote"
        : `Stand: ${current}/${recommended} sicher`;

      return `
        <article class="zielpfad-ring-card ${isFree ? "is-voluntary" : ""}" style="--grade-accent:${accents[meta.id]}">
          <div class="grade-goal-ring" style="--progress:${isFree ? 0 : pctRequired}; --accent:${accents[meta.id]}">
            <div class="grade-goal-ring__inside">
              <span class="grade-goal-ring__grade">${escapeHtml(meta.label)}</span>
              <strong>${isFree ? "frei" : `${pctRequired} %`}</strong>
            </div>
          </div>
          <div class="zielpfad-ring-card__text">
            <strong>${escapeHtml(meta.label)}</strong>
            <span>${
              isFree
                ? "Freiwillige Vertiefung"
                : `${pctRequired} % für Zielnote ${escapeHtml(p.targetGradeLabel)}`
            }</span>
            <div class="zielpfad-ring-card__stand">
              <span>Dein Stand</span>
              <strong>${escapeHtml(stand)}</strong>
            </div>
          </div>
        </article>`;
    }).join("");

    return `<div class="zielpfad-ring-grid lp-dash__rings">${cards}</div>`;
  }

  function renderOverview() {
    const thema = selectedThema();
    if (!thema) return "";

    const p = computeTopicProgress(thema);
    const when = thema.target?.checkpointDateLabel || "";
    const kind = thema.target?.checkpointTypeLabel || "Klassenarbeit / Test";
    const targetLine = p.hasTarget
      ? `Zielnote ${escapeHtml(p.targetGradeLabel)} · ${escapeHtml(kind)}${when ? ` · ${escapeHtml(when)}` : ""}`
      : `${escapeHtml(kind)}${when ? ` · ${escapeHtml(when)}` : ""} – Zielnote unter Ziele festlegen.`;

    const nextItem = (thema.target?.workItems || []).find(
      (item) => item.status !== "sicher" && item.status !== "geschafft"
    );
    const nextLine = nextItem
      ? `Als Nächstes: ${escapeHtml(nextItem.tierLabel)} · ${escapeHtml(nextItem.taskText || nextItem.goalText)}`
      : p.hasTarget
        ? "Mindestweg für diese Zielnote ist geschafft."
        : "";

    return `
      ${renderLevelcheckBanner(thema)}
      <section class="lp-dash" aria-label="Lernstand Überblick">
        <article class="lp-dash__featured">
          <div class="lp-dash__featured-copy">
            <p class="lp-dash__featured-eyebrow">${escapeHtml(state.selectedSubject || "")} · geplante Arbeit</p>
            <h3 class="lp-dash__featured-title">${escapeHtml(thema.name)}</h3>
            <p class="lp-dash__featured-sub">${p.goalCount} Unterthemen in diesem Thema</p>
            <p class="lp-dash__featured-meta">${targetLine}</p>
            ${nextLine ? `<p class="lp-dash__featured-meta">${nextLine}</p>` : ""}
          </div>
        </article>
        ${renderTargetRings(thema, p)}
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
          themen.map((t) => ({
            value: String(t.id),
            label: t.target?.checkpointDateLabel
              ? `${t.name} · ${t.target.checkpointDateLabel}`
              : `${t.name} (${(t.goals || []).length})`
          })),
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
          heroSrc: "/icons/student/hero/lernstand-hero.png?v=6"
        }) || ""
      );
    }

    const subjects = subjectsWithData();
    if (!subjects.length) {
      return (
        visuals?.emptyState({
          title: "Noch keine Klassenarbeit geplant.",
          text: "Hier erscheinen nur Themen mit Klassenarbeit, Test oder ähnlichem Termin. Deine Lehrkraft legt die Termine im Checkpoint-Plan an."
        }) || ""
      );
    }

    ensureSelection();
    const thema = selectedThema();
    const linked = linkedGoalIdsForThema(thema?.id);
    let goals = (thema?.goals || []).filter(goalMatchesStatusFilter);
    if (state.focusLevelcheckGoals && linked.size) {
      goals = [...goals].sort((a, b) => {
        const al = linked.has(String(a.id)) ? 0 : 1;
        const bl = linked.has(String(b.id)) ? 0 : 1;
        return al - bl;
      });
    }

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

    const planHint = state.fromPlan
      ? `<p class="lp-table-hint lp-table-hint--plan">Nach deinem Tagesziel: trage hier ein, was <strong>in Arbeit</strong> ist und was schon <strong>sicher</strong> läuft.</p>`
      : "";
    const lcHint = linked.size
      ? `<p class="lp-table-hint lp-table-hint--lc">Gelb markiert: Ziele im Levelcheck (${linked.size}) – dafür nur der eine Regler oben.</p>`
      : "";

    return `
      <div class="lp-content">
        ${planHint}
        <p class="lp-table-hint">Tippe auf eine Zelle unter Rookie, Operator oder Street Legend – dann wählst du <strong>Offen</strong>, <strong>In Arbeit</strong> oder <strong>Sicher</strong>.</p>
        ${lcHint}
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
    scrollFocusGoalIntoView();
  }

  function scrollFocusGoalIntoView() {
    if (!state.focusGoalId) return;
    const id = String(state.focusGoalId);
    const escaped = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(id) : id.replace(/"/g, "");
    requestAnimationFrame(() => {
      const el = document.querySelector(`[data-lp-expand="${escaped}"]`);
      el?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
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
        state.focusGoalId = null;
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
        state.focusGoalId = null;
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

    bindLevelcheckDials(root);
    bindPracticeDials(root);
  }

  function syncLcDial(dial, pct) {
    const threshold = Number(dial.dataset.threshold) || passPercent();
    const passed = pct >= threshold;
    dial.style.setProperty("--pct", String(pct));
    dial.style.setProperty("--accent", passed ? "#22c55e" : "#22d3ee");
    dial.classList.toggle("is-pass", passed);
    dial.setAttribute("aria-valuenow", String(pct));
    const valueEl = dial.querySelector("[data-lc-dial-value]");
    if (valueEl) valueEl.textContent = `${pct} %`;
    const wrap = dial.closest(".lp-lc-dial-wrap");
    const range = wrap?.querySelector(".lc-dial__range");
    if (range) range.value = String(pct);
  }

  function percentFromPointer(dial, clientX, clientY) {
    const rect = dial.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const angle = Math.atan2(clientY - cy, clientX - cx);
    let deg = ((angle + Math.PI / 2) * 180) / Math.PI;
    if (deg < 0) deg += 360;
    return Math.max(0, Math.min(100, Math.round(deg / 3.6)));
  }

  function bindLevelcheckDials(root) {
    root.querySelectorAll("[data-lc-dial].is-editable").forEach((dial) => {
      let dragging = false;
      const setFromEvent = (e) => {
        const point = e.touches ? e.touches[0] : e;
        if (!point) return;
        syncLcDial(dial, percentFromPointer(dial, point.clientX, point.clientY));
      };
      dial.addEventListener("pointerdown", (e) => {
        dragging = true;
        dial.setPointerCapture?.(e.pointerId);
        setFromEvent(e);
        e.preventDefault();
      });
      dial.addEventListener("pointermove", (e) => {
        if (!dragging) return;
        setFromEvent(e);
      });
      dial.addEventListener("pointerup", () => {
        dragging = false;
      });
      dial.addEventListener("pointercancel", () => {
        dragging = false;
      });
    });

    root.querySelectorAll(".lc-dial__range").forEach((range) => {
      range.addEventListener("input", () => {
        const dial = range.closest(".lp-lc-dial-wrap")?.querySelector("[data-lc-dial]");
        if (dial) syncLcDial(dial, Number(range.value) || 0);
      });
    });

    root.querySelectorAll("[data-lp-save-lc-percent]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const topicId = btn.dataset.topicId;
        const dial = btn
          .closest(".lp-lc-dial-wrap")
          ?.querySelector(`[data-lc-dial][data-topic-id="${topicId}"]`);
        const pct = Number(dial?.getAttribute("aria-valuenow") ?? 0);
        saveLevelcheckPercent(topicId, pct);
      });
    });
  }

  const practiceSaveTimers = {};

  function bindPracticeDials(root) {
    root.querySelectorAll(".lp-practice-range").forEach((range) => {
      const wrap = range.closest("[data-lp-practice-wrap]");
      const goalId = wrap?.dataset.goalId;
      if (!goalId) return;
      const valueEl = wrap.querySelector("[data-lp-practice-value]");
      const commit = () => {
        const parsed = Number(range.value);
        if (!Number.isInteger(parsed) || parsed < 0 || parsed > 100) return;
        wrap.classList.toggle("is-pass", parsed >= passPercent());
        if (valueEl) valueEl.textContent = `${parsed} %`;
        savePracticePercent(goalId, parsed);
      };
      range.addEventListener("input", () => {
        const parsed = Number(range.value) || 0;
        wrap.classList.toggle("is-pass", parsed >= passPercent());
        if (valueEl) valueEl.textContent = `${parsed} %`;
        clearTimeout(practiceSaveTimers[goalId]);
        practiceSaveTimers[goalId] = setTimeout(commit, 400);
      });
      range.addEventListener("change", commit);
    });
  }

  async function savePracticePercent(goalId, percent) {
    const goal = findGoal(goalId);
    if (goal) goal.practicePercent = percent;
    try {
      const res = await fetch("/api/student/levelcheck-practice-percent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goalId, practicePercent: percent })
      });
      const data = await res.json();
      if (!data.success) {
        state.error = data.message || "Quiz-Ergebnis konnte nicht gespeichert werden.";
        return;
      }
      const stored = findGoal(goalId);
      if (stored) stored.practicePercent = data.practicePercent;
    } catch (err) {
      console.error(err);
      state.error = "Netzwerkfehler beim Speichern des Quiz-Ergebnisses.";
    }
  }

  async function saveLevelcheckPercent(topicId, percent) {
    state.saving = `lc_${topicId}`;
    state.error = "";
    state.message = "";
    render();
    try {
      const res = await fetch("/api/student/zielsetzung", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ levelCheckId: topicId, levelcheckPercent: percent })
      });
      const data = await res.json();
      state.saving = null;
      if (!data.success) {
        state.error = data.message || "Speichern fehlgeschlagen.";
        render();
        return;
      }
      state.message = `Levelcheck ${percent} % gespeichert`;
      await loadData(initGeneration);
    } catch (err) {
      console.error(err);
      state.saving = null;
      state.error = "Netzwerkfehler beim Speichern.";
      render();
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

  function init(query) {
    applyArrivalQuery(query);
    if (initPromise) return initPromise;
    initPromise = initInternal().finally(() => {
      initPromise = null;
    });
    return initPromise;
  }

  window.LogbuchLevelplan = { init };
})();
