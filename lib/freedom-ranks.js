/**
 * Freiheitsränge – zentral, manuell durch Lehrkraft.
 * Unabhängig von XP und von fachlichen Niveaus (Rookie/Operator/Street Legend).
 */

export const FREEDOM_RANKS = [
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

export const FREEDOM_RANK_DEFAULT = "starter";

export const FREEDOM_RANK_IDS = FREEDOM_RANKS.map((r) => r.id);

export function isValidFreedomRank(value) {
  return FREEDOM_RANK_IDS.includes(String(value || "").trim());
}

export function getFreedomRank(value) {
  if (value && typeof value === "object" && value.id) {
    return getFreedomRank(value.id);
  }
  const id = isValidFreedomRank(value) ? String(value).trim() : FREEDOM_RANK_DEFAULT;
  return FREEDOM_RANKS.find((r) => r.id === id) || FREEDOM_RANKS[0];
}

export function serializeFreedomRank(value) {
  const rank = getFreedomRank(value);
  return {
    id: rank.id,
    label: rank.label,
    color: rank.color,
    icon: rank.icon,
    symbol: rank.symbol,
    sortOrder: rank.sortOrder
  };
}
