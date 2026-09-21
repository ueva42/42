/**
 * SRL-Logbuch – MEIN TAG (App-Card Layout).
 */
(function () {
  const UI = () => window.LogbuchUI;

  const state = {
    date: null,
    data: null,
    loading: false,
    slideDir: null
  };

  function todayIso() {
    return new Date().toISOString().slice(0, 10);
  }

  function addSchoolDays(dateIso, delta) {
    const d = new Date(`${dateIso}T12:00:00`);
    const step = delta > 0 ? 1 : -1;
    let remaining = Math.abs(delta);
    while (remaining > 0) {
      d.setDate(d.getDate() + step);
      const day = d.getDay();
      if (day >= 1 && day <= 5) remaining--;
    }
    return d.toISOString().slice(0, 10);
  }

  function isEditableDate(dateIso) {
    return dateIso === todayIso();
  }

  function goalAchievedSymbol(value) {
    if (value === "ja") return "✓";
    if (value === "teilweise") return "◐";
    if (value === "nein") return "✗";
    return "–";
  }

  function blockNeedsMidCheck(block, entry) {
    if (block && typeof block.needsMidCheck === "boolean") return block.needsMidCheck;
    if (entry && typeof entry.needsMidCheck === "boolean") return entry.needsMidCheck;
    return false;
  }

  function blockPhases(entry, needsMidCheck = true) {
    return {
      plan: !!entry,
      check: needsMidCheck ? !!entry?.hasCheck : true,
      reflect: !!entry?.hasReflection,
      checkRequired: needsMidCheck
    };
  }

  function visibleBlocks(blocks) {
    return (blocks || []).filter(
      (b) => b?.slot?.subject && b.slot.subject !== "Frei" && !b.isFree
    );
  }

  function renderPhasePills(phases) {
    const items = [
      { key: "plan", label: "Plan" },
      ...(phases.checkRequired === false ? [] : [{ key: "check", label: "Check" }]),
      { key: "reflect", label: "Reflexion" }
    ];
    return items
      .map(
        (p) =>
          `<span class="phase-pill ${phases[p.key] ? "is-done" : ""}">${phases[p.key] ? "✓" : "○"} ${p.label}</span>`
      )
      .join("");
  }

  function renderActionSelect(entry, needsMidCheck) {
    const ui = UI();
    const hasCheck = entry.hasCheck;
    const hasReflection = entry.hasReflection;
    const checkRequired = needsMidCheck !== false;

    if ((checkRequired ? hasCheck : true) && hasReflection) {
      return `<p class="today-block-done-label">Alle Schritte erledigt ✓</p>`;
    }

    let options = `<option value="">Nächster Schritt…</option>`;
    if (checkRequired) {
      if (!hasCheck) {
        options += `<option value="check">Zwischen-Check</option>`;
      } else {
        options += `<option value="" disabled>Check ✓</option>`;
      }
    }
    if (!hasReflection) {
      options += `<option value="reflect">Tagesabschluss</option>`;
    } else {
      options += `<option value="" disabled>Abschluss ✓</option>`;
    }

    return `
      <select class="logbuch-select today-action-select today-app-select" data-entry-id="${ui.escapeHtml(entry.id)}">
        ${options}
      </select>`;
  }

  function renderDailyGoalBody(ui, entry) {
    if (entry.level_goal_text) {
      const meta = [];
      if (entry.what_goal_text) meta.push(entry.what_goal_text);
      if (entry.level_label) meta.push(entry.level_label);
      return `
        <div class="today-focus-card">
          <p class="today-focus-card-title">Dein Tagesziel</p>
          ${meta.length ? `<p class="today-focus-meta">${ui.escapeHtml(meta.join(" · "))}</p>` : ""}
          <p class="lesson-card__goal"><strong>Ziel:</strong> ${ui.escapeHtml(entry.level_goal_text)}</p>
          ${
            entry.how_goal_text || entry.goal
              ? `<p class="lesson-card__goal"><strong>Mein Weg zum Ziel:</strong> ${ui.escapeHtml(entry.how_goal_text || entry.goal || "")}</p>`
              : ""
          }
        </div>`;
    }
    const titleText = entry.plan_sentence || entry.goal;
    if (!titleText) return "";
    const detailText = entry.details_text ? `Konkret: ${entry.details_text}` : "";
    return `
      <p class="lesson-card__goal">${ui.escapeHtml(titleText)}</p>
      ${detailText ? `<p class="today-block-muted">${ui.escapeHtml(detailText)}</p>` : ""}`;
  }

  function renderCheckSummary(ui, entry) {
    const c = entry.check;
    if (!c?.on_track) return "";

    const isLegacy = ["👍", "😐", "👎"].includes(c.on_track);
    if (isLegacy) {
      return `<p class="today-block-muted">Zwischen-Check abgeschlossen</p>`;
    }

    return `
      <p class="today-block-muted">
        Check: ${ui.escapeHtml(c.on_track)} · Verstanden: ${ui.escapeHtml(c.understands)} · Fortschritt: ${ui.escapeHtml(c.progress)}
      </p>`;
  }

  function renderReflectionSummary(ui, entry) {
    const r = entry.reflection;
    if (!r) return "";

    const goalText =
      r.goal_reached_answer ||
      (r.goal_achieved === "ja"
        ? "Ja"
        : r.goal_achieved === "teilweise"
          ? "Teilweise"
          : r.goal_achieved === "nein"
            ? "Nein"
            : r.goal_achieved || "–");

    return `
      <p class="today-block-muted">
        Reflexion: ${goalAchievedSymbol(r.goal_achieved)} ${ui.escapeHtml(goalText)}
        · Sicherheit ${entry.confidence_before ?? "–"} → ${r.confidence_after}/5
      </p>`;
  }

  function navButton(label, nav, query, primary = false, className = "") {
    const ui = UI();
    const cls = className || (primary ? "today-app-btn" : "today-app-btn today-app-btn--ghost");
    return `
      <button type="button" class="${cls}" data-nav="${ui.escapeHtml(nav)}" data-query="${ui.escapeHtml(query)}">
        ${ui.escapeHtml(label)} →
      </button>`;
  }

  function primaryAction(entry, editable, needsMidCheck) {
    if (!editable || entry.hasReflection) return null;
    if (needsMidCheck !== false && !entry.hasCheck) {
      return navButton("Zwischen-Check", "check", new URLSearchParams({ entryId: entry.id }).toString(), true);
    }
    return navButton("Tagesabschluss", "reflect", new URLSearchParams({ entryId: entry.id }).toString(), true);
  }

  function appPrimaryButton(label, nav, query) {
    const ui = UI();
    return `
      <button type="button" class="today-app-btn" data-nav="${ui.escapeHtml(nav)}" data-query="${ui.escapeHtml(query)}">
        ${ui.escapeHtml(label)} <span aria-hidden="true">→</span>
      </button>`;
  }

  function nextStepHint(blockList, editable) {
    if (!blockList.length) return "Heute sind keine Stunden eingetragen.";
    if (!editable) return "Schau dir deine Stunden an.";
    for (const block of blockList) {
      const subject = block.entry?.subject || block.slot?.subject || "deiner Stunde";
      if (groupModeForSubject(subject)) {
        return `Als Nächstes: Gruppenarbeit in ${subject} starten oder fortsetzen.`;
      }
      if (!block.entry) return `Setze als Nächstes dein Tagesziel in ${subject}.`;
      if (blockNeedsMidCheck(block, block.entry) && !block.entry.hasCheck) {
        return `Als Nächstes: Zwischen-Check in ${subject}.`;
      }
      if (!block.entry.hasReflection) return `Als Nächstes: Tagesabschluss in ${subject}.`;
    }
    return "Stark – alle Stunden für heute sind erledigt.";
  }

  function lessonStatus(block) {
    if (!block.entry) return { key: "open", label: "Offen" };
    if (block.entry.hasReflection) return { key: "done", label: "Erledigt" };
    return { key: "active", label: "Begonnen" };
  }

  function subjectSlug(name) {
    return String(name || "")
      .toLowerCase()
      .replace(/ä/g, "ae")
      .replace(/ö/g, "oe")
      .replace(/ü/g, "ue")
      .replace(/ß/g, "ss")
      .replace(/[^a-z0-9]+/g, "");
  }

  function subjectGlyph(kind) {
    const icons = {
      calc: '<path d="M16 8h16v32H16z"/><path d="M20 14h8"/><path d="M20 22h3M25 22h3M20 27h3M25 27h3M20 32h3M25 32h3"/>',
      book: '<path d="M12 10h11v28H14a2 2 0 0 1-2-2z"/><path d="M36 10H25v28h10a2 2 0 0 0 2-2z"/><path d="M24 10v28"/>',
      flask: '<path d="M20 8h8v10l8 16a6 6 0 0 1-5 8H17a6 6 0 0 1-5-8l8-16z"/><path d="M18 28h12"/>',
      chat: '<path d="M12 14h24v16H20l-8 8z"/>',
      globe: '<circle cx="24" cy="24" r="14"/><path d="M10 24h28M24 10c4 4 6 9 6 14s-2 10-6 14c-4-4-6-9-6-14s2-10 6-14z"/>',
      column: '<path d="M12 38h24M16 14h16M18 14v24M30 14v24M14 10h20"/>',
      puzzle: '<path d="M12 12h10v6a4 4 0 1 0 4 0v-6h10v10h-6a4 4 0 1 0 0 4h6v10H26v-6a4 4 0 1 0-4 0v6H12V26h6a4 4 0 1 0 0-4h-6z"/>',
      atom: '<circle cx="24" cy="24" r="3"/><ellipse cx="24" cy="24" rx="16" ry="7"/><ellipse cx="24" cy="24" rx="16" ry="7" transform="rotate(60 24 24)"/><ellipse cx="24" cy="24" rx="16" ry="7" transform="rotate(-60 24 24)"/>',
      leaf: '<path d="M24 38c12-4 16-16 16-26-12 0-24 8-26 22 6-2 10-2 10-2"/><path d="M24 38V18"/>',
      home: '<path d="M8 22l16-12 16 12v16H8z"/><path d="M20 38V26h8v12"/>',
      cog: '<circle cx="24" cy="24" r="6"/><path d="M24 8v5M24 35v5M8 24h5M35 24h5M12 12l4 4M32 32l4 4M36 12l-4 4M16 32l-4 4"/>',
      people: '<circle cx="18" cy="16" r="5"/><circle cx="30" cy="16" r="5"/><path d="M8 36c1-6 5-10 10-10s9 4 10 10"/><path d="M20 36c1-6 5-10 10-10s9 4 10 10"/>',
      note: '<path d="M16 12h16v24H16z"/><path d="M20 18h8M20 24h8M20 30h5"/><circle cx="32" cy="32" r="5"/><path d="M37 32V18l5-2"/>',
      palette: '<circle cx="24" cy="24" r="14"/><circle cx="18" cy="18" r="2"/><circle cx="28" cy="16" r="2"/><circle cx="32" cy="24" r="2"/><circle cx="18" cy="28" r="3"/>',
      bag: '<path d="M12 18h24l-2 18H14z"/><path d="M18 18V14a6 6 0 0 1 12 0v4"/>',
      scale: '<path d="M24 8v28M12 38h24"/><path d="M24 14l-12 8h24z"/><path d="M14 22v6a4 4 0 0 0 8 0v-6M26 22v6a4 4 0 0 0 8 0v-6"/>',
      bolt: '<path d="M26 6L12 26h10l-2 16 16-22H26z"/>',
      group: '<circle cx="24" cy="14" r="5"/><circle cx="12" cy="18" r="4"/><circle cx="36" cy="18" r="4"/><path d="M8 36c1-6 6-10 16-10s15 4 16 10"/>'
    };
    const body = icons[kind] || icons.book;
    return `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
  }

  function subjectVisual(name) {
    const map = {
      mathe: { accent: "orange", icon: "calc" },
      deutsch: { accent: "cyan", icon: "book" },
      bnt: { accent: "green", icon: "flask" },
      englisch: { accent: "blue", icon: "chat" },
      geo: { accent: "teal", icon: "globe" },
      geschichte: { accent: "gold", icon: "column" },
      projekt: { accent: "pink", icon: "puzzle" },
      physik: { accent: "violet", icon: "atom" },
      chemie: { accent: "magenta", icon: "flask" },
      biologie: { accent: "green", icon: "leaf" },
      aes: { accent: "pink", icon: "home" },
      technik: { accent: "gold", icon: "cog" },
      franzoesisch: { accent: "blue", icon: "chat" },
      gk: { accent: "purple", icon: "people" },
      musik: { accent: "violet", icon: "note" },
      bk: { accent: "pink", icon: "palette" },
      wbs: { accent: "gold", icon: "bag" },
      religionethik: { accent: "teal", icon: "scale" }
    };
    return map[subjectSlug(name)] || { accent: "cyan", icon: "bolt" };
  }

  function goalHint(entry) {
    if (!entry) return "Noch kein Tagesziel.";
    return (
      entry.level_goal_text ||
      entry.what_goal_text ||
      entry.plan_sentence ||
      entry.goal ||
      "Tagesziel gesetzt."
    );
  }

  function renderSubjectTile({ subject, time, hint, cta, nav, query, done, group }) {
    const ui = UI();
    const visual = subjectVisual(subject);
    const accent = group ? "green" : visual.accent;
    const artSrc = !group ? window.LogbuchVisuals?.subjectIconSrc(subject) : "";
    const art = artSrc
      ? `<div class="dashboard-card__artwork hub-tile-art" data-fit="cover" aria-hidden="true">
          <img class="dashboard-card__hero" src="${ui.escapeHtml(artSrc)}" alt="" loading="lazy" decoding="async" style="--art-position: center right">
        </div>`
      : `<span class="today-subject-tile__glyph" aria-hidden="true">${subjectGlyph(group ? "group" : visual.icon)}</span>`;
    const title = ui.escapeHtml(subject || "Lernzeit");
    const timeHtml = time ? `<span class="today-subject-tile__time">${ui.escapeHtml(time)}</span>` : "";
    const hintHtml = hint
      ? `<span class="today-subject-tile__text">${ui.escapeHtml(hint)}</span>`
      : "";
    const ctaHtml = cta
      ? `<span class="today-subject-tile__cta">${ui.escapeHtml(cta)} <span class="hub-tile-arrow" aria-hidden="true">→</span></span>`
      : "";
    const tileClass = `today-subject-tile hub-tile hub-tile-sm dashboard-card app-card hub-accent-${accent}${done ? " is-done" : ""}${artSrc ? " today-subject-tile--has-art" : ""}`;
    const inner = `
      ${art}
      <span class="today-subject-tile__copy hub-tile-content">
        ${timeHtml}
        <span class="today-subject-tile__title">${title}</span>
        ${hintHtml}
        ${ctaHtml}
      </span>`;

    if (!nav) {
      return `<article class="${tileClass}">${inner}</article>`;
    }
    return `
      <button type="button"
        class="${tileClass}"
        data-nav="${ui.escapeHtml(nav)}"
        data-query="${ui.escapeHtml(query || "")}">
        ${inner}
      </button>`;
  }

  function mergeGroupModeFromBootstrap(todayData, bootstrap) {
    const map = { ...(todayData.groupModeBySubject || {}) };
    for (const s of bootstrap?.enabledSubjects || []) {
      const key = String(s.subject || "").trim();
      if (!key || !s.enabled) continue;
      if (!map[key]) {
        map[key] = { enabled: true, activeSessionId: null, status: null };
      } else {
        map[key].enabled = true;
      }
    }
    for (const s of bootstrap?.activeSessions || []) {
      const key = Object.keys(map).find(
        (k) => k.toLowerCase() === String(s.subject || "").toLowerCase()
      ) || String(s.subject || "").trim();
      if (!key) continue;
      if (!map[key]) map[key] = { enabled: true, activeSessionId: null, status: null };
      map[key].enabled = true;
      map[key].activeSessionId = s.id;
      map[key].status = s.status;
    }
    todayData.groupModeBySubject = map;
    return todayData;
  }

  function renderTodayOverview(d, blockList, editable) {
    const ui = UI();

    return `
      <section class="today-overview" aria-label="Mein Tag">
        <article class="today-overview-hero">
          <div class="today-overview-hero__content">
            <div class="today-overview-hero__icon" aria-hidden="true">
              <img src="/icons/student/png/mein-tag.png" alt="" aria-hidden="true">
            </div>
            <div class="today-overview-hero__copy">
              <p class="today-overview-hero__eyebrow">Mein Tag</p>
              <h2 class="today-overview-hero__title">${ui.escapeHtml(d.weekdayLabel)} · ${ui.escapeHtml(d.dateLabel)}</h2>
              <p class="today-overview-hero__hint">${ui.escapeHtml(nextStepHint(blockList, editable))}</p>
            </div>
          </div>
          <div class="today-overview-hero__nav">
            <button type="button" class="today-arrow" data-dir="prev" aria-label="Vorheriger Tag">‹</button>
            <button type="button" class="today-arrow" data-dir="next" aria-label="Nächster Tag">›</button>
          </div>
          <div class="today-overview-hero__visual" aria-hidden="true">
            <img src="/icons/student/hero/mein-tag-hero.png?v=6" alt="" aria-hidden="true" loading="lazy">
          </div>
        </article>
      </section>`;
  }

  function groupModeForSubject(subject) {
    const map = state.data?.groupModeBySubject || {};
    if (!subject) return null;
    if (map[subject]?.enabled) return map[subject];
    const key = Object.keys(map).find(
      (s) => String(s).trim().toLowerCase() === String(subject).trim().toLowerCase()
    );
    return key && map[key]?.enabled ? map[key] : null;
  }

  function renderGroupModeBlock(block, editable) {
    const slot = block.slot;
    const subject = slot?.subject || "";
    const gm = groupModeForSubject(subject);
    const params = new URLSearchParams({ subject });
    if (state.date) params.set("date", state.date);
    if (gm?.activeSessionId) params.set("sessionId", gm.activeSessionId);

    const hint = gm?.activeSessionId
      ? gm.status === "setup"
        ? "Gruppe einrichten"
        : "Gruppe läuft – gemeinsam weiterarbeiten."
      : "Gemeinsam in der Gruppe arbeiten.";

    return renderSubjectTile({
      subject,
      time: slot?.timeslot,
      hint,
      cta: editable ? (gm?.activeSessionId ? "Weiter" : "Starten") : "",
      nav: editable ? "gruppenmodus" : "",
      query: params.toString(),
      group: true
    });
  }

  function renderBlock(block, editable) {
    const slot = block.slot;
    const entry = block.entry;
    const subject = entry?.subject || slot?.subject || "Lernzeit";
    const time = entry?.timeslot || slot?.timeslot || "";
    const gm = groupModeForSubject(subject);
    if (gm) return renderGroupModeBlock(block, editable);

    const needsMidCheck = blockNeedsMidCheck(block, entry);
    const status = lessonStatus(block);

    if (!entry) {
      if (!editable) {
        return renderSubjectTile({
          subject,
          time,
          hint: "Kein Eintrag",
          done: false
        });
      }
      const params = new URLSearchParams({ date: state.date });
      if (slot?.subject) params.set("subject", slot.subject);
      if (slot?.timeslot) params.set("timeslot", slot.timeslot);
      return renderSubjectTile({
        subject,
        time,
        hint: "Tagesziel setzen und loslegen.",
        cta: "Tagesziel setzen",
        nav: "plan",
        query: params.toString()
      });
    }

    const params = new URLSearchParams({ date: state.date });
    if (entry.id) params.set("entryId", entry.id);
    if (entry.subject) params.set("subject", entry.subject);
    if (entry.timeslot) params.set("timeslot", entry.timeslot);

    const allDone = (needsMidCheck ? entry.hasCheck : true) && entry.hasReflection;
    if (allDone) {
      return renderSubjectTile({
        subject,
        time,
        hint: goalHint(entry),
        cta: "Ansehen",
        nav: "plan",
        query: params.toString(),
        done: true
      });
    }

    if (!editable) {
      return renderSubjectTile({
        subject,
        time,
        hint: goalHint(entry),
        cta: "Ansehen",
        nav: "plan",
        query: params.toString()
      });
    }

    if (needsMidCheck && !entry.hasCheck) {
      return renderSubjectTile({
        subject,
        time,
        hint: goalHint(entry),
        cta: "Zwischen-Check",
        nav: "check",
        query: new URLSearchParams({ entryId: entry.id }).toString()
      });
    }

    if (!entry.hasReflection) {
      return renderSubjectTile({
        subject,
        time,
        hint: goalHint(entry),
        cta: "Tagesabschluss",
        nav: "reflect",
        query: new URLSearchParams({ entryId: entry.id }).toString()
      });
    }

    return renderSubjectTile({
      subject,
      time,
      hint: goalHint(entry),
      cta: "Ansehen",
      nav: "plan",
      query: params.toString(),
      done: status.key === "done"
    });
  }

  function renderPhaseStepper(phases) {
    const items = [
      { key: "plan", label: "Plan" },
      ...(phases.checkRequired === false ? [] : [{ key: "check", label: "Check" }]),
      { key: "reflect", label: "Abschluss" }
    ];
    return `
      <div class="today-lesson-steps" aria-label="Schritte dieser Stunde">
        ${items
          .map((p, index) => {
            const done = phases[p.key];
            const line =
              index < items.length - 1
                ? `<span class="today-lesson-step__line ${done ? "is-done" : ""}" aria-hidden="true"></span>`
                : "";
            return `
              <div class="today-lesson-step ${done ? "is-done" : ""}">
                <span class="today-lesson-step__dot" aria-hidden="true">${done ? "✓" : index + 1}</span>
                <span class="today-lesson-step__label">${p.label}</span>
              </div>${line}`;
          })
          .join("")}
      </div>`;
  }

  function renderEmptyState(d, editable) {
    const ui = UI();
    if (!d.hasClass) {
      return `
        <div class="student-card empty-state-card">
          <div class="card-content">
            <p class="empty-state-card__eyebrow">Keine Klasse</p>
            <h3 class="empty-state-card__title">Dir ist noch keine Klasse zugeordnet.</h3>
            <p class="empty-state-card__text">Bitte wende dich an deine Lehrkraft.</p>
          </div>
        </div>`;
    }

    return `
      <div class="student-card empty-state-card dashboard-card">
        <img class="page-hero__image dashboard-card__hero" src="/icons/student/hero/mein-tag-hero.png?v=6" alt="" aria-hidden="true">
        <div class="card-content dashboard-card__content">
          <p class="empty-state-card__eyebrow">Keine Stunden</p>
          <h3 class="empty-state-card__title">Heute ist noch nichts eingetragen.</h3>
          <p class="empty-state-card__text">
            Für diesen Tag${d.className ? ` (${ui.escapeHtml(d.className)})` : ""} sind noch keine Unterrichtsstunden im Stundenplan.
            Deine Lehrkraft kann sie im Admin-Bereich eintragen.
          </p>
          ${editable ? `<p class="empty-state-card__hint">Schau später nochmal vorbei.</p>` : ""}
        </div>
      </div>`;
  }

  function renderDayNav(d) {
    const ui = UI();
    return `
      <div class="today-day-nav">
        <button type="button" class="today-arrow" data-dir="prev" aria-label="Vorheriger Tag">‹</button>
        <div class="today-day-nav__center">
          <h3 class="today-day-nav__title">${ui.escapeHtml(d.weekdayLabel)}</h3>
          <p class="today-day-nav__sub">${ui.escapeHtml(d.dateLabel)}</p>
        </div>
        <button type="button" class="today-arrow" data-dir="next" aria-label="Nächster Tag">›</button>
      </div>`;
  }

  function render() {
    const root = document.getElementById("today-screen-root");
    if (!root) return;
    const ui = UI();

    if (state.loading && !state.data) {
      root.innerHTML = `<div class="logbuch-loading">Lade deinen Tag…</div>`;
      return;
    }

    const d = state.data;
    if (!d) {
      root.innerHTML = ui.msg("Tag konnte nicht geladen werden.");
      return;
    }

    const editable = isEditableDate(state.date);
    const slideClass = state.slideDir ? `today-slide-${state.slideDir}` : "";
    const blockList = visibleBlocks(d.blocks);

    const lessonsHtml =
      blockList.length > 0
        ? blockList.map((b) => renderBlock(b, editable)).join("")
        : renderEmptyState(d, editable);

    root.innerHTML = `
      <div class="student-page today-shell today-app" id="todaySwipeArea">
        ${blockList.length ? renderTodayOverview(d, blockList, editable) : renderDayNav(d)}

        <div class="today-slide-viewport">
          <div class="today-slide-panel ${slideClass}" id="todaySlidePanel">
            <div class="today-lesson-list">
              ${
                blockList.length
                  ? `<h3 class="today-lesson-list__title">Deine Stunden</h3><div class="today-subject-grid">${lessonsHtml}</div>`
                  : lessonsHtml
              }
            </div>
          </div>
        </div>
      </div>`;

    bindHandlers(root);

    if (state.slideDir) {
      const panel = root.querySelector("#todaySlidePanel");
      requestAnimationFrame(() => {
        panel?.classList.remove(`today-slide-${state.slideDir}`);
        state.slideDir = null;
      });
    }
  }

  function bindHandlers(root) {
    root.querySelector('[data-dir="prev"]')?.addEventListener("click", () => navigateDay(-1));
    root.querySelector('[data-dir="next"]')?.addEventListener("click", () => navigateDay(1));

    root.querySelectorAll("[data-nav]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const nav = btn.dataset.nav;
        if (!nav) return;
        const q = new URLSearchParams(btn.dataset.query || "");
        window.StudentRouter?.navigateToSection(nav, { query: q });
      });
    });

    root.querySelectorAll(".today-action-select").forEach((sel) => {
      sel.addEventListener("change", () => {
        const action = sel.value;
        if (!action) return;
        const entryId = sel.dataset.entryId;
        const q = new URLSearchParams({ entryId });
        window.StudentRouter?.navigateToSection(action, { query: q });
        sel.value = "";
      });
    });

    const swipeArea = root.querySelector("#todaySwipeArea");
    if (swipeArea && window.LogbuchSwipe) {
      window.LogbuchSwipe.attach(swipeArea, {
        onSwipeLeft: () => navigateDay(1),
        onSwipeRight: () => navigateDay(-1)
      });
    }
  }

  async function loadDay(dateIso, slideDir = null) {
    state.date = dateIso;
    state.slideDir = slideDir;
    state.loading = true;
    if (!state.data) render();

    try {
      const [todayRes, bootRes] = await Promise.all([
        fetch(`/api/student/log/today?date=${encodeURIComponent(dateIso)}`, {
          credentials: "same-origin",
          cache: "no-store"
        }),
        fetch("/api/student/group-mode/bootstrap", {
          credentials: "same-origin",
          cache: "no-store"
        }).catch(() => null)
      ]);
      if (!todayRes.ok) throw new Error(`HTTP ${todayRes.status}`);
      let data = await todayRes.json();
      if (bootRes && bootRes.ok) {
        const bootstrap = await bootRes.json().catch(() => null);
        if (bootstrap) data = mergeGroupModeFromBootstrap(data, bootstrap);
      }
      state.data = data;
      state.loading = false;
      render();
    } catch (err) {
      console.error(err);
      state.loading = false;
      state.data = null;
      render();
    }
  }

  function navigateDay(delta) {
    if (state.loading) return;
    const next = addSchoolDays(state.date || todayIso(), delta);
    const dir = delta > 0 ? "from-right" : "from-left";
    loadDay(next, dir);
  }

  function init() {
    const q = new URLSearchParams(location.search);
    const date = q.get("date") || state.date || todayIso();
    state.data = null;
    if (typeof window.refreshTodayStatus === "function") {
      window.refreshTodayStatus();
    }
    loadDay(date);
  }

  window.LogbuchToday = { init, reload: () => loadDay(state.date || todayIso()) };
})();
