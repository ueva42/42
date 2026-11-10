/**
 * Lehrer-Cockpit: alles zur laufenden Stunde auf einer Seite.
 * Live-Spuren aus /api/teacher/regulation, Missionen, Training und Klassen-Spiel aus /api/teacher/cockpit.
 * Hinweise, keine Rangliste: Listen sind alphabetisch, Klassen-Mission zeigt nur Zahlen.
 */
(function () {
  const REFRESH_MS = 60000;
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
  const PACE_COLOR = { ok: "#22d3ee", mid: "#fbbf24", low: "#f97316", none: "#64748b" };
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
    showPodiums: true,
    drawerId: null,
    moreOpen: false,
    form: null,
    raffleXp: 10,
    teamXp: 10,
    busy: false,
    reveal: null,
    timer: null,
    /** `${classId}:${date}` nach erfolgreicher Auto-Ziehung oder wenn schon gezogen. */
    autoRaffleDoneKey: null
  };

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
      if (ck.data?.game?.raffle?.drawn) {
        const key = raffleAutoKey();
        if (key) ck.autoRaffleDoneKey = key;
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

  function startTimer() {
    if (ck.timer) return;
    ck.timer = setInterval(() => {
      if (!ck.active || document.hidden || ck.form || ck.busy) return;
      load(true);
    }, REFRESH_MS);
  }

  function stopTimer() {
    if (ck.timer) clearInterval(ck.timer);
    ck.timer = null;
  }

  async function post(url, body) {
    return ck.ctx.api(url, { method: "POST", body: JSON.stringify(body || {}) });
  }

  /* ---------- Kopf und KPI ---------- */

  function renderHead() {
    const d = ck.data;
    const live = liveData();
    const units = d?.levelChecks || [];
    const options = units
      .map(
        (u) =>
          `<option value="${esc(u.id)}" ${String(u.id) === String(d?.levelCheck?.id) ? "selected" : ""}>${esc(u.subject)} · ${esc(u.name)}</option>`
      )
      .join("");
    const lesson = live.lesson?.label ? ` · Stunde ${esc(live.lesson.label)}` : "";
    const target = d?.unit?.target;
    const dates = [];
    if (target) {
      const days = daysBetween(d.date, target.date);
      const when = days === 0 ? "heute" : days === 1 ? "morgen" : `in ${days} Tagen`;
      dates.push(
        `${esc(target.label)} <strong>${esc(fmtDate(target.date))}</strong> (${esc(missionsText(range(1, target.planIndex + 1)))}) · ${when}`
      );
    }
    const exam = (d?.unit?.events || []).find(
      (e) => e.type !== "levelcheck" && e.date >= d.date && !(target && target.kind === "exam" && e.date === target.date)
    );
    if (exam) dates.push(`${esc(exam.label)} <strong>${esc(fmtDate(exam.date))}</strong>`);
    const stamp = ck.updatedAt
      ? ck.updatedAt.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })
      : "–";
    return `
      <div class="ck-context">
        <div>
          <p class="td-kicker">${esc(d?.class?.name || "")}${d?.levelCheck ? ` · ${esc(d.levelCheck.subject)} · ${esc(d.levelCheck.name)}` : ""}${lesson}</p>
          <h1 class="td-title">Cockpit</h1>
        </div>
        <div class="ck-context-side">
          <div class="ck-context-row">
            ${units.length ? `<label class="sr-only" for="unitSelect">Unterrichtseinheit</label><select id="unitSelect" class="td-select ck-select" aria-label="Unterrichtseinheit">${options}</select>` : ""}
            <span class="ck-live" title="Aktualisiert sich jede Minute von selbst"><i></i>Live · ${esc(stamp)}</span>
            <button type="button" class="ck-btn ${ck.beamer ? "ck-btn-go" : ""}" data-ck-beamer title="Klassenwand für den Beamer: Charakter-Roster, Puls, Training">${ck.beamer ? "Lehrkraft-Ansicht" : "Beamer-Ansicht"}</button>
            ${
              ck.beamer
                ? `<button type="button" class="ck-btn ${ck.showPodiums ? "ck-btn-go" : ""}" data-ck-podiums title="Podien ein- oder ausblenden">${ck.showPodiums ? "Podien aus" : "Podien an"}</button>`
                : ""
            }
          </div>
          ${dates.length ? `<p class="ck-dates">${dates.join("<br>")}</p>` : ""}
        </div>
      </div>`;
  }

  function range(a, b) {
    const out = [];
    for (let i = a; i <= b; i++) out.push(i);
    return out;
  }

  function renderKpis() {
    const d = ck.data;
    const list = students();
    const n = list.length || d?.students?.length || 0;
    const live = liveData();
    const withGoal = list.filter((s) => s.today).length;
    const maxWait = live.help.reduce((m, h) => Math.max(m, Number(h.waitMinutes) || 0), 0);
    const pace = { ok: 0, mid: 0, low: 0, none: 0 };
    for (const s of list) pace[s.pace || "none"] += 1;
    const target = d?.unit?.target;
    const days = target ? daysBetween(d.date, target.date) : null;
    const bar = (count, color) => (n ? `<span style="width:${((count / n) * 100).toFixed(1)}%;background:${color}"></span>` : "");
    return `
      <section class="ck-kpis" aria-label="Kennzahlen">
        <div class="ck-kpi ck-kpi--help ck-private">
          <div><div class="ck-num">${live.help.length}</div><div class="ck-kpi-lbl">Hilfe angefragt</div>
          <div class="ck-kpi-sub">${live.help.length ? `längste Wartezeit <span class="ck-wait">${maxWait} min</span>` : "gerade niemand"}</div></div>
        </div>
        <div class="ck-kpi ck-kpi--visit ck-private">
          <div><div class="ck-num">${live.visit.length}</div><div class="ck-kpi-lbl">mal vorbeischauen</div><div class="ck-kpi-sub">Stillstand, Unsicherheit, Muster</div></div>
        </div>
        <button type="button" class="ck-kpi ck-kpi--goal ck-private" data-ck-view="now">
          <div><div class="ck-num">${live.lesson ? live.noGoal.length : withGoal}</div>
          <div class="ck-kpi-lbl">${live.lesson ? "noch ohne Tagesziel" : "mit Tagesziel"}</div>
          <div class="ck-kpi-sub">${live.lesson ? "zählt nach Stundenbeginn" : `${withGoal} von ${n}`}</div></div>
        </button>
        <div class="ck-kpi ck-kpi--stack">
          <div class="ck-row-between"><span class="ck-num ck-num--ok">${pace.ok}<span class="ck-of">/${n}</span></span>
          <span class="ck-kpi-sub">${target ? `${esc(target.label)} ${days === 0 ? "heute" : `in ${days} Tagen`}` : "kein Termin"}</span></div>
          <div class="ck-kpi-lbl">auf Kurs ${target ? `zum ${esc(target.label)}` : ""}</div>
          <div class="ck-bar">${bar(pace.ok, PACE_COLOR.ok)}${bar(pace.mid, PACE_COLOR.mid)}${bar(pace.low, PACE_COLOR.low)}${bar(pace.none, "rgba(100,116,139,.6)")}</div>
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
    const views = ck.beamer ? ["now"] : ["now", "heat"];
    if (!views.includes(ck.view)) ck.view = "now";
    const label = { heat: "Heatmap", now: "Jetzt an der Mission" };
    const body = ck.view === "heat" ? renderHeat() : renderNow();
    return `
      <section class="ck-panel ck-center">
        <h2><span>${esc(VIEW_TITLE[ck.view])}</span>
          ${
            views.length > 1
              ? `<span class="td-seg ck-seg" role="group" aria-label="Ansicht">
            ${views.map((v) => `<button type="button" data-ck-view="${v}" aria-pressed="${ck.view === v ? "true" : "false"}">${label[v]}</button>`).join("")}
          </span>`
              : ""
          }
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
    const pct = k.target ? Math.min(100, Math.round((k.total / k.target) * 100)) : 0;
    const defs = `<defs><linearGradient id="ckGoalG"><stop offset="0" stop-color="#22d3ee"/><stop offset=".5" stop-color="#8b5cf6"/><stop offset="1" stop-color="#f472b6"/></linearGradient></defs>`;
    return `
      <div class="ck-panel ck-game-card">
        <h2><span>Klassenziel</span><span class="td-kicker">gemeinsame XP</span></h2>
        ${
          k.target
            ? `<div class="ck-game-goal">${ring(pct, "url(#ckGoalG)", 112, 12, `${pct} %`, defs)}
                <div><strong>${esc(k.title || "Klassenziel")}</strong>
                <p class="ck-small">${num(k.total)} von ${num(k.target)} XP${k.total < k.target ? ` · noch ${num(k.target - k.total)}` : " · erreicht!"}</p>
                <p class="ck-small ck-muted">+${num(k.xpToday)} XP heute von ${num(k.peopleToday)} Schüler:innen</p></div></div>`
            : `<p class="ck-big">${num(k.total)} <span class="ck-muted ck-small">Klassen-XP</span></p>
               <p class="ck-small ck-muted">Kein Klassenziel aktiv. Lege es in der Verwaltung unter Klassen-Voting an, dann füllt sich hier der Balken.</p>`
        }
        <p class="ck-tiny ck-muted">Zählt alle XP der Klasse zusammen. Jede Glücks-Ziehung und jedes Team des Tages zahlt mit ein.</p>
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

  function renderRaffleCard() {
    const r = ck.data.game?.raffle || {};
    const n = (ck.data.students || []).length;
    let body;
    if (ck.reveal === "rolling") {
      body = `<div class="ck-raffle-roll"><span></span><span></span><span></span></div><p class="ck-small ck-muted">Die Lose werden gemischt …</p>`;
    } else if (r.drawn) {
      body = `
        <div class="ck-raffle-win ${ck.reveal === "show" ? "ck-raffle-win--pop" : ""}">
          <span class="ck-raffle-star">★</span>
          <strong>${esc(r.drawn.winnerShort || r.drawn.winnerName || "?")}</strong>
          <span class="ck-small">+${r.drawn.xp} XP</span>
        </div>
        <p class="ck-small ck-muted">Gezogen aus ${r.drawn.eligibleCount} Losen. Morgen gibt es eine neue Ziehung.</p>`;
    } else {
      body = `
        <p class="ck-big">${r.eligibleCount || 0} <span class="ck-muted ck-small">von ${n} im Lostopf</span></p>
        <p class="ck-small ck-muted">Im Lostopf ist, wer heute den Tagesabschluss gemacht hat. Jedes Los zählt gleich.</p>
        ${raffleAutoHint()}
        <div class="ck-acts">${xpPicker("raffle", ck.raffleXp)}</div>
        <div class="ck-acts"><button type="button" class="ck-btn ck-btn-go" data-ck-raffle ${r.eligibleCount && !ck.busy ? "" : "disabled"}>Ziehung starten</button></div>`;
    }
    return `
      <div class="ck-panel ck-game-card">
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

  function renderGame() {
    // Beamer: kein Team des Tages – nur gemeinsame Ziele / Ziehung
    const team = ck.beamer ? "" : renderTeamCard();
    return `
      <section class="ck-game" aria-label="Klassen-Spiel">
        <h2 class="ck-game-title"><span class="td-kicker">Klassen-Spiel</span></h2>
        <div class="ck-game-grid">
          ${renderGoalCard()}${renderMissionCard()}${renderRaffleCard()}${team}
        </div>
      </section>`;
  }

  function avatarHtml(person, sizeClass = "") {
    const name = person?.name || "?";
    const url = person?.avatarUrl;
    if (url) {
      return `<span class="ck-av ${sizeClass}"><img src="${esc(url)}" alt="" loading="lazy" decoding="async" onerror="this.parentElement.classList.add('ck-av--fallback');this.remove()"><span class="ck-av-fallback" aria-hidden="true">${esc(
        String(name).trim().slice(0, 1).toUpperCase() || "?"
      )}</span></span>`;
    }
    return `<span class="ck-av ck-av--fallback ${sizeClass}" aria-hidden="true">${esc(
      String(name).trim().slice(0, 1).toUpperCase() || "?"
    )}</span>`;
  }

  function renderBeamerPulse() {
    const d = ck.data;
    const wall = d.wall || {};
    const list = students();
    const n = wall.classSize || list.length || d.students?.length || 0;
    const planned = Number(wall.plannedCount) || list.filter((s) => s.today).length;
    const reflected =
      Number(wall.reflectedCount) || (d.students || []).filter((s) => s.reflectedToday).length;
    const xpToday = Number(d.game?.klassenziel?.xpToday) || 0;
    const paceOk = list.filter((s) => s.pace === "ok").length;
    return `
      <section class="ck-wall-pulse" aria-label="Klassenpuls">
        <div class="ck-wall-kpi"><div class="ck-wall-num">${planned}<span>/${n}</span></div><div class="ck-wall-lbl">Tagesziel</div></div>
        <div class="ck-wall-kpi"><div class="ck-wall-num">${reflected}<span>/${n}</span></div><div class="ck-wall-lbl">Abschluss</div></div>
        <div class="ck-wall-kpi"><div class="ck-wall-num">${num(xpToday)}</div><div class="ck-wall-lbl">XP heute</div></div>
        <div class="ck-wall-kpi"><div class="ck-wall-num">${paceOk}<span>/${n}</span></div><div class="ck-wall-lbl">auf Kurs</div></div>
      </section>`;
  }

  function renderBeamerRoster() {
    const wall = ck.data.wall || {};
    const roster = Array.isArray(wall.roster) ? wall.roster : [];
    const n = wall.classSize || (ck.data.students || []).length || 0;
    if (!roster.length) {
      return `
        <section class="ck-wall-panel">
          <h2><span>Wer ist schon dabei?</span><span class="td-kicker">Charakter-Roster</span></h2>
          <p class="ck-wall-empty">Noch niemand hat heute ein Tagesziel gesetzt. Sobald jemand plant, erscheint der Charakter hier.</p>
        </section>`;
    }
    return `
      <section class="ck-wall-panel">
        <h2><span>Wer ist schon dabei?</span><span class="td-kicker">${roster.length} von ${n}</span></h2>
        <div class="ck-wall-roster">
          ${roster
            .map(
              (p) => `
            <article class="ck-wall-tile ${p.reflected ? "is-done" : "is-planned"}">
              ${avatarHtml(p, "ck-av--lg")}
              <strong>${esc(p.name)}</strong>
              <span>${p.reflected ? "Abschluss ✓" : "Ziel gesetzt"}</span>
            </article>`
            )
            .join("")}
        </div>
      </section>`;
  }

  function renderPodiumList(items, detailFn) {
    return `
      <ol class="ck-wall-podium">
        ${items
          .map(
            (p, i) => `
          <li class="ck-wall-podium__item rank-${i + 1}">
            <span class="ck-wall-podium__rank">${i + 1}</span>
            ${avatarHtml(p, "ck-av--md")}
            <div class="ck-wall-podium__meta">
              <strong>${esc(p.name)}</strong>
              <span>${detailFn(p)}</span>
            </div>
          </li>`
          )
          .join("")}
      </ol>`;
  }

  function renderBeamerPodiums() {
    if (!ck.showPodiums) return "";
    const wall = ck.data.wall || {};
    const fastest = Array.isArray(wall.fastest) ? wall.fastest : [];
    const progress = Array.isArray(wall.progress) ? wall.progress : [];
    const catchUp = Array.isArray(wall.catchUp) ? wall.catchUp : [];

    const fastestBody = fastest.length
      ? renderPodiumList(fastest, (p) =>
          p.finishedAt
            ? new Date(p.finishedAt).toLocaleTimeString("de-DE", {
                hour: "2-digit",
                minute: "2-digit"
              })
            : "Abschluss"
        )
      : `<p class="ck-wall-empty">Noch keine Abschlüsse – wer den Tag zuerst beendet, steht hier.</p>`;

    const progressBody = progress.length
      ? renderPodiumList(progress, (p) => {
          const bits = [];
          if (p.sicherToday) bits.push(`+${num(p.sicherToday)} sicher`);
          if (p.trainingToday) bits.push(`${num(p.trainingToday)} Training`);
          return bits.join(" · ") || "Fortschritt";
        })
      : `<p class="ck-wall-empty">Noch keine neuen Sicherungen oder Trainingsstände heute.</p>`;

    const catchBody = catchUp.length
      ? renderPodiumList(catchUp, (p) => {
          const gap = Number(p.gap);
          const gapText =
            Number.isFinite(gap) && gap >= 1
              ? `noch ${gap % 1 ? gap.toFixed(1).replace(".", ",") : gap} hinter Plan`
              : "holt auf";
          return `+${num(p.sicherToday)} sicher · ${gapText}`;
        })
      : `<p class="ck-wall-empty">Niemand hinter dem Plan mit neuem Fortschritt – oder noch keine Sicherungen.</p>`;

    return `
      <div class="ck-wall-podiums">
        <section class="ck-wall-panel ck-wall-panel--podium">
          <h2><span>Schnellste 5</span><span class="td-kicker">Abschluss</span></h2>
          ${fastestBody}
        </section>
        <section class="ck-wall-panel ck-wall-panel--podium">
          <h2><span>Fortschritt</span><span class="td-kicker">heute</span></h2>
          ${progressBody}
        </section>
        <section class="ck-wall-panel ck-wall-panel--podium">
          <h2><span>Aufholer</span><span class="td-kicker">gegen Plan</span></h2>
          ${catchBody}
        </section>
      </div>`;
  }

  function renderBeamerTraining() {
    const d = ck.data;
    const training = d.training || { missions: [] };
    const N = students().length || Math.max(1, (d.students || []).length);
    const { markTiers, stagesEnabled } = levels();
    if (!stagesEnabled) {
      return `
        <section class="ck-wall-panel">
          <h2><span>Trainingscenter</span><span class="td-kicker">Lernstand</span></h2>
          <p class="ck-wall-empty">Diese Klasse nutzt Unterthema statt Rookie/Operator/Street Legend – siehe Missionen in der Mitte.</p>
        </section>`;
    }
    if (!training.missions?.length) {
      return `
        <section class="ck-wall-panel">
          <h2><span>Trainingscenter</span><span class="td-kicker">diese Einheit</span></h2>
          <p class="ck-wall-empty">Diese Einheit ist noch nicht mit dem Trainingscenter verknüpft.</p>
        </section>`;
    }
    const tier = markTiers.includes(ck.tier) ? ck.tier : markTiers[0] || "rookie";
    const color = TIER_COLOR[tier] || TIER_COLOR.rookie;
    return `
      <section class="ck-wall-panel">
        <h2><span>Trainingscenter</span><span class="td-kicker">${esc(TIER_LABEL[tier] || tier)}</span></h2>
        <div class="ck-tier-tabs ck-tier-tabs--wall" role="group" aria-label="Stufe">
          ${markTiers
            .map(
              (t) =>
                `<button type="button" data-ck-tier="${t}" aria-pressed="${t === tier ? "true" : "false"}" class="ck-tier-${t}">${TIER_LABEL[t]}</button>`
            )
            .join("")}
        </div>
        <div class="ck-wall-training">
          ${training.missions
            .map((m) => {
              const goal = goalById(m.goalId);
              const c = m.tiers[tier] || { sicher: 0, teilweise: 0, nochNicht: 0, offen: 0 };
              const w = (k) => ((k / N) * 100).toFixed(1);
              return `<div class="ck-wall-tbar">
                <div class="ck-wall-tbar__head"><strong>M${goal ? goal.number : "?"}</strong><span>${esc(goal?.text || "")}</span><em>${c.sicher}/${N}</em></div>
                <div class="ck-stack ck-stack--wall"><span style="width:${w(c.sicher)}%;background:${color}"></span><span style="width:${w(c.teilweise)}%;background:rgba(148,163,184,.55)"></span><span style="width:${w(c.nochNicht)}%;background:rgba(148,163,184,.28)"></span></div>
              </div>`;
            })
            .join("")}
        </div>
        <div class="ck-legend">
          <span><i class="ck-lg" style="background:${color}"></i>sicher</span>
          <span><i class="ck-lg" style="background:rgba(148,163,184,.55)"></i>teilweise</span>
          <span><i class="ck-lg" style="background:rgba(148,163,184,.28)"></i>angefangen</span>
        </div>
      </section>`;
  }

  function renderBeamerWall() {
    return `
      <div class="ck-wall">
        ${renderBeamerPulse()}
        ${renderBeamerRoster()}
        ${renderBeamerPodiums()}
        ${renderBeamerTraining()}
        <div class="ck-wall-game">
          ${renderGoalCard()}${renderMissionCard()}${renderRaffleCard()}
        </div>
      </div>`;
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
    const toast = ck.toast || ck.ctx?.toast || "";
    const toastHtml = toast ? `<p class="td-toast" role="status">${esc(toast)}</p>` : "";
    if (!ck.data) {
      ck.el.innerHTML = `<div class="ck">${toastHtml}<div class="td-panel td-empty"><strong>${ck.error ? esc(ck.error) : "Lade das Cockpit …"}</strong></div></div>`;
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
            ${renderBeamerWall()}
          </div>`;
        return;
      }
      ck.el.innerHTML = `<div class="ck">${toastHtml}${error}${renderHead()}
        <div class="td-panel td-empty"><strong>${esc(d.message || "Keine Unterrichtseinheit.")}</strong></div>
        ${renderGame()}</div>`;
      return;
    }
    if (ck.beamer) {
      ck.el.innerHTML = `
        <div class="ck ck--beamer">
          ${toastHtml}${error}
          ${renderHead()}
          ${renderBeamerWall()}
        </div>`;
      return;
    }
    ck.el.innerHTML = `
      <div class="ck">
        ${toastHtml}${error}
        ${renderHead()}
        ${renderKpis()}
        <section class="ck-grid">
          ${renderLeft()}
          ${renderCenter()}
          ${renderRight()}
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
    render();
    try {
      const [res] = await Promise.all([
        post("/api/teacher/cockpit/raffle", { classId: ck.classId, xp: ck.raffleXp, auto }),
        new Promise((resolve) => setTimeout(resolve, auto ? 1800 : 1400))
      ]);
      if (doneKey) ck.autoRaffleDoneKey = doneKey;
      ck.reveal = "show";
      await load(false);
      flash(res.message || "Gezogen.");
    } catch (err) {
      ck.reveal = null;
      const msg = err.message || "Die Ziehung hat nicht geklappt.";
      if (auto && /schon gezogen/i.test(msg) && doneKey) {
        ck.autoRaffleDoneKey = doneKey;
        await load(false);
      } else if (!auto || !/Lostopf|niemand/i.test(msg)) {
        flash(msg);
      }
    } finally {
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
        title: ""
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
          title: ck.form.title || ""
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

  function onClick(event) {
    if (!ck.active) return;
    const t = event.target;
    const view = t.closest("[data-ck-view]");
    if (view) {
      ck.view = view.getAttribute("data-ck-view");
      render();
      return;
    }
    if (t.closest("[data-ck-beamer]")) {
      ck.beamer = !ck.beamer;
      ck.drawerId = null;
      render();
      return;
    }
    if (t.closest("[data-ck-podiums]")) {
      ck.showPodiums = !ck.showPodiums;
      render();
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
    if (!ck.active || !ck.form) return;
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
    else if (field === "title") {
      ck.form.title = event.target.value;
      return;
    }
    const titleInput = ck.el.querySelector('[data-ck-form="title"]');
    if (titleInput) titleInput.placeholder = formTitle(ck.form);
  }

  function onKey(event) {
    if (ck.active && event.key === "Escape" && ck.drawerId != null) {
      ck.drawerId = null;
      render();
    }
  }

  function bind() {
    if (ck.bound || !ck.el) return;
    ck.bound = true;
    ck.el.addEventListener("click", onClick);
    ck.el.addEventListener("toggle", onToggle, true);
    ck.el.addEventListener("change", onFormInput);
    ck.el.addEventListener("input", onFormInput);
    document.addEventListener("keydown", onKey);
    document.addEventListener("visibilitychange", () => {
      if (ck.active && !document.hidden && ck.updatedAt && Date.now() - ck.updatedAt.getTime() > REFRESH_MS) load(true);
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
    }
    const key = `${ctx.classId}|${ctx.levelCheckId || ""}`;
    const inFlight = ck.loading && ck.loadingKey === key;
    if ((!ck.data || classChanged || unitChanged) && !inFlight) {
      if (unitChanged) {
        ck.drawerId = null;
        ck.form = null;
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
    document.body.classList.remove("ck-wide", "ck-beamer");
  }

  window.TeacherCockpit = { show, hide };
})();
