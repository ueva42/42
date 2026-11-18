/**
 * Beamer-Autopilot: Stundenplan-Schedule, Phasen, Wartebildschirm, Wake Lock.
 * Nutzt /api/teacher/beamer/schedule und steuert TeacherCockpit.
 */
(function () {
  const POLL_MS = 30000;
  let timer = null;
  let wakeLock = null;
  let overrideUntil = null;
  let lastFocusKey = null;

  function esc(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  async function requestWakeLock() {
    try {
      if (!("wakeLock" in navigator)) return;
      wakeLock = await navigator.wakeLock.request("screen");
      wakeLock.addEventListener?.("release", () => {
        wakeLock = null;
      });
    } catch {
      /* iPad / Browser blockiert */
    }
  }

  function releaseWakeLock() {
    try {
      wakeLock?.release?.();
    } catch {
      /* ignore */
    }
    wakeLock = null;
  }

  function formatClock(iso) {
    try {
      return new Date(iso).toLocaleTimeString("de-DE", {
        timeZone: "Europe/Berlin",
        hour: "2-digit",
        minute: "2-digit"
      });
    } catch {
      return "";
    }
  }

  function paintWaiting(host, schedule) {
    const next = schedule.waiting || schedule.focus;
    const clock = formatClock(schedule.nowIso || new Date().toISOString());
    if (schedule.mode === "done") {
      host.innerHTML = `<div class="ck-auto-wait" role="status">
        <p class="ck-auto-wait__clock">${esc(clock)}</p>
        <h1 class="ck-auto-wait__title">Heute keine Stunde mehr</h1>
        <p class="ck-auto-wait__sub">Autopilot wartet auf den nächsten Schultag.</p>
      </div>`;
      return;
    }
    if (!next) {
      host.innerHTML = `<div class="ck-auto-wait" role="status">
        <p class="ck-auto-wait__clock">${esc(clock)}</p>
        <h1 class="ck-auto-wait__title">Pause</h1>
        <p class="ck-auto-wait__sub">Nächste Stunde steht noch nicht fest.</p>
      </div>`;
      return;
    }
    const when = formatClock(next.startAt);
    host.innerHTML = `<div class="ck-auto-wait" role="status">
      <p class="ck-auto-wait__clock">${esc(clock)}</p>
      <p class="ck-auto-wait__kicker">Gleich</p>
      <h1 class="ck-auto-wait__title">${esc(next.className)} · ${esc(next.subject)}</h1>
      <p class="ck-auto-wait__sub">${esc(next.unitName || "Unterrichtseinheit")} · ab ${esc(when)}</p>
      <div class="ck-auto-wait__hint">Avatar-Wand der Klasse erscheint mit dem Stundenbeginn.</div>
    </div>`;
  }

  async function fetchSchedule(api, classId) {
    const q = classId ? `?classId=${encodeURIComponent(classId)}` : "";
    return api(`/api/teacher/beamer/schedule${q}`);
  }

  /**
   * @param {{ api: Function, escapeHtml?: Function, getClassId?: Function, setClassId?: Function, setLevelCheckId?: Function, onLive?: Function }} ctx
   */
  function start(ctx) {
    stop();
    const host = document.getElementById("app");
    if (!host) return;
    document.body.classList.add("ck-autopilot", "ck-beamer");
    const shell = document.querySelector(".td-shell");
    shell?.classList.add("td-shell--beamer");
    requestWakeLock();
    document.addEventListener("visibilitychange", onVis);

    async function tick() {
      try {
        const data = await fetchSchedule(ctx.api, ctx.getClassId?.());
        const schedule = data.schedule;
        const settings = schedule?.settings || {};
        if (!settings.enabled) {
          // Autopilot aus → normale Beamer-Ansicht der gewählten Klasse
          ctx.onLive?.({ schedule, settings, phase: null });
          return;
        }
        const manual =
          overrideUntil && Date.now() < overrideUntil.getTime()
            ? true
            : ((overrideUntil = null), false);

        if (!manual && (schedule.mode === "waiting" || schedule.mode === "done" || schedule.mode === "gap")) {
          window.TeacherCockpit?.hide?.();
          paintWaiting(host, schedule);
          return;
        }

        const focus = schedule.current || (manual ? null : schedule.focus);
        if (focus?.classId && ctx.setClassId) {
          const key = `${focus.classId}|${focus.levelCheckId || ""}|${schedule.phase || ""}`;
          ctx.setClassId(focus.classId);
          if (focus.levelCheckId && ctx.setLevelCheckId) ctx.setLevelCheckId(focus.levelCheckId);
          if (key !== lastFocusKey) {
            lastFocusKey = key;
          }
        }
        ctx.onLive?.({
          schedule,
          settings,
          phase: schedule.phase,
          focus,
          manual
        });
      } catch (err) {
        host.innerHTML = `<div class="ck-auto-wait"><h1>Autopilot</h1><p>${esc(err.message || "Schedule nicht geladen.")}</p></div>`;
      }
    }

    tick();
    timer = setInterval(tick, POLL_MS);
  }

  function onVis() {
    if (document.visibilityState === "visible") requestWakeLock();
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
    document.removeEventListener("visibilitychange", onVis);
    releaseWakeLock();
    document.body.classList.remove("ck-autopilot");
    document.querySelector(".td-shell")?.classList.remove("td-shell--beamer");
  }

  /** Manuelle Klasse bis Stundenende (Date). */
  function setOverrideUntil(date) {
    overrideUntil = date ? new Date(date) : null;
  }

  window.TeacherCockpitAutopilot = {
    start,
    stop,
    setOverrideUntil,
    requestWakeLock,
    releaseWakeLock
  };
})();
