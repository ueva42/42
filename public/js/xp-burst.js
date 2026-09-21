/**
 * Kurzer Goldregen + Funken, wenn ein Schüler XP bekommt.
 */
(function () {
  let lastXp = null;
  let raf = 0;
  let canvas = null;
  let chipTimer = 0;

  function reducedMotion() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function ensureCanvas() {
    if (canvas && canvas.isConnected) return canvas;
    canvas = document.createElement("canvas");
    canvas.id = "xpBurstCanvas";
    canvas.className = "xp-burst-canvas";
    canvas.setAttribute("aria-hidden", "true");
    document.body.appendChild(canvas);
    return canvas;
  }

  function pulsePill() {
    const pill = document.querySelector(".student-topbar-pill-xp");
    if (!pill) return;
    pill.classList.remove("is-xp-pop");
    void pill.offsetWidth;
    pill.classList.add("is-xp-pop");
    window.setTimeout(() => pill.classList.remove("is-xp-pop"), 800);
  }

  function showChip(amount) {
    document.getElementById("xpBurstChip")?.remove();
    const chip = document.createElement("div");
    chip.id = "xpBurstChip";
    chip.className = "xp-burst-chip";
    chip.textContent = `+${amount} XP`;
    const pill = document.querySelector(".student-topbar-pill-xp");
    if (pill) {
      const r = pill.getBoundingClientRect();
      chip.style.left = `${Math.max(12, r.left + r.width / 2 - 48)}px`;
      chip.style.top = `${Math.max(12, r.bottom + 8)}px`;
    }
    document.body.appendChild(chip);
    window.clearTimeout(chipTimer);
    chipTimer = window.setTimeout(() => chip.remove(), 1600);
  }

  function playBurst(amount) {
    const cnv = ensureCanvas();
    const ctx = cnv.getContext("2d");
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = window.innerWidth;
    const h = window.innerHeight;
    cnv.width = Math.floor(w * dpr);
    cnv.height = Math.floor(h * dpr);
    cnv.style.width = `${w}px`;
    cnv.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const intensity = Math.max(1, Math.min(3, Math.round(amount / 4)));
    const coins = 22 + intensity * 18;
    const sparks = 18 + intensity * 14;
    const particles = [];
    const golds = ["#fde68a", "#fbbf24", "#f59e0b", "#fff7c2", "#facc15"];

    for (let i = 0; i < coins; i++) {
      particles.push({
        kind: "coin",
        x: Math.random() * w,
        y: -20 - Math.random() * 80,
        vx: (Math.random() - 0.5) * 1.4,
        vy: 2.4 + Math.random() * 3.6,
        r: 2.2 + Math.random() * 3.4,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.18,
        color: golds[i % golds.length],
        life: 1
      });
    }

    const bursts = [
      { x: w * 0.18, y: h * 0.28 },
      { x: w * 0.82, y: h * 0.34 },
      { x: w * 0.5, y: h * 0.18 }
    ].slice(0, intensity);

    bursts.forEach((b) => {
      for (let i = 0; i < sparks; i++) {
        const a = (Math.PI * 2 * i) / sparks + Math.random() * 0.4;
        const spd = 1.6 + Math.random() * 3.8;
        particles.push({
          kind: "spark",
          x: b.x,
          y: b.y,
          vx: Math.cos(a) * spd,
          vy: Math.sin(a) * spd - 1.2,
          r: 1.4 + Math.random() * 2.2,
          rot: 0,
          vr: 0,
          color: golds[i % golds.length],
          life: 1
        });
      }
    });

    const start = performance.now();
    const duration = 1700;
    window.cancelAnimationFrame(raf);

    function tick(now) {
      const t = Math.min(1, (now - start) / duration);
      ctx.clearRect(0, 0, w, h);
      particles.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        if (p.kind === "spark") {
          p.vy += 0.06;
          p.life -= 0.018;
        } else {
          p.vy += 0.04;
          p.rot += p.vr;
          p.life -= 0.008;
        }
        if (p.life <= 0) return;
        ctx.save();
        ctx.globalAlpha = Math.max(0, p.life) * (1 - t * 0.15);
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 8;
        if (p.kind === "coin") {
          ctx.fillRect(-p.r, -p.r * 0.45, p.r * 2, p.r * 0.9);
        } else {
          ctx.beginPath();
          ctx.arc(0, 0, p.r, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      });
      if (t < 1) {
        raf = window.requestAnimationFrame(tick);
      } else {
        ctx.clearRect(0, 0, w, h);
      }
    }

    raf = window.requestAnimationFrame(tick);
  }

  function celebrate(amount) {
    const n = Math.max(1, Math.round(Number(amount) || 0));
    if (lastXp != null) lastXp += n;
    showChip(n);
    pulsePill();
    if (!reducedMotion()) playBurst(n);
  }

  function noteXp(xp) {
    const next = Number(xp);
    if (!Number.isFinite(next)) return;
    if (lastXp != null && next > lastXp) celebrate(next - lastXp);
    lastXp = next;
  }

  window.XpBurst = { celebrate, noteXp };
})();
