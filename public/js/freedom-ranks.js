/**
 * Freiheitsränge – zentrale Frontend-Definition (Spiegel von lib/freedom-ranks.js).
 */
(function (global) {
  const FREEDOM_RANKS = [
    {
      id: "starter",
      sortOrder: 1,
      label: "Starter",
      color: "#94a3b8",
      icon: "/icons/freedom-ranks/rank-1-starter.png",
      symbol: "①"
    },
    {
      id: "street_scout",
      sortOrder: 2,
      label: "Street Scout",
      color: "#22d3ee",
      icon: "/icons/freedom-ranks/rank-2-street-scout.png",
      symbol: "②"
    },
    {
      id: "navigator",
      sortOrder: 3,
      label: "Navigator",
      color: "#a855f7",
      icon: "/icons/freedom-ranks/rank-3-navigator.png",
      symbol: "③"
    },
    {
      id: "free_agent",
      sortOrder: 4,
      label: "Free Agent",
      color: "#f59e0b",
      icon: "/icons/freedom-ranks/rank-4-free-agent.png",
      symbol: "④"
    },
    {
      id: "mission_master",
      sortOrder: 5,
      label: "Mission Master",
      color: "#22c55e",
      icon: "/icons/freedom-ranks/rank-5-mission-master.png",
      symbol: "⑤"
    }
  ];

  const DEFAULT = "starter";

  function get(value) {
    const id = String(value || "").trim();
    return FREEDOM_RANKS.find((r) => r.id === id) || FREEDOM_RANKS[0];
  }

  function isValid(value) {
    return FREEDOM_RANKS.some((r) => r.id === String(value || "").trim());
  }

  function optionHtml(selectedId, opts = {}) {
    const selected = isValid(selectedId) ? selectedId : DEFAULT;
    return FREEDOM_RANKS.map((r) => {
      const sel = r.id === selected ? " selected" : "";
      return `<option value="${r.id}"${sel}>${r.symbol} ${r.label}</option>`;
    }).join("");
  }

  function badgeHtml(value, opts = {}) {
    const r = get(value);
    const size = opts.size || 28;
    const showLabel = opts.showLabel !== false;
    const label = showLabel
      ? `<span class="freedom-rank-badge__label">${r.label}</span>`
      : "";
    return `
      <span class="freedom-rank-badge" style="--rank-color:${r.color}" title="Freiheitsrang: ${r.label}">
        <img class="freedom-rank-badge__icon" src="${r.icon}" alt="${r.label}" width="${size}" height="${size}" loading="lazy" />
        ${label}
      </span>`;
  }

  global.FreedomRanks = {
    list: FREEDOM_RANKS,
    DEFAULT,
    get,
    isValid,
    optionHtml,
    badgeHtml
  };
})(window);
