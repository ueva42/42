/**
 * Lehrer-Cockpit: alles zur laufenden Stunde auf einer Seite.
 * Live-Spuren aus /api/teacher/regulation, Missionen, Training und Klassen-Spiel aus /api/teacher/cockpit.
 * Hinweise, keine Rangliste: Listen sind alphabetisch, Klassen-Mission zeigt nur Zahlen.
 */

/** Shared „Wer hat geholfen?“ – Heute (teacher-app) und Cockpit. */
window.SolHelpAttribution = (function () {
  const KIND_BUTTONS = [
    { id: "lehrkraft", label: "Lehrkraft" },
    { id: "logic_coach", label: "Logic Coach" },
    { id: "taktik_deck", label: "Taktik-Deck" },
    { id: "niemand", label: "niemand" }
  ];
  const KIND_LABELS = {
    lehrkraft: "Lehrkraft",
    peer: "Mitschüler:in",
    logic_coach: "Logic Coach",
    taktik_deck: "Taktik-Deck",
    niemand: "niemand"
  };

  function renderModal({ esc, studentName, peerOptionsHtml }) {
    const e = typeof esc === "function" ? esc : (s) => String(s ?? "");
    const kinds = KIND_BUTTONS.map(
      (k) =>
        `<button type="button" class="ck-btn ck-btn-sm" data-ck-help-kind="${e(k.id)}">${e(k.label)}</button>`
    ).join("");
    return `
      <div class="ck-drawer-layer" role="dialog" aria-modal="true" aria-label="Wer hat geholfen?">
        <button type="button" class="ck-drawer-backdrop" data-ck-help-cancel aria-label="Abbrechen"></button>
        <aside class="ck-drawer ck-drawer--help">
          <header class="ck-drawer-head"><div><h3>Wer hat geholfen?</h3><p class="ck-small ck-muted">${e(studentName || "")}</p></div></header>
          <div class="ck-acts ck-help-kinds">${kinds}</div>
          <label class="ck-form-full">Mitschüler:in
            <select class="ck-input" data-ck-help-peer><option value="">– wählen –</option>${peerOptionsHtml || ""}</select>
          </label>
          <div class="ck-acts">
            <button type="button" class="ck-btn ck-btn-go ck-btn-sm" data-ck-help-kind="peer">Mitschüler:in speichern</button>
            <button type="button" class="ck-btn ck-btn-sm" data-ck-help-cancel>Abbrechen</button>
          </div>
        </aside>
      </div>`;
  }

  async function closeWithAttribution(api, payload) {
    const {
      classId,
      studentId,
      date,
      entryId,
      goalId,
      kind,
      helpedByStudentId
    } = payload || {};
    await api("/api/teacher/coaching", {
      method: "POST",
      body: JSON.stringify({
        action: "close_help",
        studentId,
        date: date || null,
        logEntryId: entryId || null,
        goalId: goalId || null
      })
    });
    await api("/api/teacher/cockpit/help-attribution", {
      method: "POST",
      body: JSON.stringify({
        classId,
        studentId,
        date: date || null,
        helpedByKind: kind,
        helpedByStudentId: helpedByStudentId || null
      })
    });
  }

  return { KIND_BUTTONS, KIND_LABELS, renderModal, closeWithAttribution };
})();

(function () {
  /** Lehrer-Ansicht: ruhig. Beamer: season.config.pollSeconds (Fallback 30s); letzte ~12 Min der Stunde öfter. */
  const REFRESH_MS = 60000;
  const BEAMER_REFRESH_MS = 30000;
  const BEAMER_LATE_REFRESH_MS = 8000;
  const LATE_WINDOW_MS = 12 * 60 * 1000;
  const BEAMER_VIEWS = ["A", "B", "C"];
  const BEAMER_VIEW_META = {
    A: { key: "A", label: "Mission" },
    B: { key: "B", label: "Klasse" },
    C: { key: "C", label: "Belohnung" }
  };
  const HIGHLIGHT_LABELS = {
    gutEingeschätzt: "Gut eingeschätzt",
    planGeschafft: "Plan geschafft",
    expert: "Expert:in",
    dranbleiber: "Dranbleiber"
  };
  const TIERS = ["rookie", "operator", "street_legend"];
  const TIER_LABEL = {
    unterthema: "Unterthema",
    rookie: "Rookie",
    operator: "Operator",
    street_legend: "Street Legend"
  };
  const TIER_SHORT = { unterthema: "U", rookie: "R", operator: "O", street_legend: "SL" };
  const TIER_COLOR = {
    unterthema: "#34d399",
    rookie: "#22d3ee",
    operator: "#8b5cf6",
    street_legend: "#f472b6"
  };
  const TIER_CSS = { unterthema: "u", rookie: "r", operator: "o", street_legend: "l" };
  const WEEKDAYS = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
  const VIEW_TITLE = {
    heat: "Missionen × Schüler:innen",
    now: "Wer ist gerade an welcher Mission?"
  };

  const ck = {
    el: null,
    ctx: null,
    active: false,
    bound: false,
    classId: null,
    data: null,
    live: null,
    seq: 0,
    loading: false,
    error: "",
    toast: "",
    updatedAt: null,
    view: "now",
    tier: "rookie",
    beamer: false,
    beamerView: "A",
    beamerPaused: false,
    showNamesOnBeamer: null,
    fakeFullscreen: false,
    chromeVisible: false,
    chromeHideTimer: null,
    forceBossWin: false,
    bossConfetti: false,
    drawerId: null,
    moreOpen: false,
    form: null,
    raffleXp: 10,
    teamXp: 10,
    busy: false,
    reveal: null,
    timer: null,
    viewTimer: null,
    /** `${classId}:${date}` nach erfolgreicher Auto-Ziehung oder wenn schon gezogen. */
    autoRaffleDoneKey: null,
    crewsOpen: false,
    crewsBusy: false,
    crewsDraft: null,
    helpModal: null,
    tickerIdx: 0,
    tickerShownAt: 0,
    crewDrawShow: null,
    sqRepick: false,
    prevPresence: null,
    presencePopUntil: null,
    raffleSpinTimer: null,
    raffleSpinPool: null,
    raffleSpinIdx: 0
  };

  function season() {
    return ck.data?.season || null;
  }

  function isPresentation() {
    return !!document.fullscreenElement || !!ck.fakeFullscreen;
  }

  function controlsVisible() {
    if (ck.beamer) return !!ck.chromeVisible;
    return !isPresentation() || !!ck.chromeVisible;
  }

  function namesStorageKey(classId) {
    return `ck-names-${Number(classId) || 0}`;
  }

  function loadNamesPref(classId) {
    try {
      const raw = localStorage.getItem(namesStorageKey(classId));
      if (raw === "1" || raw === "true") return true;
      if (raw === "0" || raw === "false") return false;
    } catch (_) {
      /* ignore */
    }
    return null;
  }

  function saveNamesPref(classId, on) {
    try {
      localStorage.setItem(namesStorageKey(classId), on ? "1" : "0");
    } catch (_) {
      /* ignore */
    }
  }

  function namesOnBeamer() {
    if (ck.showNamesOnBeamer != null) return !!ck.showNamesOnBeamer;
    return season()?.showNamesOnBeamer !== false;
  }

  function syncNamesDefault() {
    if (ck.showNamesOnBeamer != null) return;
    const stored = ck.classId != null ? loadNamesPref(ck.classId) : null;
    if (stored != null) {
      ck.showNamesOnBeamer = stored;
      return;
    }
    if (season() && typeof season().showNamesOnBeamer === "boolean") {
      ck.showNamesOnBeamer = season().showNamesOnBeamer;
    }
  }

  function displayPersonName(shortName, fullName) {
    if (!namesOnBeamer()) return "Jemand";
    return shortName || fullName || "Jemand";
  }

  function syncPresentationClasses() {
    const on = isPresentation();
    document.body.classList.toggle("ck--presentation", on);
    document.body.classList.toggle("ck-fake-fullscreen", !!ck.fakeFullscreen && !document.fullscreenElement);
    const root = ck.el?.querySelector?.(".ck") || ck.el;
    root?.classList?.toggle("ck--presentation", on);
  }

  function armChromeHide() {
    if (ck.chromeHideTimer) clearTimeout(ck.chromeHideTimer);
    ck.chromeHideTimer = setTimeout(() => {
      ck.chromeVisible = false;
      ck.chromeHideTimer = null;
      render();
    }, 3000);
  }

  function showPresentationChrome() {
    if (!ck.beamer && !isPresentation()) return;
    const was = ck.chromeVisible;
    ck.chromeVisible = true;
    armChromeHide();
    if (!was) render();
  }

  function exitPresentation() {
    if (document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {});
    }
    ck.fakeFullscreen = false;
    ck.chromeVisible = false;
    if (ck.chromeHideTimer) {
      clearTimeout(ck.chromeHideTimer);
      ck.chromeHideTimer = null;
    }
    syncPresentationClasses();
    render();
  }

  function bossEffective() {
    const b = season()?.boss;
    if (!b) return null;
    if (!ck.forceBossWin) return b;
    return { ...b, defeated: true, forceWin: true, remaining: 0 };
  }

  function esc(value) {
    return ck.ctx?.escapeHtml ? ck.ctx.escapeHtml(value) : String(value ?? "");
  }

  function isoParts(iso) {
    const text = String(iso || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
    const [y, m, d] = text.split("-").map(Number);
    return { y, m, d, date: new Date(y, m - 1, d, 12) };
  }

  function fmtDate(iso) {
    const p = isoParts(iso);
    if (!p) return "";
    return `${WEEKDAYS[p.date.getDay()]}., ${String(p.d).padStart(2, "0")}.${String(p.m).padStart(2, "0")}.`;
  }

  function fmtDay(iso) {
    const p = isoParts(iso);
    if (!p) return "";
    return `${WEEKDAYS[p.date.getDay()]} ${p.d}.${p.m}.`;
  }

  function fmtShort(iso) {
    const p = isoParts(iso);
    return p ? `${p.d}.${p.m}.` : "";
  }

  function daysBetween(a, b) {
    const pa = isoParts(a);
    const pb = isoParts(b);
    if (!pa || !pb) return 0;
    return Math.round((pb.date - pa.date) / 86400000);
  }

  function num(n) {
    return Number(n || 0).toLocaleString("de-DE");
  }

  function dec(n) {
    return Number(n || 0).toLocaleString("de-DE", { maximumFractionDigits: 1 });
  }

  function clip(text, max) {
    const t = String(text || "");
    return t.length > max ? `${t.slice(0, Math.max(1, max - 1))}…` : t;
  }

  function missionsText(numbers) {
    const list = [...new Set((numbers || []).map(Number).filter((n) => n > 0))].sort((a, b) => a - b);
    if (!list.length) return "";
    if (list.length === 1) return `Mission ${list[0]}`;
    const consecutive = list.every((n, i) => i === 0 || n === list[i - 1] + 1);
    if (consecutive) return `Mission ${list[0]}–${list[list.length - 1]}`;
    return `Mission ${list.slice(0, -1).join(", ")} und ${list[list.length - 1]}`;
  }

  function ring(pct, color, size, stroke, label, defs = "") {
    const r = (size - stroke) / 2;
    const c = size / 2;
    const p = Math.max(0, Math.min(100, Number(pct) || 0));
    return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">${defs}
      <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="rgba(148,163,184,.16)" stroke-width="${stroke}"/>
      <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round"
        pathLength="100" stroke-dasharray="${p.toFixed(1)} 100" transform="rotate(-90 ${c} ${c})"/>
      <text x="${c}" y="${c + size / 14}" text-anchor="middle" fill="#f8fafc" font-size="${Math.round(size / 5)}" font-weight="700" font-family="Orbitron, system-ui">${esc(label)}</text>
    </svg>`;
  }

  /* ---------- Daten ---------- */

  function students() {
    return ck.data?.studentsDetail || [];
  }

  function goals() {
    return ck.data?.goals || [];
  }

  function levels() {
    const d = ck.data || {};
    const markTiers = Array.isArray(d.markTiers)
      ? d.markTiers.filter((t) => TIERS.includes(t))
      : TIERS.slice();
    const stagesEnabled = d.stagesEnabled !== false && markTiers.length > 0;
    const displayTiers = Array.isArray(d.displayTiers) && d.displayTiers.length
      ? d.displayTiers
      : stagesEnabled
        ? markTiers
        : ["unterthema"];
    const missionTiers = stagesEnabled ? markTiers : ["unterthema"];
    return {
      activeLevels: Array.isArray(d.activeLevels) ? d.activeLevels : displayTiers,
      markTiers,
      displayTiers,
      missionTiers,
      stagesEnabled,
      unterthemaOnly: d.unterthemaOnly === true || (!stagesEnabled && displayTiers.includes("unterthema"))
    };
  }

  function markStatus(marks, goalId, tierIndex) {
    const row = marks?.[goalId];
    if (!Array.isArray(row)) return "offen";
    return row[tierIndex] || "offen";
  }

  function expertTierIndex() {
    const { displayTiers, stagesEnabled } = levels();
    if (!stagesEnabled) return displayTiers.indexOf("unterthema");
    const order = ["street_legend", "operator", "rookie"];
    for (const tier of order) {
      const i = displayTiers.indexOf(tier);
      if (i >= 0) return i;
    }
    return displayTiers.length - 1;
  }

  function goalById(id) {
    return goals().find((g) => String(g.id) === String(id)) || null;
  }

  function studentById(id) {
    return students().find((s) => Number(s.id) === Number(id)) || null;
  }

  function liveData() {
    const live = ck.live && Number(ck.live.class?.id) === Number(ck.classId) ? ck.live : null;
    return {
      lesson: live?.lesson || null,
      help: live?.live?.help || [],
      visit: live?.live?.visit || [],
      noGoal: live?.live?.noGoal || [],
      runningCount: live?.live?.runningCount || 0,
      experts: live?.live?.experts || [],
      students: live?.students || []
    };
  }

  function helpIds() {
    return new Set(liveData().help.map((h) => Number(h.studentId)));
  }

  function visitIds() {
    return new Set(liveData().visit.map((v) => Number(v.studentId)));
  }

  function overSet() {
    const map = new Map();
    for (const item of ck.data?.training?.over || []) {
      map.set(Number(item.studentId), new Set(item.items.map((i) => String(i.goalId))));
    }
    return map;
  }

  function idleMap() {
    return new Map((ck.data?.training?.idle || []).map((i) => [Number(i.studentId), i]));
  }

  /* ---------- Laden ---------- */

  async function load(withLive) {
    if (!ck.ctx?.classId) return;
    const seq = ++ck.seq;
    ck.loading = true;
    if (!ck.data) render();
    try {
      const params = new URLSearchParams({ classId: String(ck.ctx.classId) });
      if (ck.ctx.levelCheckId) params.set("levelCheckId", ck.ctx.levelCheckId);
      const jobs = [ck.ctx.api(`/api/teacher/cockpit?${params.toString()}`)];
      if (withLive) {
        const liveParams = new URLSearchParams(params);
        liveParams.set("range", ck.ctx.range || "unit");
        jobs.push(ck.ctx.api(`/api/teacher/regulation?${liveParams.toString()}`));
      }
      const [data, live] = await Promise.all(jobs);
      if (seq !== ck.seq) return;
      ck.data = data;
      if (live) {
        ck.live = live;
        ck.ctx.setView?.(live);
      }
      ck.error = "";
      ck.updatedAt = new Date();
      syncNamesDefault();
      notePresenceFromData();
      if (season()?.boss?.forceWin) ck.forceBossWin = true;
      if (ck.data?.game?.raffle?.drawn) {
        const key = raffleAutoKey();
        if (key) ck.autoRaffleDoneKey = key;
      }
      if (season()?.boss?.defeated) {
        maybeCelebrateBoss();
      }
    } catch (err) {
      if (seq !== ck.seq) return;
      ck.error = err.message || "Das Cockpit konnte nicht geladen werden.";
    } finally {
      if (seq === ck.seq) ck.loading = false;
      if (ck.active) {
        render();
        if (!ck.error) maybeAutoRaffle();
      }
    }
  }

  function refreshIntervalMs(now = new Date()) {
    if (!ck.beamer) return REFRESH_MS;
    const end = lessonEndAt(liveData().lesson, now);
    if (end) {
      const msLeft = end.getTime() - now.getTime();
      if (msLeft >= 0 && msLeft <= LATE_WINDOW_MS) return BEAMER_LATE_REFRESH_MS;
    }
    const pollSec = Number(season()?.config?.pollSeconds);
    return (pollSec > 0 ? pollSec : BEAMER_REFRESH_MS / 1000) * 1000;
  }

  function beamerViewSeconds() {
    const s = Number(season()?.config?.beamerViewSeconds);
    return s > 0 ? s : 25;
  }

  function startTimer() {
    if (ck.timer) return;
    armTimer();
    armViewTimer();
  }

  function restartTimer() {
    stopTimer();
    if (ck.active) {
      armTimer();
      armViewTimer();
    }
  }

  function armTimer() {
    if (ck.timer) {
      clearTimeout(ck.timer);
      ck.timer = null;
    }
    if (!ck.active) return;
    ck.timer = setTimeout(() => {
      ck.timer = null;
      const run = async () => {
        if (ck.active && !document.hidden && !ck.form && !ck.busy) {
          await load(true);
        }
        if (ck.active) armTimer();
      };
      run();
    }, refreshIntervalMs());
  }

  function armViewTimer() {
    if (ck.viewTimer) {
      clearTimeout(ck.viewTimer);
      ck.viewTimer = null;
    }
    if (!ck.active || !ck.beamer || ck.beamerPaused) return;
    ck.viewTimer = setTimeout(() => {
      ck.viewTimer = null;
      if (!ck.active || !ck.beamer || ck.beamerPaused) return;
      const i = BEAMER_VIEWS.indexOf(ck.beamerView);
      ck.beamerView = BEAMER_VIEWS[(i + 1) % BEAMER_VIEWS.length];
      render();
      armViewTimer();
    }, beamerViewSeconds() * 1000);
  }

  function stopTimer() {
    if (ck.timer) clearTimeout(ck.timer);
    ck.timer = null;
    if (ck.viewTimer) clearTimeout(ck.viewTimer);
    ck.viewTimer = null;
  }

  function maybeCelebrateBoss() {
    const b = bossEffective();
    if (!b?.defeated || ck.bossConfetti) return;
    ck.bossConfetti = true;
    spawnConfetti();
  }

  function spawnConfetti() {
    if (!ck.el) return;
    const host = ck.el.querySelector(".ck") || ck.el;
    const layer = document.createElement("div");
    layer.className = "ck-confetti";
    layer.setAttribute("aria-hidden", "true");
    const colors = ["#22d3ee", "#8b5cf6", "#f472b6", "#fbbf24", "#34d399"];
    for (let i = 0; i < 48; i += 1) {
      const p = document.createElement("i");
      p.style.left = `${Math.random() * 100}%`;
      p.style.background = colors[i % colors.length];
      p.style.animationDelay = `${Math.random() * 0.8}s`;
      p.style.animationDuration = `${1.6 + Math.random() * 1.4}s`;
      layer.appendChild(p);
    }
    host.appendChild(layer);
    setTimeout(() => layer.remove(), 3200);
  }

  async function toggleFullscreen() {
    if (isPresentation()) {
      exitPresentation();
      return;
    }
    const root = ck.el?.querySelector?.(".ck") || ck.el || document.documentElement;
    try {
      if (root.requestFullscreen) {
        await root.requestFullscreen();
      } else if (document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
      } else {
        throw new Error("no fullscreen");
      }
      ck.fakeFullscreen = false;
    } catch (_) {
      ck.fakeFullscreen = true;
      ck.chromeVisible = false;
    }
    syncPresentationClasses();
    render();
  }

  async function grantBossWin() {
    if (ck.busy) return;
    ck.busy = true;
    render();
    try {
      const res = await post("/api/teacher/cockpit/boss-win", { classId: ck.classId });
      ck.forceBossWin = true;
      maybeCelebrateBoss();
      flash(res?.message || "Boss besiegt – Beute freigeschaltet.");
      await load(false);
    } catch (err) {
      flash(err.message || "Boss-Sieg hat nicht geklappt.");
    } finally {
      ck.busy = false;
      render();
    }
  }

  async function post(url, body) {
    return ck.ctx.api(url, { method: "POST", body: JSON.stringify(body || {}) });
  }

  /* ---------- Kopf und KPI ---------- */

  function respectStarsHtml() {
    const stars = season()?.respect || [];
    const filledCount =
      Number(season()?.starsFilledCount) || stars.filter((s) => s.status === "erreicht").length;
    const five = Array.from({ length: 5 }, (_, i) => stars[i] || { status: "offen" });
    const cells = five
      .map((s) => {
        const on = s.status === "erreicht";
        return `<span class="ck-star ck-star--head ${on ? "ck-star--on" : "ck-star--empty"}" aria-hidden="true">★</span>`;
      })
      .join("");
    return `<div class="ck-respekt-box" aria-label="Respekt ${filledCount} von 5 diese Woche">
      <span class="ck-respekt-box__lab">RESPEKT</span>
      <div class="ck-stars ck-stars--head">${cells}</div>
    </div>`;
  }

  function seasonKicker() {
    const d = ck.data;
    const map = season()?.map;
    const cls = String(d?.class?.name || "").trim();
    const thema = String(d?.levelCheck?.name || "").trim();
    const fach = String(d?.levelCheck?.subject || "").trim();
    const ort = String(map?.ort || "").trim();
    let raw;
    if (ort) {
      raw = [cls, `SEASON ${ort}`, thema].filter(Boolean).join(" · ");
    } else {
      raw = [cls, fach, thema].filter(Boolean).join(" · ");
    }
    return raw.toUpperCase();
  }

  function examHeadline() {
    const d = ck.data;
    const days = season()?.kpis?.daysUntilExam;
    const exam = (d?.unit?.events || []).find((e) => e.type === "klassenarbeit" || e.type === "test" || e.type === "projektabgabe");
    const target = d?.unit?.target;
    const dateIso = exam?.date || (target?.kind === "exam" ? target.date : null) || target?.date;
    if (days == null && !dateIso) return "";
    const when =
      days === 0 ? "heute" : days === 1 ? "morgen" : days != null ? `in ${days} Tagen` : "";
    const label = exam?.label || target?.label || "Klassenarbeit";
    return `${esc(label)}${dateIso ? ` <strong>${esc(fmtDate(dateIso))}</strong>` : ""}${when ? ` · ${esc(when)}` : ""}`;
  }

  function renderHead() {
    const live = liveData();
    const lesson = live.lesson?.label ? ` · Stunde ${esc(live.lesson.label)}` : "";
    const examLine = examHeadline();
    const noLesson = season()?.kpis?.noLessonToday === true;
    if (ck.beamer) {
      return `
      <div class="ck-context ck-context--sticky ck-context--beamer">
        <div class="ck-context-main">
          <p class="td-kicker ck-kicker">${esc(seasonKicker())}${lesson}</p>
          ${examLine ? `<p class="ck-dates ck-dates--slim">${examLine}</p>` : ""}
          ${noLesson ? `<p class="ck-no-lesson" role="status">Heute keine Stunde – Stand der Woche</p>` : ""}
        </div>
        ${respectStarsHtml()}
      </div>`;
    }
    return `
      <div class="ck-context ck-context--sticky">
        <div class="ck-context-main">
          <p class="td-kicker ck-kicker">${esc(seasonKicker())}${lesson}</p>
          <div class="ck-title-row">
            <h1 class="td-title">Cockpit</h1>
            ${respectStarsHtml()}
          </div>
          ${examLine ? `<p class="ck-dates">${examLine}</p>` : ""}
          ${noLesson ? `<p class="ck-no-lesson" role="status">Heute keine Stunde – Stand der Woche</p>` : ""}
        </div>
      </div>`;
  }

  function renderControls(opts = {}) {
    const presentation = isPresentation();
    const beamerChrome = !!ck.beamer;
    const asChrome = opts.asChrome === true;
    if (asChrome && !beamerChrome && !presentation) return "";
    if ((beamerChrome || presentation) && !asChrome) return "";
    if (asChrome && (beamerChrome || presentation) && !ck.chromeVisible) return "";
    const d = ck.data;
    const units = d?.levelChecks || [];
    const options = units
      .map(
        (u) =>
          `<option value="${esc(u.id)}" ${String(u.id) === String(d?.levelCheck?.id) ? "selected" : ""}>${esc(u.subject)} · ${esc(u.name)}</option>`
      )
      .join("");
    const stamp = ck.updatedAt
      ? ck.updatedAt.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })
      : "–";
    const pollSec = Number(season()?.config?.pollSeconds) || 30;
    const namesOn = namesOnBeamer();
    const viewSeg = BEAMER_VIEWS.map((v) => {
      const meta = BEAMER_VIEW_META[v] || { key: v, label: v };
      return `<button type="button" class="ck-view-dot ${ck.beamerView === v ? "is-on" : ""}" data-ck-view-set="${v}" aria-pressed="${ck.beamerView === v ? "true" : "false"}" aria-label="${esc(meta.label)}" title="${esc(meta.label)}">${esc(meta.label)}</button>`;
    }).join("");
    const raffle = d?.game?.raffle || {};
    const raffleChrome =
      beamerChrome || presentation
        ? `<span class="ck-chrome-raffle">${xpPicker("raffle", ck.raffleXp)}
            <button type="button" class="ck-btn ck-btn-go ck-btn-sm" data-ck-raffle ${raffle.eligibleCount && !ck.busy && !raffle.drawn ? "" : "disabled"}>Ziehung</button></span>`
        : "";
    return `
      <div class="ck-controls ${asChrome ? "ck-controls--chrome is-visible" : ""}" data-ck-controls>
        <div class="ck-controls__left">
          ${
            units.length
              ? `<label class="sr-only" for="unitSelect">Unterrichtseinheit</label>
                 <select id="unitSelect" class="td-select ck-select" aria-label="Unterrichtseinheit">${options}</select>`
              : ""
          }
          <span class="ck-live" title="${
            ck.beamer
              ? `Beamer: alle ${pollSec} s, in den letzten 12 Min der Stunde alle 8 s`
              : "Aktualisiert sich jede Minute von selbst"
          }"><i></i>Live · ${esc(stamp)}</span>
        </div>
        <div class="ck-controls__right">
          <button type="button" class="ck-btn ${ck.beamer ? "" : "ck-btn-go"}" data-ck-beamer data-mode="teacher" title="Lehrkraft-Ansicht">Lehrkraft-Ansicht</button>
          <div class="ck-beamer-group" role="group" aria-label="Beamer">
            <button type="button" class="ck-btn ${ck.beamer ? "ck-btn-go" : ""}" data-ck-beamer data-mode="beamer" title="Beamer-Ansicht">Beamer-Ansicht</button>
            <button type="button" class="ck-btn ${isPresentation() ? "ck-btn-go" : ""}" data-ck-fullscreen title="Vollbild">Vollbild</button>
            <button type="button" class="ck-btn ${namesOn ? "ck-btn-go" : ""}" data-ck-names title="Namen in Avatar-Wand, Highlights, Ticker und Ziehung">${namesOn ? "Namen an" : "Namen aus"}</button>
            <button type="button" class="ck-btn ${ck.beamerPaused ? "ck-btn-go" : ""}" data-ck-pause title="Ansichtswechsel pausieren">${ck.beamerPaused ? "Weiter" : "Pause"}</button>
            <span class="ck-view-dots" role="group" aria-label="Beamer-Ansichten">${viewSeg}</span>
            ${raffleChrome}
          </div>
        </div>
      </div>`;
  }

  function renderPresentationDots() {
    if (!isPresentation()) return "";
    return `<div class="ck-pres-dots" aria-label="Beamer-Ansicht">
      ${BEAMER_VIEWS.map((v) => {
        const meta = BEAMER_VIEW_META[v] || { key: v, label: v };
        return `<button type="button" class="ck-pres-dot ${ck.beamerView === v ? "is-on" : ""}" data-ck-view-set="${v}" aria-label="${esc(meta.label)}" aria-pressed="${ck.beamerView === v ? "true" : "false"}"></button>`;
      }).join("")}
    </div>`;
  }

  function renderKpis() {
    const s = season();
    const k = s?.kpis || {};
    const n = Number(k.classSize) || students().length || ck.data?.students?.length || 0;
    const boss = bossEffective();
    const started = k.started != null ? k.started : students().filter((st) => st.today).length;
    const completed = k.completed != null ? k.completed : (ck.data?.students || []).filter((st) => st.reflectedToday).length;
    let bossLabel = "–";
    let bossSub = "kein Checkpoint";
    let bossPct = 0;
    if (boss && boss.energy > 0) {
      const hits = boss.defeated ? boss.energy : boss.hits;
      bossPct = Math.min(100, Math.round((hits / boss.energy) * 100));
      bossLabel = `${boss.hits}/${boss.energy}`;
      bossSub = boss.defeated ? "besiegt" : `${bossPct} % · noch ${boss.remaining}`;
    } else if (typeof k.bossEnergyPct === "number" && k.bossEnergyPct > 0) {
      bossPct = Math.round(k.bossEnergyPct * 100);
      bossLabel = `${bossPct} %`;
      bossSub = "Boss-Energie";
    }
    const days = k.daysUntilExam;
    const daysLabel = days == null ? "–" : String(days);
    const daysSub =
      days == null ? "kein Termin" : days === 0 ? "heute" : days === 1 ? "morgen" : `noch ${days} Tage`;
    return `
      <section class="ck-kpis" aria-label="Kennzahlen">
        <div class="ck-kpi">
          <div><div class="ck-num">${started}<span class="ck-of">/${n}</span></div>
          <div class="ck-kpi-lbl">Gestartet</div>
          <div class="ck-kpi-sub">Tagesziel heute</div></div>
        </div>
        <div class="ck-kpi">
          <div><div class="ck-num">${completed}<span class="ck-of">/${n}</span></div>
          <div class="ck-kpi-lbl">Abschluss</div>
          <div class="ck-kpi-sub">Tag beendet</div></div>
        </div>
        <div class="ck-kpi ck-kpi--stack">
          <div class="ck-num">${esc(bossLabel)}</div>
          <div class="ck-kpi-lbl">Boss-Energie</div>
          <div class="ck-kpi-sub">${esc(bossSub)}</div>
          <div class="ck-bar"><span style="width:${bossPct}%;background:linear-gradient(90deg,var(--ck-orange),var(--ck-pink))"></span></div>
        </div>
        <div class="ck-kpi">
          <div><div class="ck-num">${esc(daysLabel)}</div>
          <div class="ck-kpi-lbl">Tage bis KA</div>
          <div class="ck-kpi-sub">${esc(daysSub)}</div></div>
        </div>
      </section>`;
  }

  /* ---------- Links: Wer braucht mich? ---------- */

  function missionLabel(goalId) {
    const g = goalById(goalId);
    return g ? `Mission ${g.number}` : "";
  }

  function renderLeft() {
    const live = liveData();
    const help = [...live.help].sort((a, b) => (b.waitMinutes || 0) - (a.waitMinutes || 0));
    const helpHtml = help
      .map((item) => {
        const attrs = `data-student="${esc(item.studentId)}" data-entry="${esc(item.entryId || "")}" data-goal="${esc(item.goalId || "")}"`;
        const level = item.level ? ` · ${esc(TIER_LABEL[item.level] || item.level)}` : "";
        const mission = item.goalId ? missionLabel(item.goalId) : "";
        const actions = item.takenOver
          ? `<button type="button" class="ck-btn ck-btn-sm" data-coach="close_help" ${attrs}>Erledigt</button><span class="ck-muted ck-small">du bist unterwegs</span>`
          : `<button type="button" class="ck-btn ck-btn-sm ck-btn-hot" data-coach="takeover" ${attrs}>Bin unterwegs</button>
             <button type="button" class="ck-btn ck-btn-sm" data-coach="close_help" ${attrs}>Erledigt</button>`;
        return `
          <div class="ck-person">
            <button type="button" class="ck-link" data-ck-open="${esc(item.studentId)}"><strong>${esc(item.name)}</strong>
            <span class="ck-muted ck-small">${mission ? ` · ${esc(mission)}` : ""}${level}</span></button>
            <p>${esc(item.topic || "Hilfe angefragt")} · <span class="ck-wait">${item.waitMinutes == null ? "" : item.waitMinutes < 1 ? "gerade eben" : `seit ${item.waitMinutes} min`}</span></p>
            ${item.concern ? `<p>„${esc(item.concern)}“</p>` : ""}
            <div class="ck-acts">${actions}</div>
          </div>`;
      })
      .join("");
    const visitHtml = live.visit
      .map(
        (item) => `
        <button type="button" class="ck-person ck-person--btn" data-ck-open="${esc(item.studentId)}">
          <strong>${esc(item.name)}</strong>
          <p>${(item.reasons || []).map((r) => `<span class="ck-reason">${esc(r.label)}</span>`).join("")}</p>
        </button>`
      )
      .join("");
    const noGoal = live.noGoal
      .map((item) => `<button type="button" class="ck-chip" data-ck-open="${esc(item.studentId)}">${esc(item.name)}</button>`)
      .join("");
    const experts = live.experts
      .map(
        (item) =>
          `<button type="button" class="ck-chip" data-ck-open="${esc(item.studentId)}">${esc(item.name)} · ${esc(item.topic || "")}</button>`
      )
      .join("");
    return `
      <aside class="ck-col ck-private">
        <div class="ck-panel ck-left">
          <h2><span>Wer braucht mich?</span><span class="td-kicker">jetzt</span></h2>
          ${live.lesson ? "" : `<p class="ck-muted ck-small">Gerade keine Stunde in diesem Fach laut Stundenplan.</p>`}
          <div class="ck-lane ck-lane--help"><header>Hilfe angefragt <span class="ck-count">${live.help.length}</span></header>${helpHtml || `<p class="ck-muted ck-small">Gerade niemand.</p>`}</div>
          <div class="ck-lane ck-lane--visit"><header>Mal vorbeischauen <span class="ck-count">${live.visit.length}</span></header>${visitHtml || `<p class="ck-muted ck-small">Kein Hinweis mit genug Belegen.</p>`}</div>
          <div class="ck-lane ck-lane--goal"><header>Noch kein Tagesziel <span class="ck-count">${live.noGoal.length}</span></header>
            <div class="ck-chips">${noGoal || `<p class="ck-muted ck-small">Niemand in dieser Spur.</p>`}</div></div>
          <div class="ck-lane ck-lane--run"><header>Läuft <span class="ck-count">${live.runningCount}</span></header>
            <p class="ck-muted ck-small">Expert:innen heute (${esc(expertHintLabel())} sicher am heutigen Thema):</p>
            <div class="ck-chips">${experts || `<p class="ck-muted ck-small">Heute noch niemand.</p>`}</div></div>
        </div>
      </aside>`;
  }

  /* ---------- Mitte ---------- */

  function renderCenter() {
    const views = ["now", "heat"];
    if (!views.includes(ck.view)) ck.view = "now";
    const label = { heat: "Heatmap", now: "Jetzt an der Mission" };
    const body = ck.view === "heat" ? renderHeat() : renderNow();
    return `
      <section class="ck-panel ck-center">
        <h2><span>${esc(VIEW_TITLE[ck.view])}</span>
          <span class="td-seg ck-seg" role="group" aria-label="Ansicht">
            ${views.map((v) => `<button type="button" data-ck-view="${v}" aria-pressed="${ck.view === v ? "true" : "false"}">${label[v]}</button>`).join("")}
          </span>
        </h2>
        ${body}
      </section>`;
  }

  function expertHintLabel() {
    const { displayTiers, stagesEnabled, unterthemaOnly } = levels();
    if (unterthemaOnly || !stagesEnabled) return "Unterthema";
    const idx = expertTierIndex();
    return TIER_LABEL[displayTiers[idx]] || "höchste Stufe";
  }

  function renderHeat() {
    const d = ck.data;
    const gs = goals();
    const { displayTiers, stagesEnabled, unterthemaOnly } = levels();
    const list = [...students()].sort((a, b) => a.name.localeCompare(b.name, "de"));
    const N = list.length || 1;
    const shares = new Map((d.shares || []).map((s) => [String(s.goalId), s]));
    const planIndex = d.unit?.target ? d.unit.target.planIndex : -1;
    const over = overSet();
    const idle = idleMap();
    const shareTier = displayTiers[0] || "rookie";
    const shareShort = TIER_SHORT[shareTier] || shareTier;
    const head = gs
      .map((goal, i) => {
        const pct = Math.round(((Number(shares.get(String(goal.id))?.[shareTier]) || 0) / N) * 100);
        return `<th class="${i === planIndex + 1 ? "ck-lcline" : ""}"><div class="ck-colhead" title="${esc(goal.text)}">${goal.number} · ${esc(clip(goal.text, 22))}<span class="ck-colpct"><b style="width:${pct}%"></b></span><span class="ck-muted">${pct} % ${esc(shareShort)}</span></div></th>`;
      })
      .join("");
    const cls = (st) => (st === "sicher" ? "s" : st === "in_arbeit" ? "w" : "");
    const boxes = (mk) =>
      displayTiers
        .map((tier, ti) => `<i class="${TIER_CSS[tier] || "u"} ${cls(mk[ti])}"></i>`)
        .join("");
    const rows = list
      .map((s) => {
        const cells = gs
          .map((goal, i) => {
            const mk = s.marks?.[goal.id] || displayTiers.map(() => "offen");
            const isOver = stagesEnabled && over.get(Number(s.id))?.has(String(goal.id));
            const isIdle = stagesEnabled && idle.get(Number(s.id))?.goalId === String(goal.id);
            const now = s.today?.goalId === String(goal.id);
            return `<td class="ck-cell ${now ? "ck-cell--now" : ""} ${i === planIndex + 1 ? "ck-lcline" : ""}" title="${esc(goal.text)}">
              <div class="ck-tri ck-tri--${displayTiers.length}">${boxes(mk)}</div>
              ${isOver ? `<span class="ck-flag ck-flag--over">!</span>` : isIdle ? `<span class="ck-flag ck-flag--idle">z</span>` : ""}</td>`;
          })
          .join("");
        return `<tr><td class="ck-nm"><button type="button" class="ck-link" data-ck-open="${esc(s.id)}">${esc(s.name)}</button> <span class="ck-muted">· ${esc(s.targetGrade ? s.targetGrade.replace(".", ",") : "–")}</span></td>${cells}<td><span class="ck-pace ck-pace--${esc(s.pace)}">${esc(s.paceText)}</span></td></tr>`;
      })
      .join("");
    const stageLegend = displayTiers
      .map(
        (tier) =>
          `<span><i class="ck-lg" style="background:${TIER_COLOR[tier] || "#94a3b8"};border-radius:3px"></i>${esc(TIER_LABEL[tier] || tier)}</span>`
      )
      .join("");
    return `
      <div class="ck-heat-wrap"><table class="ck-heat"><thead><tr><th class="ck-nm">Schüler:in · Zielnote</th>${head}<th>bis ${esc(d.unit?.target?.label || "Termin")}</th></tr></thead><tbody>${rows}</tbody></table></div>
      <div class="ck-legend">
        ${stageLegend}
        <span><i class="ck-lg" style="background:var(--ck-cyan);border-radius:3px"></i>gefüllt = sicher</span>
        <span><i class="ck-lg" style="border:1.5px solid var(--ck-cyan);border-radius:3px"></i>Rand = in Arbeit</span>
        <span><i class="ck-lg" style="border:1px dashed #64748b;border-radius:3px"></i>gestrichelt = offen</span>
        ${
          stagesEnabled
            ? `<span><span class="ck-flag ck-flag--over ck-flag--static">!</span> schätzt sich im Training sicherer ein, als die gelösten Aufgaben zeigen</span>
        <span><span class="ck-flag ck-flag--idle ck-flag--static">z</span> Training angefangen, seit 5+ Tagen keine Bewegung</span>`
            : `<span>${unterthemaOnly ? "Nur Unterthema aktiv – eine Box pro Mission" : "Aktive Level der Klasse"}</span>`
        }
        <span>weißer Rahmen = heute daran · alphabetisch sortiert</span>
      </div>`;
  }

  function renderNow() {
    const gs = goals();
    const list = students();
    const help = helpIds();
    const visit = visitIds();
    const { displayTiers, stagesEnabled, unterthemaOnly } = levels();
    const activeSet = new Set(displayTiers);
    const expertIdx = expertTierIndex();
    const tipExpert = expertHintLabel();
    const cards = gs
      .map((goal) => {
        const here = list
          .filter((s) => s.today?.goalId === String(goal.id))
          .sort((a, b) => a.name.localeCompare(b.name, "de"));
        const stuck = here.filter((s) => help.has(Number(s.id)) || visit.has(Number(s.id))).length;
        const experts = list.filter(
          (s) =>
            s.today &&
            s.today.goalId !== String(goal.id) &&
            expertIdx >= 0 &&
            markStatus(s.marks, goal.id, expertIdx) === "sicher"
        );
        const levelCounts = Object.fromEntries(displayTiers.map((t) => [t, 0]));
        for (const s of here) {
          const lvl = s.today.level;
          if (lvl && levelCounts[lvl] != null) levelCounts[lvl] += 1;
          else if (unterthemaOnly && lvl === "unterthema") levelCounts.unterthema = (levelCounts.unterthema || 0) + 1;
        }
        const chips = ck.beamer
          ? `<div class="ck-levels">${displayTiers
              .filter((t) => levelCounts[t])
              .map((t) => `<span><i class="ck-lvl" style="background:${TIER_COLOR[t]}"></i>${levelCounts[t]} ${TIER_LABEL[t]}</span>`)
              .join("")}</div>`
          : `<div class="ck-chips">${here
              .map((s) => {
                const tone = help.has(Number(s.id)) ? "ck-chip--help" : visit.has(Number(s.id)) ? "ck-chip--visit" : "";
                const color =
                  s.today.level && activeSet.has(s.today.level)
                    ? TIER_COLOR[s.today.level]
                    : unterthemaOnly
                      ? TIER_COLOR.unterthema
                      : "#64748b";
                return `<button type="button" class="ck-chip ${tone}" data-ck-open="${esc(s.id)}"><i class="ck-lvl" style="background:${color}"></i>${esc(s.name)}</button>`;
              })
              .join("")}</div>`;
        return `<div class="ck-mcard ${!ck.beamer && stuck >= 2 ? "ck-mcard--stuck" : ""}">
          <div class="ck-mnum">MISSION ${goal.number}</div><h3 title="${esc(goal.text)}">${esc(clip(goal.text, 40))}</h3>
          <div class="ck-small ck-muted">${here.length ? `${here.length} heute dran${!ck.beamer && stuck ? ` · <span class="ck-amber">${stuck} hängen</span>` : ""}` : "heute niemand"}</div>
          ${chips}
          ${!ck.beamer && experts.length ? `<div class="ck-ex">Könnten erklären: ${experts.slice(0, 3).map((s) => esc(s.name)).join(", ")}</div>` : ""}
        </div>`;
      })
      .join("");
    const free = list.filter((s) => s.today && !s.today.goalId).length;
    const tipExtra = stagesEnabled
      ? `„Könnten erklären“ = heute da und ${tipExpert} sicher.`
      : `„Könnten erklären“ = heute da und Unterthema sicher.`;
    return `<div class="ck-now-grid">${cards}
      ${free ? `<div class="ck-mcard"><div class="ck-mnum">EIGENES ZIEL</div><h3>Ohne Mission</h3><div class="ck-small ck-muted">${free} mit einem freien Tagesziel</div></div>` : ""}
      ${ck.beamer ? "" : `<div class="ck-mcard ck-mcard--tip"><div class="ck-mnum">TIPP</div><h3>Mini-Input planen</h3><div class="ck-small ck-muted">Hängen 2 oder mehr an derselben Mission, wird die Karte gelb. Ein 5-Minuten-Input für diese Gruppe spart Einzelrunden. ${esc(tipExtra)}</div></div>`}
    </div>`;
  }

  /* ---------- Rechts: Trainingscenter ---------- */

  function renderRight() {
    const d = ck.data;
    const training = d.training || { missions: [], self: {}, idle: [], over: [] };
    const N = students().length || 1;
    const { markTiers, stagesEnabled } = levels();
    if (stagesEnabled && !markTiers.includes(ck.tier)) ck.tier = markTiers[0] || "rookie";
    const tier = ck.tier;
    const color = TIER_COLOR[tier] || TIER_COLOR.rookie;
    let trainingBody;
    if (!stagesEnabled) {
      trainingBody = `<p class="ck-muted ck-small">Für diese Klasse sind keine Stufen (Rookie / Operator / Street Legend) aktiv. Der Lernstand läuft über Unterthema – siehe Heatmap und „Jetzt an der Mission“.</p>`;
    } else if (!training.missions.length) {
      trainingBody = `<p class="ck-muted ck-small">Diese Einheit ist nicht mit dem Trainingscenter verbunden. Verknüpft sind Funktionen, Potenzen, Quadratische Gleichungen und Trigonometrie.</p>`;
    } else {
      trainingBody = training.missions
        .map((m) => {
          const goal = goalById(m.goalId);
          const c = m.tiers[tier] || { sicher: 0, teilweise: 0, nochNicht: 0, offen: 0 };
          const w = (k) => ((k / N) * 100).toFixed(1);
          return `<div class="ck-tbar" title="${esc(goal?.text || "")}: ${c.sicher} sicher, ${c.teilweise} teilweise, ${c.nochNicht} noch nicht, ${c.offen} nicht begonnen">
            <span class="ck-tbar-lab">${goal ? goal.number : "?"} · ${esc(goal?.text || "")}</span>
            <div class="ck-stack"><span style="width:${w(c.sicher)}%;background:${color}"></span><span style="width:${w(c.teilweise)}%;background:rgba(148,163,184,.55)"></span><span style="width:${w(c.nochNicht)}%;background:rgba(148,163,184,.28)"></span></div>
            <span class="ck-small ck-muted">${c.sicher}</span></div>`;
        })
        .join("");
    }
    const self = training.self || {};
    const parts = [
      ["passt", "#22d3ee"],
      ["überschätzt", "#fbbf24"],
      ["unterschätzt", "#8b5cf6"]
    ];
    const tot = parts.reduce((sum, [k]) => sum + (Number(self[k]) || 0), 0);
    let off = 0;
    let arcs = "";
    for (const [k, col] of parts) {
      const p = tot ? ((Number(self[k]) || 0) / tot) * 100 : 0;
      arcs += `<circle cx="55" cy="55" r="42" fill="none" stroke="${col}" stroke-width="14" pathLength="100" stroke-dasharray="${p.toFixed(2)} 100" stroke-dashoffset="${(-off).toFixed(2)}" transform="rotate(-90 55 55)"/>`;
      off += p;
    }
    const overNames = (training.over || [])
      .map((o) => studentById(o.studentId)?.name)
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, "de"));
    const idle = (training.idle || [])
      .map((i) => {
        const s = studentById(i.studentId);
        const g = goalById(i.goalId);
        if (!s) return "";
        return `<button type="button" class="ck-idle-row" data-ck-open="${esc(s.id)}"><span><strong>${esc(s.name)}</strong> · M${g ? g.number : "?"} ${esc(TIER_LABEL[i.tier])} ${i.solved} von 6</span><span class="ck-muted">seit ${i.days} Tagen</span></button>`;
      })
      .join("");
    const secondary = `
      <details class="ck-fold">
        <summary>Selbstbild &amp; liegen geblieben</summary>
        <div class="ck-panel ck-panel--nested">
          <h2><span>Selbstbild vs. Training</span><span class="td-kicker">Ich-kann</span></h2>
          ${
            tot
              ? `<div class="ck-donut-row">
              <svg width="110" height="110" viewBox="0 0 110 110" aria-hidden="true"><circle cx="55" cy="55" r="42" fill="none" stroke="rgba(148,163,184,.15)" stroke-width="14"/>${arcs}
                <text x="55" y="53" text-anchor="middle" fill="#f8fafc" font-family="Orbitron, system-ui" font-size="17" font-weight="700">${Math.round(((Number(self.passt) || 0) / tot) * 100)} %</text>
                <text x="55" y="69" text-anchor="middle" fill="#94a3b8" font-size="10">passt</text></svg>
              <div class="ck-donut-legend">
                <div><b style="color:#22d3ee">${num(self.passt)}</b>passt</div>
                <div><b style="color:#fbbf24">${num(self["überschätzt"])}</b>überschätzt</div>
                <div><b style="color:#8b5cf6">${num(self["unterschätzt"])}</b>unterschätzt</div>
                ${overNames.length ? `<div class="ck-muted ck-private ck-tiny">überschätzt: ${overNames.slice(0, 8).map(esc).join(", ")}${overNames.length > 8 ? " …" : ""}</div>` : ""}
              </div>
            </div>`
              : `<p class="ck-muted ck-small">Noch keine Ich-kann-Angaben im Training zu dieser Einheit.</p>`
          }
        </div>
        <div class="ck-panel ck-panel--nested ck-private">
          <h2><span>Liegen geblieben</span><span class="td-kicker">Training</span></h2>
          ${idle || `<p class="ck-muted ck-small">Niemand. Alle angefangenen Stufen haben sich in den letzten 5 Tagen bewegt.</p>`}
        </div>
      </details>`;
    const tierTabs = stagesEnabled
      ? `<div class="ck-tier-tabs" role="group" aria-label="Stufe">
            ${markTiers.map((t) => `<button type="button" data-ck-tier="${t}" aria-pressed="${t === tier ? "true" : "false"}" class="ck-tier-${t}">${TIER_LABEL[t]}</button>`).join("")}
          </div>`
      : "";
    const legend = stagesEnabled
      ? `<div class="ck-legend">
            <span><i class="ck-lg" style="background:${color}"></i>sicher (6 von 6)</span>
            <span><i class="ck-lg" style="background:rgba(148,163,184,.55)"></i>teilweise (3–5)</span>
            <span><i class="ck-lg" style="background:rgba(148,163,184,.28)"></i>noch nicht (1–2)</span>
          </div>`
      : "";
    return `
      <aside class="ck-col">
        <div class="ck-panel">
          <h2><span>Trainingscenter</span><span class="td-kicker">diese Einheit</span></h2>
          ${tierTabs}
          ${trainingBody}
          ${legend}
        </div>
        ${stagesEnabled ? secondary : ""}
      </aside>`;
  }

  /* ---------- Unterleiste ---------- */

  function clockMinutes(text) {
    const m = String(text || "").match(/(\d{1,2})[.:](\d{2})/);
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
  }

  function fmtClock(minutes) {
    return `${Math.floor(minutes / 60)}.${String(minutes % 60).padStart(2, "0")}`;
  }

  function lessonEndAt(lesson, now = new Date()) {
    const endM = clockMinutes(lesson?.end);
    if (endM == null) return null;
    const d = new Date(now);
    d.setHours(Math.floor(endM / 60), endM % 60, 0, 0);
    return d;
  }

  /** Spiegel von shouldAutoRaffle / autoRaffleStatus aus lib/teacher-cockpit.js */
  function raffleAutoStatus(now = new Date()) {
    const r = ck.data?.game?.raffle || {};
    const lesson = liveData().lesson;
    const end = lessonEndAt(lesson, now);
    if (r.drawn) return { kind: "drawn" };
    if (!end) return { kind: "idle" };
    const msLeft = end.getTime() - now.getTime();
    if (msLeft < 0) return { kind: "ended" };
    const minutesLeft = Math.max(0, Math.ceil(msLeft / 60000));
    const inWindow = msLeft <= 5 * 60 * 1000;
    if (!inWindow) return { kind: "countdown", minutesLeft };
    if (!(Number(r.eligibleCount) > 0)) return { kind: "waiting_eligible", minutesLeft };
    return { kind: "ready", minutesLeft };
  }

  function raffleAutoKey() {
    if (!ck.classId || !ck.data?.date) return null;
    return `${ck.classId}:${ck.data.date}`;
  }

  function maybeAutoRaffle() {
    if (!ck.active || ck.busy || ck.form || document.hidden) return;
    const r = ck.data?.game?.raffle;
    if (!r || r.drawn) {
      const key = raffleAutoKey();
      if (key) ck.autoRaffleDoneKey = key;
      return;
    }
    const key = raffleAutoKey();
    if (!key || ck.autoRaffleDoneKey === key) return;
    const status = raffleAutoStatus();
    if (status.kind !== "ready") return;
    runRaffle({ auto: true });
  }

  function renderPulse() {
    const live = liveData();
    const events = ck.data.events || [];
    let from = clockMinutes(live.lesson?.start);
    let to = clockMinutes(live.lesson?.end);
    let step = 3;
    let title = "Puls der Stunde";
    let kicker = "3-Minuten-Takt";
    if (from == null || to == null || to <= from) {
      from = 7 * 60 + 30;
      to = 16 * 60;
      step = 30;
      title = "Puls heute";
      kicker = "halbstündlich";
    }
    const bins = Math.max(1, Math.ceil((to - from) / step));
    const counts = Array.from({ length: bins }, () => ({ ziel: 0, training: 0, sicher: 0, hilfe: 0 }));
    for (const e of events) {
      const at = new Date(e.at);
      if (Number.isNaN(at.getTime())) continue;
      const m = at.getHours() * 60 + at.getMinutes();
      if (m < from || m >= to) continue;
      const bin = Math.floor((m - from) / step);
      if (counts[bin] && counts[bin][e.kind] != null) counts[bin][e.kind] += 1;
    }
    const nowDate = new Date();
    const nowM = nowDate.getHours() * 60 + nowDate.getMinutes();
    const max = Math.max(4, ...counts.map((c) => c.ziel + c.training + c.sicher + c.hilfe));
    const colors = [
      ["ziel", "#22d3ee"],
      ["training", "#8b5cf6"],
      ["sicher", "#f472b6"],
      ["hilfe", "#f97316"]
    ];
    const bars = counts
      .map((c, i) => {
        const future = ck.data.date === localIso(nowDate) && from + i * step > nowM;
        if (future) return `<div class="ck-b ck-b--future"></div>`;
        return `<div class="ck-b">${colors.map(([k, col]) => `<span style="height:${((c[k] / max) * 100).toFixed(1)}%;background:${col}"></span>`).join("")}</div>`;
      })
      .join("");
    const ticks = [0, 1, 2, 3].map((k) => fmtClock(Math.round(from + ((to - from) * k) / 3)));
    return `
      <div class="ck-panel">
        <h2><span>${title}</span><span class="td-kicker">${kicker}</span></h2>
        <div class="ck-bars">${bars}</div>
        <div class="ck-axis">${ticks.map((t) => `<span>${t}</span>`).join("")}</div>
        <div class="ck-legend">
          <span><i class="ck-lg" style="background:#22d3ee"></i>Tagesziel</span>
          <span><i class="ck-lg" style="background:#8b5cf6"></i>Training</span>
          <span><i class="ck-lg" style="background:#f472b6"></i>Stufe sicher</span>
          <span class="ck-private"><i class="ck-lg" style="background:#f97316"></i>Hilfe</span>
        </div>
      </div>`;
  }

  function localIso(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  function renderRecent() {
    const d = ck.data;
    const N = students().length || 1;
    const list = d.recentLessons || [];
    const body = list.length
      ? list
          .map((day) => {
            const isToday = day.date === d.date;
            return `<div class="ck-wk-d ${isToday ? "ck-wk-d--today" : ""}">
              <div class="ck-wk-pair"><i style="height:${((day.planned / N) * 100).toFixed(1)}%;background:#22d3ee"></i><i style="height:${Math.max((day.reflected / N) * 100, 2).toFixed(1)}%;background:${isToday ? "rgba(139,92,246,.35)" : "#8b5cf6"}"></i></div>
              ${isToday ? "heute" : esc(fmtDay(day.date))}<br><span class="ck-muted">${day.planned}/${isToday ? "läuft" : day.reflected}</span></div>`;
          })
          .join("")
      : `<p class="ck-muted ck-small">In den letzten fünf Wochen keine Einträge in diesem Fach.</p>`;
    return `
      <div class="ck-panel">
        <h2><span>Die letzten ${esc(d.levelCheck?.subject || "")}-Stunden</span></h2>
        <div class="ck-wk">${body}</div>
        <div class="ck-legend">
          <span><i class="ck-lg" style="background:#22d3ee;border-radius:3px"></i>Tagesziel gesetzt</span>
          <span><i class="ck-lg" style="background:#8b5cf6;border-radius:3px"></i>Tag abgeschlossen</span>
        </div>
      </div>`;
  }

  function renderTimeline() {
    const d = ck.data;
    const unit = d.unit || {};
    const start = unit.start || d.date;
    const events = unit.events || [];
    const last = events.reduce((m, e) => (e.date > m ? e.date : m), d.date);
    const span = Math.max(1, daysBetween(start, last));
    const pos = (iso) => 3 + (Math.max(0, Math.min(span, daysBetween(start, iso))) / span) * 92;
    const color = (e) => (e.type === "levelcheck" ? "#fbbf24" : e.type === "klassenarbeit" ? "#f472b6" : "#a78bfa");
    const items = [{ x: pos(start), c: "#94a3b8", t: "Start", sub: fmtShort(start) }]
      .concat(
        events
          .filter((e) => e.date !== start)
          .map((e) => ({
            x: pos(e.date),
            c: color(e),
            t: e.label,
            sub: `${fmtShort(e.date)}${e.lastMission >= 0 ? ` · M1–${e.lastMission + 1}` : ""}`
          }))
      )
      .concat([{ x: pos(d.date), c: "#22d3ee", t: "heute", sub: fmtShort(d.date), today: true }]);
    const target = unit.target;
    const lessonDays = (unit.lessonDays || []).map((iso) => WEEKDAYS[isoParts(iso).date.getDay()]);
    const dayList = lessonDays.length ? ` (${lessonDays.slice(0, 6).join(", ")}${lessonDays.length > 6 ? " …" : ""})` : "";
    return `
      <div class="ck-panel">
        <h2><span>Termine der Einheit</span></h2>
        <div class="ck-tl"><div class="ck-tl-ln"></div>
          ${items
            .map(
              (it, i) =>
                `<div class="ck-tl-ev ${it.today ? "ck-tl-ev--today" : ""} ${i % 2 ? "ck-tl-ev--low" : ""}" style="left:${it.x.toFixed(1)}%"><div style="color:${it.c};font-weight:700">${esc(it.t)}</div><i style="background:${it.c}"></i><div class="ck-muted">${esc(it.sub)}</div></div>`
            )
            .join("")}
        </div>
        ${
          target
            ? `<p class="ck-small">Bis zum ${esc(target.label)}: <strong>${unit.lessonsUntilTarget} ${esc(d.levelCheck?.subject || "")}-Stunden</strong> laut Stundenplan${esc(dayList)}. Ferien kennt die App nicht.</p>
               <p class="ck-small ck-muted">Die Klasse braucht im Schnitt noch <strong class="ck-white">${dec(unit.missingToTarget)} Missionen</strong> bis Mission ${target.planIndex + 1}.${
                 unit.lessonsUntilTarget ? ` Das sind etwa ${dec(unit.missingToTarget / unit.lessonsUntilTarget)} Missionen pro Stunde.` : ""
               }</p>`
            : `<p class="ck-small ck-muted">Für diese Einheit ist noch kein Levelcheck und keine Arbeit mit Datum eingetragen.</p>`
        }
      </div>`;
  }

  /* ---------- Klassen-Spiel ---------- */

  function xpPicker(kind, value) {
    const opts = ck.data?.game?.xpOptions || [5, 10, 15, 20];
    return `<span class="td-seg ck-seg ck-seg--sm" role="group" aria-label="XP">${opts
      .map((x) => `<button type="button" data-ck-xp="${kind}" data-value="${x}" aria-pressed="${x === value ? "true" : "false"}">${x} XP</button>`)
      .join("")}</span>`;
  }

  function renderGoalCard() {
    const k = ck.data.game?.klassenziel || {};
    if (!k.target) return "";
    const pct = Math.min(100, Math.round((k.total / k.target) * 100));
    const defs = `<defs><linearGradient id="ckGoalG"><stop offset="0" stop-color="#22d3ee"/><stop offset=".5" stop-color="#8b5cf6"/><stop offset="1" stop-color="#f472b6"/></linearGradient></defs>`;
    return `
      <div class="ck-panel ck-game-card">
        <h2><span>Klassenziel</span><span class="td-kicker">gemeinsame XP</span></h2>
        <div class="ck-game-goal">${ring(pct, "url(#ckGoalG)", 112, 12, `${pct} %`, defs)}
          <div><strong>${esc(k.title || "Klassenziel")}</strong>
          <p class="ck-small">${num(k.total)} von ${num(k.target)} XP${k.total < k.target ? ` · noch ${num(k.target - k.total)}` : " · erreicht!"}</p>
          <p class="ck-small ck-muted">+${num(k.xpToday)} XP heute von ${num(k.peopleToday)} Schüler:innen</p></div></div>
        <p class="ck-tiny ck-muted">Zählt alle XP der Klasse zusammen.</p>
      </div>`;
  }

  function renderMissionCard() {
    const d = ck.data;
    const m = d.game?.mission;
    let body = "";
    if (ck.form && !ck.beamer) {
      const f = ck.form;
      const gs = goals();
      body = `
        <div class="ck-form">
          <p class="ck-small ck-muted">Welche Missionen sollen alle sicher haben?</p>
          <div class="ck-check-grid">${gs
            .map(
              (g) =>
                `<label class="ck-check"><input type="checkbox" data-ck-form="goal" value="${esc(g.id)}" ${f.goalIds.includes(String(g.id)) ? "checked" : ""}> ${g.number} · ${esc(clip(g.text, 26))}</label>`
            )
            .join("")}</div>
          <div class="ck-form-row">
            ${
              levels().missionTiers.length > 1 || levels().stagesEnabled
                ? `<label>Stufe <select class="ck-input" data-ck-form="tier">${levels().missionTiers.map((t) => `<option value="${t}" ${f.tier === t ? "selected" : ""}>${TIER_LABEL[t]}</option>`).join("")}</select></label>`
                : `<input type="hidden" data-ck-form="tier" value="unterthema"><p class="ck-small ck-muted">Stufe: Unterthema (keine R/O/SL aktiv)</p>`
            }
            <label>bis <input type="date" class="ck-input" data-ck-form="due" value="${esc(f.dueDate || "")}"></label>
          </div>
          <label class="ck-form-full">Eigener Titel (optional)<input type="text" class="ck-input" maxlength="160" data-ck-form="title" value="${esc(f.title || "")}" placeholder="${esc(formTitle(f))}"></label>
          <div class="ck-form-row">
            <label>Beute-XP (optional)<input type="number" class="ck-input" min="0" max="5000" data-ck-form="lootXp" value="${esc(f.lootXp ?? "")}" placeholder="z. B. 300"></label>
            <label class="ck-form-full">Beute-Text (optional)<input type="text" class="ck-input" maxlength="200" data-ck-form="lootText" value="${esc(f.lootText || "")}" placeholder="z. B. Musik in der Lernzeit"></label>
          </div>
          <div class="ck-acts"><button type="button" class="ck-btn ck-btn-go ck-btn-sm" data-ck-mission="save" ${ck.busy ? "disabled" : ""}>Klassen-Mission starten</button>
          <button type="button" class="ck-btn ck-btn-sm" data-ck-mission="cancel">Abbrechen</button></div>
        </div>`;
    } else if (m && m.active) {
      const pct = m.total ? (m.done / m.total) * 100 : 0;
      const complete = m.total > 0 && m.done === m.total;
      body = `
        <p class="ck-small"><strong>${esc(m.title)}</strong></p>
        <div class="ck-goalbar"><b style="width:${pct.toFixed(1)}%"></b></div>
        <p class="ck-small ${complete ? "ck-win" : "ck-muted"}">${complete ? `Geschafft! Alle ${m.total} haben es.` : `${m.done} von ${m.total} geschafft · noch ${m.total - m.done}`}</p>
        <p class="ck-tiny ck-muted">Nur Zahlen, keine Namen. ${m.tier === "unterthema" ? "Zählt Unterthema als sicher." : `Zählt ${esc(m.tierLabel)} oder höher als sicher.`}${m.dueDate ? ` Bis ${esc(fmtDate(m.dueDate))}.` : ""}</p>
        <div class="ck-acts ck-private"><button type="button" class="ck-btn ck-btn-sm" data-ck-mission="close" data-id="${esc(m.id)}">Beenden</button>
        <button type="button" class="ck-btn ck-btn-sm" data-ck-mission="new">Neue Klassen-Mission</button></div>`;
    } else {
      body = `
        ${m ? `<p class="ck-small ck-muted">Zuletzt: ${esc(m.title)} · ${m.done} von ${m.total} geschafft.</p>` : ""}
        <p class="ck-small ck-muted">Ein gemeinsames Lernziel für alle, zum Beispiel „bis Dienstag alle Mission 1–2${levels().stagesEnabled ? " auf Rookie" : ""} sicher“. Die Klasse sieht nur, wie viele es schon haben.</p>
        <div class="ck-acts ck-private"><button type="button" class="ck-btn ck-btn-go ck-btn-sm" data-ck-mission="new" ${goals().length ? "" : "disabled"}>Klassen-Mission anlegen</button></div>`;
    }
    return `
      <div class="ck-panel ck-game-card">
        <h2><span>Klassen-Mission</span><span class="td-kicker">alle zusammen</span></h2>
        ${body}
      </div>`;
  }

  function formTitle(f) {
    const nums = goals()
      .filter((g) => f.goalIds.includes(String(g.id)))
      .map((g) => g.number);
    const when = f.dueDate ? `Bis ${fmtDate(f.dueDate)}` : "Gemeinsam";
    if (f.tier === "unterthema" || !levels().stagesEnabled) {
      return `${when} haben alle ${missionsText(nums) || "die Missionen"} sicher.`;
    }
    return `${when} haben alle ${missionsText(nums) || "die Missionen"} auf ${TIER_LABEL[f.tier] || "Rookie"} sicher.`;
  }

  function raffleAutoHint() {
    const status = raffleAutoStatus();
    if (status.kind === "countdown" && status.minutesLeft != null) {
      return `<p class="ck-tiny ck-muted">Auto-Ziehung in ${status.minutesLeft} Min (5 Min vor Stundenende).</p>`;
    }
    if (status.kind === "waiting_eligible") {
      return `<p class="ck-tiny ck-muted">Automatik wartet auf Abschlüsse – Lostopf noch leer.</p>`;
    }
    if (status.kind === "ready") {
      return `<p class="ck-tiny ck-amber">Auto-Ziehung startet gleich …</p>`;
    }
    if (status.kind === "ended" && !(ck.data?.game?.raffle?.drawn)) {
      return `<p class="ck-tiny ck-muted">Stundenende vorbei – Automatik zieht nicht mehr nach. Manuell möglich.</p>`;
    }
    return "";
  }

  function raffleRulesPills() {
    const rules = season()?.raffleRules || [];
    if (!rules.length) return "";
    return `<div class="ck-pills" aria-label="Los-Regeln">${rules
      .map((r) => `<span class="ck-pill">${esc(r.label)} +${esc(r.tickets)}</span>`)
      .join("")}</div>`;
  }

  function studentByRosterId(id) {
    return (ck.data?.students || []).find((x) => Number(x.id) === Number(id)) || null;
  }

  function ticketAvatarPool() {
    const all = ck.data?.students || [];
    const withTickets = all.filter((s) => s.plannedToday || s.reflectedToday);
    return withTickets.length ? withTickets : all.slice();
  }

  function avatarMarkup(student, sizeClass) {
    const name = student?.shortName || student?.name || "?";
    const initial = String(name).trim().slice(0, 1).toUpperCase() || "?";
    const url = student?.avatarUrl;
    if (url) {
      return `<span class="ck-av ${sizeClass || ""}"><img src="${esc(url)}" alt="" loading="lazy"><span class="ck-av-fallback" aria-hidden="true">${esc(initial)}</span></span>`;
    }
    return `<span class="ck-av ${sizeClass || ""} ck-av--fallback" aria-hidden="true">${esc(initial)}</span>`;
  }

  function raffleSpinInner(student) {
    const label = namesOnBeamer()
      ? esc(student?.shortName || student?.name || "…")
      : "";
    return `${avatarMarkup(student, "ck-av--xl")}${label ? `<strong class="ck-raffle-spin-name">${label}</strong>` : ""}`;
  }

  function stopRaffleSpin() {
    if (ck.raffleSpinTimer) {
      clearInterval(ck.raffleSpinTimer);
      ck.raffleSpinTimer = null;
    }
  }

  function startRaffleSpin(pool) {
    stopRaffleSpin();
    ck.raffleSpinPool = pool || [];
    ck.raffleSpinIdx = 0;
    if (!ck.raffleSpinPool.length) return;
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    if (reduce) return;
    ck.raffleSpinTimer = setInterval(() => {
      if (!ck.raffleSpinPool?.length) return;
      ck.raffleSpinIdx = (ck.raffleSpinIdx + 1) % ck.raffleSpinPool.length;
      const host = ck.el?.querySelector?.("[data-ck-raffle-spin]");
      if (!host) return;
      host.innerHTML = raffleSpinInner(ck.raffleSpinPool[ck.raffleSpinIdx]);
    }, 90);
  }

  function renderRaffleCard() {
    const r = ck.data.game?.raffle || {};
    const ticketTotal = r.ticketTotal ?? r.potSize ?? r.eligibleCount ?? 0;
    const withTickets = r.studentsWithTickets ?? r.eligibleCount ?? 0;
    const showControls = !ck.beamer && controlsVisible();
    const winner = r.drawn ? studentByRosterId(r.drawn.winnerId) : null;
    const winnerLabel = displayPersonName(
      winner?.shortName || r.drawn?.winnerShort,
      winner?.name || r.drawn?.winnerName
    );
    let body;
    if (ck.reveal === "rolling") {
      const pool = ck.raffleSpinPool?.length ? ck.raffleSpinPool : ticketAvatarPool();
      const spin = pool[ck.raffleSpinIdx] || pool[0];
      body = `
        <div class="ck-raffle-spin" data-ck-raffle-spin>${spin ? raffleSpinInner(spin) : `<div class="ck-raffle-roll"><span></span><span></span><span></span></div>`}</div>
        <p class="ck-small ck-muted">Die Lose werden gemischt …</p>`;
    } else if (r.drawn) {
      body = `
        <div class="ck-raffle-win ck-raffle-win--lg ${ck.reveal === "show" ? "ck-raffle-win--pop" : ""}">
          ${avatarMarkup(winner || { shortName: winnerLabel }, "ck-av--xl")}
          <strong>${esc(winnerLabel)}</strong>
          <span class="ck-raffle-xp">+${r.drawn.xp} XP</span>
        </div>
        ${raffleRulesPills()}`;
    } else {
      body = `
        <p class="ck-hero ck-raffle-pot"><span class="ck-raffle-pot__n">${ticketTotal} Lose</span></p>
        <p class="ck-body ck-raffle-pot__sub">von ${withTickets} Schüler:innen im Topf</p>
        ${raffleRulesPills()}
        ${
          showControls
            ? `<div class="ck-acts">${xpPicker("raffle", ck.raffleXp)}</div>
               <div class="ck-acts"><button type="button" class="ck-btn ck-btn-go" data-ck-raffle ${r.eligibleCount && !ck.busy ? "" : "disabled"}>Ziehung starten</button></div>`
            : ""
        }`;
    }
    return `
      <div class="ck-panel ck-game-card ck-raffle-card">
        <h2><span>Glücks-Ziehung</span><span class="td-kicker">einmal am Tag</span></h2>
        ${body}
      </div>`;
  }

  /** Mitgliederliste für Team des Tages (Lehrkraft sieht, wer den Tag abgeschlossen hat). */
  function teamMembersHtml(members) {
    const list = Array.isArray(members) ? members : [];
    if (!list.length) return `<p class="ck-tiny ck-muted">Keine Mitglieder hinterlegt.</p>`;
    const done = list.filter((m) => m.reflected);
    const open = list.filter((m) => !m.reflected);
    const chip = (m, ok) =>
      `<span class="ck-team-chip ${ok ? "ck-team-chip--ok" : "ck-team-chip--open"}" title="${ok ? "Tag abgeschlossen" : "Tag noch offen"}">${ok ? "✔" : "·"} ${esc(m.name || "?")}</span>`;
    const summary =
      open.length && done.length
        ? `Fertig: ${done.map((m) => m.name).join(", ")} · Offen: ${open.map((m) => m.name).join(", ")}`
        : open.length
          ? `Noch offen: ${open.map((m) => m.name).join(", ")}`
          : `Alle fertig: ${done.map((m) => m.name).join(", ")}`;
    return `<div class="ck-team-members" aria-label="${esc(summary)}">
      ${done.map((m) => chip(m, true)).join("")}
      ${open.map((m) => chip(m, false)).join("")}
    </div>`;
  }

  function renderTeamCard() {
    const teams = ck.data.teams || [];
    const award = ck.data.game?.team;
    const info = ck.data.teamsInfo || {};
    const sourceLabel = info.source === "work" ? "laufende Gruppenarbeit" : "Stammgruppen / Gruppenarbeit";
    const sessionBit = info.sessionTitle ? ` „${esc(info.sessionTitle)}“` : "";
    let body;
    if (award) {
      body = `
        <div class="ck-raffle-win"><span class="ck-raffle-star">🏆</span><strong>${esc(award.name)}</strong><span class="ck-small">+${award.xpEach} XP für alle ${award.memberCount}</span></div>
        <p class="ck-small ck-muted">${award.reflectedCount} von ${award.memberCount} hatten den Tag abgeschlossen${award.goalReached ? " · Teamziel erreicht" : ""}.</p>
        ${teamMembersHtml(award.members)}`;
    } else if (!teams.length) {
      body = `<p class="ck-small ck-muted">${esc(info.emptyReason || "Keine Gruppenarbeit angelegt. Lege Gruppen im Gruppenmodus an – dann gilt die Team-Challenge.")}</p>`;
    } else {
      body = `
        <p class="ck-tiny ck-muted">${esc(info.subject || "Fach")}: Gruppen aus der ${esc(sourceLabel)}${sessionBit}. Teamziel: alle im Team haben heute den Tag abgeschlossen (Anteil, nicht Summe). Hinweise, keine Rangliste.</p>
        <div class="ck-teams">${teams
          .map((t) => {
            const pct = Math.round(t.share * 100);
            const title = t.groupName || t.name;
            const sessionLine = t.sessionTitle
              ? `<p class="ck-tiny ck-muted">Gruppenarbeit: ${esc(t.sessionTitle)}</p>`
              : "";
            return `<div class="ck-team ${t.goalReached ? "ck-team--ok" : ""}">
              <div class="ck-row-between"><strong>${esc(title)}</strong><span class="ck-tiny ck-muted">${esc(t.subject || "")}</span></div>
              ${sessionLine}
              ${teamMembersHtml(t.members)}
              <div class="ck-goalbar ck-goalbar--sm"><b style="width:${pct}%"></b></div>
              <div class="ck-row-between ck-tiny"><span>${t.reflectedCount}/${t.memberCount} Tag abgeschlossen · Ø ${dec(t.avgNewSicher)} neue sichere Stufen</span>
              <button type="button" class="ck-btn ck-btn-sm ${t.goalReached ? "ck-btn-go" : ""}" data-ck-team="${esc(t.rosterId)}" ${ck.busy ? "disabled" : ""}>${t.goalReached ? "Bestätigen" : "Trotzdem"}</button></div>
            </div>`;
          })
          .join("")}</div>
        <div class="ck-acts">${xpPicker("team", ck.teamXp)}<span class="ck-tiny ck-muted">pro Mitglied</span></div>`;
    }
    return `
      <div class="ck-panel ck-game-card">
        <h2><span>Team des Tages</span><span class="td-kicker">Gruppenarbeit</span></h2>
        ${body}
      </div>`;
  }

  function renderSideQuestTeacher() {
    const q = season()?.sideQuest;
    const templates = season()?.config?.sideQuestTemplates || [];
    const showPick = !q || ck.sqRepick;
    let body;
    if (q && !showPick) {
      body = `<p class="ck-small"><strong>${esc(q.text)}</strong>${q.auto ? ` <span class="ck-tiny ck-muted">(auto)</span>` : ""}</p>
        <p class="ck-small">${q.progress} / ${q.ziel}${q.done ? " · geschafft" : ""}</p>
        <div class="ck-acts"><button type="button" class="ck-btn ck-btn-sm" data-ck-sq="pick" ${ck.busy ? "disabled" : ""}>Andere wählen</button></div>`;
    } else {
      body = `${q ? `<p class="ck-tiny ck-muted">Aktuell: ${esc(q.text)} – neue Vorlage überschreibt.</p>` : `<p class="ck-small ck-muted">Ohne Wahl wird morgens automatisch rotiert – Fortschritt aus Ereignissen.</p>`}
        <div class="ck-acts ck-sq-list">${templates
          .map(
            (t) =>
              `<button type="button" class="ck-btn ck-btn-sm" data-ck-sq="set" data-id="${esc(t.id)}" ${ck.busy ? "disabled" : ""}>${esc(t.text)}</button>`
          )
          .join("")}</div>
        ${q ? `<div class="ck-acts"><button type="button" class="ck-btn ck-btn-sm" data-ck-sq="cancel-pick">Abbrechen</button></div>` : ""}`;
    }
    return `
      <div class="ck-panel ck-game-card">
        <h2><span>Side Quest</span><span class="td-kicker">heute</span></h2>
        ${body}
      </div>`;
  }

  function studentLabel(id) {
    const s = (ck.data?.students || []).find((x) => Number(x.id) === Number(id));
    return s?.shortName || s?.name || `#${id}`;
  }

  function renderAvoidPairsBlock() {
    const pairs = ck.crewsDraft?.avoidPairs || [];
    const students = ck.data?.students || [];
    const opts = students
      .map((s) => `<option value="${esc(s.id)}">${esc(s.shortName || s.name)}</option>`)
      .join("");
    const list =
      pairs.length > 0
        ? `<ul class="ck-avoid-list">${pairs
            .map(
              (p) =>
                `<li>${esc(studentLabel(p.studentA))} · ${esc(studentLabel(p.studentB))}</li>`
            )
            .join("")}</ul>`
        : `<p class="ck-tiny ck-muted">Keine Paare hinterlegt.</p>`;
    return `
      <div class="ck-avoid">
        <p class="ck-tiny"><strong>Nicht zusammen</strong></p>
        ${list}
        <div class="ck-avoid-add">
          <select class="ck-input" data-ck-avoid-a aria-label="Schüler:in A"><option value="">– A –</option>${opts}</select>
          <select class="ck-input" data-ck-avoid-b aria-label="Schüler:in B"><option value="">– B –</option>${opts}</select>
          <button type="button" class="ck-btn ck-btn-sm" data-ck-crews="avoid-add" ${ck.crewsBusy ? "disabled" : ""}>Paar speichern</button>
        </div>
      </div>`;
  }

  function renderCrewsPanel() {
    const seasonKey = season()?.seasonKey || ck.data?.levelCheck?.id || `class-${ck.classId}`;
    const crews = ck.crewsDraft?.crews || season()?.crews || [];
    const released = crews.length && crews.every((c) => c.released !== false);
    const hasDraft = (ck.crewsDraft?.crews || []).length > 0;
    const list = (ck.crewsDraft?.crews || []).length
      ? ck.crewsDraft.crews
      : [];
    let body;
    if (!ck.crewsOpen) {
      body = `<div class="ck-acts"><button type="button" class="ck-btn ck-btn-sm" data-ck-crews="open">Crews öffnen</button></div>`;
    } else {
      const rows = list.length
        ? list
            .map((c) => {
              return `<div class="ck-crew-row" style="border-color:${esc(c.color || "#22d3ee")}">
                <div class="ck-crew-row__head">
                  <input class="ck-input" data-ck-crew-name="${esc(c.id)}" value="${esc(c.name || "")}" maxlength="40" ${c.released ? "disabled" : ""}>
                  <input class="ck-input ck-input--color" type="color" data-ck-crew-color="${esc(c.id)}" value="${esc((c.color || "#22d3ee").slice(0, 7))}" ${c.released ? "disabled" : ""}>
                  <input class="ck-input" data-ck-crew-tag="${esc(c.id)}" value="${esc(c.tagText || "")}" maxlength="40" placeholder="Tag" ${c.released ? "disabled" : ""}>
                  <button type="button" class="ck-btn ck-btn-sm" data-ck-crew-save="${esc(c.id)}" ${c.released || ck.crewsBusy ? "disabled" : ""}>OK</button>
                </div>
                <p class="ck-tiny">${(c.members || []).map((m) => esc(m.shortName || m.name)).join(" · ")}</p>
                ${
                  c.released
                    ? ""
                    : `<label class="ck-tiny">Tauschen nach hier <select data-ck-crew-swap="${esc(c.id)}"><option value="">–</option>${list
                        .filter((x) => x.id !== c.id)
                        .flatMap((x) => x.members || [])
                        .map((m) => `<option value="${esc(m.id)}">${esc(m.shortName || m.name)}</option>`)
                        .join("")}</select></label>`
                }
              </div>`;
            })
            .join("")
        : `<p class="ck-small ck-muted">Noch keine Crews für diese Season.</p>`;
      body = `
        <p class="ck-tiny ck-muted">Season: ${esc(seasonKey)}${released || (list.length && list[0]?.released) ? " · freigegeben" : hasDraft ? " · Entwurf" : ""}</p>
        ${ck.crewDrawShow ? renderCrewDrawShow() : ""}
        ${rows}
        ${renderAvoidPairsBlock()}
        <div class="ck-acts">
          <button type="button" class="ck-btn ck-btn-go ck-btn-sm" data-ck-crews="draw" ${ck.crewsBusy ? "disabled" : ""}>Auslosen</button>
          <button type="button" class="ck-btn ck-btn-hot ck-btn-sm" data-ck-crews="release" ${!list.length || ck.crewsBusy || list.every((c) => c.released) ? "disabled" : ""}>Freigeben</button>
          <button type="button" class="ck-btn ck-btn-sm" data-ck-crews="close">Schließen</button>
        </div>`;
    }
    return `
      <div class="ck-panel ck-game-card ck-crews-panel">
        <h2><span>Crews</span><span class="td-kicker">Auslosung</span></h2>
        ${body}
      </div>`;
  }

  function renderHelpModal() {
    const m = ck.helpModal;
    if (!m || !window.SolHelpAttribution) return "";
    const peers = (ck.data?.students || [])
      .filter((s) => Number(s.id) !== Number(m.studentId))
      .map((s) => `<option value="${esc(s.id)}">${esc(s.shortName || s.name)}</option>`)
      .join("");
    return window.SolHelpAttribution.renderModal({
      esc,
      studentName: m.studentName || "",
      peerOptionsHtml: peers
    });
  }

  function renderGame() {
    // Beamer: kein Team des Tages – nur gemeinsame Ziele / Ziehung
    const team = ck.beamer ? "" : renderTeamCard();
    const extra = ck.beamer ? "" : `${renderSideQuestTeacher()}${renderCrewsPanel()}`;
    return `
      <section class="ck-game" aria-label="Klassen-Spiel">
        <h2 class="ck-game-title"><span class="td-kicker">Klassen-Spiel</span></h2>
        <div class="ck-game-grid">
          ${renderGoalCard()}${renderMissionCard()}${renderRaffleCard()}${team}${extra}
        </div>
      </section>`;
  }

  function examShortLabel() {
    const d = ck.data;
    const exam = (d?.unit?.events || []).find(
      (e) => e.type === "klassenarbeit" || e.type === "test" || e.type === "projektabgabe"
    );
    if (exam?.date) return `KA ${fmtShort(exam.date)}`;
    const target = d?.unit?.target;
    if (target?.date) return `${target.label || "KA"} ${fmtShort(target.date)}`;
    return "";
  }

  function renderSeasonMap(compact) {
    const map = season()?.map;
    const MapApi = window.TeacherCockpitMap;
    if (!MapApi || !map) {
      return `<div class="ck-panel"><p class="ck-muted ck-small">Kartendaten fehlen oder Einheit ohne Season.</p></div>`;
    }
    const boss = bossEffective();
    const html = MapApi.renderMap(map, {
      ringColors: season()?.config?.mapRingColors,
      boss,
      examLabel: examShortLabel(),
      checkpointNs: (boss?.hitByMission || []).map((h) => h.n).filter(Boolean)
    });
    return `<div class="ck-panel ck-map-panel ${compact ? "ck-map-panel--compact" : ""}">
      <h2><span>${map.mode === "city" ? esc(map.ort || map.name || "Stadtteil") : "Fahrspuren"}</span><span class="td-kicker">${map.mode === "city" ? "Karte" : "ohne Stadtteil"}</span></h2>
      ${html}
    </div>`;
  }

  function renderBossPanel(compact) {
    const boss = bossEffective();
    if (!boss) {
      return `<div class="ck-panel ck-boss"><h2><span>Boss-Fight</span><span class="td-kicker">Checkpoint</span></h2>
        <p class="ck-muted ck-small">Keine aktive Klassen-Mission – lege einen Checkpoint an, dann erscheint der Boss.</p>
        <div class="ck-acts ck-private"><button type="button" class="ck-btn ck-btn-sm" data-ck-mission="new" ${goals().length ? "" : "disabled"}>Klassen-Mission anlegen</button></div>
      </div>`;
    }
    const energy = Math.max(1, Number(boss.energy) || 1);
    const rem = boss.defeated ? 0 : Number(boss.remaining) || 0;
    const pct = Math.max(0, Math.min(100, ((energy - rem) / energy) * 100));
    const hits = (boss.hitByMission || [])
      .map((h) => `<li>Treffer Mission ${esc(h.n ?? "?")} −${esc(h.hits)}</li>`)
      .join("");
    const loot = (boss.loot || [])
      .map((l) => `<li>${esc(l.label || l.kind || "Beute")}</li>`)
      .join("");
    return `
      <div class="ck-panel ck-boss ${boss.defeated ? "ck-boss--win" : ""} ${compact ? "ck-boss--compact" : ""}">
        <h2><span>${esc(boss.name || "Boss")}</span><span class="td-kicker">${boss.defeated ? "besiegt" : "Boss-Fight"}</span></h2>
        <div class="ck-boss-energy">
          <div class="ck-row-between"><strong>${boss.defeated ? "0" : rem}</strong><span class="ck-muted">/ ${energy} Energie</span></div>
          <div class="ck-goalbar"><b style="width:${pct.toFixed(1)}%"></b></div>
        </div>
        ${hits ? `<ul class="ck-boss-hits">${hits}</ul>` : ""}
        ${boss.weakLabel ? `<p class="ck-small">Schwachstelle: <strong>${esc(boss.weakLabel)}</strong></p>` : ""}
        <p class="ck-tiny ck-amber">Selbst ‚sicher‘ drücken trifft nicht.</p>
        ${loot ? `<div class="ck-boss-loot"><p class="ck-small"><strong>Beute</strong></p><ul>${loot}</ul></div>` : ""}
        ${
          boss.defeated
            ? `<p class="ck-win">Boss besiegt – Beute freigeschaltet.</p>`
            : `<div class="ck-acts"><button type="button" class="ck-btn ck-btn-hot" data-ck-boss-win ${ck.busy ? "disabled" : ""}>Sieg geben</button></div>`
        }
      </div>`;
  }

  function respectWertDisplay(s) {
    if (s.status === "keine_daten" || s.wert == null) return "–";
    const einheit = s.einheit || "";
    if (einheit === "%") return `${s.wert} %`;
    if (einheit === "Lerntage") return `${s.wert} / ${s.ziel} Lerntage`;
    if (einheit === "Hilfen") return `${s.wert} / ${s.ziel} Hilfen`;
    if (s.text && /\/|%|Hilfen|Lerntage/.test(s.text) && !/^Ziel\b/i.test(s.text)) return s.text;
    return String(s.wert);
  }

  function respectSubDisplay(s) {
    if (s.status === "keine_daten") return s.text || "";
    if (s.einheit === "%") {
      if (s.ziel != null) return `Ziel ${s.ziel} %`;
      if (s.text && /^Ziel\b/i.test(s.text)) return s.text;
    }
    if (s.einheit === "Lerntage" || s.einheit === "Hilfen") return "";
    if (s.text && /^Ziel\b/i.test(s.text)) return s.text;
    return "";
  }

  function renderRespectPanel() {
    const stars = season()?.respect || [];
    const filled = Number(season()?.starsFilledCount) || stars.filter((s) => s.status === "erreicht").length;
    return `
      <div class="ck-panel ck-respect-panel ck-respect-panel--compact">
        <h2><span>Respekt diese Woche</span><span class="td-kicker">${filled} / 5</span></h2>
        <div class="ck-respect-list">
          ${
            stars
              .map((s) => {
                const status = s.status || (s.filled ? "erreicht" : "offen");
                const wert = respectWertDisplay(s);
                const sub = respectSubDisplay(s);
                const starClass =
                  status === "erreicht"
                    ? "ck-star--on"
                    : status === "keine_daten"
                      ? "ck-star--dashed"
                      : "ck-star--empty";
                return `<div class="ck-respect-row is-${esc(status)}">
                  <span class="ck-star ck-star--compact ${starClass}" aria-hidden="true">★</span>
                  <div class="ck-respect-row__mid"><strong>${esc(s.label)}</strong></div>
                  <div class="ck-respect-row__val">
                    <span class="ck-respect-wert">${esc(wert)}</span>
                    ${sub ? `<span class="ck-respect-sub">${esc(sub)}</span>` : ""}
                  </div>
                </div>`;
              })
              .join("") || `<p class="ck-muted ck-small">Noch keine Respekt-Daten.</p>`
          }
        </div>
      </div>`;
  }

  function renderSeasonBarPanel() {
    const bar = season()?.seasonBar || {};
    const markers = Array.isArray(bar.markers) ? bar.markers : [];
    const tiers = markers.length
      ? markers
      : (season()?.config?.seasonTiers || []).map((t, i) => ({
          xp: t.xp,
          label: t.label,
          state: i < (bar.filledCount || 0) ? "erreicht" : i === (bar.filledCount || 0) ? "naechste" : "spaeter",
          remaining: bar.next && bar.next.xp === t.xp ? bar.remaining : undefined
        }));
    const xp = Number(bar.currentXp ?? bar.xp) || 0;
    const fillRatio = Math.max(0, Math.min(1, Number(bar.fillRatio) || 0));
    const lastXp = tiers.length ? Number(tiers[tiers.length - 1].xp) || 1 : 1;
    const title =
      bar.title || (bar.xpSource === "einheit" || bar.titleKey === "einheit" ? "Season-XP" : "Klassen-XP");
    const markerHtml = tiers
      .map((t) => {
        const left = Math.max(0, Math.min(100, (Number(t.xp) / lastXp) * 100));
        return `<span class="ck-season-mark is-${esc(t.state || "spaeter")}" style="left:${left}%" title="${esc(t.label)} · ${num(t.xp)} XP"></span>`;
      })
      .join("");
    const cards = tiers
      .map((t) => {
        const state = t.state || "spaeter";
        const label = t.label || "";
        let detail;
        if (state === "erreicht") detail = `${esc(label)} ✓`;
        else if (state === "naechste") {
          const rem = t.remaining != null ? t.remaining : Math.max(0, t.xp - xp);
          detail = `${esc(label)} · noch ${num(rem)} XP`;
        } else detail = esc(label);
        return `<div class="ck-season-tier is-${esc(state)}" role="listitem">
          <strong>${num(t.xp)}</strong>
          <span>${detail}</span>
        </div>`;
      })
      .join("");
    return `
      <div class="ck-panel ck-season-panel">
        <h2><span>${esc(title)}</span><span class="td-kicker">${num(xp)} XP</span></h2>
        <div class="ck-season-bar" aria-label="${esc(title)} ${num(xp)} XP">
          <div class="ck-season-bar__xp" style="left:${(fillRatio * 100).toFixed(2)}%">
            <em>${num(xp)} XP</em>
            <i></i>
          </div>
          <div class="ck-season-bar__track">
            <div class="ck-season-bar__fill" style="width:${(fillRatio * 100).toFixed(2)}%"></div>
            ${markerHtml}
          </div>
        </div>
        <div class="ck-season-track" role="list">${cards}</div>
      </div>`;
  }

  function enrichHighlightEntry(entry) {
    const id = entry?.id != null ? Number(entry.id) : null;
    const roster = id != null ? studentByRosterId(id) : null;
    return {
      id,
      name: roster?.shortName || entry?.name || roster?.name || "",
      fullName: roster?.name || entry?.fullName || entry?.name || "",
      avatarUrl: roster?.avatarUrl || entry?.avatarUrl || null
    };
  }

  function renderHighlightsPanel() {
    const hl = season()?.highlights || {};
    const keys = Object.keys(HIGHLIGHT_LABELS);
    const showNames = namesOnBeamer();
    const cards = keys
      .map((key) => {
        const list = (Array.isArray(hl[key]) ? hl[key] : []).map(enrichHighlightEntry);
        if (!list.length) return "";
        const label = HIGHLIGHT_LABELS[key];
        const chips = list
          .map((p) => {
            const name = showNames
              ? `<span class="ck-hl-chip__name">${esc(p.name || p.fullName || "Jemand")}</span>`
              : "";
            return `<span class="ck-hl-chip">${avatarMarkup(p, "ck-av--sm")}${name}</span>`;
          })
          .join("");
        return `<article class="ck-hl-card"><h3>${esc(label)}</h3><div class="ck-hl-chips">${chips}</div></article>`;
      })
      .filter(Boolean)
      .join("");
    const body = cards
      ? `<div class="ck-hl-grid">${cards}</div>`
      : `<p class="ck-body ck-muted">Die ersten Highlights kommen mit dem ersten Tagesziel.</p>`;
    return `
      <div class="ck-panel ck-highlights-panel">
        <h2><span>Highlights heute</span><span class="td-kicker">positiv</span></h2>
        ${body}
      </div>`;
  }

  function presenceStatus(student) {
    if (student?.reflectedToday) return "done";
    if (student?.plannedToday) return "goal";
    return "none";
  }

  function presenceList() {
    const list = (ck.data?.students || []).filter((s) => !s.absent && !s.absentToday);
    return [...list].sort((a, b) =>
      String(a.shortName || a.name || "").localeCompare(String(b.shortName || b.name || ""), "de")
    );
  }

  function notePresenceFromData() {
    const list = presenceList();
    const prev = ck.prevPresence || {};
    const next = {};
    const now = Date.now();
    if (!ck.presencePopUntil) ck.presencePopUntil = {};
    for (const s of list) {
      const id = Number(s.id);
      const st = presenceStatus(s);
      next[id] = st;
      if (ck.prevPresence != null && prev[id] != null && prev[id] !== st) {
        ck.presencePopUntil[id] = now + 600;
      }
    }
    ck.prevPresence = next;
  }

  function isPresencePop(id) {
    const until = ck.presencePopUntil?.[Number(id)];
    return until != null && Date.now() < until;
  }

  function fmtClockTime(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  }

  function teacherPresenceTooltip(student) {
    const detail = students().find((s) => Number(s.id) === Number(student.id));
    const today = detail?.today;
    if (!today) return "noch kein Tagesziel";
    const g = today.goalId ? goalById(today.goalId) : null;
    const goalBit = g
      ? `Mission ${g.number}: ${clip(g.text || "", 48)}`
      : "Freies Tagesziel";
    const timeBit = fmtClockTime(today.at);
    return [goalBit, timeBit].filter(Boolean).join(" · ");
  }

  function renderAvatarWall({ teacherTooltips = false } = {}) {
    const list = presenceList();
    const counts = { none: 0, goal: 0, done: 0 };
    for (const s of list) counts[presenceStatus(s)] += 1;
    const showNames = namesOnBeamer();
    const cells = list
      .map((s) => {
        const st = presenceStatus(s);
        const pop = isPresencePop(s.id) ? " ck-av--pop" : "";
        const title = teacherTooltips ? esc(teacherPresenceTooltip(s)) : "";
        const badge =
          st === "done"
            ? `<span class="ck-av-badge ck-av-badge--done" aria-hidden="true">✓</span>`
            : st === "goal"
              ? `<span class="ck-av-badge ck-av-badge--goal">Ziel</span>`
              : "";
        const name = showNames
          ? `<span class="ck-av-name">${esc(clip(s.shortName || s.name || "", 14))}</span>`
          : "";
        return `<div class="ck-av-cell ck-av-cell--${st}${pop}"${title ? ` title="${title}"` : ""}>
          <div class="ck-av-ring">${avatarMarkup(s, "ck-av--wall")}${badge}</div>
          ${name}
        </div>`;
      })
      .join("");
    return `
      <section class="ck-panel ck-avatar-wall" aria-label="Wer ist dabei?">
        <div class="ck-av-wall-head">
          <h2><span>Wer ist dabei?</span></h2>
          <div class="ck-av-counts" aria-label="Zähler">
            <span><i class="ck-av-dot ck-av-dot--goal" aria-hidden="true"></i>${counts.goal} Ziel gesetzt</span>
            <span><i class="ck-av-dot ck-av-dot--done" aria-hidden="true">✓</i>${counts.done} abgeschlossen</span>
            <span><i class="ck-av-dot ck-av-dot--none" aria-hidden="true"></i>${counts.none} noch ohne Ziel</span>
          </div>
        </div>
        <div class="ck-av-grid">${cells || `<p class="ck-muted ck-body">Keine Schüler:innen in der Klasse.</p>`}</div>
      </section>`;
  }

  function renderBeamerViewA() {
    return `
      <div class="ck-beamer-view ck-beamer-view--a" data-view="A">
        ${renderKpis()}
        <div class="ck-beamer-ab">
          ${renderSeasonMap(false)}
          ${renderBossPanel(false)}
        </div>
      </div>`;
  }

  function tickerItemText(item) {
    if (!item) return "";
    if (!namesOnBeamer()) return item.textAnon || item.text || "";
    return item.text || "";
  }

  function renderTickerStrip() {
    const items = season()?.ticker || [];
    if (!items.length) return "";
    const show = items.slice(0, 3);
    // Rotate window among set every tickerSeconds if more than 3
    if (items.length > 3) {
      const sec = Number(season()?.config?.tickerSeconds) || 20;
      const now = Date.now();
      if (!ck.tickerShownAt || now - ck.tickerShownAt >= sec * 1000) {
        if (ck.tickerShownAt) ck.tickerIdx = (ck.tickerIdx + 1) % items.length;
        ck.tickerShownAt = now;
      }
      const start = ck.tickerIdx % items.length;
      const rotated = [];
      for (let i = 0; i < 3; i += 1) rotated.push(items[(start + i) % items.length]);
      show.length = 0;
      show.push(...rotated);
    }
    const typColor = {
      tagesziel_gesetzt: "cyan",
      tagesziel_geschafft: "green",
      reflexion: "violet",
      level_bestaetigt: "amber",
      hilfe_erledigt: "pink",
      boss_besiegt: "orange",
      side_quest_done: "green",
      ziehung: "amber",
      serie: "cyan",
      crew_tag: "violet"
    };
    return `<div class="ck-ticker" aria-live="polite">
      ${show
        .map((item) => {
          const color = typColor[item.typ] || "cyan";
          return `<span class="ck-ticker-item"><i class="ck-ticker-dot ck-ticker-dot--${color}"></i><span class="ck-ticker-text">${esc(tickerItemText(item))}</span></span>`;
        })
        .join("")}
    </div>`;
  }

  function renderSideQuestCard() {
    const q = season()?.sideQuest;
    if (!q) {
      return `
        <div class="ck-panel ck-sidequest ck-sidequest--empty">
          <h2><span>Side Quest</span><span class="td-kicker">heute</span></h2>
          <p class="ck-sidequest-text">Heute keine Side Quest</p>
        </div>`;
    }
    const pct = q.ziel ? Math.min(100, Math.round((q.progress / q.ziel) * 100)) : 0;
    return `
      <div class="ck-panel ck-sidequest ${q.done ? "is-done" : ""}">
        <h2><span>Side Quest</span><span class="td-kicker">${q.done ? "geschafft" : "heute"}</span></h2>
        <p class="ck-sidequest-text">${esc(q.text)}</p>
        <div class="ck-goalbar ck-goalbar--sq"><b style="width:${pct}%"></b></div>
        <div class="ck-sidequest-stats">
          <span class="ck-hero ck-sidequest-wert">${q.progress} / ${q.ziel}</span>
          ${q.xp ? `<span class="ck-sidequest-xp">+${q.xp} XP</span>` : ""}
        </div>
      </div>`;
  }

  function renderCrewProgressChips() {
    const crews = season()?.crews || [];
    if (!crews.length) return "";
    return `
      <div class="ck-crew-chips" aria-label="Crew-Fortschritt">
        ${crews
          .map(
            (c) =>
              `<span class="ck-crew-chip" style="--ck-crew:${esc(c.color || "#22d3ee")}"><strong>${esc(c.name || "Crew")}</strong> ${esc(c.label || "0/0")}</span>`
          )
          .join("")}
      </div>`;
  }

  function renderCrewDrawShow() {
    const show = ck.crewDrawShow;
    if (!show?.crews?.length) return "";
    const step = Number(show.step) || 0.35;
    let delay = 0;
    const buckets = show.crews
      .map((c) => {
        const chips = (c.members || [])
          .map((n) => {
            const d = delay;
            delay += step;
            return `<span class="ck-draw-chip" style="animation-delay:${d.toFixed(2)}s">${esc(n)}</span>`;
          })
          .join("");
        return `<div class="ck-draw-bucket" style="--ck-crew:${esc(c.color || "#22d3ee")}">
          <strong>${esc(c.name || "Crew")}</strong>
          <div class="ck-draw-bucket__slots">${chips}</div>
        </div>`;
      })
      .join("");
    return `<div class="ck-draw-show" aria-hidden="true">${buckets}</div>`;
  }

  function renderBeamerViewB() {
    const ticker = renderTickerStrip();
    return `
      <div class="ck-beamer-view ck-beamer-view--b ${ticker ? "has-ticker" : ""}" data-view="B">
        ${renderAvatarWall({ teacherTooltips: false })}
        <div class="ck-beamer-b-mid">
          ${renderRespectPanel()}
          ${renderSideQuestCard()}
        </div>
        ${ticker}
      </div>`;
  }

  function renderBeamerViewC() {
    return `
      <div class="ck-beamer-view ck-beamer-view--c" data-view="C">
        ${renderHighlightsPanel()}
        ${renderRaffleCard()}
        ${renderSeasonBarPanel()}
        ${renderCrewProgressChips()}
        ${renderCrewDrawShow()}
      </div>`;
  }

  function renderBeamerWall() {
    const view =
      ck.beamerView === "B"
        ? renderBeamerViewB()
        : ck.beamerView === "C"
          ? renderBeamerViewC()
          : renderBeamerViewA();
    return `<div class="ck-wall ck-wall--season">${view}</div>`;
  }

  function renderTeacherMapBoss() {
    if (!season()?.map && !season()?.boss) return "";
    return `
      <section class="ck-teacher-season" aria-label="Season kompakt">
        <div class="ck-beamer-ab ck-beamer-ab--teacher">
          ${renderSeasonMap(true)}
          ${renderBossPanel(true)}
        </div>
      </section>`;
  }

  /* ---------- Schublade ---------- */

  function renderDrawer() {
    if (ck.beamer || ck.drawerId == null) return "";
    const s = studentById(ck.drawerId);
    if (!s) return "";
    const d = ck.data;
    const base = (d.students || []).find((x) => Number(x.id) === Number(s.id)) || {};
    const live = liveData();
    const help = live.help.find((h) => Number(h.studentId) === Number(s.id));
    const visit = live.visit.find((v) => Number(v.studentId) === Number(s.id));
    const over = (d.training?.over || []).find((o) => Number(o.studentId) === Number(s.id));
    const idle = idleMap().get(Number(s.id));
    const { displayTiers, stagesEnabled, markTiers } = levels();
    const st = (v) => (v === "sicher" ? "✔" : v === "in_arbeit" ? "…" : "·");
    const tierColors = {
      unterthema: "#6ee7b7",
      rookie: "#67e8f9",
      operator: "#c4b5fd",
      street_legend: "#f9a8d4"
    };
    const rows = goals()
      .map((g, i) => {
        const mk = s.marks?.[g.id] || displayTiers.map(() => "offen");
        const tr = s.training?.[g.id];
        const cells = displayTiers
          .map((tier, ti) => {
            const markIdx = ti;
            const trainIdx = stagesEnabled ? markTiers.indexOf(tier) : -1;
            const trainBit =
              trainIdx >= 0 && tr?.solved?.[trainIdx] ? ` ${Math.min(tr.solved[trainIdx], 6)}/6` : "";
            return `<td style="color:${tierColors[tier] || "#e2e8f0"}">${st(mk[markIdx])}${trainBit}</td>`;
          })
          .join("");
        return `<tr class="${i === s.current && !s.allDone ? "ck-row-now" : ""}"><td>${g.number} · ${esc(clip(g.text, 24))}</td>
          ${cells}
          <td class="ck-muted">${tr?.updated ? (tr.updated === d.date ? "heute" : `vor ${daysBetween(tr.updated, d.date)} T.`) : "–"}</td></tr>`;
      })
      .join("");
    const today = s.today;
    const todayLevel =
      today?.level && (stagesEnabled ? TIERS.includes(today.level) : true)
        ? ` auf ${esc(TIER_LABEL[today.level] || today.level)}`
        : "";
    const todayText = today
      ? `${today.goalId ? `${esc(missionLabel(today.goalId))} „${esc(clip(goalById(today.goalId)?.text || "", 40))}“` : "Freies Tagesziel"}${todayLevel}${today.confidence != null ? ` · Sicherheitsgefühl ${today.confidence}/5` : ""}${today.reflected ? " · Tag abgeschlossen" : ""}`
      : "noch kein Tagesziel in diesem Fach";
    const notes = [];
    if (help) notes.push(`<div class="ck-note ck-note--help"><strong>Hilfe angefragt</strong>${help.waitMinutes != null ? ` seit ${help.waitMinutes} min` : ""}${help.concern ? `: „${esc(help.concern)}“` : ""}</div>`);
    if (visit) notes.push(`<div class="ck-note"><strong>Mal vorbeischauen:</strong> ${(visit.reasons || []).map((r) => esc(r.label)).join(" · ")}</div>`);
    if (stagesEnabled && over) {
      const item = over.items[0];
      const g = goalById(item.goalId);
      notes.push(`<div class="ck-note"><strong>Selbstbild:</strong> sagt im Training bei Mission ${g ? g.number : "?"} (${esc(TIER_LABEL[item.tier])}) „ich kann das“, hat aber erst ${item.solved} von 6 Aufgaben gelöst. Impuls: „Zeig mir eine Aufgabe, bei der du sicher bist.“</div>`);
    }
    if (stagesEnabled && idle) {
      const g = goalById(idle.goalId);
      notes.push(`<div class="ck-note"><strong>Liegen geblieben:</strong> Mission ${g ? g.number : "?"} (${esc(TIER_LABEL[idle.tier])}) seit ${idle.days} Tagen ohne neuen Trainingsstand.</div>`);
    }
    if (!notes.length) notes.push(`<div class="ck-note ck-note--good"><strong>Läuft.</strong> Kein Hinweis mit genug Belegen.</div>`);
    const headCols = displayTiers
      .map((tier) => `<th>${esc(tier === "street_legend" ? "Street L." : TIER_LABEL[tier] || tier)}</th>`)
      .join("");
    return `
      <div class="ck-drawer-layer" role="dialog" aria-modal="true" aria-label="Schüler:in">
        <button type="button" class="ck-drawer-backdrop" data-ck-close aria-label="Schließen"></button>
        <aside class="ck-drawer">
          <header class="ck-drawer-head">
            <div>
              <p class="td-kicker">${esc(d.class?.name || "")} · ${esc(d.levelCheck?.subject || "")} · ${esc(d.levelCheck?.name || "")}</p>
              <h3>${esc(s.name)}</h3>
            </div>
            <button type="button" class="ck-drawer-x" data-ck-close aria-label="Schließen" title="Schließen (Esc)">×</button>
          </header>
          <p class="ck-small ck-muted">Zielnote ${esc(s.targetGrade ? s.targetGrade.replace(".", ",") : "–")} · <span class="ck-pace ck-pace--${esc(s.pace)}">${esc(s.paceText)}</span>${d.unit?.target ? ` bis ${esc(d.unit.target.label)}` : ""}</p>
          <p class="ck-small ck-muted">Rang ${esc(base.rang || "–")} · ${num(base.xp)} XP</p>
          <div class="ck-note ck-note--good"><strong>Heute:</strong> ${todayText}</div>
          ${notes.join("")}
          <table><thead><tr><th>Mission</th>${headCols}<th>Training</th></tr></thead><tbody>${rows}</tbody></table>
          <p class="ck-small ck-muted">✔ sicher · … in Arbeit · · offen.${stagesEnabled ? " Zahlen = gelöste Aufgaben im Trainingscenter (sicher ab 6)." : ""}</p>
          <div class="ck-acts">
            <button type="button" class="ck-btn ck-btn-go ck-btn-sm" data-open-student="${esc(s.id)}">Profil öffnen</button>
            <button type="button" class="ck-btn ck-btn-sm" data-ck-close>Schließen</button>
          </div>
        </aside>
      </div>`;
  }

  /* ---------- Gesamt ---------- */

  function render() {
    if (!ck.active || !ck.el) return;
    document.body.classList.toggle("ck-beamer", ck.beamer);
    syncPresentationClasses();
    const toast = ck.toast || ck.ctx?.toast || "";
    const toastHtml = toast ? `<p class="td-toast" role="status">${esc(toast)}</p>` : "";
    const chrome = renderControls({ asChrome: true });
    const dots = renderPresentationDots();
    if (!ck.data) {
      ck.el.innerHTML = `<div class="ck">${toastHtml}<div class="td-panel td-empty"><strong>${ck.error ? esc(ck.error) : "Lade das Cockpit …"}</strong></div>${dots}${chrome}</div>`;
      return;
    }
    const d = ck.data;
    const error = ck.error ? `<p class="td-toast" role="alert">${esc(ck.error)} Es werden die zuletzt geladenen Daten gezeigt.</p>` : "";
    if (!d.levelCheck) {
      if (ck.beamer) {
        ck.el.innerHTML = `
          <div class="ck ck--beamer">
            ${toastHtml}${error}
            ${renderHead()}
            ${renderControls()}
            <div class="td-panel td-empty"><strong>${esc(d.message || "Keine Unterrichtseinheit.")}</strong></div>
            ${dots}${chrome}
          </div>`;
        return;
      }
      ck.el.innerHTML = `<div class="ck">${toastHtml}${error}${renderHead()}${renderControls()}
        <div class="td-panel td-empty"><strong>${esc(d.message || "Keine Unterrichtseinheit.")}</strong></div>
        ${renderGame()}${dots}${chrome}</div>`;
      return;
    }
    if (ck.beamer) {
      ck.el.innerHTML = `
        <div class="ck ck--beamer">
          ${toastHtml}${error}
          ${renderHead()}
          ${renderControls()}
          ${renderBeamerWall()}
          ${dots}${chrome}
        </div>`;
      return;
    }
    ck.el.innerHTML = `
      <div class="ck">
        ${toastHtml}${error}
        ${renderHead()}
        ${renderControls()}
        ${renderKpis()}
        <section class="ck-grid">
          ${renderLeft()}
          ${renderCenter()}
          ${renderRight()}
        </section>
        ${renderTeacherMapBoss()}
        <section class="ck-teacher-wall" aria-label="Anwesenheit heute">
          ${renderAvatarWall({ teacherTooltips: true })}
        </section>
        ${renderGame()}
        <section class="ck-bottom">
          ${renderPulse()}${renderTimeline()}
        </section>
        <details class="ck-fold ck-fold--wide" ${ck.moreOpen ? "open" : ""} data-ck-more>
          <summary>Die letzten Stunden</summary>
          ${renderRecent()}
        </details>
        ${renderDrawer()}
        ${renderHelpModal()}
        ${dots}${chrome}
      </div>`;
  }

  /* ---------- Bedienung ---------- */

  function flash(message) {
    ck.toast = message;
    render();
    setTimeout(() => {
      if (ck.toast === message) {
        ck.toast = "";
        render();
      }
    }, 5000);
  }

  async function runRaffle(opts = {}) {
    const auto = opts.auto === true;
    const r = ck.data?.game?.raffle;
    if (!r || r.drawn || ck.busy) return;
    if (!auto) {
      if (
        !window.confirm(
          `Glücks-Ziehung starten? Im Lostopf: ${r.eligibleCount}. Gewinn: ${ck.raffleXp} XP. Es gibt eine Ziehung pro Tag.`
        )
      ) {
        return;
      }
    } else if (!(Number(r.eligibleCount) > 0)) {
      return;
    }
    const doneKey = raffleAutoKey();
    ck.busy = true;
    ck.reveal = "rolling";
    const pool = ticketAvatarPool();
    ck.raffleSpinIdx = 0;
    ck.raffleSpinPool = pool;
    render();
    startRaffleSpin(pool);
    try {
      const [res] = await Promise.all([
        post("/api/teacher/cockpit/raffle", { classId: ck.classId, xp: ck.raffleXp, auto }),
        new Promise((resolve) => setTimeout(resolve, auto ? 2600 : 2400))
      ]);
      stopRaffleSpin();
      if (doneKey) ck.autoRaffleDoneKey = doneKey;
      ck.reveal = "show";
      await load(false);
      flash(res.message || "Gezogen.");
    } catch (err) {
      stopRaffleSpin();
      ck.reveal = null;
      const msg = err.message || "Die Ziehung hat nicht geklappt.";
      if (auto && /schon gezogen/i.test(msg) && doneKey) {
        ck.autoRaffleDoneKey = doneKey;
        await load(false);
      } else if (!auto || !/Lostopf|niemand/i.test(msg)) {
        flash(msg);
      }
    } finally {
      stopRaffleSpin();
      ck.busy = false;
      setTimeout(() => {
        ck.reveal = null;
      }, 2500);
      render();
    }
  }

  async function confirmTeam(rosterId) {
    const team = (ck.data?.teams || []).find((t) => String(t.rosterId) === String(rosterId));
    if (!team || ck.busy) return;
    const who = (team.members || []).map((m) => m.name).filter(Boolean).join(", ");
    const note = team.goalReached
      ? "Das Teamziel ist erreicht."
      : `Das Teamziel ist noch nicht erreicht (${team.reflectedCount} von ${team.memberCount}).`;
    if (!window.confirm(`${team.name}${who ? ` (${who})` : ""} als Team des Tages bestätigen? ${note} Jedes Mitglied bekommt ${ck.teamXp} XP. Es gibt ein Team des Tages pro Tag.`)) return;
    ck.busy = true;
    render();
    try {
      const res = await post("/api/teacher/cockpit/team-award", { classId: ck.classId, rosterId, xp: ck.teamXp });
      await load(false);
      flash(res.message || "Bestätigt.");
    } catch (err) {
      flash(err.message || "Das hat nicht geklappt.");
    } finally {
      ck.busy = false;
      render();
    }
  }

  async function missionAction(kind, button) {
    if (kind === "new") {
      const target = ck.data?.unit?.target;
      const firstTwo = goals()
        .slice(0, Math.min(2, goals().length))
        .map((g) => String(g.id));
      ck.form = {
        goalIds: firstTwo,
        tier: levels().missionTiers[0] || "rookie",
        dueDate: target?.date || "",
        title: "",
        lootXp: "",
        lootText: ""
      };
      render();
      return;
    }
    if (kind === "cancel") {
      ck.form = null;
      render();
      return;
    }
    if (kind === "close") {
      if (!window.confirm("Klassen-Mission beenden? Der Stand bleibt sichtbar, bis du eine neue anlegst.")) return;
      try {
        const res = await post(`/api/teacher/cockpit/class-mission/${encodeURIComponent(button.getAttribute("data-id"))}/close`, {});
        await load(false);
        flash(res.message || "Beendet.");
      } catch (err) {
        flash(err.message || "Das hat nicht geklappt.");
      }
      return;
    }
    if (kind === "save" && ck.form) {
      if (!ck.form.goalIds.length) {
        flash("Bitte mindestens eine Mission wählen.");
        return;
      }
      ck.busy = true;
      render();
      try {
        const res = await post("/api/teacher/cockpit/class-mission", {
          classId: ck.classId,
          levelCheckId: ck.data.levelCheck.id,
          goalIds: ck.form.goalIds,
          tier: ck.form.tier,
          dueDate: ck.form.dueDate || null,
          title: ck.form.title || "",
          lootXp: ck.form.lootXp === "" || ck.form.lootXp == null ? null : Number(ck.form.lootXp),
          lootText: ck.form.lootText || ""
        });
        ck.form = null;
        await load(false);
        flash(res.message || "Gestartet.");
      } catch (err) {
        flash(err.message || "Das hat nicht geklappt.");
      } finally {
        ck.busy = false;
        render();
      }
    }
  }

  async function loadCrewsDraft() {
    const seasonKey = season()?.seasonKey || ck.data?.levelCheck?.id || `class-${ck.classId}`;
    const data = await ck.ctx.api(
      `/api/teacher/cockpit/crews?classId=${encodeURIComponent(ck.classId)}&seasonKey=${encodeURIComponent(seasonKey)}`
    );
    ck.crewsDraft = data;
    return data;
  }

  async function crewsAction(kind) {
    const seasonKey = season()?.seasonKey || ck.data?.levelCheck?.id || `class-${ck.classId}`;
    if (kind === "open") {
      ck.crewsOpen = true;
      ck.crewsBusy = true;
      render();
      try {
        await loadCrewsDraft();
      } catch (err) {
        flash(err.message || "Crews laden fehlgeschlagen.");
      } finally {
        ck.crewsBusy = false;
        render();
      }
      return;
    }
    if (kind === "close") {
      ck.crewsOpen = false;
      render();
      return;
    }
    if (kind === "avoid-add") {
      const a = Number(ck.el.querySelector("[data-ck-avoid-a]")?.value);
      const b = Number(ck.el.querySelector("[data-ck-avoid-b]")?.value);
      if (!a || !b || a === b) {
        flash("Zwei verschiedene Schüler:innen wählen.");
        return;
      }
      ck.crewsBusy = true;
      render();
      try {
        const res = await post("/api/teacher/cockpit/crews/avoid", {
          classId: ck.classId,
          studentA: a,
          studentB: b
        });
        if (ck.crewsDraft) ck.crewsDraft.avoidPairs = res.avoidPairs || [];
        else await loadCrewsDraft();
        flash(res.message || "Paar gespeichert.");
      } catch (err) {
        flash(err.message || "Paar speichern fehlgeschlagen.");
      } finally {
        ck.crewsBusy = false;
        render();
      }
      return;
    }
    if (kind === "draw") {
      ck.crewsBusy = true;
      render();
      try {
        const res = await post("/api/teacher/cockpit/crews/draw", {
          classId: ck.classId,
          seasonKey
        });
        ck.crewsDraft = {
          crews: res.crews,
          seasonKey,
          avoidPairs: ck.crewsDraft?.avoidPairs || []
        };
        const drawCrews = (res.crews || []).map((c) => ({
          id: c.id,
          name: c.name,
          color: c.color,
          members: (c.members || []).map((m) => m.shortName || m.name)
        }));
        const total = drawCrews.reduce((n, c) => n + (c.members?.length || 0), 0);
        const step = total > 0 ? Math.min(0.45, 5.2 / total) : 0.35;
        ck.crewDrawShow = { crews: drawCrews, step };
        setTimeout(() => {
          ck.crewDrawShow = null;
          render();
        }, 6000);
        flash(res.message || "Ausgelost.");
        await load(false);
      } catch (err) {
        flash(err.message || "Auslosen fehlgeschlagen.");
      } finally {
        ck.crewsBusy = false;
        render();
      }
      return;
    }
    if (kind === "release") {
      if (!window.confirm("Crews freigeben? Danach kein Tauschen mehr.")) return;
      ck.crewsBusy = true;
      render();
      try {
        const res = await post("/api/teacher/cockpit/crews/release", {
          classId: ck.classId,
          seasonKey
        });
        ck.crewsDraft = {
          crews: res.crews,
          seasonKey,
          avoidPairs: ck.crewsDraft?.avoidPairs || []
        };
        flash(res.message || "Freigegeben.");
        await load(false);
      } catch (err) {
        flash(err.message || "Freigabe fehlgeschlagen.");
      } finally {
        ck.crewsBusy = false;
        render();
      }
    }
  }

  async function saveCrewMeta(crewId) {
    const name = ck.el.querySelector(`[data-ck-crew-name="${crewId}"]`)?.value;
    const color = ck.el.querySelector(`[data-ck-crew-color="${crewId}"]`)?.value;
    const tagText = ck.el.querySelector(`[data-ck-crew-tag="${crewId}"]`)?.value;
    try {
      await ck.ctx.api(`/api/teacher/cockpit/crews/${encodeURIComponent(crewId)}`, {
        method: "PUT",
        body: JSON.stringify({ name, color, tagText })
      });
      await loadCrewsDraft();
      flash("Crew gespeichert.");
      render();
    } catch (err) {
      flash(err.message || "Speichern fehlgeschlagen.");
    }
  }

  async function swapIntoCrew(toCrewId, studentId) {
    if (!studentId) return;
    try {
      const res = await post("/api/teacher/cockpit/crews/swap", {
        classId: ck.classId,
        toCrewId,
        studentId: Number(studentId)
      });
      ck.crewsDraft = { crews: res.crews, seasonKey: season()?.seasonKey };
      flash(res.message || "Getauscht.");
      render();
    } catch (err) {
      flash(err.message || "Tauschen fehlgeschlagen.");
    }
  }

  async function setSideQuest(templateId) {
    ck.busy = true;
    render();
    try {
      const res = await post("/api/teacher/cockpit/side-quests", {
        classId: ck.classId,
        templateId
      });
      flash(res.message || "Side Quest gesetzt.");
      await load(false);
    } catch (err) {
      flash(err.message || "Side Quest fehlgeschlagen.");
    } finally {
      ck.busy = false;
      render();
    }
  }

  async function finishHelpWithKind(kind) {
    const m = ck.helpModal;
    if (!m || !window.SolHelpAttribution) return;
    let helpedByStudentId = null;
    if (kind === "peer") {
      helpedByStudentId = Number(ck.el.querySelector("[data-ck-help-peer]")?.value);
      if (!helpedByStudentId) {
        flash("Bitte Mitschüler:in wählen.");
        return;
      }
    }
    ck.busy = true;
    render();
    try {
      await window.SolHelpAttribution.closeWithAttribution(ck.ctx.api, {
        classId: ck.classId,
        studentId: m.studentId,
        date: ck.data?.date || ck.live?.date,
        entryId: m.entryId || null,
        goalId: m.goalId || null,
        kind,
        helpedByStudentId
      });
      ck.helpModal = null;
      flash("Hilfe abgeschlossen.");
      await load(false);
    } catch (err) {
      flash(err.message || "Hilfe speichern fehlgeschlagen.");
    } finally {
      ck.busy = false;
      render();
    }
  }

  function onClick(event) {
    if (!ck.active) return;
    const t = event.target;
    const coachClose = t.closest('[data-coach="close_help"]');
    if (coachClose && !ck.beamer) {
      event.preventDefault();
      event.stopPropagation();
      const studentId = Number(coachClose.getAttribute("data-student"));
      const st = (ck.data?.students || []).find((s) => Number(s.id) === studentId);
      ck.helpModal = {
        studentId,
        studentName: st?.shortName || st?.name || "",
        entryId: coachClose.getAttribute("data-entry") || "",
        goalId: coachClose.getAttribute("data-goal") || ""
      };
      render();
      return;
    }
    const helpKind = t.closest("[data-ck-help-kind]");
    if (helpKind) {
      finishHelpWithKind(helpKind.getAttribute("data-ck-help-kind"));
      return;
    }
    if (t.closest("[data-ck-help-cancel]")) {
      ck.helpModal = null;
      render();
      return;
    }
    const crewsBtn = t.closest("[data-ck-crews]");
    if (crewsBtn) {
      crewsAction(crewsBtn.getAttribute("data-ck-crews"));
      return;
    }
    const crewSave = t.closest("[data-ck-crew-save]");
    if (crewSave) {
      saveCrewMeta(crewSave.getAttribute("data-ck-crew-save"));
      return;
    }
    const sq = t.closest("[data-ck-sq]");
    if (sq) {
      const kind = sq.getAttribute("data-ck-sq");
      if (kind === "set") {
        ck.sqRepick = false;
        setSideQuest(sq.getAttribute("data-id"));
      } else if (kind === "pick") {
        ck.sqRepick = true;
        render();
      } else if (kind === "cancel-pick") {
        ck.sqRepick = false;
        render();
      }
      return;
    }
    const view = t.closest("[data-ck-view]");
    if (view) {
      ck.view = view.getAttribute("data-ck-view");
      render();
      return;
    }
    const beamerBtn = t.closest("[data-ck-beamer]");
    if (beamerBtn) {
      const mode = beamerBtn.getAttribute("data-mode");
      const next = mode === "teacher" ? false : mode === "beamer" ? true : !ck.beamer;
      ck.beamer = next;
      ck.drawerId = null;
      ck.chromeVisible = false;
      if (ck.chromeHideTimer) {
        clearTimeout(ck.chromeHideTimer);
        ck.chromeHideTimer = null;
      }
      if (!ck.beamer) ck.beamerPaused = false;
      restartTimer();
      if (ck.beamer && !document.hidden) load(true);
      else render();
      return;
    }
    if (t.closest("[data-ck-fullscreen]")) {
      toggleFullscreen();
      return;
    }
    if (t.closest("[data-ck-names]")) {
      ck.showNamesOnBeamer = !namesOnBeamer();
      if (ck.classId != null) saveNamesPref(ck.classId, ck.showNamesOnBeamer);
      render();
      return;
    }
    if (t.closest("[data-ck-pause]")) {
      ck.beamerPaused = !ck.beamerPaused;
      armViewTimer();
      render();
      return;
    }
    const viewSet = t.closest("[data-ck-view-set]");
    if (viewSet) {
      ck.beamerView = viewSet.getAttribute("data-ck-view-set") || "A";
      armViewTimer();
      render();
      return;
    }
    if (t.closest("[data-ck-boss-win]")) {
      grantBossWin();
      return;
    }
    const tier = t.closest("[data-ck-tier]");
    if (tier) {
      ck.tier = tier.getAttribute("data-ck-tier");
      render();
      return;
    }
    const xp = t.closest("[data-ck-xp]");
    if (xp) {
      const value = Number(xp.getAttribute("data-value")) || 10;
      if (xp.getAttribute("data-ck-xp") === "team") ck.teamXp = value;
      else ck.raffleXp = value;
      render();
      return;
    }
    if (t.closest("[data-ck-raffle]")) {
      runRaffle();
      return;
    }
    const team = t.closest("[data-ck-team]");
    if (team) {
      confirmTeam(team.getAttribute("data-ck-team"));
      return;
    }
    const mission = t.closest("[data-ck-mission]");
    if (mission) {
      missionAction(mission.getAttribute("data-ck-mission"), mission);
      return;
    }
    if (t.closest("[data-ck-close]")) {
      ck.drawerId = null;
      render();
      return;
    }
    const open = t.closest("[data-ck-open]");
    if (open && !ck.beamer) {
      const id = Number(open.getAttribute("data-ck-open"));
      ck.drawerId = Number(ck.drawerId) === id ? null : id;
      render();
    }
  }

  function onToggle(event) {
    if (!ck.active) return;
    const more = event.target.closest?.("[data-ck-more]");
    if (more) ck.moreOpen = !!more.open;
  }

  function onFormInput(event) {
    if (!ck.active) return;
    const swap = event.target.getAttribute?.("data-ck-crew-swap");
    if (swap && event.target.tagName === "SELECT") {
      swapIntoCrew(swap, event.target.value);
      event.target.value = "";
      return;
    }
    if (!ck.form) return;
    const field = event.target.getAttribute?.("data-ck-form");
    if (!field) return;
    if (field === "goal") {
      const set = new Set(ck.form.goalIds);
      if (event.target.checked) set.add(event.target.value);
      else set.delete(event.target.value);
      ck.form.goalIds = goals()
        .map((g) => String(g.id))
        .filter((id) => set.has(id));
    } else if (field === "tier") ck.form.tier = event.target.value;
    else if (field === "due") ck.form.dueDate = event.target.value;
    else if (field === "lootXp") {
      ck.form.lootXp = event.target.value;
      return;
    } else if (field === "lootText") {
      ck.form.lootText = event.target.value;
      return;
    } else if (field === "title") {
      ck.form.title = event.target.value;
      return;
    }
    const titleInput = ck.el.querySelector('[data-ck-form="title"]');
    if (titleInput) titleInput.placeholder = formTitle(ck.form);
  }

  function onKey(event) {
    if (!ck.active) return;
    const tag = (event.target && event.target.tagName) || "";
    const typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || event.target?.isContentEditable;
    if (event.key === "Escape" && ck.helpModal) {
      ck.helpModal = null;
      render();
      return;
    }
    if (event.key === "Escape" && ck.drawerId != null) {
      ck.drawerId = null;
      render();
      return;
    }
    if (event.key === "Escape" && isPresentation()) {
      exitPresentation();
      event.preventDefault();
      return;
    }
    if (!ck.beamer && !isPresentation()) return;
    if (typing) return;
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      const i = BEAMER_VIEWS.indexOf(ck.beamerView);
      const next =
        event.key === "ArrowRight"
          ? BEAMER_VIEWS[(i + 1) % BEAMER_VIEWS.length]
          : BEAMER_VIEWS[(i - 1 + BEAMER_VIEWS.length) % BEAMER_VIEWS.length];
      ck.beamerView = next;
      if (!ck.beamer) ck.beamer = true;
      armViewTimer();
      render();
      event.preventDefault();
      return;
    }
    if (event.key === " " || event.code === "Space") {
      ck.beamerPaused = !ck.beamerPaused;
      armViewTimer();
      render();
      event.preventDefault();
      return;
    }
    if (event.key === "n" || event.key === "N") {
      ck.showNamesOnBeamer = !namesOnBeamer();
      if (ck.classId != null) saveNamesPref(ck.classId, ck.showNamesOnBeamer);
      render();
      event.preventDefault();
      return;
    }
    if (event.key === "z" || event.key === "Z") {
      runRaffle();
      event.preventDefault();
    }
  }

  function onPresentationPointer() {
    if (!ck.active) return;
    if (!ck.beamer && !isPresentation()) return;
    showPresentationChrome();
  }

  function onFullscreenChange() {
    if (!ck.active) return;
    if (document.fullscreenElement) ck.fakeFullscreen = false;
    syncPresentationClasses();
    render();
  }

  function bind() {
    if (ck.bound || !ck.el) return;
    ck.bound = true;
    ck.el.addEventListener("click", onClick);
    ck.el.addEventListener("toggle", onToggle, true);
    ck.el.addEventListener("change", onFormInput);
    ck.el.addEventListener("input", onFormInput);
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousemove", onPresentationPointer);
    document.addEventListener("touchstart", onPresentationPointer, { passive: true });
    document.addEventListener("fullscreenchange", onFullscreenChange);
    document.addEventListener("visibilitychange", () => {
      if (
        ck.active &&
        !document.hidden &&
        ck.updatedAt &&
        Date.now() - ck.updatedAt.getTime() > refreshIntervalMs()
      ) {
        load(true);
      }
    });
  }

  /**
   * ctx: { classId, levelCheckId, range, view, toast, api, escapeHtml, setView }
   * Wird bei jedem render() des Lehrer-Dashboards aufgerufen, solange der Tab offen ist.
   */
  function show(el, ctx) {
    ck.el = el;
    ck.ctx = ctx;
    ck.active = true;
    document.body.classList.add("ck-wide");
    bind();
    if (ctx.view && Number(ctx.view.class?.id) === Number(ctx.classId)) ck.live = ctx.view;
    const classChanged = Number(ck.classId) !== Number(ctx.classId);
    const unitChanged =
      ctx.levelCheckId && ck.data?.levelCheck && String(ck.data.levelCheck.id) !== String(ctx.levelCheckId);
    if (classChanged) {
      ck.classId = ctx.classId;
      ck.data = null;
      ck.drawerId = null;
      ck.form = null;
      ck.forceBossWin = false;
      ck.bossConfetti = false;
      ck.prevPresence = null;
      ck.presencePopUntil = null;
      stopRaffleSpin();
      const stored = loadNamesPref(ctx.classId);
      ck.showNamesOnBeamer = stored;
    }
    const key = `${ctx.classId}|${ctx.levelCheckId || ""}`;
    const inFlight = ck.loading && ck.loadingKey === key;
    if ((!ck.data || classChanged || unitChanged) && !inFlight) {
      if (unitChanged) {
        ck.drawerId = null;
        ck.form = null;
        ck.forceBossWin = false;
        ck.bossConfetti = false;
      }
      ck.loadingKey = key;
      load(false);
    }
    render();
    startTimer();
  }

  function hide() {
    ck.active = false;
    stopTimer();
    stopRaffleSpin();
    if (ck.chromeHideTimer) {
      clearTimeout(ck.chromeHideTimer);
      ck.chromeHideTimer = null;
    }
    ck.fakeFullscreen = false;
    ck.chromeVisible = false;
    document.body.classList.remove("ck-wide", "ck-beamer", "ck--presentation", "ck-fake-fullscreen");
  }

  window.TeacherCockpit = { show, hide };
})();
