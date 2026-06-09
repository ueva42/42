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
      title: "Levelplan",
      subtitle: "Matrix: pro Ziel deine Stufe markieren.",
      phase: null
    },
    levelcheck: {
      title: "Levelcheck",
      subtitle: "Nachweise hochladen: Rookie → Operator → Street Legend.",
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

    if (section === "levelcheck" && window.LogbuchLevelcheck) {
      window.LogbuchLevelcheck.init();
      return;
    }

    const config = SCREENS[section];
    if (!config) return;
    renderPlaceholder(section, config);
  }

  window.LogbuchScreens = { init, SCREENS };
})();
