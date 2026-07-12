/**
 * Streets of Logic – wiederverwendbare Charts & Fortschritts-UI (SVG/CSS, keine Library).
 */
window.LogbuchVisuals = {
  clamp(n, min, max) {
    return Math.min(max, Math.max(min, Number(n) || 0));
  },

  escape(str) {
    return window.LogbuchUI?.escapeHtml(str) ?? String(str ?? "");
  },

  radialProgress(percent, valueText, labelText, opts = {}) {
    const pct = this.clamp(percent, 0, 100);
    const size = opts.size || 112;
    const inner = Math.round(size * 0.7);
    return `
      <div class="radial-progress-wrap" style="--progress:${pct}; --rp-size:${size}px; --rp-inner:${inner}px;">
        <div class="radial-progress" aria-hidden="true"></div>
        <div class="radial-progress__value">${this.escape(valueText)}</div>
        ${labelText ? `<div class="radial-progress__label">${this.escape(labelText)}</div>` : ""}
      </div>`;
  },

  xpBar(percent, extraClass = "") {
    const pct = this.clamp(percent, 0, 100);
    return `
      <div class="xp-bar ${extraClass}">
        <div class="xp-bar__fill" style="width:${pct}%"></div>
      </div>`;
  },

  statCards(cards) {
    return `
      <div class="stat-row ${cards.length >= 5 ? "stat-row--5" : cards.length >= 4 ? "stat-row--4" : ""}">
        ${cards
          .map(
            (c) => `
          <div class="stat-card ${c.accent ? "stat-card--accent" : ""}">
            <span class="stat-card__value">${this.escape(c.value)}</span>
            <span class="stat-card__label">${this.escape(c.label)}</span>
          </div>`
          )
          .join("")}
      </div>`;
  },

  miniBarChart(items, opts = {}) {
    const data = (items || []).map((x) => Number(x.value) || 0);
    const labels = (items || []).map((x) => x.label || "");
    const max = Math.max(1, ...data, opts.max || 0);
    const w = opts.width || 280;
    const h = opts.height || 72;
    const pad = 8;
    const barW = Math.max(12, (w - pad * 2) / Math.max(data.length, 1) - 6);

    const bars = data
      .map((v, i) => {
        const bh = Math.max(4, ((h - pad * 2 - 14) * v) / max);
        const x = pad + i * (barW + 6);
        const y = h - pad - 14 - bh;
        const color = items[i]?.color || "var(--accent, #a855f7)";
        return `<rect x="${x}" y="${y}" width="${barW}" height="${bh}" rx="4" fill="${color}" opacity="0.85"/>`;
      })
      .join("");

    const lbls = labels
      .map((lab, i) => {
        const x = pad + i * (barW + 6) + barW / 2;
        return `<text x="${x}" y="${h - 2}" text-anchor="middle" class="mini-chart-label">${this.escape(lab)}</text>`;
      })
      .join("");

    return `
      <svg class="mini-bar-chart" viewBox="0 0 ${w} ${h}" width="100%" height="${h}" aria-hidden="true">
        ${bars}${lbls}
      </svg>`;
  },

  miniLineChart(points, opts = {}) {
    const data = (points || []).map((n) => Number(n) || 0);
    if (!data.length) {
      return `<div class="mini-chart-empty">Noch keine Daten</div>`;
    }
    const w = opts.width || 320;
    const h = opts.height || 88;
    const pad = 10;
    const max = Math.max(1, ...data, opts.max || 0);
    const step = data.length > 1 ? (w - pad * 2) / (data.length - 1) : 0;

    const coords = data.map((v, i) => {
      const x = pad + i * step;
      const y = h - pad - ((h - pad * 2) * v) / max;
      return `${x},${y}`;
    });

    const area = `${pad},${h - pad} ${coords.join(" ")} ${pad + (data.length - 1) * step},${h - pad}`;

    return `
      <svg class="mini-line-chart" viewBox="0 0 ${w} ${h}" width="100%" height="${h}" aria-hidden="true">
        <polygon points="${area}" class="mini-line-chart-area" />
        <polyline points="${coords.join(" ")}" class="mini-line-chart-line" />
        ${coords
          .map((pt) => {
            const [x, y] = pt.split(",");
            return `<circle cx="${x}" cy="${y}" r="3" class="mini-line-chart-dot" />`;
          })
          .join("")}
      </svg>`;
  },

  progressPanel({ radial, stats, chart, chartTitle }) {
    return `
      <div class="progress-panel student-card">
        <div class="card-content progress-panel__grid">
          ${radial ? `<div class="progress-panel__radial">${radial}</div>` : ""}
          <div class="progress-panel__main">
            ${stats || ""}
            ${chartTitle ? `<p class="progress-panel__chart-title">${this.escape(chartTitle)}</p>` : ""}
            ${chart || ""}
          </div>
        </div>
      </div>`;
  },

  /** KPI-Zeile wie Mein Tag / Meine Woche */
  pageKpi(cards, radialPct, radialCenter, radialLabel, chart, chartTitle) {
    const stats = this.statCards(cards);
    if (radialPct == null) return stats;
    return this.progressPanel({
      radial: this.radialProgress(radialPct, radialCenter, radialLabel),
      stats,
      chart,
      chartTitle
    });
  },

  chipBar(items, selected, attrName = "data-chip") {
    return `
      <div class="student-card">
        <div class="card-content">
          <div class="day-chip-bar">
            ${items
              .map(
                (item) =>
                  `<button type="button" class="day-chip ${item.value === selected ? "is-active" : ""}" ${attrName}="${this.escape(item.value)}">${this.escape(item.label)}</button>`
              )
              .join("")}
          </div>
        </div>
      </div>`;
  },

  sectionBlock(title, innerHtml) {
    return `
      <div class="section-block">
        <h3 class="section-block__title">${this.escape(title)}</h3>
        ${innerHtml}
      </div>`;
  },

  emptyState({ eyebrow, title, text, hint, heroSrc }) {
    return `
      <div class="student-card empty-state-card">
        ${heroSrc ? `<img class="hero-art card-hero-art" src="${this.escape(heroSrc)}" alt="" aria-hidden="true" onerror="this.style.display='none'">` : ""}
        <div class="card-content">
          ${eyebrow ? `<p class="empty-state-card__eyebrow">${this.escape(eyebrow)}</p>` : ""}
          <h3 class="empty-state-card__title">${this.escape(title)}</h3>
          <p class="empty-state-card__text">${this.escape(text)}</p>
          ${hint ? `<p class="empty-state-card__hint">${this.escape(hint)}</p>` : ""}
        </div>
      </div>`;
  },

  pageShell(innerHtml) {
    return `<div class="student-page"><section class="page-grid">${innerHtml}</section></div>`;
  },

  aggregateXpByDay(xpLog, days = 7) {
    const out = [];
    const now = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const short = d.toLocaleDateString("de-DE", { weekday: "short" }).slice(0, 2);
      const sum = (xpLog || [])
        .filter((e) => String(e.created_at).slice(0, 10) === key)
        .reduce((a, e) => a + Number(e.amount || 0), 0);
      out.push({ label: short, value: sum, date: key });
    }
    return out;
  },

  renderXpDashboard(container, xpLog, profile) {
    if (!container) return;
    const V = this;
    const log = xpLog || [];
    const total = Number(profile?.xp || 0);
    const weekData = V.aggregateXpByDay(log, 7);
    const weekXp = weekData.reduce((a, d) => a + d.value, 0);
    const todayXp = weekData[weekData.length - 1]?.value || 0;

    const panel = V.progressPanel({
      radial: V.radialProgress(profile?.xpPct ?? 0, `${profile?.xpPct ?? 0}%`, "Level"),
      stats: V.statCards([
        { value: total.toLocaleString("de-DE"), label: "XP gesamt", accent: true },
        { value: weekXp, label: "XP diese Woche" },
        { value: todayXp, label: "XP heute" },
        { value: profile?.levelName || "–", label: "Level", accent: true }
      ]),
      chartTitle: "XP der letzten 7 Tage",
      chart: V.miniBarChart(weekData)
    });

    const xpBarBlock = `
      <div class="student-card">
        <div class="card-content">
          ${V.xpBar(profile?.xpPct ?? 0)}
          <p class="today-xp-bar__meta"><span>${V.escape(profile?.xpProgressLabel || "")}</span><span>${V.escape(profile?.nextLevelLabel || "")}</span></p>
        </div>
      </div>`;

    const activities =
      log.length > 0
        ? log
            .slice(0, 12)
            .map(
              (e) => `
          <article class="student-card goal-card goal-card--ok">
            <div class="card-content">
              <p class="goal-card__subject">+${V.escape(e.amount)} XP</p>
              <p class="goal-card__what">${V.escape(e.mission_name || e.source || "Aktivität")}</p>
              <p class="goal-card__what">${V.escape(new Date(e.created_at).toLocaleString("de-DE"))}</p>
            </div>
          </article>`
            )
            .join("")
        : this.emptyState({ title: "Noch keine XP-Einträge.", text: "Sammle XP durch Missionen und Lernziele." });

    container.innerHTML = this.pageShell(`
        ${panel}
        ${xpBarBlock}
        ${this.sectionBlock("Letzte Aktivitäten", `<div class="goal-card-grid">${activities}</div>`)}
      `);
  },

  renderMissionGrid(container, items, xpPerMission) {
    if (!container) return;
    const V = this;
    if (!items?.length) {
      container.innerHTML = this.pageShell(this.emptyState({
        title: "Keine Missionen verfügbar.",
        text: "Deine Lehrkraft kann Missionen im Admin-Bereich anlegen."
      }));
      return;
    }

    const earned = items.reduce((a, m) => a + Number(xpPerMission?.[m.id] || 0), 0);
    const totalXp = items.reduce((a, m) => a + Number(m.xp || 0), 0);
    const done = items.filter((m) => Number(xpPerMission?.[m.id] || 0) >= Number(m.xp || 0)).length;
    const pct = items.length ? Math.round((done / items.length) * 100) : 0;

    const cards = items
      .map((item) => {
        const got = Number(xpPerMission?.[item.id] || 0);
        const goal = Math.max(1, Number(item.xp || 0));
        const prog = Math.min(100, Math.round((got / goal) * 100));
        const doneMission = got >= goal;
        return `
          <article class="student-card goal-card ${doneMission ? "goal-card--ok" : "goal-card--open"}">
            <div class="card-content">
              ${item.image_url ? `<img class="mission-card__img" src="${V.escape(item.image_url)}" alt="">` : ""}
              <p class="goal-card__subject">${V.escape(item.name)}</p>
              <p class="goal-card__what">${goal} XP · ${got} erhalten</p>
              ${V.xpBar(prog)}
              <div class="goal-card__meta">
                <span class="status-badge ${doneMission ? "status-badge--ok" : "status-badge--open"}">${doneMission ? "Abgeschlossen" : "Aktiv"}</span>
              </div>
              ${
                item.require_upload
                  ? `<div class="lesson-card__actions mission-card__upload">
                  <input type="file" id="upload_${item.id}" class="file-input" onchange="updateFileLabel(${item.id})">
                  <label for="upload_${item.id}" class="file-label">Beweis hochladen</label>
                  <span id="file-name-${item.id}" class="file-name">Keine Datei</span>
                  <button class="btn-primary" type="button" onclick="uploadMission(${item.id})">Upload senden</button>
                </div>`
                  : ""
              }
            </div>
          </article>`;
      })
      .join("");

    container.innerHTML = V.pageShell(`
        ${V.pageKpi(
          [
            { value: items.length, label: "Missionen", accent: true },
            { value: done, label: "Erledigt" },
            { value: earned, label: "XP erhalten" },
            { value: totalXp, label: "XP möglich" }
          ],
          pct,
          `${done}/${items.length}`,
          "Fortschritt"
        )}
        ${V.sectionBlock("Deine Missionen", `<div class="goal-card-grid">${cards}</div>`)}
      `);
  },

  renderRewardGrid(container, items, userXp) {
    if (!container) return;
    const V = this;
    if (!items?.length) {
      container.innerHTML = this.pageShell(this.emptyState({
        title: "Keine Belohnungen verfügbar.",
        text: "Belohnungen werden von deiner Lehrkraft freigeschaltet."
      }));
      return;
    }

    const xp = Number(userXp || 0);
    const affordable = items.filter((r) => xp >= Number(r.xp || 0)).length;
    const pct = items.length ? Math.round((affordable / items.length) * 100) : 0;

    const cards = items
      .map((item) => {
        const cost = Number(item.xp || 0);
        const can = xp >= cost;
        const prog = cost ? Math.min(100, Math.round((xp / cost) * 100)) : 100;
        return `
          <article class="student-card goal-card ${can ? "goal-card--ok" : "goal-card--open"}">
            <div class="card-content">
              ${item.image_url ? `<img class="reward-card__img" src="${V.escape(item.image_url)}" alt="">` : ""}
              <p class="goal-card__subject">${V.escape(item.name)}</p>
              <p class="goal-card__what">${cost} XP</p>
              ${V.xpBar(prog)}
              <div class="lesson-card__actions">
                <button class="btn-primary" type="button" onclick="redeemReward(${item.id})" ${can ? "" : "disabled"}>${can ? "Einlösen →" : "Noch nicht genug XP"}</button>
              </div>
            </div>
          </article>`;
      })
      .join("");

    container.innerHTML = V.pageShell(`
        ${V.pageKpi(
          [
            { value: xp.toLocaleString("de-DE"), label: "Deine XP", accent: true },
            { value: items.length, label: "Belohnungen" },
            { value: affordable, label: "Einlösbar" }
          ],
          pct,
          `${affordable}/${items.length}`,
          "Freischaltbar"
        )}
        ${V.sectionBlock("Bonuskarten", `<div class="goal-card-grid">${cards}</div>`)}
      `);
  },

  renderCharacterPage(container, u, data, profile) {
    if (!container) return;
    const V = this;
    const xp = Number(u?.xp || 0);
    const char = data.character;
    const traits = (data.traits || []).map((t) => `<span class="open-goal-chip">${V.escape(t)}</span>`).join("");
    const items = (data.items || []).map((i) => `<span class="open-goal-chip">${V.escape(i)}</span>`).join("");

    container.innerHTML = V.pageShell(`
      ${V.pageKpi(
        [
          { value: xp.toLocaleString("de-DE"), label: "XP", accent: true },
          { value: u.level_name || "–", label: "Level" },
          { value: (data.traits || []).length, label: "Eigenschaften" },
          { value: (data.items || []).length, label: "Items" }
        ],
        profile?.xpPct ?? 0,
        `${profile?.xpPct ?? 0}%`,
        "Level"
      )}
      <div class="character-app-grid">
        <div class="student-card character-profile-card">
          <div class="card-content">
            ${char?.image_url ? `<img class="char-img" src="${V.escape(char.image_url)}" alt="">` : ""}
            <div class="char-name">${V.escape(char?.name || u.name || "Charakter")}</div>
          </div>
        </div>
        <div class="student-card">
          <div class="card-content">
            ${V.sectionBlock("Eigenschaften", traits ? `<div class="open-goal-chips">${traits}</div>` : `<p class="empty-state-card__text">Noch keine Eigenschaften.</p>`)}
            ${V.sectionBlock("Items", items ? `<div class="open-goal-chips">${items}</div>` : `<p class="empty-state-card__text">Noch keine Items.</p>`)}
          </div>
        </div>
      </div>
    `);
  }
};
