/**
 * matchCityMap gegen echte public/cockpit-karten (ohne Schüler-Namen).
 * Ausführen: node scripts/test-cockpit-map-load.js
 */
import assert from "node:assert/strict";
import { loadCockpitMaps, clearCockpitMapsCache } from "../lib/cockpit-map-load.js";
import { matchCityMap } from "../lib/cockpit-season.js";

clearCockpitMapsCache();
const { index, details } = loadCockpitMaps();

assert.ok(Array.isArray(index) && index.length >= 5, "index.json geladen");
assert.ok(details.has("quadratische-gleichungen"), "qg-Detail geladen");
assert.ok(details.has("potenzen"), "potenzen-Detail geladen");

const qgWz = new Set(["qg-01", "qg-02", "qg-03", "qg-04", "qg-05"]);
const qg = matchCityMap(qgWz, index, details);
assert.equal(qg?.id, "quadratische-gleichungen", "qg-Ziele → Stadtkarte qg");

const detail = details.get("quadratische-gleichungen");
assert.equal(detail?.missions?.length, 5);
assert.ok(detail.image, "Bild-Datei gesetzt");
assert.ok(Array.isArray(detail.routeSegments) && detail.routeSegments.length > 0);

const py = matchCityMap(new Set(["py-01", "py-02", "py-03", "py-04"]), index, details);
assert.equal(py?.id, "pythagoras", "pythagoras-Ziele → Karte");

const none = matchCityMap(new Set(["fremd-01", "fremd-02"]), index, details);
assert.equal(none, null, "fremde wz → kein Match");

const again = loadCockpitMaps();
assert.strictEqual(again.index, index, "Cache wiederverwendet");

console.log("OK test-cockpit-map-load");
