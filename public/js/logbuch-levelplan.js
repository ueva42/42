/**
 * SRL-Logbuch – Levelplan / Mein Lernstand.
 * Die Termin-Regler zeigen level_check_targets.levelcheck_percent.
 * Das ist eine Zahl pro Thema (level_check_id, user_id), nicht pro Termin.
 */
(function () {
  const TIER_META = [
    {
      id: "unterthema",
      label: "Unterthema",
      textKey: "text",
      colClass: "lp-col--unterthema"
    },
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
    coachEnabled: false,
    fromPlan: false,
    pendingSubject: null,
    pendingThemaId: null,
    pendingGoalId: null,
    popover: null,
    sheet: null,
    helpOpen: false,
    editingLcId: null,
    hintHidden: false,
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
    if (filtered.length) return filtered;
    // Fallback: klassische drei Stufen (ohne Unterthema-Spalte)
    return TIER_META.filter((t) => t.id !== "unterthema");
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
    return !type || type === "klassenarbeit" || type === "test" || type === "projektabgabe";
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
    return markTiers().some((tier) => tierStatus(goal, tier.id) === state.statusFilter);
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
    for (const lc of levelcheckRecordsForThema(themaId)) {
      for (const id of lc.linkedGoalIds || []) ids.add(String(id));
    }
    return ids;
  }

  function levelcheckRecordsForThema(themaId) {
    const scheduled = levelchecksForThema(themaId);
    if (scheduled.length) return scheduled;
    const thema = selectedThema();
    if (!thema || String(thema.id) !== String(themaId)) return [];
    const cp = thema.target?.levelcheckCheckpoint;
    if (!cp) return [];
    const pct = thema.target?.levelcheckPercent;
    const linked = Array.isArray(cp.linkedGoalIds) ? cp.linkedGoalIds.map(String) : [];
    return [
      {
        id: cp.id || thema.id,
        levelCheckId: thema.id,
        topicName: thema.name,
        date: cp.date || "",
        dateLabel: cp.dateLabel || "",
        linkedGoalIds: linked,
        linkedGoalLabels: [],
        isPast: false,
        isUpcoming: true,
        levelcheckPercent:
          pct == null || pct === "" || !Number.isInteger(Number(pct)) ? null : Number(pct),
        levelcheckPassed: !!thema.target?.levelcheckPassed,
        unlockThreshold: passPercent()
      }
    ];
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
      if (tier.id === "unterthema") continue;
      out[tier.id] = Math.ceil(total * (Number(rules[tier.id]) || 0));
    }
    return out;
  }

  function computeTopicProgress(thema) {
    const goals = thema?.goals || [];
    const tiers = activeTiers();
    const targetGrade = thema?.target?.targetGrade || null;
    const recommended = targetGrade ? recommendedTierCounts(goals.length, targetGrade) : null;
    const hasClassicTiers = tiers.some((t) => t.id !== "unterthema");

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
      const requiredCount =
        tier.id === "unterthema"
          ? targetGrade && !hasClassicTiers
            ? goals.length
            : 0
          : recommended?.[tier.id] ?? 0;
      goals.forEach((goal, index) => {
        const status = tierStatus(goal, tier.id);
        if (!targetGrade || !hasClassicTiers) {
          bump(all, status);
          return;
        }
        if (tier.id === "unterthema") {
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

  const HINT_KEY = "sol-levelplan-hint";
  const TIER_ACCENT = { rookie: "#22d3ee", operator: "#a855f7", street_legend: "#f472b6" };
  const lcResultSaveTimers = {};
  let sheetKeyHandler = null;
  let ignorePercentBlur = false;
  let percentCommitLock = false;

  function tierShort(id) {
    if (id === "rookie") return "R";
    if (id === "operator") return "O";
    if (id === "street_legend") return "SL";
    return "U";
  }

  function markTiers() {
    const active = activeTiers().filter((tier) => tier.id !== "unterthema");
    return active.length ? active : TIER_META.filter((tier) => tier.id !== "unterthema");
  }

  function onceHintVisible() {
    if (state.hintHidden) return false;
    try {
      return localStorage.getItem(HINT_KEY) !== "1";
    } catch (err) {
      return false;
    }
  }

  function dismissHint() {
    state.hintHidden = true;
    try {
      localStorage.setItem(HINT_KEY, "1");
    } catch (err) {
      /* Anzeige bleibt für diesen Besuch aus, auch ohne Speicher. */
    }
  }

  function kaLabel(thema) {
    const iso = String(thema?.target?.checkpointDate || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
    const date = new Date(`${iso}T12:00:00`);
    if (Number.isNaN(date.getTime())) return "";
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    const days = Math.round((date.getTime() - today.getTime()) / 86400000);
    const short = date.toLocaleDateString("de-DE", {
      weekday: "short",
      day: "2-digit",
      month: "2-digit"
    });
    let when = `KA in ${days} Tagen`;
    if (days === 1) when = "KA morgen";
    else if (days === 0) when = "KA heute";
    else if (days === -1) when = "KA gestern";
    else if (days < 0) when = `KA vor ${Math.abs(days)} Tagen`;
    return `${when} · ${short}`;
  }

  function materialInfo(goal) {
    if (!goal) return { url: "", note: "" };
    const material = goal.material || null;
    const type = material?.type || goal.materialType || (goal.practiceUrl ? "url" : "none");
    const url = type === "url" ? String(material?.url || goal.practiceUrl || "").trim() : "";
    let note = "";
    if (!url && (type === "reference" || type === "note")) {
      note = [material?.label || goal.materialLabel, material?.note || goal.materialNote]
        .filter(Boolean)
        .join(" · ");
    }
    return { url, note };
  }

  function tierCounts(thema, tierId) {
    const counts = { offen: 0, in_arbeit: 0, sicher: 0 };
    for (const goal of thema?.goals || []) {
      const status = tierStatus(goal, tierId);
      if (status === "sicher") counts.sicher += 1;
      else if (status === "in_arbeit") counts.in_arbeit += 1;
      else counts.offen += 1;
    }
    return counts;
  }

  function tierStand(thema, tierId, progress) {
    const goals = thema?.goals || [];
    const total = goals.length;
    const counts = tierCounts(thema, tierId);
    const server = (thema?.target?.tiers || []).find((tier) => tier.id === tierId) || {};
    const serverCurrent = Number(server.current);
    const current = Number.isFinite(serverCurrent) ? serverCurrent : counts.sicher;
    const recommendedRaw =
      server.recommended != null ? Number(server.recommended) : progress.recommended?.[tierId];
    const recommended = Number.isFinite(recommendedRaw) ? recommendedRaw : null;
    const rules = progress.hasTarget
      ? window.LOGBUCH?.getGradeRequirements?.(progress.targetGrade)
      : null;
    const pctRequired = rules ? Math.round((Number(rules[tierId]) || 0) * 100) : null;
    const needed = progress.hasTarget ? recommended ?? 0 : total;
    const free = progress.hasTarget && (pctRequired === 0 || needed <= 0);
    let fill = 0;
    if (!free && needed > 0) fill = Math.min(100, Math.round((current / needed) * 100));
    let stat;
    if (!progress.hasTarget) stat = `${current} von ${total} sicher`;
    else if (free) stat = "nicht nötig";
    else if (pctRequired == null) stat = `${current} von ${needed} sicher`;
    else if (pctRequired >= 100) stat = `${current} von ${needed} sicher · alle nötig`;
    else stat = `${current} von ${needed} · ${pctRequired} % nötig`;
    return { fill, stat, counts, current, needed, free };
  }

  function renderTierRow(thema, tier, progress, activeTierId) {
    const stand = tierStand(thema, tier.id, progress);
    const accent = TIER_ACCENT[tier.id] || "#22d3ee";
    const active = !stand.free && tier.id === activeTierId;
    const center = stand.free || stand.needed <= 0 ? "–" : `${stand.current}/${stand.needed}`;
    return `
      <div class="lp-tier ${active ? "is-active" : ""} ${stand.free ? "is-free" : ""}" style="--lp-accent:${accent}">
        <div class="lp-ring" style="--lp-progress:${stand.free ? 0 : stand.fill}" aria-hidden="true">
          <span class="lp-ring__value">${escapeHtml(center)}</span>
        </div>
        <div class="lp-tier__copy">
          <span class="lp-tier__name">${escapeHtml(tier.label)}</span>
          <span class="lp-tier__stat">${escapeHtml(stand.stat)}</span>
        </div>
      </div>`;
  }

  function renderVoluntaryLine(thema) {
    const counts = tierCounts(thema, "unterthema");
    const extra = counts.sicher > 0 ? ` · ${counts.sicher} sicher` : "";
    return `<p class="lp-voluntary">Unterthema frei · Freiwillige Vertiefung${extra}</p>`;
  }

  function renderThemaControl(themen) {
    if (themen.length <= 1) {
      return `<span class="lp-chip lp-thema-chip">${escapeHtml(themen[0]?.name || "Thema")}</span>`;
    }
    const options = themen
      .map((thema) => {
        const selected = String(thema.id) === String(state.selectedThemaId) ? " selected" : "";
        return `<option value="${escapeHtml(thema.id)}"${selected}>${escapeHtml(thema.name)}</option>`;
      })
      .join("");
    return `<label class="lp-thema"><span class="lp-sr">Thema</span><select data-lp-thema="${escapeHtml(state.selectedThemaId || "")}">${options}</select></label>`;
  }

  function renderBar(thema, progress) {
    const subjects = subjectsWithData();
    const themen = levelChecksForSubject(state.selectedSubject);
    const subjectButtons = subjects
      .map((group) => {
        const on = group.subject === state.selectedSubject;
        return `<button type="button" role="tab" class="${on ? "is-active" : ""}" data-lp-subject="${escapeHtml(group.subject)}" aria-selected="${on ? "true" : "false"}">${escapeHtml(group.subject)}</button>`;
      })
      .join("");
    const ka = kaLabel(thema);
    const ziel = progress.hasTarget ? `Ziel: Note ${progress.targetGradeLabel}` : "Zielnote setzen";
    return `
      <div class="lp-bar">
        <div class="lp-bar__primary">
          <div class="lp-seg" role="tablist" aria-label="Fach">${subjectButtons}</div>
          ${renderThemaControl(themen)}
        </div>
        <div class="lp-bar__secondary">
          ${ka ? `<span class="lp-chip lp-chip--ka" title="${escapeHtml(ka)}">${escapeHtml(ka)}</span>` : ""}
          <button type="button" class="lp-chip lp-chip--ziel" data-lp-ziel>${escapeHtml(ziel)}</button>
          <button type="button" class="lp-help" data-lp-help aria-expanded="${state.helpOpen ? "true" : "false"}" aria-label="Hinweis zum Lernstand">?</button>
        </div>
      </div>`;
  }

  function renderProgressCard(thema, progress, activeTierId) {
    const title = progress.hasTarget
      ? `Dein Weg zur Note ${progress.targetGradeLabel}`
      : "Dein Lernstand";
    const lead = progress.hasTarget
      ? ""
      : `<p class="lp-card__lead">Zielnote noch nicht gesetzt.</p>`;
    const rows = markTiers()
      .map((tier) => renderTierRow(thema, tier, progress, activeTierId))
      .join("");
    return `
      <section class="lp-card lp-path" aria-labelledby="lp-progress-title">
        <h2 id="lp-progress-title" class="lp-kicker">${escapeHtml(title)}</h2>
        ${lead}
        <div class="lp-tiers">${rows}</div>
        ${renderVoluntaryLine(thema)}
      </section>`;
  }

  function nextStepModel(thema) {
    const items = Array.isArray(thema?.target?.workItems) ? thema.target.workItems : [];
    if (thema?.target?.targetGrade) {
      const item = items[0];
      if (!item || item.status === "sicher" || item.status === "geschafft") return null;
      const goal = (thema.goals || []).find((entry) => String(entry.id) === String(item.goalId)) || null;
      const info = goal ? materialInfo(goal) : { url: "", note: "" };
      return {
        title: item.goalText || goal?.text || "Nächstes Unterthema",
        detail: item.taskText || "",
        goalId: item.goalId || goal?.id || "",
        tierId: item.tier || "",
        tierLabel: item.tierLabel || "",
        url: info.url || item.practiceUrl || ""
      };
    }
    for (const tier of markTiers()) {
      for (const goal of thema?.goals || []) {
        if (tierStatus(goal, tier.id) === "sicher") continue;
        const detail = tierGoalText(goal, tier);
        return {
          title: goal.text,
          detail,
          goalId: goal.id,
          tierId: tier.id,
          tierLabel: tier.label,
          url: materialInfo(goal).url
        };
      }
    }
    return null;
  }

  function renderNextStep(step) {
    if (!step) return "";
    const detail = step.detail && step.detail !== step.title && step.detail !== "–" ? step.detail : "";
    const go = step.url
      ? `<a class="lp-next__go" href="${escapeHtml(step.url)}" target="_blank" rel="noopener noreferrer">Loslegen</a>`
      : `<p class="lp-next__miss">Für diesen Schritt ist noch kein Material hinterlegt.</p>`;
    return `
      <section class="lp-next" aria-labelledby="lp-next-title">
        <h2 id="lp-next-title" class="lp-kicker">Dein nächster Schritt</h2>
        ${step.tierLabel ? `<p class="lp-next__tier">${escapeHtml(step.tierLabel)}</p>` : ""}
        <p class="lp-next__title">${escapeHtml(step.title)}</p>
        ${detail ? `<p class="lp-next__detail">${escapeHtml(detail)}</p>` : ""}
        ${go}
      </section>`;
  }

  function renderOnceHint() {
    if (!onceHintVisible()) return "";
    return `
      <div class="lp-once">
        <p>Tippe eine Stufe an und wähle Offen, In Arbeit oder Sicher. Ein Punkt am Titel heißt: das Unterthema gehört zu einem Levelcheck.</p>
        <button type="button" data-lp-once-dismiss>Verstanden</button>
      </div>`;
  }

  function renderLive() {
    const text = state.error || state.message || "";
    const cls = state.error ? "is-error" : text ? "is-ok" : "";
    return `<p class="lp-live ${cls}" role="status">${escapeHtml(text)}</p>`;
  }

  function goalHasStatus(goal, status) {
    return markTiers().some((tier) => tierStatus(goal, tier.id) === status);
  }

  function renderStatusFilters(goals) {
    const buttons = STATUS_FILTERS.map((filter) => {
      const count =
        filter.id === "all" ? goals.length : goals.filter((goal) => goalHasStatus(goal, filter.id)).length;
      const on = state.statusFilter === filter.id;
      return `<button type="button" class="${on ? "is-active" : ""}" data-lp-status-filter="${escapeHtml(filter.id)}" aria-pressed="${on ? "true" : "false"}">${escapeHtml(filter.label)} ${count}</button>`;
    }).join("");
    return `<div class="lp-filters" role="group" aria-label="Status filtern">${buttons}</div>`;
  }

  function renderGoalRow(goal, linked, allLinked, nextGoalId) {
    const sheetForGoal = state.sheet && String(state.sheet.goalId) === String(goal.id);
    const moreOpen = !!(sheetForGoal && state.sheet.via === "more");
    const showDot = !allLinked && linked.has(String(goal.id));
    const focus = String(state.focusGoalId) === String(goal.id);
    const isNext = nextGoalId && String(goal.id) === String(nextGoalId);
    const pills = markTiers()
      .map((tier) => {
        const raw = tierStatus(goal, tier.id);
        const status = STATUS_META[raw] ? raw : "offen";
        const meta = STATUS_META[status];
        const open = !!(sheetForGoal && state.sheet.via !== "more" && state.sheet.tier === tier.id);
        const busy = state.saving === `${goal.id}_${tier.id}`;
        return `<button type="button" class="lp-pill lp-pill--${tier.id} lp-pill--${status} ${open ? "is-open" : ""} ${busy ? "is-busy" : ""}" data-lp-pill="${escapeHtml(goal.id)}" data-lp-tier="${escapeHtml(tier.id)}" aria-haspopup="dialog" aria-expanded="${open ? "true" : "false"}" aria-label="${escapeHtml(tier.label)}: ${escapeHtml(meta.label)}" ${busy ? "disabled" : ""}><span class="lp-pill__tier">${tierShort(tier.id)}</span><span class="lp-pill__icon" aria-hidden="true">${meta.icon}</span><span class="lp-pill__status">${escapeHtml(meta.label)}</span></button>`;
      })
      .join("");
    return `
      <article class="lp-goal ${focus ? "is-plan-focus" : ""} ${isNext ? "is-next" : ""}" data-lp-goal="${escapeHtml(goal.id)}">
        <div class="lp-goal__head">
          ${showDot ? `<span class="lp-dot" aria-hidden="true"></span><span class="lp-sr">Im Levelcheck</span>` : ""}
          <h3 class="lp-goal__title">${escapeHtml(goal.text)}</h3>
          <button type="button" class="lp-more ${moreOpen ? "is-open" : ""}" data-lp-more="${escapeHtml(goal.id)}" aria-haspopup="dialog" aria-expanded="${moreOpen ? "true" : "false"}" aria-label="Aktionen zu ${escapeHtml(goal.text)}">⋯</button>
        </div>
        <div class="lp-pills">${pills}</div>
      </article>`;
  }

  function renderGoalList(thema, nextGoalId) {
    const allGoals = thema?.goals || [];
    const linked = linkedGoalIdsForThema(thema?.id);
    const allLinked = allGoals.length > 0 && allGoals.every((goal) => linked.has(String(goal.id)));
    let goals = allGoals.filter(goalMatchesStatusFilter);
    if (state.focusLevelcheckGoals && linked.size) {
      goals = [...goals].sort((a, b) => {
        const aLinked = linked.has(String(a.id)) ? 0 : 1;
        const bLinked = linked.has(String(b.id)) ? 0 : 1;
        return aLinked - bLinked;
      });
    }
    const note = allLinked
      ? `<p class="lp-list-note">Alle Unterthemen sind einem Levelcheck zugeordnet.</p>`
      : "";
    const rows = goals.length
      ? `<div class="lp-list">${goals.map((goal) => renderGoalRow(goal, linked, allLinked, nextGoalId)).join("")}</div>`
      : `<p class="lp-empty">${allGoals.length ? "Für diesen Status gibt es hier keine Unterthemen." : "Für dieses Thema gibt es noch keine Unterthemen."}</p>`;
    return `
      <section class="lp-block" aria-labelledby="lp-goals-title">
        <h2 id="lp-goals-title" class="lp-kicker">Unterthemen</h2>
        ${note}
        ${rows}
      </section>`;
  }

  function storedPercent(lc) {
    if (lc?.levelcheckPercent == null || lc.levelcheckPercent === "") return null;
    const n = Number(lc.levelcheckPercent);
    if (!Number.isInteger(n) || n < 0 || n > 100) return null;
    return n;
  }

  function renderPercentControl(lc, pct, hasValue) {
    const editing = String(state.editingLcId) === String(lc.id);
    if (editing) {
      return `<input class="lp-lc__input" type="number" inputmode="numeric" min="0" max="100" step="1" value="${hasValue ? pct : ""}" data-topic-id="${escapeHtml(lc.levelCheckId)}" aria-label="Ergebnis in Prozent, gilt für das ganze Thema">`;
    }
    const label = hasValue
      ? `${pct} % <span class="lp-lc__unit">richtig</span>`
      : "Ergebnis eintragen";
    return `<button type="button" class="lp-lc__value ${hasValue ? "" : "is-empty"}" data-lp-pct-edit data-lc-id="${escapeHtml(lc.id)}" aria-label="Ergebnis direkt eingeben">${label}</button>`;
  }

  function renderLevelchecks(thema) {
    const checks = levelcheckRecordsForThema(thema?.id);
    if (!checks.length) return "";
    const note =
      checks.length > 1
        ? `<p class="lp-lc-note">Ein Ergebnis für das ganze Thema.</p>`
        : "";
    const cards = checks
      .map((lc) => {
        const pct = storedPercent(lc);
        const hasValue = pct != null;
        const shown = hasValue ? pct : 0;
        const names = (lc.linkedGoalLabels || []).filter(Boolean);
        const chips = names.length
          ? `<ul class="lp-lc__chips">${names
              .map((name) => `<li class="lp-lc__chip">${escapeHtml(name)}</li>`)
              .join("")}</ul>`
          : "";
        const passed = hasValue && pct >= (lc.unlockThreshold || passPercent());
        return `
          <article class="lp-lc ${passed ? "is-pass" : ""} ${hasValue ? "" : "is-empty"}" data-lp-lc-result data-topic-id="${escapeHtml(lc.levelCheckId)}" data-lc-id="${escapeHtml(lc.id)}" data-threshold="${lc.unlockThreshold || passPercent()}" aria-label="Levelcheck ${escapeHtml(lc.dateLabel || lc.date || "")}">
            <p class="lp-lc__date">${escapeHtml(lc.dateLabel || lc.date || "Levelcheck")}</p>
            ${chips}
            <div class="lp-lc__result">
              ${renderPercentControl(lc, pct, hasValue)}
              <input type="range" class="lp-lc__range" min="0" max="100" step="1" value="${shown}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${shown}" aria-valuetext="${hasValue ? `${pct} Prozent richtig` : "Ergebnis eintragen"}" aria-label="Ergebnis Levelcheck in Prozent, gilt für das ganze Thema">
            </div>
          </article>`;
      })
      .join("");
    return `
      <section class="lp-block" aria-labelledby="lp-lc-title">
        <h2 id="lp-lc-title" class="lp-kicker">Levelchecks · ${checks.length}</h2>
        ${note}
        <div class="lp-lc-list">${cards}</div>
      </section>`;
  }

  function coachAllowed(tierId) {
    if (!state.coachEnabled || !window.LogbuchCoach?.isEnabled?.()) return false;
    if (!isMathSubject(state.selectedSubject)) return false;
    return tierId === "rookie" || tierId === "operator" || tierId === "street_legend";
  }

  function renderHelp() {
    return `
      <div class="lp-sheet-root">
        <button type="button" class="lp-sheet-backdrop" data-lp-sheet-close aria-label="Hinweis schließen"></button>
        <div class="lp-sheet lp-sheet--help" role="dialog" tabindex="-1" aria-modal="true" aria-labelledby="lp-help-title">
          <div class="lp-sheet__grab" aria-hidden="true"></div>
          <h2 id="lp-help-title">So geht der Lernstand</h2>
          <div class="lp-helpbox">
            <p>Die Ringe zeigen, wie viel du schon sicher kannst. Daneben steht, was die Zielnote verlangt, zum Beispiel „alle nötig“ oder „50 % nötig“.</p>
            <p>Tippe auf eine Stufe und wähle Offen, In Arbeit oder Sicher.</p>
            <p>Ein Punkt am Unterthema heißt: es gehört zu einem Levelcheck. Sind alle dabei, steht ein Hinweis über der Liste.</p>
            <p>Nach einem Tagesziel trägst du hier ein, was in Arbeit ist und was schon sicher läuft.</p>
            <p>Das Prozent-Ergebnis gilt für das ganze Thema. Mehrere Termine teilen sich diese eine Zahl.</p>
          </div>
          <button type="button" class="lp-sheet__close" data-lp-sheet-close>Schließen</button>
        </div>
      </div>`;
  }

  function renderSheet() {
    const goal = findGoal(state.sheet?.goalId);
    const tiers = markTiers();
    const tier = tiers.find((entry) => entry.id === state.sheet?.tier) || tiers[0];
    if (!goal || !tier) return "";
    const status = tierStatus(goal, tier.id);
    const info = materialInfo(goal);
    const thema = selectedThema();
    const goalText = tierGoalText(goal, tier);
    const tabs = tiers
      .map((entry) => {
        const on = entry.id === tier.id;
        const accent = TIER_ACCENT[entry.id] || "#94a3b8";
        return `<button type="button" role="tab" class="${on ? "is-active" : ""}" style="--lp-tier:${accent}" data-lp-sheet-tier="${escapeHtml(entry.id)}" aria-selected="${on ? "true" : "false"}">${tierShort(entry.id)} ${escapeHtml(entry.label)}</button>`;
      })
      .join("");
    const options = statusOptions()
      .map((opt) => {
        const meta = STATUS_META[opt.id] || STATUS_META.offen;
        const on = opt.id === status;
        return `<button type="button" class="lp-sheet__opt ${on ? "is-active" : ""}" data-lp-pick="${escapeHtml(opt.id)}" data-lp-pick-goal="${escapeHtml(goal.id)}" data-lp-pick-tier="${escapeHtml(tier.id)}" aria-pressed="${on ? "true" : "false"}">${meta.icon} ${escapeHtml(opt.label)}</button>`;
      })
      .join("");
    const coach = coachAllowed(tier.id)
      ? `<button type="button" class="lp-sheet__action" data-lp-coach="${escapeHtml(goal.id)}" data-lp-level="${escapeHtml(tier.id)}" data-lp-label="${escapeHtml(goal.text || "")}" data-lp-thema="${escapeHtml(thema?.name || "")}">Coach fragen</button>`
      : "";
    const material = info.url
      ? `<a class="lp-sheet__action" href="${escapeHtml(info.url)}" target="_blank" rel="noopener noreferrer">Material öffnen</a>`
      : info.note
        ? `<p class="lp-sheet__note">${escapeHtml(info.note)}</p>`
        : "";
    return `
      <div class="lp-sheet-root">
        <button type="button" class="lp-sheet-backdrop" data-lp-sheet-close aria-label="Schließen"></button>
        <div class="lp-sheet" role="dialog" tabindex="-1" aria-modal="true" aria-labelledby="lp-sheet-title">
          <div class="lp-sheet__grab" aria-hidden="true"></div>
          <h3 id="lp-sheet-title">${escapeHtml(goal.text)}</h3>
          <div class="lp-sheet__tiers" role="tablist" aria-label="Stufe">${tabs}</div>
          ${goalText && goalText !== "–" ? `<p class="lp-sheet__goal">${escapeHtml(goalText)}</p>` : ""}
          <div class="lp-sheet__status" role="group" aria-label="Status">${options}</div>
          ${coach}
          ${material}
          <button type="button" class="lp-sheet__close" data-lp-sheet-close>Schließen</button>
        </div>
      </div>`;
  }

  function renderOverlay() {
    if (state.helpOpen) return renderHelp();
    if (state.sheet) return renderSheet();
    return "";
  }

  function openZiele() {
    if (window.StudentRouter?.navigateToSection) {
      window.StudentRouter.navigateToSection("zielsetzung");
      return;
    }
    window.location.assign("/student/zielsetzung");
  }

  function renderBody() {
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
    if (!subjectsWithData().length) {
      return (
        visuals?.emptyState({
          title: "Noch keine Klassenarbeit geplant.",
          text: "Hier erscheinen nur Themen mit Klassenarbeit, Test oder ähnlichem Termin. Deine Lehrkraft legt die Termine im Checkpoint-Plan an."
        }) || ""
      );
    }
    ensureSelection();
    const thema = selectedThema();
    if (!thema) {
      return (
        visuals?.emptyState({
          title: "Noch kein Thema.",
          text: "Für dieses Fach ist gerade kein Thema mit Termin ausgewählt."
        }) || ""
      );
    }
    const progress = computeTopicProgress(thema);
    const step = nextStepModel(thema);
    const checks = renderLevelchecks(thema);
    return `
      <div class="lp-top">
        ${renderBar(thema, progress)}
        ${renderLive()}
        ${renderStatusFilters(thema.goals || [])}
      </div>
      <div class="lp-stage">
        <div class="lp-main">
          ${renderOnceHint()}
          ${renderGoalList(thema, step?.goalId || "")}
        </div>
        <aside class="lp-rail">
          ${renderProgressCard(thema, progress, step?.tierId || "")}
          ${renderNextStep(step)}
        </aside>
        ${checks ? `<aside class="lp-side">${checks}</aside>` : ""}
      </div>
      ${renderOverlay()}`;
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
    root.innerHTML = visuals?.pageShell(`<div class="lp-wrap">${renderBody()}</div>`) || "";
    bindHandlers(root);
    scrollFocusGoalIntoView();
    placeSheet(root);
    focusOverlay(root);
  }

  function scrollFocusGoalIntoView() {
    if (!state.focusGoalId) return;
    const id = String(state.focusGoalId);
    const escaped = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(id) : id.replace(/"/g, "");
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    requestAnimationFrame(() => {
      const el = document.querySelector(`[data-lp-goal="${escaped}"]`);
      el?.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
    });
  }

  function placeSheet(root) {
    const sheet = root.querySelector(".lp-sheet:not(.lp-sheet--help)");
    if (!sheet || !state.sheet) return;
    const wide = window.matchMedia("(min-width: 1024px)").matches;
    if (!wide) {
      sheet.classList.remove("is-popover");
      sheet.style.left = "";
      sheet.style.top = "";
      sheet.style.width = "";
      return;
    }
    const anchor =
      state.sheet.via === "more"
        ? root.querySelector(".lp-more.is-open")
        : root.querySelector(".lp-pill.is-open");
    sheet.classList.add("is-popover");
    const width = Math.min(320, window.innerWidth - 32);
    const rect = anchor ? anchor.getBoundingClientRect() : null;
    let left = rect ? rect.left : 16;
    left = Math.max(16, Math.min(left, window.innerWidth - width - 16));
    const height = sheet.offsetHeight || 280;
    let top = rect ? rect.bottom + 8 : 80;
    if (top + height > window.innerHeight - 16) {
      top = Math.max(16, (rect ? rect.top : 80) - height - 8);
    }
    sheet.style.left = `${left}px`;
    sheet.style.top = `${top}px`;
    sheet.style.width = `${width}px`;
  }

  function focusOverlay(root) {
    if (state.editingLcId) {
      const input = root.querySelector(".lp-lc__input");
      input?.focus();
      input?.select();
      return;
    }
    if (!state.sheet && !state.helpOpen) return;
    root.querySelector(".lp-sheet")?.focus();
  }

  function closeOverlay() {
    state.sheet = null;
    state.helpOpen = false;
    state.popover = null;
  }

  function bindEscape() {
    if (sheetKeyHandler) {
      document.removeEventListener("keydown", sheetKeyHandler);
      sheetKeyHandler = null;
    }
    if (!state.sheet && !state.helpOpen) return;
    sheetKeyHandler = (event) => {
      if (event.key !== "Escape") return;
      closeOverlay();
      document.removeEventListener("keydown", sheetKeyHandler);
      sheetKeyHandler = null;
      render();
    };
    document.addEventListener("keydown", sheetKeyHandler);
  }

  function bindHandlers(root) {
    root.querySelectorAll("[data-lp-subject]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.selectedSubject = btn.dataset.lpSubject;
        state.selectedThemaId = null;
        state.expandedGoalId = null;
        state.focusGoalId = null;
        closeOverlay();
        state.editingLcId = null;
        state.message = "";
        state.error = "";
        ensureSelection();
        render();
      });
    });

    root.querySelectorAll("[data-lp-thema]").forEach((el) => {
      const apply = () => {
        const id = el.tagName === "SELECT" ? el.value : el.dataset.lpThema;
        state.selectedThemaId = id;
        state.expandedGoalId = null;
        state.focusGoalId = null;
        closeOverlay();
        state.editingLcId = null;
        state.message = "";
        state.error = "";
        render();
      };
      if (el.tagName === "SELECT") el.addEventListener("change", apply);
      else el.addEventListener("click", apply);
    });

    root.querySelectorAll("[data-lp-status-filter]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.statusFilter = btn.dataset.lpStatusFilter;
        state.sheet = null;
        state.editingLcId = null;
        render();
      });
    });

    root.querySelectorAll("[data-lp-ziel]").forEach((btn) => {
      btn.addEventListener("click", () => openZiele());
    });

    root.querySelectorAll("[data-lp-help]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.helpOpen = !state.helpOpen;
        state.sheet = null;
        render();
      });
    });

    root.querySelectorAll("[data-lp-once-dismiss]").forEach((btn) => {
      btn.addEventListener("click", () => {
        dismissHint();
        render();
      });
    });

    root.querySelectorAll("[data-lp-pill]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const goalId = btn.dataset.lpPill;
        const tier = btn.dataset.lpTier;
        if (state.sheet && state.sheet.goalId === goalId && state.sheet.tier === tier && state.sheet.via !== "more") {
          state.sheet = null;
        } else {
          state.sheet = { goalId, tier, via: "pill" };
        }
        state.helpOpen = false;
        render();
      });
    });

    root.querySelectorAll("[data-lp-more]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const goalId = btn.dataset.lpMore;
        const tier = markTiers()[0]?.id || "rookie";
        if (state.sheet && state.sheet.goalId === goalId && state.sheet.via === "more") state.sheet = null;
        else state.sheet = { goalId, tier, via: "more" };
        state.helpOpen = false;
        render();
      });
    });

    root.querySelectorAll("[data-lp-sheet-tier]").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (!state.sheet) return;
        state.sheet = { ...state.sheet, tier: btn.dataset.lpSheetTier, via: "pill" };
        render();
      });
    });

    root.querySelectorAll("[data-lp-sheet-close]").forEach((btn) => {
      btn.addEventListener("click", () => {
        closeOverlay();
        render();
      });
    });

    root.querySelectorAll("[data-lp-coach]").forEach((btn) => {
      btn.addEventListener("click", (event) => {
        event.stopPropagation();
        closeOverlay();
        window.LogbuchCoach?.open({
          source: "levelplan",
          autostart: true,
          competenceId: btn.dataset.lpCoach || "",
          level: btn.dataset.lpLevel || "",
          kompetenzLabel: btn.dataset.lpLabel || "",
          themaLabel: btn.dataset.lpThema || ""
        });
        render();
      });
    });

    root.querySelectorAll("[data-lp-pick]").forEach((btn) => {
      btn.addEventListener("click", (event) => {
        event.stopPropagation();
        const goalId = btn.dataset.lpPickGoal;
        const tier = btn.dataset.lpPickTier;
        const status = btn.dataset.lpPick;
        closeOverlay();
        setStatus(goalId, tier, status);
      });
    });

    root.querySelectorAll("[data-lp-pct-edit]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.editingLcId = btn.dataset.lcId || null;
        closeOverlay();
        render();
      });
    });

    root.querySelectorAll(".lp-lc__input").forEach((input) => {
      input.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          ignorePercentBlur = true;
          state.editingLcId = null;
          render();
        } else if (event.key === "Enter") {
          event.preventDefault();
          input.blur();
        }
      });
      input.addEventListener("blur", () => {
        if (ignorePercentBlur) {
          ignorePercentBlur = false;
          return;
        }
        commitPercentEdit(input.value.trim(), input.dataset.topicId);
      });
    });

    bindEscape();
    bindLevelcheckSliders(root);
  }

  function paintTopicPercent(root, topicId, pct, hasValue, source) {
    const passed = hasValue && pct >= passPercent();
    root.querySelectorAll("[data-lp-lc-result]").forEach((card) => {
      if (card.dataset.topicId !== String(topicId)) return;
      card.classList.toggle("is-pass", !!passed);
      card.classList.toggle("is-empty", !hasValue);
      const range = card.querySelector(".lp-lc__range");
      if (range && range !== source) range.value = String(hasValue ? pct : 0);
      if (range) {
        range.setAttribute("aria-valuenow", String(hasValue ? pct : 0));
        range.setAttribute("aria-valuetext", hasValue ? `${pct} Prozent richtig` : "Ergebnis eintragen");
      }
      const button = card.querySelector("[data-lp-pct-edit]");
      if (button) {
        button.classList.toggle("is-empty", !hasValue);
        button.innerHTML = hasValue
          ? `${pct} % <span class="lp-lc__unit">richtig</span>`
          : "Ergebnis eintragen";
      }
    });
  }

  function syncTopicPercent(topicId) {
    const root = document.getElementById("levelplan-screen-root");
    if (!root) return;
    let value = null;
    for (const lc of state.data?.scheduledLevelchecks || []) {
      if (String(lc.levelCheckId) === String(topicId)) {
        value = lc.levelcheckPercent;
        break;
      }
    }
    if (value == null) {
      const thema = selectedThema();
      if (thema && String(thema.id) === String(topicId)) value = thema.target?.levelcheckPercent ?? null;
    }
    const has = value != null && value !== "" && Number.isInteger(Number(value));
    paintTopicPercent(root, topicId, has ? Number(value) : 0, has, null);
  }

  function commitPercentEdit(raw, topicId) {
    if (percentCommitLock) return;
    percentCommitLock = true;
    state.editingLcId = null;
    try {
      if (raw === "") {
        render();
        return;
      }
      const pct = Number(raw);
      if (!Number.isInteger(pct) || pct < 0 || pct > 100) {
        state.error = "Bitte eine ganze Zahl von 0 bis 100.";
        state.message = "";
        render();
        return;
      }
      state.error = "";
      saveLevelcheckPercent(topicId, pct);
      render();
    } finally {
      percentCommitLock = false;
    }
  }

  function bindLevelcheckSliders(root) {
    root.querySelectorAll("[data-lp-lc-result]").forEach((card) => {
      const topicId = card.dataset.topicId;
      const range = card.querySelector(".lp-lc__range");
      if (!topicId || !range || range.dataset.bound === "1") return;
      range.dataset.bound = "1";
      const commit = () => {
        const pct = Number(range.value);
        if (!Number.isInteger(pct) || pct < 0 || pct > 100) return;
        saveLevelcheckPercent(topicId, pct);
      };
      range.addEventListener("input", () => {
        const pct = Number(range.value);
        paintTopicPercent(root, topicId, pct, true, range);
        clearTimeout(lcResultSaveTimers[topicId]);
        lcResultSaveTimers[topicId] = setTimeout(commit, 400);
      });
      range.addEventListener("change", () => {
        clearTimeout(lcResultSaveTimers[topicId]);
        commit();
      });
    });
  }

  function applyLevelcheckPercentLocally(topicId, percent, passed) {
    const id = String(topicId);
    for (const lc of state.data?.scheduledLevelchecks || []) {
      if (String(lc.levelCheckId) === id) {
        lc.levelcheckPercent = percent;
        if (passed != null) lc.levelcheckPassed = !!passed;
      }
    }
    const thema = selectedThema();
    if (thema?.target && String(thema.id) === id) {
      thema.target.levelcheckPercent = percent;
      if (passed != null) thema.target.levelcheckPassed = !!passed;
    }
  }

  function flashLive(text, isError) {
    const el = document.querySelector("#levelplan-screen-root .lp-live");
    if (!el) return;
    el.textContent = text || "";
    el.classList.toggle("is-error", !!isError && !!text);
    el.classList.toggle("is-ok", !isError && !!text);
  }

  async function saveLevelcheckPercent(topicId, percent) {
    applyLevelcheckPercentLocally(topicId, percent);
    try {
      const res = await fetch("/api/student/zielsetzung", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ levelCheckId: topicId, levelcheckPercent: percent })
      });
      const data = await res.json();
      if (!data.success) {
        const message = data.message || "Speichern fehlgeschlagen.";
        state.error = message;
        state.message = "";
        flashLive(message, true);
        return;
      }
      const stored =
        data.levelcheckPercent != null ? Number(data.levelcheckPercent) : percent;
      applyLevelcheckPercentLocally(topicId, stored, data.levelcheckPassed);
      state.error = "";
      state.message = "Gespeichert.";
      flashLive("Gespeichert.", false);
      syncTopicPercent(topicId);
    } catch (err) {
      console.error(err);
      state.error = "Netzwerkfehler beim Speichern.";
      state.message = "";
      flashLive(state.error, true);
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
    state.sheet = null;
    state.helpOpen = false;
    state.editingLcId = null;
    const root = document.getElementById("levelplan-screen-root");
    if (root) root.innerHTML = `<div class="logbuch-loading">Lade Levelplan…</div>`;
    state.coachEnabled = (await window.LogbuchCoach?.refreshStatus?.()) === true;
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
