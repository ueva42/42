/**
 * Logic Coach – Seitenpanel auf breiten Screens, Blatt von unten auf dem iPad.
 * Sichtbar nur, wenn /api/coach/status enabled liefert.
 */
(function () {
  const LEVELS = [
    { id: "rookie", label: "Rookie" },
    { id: "operator", label: "Operator" },
    { id: "street_legend", label: "Street Legend" }
  ];
  const UNREACHABLE =
    "Der Coach ist gerade nicht erreichbar – frag deine Lehrkraft oder versuch es gleich nochmal.";

  const state = {
    enabled: false,
    statusPromise: null,
    open: false,
    mode: "pick",
    sending: false,
    sessionId: null,
    draft: "",
    messages: [],
    context: emptyContext(),
    picker: null,
    katexPromise: null
  };

  function emptyContext() {
    return {
      competenceId: "",
      level: "",
      tageszielId: "",
      themaLabel: "",
      kompetenzLabel: "",
      subject: ""
    };
  }

  function ui() {
    return window.LogbuchUI;
  }

  function esc(value) {
    const escapeHtml = ui()?.escapeHtml;
    if (escapeHtml) return escapeHtml(value);
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function isMathSubject(name) {
    const value = String(name || "")
      .trim()
      .toLowerCase();
    return value === "mathe" || value === "mathematik" || value === "math";
  }

  function normalizeLevel(raw) {
    const value = String(raw || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "_");
    if (value === "rookie") return "rookie";
    if (value === "operator") return "operator";
    if (value === "street_legend" || value === "streetlegend") return "street_legend";
    return "";
  }

  function levelLabel(id) {
    return LEVELS.find((level) => level.id === id)?.label || "";
  }

  function refreshStatus() {
    if (state.statusPromise) return state.statusPromise;
    state.statusPromise = fetch("/api/coach/status", { credentials: "same-origin" })
      .then((res) => (res.ok ? res.json() : { enabled: false }))
      .then((data) => {
        state.enabled = data?.enabled === true;
        return state.enabled;
      })
      .catch(() => {
        state.enabled = false;
        return false;
      });
    return state.statusPromise;
  }

  function ensureStyle() {
    if (document.getElementById("logic-coach-style")) return;
    const style = document.createElement("style");
    style.id = "logic-coach-style";
    style.textContent = `
      .logic-coach-root[hidden] { display: none !important; }
      .logic-coach-backdrop {
        position: fixed;
        inset: 0;
        z-index: 13000;
        background: rgba(2, 6, 23, 0.62);
      }
      .logic-coach-panel {
        position: fixed;
        z-index: 13010;
        display: flex;
        flex-direction: column;
        background:
          radial-gradient(circle at 90% 0%, rgba(217, 70, 239, 0.22), transparent 36%),
          linear-gradient(180deg, #1a0f2e 0%, #071126 52%, #05091a 100%);
        color: #eef4ff;
        border: 1px solid rgba(240, 171, 252, 0.38);
        box-shadow: 0 18px 50px rgba(0, 0, 0, 0.45), 0 0 32px rgba(217, 70, 239, 0.18);
        font-family: system-ui, Arial, sans-serif;
      }
      @media (max-width: 1080px) {
        .logic-coach-panel {
          left: 0;
          right: 0;
          bottom: 0;
          height: min(86vh, 780px);
          border-radius: 22px 22px 0 0;
          padding-bottom: env(safe-area-inset-bottom);
        }
      }
      @media (min-width: 1081px) {
        .logic-coach-panel {
          top: 0;
          right: 0;
          bottom: 0;
          width: min(440px, 100vw);
        }
      }
      .logic-coach-head {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 16px 16px 8px;
      }
      .logic-coach-head img {
        width: 48px;
        height: 48px;
        object-fit: contain;
      }
      .logic-coach-title {
        margin: 0;
        font-family: "Orbitron", system-ui, sans-serif;
        font-size: 18px;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: #f5d0fe;
      }
      .logic-coach-close,
      .logic-coach-btn,
      .logic-coach-key,
      .logic-coach-send,
      .lp-coach-btn,
      .coach-ask-btn {
        min-height: 48px;
        border-radius: 14px;
        border: 1px solid rgba(240, 171, 252, 0.4);
        background: rgba(255, 255, 255, 0.08);
        color: #eef4ff;
        font: inherit;
        font-weight: 700;
        cursor: pointer;
      }
      .logic-coach-close {
        margin-left: auto;
        min-width: 48px;
        padding: 0 14px;
      }
      .logic-coach-hint {
        margin: 0 16px 10px;
        color: #fbcfe8;
        font-size: 13px;
        line-height: 1.4;
      }
      .logic-coach-body {
        flex: 1;
        overflow: auto;
        padding: 0 16px 12px;
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .logic-coach-context {
        margin: 0;
        color: #f5d0fe;
        font-size: 13px;
      }
      .logic-coach-choice,
      .logic-coach-level {
        width: 100%;
        text-align: left;
        padding: 12px 14px;
      }
      .logic-coach-level.is-on,
      .logic-coach-choice.is-on {
        background: rgba(217, 70, 239, 0.28);
      }
      .logic-coach-msg {
        margin: 0;
        padding: 12px 14px;
        border-radius: 16px;
        line-height: 1.45;
        white-space: pre-wrap;
      }
      .logic-coach-msg--schueler {
        align-self: flex-end;
        max-width: 92%;
        background: rgba(255, 255, 255, 0.1);
      }
      .logic-coach-msg--coach,
      .logic-coach-msg--wait {
        align-self: flex-start;
        max-width: 96%;
        background: rgba(217, 70, 239, 0.16);
        border: 1px solid rgba(240, 171, 252, 0.28);
      }
      .logic-coach-form {
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 8px 16px 16px;
      }
      .logic-coach-form[hidden] { display: none !important; }
      .logic-coach-keys { display: flex; flex-wrap: wrap; gap: 8px; }
      .logic-coach-key { min-width: 52px; padding: 0 12px; font-size: 18px; }
      .logic-coach-input {
        width: 100%;
        min-height: 72px;
        resize: vertical;
        border-radius: 14px;
        border: 1px solid rgba(255, 255, 255, 0.16);
        background: rgba(5, 9, 26, 0.72);
        color: #eef4ff;
        font: inherit;
        font-size: 16px;
        padding: 12px;
      }
      .logic-coach-send { padding: 0 16px; background: rgba(217, 70, 239, 0.85); }
      .logic-coach-select, .lp-coach-btn, .coach-ask-btn {
        width: 100%;
        margin-top: 8px;
        padding: 10px 12px;
      }
      .logic-coach-select {
        min-height: 48px;
        border-radius: 14px;
        border: 1px solid rgba(255, 255, 255, 0.16);
        background: rgba(5, 9, 26, 0.72);
        color: #eef4ff;
        font: inherit;
        font-size: 16px;
      }
      .lp-coach-btn, .coach-ask-btn { width: auto; }
      .today-block-stack { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
      .today-block-stack .hub-tile { width: 100%; }
      .katex { font-size: 1.05em; }
    `;
    document.head.appendChild(style);
  }

  function ensureKatex() {
    if (window.katex) return Promise.resolve();
    if (state.katexPromise) return state.katexPromise;
    state.katexPromise = new Promise((resolve) => {
      if (!document.getElementById("katex-css")) {
        const link = document.createElement("link");
        link.id = "katex-css";
        link.rel = "stylesheet";
        link.href = "/vendor/katex/katex.min.css?v=1";
        document.head.appendChild(link);
      }
      const script = document.createElement("script");
      script.src = "/vendor/katex/katex.min.js?v=1";
      script.onload = () => resolve();
      script.onerror = () => resolve();
      document.head.appendChild(script);
    });
    return state.katexPromise;
  }

  function renderMath(text) {
    const source = String(text || "");
    const pattern = /\$([^$\n]+)\$/g;
    let html = "";
    let last = 0;
    let match = pattern.exec(source);
    while (match) {
      html += esc(source.slice(last, match.index));
      const tex = match[1];
      if (window.katex) {
        try {
          html += window.katex.renderToString(tex, { throwOnError: false, displayMode: false });
        } catch {
          html += esc(match[0]);
        }
      } else {
        html += esc(match[0]);
      }
      last = match.index + match[0].length;
      match = pattern.exec(source);
    }
    html += esc(source.slice(last));
    return html;
  }

  function ensurePanel() {
    ensureStyle();
    let root = document.getElementById("logicCoachRoot");
    if (root) return root;
    root = document.createElement("div");
    root.id = "logicCoachRoot";
    root.className = "logic-coach-root";
    root.hidden = true;
    root.innerHTML = `
      <div class="logic-coach-backdrop" data-coach-action="close"></div>
      <section class="logic-coach-panel" role="dialog" aria-modal="true" aria-labelledby="logicCoachTitle">
        <header class="logic-coach-head">
          <img src="/icons/student/png/logic-coach.png?v=1" alt="" width="48" height="48">
          <h2 class="logic-coach-title" id="logicCoachTitle">Logic Coach</h2>
          <button type="button" class="logic-coach-close" data-coach-action="close" aria-label="Schließen">✕</button>
        </header>
        <p class="logic-coach-hint">Der Coach ist eine KI und kann sich irren. Bei Unsicherheit frag deine Lehrkraft.</p>
        <div class="logic-coach-body" id="logicCoachBody"></div>
        <form class="logic-coach-form" id="logicCoachForm">
          <div class="logic-coach-keys">
            <button type="button" class="logic-coach-key" data-coach-insert="/" aria-label="Bruchstrich">a/b</button>
            <button type="button" class="logic-coach-key" data-coach-insert="^" aria-label="Hochzahl">xⁿ</button>
            <button type="button" class="logic-coach-key" data-coach-insert="√" aria-label="Wurzel">√</button>
            <button type="button" class="logic-coach-key" data-coach-insert="·" aria-label="Mal">·</button>
            <button type="button" class="logic-coach-key" data-coach-insert=":" aria-label="Geteilt">:</button>
          </div>
          <textarea class="logic-coach-input" id="logicCoachInput" placeholder="Schreib deine Frage oder deinen Rechenweg."></textarea>
          <button type="submit" class="logic-coach-send">Senden</button>
        </form>
      </section>`;
    document.body.appendChild(root);
    root.addEventListener("click", onRootClick);
    root.querySelector("#logicCoachForm")?.addEventListener("submit", (event) => {
      event.preventDefault();
      send();
    });
    root.querySelector("#logicCoachInput")?.addEventListener("input", (event) => {
      state.draft = event.target.value;
    });
    return root;
  }

  function onRootClick(event) {
    const insert = event.target.closest("[data-coach-insert]");
    if (insert) {
      event.preventDefault();
      insertToken(insert.dataset.coachInsert || "");
      return;
    }
    const action = event.target.closest("[data-coach-action]");
    if (!action) return;
    const name = action.dataset.coachAction;
    if (name === "close") close();
    if (name === "today") useTodayGoal();
    if (name === "level") {
      state.picker.level = action.dataset.level || "rookie";
      renderBody();
    }
    if (name === "start") startFromPicker();
  }

  function insertToken(token) {
    const input = document.getElementById("logicCoachInput");
    if (!input) {
      state.draft += token;
      return;
    }
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? start;
    const next = input.value.slice(0, start) + token + input.value.slice(end);
    input.value = next;
    state.draft = next;
    const pos = start + token.length;
    input.focus();
    input.setSelectionRange(pos, pos);
  }

  function contextLine() {
    const parts = [state.context.themaLabel, state.context.kompetenzLabel, levelLabel(state.context.level)]
      .map((part) => String(part || "").trim())
      .filter(Boolean);
    if (!parts.length) return "";
    return `<p class="logic-coach-context">${esc(parts.join(" · "))}</p>`;
  }

  function renderMessages() {
    const rows = state.messages
      .map((msg) => {
        const kind = msg.role === "coach" ? "coach" : "schueler";
        const body = kind === "coach" ? renderMath(msg.text) : esc(msg.text);
        return `<p class="logic-coach-msg logic-coach-msg--${kind}">${body}</p>`;
      })
      .join("");
    const wait = state.sending
      ? `<p class="logic-coach-msg logic-coach-msg--wait">Coach denkt nach…</p>`
      : "";
    return `${contextLine()}${rows}${wait}`;
  }

  function renderPicker() {
    const picker = state.picker;
    if (!picker || picker.loading) {
      return `<p class="logic-coach-msg logic-coach-msg--wait">Themen werden geladen…</p>`;
    }
    if (picker.error) {
      return `<p class="logic-coach-msg logic-coach-msg--coach">${esc(picker.error)}</p>`;
    }
    const today = picker.today;
    const todayBtn = today
      ? `<button type="button" class="logic-coach-choice" data-coach-action="today">Mein heutiges Tagesziel</button>`
      : "";
    const topicOptions = (picker.topics || [])
      .map(
        (topic) =>
          `<option value="${esc(topic.id)}" ${topic.id === picker.themaId ? "selected" : ""}>${esc(topic.name)}</option>`
      )
      .join("");
    const topic = (picker.topics || []).find((item) => item.id === picker.themaId) || picker.topics?.[0];
    const goalOptions = (topic?.goals || [])
      .map(
        (goal) =>
          `<option value="${esc(goal.id)}" ${goal.id === picker.goalId ? "selected" : ""}>${esc(goal.text)}</option>`
      )
      .join("");
    const levels = LEVELS.map(
      (level) =>
        `<button type="button" class="logic-coach-level ${picker.level === level.id ? "is-on" : ""}" data-coach-action="level" data-level="${level.id}">${esc(level.label)}</button>`
    ).join("");
    const choose = topicOptions
      ? `
        <label class="logic-coach-context" for="logicCoachThema">Mathe-Thema</label>
        <select class="logic-coach-select" id="logicCoachThema">${topicOptions}</select>
        <label class="logic-coach-context" for="logicCoachGoal">Kompetenz</label>
        <select class="logic-coach-select" id="logicCoachGoal">${goalOptions}</select>
        <p class="logic-coach-context">Level</p>
        ${levels}
        <button type="button" class="logic-coach-btn" data-coach-action="start">Coach fragen</button>`
      : `<p class="logic-coach-msg logic-coach-msg--coach">Für Mathe ist noch kein Thema hinterlegt. Frag deine Lehrkraft.</p>`;
    return `
      <p class="logic-coach-context">Wobei soll der Coach helfen?</p>
      ${todayBtn}
      ${choose}`;
  }

  function renderBody() {
    const body = document.getElementById("logicCoachBody");
    const form = document.getElementById("logicCoachForm");
    if (!body) return;
    body.innerHTML = state.mode === "pick" ? renderPicker() : renderMessages();
    if (form) form.hidden = state.mode !== "chat";
    const thema = document.getElementById("logicCoachThema");
    const goal = document.getElementById("logicCoachGoal");
    thema?.addEventListener("change", () => {
      state.picker.themaId = thema.value;
      const topic = state.picker.topics.find((item) => item.id === thema.value);
      state.picker.goalId = topic?.goals?.[0]?.id || "";
      renderBody();
    });
    goal?.addEventListener("change", () => {
      state.picker.goalId = goal.value;
    });
    if (state.mode === "chat") body.scrollTop = body.scrollHeight;
  }

  function show() {
    const root = ensurePanel();
    root.hidden = false;
    state.open = true;
    renderBody();
    ensureKatex().then(() => {
      if (state.open && state.mode === "chat") renderBody();
    });
  }

  function close() {
    const root = document.getElementById("logicCoachRoot");
    if (root) root.hidden = true;
    state.open = false;
  }

  function open(options = {}) {
    if (!state.enabled) return;
    state.context = {
      competenceId: String(options.competenceId || ""),
      level: normalizeLevel(options.level),
      tageszielId: String(options.tageszielId || ""),
      themaLabel: options.themaLabel || "",
      kompetenzLabel: options.kompetenzLabel || "",
      subject: options.subject || ""
    };
    state.sessionId = null;
    state.messages = [];
    state.draft = "";
    state.sending = false;
    const hasGoal = Boolean(state.context.competenceId || state.context.tageszielId);
    if (!hasGoal) {
      state.mode = "pick";
      state.picker = { loading: true, topics: [], today: null, level: "rookie" };
      show();
      loadPicker();
      return;
    }
    state.mode = "chat";
    show();
    const input = document.getElementById("logicCoachInput");
    if (input) input.value = "";
  }

  async function loadPicker() {
    try {
      const [todayRes, planRes] = await Promise.all([
        fetch("/api/student/log/today", { credentials: "same-origin" }),
        fetch("/api/student/levelplan", { credentials: "same-origin" })
      ]);
      const today = todayRes.ok ? await todayRes.json() : null;
      const plan = planRes.ok ? await planRes.json() : null;
      const blocks = Array.isArray(today?.blocks) ? today.blocks : [];
      const mathBlock = blocks.find((block) => {
        const entry = block?.entry;
        const subject = entry?.subject || block?.slot?.subject;
        return isMathSubject(subject) && entry && (entry.level_goal_text || entry.what_goal_text || entry.goal);
      });
      const topics = [];
      for (const group of plan?.grouped || []) {
        if (!isMathSubject(group.subject)) continue;
        for (const check of group.levelChecks || []) {
          const goals = (check.goals || [])
            .filter((goal) => goal?.id)
            .map((goal) => ({ id: String(goal.id), text: goal.text || "Kompetenz" }));
          if (goals.length) topics.push({ id: String(check.id), name: check.name || "Thema", goals });
        }
      }
      state.picker = {
        loading: false,
        today: mathBlock?.entry || null,
        topics,
        themaId: topics[0]?.id || "",
        goalId: topics[0]?.goals?.[0]?.id || "",
        level: normalizeLevel(mathBlock?.entry?.selected_level) || "rookie"
      };
    } catch {
      state.picker = {
        loading: false,
        today: null,
        topics: [],
        error: "Die Themen konnten nicht geladen werden. Versuch es gleich nochmal."
      };
    }
    if (state.open && state.mode === "pick") renderBody();
  }

  function useTodayGoal() {
    const entry = state.picker?.today;
    if (!entry) return;
    state.context = {
      competenceId: String(entry.what_goal_id || ""),
      level: normalizeLevel(entry.selected_level) || state.picker.level || "",
      tageszielId: String(entry.id || ""),
      themaLabel: entry.subject || "Mathe",
      kompetenzLabel: entry.what_goal_text || entry.level_goal_text || "Tagesziel",
      subject: entry.subject || "Mathe"
    };
    if (!state.context.level) state.context.level = state.picker?.level || "rookie";
    state.sessionId = null;
    state.messages = [];
    state.mode = "chat";
    renderBody();
  }

  function startFromPicker() {
    const picker = state.picker;
    const topic = (picker?.topics || []).find((item) => item.id === picker.themaId);
    const goal = (topic?.goals || []).find((item) => item.id === picker.goalId) || topic?.goals?.[0];
    if (!goal || !picker.level) return;
    state.context = {
      competenceId: goal.id,
      level: picker.level,
      tageszielId: "",
      themaLabel: topic.name,
      kompetenzLabel: goal.text,
      subject: "Mathe"
    };
    state.sessionId = null;
    state.messages = [];
    state.mode = "chat";
    renderBody();
    document.getElementById("logicCoachInput")?.focus();
  }

  async function send() {
    const input = document.getElementById("logicCoachInput");
    const text = String(input?.value ?? state.draft).trim();
    if (!text || state.sending || state.mode !== "chat") return;
    if (!state.context.competenceId && !state.context.tageszielId) return;
    state.messages.push({ role: "schueler", text });
    state.draft = "";
    if (input) input.value = "";
    state.sending = true;
    renderBody();
    try {
      const res = await fetch("/api/coach/message", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: state.sessionId || undefined,
          nachricht: text,
          kontext: {
            competenceId: state.context.competenceId || undefined,
            level: state.context.level || undefined,
            tageszielId: state.context.tageszielId || undefined,
            schuelerantwort: text
          }
        })
      });
      const data = await res.json().catch(() => ({}));
      if (data.sessionId) state.sessionId = data.sessionId;
      state.messages.push({ role: "coach", text: data.nachricht || UNREACHABLE });
    } catch {
      state.messages.push({ role: "coach", text: UNREACHABLE });
    }
    state.sending = false;
    if (state.open) renderBody();
  }

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && state.open) close();
  });

  ensureStyle();

  window.LogbuchCoach = {
    refreshStatus,
    isEnabled() {
      return state.enabled === true;
    },
    isMathSubject,
    open,
    close
  };
})();
