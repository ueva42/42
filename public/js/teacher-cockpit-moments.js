/**
 * Beamer-Momente: große Einblendungen (Queue, dedupe, reduced-motion).
 * Nur Beamer-Ansicht. Gezeigte IDs in localStorage.
 */
(function () {
  const STORAGE_KEY = "sol.ck.moments.seen.v1";
  const MIN_GAP_MS = 5000;
  const SHOW_MS = 3600;
  const QUEUE = [];
  let showing = false;
  let lastShownAt = 0;
  let timer = null;
  let soundOn = false;

  function reducedMotion() {
    try {
      return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
    } catch {
      return false;
    }
  }

  function loadSeen() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return new Set(Array.isArray(arr) ? arr.slice(-200) : []);
    } catch {
      return new Set();
    }
  }

  function saveSeen(set) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...set].slice(-200)));
    } catch {
      /* ignore */
    }
  }

  const seen = loadSeen();

  function hostEl() {
    return document.querySelector(".ck.ck--beamer") || document.querySelector(".ck") || document.body;
  }

  function playBlip() {
    if (!soundOn || reducedMotion()) return;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "triangle";
      o.frequency.value = 520;
      g.gain.value = 0.04;
      o.connect(g);
      g.connect(ctx.destination);
      o.start();
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
      o.stop(ctx.currentTime + 0.26);
      setTimeout(() => ctx.close?.(), 400);
    } catch {
      /* ignore */
    }
  }

  function paint(ev) {
    const host = hostEl();
    if (!host) return;
    host.querySelectorAll(".ck-moment").forEach((n) => n.remove());
    const layer = document.createElement("div");
    layer.className = `ck-moment ${reducedMotion() ? "ck-moment--static" : ""}`;
    layer.setAttribute("role", "status");
    layer.innerHTML = `<div class="ck-moment__card ck-moment__card--${esc(ev.kind || "generic")}">
      <div class="ck-moment__title">${esc(ev.title || "")}</div>
      ${ev.sub ? `<div class="ck-moment__sub">${esc(ev.sub)}</div>` : ""}
      ${ev.html || ""}
    </div>`;
    host.appendChild(layer);
    requestAnimationFrame(() => layer.classList.add("ck-moment--show"));
    playBlip();
    timer = setTimeout(() => {
      layer.classList.remove("ck-moment--show");
      setTimeout(() => layer.remove(), reducedMotion() ? 0 : 350);
      showing = false;
      lastShownAt = Date.now();
      timer = null;
      pump();
    }, SHOW_MS);
  }

  function esc(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function pump() {
    if (showing) return;
    if (!QUEUE.length) return;
    const wait = Math.max(0, MIN_GAP_MS - (Date.now() - lastShownAt));
    if (wait > 0) {
      setTimeout(pump, wait + 20);
      return;
    }
    const next = QUEUE.shift();
    if (!next) return;
    showing = true;
    paint(next);
  }

  /**
   * @param {{ id: string, kind: string, title: string, sub?: string, html?: string }} ev
   * @param {{ beamer?: boolean }} opts
   */
  function enqueue(ev, opts = {}) {
    if (!opts.beamer) return false;
    if (!ev?.id || !ev?.title) return false;
    if (seen.has(String(ev.id))) return false;
    seen.add(String(ev.id));
    saveSeen(seen);
    QUEUE.push({
      id: String(ev.id),
      kind: ev.kind || "generic",
      title: ev.title,
      sub: ev.sub || "",
      html: ev.html || ""
    });
    pump();
    return true;
  }

  function setSound(on) {
    soundOn = !!on;
  }

  function getSound() {
    return soundOn;
  }

  function clearQueue() {
    QUEUE.length = 0;
    if (timer) clearTimeout(timer);
    timer = null;
    showing = false;
    document.querySelectorAll(".ck-moment").forEach((n) => n.remove());
  }

  window.TeacherCockpitMoments = {
    enqueue,
    setSound,
    getSound,
    clearQueue,
    reducedMotion
  };
})();
