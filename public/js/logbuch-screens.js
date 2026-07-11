/**
 * SRL-Logbuch – Screen-Komponenten (Schritt 2: leere Platzhalter).
 */
(function () {
  const SCREENS = {
    today: {
      title: "Mein Tag",
      subtitle: "Dein Lernweg für heute – Planen, Check, Reflektieren.",
      phase: null
    },
    week: {
      title: "Meine Woche",
      subtitle: "Überblick über deine Lernziele und Reflexionen.",
      phase: "week"
    },
    levelplan: {
      title: "Mein Lernstand",
      subtitle: "Sieh deine Entwicklung und was du schon sicher kannst.",
      phase: null
    },
    "taktik-deck": {
      title: "Taktik-Deck",
      subtitle: "Strategien, die dir helfen, wenn du festhängst.",
      phase: null
    },
    zielsetzung: {
      title: "Zielsetzung",
      subtitle: "Street Target – Zielnote setzen & Level-Fortschritt.",
      phase: null
    },
    "checkpoint-plan": {
      title: "Meine Checks",
      subtitle: "Tests, Klassenarbeiten und wichtige Termine im Blick.",
      phase: null
    },
    plan: {
      title: "Planen",
      subtitle: "Forethought – Was will ich in dieser Stunde erreichen?",
      phase: "plan"
    },
    check: {
      title: "Zwischen-Check",
      subtitle: "Performance – Bin ich auf dem richtigen Weg?",
      phase: "check"
    },
    reflect: {
      title: "Tagesabschluss",
      subtitle: "Self-Reflection – Was habe ich gelernt?",
      phase: "reflect"
    }
  };

  function renderPlaceholder(screenId, config) {
    const root = document.getElementById(`${screenId}-screen-root`);
    if (!root || root.dataset.rendered === "1") return;

    const phaseClass = config.phase ? ` logbuch-phase-${config.phase}` : "";

    root.innerHTML = `
      <div class="logbuch-placeholder${phaseClass}">
        <p class="logbuch-placeholder-tag">SRL-Logbuch</p>
        <h3 class="logbuch-placeholder-title">${config.title}</h3>
        <p class="logbuch-placeholder-sub">${config.subtitle}</p>
        <p class="logbuch-placeholder-hint">Screen wird im nächsten Schritt befüllt.</p>
      </div>
    `;
    root.dataset.rendered = "1";
  }

  function init(section, query) {
    if (section === "plan" && window.LogbuchPlan) {
      window.LogbuchPlan.init(query);
      return;
    }

    if (section === "reflect" && window.LogbuchReflect) {
      window.LogbuchReflect.init(query);
      return;
    }

    if (section === "check" && window.LogbuchCheck) {
      window.LogbuchCheck.init(query);
      return;
    }

    if (section === "hub" && window.LogbuchHub) {
      window.LogbuchHub.init();
      return;
    }

    if (section === "today" && window.LogbuchToday) {
      window.LogbuchToday.init();
      return;
    }

    if (section === "week" && window.LogbuchWeek) {
      window.LogbuchWeek.init();
      return;
    }

    if (section === "levelplan" && window.LogbuchLevelplan) {
      window.LogbuchLevelplan.init();
      return;
    }

    if (section === "taktik-deck" && window.LogbuchTaktikDeck) {
      window.LogbuchTaktikDeck.init();
      return;
    }

    if (section === "zielsetzung" && window.LogbuchZielsetzung) {
      window.LogbuchZielsetzung.init();
      return;
    }

    if (section === "checkpoint-plan" && window.LogbuchCheckpointPlan) {
      window.LogbuchCheckpointPlan.init();
      return;
    }

    if (section === "levelcheck" && window.LogbuchZielsetzung) {
      window.LogbuchZielsetzung.init();
      return;
    }

    const config = SCREENS[section];
    if (!config) return;
    renderPlaceholder(section, config);
  }

  window.LogbuchScreens = { init, SCREENS };
})();
