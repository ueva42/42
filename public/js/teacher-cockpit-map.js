/**
 * Stadtkarte / Fahrspuren für das Lehrer-Cockpit (Beamer Stufe 1).
 * Marker-Winkel wie Trainingscenter: 0° = rechts, im Uhrzeigersinn.
 */
(function () {
  const RING_DEFS = [
    { key: "rookie", start: 212, end: 328 },
    { key: "operator", start: 338, end: 452 },
    { key: "street_legend", start: 102, end: 202 }
  ];
  const DEFAULT_RINGS = {
    rookie: "#ffc300",
    operator: "#f97316",
    streetLegend: "#ff2ea6"
  };
  const UPCOMING = "#7cc4ef";
  const MARKER_R = 15;
  const RING_R = 21;

  function esc(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function colorFor(tier, colors) {
    const c = colors || DEFAULT_RINGS;
    if (tier === "rookie") return c.rookie || DEFAULT_RINGS.rookie;
    if (tier === "operator") return c.operator || DEFAULT_RINGS.operator;
    return c.streetLegend || c.street_legend || DEFAULT_RINGS.streetLegend;
  }

  /** Polar in SVG: 0° rechts, Uhrzeigersinn (y nach unten). */
  function polar(cx, cy, r, deg) {
    const rad = (deg * Math.PI) / 180;
    return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
  }

  function arcPath(cx, cy, r, startDeg, endDeg) {
    let a0 = startDeg;
    let a1 = endDeg;
    if (a1 < a0) a1 += 360;
    const span = a1 - a0;
    const large = span > 180 ? 1 : 0;
    const [x0, y0] = polar(cx, cy, r, a0);
    const [x1, y1] = polar(cx, cy, r, a1);
    return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
  }

  function partialArc(cx, cy, r, startDeg, endDeg, frac) {
    const f = Math.max(0, Math.min(1, Number(frac) || 0));
    if (f <= 0) return "";
    let a0 = startDeg;
    let a1 = endDeg;
    if (a1 < a0) a1 += 360;
    const end = a0 + (a1 - a0) * f;
    return arcPath(cx, cy, r, a0, end);
  }

  function viewBoxStr(vb) {
    if (Array.isArray(vb) && vb.length >= 4) {
      return `${vb[0]} ${vb[1]} ${vb[2]} ${vb[3]}`;
    }
    return "0 0 1000 562";
  }

  function ringArcs(cx, cy, rings, colors) {
    const parts = [];
    for (const def of RING_DEFS) {
      const col = colorFor(def.key, colors);
      const data = rings?.[def.key] || { confirmed: 0, reported: 0 };
      const base = arcPath(cx, cy, RING_R, def.start, def.end);
      parts.push(
        `<path d="${base}" fill="none" stroke="${col}" stroke-opacity="0.22" stroke-width="2.2" stroke-linecap="round"/>`
      );
      const reported = Math.max(Number(data.reported) || 0, Number(data.confirmed) || 0);
      const repPath = partialArc(cx, cy, RING_R, def.start, def.end, reported);
      if (repPath) {
        parts.push(
          `<path d="${repPath}" fill="none" stroke="${col}" stroke-opacity="0.45" stroke-width="4.5" stroke-linecap="round"/>`
        );
      }
      const confPath = partialArc(cx, cy, RING_R, def.start, def.end, data.confirmed);
      if (confPath) {
        parts.push(
          `<path d="${confPath}" fill="none" stroke="${col}" stroke-opacity="1" stroke-width="5.5" stroke-linecap="round"/>`
        );
      }
    }
    return parts.join("");
  }

  function holeRadius(mission, baseR) {
    const conf = Number(mission?.rings?.rookie?.confirmed) || 0;
    return baseR * (0.35 + 0.65 * Math.min(1, conf));
  }

  function overlayMask(map, maskId) {
    const [vx, vy, vw, vh] = Array.isArray(map.viewBox) ? map.viewBox : [0, 0, 1000, 562];
    const baseR = Math.min(vw, vh) * 0.08;
    const holes = (map.missions || [])
      .map((m) => {
        const conf = Number(m.rings?.rookie?.confirmed) || 0;
        const r = holeRadius(m, baseR);
        const soft = r * (1.25 + Math.min(1, conf) * 0.4);
        return `<circle cx="${m.x}" cy="${m.y}" r="${r.toFixed(1)}" fill="black"/>
          <circle cx="${m.x}" cy="${m.y}" r="${soft.toFixed(1)}" fill="black" opacity="0.4"/>`;
      })
      .join("");
    const glows = (map.missions || [])
      .map((m, i) => {
        const confR = Number(m.rings?.rookie?.confirmed) || 0;
        const confO = Number(m.rings?.operator?.confirmed) || 0;
        const confS = Number(m.rings?.street_legend?.confirmed) || 0;
        if (confR + confO + confS <= 0) return "";
        const r = holeRadius(m, baseR) * 1.6;
        const gid = `${maskId}-glow-${i}`;
        const warm = Math.min(1, confO * 0.55 + confS * 0.7);
        return `
          <radialGradient id="${gid}" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stop-color="#fbbf24" stop-opacity="${(0.35 + warm * 0.35).toFixed(2)}"/>
            <stop offset="55%" stop-color="#f97316" stop-opacity="${(0.12 + warm * 0.2).toFixed(2)}"/>
            <stop offset="100%" stop-color="#020617" stop-opacity="0"/>
          </radialGradient>
          <circle cx="${m.x}" cy="${m.y}" r="${r.toFixed(1)}" fill="url(#${gid})"/>`;
      })
      .join("");
    return `
      <defs>
        <mask id="${maskId}">
          <rect x="${vx}" y="${vy}" width="${vw}" height="${vh}" fill="white"/>
          ${holes}
        </mask>
      </defs>
      <rect x="${vx}" y="${vy}" width="${vw}" height="${vh}" fill="#020617" opacity="${Number(map.darkOpacity ?? 0.6)}" mask="url(#${maskId})"/>
      <g class="ck-city-glows" style="mix-blend-mode:screen">${glows}</g>`;
  }

  function startSvg(map) {
    const s = map.start;
    if (!s || s.x == null || s.y == null) return "";
    const x = Number(s.x);
    const y = Number(s.y);
    return `
      <g class="ck-city-start">
        <circle cx="${x}" cy="${y}" r="11" fill="#22c55e" stroke="#ecfdf5" stroke-width="2.5"/>
        <circle cx="${x}" cy="${y}" r="4.5" fill="#052e16"/>
        <text x="${x}" y="${y - 18}" text-anchor="middle" fill="#86efac" stroke="rgba(2,6,23,.65)" stroke-width="3" paint-order="stroke"
          font-size="12" font-weight="800" font-family="Orbitron, system-ui">START</text>
      </g>`;
  }

  function routes(map) {
    const segs = map.routeSegments || [];
    const active = Number(map.activeMissionN) || 0;
    const color = map.routeColor || "#f97316";
    return segs
      .map((d, i) => {
        // Segment i: Mission i → i+1 (0 = Start→M1). Gefahren bis activeMissionN.
        const driven = active > 0 && i < active;
        if (driven) {
          return `<path d="${esc(d)}" fill="none" stroke="${esc(color)}" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>`;
        }
        return `<path d="${esc(d)}" fill="none" stroke="${UPCOMING}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="7 9" opacity="0.85"/>`;
      })
      .join("");
  }

  function bossMissionN(map, boss) {
    if (!boss || !map?.missions?.length) return null;
    const hits = Array.isArray(boss.hitByMission) ? boss.hitByMission : [];
    const withN = hits.map((h) => Number(h.n)).filter((n) => n > 0);
    if (withN.length) return Math.max(...withN);
    return map.missions[map.missions.length - 1]?.n || null;
  }

  function shieldSvg(m, boss) {
    if (!m || !boss) return "";
    const defeated = boss.defeated || boss.forceWin;
    const label = defeated
      ? "BESIEGT"
      : boss.flagLabel || boss.shieldLabel || "BOSS-FIGHT";
    const x = Number(m.x);
    const y = Number(m.y) - 48;
    const w = Math.max(118, label.length * 7.2);
    const h = 28;
    return `
      <g class="ck-city-shield" transform="translate(${(x - w / 2).toFixed(1)} ${(y - h).toFixed(1)})">
        <rect width="${w.toFixed(1)}" height="${h}" rx="6" fill="${defeated ? "rgba(52,211,153,.92)" : "rgba(8,12,28,.92)"}" stroke="${defeated ? "#34d399" : "#f97316"}" stroke-width="2"/>
        <text x="${(w / 2).toFixed(1)}" y="${(h / 2 + 4).toFixed(1)}" text-anchor="middle" fill="${defeated ? "#042f2e" : "#fdba74"}" font-size="11" font-weight="800" font-family="Orbitron, system-ui">${esc(label)}</text>
      </g>`;
  }

  function zielSvg(map, examLabel) {
    const z = map.ziel;
    if (!z) return "";
    const label = examLabel
      ? `${z.label || "LERNCHECK"} · ${examLabel}`
      : z.label || "LERNCHECK";
    const x = Number(z.x);
    const y = Number(z.y);
    const patId = `ckFlagChk-${Math.random().toString(36).slice(2, 8)}`;
    const fw = 28;
    const fh = 18;
    return `
      <g class="ck-city-ziel">
        <defs>
          <pattern id="${patId}" width="7" height="7" patternUnits="userSpaceOnUse">
            <rect width="7" height="7" fill="#f8fafc"/>
            <rect width="3.5" height="3.5" fill="#0f172a"/>
            <rect x="3.5" y="3.5" width="3.5" height="3.5" fill="#0f172a"/>
          </pattern>
        </defs>
        <line x1="${x}" y1="${y}" x2="${x}" y2="${y - 40}" stroke="#e2e8f0" stroke-width="2.2" stroke-linecap="round"/>
        <rect x="${x + 1}" y="${y - 40}" width="${fw}" height="${fh}" fill="url(#${patId})" stroke="#94a3b8" stroke-width="1"/>
        <circle cx="${x}" cy="${y}" r="4" fill="#f8fafc" stroke="#64748b" stroke-width="1"/>
        <text x="${x + fw / 2 + 2}" y="${y - 46}" text-anchor="middle" fill="#f8fafc" stroke="rgba(2,6,23,.7)" stroke-width="3" paint-order="stroke"
          font-size="11" font-weight="800" font-family="Orbitron, system-ui">${esc(label)}</text>
      </g>`;
  }

  function crewTagsSvg(map) {
    const tags = map.crewTags || [];
    if (!tags.length) return "";
    return tags
      .map((t, i) => {
        const x = Number(t.x) + 28;
        const y = Number(t.y) - 18 - (i % 3) * 4;
        const color = t.color || "#f472b6";
        const label = String(t.text || "Crew").slice(0, 16);
        return `<g class="ck-crew-tag" transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(-18)">
          <text text-anchor="start" fill="${esc(color)}" stroke="rgba(2,6,23,.55)" stroke-width="3" paint-order="stroke"
            font-size="13" font-weight="900" font-family="Orbitron, system-ui" opacity="0.95">${esc(label)}</text>
        </g>`;
      })
      .join("");
  }

  function markers(map, colors) {
    return (map.missions || [])
      .map((m) => {
        const cx = Number(m.x);
        const cy = Number(m.y);
        const here = Number(m.hereCount) || 0;
        const bubbleW = here >= 10 ? 96 : 88;
        const bubble =
          here > 0
            ? `<g class="ck-city-here" transform="translate(${(cx + 20).toFixed(1)} ${(cy - 42).toFixed(1)})">
                <rect x="0" y="0" width="${bubbleW}" height="24" rx="12" fill="#22d3ee" stroke="#ecfeff" stroke-width="1.5"/>
                <text x="${bubbleW / 2}" y="16" text-anchor="middle" fill="#041018" font-size="11" font-weight="800" font-family="IBM Plex Sans, system-ui">gerade hier ${here}</text>
              </g>`
            : "";
        return `
          <g class="ck-city-marker">
            ${ringArcs(cx, cy, m.rings, colors)}
            <circle cx="${cx}" cy="${cy}" r="${MARKER_R}" fill="rgba(8,12,28,.92)" stroke="#e2e8f0" stroke-width="2"/>
            <text x="${cx}" y="${cy + 5}" text-anchor="middle" fill="#f8fafc" font-size="13" font-weight="800" font-family="Orbitron, system-ui">${esc(m.n)}</text>
            <text x="${cx}" y="${cy + 34}" text-anchor="middle" fill="#cbd5e1" font-size="11" font-weight="700" font-family="IBM Plex Sans, system-ui">${esc(m.confirmedRookieLabel || "")}</text>
            ${bubble}
          </g>`;
      })
      .join("");
  }

  function legendHtml(colors) {
    const c = colors || DEFAULT_RINGS;
    return `<div class="ck-city-legend" aria-label="Kartenlegende">
      <span><i style="background:${esc(c.rookie || DEFAULT_RINGS.rookie)}"></i>Rookie</span>
      <span><i style="background:${esc(c.operator || DEFAULT_RINGS.operator)}"></i>Operator</span>
      <span><i style="background:${esc(c.streetLegend || DEFAULT_RINGS.streetLegend)}"></i>Street Legend</span>
      <span><i style="background:${UPCOMING};border-radius:2px"></i>Route offen</span>
    </div>`;
  }

  /**
   * @param {object} map season.map (mode city)
   * @param {{ ringColors?: object, boss?: object|null, examLabel?: string }} opts
   */
  function renderCityMap(map, opts = {}) {
    if (!map || map.mode !== "city" || !map.imageUrl) return "";
    const colors = opts.ringColors || DEFAULT_RINGS;
    const vb = viewBoxStr(map.viewBox);
    const bossN = bossMissionN(map, opts.boss);
    const bossM = (map.missions || []).find((m) => Number(m.n) === Number(bossN));
    const maskId = `ckCityMask-${Math.random().toString(36).slice(2, 9)}`;
    return `
      <div class="ck-city" style="position:relative;aspect-ratio:16/9">
        <img src="${esc(map.imageUrl)}" alt="" decoding="async" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover">
        <svg viewBox="${esc(vb)}" preserveAspectRatio="xMidYMid meet" style="position:absolute;inset:0;width:100%;height:100%" aria-hidden="true">
          ${overlayMask(map, maskId)}
          ${routes(map)}
          ${startSvg(map)}
          ${markers(map, colors)}
          ${crewTagsSvg(map)}
          ${shieldSvg(bossM, opts.boss)}
          ${zielSvg(map, opts.examLabel)}
        </svg>
      </div>
      ${legendHtml(colors)}`;
  }

  /**
   * Fahrspuren-Fallback wenn keine Stadtkarte passt.
   * @param {object} map season.map (mode lanes)
   * @param {{ checkpointNs?: number[] }} opts
   */
  function renderLanes(map, opts = {}) {
    const lanes = map?.lanes || [];
    if (!lanes.length) {
      return `<p class="ck-muted ck-small">Keine Missionen für die Spur-Ansicht.</p>`;
    }
    const cps = new Set((opts.checkpointNs || []).map(Number));
    const flagLabel = opts.flagLabel || opts.shieldLabel || "";
    return `
      <div class="ck-lanes" aria-label="Fahrspuren">
        ${lanes
          .map((lane) => {
            const conf = Math.round((Number(lane.confirmedFrac) || 0) * 1000) / 10;
            const rep = Math.round((Number(lane.reportedFrac) || 0) * 1000) / 10;
            const cp = cps.has(Number(lane.n));
            return `<div class="ck-lane-track ${cp ? "ck-lane-track--cp" : ""}">
              <div class="ck-lane-track__lab"><strong>M${esc(lane.n)}</strong> ${esc(lane.text || "")}${
                cp && flagLabel
                  ? ` <span class="ck-lane-flag">${esc(flagLabel)}</span>`
                  : cp
                    ? ` <span class="ck-lane-flag">LEVELCHECK</span>`
                    : ""
              }</div>
              <div class="ck-lane-track__bar" title="bestätigt ${conf} % · gemeldet ${rep} %">
                <span class="ck-lane-track__rep" style="width:${Math.max(conf, rep)}%"></span>
                <span class="ck-lane-track__conf" style="width:${conf}%"></span>
                ${cp ? `<i class="ck-lane-track__stop" title="${esc(flagLabel || "Checkpoint")}"></i>` : ""}
              </div>
              <div class="ck-lane-track__pct">${conf} % bestätigt</div>
            </div>`;
          })
          .join("")}
      </div>`;
  }

  function renderMap(map, opts = {}) {
    if (!map) return `<p class="ck-muted ck-small">Keine Kartendaten.</p>`;
    if (map.mode === "city") return renderCityMap(map, opts);
    return renderLanes(map, opts);
  }

  window.TeacherCockpitMap = {
    renderCityMap,
    renderLanes,
    renderMap,
    DEFAULT_RINGS
  };
})();
