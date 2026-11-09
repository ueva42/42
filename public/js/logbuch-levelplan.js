/**
 * SRL-Logbuch – Lernstand als Strecke.
 * Eine Prozentzahl pro Thema, nur im Chip „Levelcheck“.
 * Offen, In Arbeit und Sicher speichern weiter über /api/student/levelcheck-mark.
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
    focusLevelcheckGoals: true,
    training: null,
    redeemCode: ""
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
    const goal = goalForTier(thema, tier.id);
    const open = !!(
      state.sheet &&
      state.sheet.via === "stage" &&
      state.sheet.tier === tier.id &&
      goal &&
      String(state.sheet.goalId) === String(goal.id)
    );
    const stateWord = stand.free ? "Noch nicht erforderlich" : active ? "In Arbeit" : stand.current > 0 && stand.needed > 0 && stand.current >= stand.needed ? "Geschafft" : "Offen";
    return `
      <button type="button" class="lp-tier ${active ? "is-active" : ""} ${stand.free ? "is-free" : ""} ${open ? "is-open" : ""}" style="--lp-accent:${accent}" data-lp-stage="${escapeHtml(tier.id)}" data-lp-stage-goal="${escapeHtml(goal?.id || "")}" aria-expanded="${open ? "true" : "false"}" aria-label="${escapeHtml(tier.label)}, ${escapeHtml(stateWord)}. Status setzen." ${goal ? "" : "disabled"}>
        <div class="lp-ring" style="--lp-progress:${stand.free ? 0 : stand.fill}" aria-hidden="true">
          <span class="lp-ring__value">${escapeHtml(center)}</span>
        </div>
        <div class="lp-tier__copy">
          <span class="lp-tier__name">${escapeHtml(tier.label)}</span>
          <span class="lp-tier__stat">${escapeHtml(stand.stat)} · ${escapeHtml(stateWord)}</span>
        </div>
      </button>`;
  }

  function renderVoluntaryLine(thema) {
    const counts = tierCounts(thema, "unterthema");
    const extra = counts.sicher > 0 ? ` · ${counts.sicher} sicher` : "";
    return `<p class="lp-voluntary">Unterthema frei · Freiwillige Vertiefung${extra}</p>`;
  }

  function trainingForThema(thema) {
    if (!thema || !state.training) return null;
    return (
      (state.training.topics || []).find(
        (topic) => String(topic.levelCheckId) === String(thema.id)
      ) || null
    );
  }

  function trainingForGoal(thema, goal) {
    const topic = trainingForThema(thema);
    if (!topic || !goal) return null;
    return (topic.goals || []).find((item) => String(item.goalId) === String(goal.id)) || null;
  }

  function formatTrainingTime(iso) {
    if (!iso) return "";
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  const TRAINING_METERS = [
    { id: "rookie", short: "R", label: "Rookie", accent: "rookie" },
    { id: "operator", short: "O", label: "Operator", accent: "operator" },
    { id: "streetLegend", short: "SL", label: "Street Legend", accent: "street_legend" }
  ];
  const RING_C = 87.96;

  function trainingSolved(stufe) {
    if (!stufe) return null;
    if (Number.isInteger(stufe.solved) && stufe.solved >= 0) return stufe.solved;
    const text = String(stufe.anzeige || "").trim();
    if (text === "sicher") return 6;
    const match = text.match(/^(\d+)\s+von\s+(\d+)$/);
    return match ? Number(match[1]) : null;
  }

  function renderTrainingRing(tier, solved) {
    const count = Math.max(0, Math.round(Number(solved) || 0));
    const ratio = Math.min(1, count / 6);
    const off = (RING_C * (1 - ratio)).toFixed(2);
    const accent = TIER_ACCENT[tier.accent] || "#22d3ee";
    const full = ratio >= 1 ? " is-full" : "";
    return `<span class="lp-ring${full}" style="--lp-tier:${accent};--lp-c:${RING_C};--lp-off:${off}" role="img" aria-label="${escapeHtml(tier.label)} ${count} von 6"><svg viewBox="0 0 36 36" aria-hidden="true"><circle class="lp-ring__track" cx="18" cy="18" r="14"></circle><circle class="lp-ring__arc" cx="18" cy="18" r="14"></circle></svg><span class="lp-ring__mid"><span class="lp-ring__n">${count}</span><span class="lp-ring__k">${escapeHtml(tier.short)}</span></span></span>`;
  }

  function trainingPensumLine(raw) {
    const text = String(raw || "").trim();
    if (!text) return "";
    if (text === "Pensum erfüllt") return "Training: Pensum erfüllt";
    return `Training: ${text.replace(/:\s+/g, " ")}`;
  }

  function renderTrainingGoal(item) {
    if (!item) return "";
    const rings = [];
    if (item.stufen) {
      for (const tier of TRAINING_METERS) {
        const solved = trainingSolved(item.stufen[tier.id]);
        if (solved == null) continue;
        rings.push(renderTrainingRing(tier, solved));
      }
    }
    const link = item.trainingUrl
      ? `<a class="lp-train__go" href="${escapeHtml(item.trainingUrl)}" target="_blank" rel="noopener noreferrer">Training starten</a>`
      : "";
    if (!rings.length) {
      if (!link) return "";
      return `<div class="lp-train"><p class="lp-train__when">Noch kein Trainingsstand</p>${link}</div>`;
    }
    const when = formatTrainingTime(item.updatedAt);
    const line = when ? `aus dem Training · ${when}` : "aus dem Training";
    return `<div class="lp-train"><div class="lp-train__rings">${rings.join("")}</div><p class="lp-train__when">${escapeHtml(line)}</p>${link}</div>`;
  }

  function renderRedeem(thema) {
    if (!trainingForThema(thema)) return "";
    return `
      <form class="lp-redeem" data-lp-redeem>
        <label for="lp-redeem-code">Code einlösen</label>
        <input id="lp-redeem-code" name="code" type="text" maxlength="80" autocomplete="off" spellcheck="false" autocapitalize="characters" placeholder="9-05B-R65-OP43-SL00-K1-I320-…" value="${escapeHtml(state.redeemCode || "")}">
        <button type="submit">Einlösen</button>
      </form>`;
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

  function cityMapButtonText(source) {
    const text = String(source?.beschriftung || "").trim();
    return text || "Stadtkarte öffnen";
  }

  function renderCityMap(thema) {
    const topic = trainingForThema(thema);
    if (!topic?.showStadtkarte) return "";
    const label = escapeHtml(cityMapButtonText(topic));
    if (topic.stadtkarte) {
      return `<a class="lp-chip lp-chip--map" href="${escapeHtml(topic.stadtkarte)}" target="_blank" rel="noopener noreferrer">${label}</a>`;
    }
    return `<button type="button" class="lp-chip lp-chip--map" disabled>${label}</button><span class="lp-map-hint">Zielnote setzen</span>`;
  }

  function renderBar(thema, progress, options) {
    const subjects = subjectsWithData();
    const themen = levelChecksForSubject(state.selectedSubject);
    const subjectButtons = subjects
      .map((group) => {
        const on = group.subject === state.selectedSubject;
        return `<button type="button" role="tab" class="${on ? "is-active" : ""}" data-lp-subject="${escapeHtml(group.subject)}" aria-selected="${on ? "true" : "false"}">${escapeHtml(group.subject)}</button>`;
      })
      .join("");
    const ka = options?.hideKa ? "" : kaLabel(thema);
    const ziel = progress.hasTarget ? `Ziel: Note ${progress.targetGradeLabel}` : "Zielnote setzen";
    const map = renderCityMap(thema);
    return `
      <div class="lp-bar">
        <div class="lp-seg" role="tablist" aria-label="Fach">${subjectButtons}</div>
        ${renderThemaControl(themen)}
        ${ka ? `<span class="lp-chip lp-chip--ka" title="${escapeHtml(ka)}">${escapeHtml(ka)}</span>` : ""}
        <div class="lp-bar__ziel">
          ${map}
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
    let stagePanel = "";
    if (state.sheet?.via === "stage") {
      const goal = findGoal(state.sheet.goalId);
      const tier = markTiers().find((entry) => entry.id === state.sheet.tier);
      stagePanel = renderStatusPanel(goal, tier);
    }
    const pensumLine = trainingPensumLine(trainingForThema(thema)?.pensum);
    return `
      <section class="lp-block" aria-labelledby="lp-progress-title">
        <h2 id="lp-progress-title" class="lp-kicker">${escapeHtml(title)}</h2>
        <div class="lp-card lp-path">
          ${pensumLine ? `<p class="lp-train-pensum">${escapeHtml(pensumLine)}</p>` : ""}
          ${lead}
          <div class="lp-tiers">${rows}</div>
          ${stagePanel}
          ${renderVoluntaryLine(thema)}
        </div>
      </section>`;
  }

  function nextStepModel(thema) {
    const items = Array.isArray(thema?.target?.workItems) ? thema.target.workItems : [];
    if (thema?.target?.targetGrade) {
      const item = items[0];
      if (!item || item.status === "sicher" || item.status === "geschafft") return null;
      const goal = (thema.goals || []).find((entry) => String(entry.id) === String(item.goalId)) || null;
      const info = goal ? materialInfo(goal) : { url: "", note: "" };
      const status = goal && item.tier ? tierStatus(goal, item.tier) : item.status || "offen";
      return {
        title: item.goalText || goal?.text || "Nächstes Unterthema",
        detail: item.taskText || "",
        goalId: item.goalId || goal?.id || "",
        tierId: item.tier || "",
        tierLabel: item.tierLabel || "",
        url: info.url || item.practiceUrl || "",
        status: status === "in_arbeit" ? "in_arbeit" : "offen"
      };
    }
    for (const tier of markTiers()) {
      for (const goal of thema?.goals || []) {
        const status = tierStatus(goal, tier.id);
        if (status === "sicher") continue;
        const detail = tierGoalText(goal, tier);
        return {
          title: goal.text,
          detail,
          goalId: goal.id,
          tierId: tier.id,
          tierLabel: tier.label,
          url: materialInfo(goal).url,
          status: status === "in_arbeit" ? "in_arbeit" : "offen"
        };
      }
    }
    return null;
  }

  function renderNextStep(step) {
    if (!step) return "";
    const detail = step.detail && step.detail !== step.title && step.detail !== "–" ? step.detail : "";
    const actionLabel = step.status === "in_arbeit" ? "Weiterarbeiten →" : "Mission starten →";
    const go = step.url
      ? `<a class="lp-next__go" href="${escapeHtml(step.url)}" target="_blank" rel="noopener noreferrer">${actionLabel}</a>`
      : `<p class="lp-next__miss">Für diesen Schritt ist noch kein Material hinterlegt.</p>`;
    return `
      <section class="lp-next" aria-labelledby="lp-next-title">
        <h2 id="lp-next-title" class="lp-kicker">Nächste Mission</h2>
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
    const showDot = !allLinked && linked.has(String(goal.id));
    const focus = String(state.focusGoalId) === String(goal.id);
    const isNext = nextGoalId && String(goal.id) === String(nextGoalId);
    const pills = markTiers()
      .map((tier) => {
        const raw = tierStatus(goal, tier.id);
        const status = STATUS_META[raw] ? raw : "offen";
        const meta = STATUS_META[status];
        const open = !!(sheetForGoal && state.sheet.via !== "stage" && state.sheet.tier === tier.id);
        const busy = state.saving === `${goal.id}_${tier.id}`;
        return `<button type="button" class="lp-pill lp-pill--${tier.id} lp-pill--${status} ${open ? "is-open" : ""} ${busy ? "is-busy" : ""}" data-lp-pill="${escapeHtml(goal.id)}" data-lp-tier="${escapeHtml(tier.id)}" aria-expanded="${open ? "true" : "false"}" aria-label="${escapeHtml(tier.label)}: ${escapeHtml(meta.label)}. Status setzen." ${busy ? "disabled" : ""}><span class="lp-pill__tier">${tierShort(tier.id)}</span><span aria-hidden="true">·</span><span class="lp-pill__status">${escapeHtml(meta.label)}</span>${status === "sicher" ? `<span class="lp-pill__icon" aria-hidden="true">${meta.icon}</span>` : ""}</button>`;
      })
      .join("");
    let panel = "";
    if (sheetForGoal && state.sheet.via !== "stage") {
      const tier = markTiers().find((entry) => entry.id === state.sheet.tier) || markTiers()[0];
      panel = renderStatusPanel(goal, tier);
    }
    return `
      <article class="lp-goal ${focus ? "is-plan-focus" : ""} ${isNext ? "is-next" : ""}" data-lp-goal="${escapeHtml(goal.id)}">
        <div class="lp-goal__head">
          ${showDot ? `<span class="lp-dot" aria-hidden="true"></span><span class="lp-sr">Im Levelcheck</span>` : ""}
          <h3 class="lp-goal__title">${escapeHtml(goal.text)}</h3>
          ${isNext ? `<span class="lp-goal__badge">Nächste Mission</span>` : ""}
        </div>
        <div class="lp-pills">${pills}</div>
        ${renderTrainingGoal(trainingForGoal(selectedThema(), goal))}
        ${panel}
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
    // isMathSubject lebt im Coach, nicht in dieser Datei. Ein nackter Aufruf wirft
    // und bricht das Neuzeichnen ab – der Tipp auf den Status wirkt dann tot.
    if (typeof window.LogbuchCoach?.isMathSubject === "function" && !window.LogbuchCoach.isMathSubject(state.selectedSubject)) {
      return false;
    }
    return tierId === "rookie" || tierId === "operator" || tierId === "street_legend";
  }

  function goalForTier(thema, tierId) {
    const goals = thema?.goals || [];
    if (!goals.length || !tierId) return null;
    const step = nextStepModel(thema);
    if (step?.tierId === tierId && step.goalId) {
      const match = goals.find((goal) => String(goal.id) === String(step.goalId));
      if (match) return match;
    }
    return goals.find((goal) => tierStatus(goal, tierId) !== "sicher") || goals[0];
  }

  function renderStatusPanel(goal, tier) {
    if (!goal || !tier) return "";
    const status = tierStatus(goal, tier.id);
    const info = materialInfo(goal);
    const thema = selectedThema();
    const goalText = tierGoalText(goal, tier);
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
    const learn = goalText && goalText !== "–" && goalText !== String(goal.text || "").trim()
      ? `<p class="lp-status-pick__goal">${escapeHtml(goalText)}</p>`
      : "";
    return `
      <div class="lp-status-pick" role="group" aria-label="Status für ${escapeHtml(tier.label)}: ${escapeHtml(goal.text || "")}">
        <p class="lp-status-pick__label">Status setzen · ${escapeHtml(tier.label)}</p>
        <p class="lp-status-pick__topic">${escapeHtml(goal.text || "")}</p>
        ${learn}
        <div class="lp-status-pick__opts">${options}</div>
        ${coach}
        ${material}
        <button type="button" class="lp-sheet__close" data-lp-sheet-close>Schließen</button>
      </div>`;
  }

  function renderHelp() {
    return `
      <div class="lp-sheet-root">
        <button type="button" class="lp-sheet-backdrop" data-lp-sheet-close aria-label="Hinweis schließen"></button>
        <div class="lp-sheet lp-sheet--help" role="dialog" tabindex="-1" aria-modal="true" aria-labelledby="lp-help-title">
          <div class="lp-sheet__grab" aria-hidden="true"></div>
          <h2 id="lp-help-title">So geht der Lernstand</h2>
          <div class="lp-helpbox">
            <p>Die Straße zeigt deine Missionen. DU steht auf der Mission, die für deine Zielnote als Nächstes dran ist. PLAN zeigt den nächsten Levelcheck.</p>
            <p>Unter „Jetzt dran“ startest du das Training und meldest die Stufe als sicher.</p>
            <p>Im Logbuch tippst du eine Stufe an. Sie wechselt von Offen zu In Arbeit zu Sicher und wird gespeichert. Die Straße zieht sofort mit.</p>
            <p>Pensum zeigt, wie viele Stufen deine Zielnote verlangt.</p>
            <p>Die Prozentzahl im Chip Levelcheck gilt für das ganze Thema. Sie wird hier nur angezeigt.</p>
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
    return "";
  }

  function openZiele() {
    if (window.StudentRouter?.navigateToSection) {
      window.StudentRouter.navigateToSection("zielsetzung");
      return;
    }
    window.location.assign("/student/zielsetzung");
  }

  function todayIsoLocal() {
    const date = new Date();
    const z = (n) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${z(date.getMonth() + 1)}-${z(date.getDate())}`;
  }

  function topicLevelcheckPercent(thema) {
    const direct = storedPercent({ levelcheckPercent: thema?.target?.levelcheckPercent });
    if (direct != null) return direct;
    for (const lc of levelcheckRecordsForThema(thema?.id)) {
      const n = storedPercent(lc);
      if (n != null) return n;
    }
    return null;
  }

  const ROUTE_STACK_WIDTH = 1100;
  const NEXT_STATUS = { offen: "in_arbeit", in_arbeit: "sicher", sicher: "offen" };

  function routeStackWidth() {
    const section = document.getElementById("levelplan-section");
    const measured = section?.getBoundingClientRect?.().width || 0;
    if (measured > 0) return measured;
    return window.innerWidth || 1280;
  }

  function routeIsNarrow() {
    const next = routeStackWidth() < ROUTE_STACK_WIDTH;
    ensureRouteResize.narrow = next;
    return next;
  }

  function ensureRouteResize() {
    if (ensureRouteResize.bound) return;
    ensureRouteResize.bound = true;
    let timer = 0;
    window.addEventListener("resize", () => {
      const next = routeStackWidth() < ROUTE_STACK_WIDTH;
      if (next === ensureRouteResize.narrow) return;
      ensureRouteResize.narrow = next;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (document.getElementById("levelplan-screen-root") && state.data) render();
      }, 80);
    });
  }

  function levelchecksSorted(thema) {
    return levelcheckRecordsForThema(thema?.id)
      .slice()
      .sort((a, b) => {
        const da = String(a.date || "");
        const db = String(b.date || "");
        if (da && db) return da.localeCompare(db);
        if (da) return -1;
        if (db) return 1;
        return 0;
      });
  }

  function kaDaysChip(thema) {
    const iso = String(thema?.target?.checkpointDate || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
    const date = new Date(`${iso}T12:00:00`);
    if (Number.isNaN(date.getTime())) return null;
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    const days = Math.round((date.getTime() - today.getTime()) / 86400000);
    if (days > 1) return { label: "KA in", value: `${days} Tagen` };
    if (days === 1) return { label: "KA in", value: "1 Tag" };
    if (days === 0) return { label: "KA", value: "heute" };
    if (days === -1) return { label: "KA", value: "gestern" };
    return { label: "KA", value: `vor ${Math.abs(days)} Tagen` };
  }

  function buildRouteModel(thema, progress) {
    const api = window.LogbuchLevelplanRoute;
    const goals = thema?.goals || [];
    if (!api || !goals.length) return null;
    const rules = progress.hasTarget
      ? window.LOGBUCH?.getGradeRequirements?.(progress.targetGrade) || null
      : null;
    const statusOf = (goal, tierId) => tierStatus(goal, tierId);
    const cur = api.currentMissionIndex(goals, rules, statusOf);
    const narrow = routeIsNarrow();
    const layout = api.routeLayout(goals.length, narrow ? { direction: "up" } : null);
    if (!layout) return null;
    const plan = api.planState({
      goalIds: goals.map((goal) => goal.id),
      levelchecks: levelcheckRecordsForThema(thema.id),
      today: todayIsoLocal(),
      kaDate: thema?.target?.checkpointDate || "",
      currentIndex: cur
    });
    const checks = levelchecksSorted(thema);
    const checkIndexByGoal = new Map();
    checks.forEach((lc, index) => {
      for (const id of lc.linkedGoalIds || []) {
        const key = String(id);
        if (!checkIndexByGoal.has(key)) checkIndexByGoal.set(key, index);
      }
    });
    const allowed = new Set(markTiers().map((tier) => tier.id));
    const required = api.requiredTiersForMission(cur, goals.length, rules);
    const tierPool = required.filter((id) => allowed.has(id));
    const activeTierId =
      (tierPool.length ? tierPool : required).find((id) => statusOf(goals[cur], id) !== "sicher") ||
      null;
    return {
      api,
      goals,
      rules,
      statusOf,
      cur,
      layout,
      plan,
      checks,
      checkIndexByGoal,
      activeTierId,
      narrow
    };
  }

  function levelcheckPhrase(model, goalId) {
    const index = model.checkIndexByGoal.get(String(goalId));
    if (index == null) return "";
    const lc = model.checks[index];
    const when = model.api.formatShortDate(lc?.date);
    return when ? `Levelcheck ${index + 1} · ${when}` : `Levelcheck ${index + 1}`;
  }

  function missionTag(model, index, done) {
    if (index === model.cur) return { text: "JETZT", kind: "now" };
    if (model.plan.showPin && index === model.plan.planIndex) return { text: "PLAN", kind: "plan" };
    if (done) return { text: "GESCHAFFT", kind: "done" };
    const lc = model.checkIndexByGoal.get(String(model.goals[index]?.id));
    if (lc == null) return { text: "", kind: "none" };
    return { text: `LC ${lc + 1}`, kind: "lc" };
  }

  function missionShortLabel(text, count) {
    const raw = String(text || "").trim() || "Mission";
    const max = count >= 16 ? 12 : 18;
    if (raw.length <= max) return raw;
    return `${raw.slice(0, max - 1).trimEnd()}…`;
  }

  function renderRouteMap(thema, progress, model) {
    const ctx = model || buildRouteModel(thema, progress);
    if (!ctx) return "";
    const { api, goals, rules, statusOf, cur, layout, plan } = ctx;
    const up = layout.direction === "up";
    const etappen = progress.hasTarget ? api.etappenCounts(goals, rules, statusOf) : { sicher: 0, all: 0 };
    const pct = topicLevelcheckPercent(thema);
    const tiers = [
      { id: "rookie", label: "Rookie", color: TIER_ACCENT.rookie },
      { id: "operator", label: "Operator", color: TIER_ACCENT.operator },
      { id: "street_legend", label: "Street Legend", color: TIER_ACCENT.street_legend }
    ];
    const chips = [];
    if (etappen.all > 0) {
      chips.push(
        `<span class="lp-route__chip lp-route__chip--etappen"><span>Etappen</span><strong>${etappen.sicher}/${etappen.all}</strong></span>`
      );
    }
    if (plan.showPace) {
      chips.push(
        `<span class="lp-route__chip lp-route__chip--pace"><span>Pace</span><strong>${escapeHtml(plan.paceLabel)}</strong></span>`
      );
    }
    const kaChip = kaDaysChip(thema);
    if (kaChip) {
      chips.push(
        `<span class="lp-route__chip lp-route__chip--ka"><span>${escapeHtml(kaChip.label)}</span><strong>${escapeHtml(kaChip.value)}</strong></span>`
      );
    }
    chips.push(
      `<span class="lp-route__chip lp-route__chip--check"><span>Levelcheck</span><strong data-lp-route-pct data-topic-id="${escapeHtml(thema.id)}">${pct == null ? "–" : `${pct} %`}</strong></span>`
    );
    const legend = tiers
      .map(
        (tier) =>
          `<li><span class="lp-route__swatch" style="background:${tier.color}"></span>${escapeHtml(tier.label)}</li>`
      )
      .join("");
    const skyline = [];
    let skyX = 48;
    for (let i = 0; skyX < layout.width - 70 && i < 48; i++) {
      const w = 18 + ((i * 17) % 26);
      const h = 28 + ((i * 29) % 52);
      const y = 8 + ((i * 11) % 16);
      skyline.push(`<rect x="${skyX}" y="${y}" width="${w}" height="${h}"></rect>`);
      skyX += w + 36 + ((i * 23) % 48);
    }
    const nodes = goals
      .map((goal, i) => {
        const point = layout.missions[i];
        const done = api.missionIsDone(goal, i, goals.length, rules, statusOf);
        const edge = i === cur ? "#22d3ee" : done ? "#5ee38a" : "#2a335c";
        const arcs = tiers
          .map((tier, k) => {
            const raw = statusOf(goal, tier.id);
            const st = raw === "sicher" || raw === "in_arbeit" ? raw : "offen";
            const color = st === "offen" ? "#2a335c" : tier.color;
            const opacity = st === "in_arbeit" ? "0.4" : "1";
            const offset = k ? ` stroke-dashoffset="${-100 * k}"` : "";
            return `<circle r="17" fill="none" stroke="${color}" stroke-opacity="${opacity}" stroke-width="5" pathLength="300" stroke-dasharray="88 212"${offset} transform="rotate(-90)"></circle>`;
          })
          .join("");
        const name = String(goal.text || "").trim() || "Mission";
        const detail = tiers
          .map((tier) => {
            const raw = statusOf(goal, tier.id);
            const st = STATUS_META[raw] ? raw : "offen";
            return `${tier.label} ${STATUS_META[st].label}`;
          })
          .join(", ");
        const size = i + 1 > 9 ? 12 : 14;
        const nameAttrs = up
          ? `x="32" y="4" text-anchor="start"`
          : `y="46" text-anchor="middle"`;
        return `<g transform="translate(${point.x} ${point.y})"><title>Mission ${i + 1} ${escapeHtml(name)}. ${escapeHtml(detail)}.</title><circle r="23" fill="#0b1022" stroke="${edge}" stroke-width="2"></circle>${arcs}<text y="5" fill="#ffffff" font-family="Orbitron, sans-serif" font-size="${size}" font-weight="800" text-anchor="middle">${i + 1}</text><text ${nameAttrs} fill="#e8ecff" font-size="12" font-weight="600" stroke="#060914" stroke-width="4" paint-order="stroke">${escapeHtml(missionShortLabel(name, goals.length))}</text></g>`;
      })
      .join("");
    const records = levelcheckRecordsForThema(thema.id)
      .slice()
      .sort((a, b) => {
        const da = String(a.date || "");
        const db = String(b.date || "");
        if (da && db) return da.localeCompare(db);
        if (da) return -1;
        if (db) return 1;
        return 0;
      });
    const brackets = [];
    records.forEach((lc, recordIndex) => {
      const linked = new Set((lc.linkedGoalIds || []).map(String));
      const found = [];
      goals.forEach((goal, i) => {
        if (linked.has(String(goal.id))) found.push(i);
      });
      if (!found.length) return;
      const leftPoint = layout.missions[found[0]];
      const rightPoint = layout.missions[found[found.length - 1]];
      let x1 = leftPoint.x;
      let x2 = rightPoint.x;
      if (x2 - x1 < 56) {
        const mid = (x1 + x2) / 2;
        x1 = mid - 28;
        x2 = mid + 28;
      }
      const when = api.formatShortDate(lc.date);
      const text = when
        ? `Levelcheck ${recordIndex + 1} · ${when}`
        : `Levelcheck ${recordIndex + 1}`;
      brackets.push({
        x1,
        x2,
        y1: leftPoint.y,
        y2: rightPoint.y,
        title: `Levelcheck ${recordIndex + 1}`,
        when: when || "",
        text
      });
    });
    let height = layout.height;
    let bracketSvg = "";
    if (up) {
      const x = Math.max(336, layout.width - 124);
      let textY = -999;
      bracketSvg = brackets
        .map((bracket) => {
          let top = Math.min(bracket.y1, bracket.y2);
          let bot = Math.max(bracket.y1, bracket.y2);
          if (bot - top < 32) {
            const mid = (top + bot) / 2;
            top = mid - 16;
            bot = mid + 16;
          }
          let labelY = (top + bot) / 2 - (bracket.when ? 6 : 0);
          if (labelY < textY + 30) labelY = textY + 30;
          textY = labelY + (bracket.when ? 14 : 0);
          const date = bracket.when
            ? `<tspan x="${x + 12}" dy="14">${escapeHtml(bracket.when)}</tspan>`
            : "";
          return `<path d="M${x} ${roundRoute(bot)} H${x + 8} V${roundRoute(top)} H${x}" fill="none" stroke="#5ee38a" stroke-width="2"></path><text x="${x + 12}" y="${roundRoute(labelY)}" fill="#8de8a9" font-size="11" font-weight="700" letter-spacing="0.04em" text-anchor="start">${escapeHtml(bracket.title)}${date}</text>`;
        })
        .join("");
    } else {
      const lanes = [];
      brackets.forEach((bracket) => {
        const left = Math.min(bracket.x1, bracket.x2) - 90;
        const right = Math.max(bracket.x1, bracket.x2) + 90;
        let lane = lanes.findIndex((segs) => segs.every((seg) => right < seg.left || left > seg.right));
        if (lane < 0) {
          lane = lanes.length;
          lanes.push([]);
        }
        lanes[lane].push({ left, right });
        bracket.lane = lane;
      });
      const lowY = Math.max(...layout.missions.map((m) => m.y), layout.start.y);
      const bracketBase = lowY + 68;
      const laneCount = Math.max(1, lanes.length);
      height = Math.max(layout.height, bracketBase + 28 + Math.max(0, laneCount - 1) * 32 + 8);
      bracketSvg = brackets
        .map((bracket) => {
          const y = bracketBase + bracket.lane * 32;
          const mid = roundRoute((bracket.x1 + bracket.x2) / 2);
          return `<path d="M${roundRoute(bracket.x1)} ${y} V${y + 8} H${roundRoute(bracket.x2)} V${y}" fill="none" stroke="#5ee38a" stroke-width="2"></path><text x="${mid}" y="${y + 22}" fill="#8de8a9" font-size="11" font-weight="700" letter-spacing="0.08em" text-anchor="middle">${escapeHtml(bracket.text)}</text>`;
        })
        .join("");
    }
    const curPct = api.missionFraction(layout, cur);
    const planPct = plan.showPin ? api.missionFraction(layout, plan.planIndex) : 0;
    const du = layout.missions[cur];
    let planPin = "";
    if (plan.showPin && layout.missions[plan.planIndex]) {
      const point = layout.missions[plan.planIndex];
      const same = plan.planIndex === cur;
      const lift = !up && Math.abs(point.x - du.x) < 40 ? 72 : 0;
      const w = Math.max(112, Math.round(20 + plan.pinLabel.length * 6.6));
      const half = w / 2;
      const boxX = up ? -w - 18 : -half;
      const boxY = up && same ? 18 : -78 - lift;
      const textY = boxY + 17;
      const subY = boxY + 33;
      const tipY = up && same ? 8 : -26 - lift;
      const tipBase = up && same ? -6 : -40 - lift;
      planPin = `<g transform="translate(${point.x} ${point.y})"><path d="M0 ${tipY} L-9 ${tipBase} L9 ${tipBase} Z" fill="#a855f7" opacity="0.85"></path><rect x="${boxX}" y="${boxY}" width="${w}" height="40" rx="12" fill="#120d2c" stroke="#a855f7" stroke-width="2" stroke-dasharray="5 4"></rect><text x="${boxX + half}" y="${textY}" fill="#d4c2ff" font-family="Orbitron, sans-serif" font-size="12" font-weight="800" text-anchor="middle">PLAN</text><text x="${boxX + half}" y="${subY}" fill="#d4c2ff" font-size="11" font-weight="600" text-anchor="middle">${escapeHtml(plan.pinLabel)}</text></g>`;
    }
    const kaShort = api.formatShortDate(thema?.target?.checkpointDate || "");
    const flagWhen = kaShort ? `KA · ${kaShort}` : "KA";
    const duBox = up
      ? `<rect x="-132" y="-70" width="88" height="40" rx="12" fill="#22d3ee"></rect><text x="-88" y="-53" fill="#060914" font-family="Orbitron, sans-serif" font-size="13" font-weight="800" text-anchor="middle">DU</text><text x="-88" y="-37" fill="#060914" font-size="11" font-weight="700" text-anchor="middle">jetzt</text>`
      : `<rect x="-44" y="-78" width="88" height="40" rx="12" fill="#22d3ee"></rect><text y="-61" fill="#060914" font-family="Orbitron, sans-serif" font-size="13" font-weight="800" text-anchor="middle">DU</text><text y="-45" fill="#060914" font-size="11" font-weight="700" text-anchor="middle">jetzt</text>`;
    const flagMarkup = up
      ? `<g transform="translate(${layout.flag.x} ${layout.flag.y})"><line x1="0" y1="22" x2="0" y2="-36" stroke="#e8ecff" stroke-width="3"></line><rect x="0" y="-36" width="34" height="22" fill="url(#lpRouteCheck)"></rect><text x="42" y="-20" fill="#f472b6" font-family="Orbitron, sans-serif" font-size="12" font-weight="800" text-anchor="start" letter-spacing="1">ZIEL</text><text x="42" y="-4" fill="#c4cae6" font-size="12" text-anchor="start">${escapeHtml(flagWhen)}</text></g>`
      : `<g transform="translate(${layout.flag.x} ${layout.flag.y})"><line x1="0" y1="0" x2="0" y2="-64" stroke="#e8ecff" stroke-width="3"></line><rect x="0" y="-64" width="36" height="24" fill="url(#lpRouteCheck)"></rect><text x="0" y="36" fill="#f472b6" font-family="Orbitron, sans-serif" font-size="12" font-weight="800" text-anchor="middle" letter-spacing="1">ZIEL</text><text x="0" y="52" fill="#c4cae6" font-size="12" text-anchor="middle">${escapeHtml(flagWhen)}</text></g>`;
    const startLabelY = up ? layout.start.y + 16 : layout.start.y + 34;
    const subject = state.selectedSubject || "";
    const aria = [
      `Route ${thema.name || ""}, ${goals.length} Missionen.`,
      `Du bist bei Mission ${cur + 1}.`,
      plan.showPin ? `Plan ${plan.pinLabel}, Mission ${plan.planIndex + 1}.` : "Kein Plan-Pin."
    ].join(" ");
    return `
      <section class="lp-route${up ? " is-up" : ""}" aria-label="Route ${escapeHtml(thema.name || "Thema")}">
        <div class="lp-route__head">
          <div class="lp-route__titles">
            <p class="lp-route__kicker">Mein Lernstand${subject ? ` · ${escapeHtml(subject)}` : ""}</p>
            <h2 class="lp-route__title">${escapeHtml(thema.name || "Thema")}</h2>
            <div class="lp-route__chips">${chips.join("")}</div>
          </div>
          <ul class="lp-route__legend">${legend}</ul>
          <p class="lp-route__now">
            <span class="lp-route__now-kicker">Du bist bei</span>
            <span class="lp-route__now-num">Mission ${cur + 1}<span> / ${goals.length}</span></span>
          </p>
        </div>
        <div class="lp-route__road"${up ? "" : ` style="--lp-route-min:${layout.width}px"`}>
          <svg viewBox="0 0 ${layout.width} ${height}" role="img" aria-label="${escapeHtml(aria)}">
            <defs>
              <linearGradient id="lpRouteProg" x1="0" y1="${up ? 1 : 0}" x2="${up ? 0 : 1}" y2="0">
                <stop offset="0" stop-color="#22d3ee"></stop>
                <stop offset="1" stop-color="#a855f7"></stop>
              </linearGradient>
              <pattern id="lpRouteGrid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M40 0H0V40" fill="none" stroke="#1a2148" stroke-width="1"></path>
              </pattern>
              <pattern id="lpRouteCheck" width="8" height="8" patternUnits="userSpaceOnUse">
                <rect width="8" height="8" fill="#e8ecff"></rect>
                <rect width="4" height="4" fill="#060914"></rect>
                <rect x="4" y="4" width="4" height="4" fill="#060914"></rect>
              </pattern>
            </defs>
            <rect width="${layout.width}" height="${height}" fill="url(#lpRouteGrid)" opacity="0.55"></rect>
            <g opacity="0.4" fill="#1d1640">${skyline.join("")}</g>
            <path d="${layout.path}" fill="none" stroke="#252e58" stroke-width="38" stroke-linecap="round"></path>
            <path d="${layout.path}" fill="none" stroke="#11162e" stroke-width="32" stroke-linecap="round"></path>
            <path d="${layout.path}" fill="none" stroke="#3a4475" stroke-width="2" stroke-dasharray="14 12"></path>
            <path d="${layout.path}" fill="none" stroke="#a855f7" stroke-width="5" stroke-linecap="round" pathLength="100" stroke-dasharray="${api.planDash(curPct, planPct)}" opacity="0.8"></path>
            <path d="${layout.path}" fill="none" stroke="#22d3ee" stroke-width="14" stroke-linecap="round" pathLength="100" stroke-dasharray="${api.progressDash(curPct)}" opacity="0.18"></path>
            <path d="${layout.path}" fill="none" stroke="url(#lpRouteProg)" stroke-width="6" stroke-linecap="round" pathLength="100" stroke-dasharray="${api.progressDash(curPct)}"></path>
            <text x="${layout.start.x}" y="${startLabelY}" fill="#9aa3c7" font-family="Orbitron, sans-serif" font-size="12" font-weight="800" text-anchor="middle" letter-spacing="2">START</text>
            ${nodes}
            ${flagMarkup}
            ${planPin}
            <g transform="translate(${du.x} ${du.y})">
              <circle r="34" fill="#22d3ee" opacity="0.16"></circle>
              <path d="M0 -26 L-9 -40 L9 -40 Z" fill="#22d3ee"></path>
              ${duBox}
            </g>
            ${bracketSvg}
          </svg>
        </div>
      </section>`;
  }

  function roundRoute(n) {
    return Math.round(n * 10) / 10;
  }

  function renderJetzt(thema, model) {
    const goal = model.goals[model.cur];
    const tier = markTiers().find((entry) => entry.id === model.activeTierId) || null;
    const lcIndex = model.checkIndexByGoal.get(String(goal.id));
    const after = lcIndex == null ? "" : ` · danach Levelcheck ${lcIndex + 1}`;
    const raw = tier ? model.statusOf(goal, tier.id) : "sicher";
    const status = STATUS_META[raw] ? raw : "offen";
    const color = tier ? TIER_ACCENT[tier.id] || "#f5a547" : "#5ee38a";
    const chip = tier
      ? `<span class="lp-now__chip" style="background:${color}">${escapeHtml(tier.label)}</span><span class="lp-now__status">${escapeHtml(STATUS_META[status].label)}</span>`
      : `<span class="lp-now__chip lp-now__chip--done">Sicher</span>`;
    const blurb = tier
      ? `Trainiere im Trainingscenter, bis du die ${tier.label}-Aufgaben ohne Hilfe schaffst. Dann meldest du die Stufe als sicher.`
      : "Die Stufen für deine Zielnote sind auf dieser Mission sicher. Im Logbuch kannst du eine Stufe weiter anpassen.";
    const url = trainingForGoal(thema, goal)?.trainingUrl || "";
    const train = url
      ? `<a class="lp-now__go" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">Training starten →</a>`
      : `<p class="lp-now__miss">Für diese Mission ist noch kein Training hinterlegt.</p>`;
    const busy = !!(tier && state.saving === `${goal.id}_${tier.id}`);
    const safe = tier
      ? `<button type="button" class="lp-now__safe" data-lp-mark-safe="${escapeHtml(goal.id)}" data-lp-tier="${escapeHtml(tier.id)}" ${busy ? "disabled" : ""}>${escapeHtml(tier.label)} als sicher melden</button>`
      : "";
    return `
      <section class="lp-now" aria-labelledby="lp-now-title">
        <div class="lp-now__stripe" aria-hidden="true"></div>
        <div class="lp-now__copy">
          <span class="lp-now__flag">Jetzt dran</span>
          <div class="lp-now__meta">${chip}</div>
          <p class="lp-now__where">Mission ${model.cur + 1} von ${model.goals.length}${escapeHtml(after)}</p>
          <h2 id="lp-now-title" class="lp-now__title">${escapeHtml(goal.text || "Mission")}</h2>
          <p class="lp-now__text">${escapeHtml(blurb)}</p>
        </div>
        <div class="lp-now__actions">
          ${train}
          ${safe}
        </div>
      </section>`;
  }

  function renderPensum(thema, progress) {
    const total = (thema?.goals || []).length;
    const rules = progress.hasTarget
      ? window.LOGBUCH?.getGradeRequirements?.(progress.targetGrade)
      : null;
    const bars = markTiers()
      .map((tier) => {
        const sicher = tierCounts(thema, tier.id).sicher;
        const ratio = rules ? Number(rules[tier.id]) || 0 : 1;
        const needed = progress.hasTarget ? Math.ceil(total * ratio) : total;
        const free = progress.hasTarget && needed <= 0;
        const fill = !free && needed > 0 ? Math.min(100, Math.round((sicher / needed) * 100)) : 0;
        const count = free
          ? "nicht nötig"
          : needed < total
            ? `${sicher} / ${total} · ${needed} nötig`
            : `${sicher} / ${total}`;
        const color = TIER_ACCENT[tier.id] || "#22d3ee";
        return `
          <div class="lp-pensum__bar">
            <div class="lp-pensum__labels">
              <span style="color:${color}">${escapeHtml(tier.label)}</span>
              <span>${escapeHtml(count)}</span>
            </div>
            <div class="lp-pensum__track" aria-hidden="true"><span class="lp-pensum__fill" style="width:${fill}%;background:${color}"></span></div>
          </div>`;
      })
      .join("");
    const title = progress.hasTarget ? `Pensum Note ${progress.targetGradeLabel}` : "Pensum";
    const change = progress.hasTarget ? "Ziel ändern" : "Ziel setzen";
    return `
      <section class="lp-pensum" aria-labelledby="lp-pensum-title">
        <div class="lp-pensum__head">
          <h2 id="lp-pensum-title" class="lp-kicker">${escapeHtml(title)}</h2>
          <button type="button" class="lp-pensum__change" data-lp-ziel>${change}</button>
        </div>
        ${bars}
      </section>`;
  }

  function renderMissionRail(model) {
    const tiers = markTiers();
    const rows = model.goals
      .map((goal, index) => {
        const done = model.api.missionIsDone(goal, index, model.goals.length, model.rules, model.statusOf);
        const tag = missionTag(model, index, done);
        const dots = tiers
          .map((tier) => {
            const raw = model.statusOf(goal, tier.id);
            const st = STATUS_META[raw] ? raw : "offen";
            return `<span class="lp-mdot lp-mdot--${tier.id} lp-mdot--${st}"></span>`;
          })
          .join("");
        const aria = tiers
          .map((tier) => {
            const raw = model.statusOf(goal, tier.id);
            const st = STATUS_META[raw] ? raw : "offen";
            return `${tier.label} ${STATUS_META[st].label}`;
          })
          .join(", ");
        const tagHtml = tag.text
          ? `<span class="lp-mission__tag lp-mission__tag--${tag.kind}">${escapeHtml(tag.text)}</span>`
          : "";
        const name = goal.text || "Mission";
        return `
          <div class="lp-mission${index === model.cur ? " is-now" : ""}${done && index !== model.cur ? " is-done" : ""}">
            <span class="lp-mission__n">${index + 1}</span>
            <span class="lp-mission__name" title="${escapeHtml(name)}">${escapeHtml(name)}</span>
            <span class="lp-mission__dots" aria-label="${escapeHtml(aria)}">${dots}</span>
            ${tagHtml}
          </div>`;
      })
      .join("");
    return `
      <section class="lp-missions" aria-labelledby="lp-missions-title">
        <h2 id="lp-missions-title" class="lp-kicker">Deine Missionen</h2>
        ${rows}
      </section>`;
  }

  function renderLogbook(model) {
    const tiers = markTiers();
    const rows = model.goals
      .map((goal, index) => {
        const done = model.api.missionIsDone(goal, index, model.goals.length, model.rules, model.statusOf);
        const phrase = levelcheckPhrase(model, goal.id) || "Ohne Levelcheck";
        const buttons = tiers
          .map((tier) => {
            const raw = model.statusOf(goal, tier.id);
            const st = STATUS_META[raw] ? raw : "offen";
            const busy = state.saving === `${goal.id}_${tier.id}`;
            return `<button type="button" class="lp-log__btn lp-log__btn--${tier.id} lp-log__btn--${st}" data-lp-cycle="${escapeHtml(goal.id)}" data-lp-tier="${escapeHtml(tier.id)}" data-lp-status="${st}" aria-label="${escapeHtml(tier.label)}: ${escapeHtml(STATUS_META[st].label)}. Antippen zum Ändern." ${busy ? "disabled" : ""}><span class="lp-mdot lp-mdot--${tier.id} lp-mdot--${st}" aria-hidden="true"></span>${tierShort(tier.id)} · ${escapeHtml(STATUS_META[st].label)}</button>`;
          })
          .join("");
        return `
          <div class="lp-log__row${index === model.cur ? " is-now" : ""}" data-lp-goal="${escapeHtml(goal.id)}">
            <span class="lp-log__n${index === model.cur ? " is-now" : ""}${done && index !== model.cur ? " is-done" : ""}">${index + 1}</span>
            <div class="lp-log__copy">
              <div class="lp-log__name">${escapeHtml(goal.text || "Mission")}</div>
              <div class="lp-log__lc">${escapeHtml(phrase)}</div>
            </div>
            <div class="lp-log__tiers">${buttons}</div>
          </div>`;
      })
      .join("");
    return `
      <section class="lp-log" aria-labelledby="lp-log-title">
        <div>
          <h2 id="lp-log-title" class="lp-kicker">Logbuch · Stufen eintragen</h2>
          <p class="lp-log__lead">Tippe auf eine Stufe, um sie auf Offen, In Arbeit oder Sicher zu stellen. Die Route oben zieht sofort mit.</p>
        </div>
        ${rows}
      </section>`;
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
    const model = buildRouteModel(thema, progress);
    const training = trainingForThema(thema);
    const missing = (training?.abweichungen || []).map((item) => item.name).filter(Boolean);
    const missingLine = missing.length
      ? `<p class="lp-train-miss">Ohne Trainingsknopf: ${escapeHtml(missing.join(", "))}</p>`
      : "";
    const strecke = model
      ? `<div class="lp-cockpit${model.narrow ? " is-stack" : ""}">${renderRouteMap(thema, progress, model)}<div class="lp-deck">${renderJetzt(thema, model)}${renderPensum(thema, progress)}${renderMissionRail(model)}</div></div>${renderLogbook(model)}`
      : `<p class="lp-empty">Für dieses Thema gibt es noch keine Missionen.</p>`;
    return `
      <div class="lp-top">
        ${renderBar(thema, progress, { hideKa: !!model })}
        ${missingLine}
        ${renderLive()}
      </div>
      ${strecke}
      ${renderRedeem(thema)}
      ${renderOverlay()}`;
  }

  function render() {
    ensureRouteResize();
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
    scrollOpenPanel();
    placeSheet(root);
    focusOverlay(root);
    if (render.posted) return;
    render.posted = true;
    requestAnimationFrame(() => {
      render.posted = false;
      const next = routeStackWidth() < ROUTE_STACK_WIDTH;
      if (next === ensureRouteResize.narrow) return;
      ensureRouteResize.narrow = next;
      if (document.getElementById("levelplan-screen-root") && state.data) render();
    });
  }

  function scrollOpenPanel() {
    if (!state.sheet || state.helpOpen) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    requestAnimationFrame(() => {
      document.querySelector("#levelplan-screen-root .lp-status-pick")?.scrollIntoView({
        block: "nearest",
        behavior: reduce ? "auto" : "smooth"
      });
    });
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
    if (state.sheet && !state.helpOpen) {
      const option = root.querySelector(".lp-status-pick .lp-sheet__opt.is-active") || root.querySelector(".lp-status-pick .lp-sheet__opt");
      try {
        option?.focus({ preventScroll: true });
      } catch (err) {
        option?.focus();
      }
      return;
    }
    if (!state.helpOpen) return;
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

    const redeemForm = root.querySelector("[data-lp-redeem]");
    if (redeemForm) {
      const redeemInput = redeemForm.querySelector("input[name=code]");
      redeemInput?.addEventListener("input", () => {
        state.redeemCode = redeemInput.value;
      });
      redeemForm.addEventListener("submit", (event) => {
        event.preventDefault();
        const text = new FormData(redeemForm).get("code");
        state.redeemCode = String(text || "");
        redeemTraining(state.redeemCode);
      });
    }

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

    root.querySelectorAll("[data-lp-cycle]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const goalId = btn.dataset.lpCycle;
        const tier = btn.dataset.lpTier;
        const current = btn.dataset.lpStatus || "offen";
        setStatus(goalId, tier, NEXT_STATUS[current] || "offen");
      });
    });

    root.querySelectorAll("[data-lp-mark-safe]").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (!btn.dataset.lpMarkSafe || !btn.dataset.lpTier) return;
        setStatus(btn.dataset.lpMarkSafe, btn.dataset.lpTier, "sicher");
      });
    });

    root.querySelectorAll("[data-lp-pill]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const goalId = btn.dataset.lpPill;
        const tier = btn.dataset.lpTier;
        if (state.sheet && String(state.sheet.goalId) === String(goalId) && state.sheet.tier === tier && state.sheet.via !== "stage") {
          state.sheet = null;
        } else {
          state.sheet = { goalId, tier, via: "pill" };
        }
        state.helpOpen = false;
        render();
      });
    });

    root.querySelectorAll("[data-lp-stage]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const goalId = btn.dataset.lpStageGoal;
        const tier = btn.dataset.lpStage;
        if (!goalId || !tier) return;
        if (state.sheet && state.sheet.via === "stage" && String(state.sheet.goalId) === String(goalId) && state.sheet.tier === tier) {
          state.sheet = null;
        } else {
          state.sheet = { goalId, tier, via: "stage" };
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
    const chip = root.querySelector("[data-lp-route-pct]");
    if (chip && chip.dataset.topicId === String(topicId)) {
      chip.textContent = hasValue ? `${pct} %` : "–";
    }
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

  async function redeemTraining(text) {
    const trimmed = String(text || "").trim();
    state.redeemCode = trimmed;
    if (!trimmed) {
      state.error = "Bitte den Nachweis-Code eintragen.";
      state.message = "";
      render();
      return;
    }
    state.message = "";
    state.error = "";
    try {
      const res = await fetch("/api/student/training/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: trimmed })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false) {
        state.error = data.hinweis || "Der Code ist nicht gültig.";
        state.message = "";
        render();
        return;
      }
      state.redeemCode = "";
      state.message = "Trainingsstand gespeichert.";
      state.error = "";
      try {
        const [plan, training] = await Promise.all([
          fetchJson("/api/student/levelplan"),
          fetchJson("/api/student/training")
        ]);
        if (plan && typeof plan.hasClass === "boolean" && Array.isArray(plan.grouped)) {
          state.data = plan;
        }
        state.training = training;
      } catch (err) {
        /* Der gespeicherte Stand kommt beim nächsten Öffnen. */
      }
      render();
    } catch (err) {
      state.error = "Der Code ist nicht gültig.";
      state.message = "";
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
      let training = null;
      try {
        training = await fetchJson("/api/student/training");
      } catch (err) {
        training = null;
      }
      if (requestId !== loadRequestId || generation !== initGeneration) return;
      state.data = data;
      state.training = training;
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
