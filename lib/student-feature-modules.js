/**
 * App-Module pro Klasse – Lehrkraft/Admin schaltet Sichtbarkeit für die Klasse.
 * Fehlende/leere Config = alles an (bisheriges Verhalten).
 * Kern (Hub, Mein Tag, Plan/Check/Reflect) bleibt immer erreichbar.
 */

export const FEATURE_MODULE_DEFS = [
  { id: "week", label: "Meine Woche", sections: ["week"] },
  { id: "ueben", label: "Üben zu Hause", sections: ["ueben"] },
  { id: "levelplan", label: "Lernstand", sections: ["levelplan"] },
  { id: "zielsetzung", label: "Zielsetzung", sections: ["zielsetzung"] },
  { id: "hausaufgaben", label: "Hausaufgaben", sections: ["hausaufgaben"] },
  { id: "checkpointPlan", label: "Meine Checks", sections: ["checkpoint-plan"] },
  { id: "materialschrank", label: "Materialschrank", sections: ["materialschrank"] },
  { id: "gruppenmodus", label: "Gruppenarbeit", sections: ["gruppenmodus"] },
  { id: "taktikDeck", label: "Taktik-Deck", sections: ["taktik-deck"] },
  { id: "missionen", label: "Missionen", sections: ["missionen"] },
  { id: "belohnungen", label: "Belohnungen", sections: ["belohnungen"] },
  { id: "charakter", label: "Charakter", sections: ["charakter"] },
  { id: "xp", label: "XP-Historie", sections: ["xp"] }
];

export const FEATURE_MODULE_IDS = FEATURE_MODULE_DEFS.map((d) => d.id);

export const CORE_SECTIONS = new Set(["hub", "today", "plan", "check", "reflect"]);

const SECTION_TO_MODULE = new Map();
for (const def of FEATURE_MODULE_DEFS) {
  for (const section of def.sections) {
    SECTION_TO_MODULE.set(section, def.id);
  }
}

export function featureModuleCatalog() {
  return FEATURE_MODULE_DEFS.map((d) => ({ id: d.id, label: d.label }));
}

export function defaultFeatureModules() {
  return Object.fromEntries(FEATURE_MODULE_IDS.map((id) => [id, true]));
}

export function normalizeFeatureModules(raw) {
  const defaults = defaultFeatureModules();
  let src = raw;
  if (typeof src === "string") {
    try {
      src = JSON.parse(src);
    } catch {
      src = null;
    }
  }
  if (!src || typeof src !== "object" || Array.isArray(src)) {
    return defaults;
  }
  const out = { ...defaults };
  for (const id of FEATURE_MODULE_IDS) {
    if (Object.prototype.hasOwnProperty.call(src, id)) {
      out[id] = !(src[id] === false || src[id] === 0 || src[id] === "false" || src[id] === "0");
    }
  }
  return out;
}

/** Partial update from checkbox UI – unknown keys ignored. */
export function mergeFeatureModules(current, patch) {
  const base = normalizeFeatureModules(current);
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return base;
  const out = { ...base };
  for (const id of FEATURE_MODULE_IDS) {
    if (Object.prototype.hasOwnProperty.call(patch, id)) {
      out[id] = !(patch[id] === false || patch[id] === 0 || patch[id] === "false" || patch[id] === "0");
    }
  }
  return out;
}

export function isModuleEnabled(modules, moduleId) {
  if (!FEATURE_MODULE_IDS.includes(moduleId)) return true;
  return !!normalizeFeatureModules(modules)[moduleId];
}

export function isSectionEnabled(modules, section) {
  const key = String(section || "").trim();
  if (!key || CORE_SECTIONS.has(key)) return true;
  const moduleId = SECTION_TO_MODULE.get(key);
  if (!moduleId) return true;
  return isModuleEnabled(modules, moduleId);
}

export function moduleIdForSection(section) {
  return SECTION_TO_MODULE.get(String(section || "").trim()) || null;
}
