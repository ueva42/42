/**
 * Admin-App Hub – Kachel-Startseite statt 20er-Sidebar.
 * Öffnet bestehende Tabs über window.showTab(tabId).
 */
(function () {
  const GROUPS = [
    {
      id: "ueberblick",
      title: "Überblick",
      tiles: [
        {
          tab: "dashboardTab",
          title: "Klassenübersicht",
          desc: "Heute in der Klasse – Logbuch & Hinweise",
          accent: "cyan",
          cta: "Öffnen",
          featured: true
        },
        {
          tab: "teacherWeekTab",
          title: "Wochenübersicht",
          desc: "Aktivität der Klasse über die Woche",
          accent: "violet",
          cta: "Woche"
        }
      ]
    },
    {
      id: "planung",
      title: "Planung & Level",
      tiles: [
        {
          tab: "timetableTab",
          title: "Stundenplan",
          desc: "Stundenplan der Klasse pflegen",
          accent: "orange",
          cta: "Bearbeiten"
        },
        {
          tab: "levelplanTab",
          title: "Levelplan",
          desc: "Themen, Unterthemen und aktive Level",
          accent: "green",
          cta: "Levelplan"
        },
        {
          tab: "levelplanZuordnungTab",
          title: "Zuordnung",
          desc: "Levelplan einer Klasse zuweisen",
          accent: "green",
          cta: "Zuweisen"
        },
        {
          tab: "levelplanImportTab",
          title: "Importieren",
          desc: "Neuen Levelplan anlegen oder ergänzen",
          accent: "cyan",
          cta: "Import"
        },
        {
          tab: "wasGoalsTab",
          title: "Was-Ziele",
          desc: "Was-Ziele für den Unterricht",
          accent: "violet",
          cta: "Öffnen"
        },
        {
          tab: "lessonGoalsTab",
          title: "Wie-Ziele",
          desc: "Wie-Ziele und Strategien",
          accent: "violet",
          cta: "Öffnen"
        },
        {
          tab: "competenciesTab",
          title: "Nachweise planen",
          desc: "Levelchecks und Checkpoints",
          accent: "amber",
          cta: "Checks"
        },
        {
          tab: "termineTab",
          title: "Termine",
          desc: "Klassenarbeiten, Tests, Termine",
          accent: "orange",
          cta: "Termine"
        }
      ]
    },
    {
      id: "unterricht",
      title: "Unterricht",
      tiles: [
        {
          tab: "gruppenmodusTab",
          title: "Gruppenmodus",
          desc: "Rollen und Shared-Tablet",
          accent: "violet",
          cta: "Starten"
        },
        {
          tab: "materialschrankTab",
          title: "Materialschrank",
          desc: "Links und Materialien für Schüler:innen",
          accent: "cyan",
          cta: "Material"
        }
      ]
    },
    {
      id: "klasse",
      title: "Klasse & Bewertung",
      tiles: [
        {
          tab: "classTab",
          title: "Klassen & Schüler",
          desc: "Klassen anlegen, Passwörter, aktive Level",
          accent: "cyan",
          cta: "Verwalten"
        },
        {
          tab: "teachersTab",
          title: "Lehrerverwaltung",
          desc: "Lehrkräfte und Klassenzuweisung",
          accent: "violet",
          cta: "Lehrkräfte",
          adminOnly: true
        },
        {
          tab: "xpTab",
          title: "XP-Verwaltung",
          desc: "XP manuell vergeben oder korrigieren",
          accent: "amber",
          cta: "XP"
        },
        {
          tab: "classProgressTab",
          title: "Klassen-Voting",
          desc: "Belohnungsrunde und Stimmen",
          accent: "orange",
          cta: "Voting"
        }
      ]
    },
    {
      id: "spiel",
      title: "Spielsystem",
      tiles: [
        {
          tab: "missionTab",
          title: "Missionen",
          desc: "Missionen anlegen und pflegen",
          accent: "green",
          cta: "Missionen"
        },
        {
          tab: "bonusTab",
          title: "Bonuskarten",
          desc: "Bonuskarten für die Klasse",
          accent: "amber",
          cta: "Boni"
        },
        {
          tab: "characterTab",
          title: "Charaktere",
          desc: "Charakter-Auswahl",
          accent: "violet",
          cta: "Charaktere"
        },
        {
          tab: "levelTab",
          title: "Freiheitsränge",
          desc: "Ränge und Freischaltungen",
          accent: "cyan",
          cta: "Ränge"
        }
      ]
    },
    {
      id: "konto",
      title: "Konto",
      tiles: [
        {
          tab: "profileTab",
          title: "Profil & Passwort",
          desc: "Eigenes Konto und Passwort",
          accent: "cyan",
          cta: "Profil"
        }
      ]
    }
  ];

  const TAB_TITLES = {};
  GROUPS.forEach((g) => {
    g.tiles.forEach((t) => {
      TAB_TITLES[t.tab] = t.title;
    });
  });

  function escapeHtml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function isAdmin() {
    const s = window.__staffSession;
    return s?.role === "admin" || s?.canAdmin === true;
  }

  function renderTile(tile) {
    return `
      <button type="button" class="admin-hub-tile accent-${escapeHtml(tile.accent)}${
        tile.featured ? " is-featured" : ""
      }" data-admin-hub-tab="${escapeHtml(tile.tab)}">
        <p class="admin-hub-tile__kicker">${tile.featured ? "Empfohlen" : "Bereich"}</p>
        <h3 class="admin-hub-tile__title">${escapeHtml(tile.title)}</h3>
        <p class="admin-hub-tile__desc">${escapeHtml(tile.desc)}</p>
        <span class="admin-hub-tile__cta">${escapeHtml(tile.cta)} →</span>
      </button>`;
  }

  function render() {
    const root = document.getElementById("adminHubTabRoot");
    if (!root) return;

    const admin = isAdmin();
    const groupsHtml = GROUPS.map((group) => {
      const tiles = group.tiles.filter((t) => !t.adminOnly || admin);
      if (!tiles.length) return "";
      return `
        <section class="admin-hub-section" data-hub-group="${escapeHtml(group.id)}">
          <div class="admin-hub-section__head">
            <h2 class="admin-hub-section__title">${escapeHtml(group.title)}</h2>
          </div>
          <div class="admin-hub-grid">${tiles.map(renderTile).join("")}</div>
        </section>`;
    }).join("");

    root.innerHTML = `
      <div class="admin-hub">
        <header class="admin-hub-hero">
          <p class="admin-hub-hero__brand">Streets of Logic</p>
          <h1 class="admin-hub-hero__title">Administration</h1>
          <p class="admin-hub-hero__sub">Wähle einen Bereich – alles an einem Ort, ohne lange Menüliste.</p>
        </header>
        ${groupsHtml}
      </div>`;

    root.querySelectorAll("[data-admin-hub-tab]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const tab = btn.getAttribute("data-admin-hub-tab");
        if (tab && typeof window.showTab === "function") window.showTab(tab);
      });
    });
  }

  function init() {
    render();
  }

  function titleForTab(tabId) {
    return TAB_TITLES[tabId] || "";
  }

  window.AdminHub = { init, render, titleForTab, TAB_TITLES };
})();
