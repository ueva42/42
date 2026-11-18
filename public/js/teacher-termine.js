/**
 * Lehrkraft – Termine (anstehende Nachweise einsehen).
 */
(function () {
  const TYPE_ORDER = ["klassenarbeit", "test", "projektabgabe", "levelcheck", "praesentation", "custom"];

  const state = {
    classId: null,
    subjectFilter: "",
    data: null,
    loading: false,
    message: "",
    error: "",
    evalCheckpointId: null,
    evalData: null,
    evalSaving: false,
    deletingId: null,
    resetting: false,
    resetClassName: "",
    resetPhrase: ""
  };

  function escapeHtml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function sameId(a, b) {
    return String(a) === String(b);
  }

  function todayIso() {
    return new Date().toISOString().slice(0, 10);
  }

  function isoToGerman(iso) {
    const value = String(iso || "").trim();
    if (!value) return "";
    const [y, m, d] = value.split("-");
    if (!y || !m || !d) return "";
    return `${d.padStart(2, "0")}.${m.padStart(2, "0")}.${y}`;
  }

  function subjectsList() {
    const fromApi = state.data?.subjects;
    return Array.isArray(fromApi) ? fromApi : [];
  }

  function typeLabelFor(type, customLabel, options) {
    if (type === "custom" && customLabel) return customLabel;
    const match = (options || []).find((o) => o.value === type);
    return match?.label || "Klassenarbeit";
  }

  function normalizeType(cp) {
    const type = String(cp?.checkpointType || cp?.type || "klassenarbeit").trim().toLowerCase();
    if (
      type === "test" ||
      type === "projektabgabe" ||
      type === "praesentation" ||
      type === "custom" ||
      type === "levelcheck" ||
      type === "klassenarbeit"
    ) {
      return type;
    }
    return "klassenarbeit";
  }

  function linkedGoalLabels(cp, levelChecks) {
    const ids = new Set(
      (Array.isArray(cp.linkedSubtopicIds) ? cp.linkedSubtopicIds : []).map((id) => String(id))
    );
    const labels = [];
    for (const topic of levelChecks || []) {
      for (const goal of topic.goals || []) {
        if (ids.has(String(goal.id))) {
          labels.push(`${topic.name}: ${goal.text}`);
        }
      }
    }
    return labels;
  }

  function linkedTopicNames(cp, levelChecks) {
    const ids = new Set(
      (Array.isArray(cp.linkedSubtopicIds) ? cp.linkedSubtopicIds : []).map((id) => String(id))
    );
    const names = new Set();
    for (const topic of levelChecks || []) {
      for (const goal of topic.goals || []) {
        if (ids.has(String(goal.id))) names.add(topic.name);
      }
    }
    if (names.size) return [...names].join(", ");
    return cp.topicName || "–";
  }

  function allCheckpoints() {
    const typeOptions = state.data?.checkpointTypeOptions || [];
    const rows = [];
    for (const topic of state.data?.levelChecks || []) {
      if (state.subjectFilter && topic.subject !== state.subjectFilter) continue;
      for (const cp of topic.checkpoints || []) {
        if (!cp.checkpointDate) continue;
        const typeKey = normalizeType(cp);
        rows.push({
          ...cp,
          subject: topic.subject,
          topicId: topic.id,
          topicName: topic.name,
          typeKey,
          typeLabel: typeLabelFor(cp.checkpointType, cp.checkpointTypeLabel, typeOptions),
          dateIso: String(cp.checkpointDate)
        });
      }
    }
    return rows;
  }

  function upcomingCheckpoints() {
    const today = todayIso();
    return allCheckpoints()
      .filter((cp) => cp.dateIso >= today)
      .sort((a, b) => {
        const byDate = a.dateIso.localeCompare(b.dateIso);
        if (byDate !== 0) return byDate;
        const ao = TYPE_ORDER.indexOf(a.typeKey);
        const bo = TYPE_ORDER.indexOf(b.typeKey);
        return (ao >= 0 ? ao : 99) - (bo >= 0 ? bo : 99);
      });
  }

  function openCheckpointInPlan(cp) {
    const params = new URLSearchParams({
      checkpointId: String(cp.id),
      classId: String(state.classId),
      subject: cp.subject
    });
    const teacherUrl = `/teacher/levelcheck-planen?${params}`;
    const url =
      window.SolAuth?.staffToolUrl?.(teacherUrl, "levelcheck-planen") || teacherUrl;
    history.pushState({ tab: "competenciesTab" }, "", url);
    if (typeof showTab === "function") {
      showTab("competenciesTab", null, { skipHistory: true });
    }
    if (window.TeacherCompetencies) {
      window.TeacherCompetencies.init();
    }
  }

  function renderList() {
    const items = upcomingCheckpoints();
    const levelChecks = state.data?.levelChecks || [];

    if (!items.length) {
      return `
        <p class="tc-empty">Keine anstehenden Termine${state.subjectFilter ? ` für ${escapeHtml(state.subjectFilter)}` : ""}.</p>
        <p class="hint">Neue Nachweise legst du unter „Levelcheck planen“ an.</p>`;
    }

    const rows = items
      .map((cp) => {
        const goals = linkedGoalLabels(cp, levelChecks);
        const goalText = goals.length
          ? `<ul class="tc-checkpoint-item-goals">${goals
              .map((g) => `<li>${escapeHtml(g)}</li>`)
              .join("")}</ul>`
          : `<span class="tc-checkpoint-item-goals">Keine Was-Ziele markiert</span>`;
        const ungradedNote =
          cp.typeKey === "levelcheck"
            ? `<span class="tc-checkpoint-item-ungraded">ohne Note · x von 10</span>`
            : "";
        const themaText = linkedTopicNames(cp, levelChecks);
        const resultsBtn =
          cp.typeKey === "levelcheck"
            ? `<button type="button" class="action tc-termine-eval" data-checkpoint-id="${escapeHtml(cp.id)}">Ergebnisse</button>`
            : "";

        return `
        <li class="tc-checkpoint-item">
          <div class="tc-checkpoint-item-body tc-termine-item-body">
            <span class="tc-checkpoint-item-date">${escapeHtml(isoToGerman(cp.dateIso))}</span>
            <span class="tc-termine-subject">${escapeHtml(cp.subject)}</span>
            <span class="tc-termine-type">${escapeHtml(cp.typeLabel)}</span>
            <span class="tc-checkpoint-item-thema">${escapeHtml(themaText)}</span>
            <span class="tc-when tc-when-upcoming">anstehend</span>
            ${ungradedNote}
            ${goalText}
          </div>
          <div class="tc-termine-btns">
            ${resultsBtn}
            <button type="button" class="tc-edit-btn tc-termine-edit" data-checkpoint-id="${escapeHtml(cp.id)}">Bearbeiten</button>
            <button type="button" class="tc-delete-btn tc-termine-delete" data-checkpoint-id="${escapeHtml(cp.id)}" ${
              state.deletingId === String(cp.id) ? "disabled" : ""
            }>${state.deletingId === String(cp.id) ? "Löschen…" : "Löschen"}</button>
          </div>
        </li>`;
      })
      .join("");

    return `<ul class="tc-checkpoint-overview tc-termine-list">${rows}</ul>`;
  }

  function selectedClassName() {
    const match = (window.__tmClasses || []).find((c) => sameId(c.id, state.classId));
    return match?.name || "";
  }

  function pastCheckpoints() {
    const today = todayIso();
    return allCheckpoints()
      .filter((cp) => cp.dateIso < today)
      .sort((a, b) => b.dateIso.localeCompare(a.dateIso));
  }

  function renderPastWorks() {
    const items = pastCheckpoints();
    if (!items.length) {
      return `<p class="hint">Keine vergangenen Arbeiten${state.subjectFilter ? ` für ${escapeHtml(state.subjectFilter)}` : ""}.</p>`;
    }
    const rows = items
      .map((cp) => {
        const goals = linkedGoalLabels(cp, state.data?.levelChecks || []);
        const goalText = goals.length
          ? `<ul class="tc-checkpoint-item-goals">${goals
              .map((g) => `<li>${escapeHtml(g)}</li>`)
              .join("")}</ul>`
          : `<span class="tc-checkpoint-item-goals">Keine Was-Ziele markiert</span>`;
        const ungradedNote =
          cp.typeKey === "levelcheck"
            ? `<span class="tc-checkpoint-item-ungraded">ohne Note · x von 10</span>`
            : "";
        const evalBtn =
          cp.typeKey === "levelcheck"
            ? `<button type="button" class="action tc-termine-eval" data-checkpoint-id="${escapeHtml(cp.id)}">Ergebnisse</button>`
            : "";
        return `
      <li class="tc-checkpoint-item">
        <div class="tc-checkpoint-item-body tc-termine-item-body">
          <span class="tc-checkpoint-item-date">${escapeHtml(isoToGerman(cp.dateIso))}</span>
          <span class="tc-termine-subject">${escapeHtml(cp.subject)}</span>
          <span class="tc-termine-type">${escapeHtml(cp.typeLabel)}</span>
          <span class="tc-checkpoint-item-thema">${escapeHtml(linkedTopicNames(cp, state.data?.levelChecks || []))}</span>
          <span class="tc-when tc-when-past">vergangen</span>
          ${ungradedNote}
          ${goalText}
        </div>
        <div class="tc-termine-btns">
          ${evalBtn}
          <button type="button" class="tc-delete-btn tc-termine-delete" data-checkpoint-id="${escapeHtml(cp.id)}" ${
            state.deletingId === String(cp.id) ? "disabled" : ""
          }>${state.deletingId === String(cp.id) ? "Löschen…" : "Löschen"}</button>
        </div>
      </li>`;
      })
      .join("");
    return `<ul class="tc-checkpoint-overview tc-termine-list">${rows}</ul>`;
  }

  function renderYearReset() {
    const className = selectedClassName();
    const count = allCheckpoints().length;
    return `
      <section class="tc-year-reset" aria-label="Schuljahr zurücksetzen">
        <h3>Neues Schuljahr</h3>
        <p class="hint">
          Löscht <strong>alle Termine und Arbeiten</strong> dieser Klasse (Klassenarbeiten, Tests, Levelchecks)
          inklusive Bewertungen, Zielnoten und der Schüler-Liste „Vergangene Arbeiten“.
          Levelplan, XP, Freiheitsränge und Schüler:innen bleiben.
        </p>
        <p class="hint">Aktuell ${count} Termin(e) in ${escapeHtml(className || "dieser Klasse")}.</p>
        <label class="lpi-label" for="tmResetClassName">Klassenname zur Bestätigung
          <input id="tmResetClassName" type="text" autocomplete="off" placeholder="${escapeHtml(className)}" value="${escapeHtml(state.resetClassName)}" ${state.resetting ? "disabled" : ""}>
        </label>
        <label class="lpi-label" for="tmResetPhrase">Genau schreiben: Schuljahr zurücksetzen
          <input id="tmResetPhrase" type="text" autocomplete="off" placeholder="Schuljahr zurücksetzen" value="${escapeHtml(state.resetPhrase)}" ${state.resetting ? "disabled" : ""}>
        </label>
        <button type="button" class="tc-delete-btn tc-topic-delete-btn" id="tmResetYearBtn" ${state.resetting ? "disabled" : ""}>
          ${state.resetting ? "Setze zurück…" : "Schuljahr zurücksetzen"}
        </button>
      </section>`;
  }

  function checkLevelLabel(level) {
    if (level === "operator") return "Operator";
    if (level === "street_legend") return "Street Legend";
    return "Rookie";
  }

  function resultStatusLabel(status) {
    switch (String(status || "")) {
      case "geplant":
        return "geplant";
      case "offen":
        return "offen";
      case "eingetragen":
        return "eingetragen";
      case "bestaetigt":
        return "bestätigt";
      case "nicht_bestanden":
        return "nicht bestanden";
      case "nicht_teilgenommen":
        return "nicht teilgenommen";
      default:
        return status || "–";
    }
  }

  function renderEvalModal() {
    if (!state.evalCheckpointId || !state.evalData) return "";
    const cp = state.evalData.checkpoint || {};
    const counts = state.evalData.counts || {};
    const max = Math.max(1, Number(cp.aufgaben) || 10);
    const freigegeben = !!cp.freigegebenAm;
    const levelText = checkLevelLabel(cp.checkLevel);
    const rows = (state.evalData.results || [])
      .map((ev) => {
        const skipped = !!ev.nichtTeilgenommen;
        const val = ev.richtig == null ? "" : String(ev.richtig);
        const av = ev.avatarUrl
          ? `<img class="tm-lc-av" src="${escapeHtml(ev.avatarUrl)}" alt="" width="36" height="36">`
          : `<span class="tm-lc-av tm-lc-av--empty" aria-hidden="true">${escapeHtml(
              String(ev.name || "?").trim().charAt(0).toUpperCase() || "?"
            )}</span>`;
        return `
        <tr data-student-id="${escapeHtml(ev.studentId)}" class="${skipped ? "tm-lc-row-skipped" : ""}">
          <td class="tm-lc-name">${av}<span>${escapeHtml(ev.name)}</span></td>
          <td class="tm-lc-richtig-cell">
            <input type="number" class="tm-lc-richtig" min="0" max="${max}" step="1"
              value="${escapeHtml(val)}" placeholder="0–${max}"
              ${skipped ? "disabled" : ""}
              aria-label="Richtige Aufgaben für ${escapeHtml(ev.name)}"
              inputmode="numeric">
            <span class="tm-lc-von">/ ${max}</span>
          </td>
          <td>
            <label class="tm-lc-skip">
              <input type="checkbox" class="tm-lc-skip-cb" ${skipped ? "checked" : ""}>
              nicht teilgenommen
            </label>
          </td>
          <td class="tm-lc-status">${escapeHtml(resultStatusLabel(ev.status))}</td>
          <td>
            <button type="button" class="action tm-eval-save" ${state.evalSaving ? "disabled" : ""}>Speichern</button>
          </td>
        </tr>`;
      })
      .join("");

    return `
      <div class="td-modal-overlay" id="tmEvalOverlay">
        <div class="td-modal td-modal--wide" role="dialog" aria-modal="true" aria-label="Levelcheck bewerten">
          <div class="td-modal-head">
            <div>
              <h3>Levelcheck bewerten</h3>
              <p class="td-modal-sub">${escapeHtml(cp.title || "Levelcheck")} · ${escapeHtml(levelText)} · ${escapeHtml(
                cp.subject || ""
              )}${cp.topicName ? ` · ${escapeHtml(cp.topicName)}` : ""} · ${escapeHtml(
                isoToGerman(cp.checkpointDate || cp.date || "")
              )}${freigegeben ? " · freigegeben" : ""}</p>
            </div>
            <button type="button" class="td-modal-close" id="tmEvalClose">✕</button>
          </div>
          <p class="hint tm-lc-counts"><strong>${Number(counts.entered) || 0} eingetragen · ${Number(counts.missing) || 0} fehlen</strong></p>
          <table class="td-detail-table tm-eval-table tm-lc-table">
            <thead>
              <tr><th>Schüler:in</th><th>Richtig</th><th></th><th>Status</th><th></th></tr>
            </thead>
            <tbody>${rows || `<tr><td colspan="5">Keine Schüler:innen in der Klasse.</td></tr>`}</tbody>
          </table>
          <div class="tm-lc-actions">
            <button type="button" class="action" id="tmLcRelease" ${state.evalSaving ? "disabled" : ""}>
              Alle freigeben
            </button>
            <button type="button" class="action" id="tmEvalClose2">Schließen</button>
          </div>
        </div>
      </div>`;
  }

  function render() {
    const root = document.getElementById("termineTabRoot");
    if (!root) return;

    if (state.loading && !state.data) {
      root.innerHTML = `<div class="tc-loading">Lade Termine…</div>`;
      return;
    }

    if (!state.data) {
      root.innerHTML = `<div class="tc-error">${escapeHtml(state.error || "Termine konnten nicht geladen werden.")}</div>`;
      return;
    }

    const subjects = subjectsList();
    const subjectOptions = [
      `<option value="">Alle Fächer</option>`,
      ...subjects.map(
        (s) =>
          `<option value="${escapeHtml(s)}" ${s === state.subjectFilter ? "selected" : ""}>${escapeHtml(s)}</option>`
      )
    ].join("");

    root.innerHTML = `
      <div class="panel">
        <h2>Termine</h2>
        <p class="hint">
          Alle anstehenden Nachweise auf einen Blick. Levelchecks erscheinen ohne Note – die markierten Was-Ziele werden angezeigt. Mit „Bearbeiten“ springst du zu Levelcheck planen, mit „Löschen“ entfernst du den Termin.
        </p>

        <div class="tc-toolbar">
          <label>Klasse:
            <select id="tmClassSelect"></select>
          </label>
          <label>Fach:
            <select id="tmSubjectSelect">${subjectOptions}</select>
          </label>
        </div>

        ${state.message ? `<div class="tc-msg tc-msg-ok">${escapeHtml(state.message)}</div>` : ""}
        ${state.error ? `<div class="tc-msg tc-msg-err">${escapeHtml(state.error)}</div>` : ""}

        <div class="tc-termine-actions">
          <button type="button" class="action" id="tmNewCheckpointBtn">Neuen Nachweis planen</button>
        </div>

        <h3>Anstehend</h3>
        ${renderList()}

        <h3 style="margin-top:18px;">Vergangene Arbeiten</h3>
        ${renderPastWorks()}

        ${renderYearReset()}
      </div>
      ${renderEvalModal()}`;

    fillClassSelect(root);
    bindHandlers(root);
  }

  function fillClassSelect(root) {
    const sel = root.querySelector("#tmClassSelect");
    if (!sel || !window.__tmClasses) return;
    sel.innerHTML = window.__tmClasses
      .map(
        (c) =>
          `<option value="${c.id}" ${sameId(c.id, state.classId) ? "selected" : ""}>${escapeHtml(c.name)}</option>`
      )
      .join("");
  }

  function bindHandlers(root) {
    root.querySelector("#tmClassSelect")?.addEventListener("change", (e) => {
      state.classId = Number(e.target.value);
      state.message = "";
      state.error = "";
      state.resetClassName = "";
      state.resetPhrase = "";
      loadData();
    });

    root.querySelector("#tmSubjectSelect")?.addEventListener("change", (e) => {
      state.subjectFilter = e.target.value;
      render();
    });

    root.querySelector("#tmNewCheckpointBtn")?.addEventListener("click", () => {
      const params = new URLSearchParams({ classId: String(state.classId) });
      if (state.subjectFilter) params.set("subject", state.subjectFilter);
      const teacherUrl = `/teacher/levelcheck-planen?${params}`;
      const url =
        window.SolAuth?.staffToolUrl?.(teacherUrl, "levelcheck-planen") || teacherUrl;
      history.pushState({ tab: "competenciesTab" }, "", url);
      if (typeof showTab === "function") {
        showTab("competenciesTab", null, { skipHistory: true });
      }
      if (window.TeacherCompetencies) {
        window.TeacherCompetencies.init();
      }
    });

    root.querySelectorAll(".tc-termine-edit").forEach((btn) => {
      btn.addEventListener("click", () => {
        const cp = upcomingCheckpoints().find((item) => sameId(item.id, btn.dataset.checkpointId));
        if (cp) openCheckpointInPlan(cp);
      });
    });

    root.querySelectorAll(".tc-termine-delete").forEach((btn) => {
      btn.addEventListener("click", () => deleteCheckpoint(btn.dataset.checkpointId));
    });

    root.querySelector("#tmResetClassName")?.addEventListener("input", (e) => {
      state.resetClassName = e.target.value;
    });
    root.querySelector("#tmResetPhrase")?.addEventListener("input", (e) => {
      state.resetPhrase = e.target.value;
    });
    root.querySelector("#tmResetYearBtn")?.addEventListener("click", resetSchoolYear);

    root.querySelectorAll(".tc-termine-eval").forEach((btn) => {
      btn.addEventListener("click", () => openEvalModal(btn.dataset.checkpointId));
    });

    const closeEval = () => {
      state.evalCheckpointId = null;
      state.evalData = null;
      render();
    };
    root.querySelector("#tmEvalClose")?.addEventListener("click", closeEval);
    root.querySelector("#tmEvalClose2")?.addEventListener("click", closeEval);
    root.querySelector("#tmEvalOverlay")?.addEventListener("click", (e) => {
      if (e.target.id === "tmEvalOverlay") closeEval();
    });

    root.querySelectorAll(".tm-eval-table tr[data-student-id]").forEach((tr) => {
      const skip = tr.querySelector(".tm-lc-skip-cb");
      const number = tr.querySelector(".tm-lc-richtig");
      skip?.addEventListener("change", () => {
        if (!number) return;
        number.disabled = !!skip.checked;
        if (skip.checked) number.value = "";
      });
      tr.querySelector(".tm-eval-save")?.addEventListener("click", () => {
        saveEvaluation(tr);
      });
    });

    root.querySelector("#tmLcRelease")?.addEventListener("click", releaseLevelcheck);
  }

  async function openEvalModal(checkpointId, opts = {}) {
    if (!checkpointId) return;
    if (!opts.keepMessage) state.message = "";
    if (!opts.keepError) state.error = "";
    try {
      const res = await fetch(
        `/api/teacher/levelcheck-checkpoints/${encodeURIComponent(checkpointId)}/results`
      );
      const data = await res.json();
      if (!res.ok || !data.success) {
        state.error = data.message || "Ergebnisse konnten nicht geladen werden.";
        render();
        return;
      }
      state.evalCheckpointId = checkpointId;
      state.evalData = data;
      render();
    } catch (err) {
      console.error(err);
      state.error = "Netzwerkfehler beim Laden der Ergebnisse.";
      render();
    }
  }

  async function saveEvaluation(tr) {
    const studentId = tr.dataset.studentId;
    const nichtTeilgenommen = !!tr.querySelector(".tm-lc-skip-cb")?.checked;
    const raw = tr.querySelector(".tm-lc-richtig")?.value;
    const richtig = raw === "" || raw == null ? null : Number(raw);
    if (!state.evalCheckpointId || !studentId) return;

    const btn = tr.querySelector(".tm-eval-save");
    if (btn) btn.disabled = true;
    state.evalSaving = true;
    try {
      const body = nichtTeilgenommen
        ? { nichtTeilgenommen: true }
        : { richtig };
      const res = await fetch(
        `/api/teacher/levelcheck-checkpoints/${encodeURIComponent(state.evalCheckpointId)}/results/${encodeURIComponent(studentId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        }
      );
      const data = await res.json();
      state.evalSaving = false;
      if (!res.ok || !data.success) {
        state.error = data.message || "Speichern fehlgeschlagen.";
        await openEvalModal(state.evalCheckpointId, { keepError: true });
        return;
      }
      state.message = "Eintrag gespeichert.";
      state.error = "";
      await openEvalModal(state.evalCheckpointId, { keepMessage: true });
    } catch (err) {
      console.error(err);
      state.evalSaving = false;
      state.error = "Netzwerkfehler beim Speichern.";
      if (btn) btn.disabled = false;
      render();
    }
  }

  async function releaseLevelcheck() {
    if (!state.evalCheckpointId || state.evalSaving) return;
    const counts = state.evalData?.counts || {};
    const missing = Number(counts.missing) || 0;
    const msg =
      missing > 0
        ? `${missing} fehlen noch. Fehlende werden als „nicht teilgenommen“ gesetzt.\n\nWirklich alle freigeben?`
        : "Alle Ergebnisse freigeben? Danach erscheinen die Treffer im Cockpit.";
    if (!confirm(msg)) return;
    state.evalSaving = true;
    render();
    try {
      const res = await fetch(
        `/api/teacher/levelcheck-checkpoints/${encodeURIComponent(state.evalCheckpointId)}/release`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }
      );
      const data = await res.json();
      state.evalSaving = false;
      if (!res.ok || !data.success) {
        state.error = data.message || "Freigabe fehlgeschlagen.";
        await openEvalModal(state.evalCheckpointId, { keepError: true });
        return;
      }
      state.message = data.overlay || `Freigegeben · ${data.treffer || 0} Treffer`;
      state.error = "";
      await openEvalModal(state.evalCheckpointId, { keepMessage: true });
    } catch (err) {
      console.error(err);
      state.evalSaving = false;
      state.error = "Netzwerkfehler bei der Freigabe.";
      render();
    }
  }

  async function deleteCheckpoint(checkpointId) {
    if (!checkpointId || state.deletingId) return;
    const cp = allCheckpoints().find((item) => sameId(item.id, checkpointId));
    const label = cp
      ? `${isoToGerman(cp.dateIso)} · ${cp.subject} · ${cp.typeLabel || "Nachweis"}`
      : "diesen Termin";
    if (!confirm(`Termin wirklich löschen?\n\n${label}`)) return;

    state.deletingId = String(checkpointId);
    state.error = "";
    state.message = "";
    render();
    try {
      const res = await fetch(
        `/api/teacher/levelcheck-checkpoints/${encodeURIComponent(checkpointId)}`,
        { method: "DELETE" }
      );
      const data = await res.json().catch(() => ({}));
      state.deletingId = null;
      if (!res.ok || !data.success) {
        state.error = data.message || "Löschen fehlgeschlagen.";
        render();
        return;
      }
      state.message = data.message || "Termin gelöscht.";
      if (sameId(state.evalCheckpointId, checkpointId)) {
        state.evalCheckpointId = null;
        state.evalData = null;
      }
      await loadData();
    } catch (err) {
      console.error(err);
      state.deletingId = null;
      state.error = "Netzwerkfehler beim Löschen.";
      render();
    }
  }

  async function resetSchoolYear() {
    if (state.resetting) return;
    const className = selectedClassName();
    const typedName = String(state.resetClassName || "").trim();
    const typedPhrase = String(state.resetPhrase || "").trim();
    if (!className) {
      state.error = "Bitte zuerst eine Klasse wählen.";
      render();
      return;
    }
    if (typedName !== className) {
      state.error = `Bitte den Klassennamen genau eingeben: ${className}`;
      render();
      return;
    }
    if (typedPhrase !== "Schuljahr zurücksetzen") {
      state.error = "Bitte zur Bestätigung genau „Schuljahr zurücksetzen“ schreiben.";
      render();
      return;
    }
    if (
      !confirm(
        `Alle Termine und Arbeiten von Klasse ${className} unwiderruflich löschen?\n\nAuch Zielnoten und vergangene Arbeiten in der Schüler-Zielsetzung verschwinden.\nLevelplan, XP und Freiheitsränge bleiben.`
      )
    ) {
      return;
    }

    state.resetting = true;
    state.error = "";
    state.message = "";
    render();
    try {
      const res = await fetch(
        `/api/teacher/classes/${encodeURIComponent(state.classId)}/reset-school-year`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            confirmClassName: typedName,
            confirmPhrase: typedPhrase
          })
        }
      );
      const data = await res.json().catch(() => ({}));
      state.resetting = false;
      if (!res.ok || !data.success) {
        state.error = data.message || "Zurücksetzen fehlgeschlagen.";
        render();
        return;
      }
      state.resetClassName = "";
      state.resetPhrase = "";
      state.message = data.message || "Schuljahr zurückgesetzt.";
      await loadData();
    } catch (err) {
      console.error(err);
      state.resetting = false;
      state.error = "Netzwerkfehler beim Zurücksetzen.";
      render();
    }
  }

  async function loadClasses() {
    const r = await fetch("/api/class");
    const payload = await r.json();
    if (!r.ok || !Array.isArray(payload)) {
      throw new Error(payload?.error || "Klassen konnten nicht geladen werden.");
    }
    window.__tmClasses = payload;
    return payload;
  }

  async function loadData() {
    if (!state.classId) return;

    state.loading = true;
    if (!state.data) render();

    try {
      const params = new URLSearchParams({ classId: String(state.classId) });
      const res = await fetch(`/api/teacher/levelchecks?${params}`);
      const payload = await res.json();

      if (!res.ok) {
        state.loading = false;
        state.data = null;
        state.error = payload.error || "Laden fehlgeschlagen.";
        render();
        return;
      }

      state.data = payload;
      state.loading = false;
      state.error = "";
      render();
    } catch (err) {
      console.error(err);
      state.loading = false;
      state.data = null;
      state.error = "Netzwerkfehler beim Laden.";
      render();
    }
  }

  async function init() {
    state.message = "";
    state.error = "";

    const root = document.getElementById("termineTabRoot");
    if (root) root.innerHTML = `<div class="tc-loading">Lade Termine…</div>`;

    try {
      const classes = await loadClasses();
      if (!classes.length) {
        if (root) {
          root.innerHTML = `<div class="tc-empty">Bitte zuerst eine Klasse anlegen (Menü „Klassen & Schüler“).</div>`;
        }
        return;
      }

      if (!state.classId || !classes.some((c) => sameId(c.id, state.classId))) {
        state.classId = Number(classes[0].id);
      }

      await loadData();
    } catch (err) {
      console.error(err);
      if (root) {
        root.innerHTML = `<div class="tc-error">${escapeHtml(err.message || "Fehler beim Laden.")}</div>`;
      }
    }
  }

  window.TeacherTermine = { init };
})();
