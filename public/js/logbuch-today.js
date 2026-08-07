/**
 * SRL-Logbuch – MEIN TAG (App-Card Layout).
 */
(function () {
  const UI = () => window.LogbuchUI;

  const state = {
    date: null,
    data: null,
    loading: false,
    slideDir: null,
    hwSubject: "",
    hwTitle: "",
    hwClassDone: "",
    hwBusy: false,
    hwMessage: "",
    hwError: "",
    hwCompletingId: null,
    hwNoteDraft: ""
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

  function blockPhases(entry) {
    return {
      plan: !!entry,
      check: !!entry?.hasCheck,
      reflect: !!entry?.hasReflection
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
      { key: "check", label: "Check" },
      { key: "reflect", label: "Reflexion" }
    ];
    return items
      .map(
        (p) =>
          `<span class="phase-pill ${phases[p.key] ? "is-done" : ""}">${phases[p.key] ? "✓" : "○"} ${p.label}</span>`
      )
      .join("");
  }

  function renderActionSelect(entry) {
    const ui = UI();
    const hasCheck = entry.hasCheck;
    const hasReflection = entry.hasReflection;

    if (hasCheck && hasReflection) {
      return `<p class="today-block-done-label">Alle Schritte erledigt ✓</p>`;
    }

    let options = `<option value="">Nächster Schritt…</option>`;
    if (!hasCheck) {
      options += `<option value="check">Zwischen-Check</option>`;
    } else {
      options += `<option value="" disabled>Check ✓</option>`;
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

  function primaryAction(entry, editable) {
    if (!editable || entry.hasReflection) return null;
    if (!entry.hasCheck) {
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
      if (!block.entry) return `Setze als Nächstes dein Tagesziel in ${subject}.`;
      if (!block.entry.hasCheck) return `Als Nächstes: Zwischen-Check in ${subject}.`;
      if (!block.entry.hasReflection) return `Als Nächstes: Tagesabschluss in ${subject}.`;
    }
    return "Stark – alle Stunden für heute sind erledigt.";
  }

  function lessonStatus(block) {
    if (!block.entry) return { key: "open", label: "Offen" };
    if (block.entry.hasReflection) return { key: "done", label: "Erledigt" };
    return { key: "active", label: "Begonnen" };
  }

  function lessonStepCount(phases) {
    return [phases.plan, phases.check, phases.reflect].filter(Boolean).length;
  }

  function homeworkSubjects() {
    const fromApi = state.data?.subjects;
    const fromTimetable = (state.data?.timetableSubjects || []).filter(Boolean);
    const list =
      Array.isArray(fromApi) && fromApi.length
        ? fromApi
        : window.LOGBUCH?.SUBJECTS || [];
    const preferred = fromTimetable.filter((s) => list.includes(s));
    const rest = list.filter((s) => !preferred.includes(s));
    return [...preferred, ...rest];
  }

  function formatDueHint(dueDate) {
    if (!dueDate) return "";
    if (dueDate === todayIso()) return "heute";
    const d = new Date(`${dueDate}T12:00:00`);
    return d.toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" });
  }

  function homeworkClassNoteHtml(hw, ui) {
    if (!hw.classDoneNote) return "";
    return `<p class="hw-item__note hw-item__note--class">Im Unterricht: ${ui.escapeHtml(hw.classDoneNote)}</p>`;
  }

  function renderHomeworkItem(hw, editable) {
    const ui = UI();
    const isCompleting = state.hwCompletingId === String(hw.id);
    const overdue = !hw.done && hw.dueDate && hw.dueDate < todayIso();
    const overdueTag = overdue
      ? `<span class="hw-item__overdue">überfällig</span>`
      : "";

    if (hw.done) {
      return `
        <li class="hw-item hw-item--done">
          <div class="hw-item__main">
            <span class="hw-item__check" aria-hidden="true">✓</span>
            <div>
              <p class="hw-item__subject">${ui.escapeHtml(hw.subject)}</p>
              <p class="hw-item__title">${ui.escapeHtml(hw.title)}</p>
              ${homeworkClassNoteHtml(hw, ui)}
              ${hw.doneNote ? `<p class="hw-item__note">${ui.escapeHtml(hw.doneNote)}</p>` : ""}
            </div>
          </div>
        </li>`;
    }

    if (!editable) {
      return `
        <li class="hw-item">
          <div class="hw-item__main">
            <span class="hw-item__check hw-item__check--open" aria-hidden="true">○</span>
            <div>
              <p class="hw-item__subject">${ui.escapeHtml(hw.subject)} ${overdueTag}</p>
              <p class="hw-item__title">${ui.escapeHtml(hw.title)}</p>
              ${homeworkClassNoteHtml(hw, ui)}
            </div>
          </div>
        </li>`;
    }

    return `
      <li class="hw-item ${isCompleting ? "is-editing" : ""}">
        <div class="hw-item__main">
          <span class="hw-item__check hw-item__check--open" aria-hidden="true">○</span>
          <div class="hw-item__copy">
            <p class="hw-item__subject">${ui.escapeHtml(hw.subject)} ${overdueTag}</p>
            <p class="hw-item__title">${ui.escapeHtml(hw.title)}</p>
            ${homeworkClassNoteHtml(hw, ui)}
          </div>
          <div class="hw-item__actions">
            <button type="button" class="today-app-btn today-app-btn--ghost hw-btn" data-hw-complete="${ui.escapeHtml(hw.id)}">Erledigt</button>
            <button type="button" class="hw-btn-icon" data-hw-delete="${ui.escapeHtml(hw.id)}" aria-label="Löschen" title="Löschen">×</button>
          </div>
        </div>
        ${
          isCompleting
            ? `<div class="hw-complete-form">
                <label class="hw-label" for="hwNote_${ui.escapeHtml(hw.id)}">Kurz dokumentieren (optional)</label>
                <input id="hwNote_${ui.escapeHtml(hw.id)}" class="hw-input" type="text" maxlength="400" placeholder="z. B. Aufgaben 1–4 erledigt" value="${ui.escapeHtml(state.hwNoteDraft)}" data-hw-note-input>
                <div class="hw-complete-actions">
                  <button type="button" class="today-app-btn" data-hw-confirm="${ui.escapeHtml(hw.id)}" ${state.hwBusy ? "disabled" : ""}>${state.hwBusy ? "Speichern…" : "Abhaken"}</button>
                  <button type="button" class="today-app-btn today-app-btn--ghost" data-hw-cancel>Abbrechen</button>
                </div>
              </div>`
            : ""
        }
      </li>`;
  }

  function renderHomeworkPanel(editable) {
    const ui = UI();
    const hw = state.data?.homework || { due: [], assigned: [] };
    const due = hw.due || [];
    const assigned = hw.assigned || [];
    const openDue = due.filter((h) => !h.done);
    const subjects = homeworkSubjects();
    const selectedSubject = state.hwSubject || subjects[0] || "";
    if (!state.hwSubject && selectedSubject) state.hwSubject = selectedSubject;
    const dueHint = formatDueHint(state.data?.nextSchoolDay);

    const subjectChips = subjects
      .map(
        (s) =>
          `<button type="button" class="choice-chip ${s === selectedSubject ? "is-active" : ""}" data-hw-subject="${ui.escapeHtml(s)}">${ui.escapeHtml(s)}</button>`
      )
      .join("");

    const dueSection =
      due.length > 0
        ? `
      <div class="hw-block">
        <div class="hw-block__head">
          <h3 class="hw-block__title">Hausaufgaben für heute</h3>
          <p class="hw-block__sub">${openDue.length ? `${openDue.length} offen` : "Alles erledigt ✓"}</p>
        </div>
        <ul class="hw-list">${due.map((h) => renderHomeworkItem(h, editable)).join("")}</ul>
      </div>`
        : editable
          ? `
      <div class="hw-block hw-block--empty">
        <h3 class="hw-block__title">Hausaufgaben für heute</h3>
        <p class="hw-block__hint">Keine fälligen Aufgaben – super. Du kannst unten welche für morgen setzen.</p>
      </div>`
          : "";

    const assignSection = editable
      ? `
      <div class="hw-block">
        <div class="hw-block__head">
          <h3 class="hw-block__title">Für morgen vormerken</h3>
          <p class="hw-block__sub">Fällig ${ui.escapeHtml(dueHint || "nächster Schultag")}</p>
        </div>
        <p class="hw-block__hint">Was nimmst du mit – und was hast du schon im Unterricht geschafft?</p>
        <div class="hw-form">
          <div class="hw-field">
            <span class="hw-label" id="hwSubjectLabel">Fach</span>
            <div class="choice-chip-group hw-subject-chips" role="group" aria-labelledby="hwSubjectLabel">${subjectChips}</div>
          </div>
          <div class="hw-field">
            <label class="hw-label" for="hwTitleInput">Für zu Hause</label>
            <input id="hwTitleInput" class="hw-input" type="text" maxlength="300" placeholder="z. B. S. 42 Nr. 3–6" value="${ui.escapeHtml(state.hwTitle)}" autocomplete="off">
          </div>
          <div class="hw-field">
            <label class="hw-label" for="hwClassDoneInput">Im Unterricht erledigt <span class="hw-optional">optional</span></label>
            <input id="hwClassDoneInput" class="hw-input" type="text" maxlength="300" placeholder="z. B. Nr. 1–2 schon gemacht" value="${ui.escapeHtml(state.hwClassDone)}" autocomplete="off">
          </div>
          <button type="button" class="today-app-btn" id="hwAddBtn" ${state.hwBusy ? "disabled" : ""}>${state.hwBusy ? "Speichern…" : "Hausaufgabe setzen"}</button>
        </div>
        ${state.hwError ? `<p class="hw-msg hw-msg--err">${ui.escapeHtml(state.hwError)}</p>` : ""}
        ${state.hwMessage ? `<p class="hw-msg hw-msg--ok">${ui.escapeHtml(state.hwMessage)}</p>` : ""}
        ${
          assigned.length
            ? `<ul class="hw-list hw-list--assigned">
                ${assigned
                  .map(
                    (h) => `
                  <li class="hw-item hw-item--assigned">
                    <div class="hw-item__main">
                      <div>
                        <p class="hw-item__subject">${ui.escapeHtml(h.subject)} · bis ${ui.escapeHtml(formatDueHint(h.dueDate))}</p>
                        <p class="hw-item__title">${ui.escapeHtml(h.title)}</p>
                        ${homeworkClassNoteHtml(h, ui)}
                      </div>
                      ${
                        !h.done
                          ? `<button type="button" class="hw-btn-icon" data-hw-delete="${ui.escapeHtml(h.id)}" aria-label="Löschen" title="Löschen">×</button>`
                          : `<span class="hw-item__done-tag">✓</span>`
                      }
                    </div>
                  </li>`
                  )
                  .join("")}
              </ul>`
            : ""
        }
      </div>`
      : "";

    if (!dueSection && !assignSection) return "";

    return `
      <section class="hw-panel" aria-label="Hausaufgaben">
        ${dueSection}
        ${assignSection}
      </section>`;
  }

  function renderTodayOverview(d, blockList, editable) {
    const ui = UI();
    const total = blockList.length;
    const planned = blockList.filter((b) => b.entry).length;
    const reflected = blockList.filter((b) => b.entry?.hasReflection).length;
    const profile = window.__studentProfile || {};
    const todayXp = Number(profile.todayXp || 0);
    const xpTarget = Math.max(50, todayXp || 50);
    const pct = (n, den) => (den > 0 ? Math.min(100, Math.round((n / den) * 100)) : 0);
    const dayPct = pct(reflected, total);
    const goalsPct = pct(planned, total);
    const xpPct = pct(todayXp, xpTarget);

    const metric = ({ accent, label, value, sub, fill }) => `
      <article class="today-dash__metric today-dash__metric--${accent}">
        <div class="today-dash__metric-head">
          <p class="today-dash__metric-label">${ui.escapeHtml(label)}</p>
          <p class="today-dash__metric-value">${ui.escapeHtml(value)}</p>
          <p class="today-dash__metric-sub">${ui.escapeHtml(sub)}</p>
        </div>
        <div class="today-dash__track" aria-hidden="true">
          <div class="today-dash__fill" style="width:${fill}%"></div>
        </div>
      </article>`;

    return `
      <section class="today-overview" aria-label="Heute im Überblick">
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

        <div class="today-dash" aria-label="Heute im Überblick">
          <article class="today-dash__featured">
            <div class="today-dash__featured-copy">
              <p class="today-dash__featured-eyebrow">Heute im Überblick</p>
              <h3 class="today-dash__featured-title">Tagesfortschritt</h3>
              <p class="today-dash__featured-sub">${reflected} von ${total || 0} Stunden reflektiert</p>
            </div>
            <div class="today-dash__featured-pct" aria-hidden="true">
              <span>${dayPct}</span><small>%</small>
            </div>
            <div class="today-dash__track today-dash__track--xl" aria-hidden="true">
              <div class="today-dash__fill today-dash__fill--cyan" style="width:${dayPct}%"></div>
            </div>
          </article>

          <div class="today-dash__row">
            ${metric({
              accent: "violet",
              label: "Ziele gesetzt",
              value: `${planned}/${total || 0}`,
              sub: `${goalsPct} % der Stunden`,
              fill: goalsPct
            })}
            ${metric({
              accent: "green",
              label: "XP heute",
              value: String(todayXp),
              sub: `Zielmarke ${xpTarget} XP`,
              fill: xpPct
            })}
          </div>
        </div>
      </section>`;
  }

  function renderBlock(block, editable) {
    const ui = UI();
    const slot = block.slot;
    const entry = block.entry;

    const status = lessonStatus(block);
    const phases = entry ? blockPhases(entry) : { plan: false, check: false, reflect: false };
    const stepsDone = lessonStepCount(phases);
    const V = window.LogbuchVisuals;
    const miniRing = V
      ? V.circularProgress({
          completed: stepsDone,
          total: 3,
          size: 56,
          accent: status.key === "done" ? "#22c55e" : status.key === "active" ? "#38bdf8" : "#a855f7"
        })
      : "";

    if (!entry) {
      if (!editable) {
        return `
          <article class="subject-lesson-card subject-lesson-card--${status.key}">
            <div class="subject-lesson-card__top">
              <div class="subject-lesson-card__icon" aria-hidden="true">
                <img src="/icons/student/png/mein-tag.png" alt="" aria-hidden="true">
              </div>
              <div class="subject-lesson-card__meta">
                <div class="subject-lesson-card__head">
                  <h3 class="subject-lesson-card__subject">${slot ? ui.escapeHtml(slot.subject) : "Lernzeit"}</h3>
                  <span class="status-badge status-badge--${status.key}">${status.label}</span>
                </div>
                ${slot?.timeslot ? `<span class="subject-lesson-card__time">${ui.escapeHtml(slot.timeslot)}</span>` : ""}
              </div>
              <div class="subject-lesson-card__ring">${miniRing}</div>
            </div>
            <p class="subject-lesson-card__empty">Kein Eintrag</p>
          </article>`;
      }

      const params = new URLSearchParams({ date: state.date });
      if (slot?.subject) params.set("subject", slot.subject);
      if (slot?.timeslot) params.set("timeslot", slot.timeslot);

      return `
        <article class="subject-lesson-card subject-lesson-card--${status.key}">
          <div class="subject-lesson-card__top">
            <div class="subject-lesson-card__icon" aria-hidden="true">
              <img src="/icons/student/png/mein-tag.png" alt="" aria-hidden="true">
            </div>
            <div class="subject-lesson-card__meta">
              <div class="subject-lesson-card__head">
                <h3 class="subject-lesson-card__subject">${slot ? ui.escapeHtml(slot.subject) : "Lernzeit"}</h3>
                <span class="status-badge status-badge--${status.key}">${status.label}</span>
              </div>
              ${slot?.timeslot ? `<span class="subject-lesson-card__time">${ui.escapeHtml(slot.timeslot)}</span>` : ""}
            </div>
            <div class="subject-lesson-card__ring">${miniRing}</div>
          </div>
          ${renderPhaseStepper(phases)}
          <p class="subject-lesson-card__hint">Noch kein Tagesziel gesetzt.</p>
          ${appPrimaryButton("Tagesziel setzen", "plan", params.toString())}
        </article>`;
    }

    const readOnly = !editable;
    const params = new URLSearchParams({ date: state.date });
    if (entry.id) params.set("entryId", entry.id);
    if (entry.subject) params.set("subject", entry.subject);
    if (entry.timeslot) params.set("timeslot", entry.timeslot);

    const checkParams = new URLSearchParams({ entryId: entry.id });
    const reflectParams = new URLSearchParams({ entryId: entry.id });

    const viewPlanBtn = navButton(
      editable && !entry.hasReflection ? "Ziel bearbeiten" : "Ziel ansehen",
      "plan",
      params.toString()
    );
    const viewCheckBtn = entry.hasCheck
      ? navButton(
          editable && !entry.hasReflection ? "Check bearbeiten" : "Check ansehen",
          "check",
          checkParams.toString()
        )
      : "";
    const viewReflectBtn = entry.hasReflection
      ? navButton(editable ? "Reflexion bearbeiten" : "Reflexion ansehen", "reflect", reflectParams.toString())
      : "";

    const primary = primaryAction(entry, editable);
    const secondary = [viewPlanBtn, viewCheckBtn, viewReflectBtn].filter(Boolean);
    const nextSelect = !readOnly && !(entry.hasCheck && entry.hasReflection) ? renderActionSelect(entry) : "";
    const allDone = entry.hasCheck && entry.hasReflection;

    const checkpointHint = entry.checkpoint_title
      ? `<p class="subject-lesson-card__meta">${ui.escapeHtml(entry.checkpoint_title)}</p>`
      : "";

    return `
      <article class="subject-lesson-card subject-lesson-card--${status.key}">
        <div class="subject-lesson-card__top">
          <div class="subject-lesson-card__icon" aria-hidden="true">
            <img src="/icons/student/png/mein-tag.png" alt="" aria-hidden="true">
          </div>
          <div class="subject-lesson-card__meta">
            <div class="subject-lesson-card__head">
              <h3 class="subject-lesson-card__subject">${ui.escapeHtml(entry.subject)}</h3>
              <span class="status-badge status-badge--${status.key}">${status.label}</span>
            </div>
            ${entry.timeslot ? `<span class="subject-lesson-card__time">${ui.escapeHtml(entry.timeslot)}</span>` : ""}
          </div>
          <div class="subject-lesson-card__ring">${miniRing}</div>
        </div>
        ${checkpointHint}
        ${renderPhaseStepper(phases)}
        <div class="subject-lesson-card__body">
          ${renderDailyGoalBody(ui, entry)}
          ${entry.hasCheck ? renderCheckSummary(ui, entry) : ""}
          ${entry.hasReflection ? renderReflectionSummary(ui, entry) : ""}
        </div>
        <div class="subject-lesson-card__actions">
          ${
            primary ||
            (allDone ? `<p class="subject-lesson-card__done">Alle Schritte erledigt ✓</p>` : "")
          }
          ${
            secondary.length
              ? `<div class="subject-lesson-card__secondary">${secondary.join("")}</div>`
              : ""
          }
          ${nextSelect ? `<div class="subject-lesson-card__select">${nextSelect}</div>` : ""}
        </div>
      </article>`;
  }

  function renderPhaseStepper(phases) {
    const items = [
      { key: "plan", label: "Plan" },
      { key: "check", label: "Check" },
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

        ${renderHomeworkPanel(editable)}

        <div class="today-slide-viewport">
          <div class="today-slide-panel ${slideClass}" id="todaySlidePanel">
            <div class="today-lesson-list">
              ${
                blockList.length
                  ? `<h3 class="today-lesson-list__title">Deine Stunden</h3>${lessonsHtml}`
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
        const q = new URLSearchParams(btn.dataset.query || "");
        if (nav === "plan" || nav === "check" || nav === "reflect") {
          window.StudentRouter?.navigateToSection(nav, { query: q });
        }
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

    root.querySelectorAll("[data-hw-subject]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.hwSubject = btn.dataset.hwSubject || "";
        root.querySelectorAll("[data-hw-subject]").forEach((chip) => {
          chip.classList.toggle("is-active", chip.dataset.hwSubject === state.hwSubject);
        });
      });
    });

    root.querySelector("#hwTitleInput")?.addEventListener("input", (e) => {
      state.hwTitle = e.target.value;
    });

    root.querySelector("#hwClassDoneInput")?.addEventListener("input", (e) => {
      state.hwClassDone = e.target.value;
    });

    root.querySelector("#hwAddBtn")?.addEventListener("click", () => addHomework());

    root.querySelectorAll("[data-hw-complete]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.hwCompletingId = btn.dataset.hwComplete;
        state.hwNoteDraft = "";
        state.hwError = "";
        state.hwMessage = "";
        render();
      });
    });

    root.querySelector("[data-hw-note-input]")?.addEventListener("input", (e) => {
      state.hwNoteDraft = e.target.value;
    });

    root.querySelector("[data-hw-cancel]")?.addEventListener("click", () => {
      state.hwCompletingId = null;
      state.hwNoteDraft = "";
      render();
    });

    root.querySelectorAll("[data-hw-confirm]").forEach((btn) => {
      btn.addEventListener("click", () => completeHomework(btn.dataset.hwConfirm));
    });

    root.querySelectorAll("[data-hw-delete]").forEach((btn) => {
      btn.addEventListener("click", () => deleteHomework(btn.dataset.hwDelete));
    });

    const swipeArea = root.querySelector("#todaySwipeArea");
    if (swipeArea && window.LogbuchSwipe) {
      window.LogbuchSwipe.attach(swipeArea, {
        onSwipeLeft: () => navigateDay(1),
        onSwipeRight: () => navigateDay(-1)
      });
    }
  }

  async function addHomework() {
    const subject = state.hwSubject || homeworkSubjects()[0] || "";
    const title = String(state.hwTitle || "").trim();
    const classDoneNote = String(state.hwClassDone || "").trim();
    state.hwError = "";
    state.hwMessage = "";

    if (!subject || !title) {
      state.hwError = "Bitte Fach und Aufgabe für zu Hause angeben.";
      render();
      return;
    }

    state.hwBusy = true;
    render();

    try {
      const res = await fetch("/api/student/homework", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject,
          title,
          classDoneNote: classDoneNote || null,
          assignedDate: state.date,
          dueDate: state.data?.nextSchoolDay
        })
      });
      const data = await res.json();
      state.hwBusy = false;
      if (!data.success) {
        state.hwError = data.message || "Speichern fehlgeschlagen.";
        render();
        return;
      }
      state.hwTitle = "";
      state.hwClassDone = "";
      state.hwMessage = "Gesetzt – morgen kannst du sie abhaken.";
      await loadDay(state.date);
    } catch (err) {
      console.error(err);
      state.hwBusy = false;
      state.hwError = "Netzwerkfehler.";
      render();
    }
  }

  async function completeHomework(id) {
    state.hwBusy = true;
    state.hwError = "";
    render();
    try {
      const res = await fetch(`/api/student/homework/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          done: true,
          doneNote: state.hwNoteDraft || null
        })
      });
      const data = await res.json();
      state.hwBusy = false;
      if (!data.success) {
        state.hwError = data.message || "Abhaken fehlgeschlagen.";
        render();
        return;
      }
      state.hwCompletingId = null;
      state.hwNoteDraft = "";
      state.hwMessage = "Erledigt – dokumentiert.";
      await loadDay(state.date);
    } catch (err) {
      console.error(err);
      state.hwBusy = false;
      state.hwError = "Netzwerkfehler.";
      render();
    }
  }

  async function deleteHomework(id) {
    if (!window.confirm("Diese Hausaufgabe löschen?")) return;
    state.hwBusy = true;
    render();
    try {
      const res = await fetch(`/api/student/homework/${encodeURIComponent(id)}`, {
        method: "DELETE"
      });
      const data = await res.json();
      state.hwBusy = false;
      if (!data.success) {
        state.hwError = data.message || "Löschen fehlgeschlagen.";
        render();
        return;
      }
      state.hwMessage = "";
      await loadDay(state.date);
    } catch (err) {
      console.error(err);
      state.hwBusy = false;
      state.hwError = "Netzwerkfehler.";
      render();
    }
  }

  async function loadDay(dateIso, slideDir = null) {
    state.date = dateIso;
    state.slideDir = slideDir;
    state.loading = true;
    if (!state.data) render();

    try {
      const res = await fetch(`/api/student/log/today?date=${encodeURIComponent(dateIso)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
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
    state.hwCompletingId = null;
    state.hwNoteDraft = "";
    state.hwMessage = "";
    state.hwError = "";
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
