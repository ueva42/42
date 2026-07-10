/**
 * Start-Briefing – kurze Einführung beim ersten Öffnen des Schülerbereichs.
 */
(function () {
  const UI = () => window.LogbuchUI;

  const CARDS = [
    {
      title: "Willkommen bei Streets of Logic",
      paragraphs: [
        "Hier sammelst du nicht nur XP. Du lernst auch, dein Lernen besser zu steuern."
      ],
      takeaway:
        "Du planst, arbeitest, checkst dich und schaust am Ende, was besser geworden ist.",
      nextLabel: "Los geht's"
    },
    {
      title: "1. Setze dir ein Tagesziel",
      paragraphs: ["Am Anfang wählst du, woran du heute arbeiten willst."],
      listIntro: "Du entscheidest:",
      list: [
        "Was will ich heute können?",
        "Auf welchem Level arbeite ich?",
        "Wie will ich daran arbeiten?"
      ],
      example:
        "Ich übe Richtig zählen auf Operator-Level und starte mit Rookie-Aufgaben."
    },
    {
      title: "Was-Ziel und Wie-Ziel",
      paragraphs: ["Das Was-Ziel sagt, was du lernen willst."],
      examples: [{ label: "Was-Ziel", text: "Ich kann mit Gegenereignissen rechnen." }],
      paragraphsAfter: ["Das Wie-Ziel sagt, wie du daran arbeitest."],
      examplesAfter: [
        { label: "Wie-Ziel", text: "Ich vergleiche meinen Rechenweg mit der Musterlösung." }
      ],
      takeaway: "Was-Ziel = Was will ich können?\nWie-Ziel = Wie komme ich dahin?"
    },
    {
      title: "2. Mach einen Zwischen-Check",
      paragraphs: [
        "Während der Stunde prüfst du kurz, ob du noch auf dem richtigen Weg bist."
      ],
      listIntro: "Du fragst dich:",
      list: [
        "Bin ich auf dem richtigen Weg?",
        "Verstehe ich die Aufgaben?",
        "Komme ich gut voran?",
        "Was mache ich jetzt?"
      ],
      takeaway: "Der Zwischen-Check hilft dir, rechtzeitig nachzusteuern."
    },
    {
      title: "Wenn du hängst: Taktik holen",
      paragraphs: ["Wenn du nicht weiterkommst, klickst du auf Taktik holen."],
      listIntro: "Dann bekommst du eine passende Lernstrategie, zum Beispiel:",
      list: [
        "Beispiel anschauen",
        "Fehlerjäger-Check",
        "Aufgabe kleiner machen",
        "Probe machen",
        "5-Minuten-Start"
      ],
      important:
        "Die App gibt dir nicht einfach die Lösung. Sie hilft dir, selbst weiterzukommen."
    },
    {
      title: "3. Schau zurück",
      paragraphs: ["Am Ende der Stunde prüfst du, ob dein Plan funktioniert hat."],
      listIntro: "Du fragst dich:",
      list: [
        "Habe ich mein Ziel erreicht?",
        "Hat mein Weg funktioniert?",
        "Hat mir eine Taktik geholfen?",
        "Was ist mein nächster Schritt?"
      ],
      paragraphsAfter: [
        "Am Ende der Woche siehst du, was du geschafft hast und was noch offen ist."
      ],
      nextLabel: "Start-Briefing abschließen"
    }
  ];

  const state = {
    open: false,
    index: 0,
    reviewMode: false,
    saving: false
  };

  function renderList(ui, intro, items) {
    if (!items?.length) return "";
    return `
      ${intro ? `<p class="briefing-text">${ui.escapeHtml(intro)}</p>` : ""}
      <ul class="briefing-list">
        ${items.map((item) => `<li>${ui.escapeHtml(item)}</li>`).join("")}
      </ul>`;
  }

  function renderCard(ui, card) {
    const examples = (card.examples || [])
      .map(
        (ex) =>
          `<p class="briefing-example"><strong>${ui.escapeHtml(ex.label)}:</strong> ${ui.escapeHtml(ex.text)}</p>`
      )
      .join("");

    const examplesAfter = (card.examplesAfter || [])
      .map(
        (ex) =>
          `<p class="briefing-example"><strong>${ui.escapeHtml(ex.label)}:</strong> ${ui.escapeHtml(ex.text)}</p>`
      )
      .join("");

    const paragraphs = (card.paragraphs || [])
      .map((p) => `<p class="briefing-text">${ui.escapeHtml(p)}</p>`)
      .join("");

    const paragraphsAfter = (card.paragraphsAfter || [])
      .map((p) => `<p class="briefing-text">${ui.escapeHtml(p)}</p>`)
      .join("");

    return `
      <p class="briefing-kicker">Start-Briefing</p>
      <h2 class="briefing-title" id="briefingModalTitle">${ui.escapeHtml(card.title)}</h2>
      ${paragraphs}
      ${renderList(ui, card.listIntro, card.list)}
      ${examples}
      ${paragraphsAfter}
      ${examplesAfter}
      ${
        card.example
          ? `<p class="briefing-example"><strong>Beispiel:</strong> ${ui.escapeHtml(card.example)}</p>`
          : ""
      }
      ${
        card.takeaway
          ? `<div class="briefing-takeaway">${ui.escapeHtml(card.takeaway).replace(/\n/g, "<br>")}</div>`
          : ""
      }
      ${
        card.important
          ? `<div class="briefing-important">${ui.escapeHtml(card.important)}</div>`
          : ""
      }`;
  }

  function nextLabel() {
    const card = CARDS[state.index];
    if (state.index === CARDS.length - 1) {
      return card.nextLabel || "Start-Briefing abschließen";
    }
    return card.nextLabel || "Weiter";
  }

  function renderOverlay() {
    const existing = document.getElementById("startBriefingOverlay");
    if (existing) existing.remove();
    if (!state.open) return;

    const ui = UI();
    const card = CARDS[state.index];
    const overlay = document.createElement("div");
    overlay.id = "startBriefingOverlay";
    overlay.className = "briefing-overlay";
    overlay.innerHTML = `
      <div class="briefing-modal" role="dialog" aria-modal="true" aria-labelledby="briefingModalTitle">
        <div class="briefing-progress">${state.index + 1} / ${CARDS.length}</div>
        <div class="briefing-body">${renderCard(ui, card)}</div>
        <div class="briefing-actions">
          ${
            state.index > 0
              ? `<button type="button" class="logbuch-btn-ghost" id="briefingBackBtn">Zurück</button>`
              : ""
          }
          <button type="button" class="btn-primary briefing-next-btn" id="briefingNextBtn" ${
            state.saving ? "disabled" : ""
          }>${ui.escapeHtml(state.saving ? "Speichern…" : nextLabel())}</button>
          <button type="button" class="logbuch-btn-ghost briefing-later-btn" id="briefingLaterBtn">
            Später ansehen
          </button>
        </div>
      </div>`;

    document.body.appendChild(overlay);
    bindHandlers(overlay);
  }

  function bindHandlers(overlay) {
    overlay.querySelector("#briefingBackBtn")?.addEventListener("click", () => {
      if (state.index > 0) {
        state.index -= 1;
        renderOverlay();
      }
    });

    overlay.querySelector("#briefingNextBtn")?.addEventListener("click", () => {
      if (state.index < CARDS.length - 1) {
        state.index += 1;
        renderOverlay();
        return;
      }
      completeBriefing();
    });

    overlay.querySelector("#briefingLaterBtn")?.addEventListener("click", close);

    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close();
    });
  }

  async function completeBriefing() {
    if (state.reviewMode || window.__hasSeenStartBriefing) {
      close();
      return;
    }

    state.saving = true;
    renderOverlay();

    try {
      const res = await fetch("/api/student/start-briefing/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      });
      const data = await res.json();
      if (data.success) {
        window.__hasSeenStartBriefing = true;
      }
    } catch (err) {
      console.error(err);
    }

    state.saving = false;
    close();
  }

  function open(options = {}) {
    state.open = true;
    state.index = 0;
    state.reviewMode = !!options.review;
    state.saving = false;
    renderOverlay();
  }

  function close() {
    state.open = false;
    state.index = 0;
    state.saving = false;
    document.getElementById("startBriefingOverlay")?.remove();
  }

  function openAuto() {
    if (window.__hasSeenStartBriefing) return;
    const charOverlay = document.getElementById("characterOverlay");
    if (charOverlay?.style.display === "flex") return;
    open({ review: false });
  }

  function openReview() {
    open({ review: true });
  }

  window.LogbuchStartBriefing = {
    open,
    openAuto,
    openReview,
    close
  };
})();
