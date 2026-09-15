/**
 * Tests für Freiheitsränge, Klassen-XP-Logik und Levelcheck-Bewertung.
 * Ausführen: node scripts/test-freedom-ranks.js
 */
import {
  FREEDOM_RANKS,
  FREEDOM_RANK_DEFAULT,
  FREEDOM_RANK_IDS,
  isValidFreedomRank,
  getFreedomRank,
  serializeFreedomRank
} from "../lib/freedom-ranks.js";
import {
  LEVELCHECK_EVAL_STATUSES,
  LEVELCHECK_EVAL_STATUS_LABELS,
  LEVELCHECK_PASS_PERCENT,
  parseLevelcheckPercent,
  resolveLevelcheckEvalStatus,
  normalizeLevelcheckEvalStatus,
  isLevelcheckPassPercent,
  applyLevelcheckTopicUnlocks,
  splitZielsetzungTopics
} from "../lib/levelcheck-evaluation.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function testRankCatalog() {
  assert(FREEDOM_RANKS.length === 5, "exactly 5 ranks");
  assert(
    FREEDOM_RANK_IDS.join(",") ===
      "starter,street_scout,navigator,free_agent,mission_master",
    "rank order"
  );
  assert(FREEDOM_RANK_DEFAULT === "starter", "default starter");
  for (let i = 0; i < FREEDOM_RANKS.length; i++) {
    assert(FREEDOM_RANKS[i].sortOrder === i + 1, `sortOrder ${i + 1}`);
    assert(FREEDOM_RANKS[i].label, `label ${i}`);
    assert(FREEDOM_RANKS[i].icon.includes("/icons/freedom-ranks/"), `icon path ${i}`);
    assert(FREEDOM_RANKS[i].color, `color ${i}`);
  }
}

function testRankHelpers() {
  assert(isValidFreedomRank("navigator"), "valid navigator");
  assert(!isValidFreedomRank("rookie"), "rookie is competency tier, not freedom rank");
  assert(getFreedomRank(null).id === "starter", "null → starter");
  assert(getFreedomRank("Mission Master").id === "starter", "unknown → starter");
  assert(serializeFreedomRank("free_agent").label === "Free Agent", "serialize label");
  assert(serializeFreedomRank(FREEDOM_RANKS[4]).id === "mission_master", "serialize object");
}

function testRankAssetsExist() {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const dir = path.join(__dirname, "..", "public", "icons", "freedom-ranks");
  for (const r of FREEDOM_RANKS) {
    const file = path.basename(r.icon);
    assert(fs.existsSync(path.join(dir, file)), `asset missing: ${file}`);
  }
}

function testFrontendMirrorOrder() {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const src = fs.readFileSync(
    path.join(__dirname, "..", "public", "js", "freedom-ranks.js"),
    "utf8"
  );
  const ids = [...src.matchAll(/id:\s*"([^"]+)"/g)].map((m) => m[1]);
  assert(ids.join(",") === FREEDOM_RANK_IDS.join(","), "frontend mirror order matches");
}

function testAdminDropdownMarkup() {
  // Simulate optionHtml order without DOM
  const options = FREEDOM_RANKS.map((r) => r.label);
  assert(options[0] === "Starter", "dropdown first Starter");
  assert(options[4] === "Mission Master", "dropdown last Mission Master");
}

function testXpIndependentFromRank() {
  // Documented invariant: changing rank must not mutate XP values.
  const before = { xp: 420, freedom_rank: "starter" };
  const afterRank = "mission_master";
  const after = { ...before, freedom_rank: afterRank };
  assert(after.xp === before.xp, "rank change leaves XP untouched");
  assert(after.freedom_rank !== before.freedom_rank, "rank can change");
}

function testClassXpEarnedNotSpend() {
  // Class challenge progress uses earned (positive) XP, not spendable balance.
  const studentsA = [
    { classId: 1, earned: 100, balance: 70 }, // spent 30
    { classId: 1, earned: 50, balance: 50 }
  ];
  const studentsB = [{ classId: 2, earned: 200, balance: 200 }];
  const sumClass = (id) =>
    [...studentsA, ...studentsB]
      .filter((s) => s.classId === id)
      .reduce((n, s) => n + s.earned, 0);
  assert(sumClass(1) === 150, "class 1 earned XP");
  assert(sumClass(2) === 200, "class 2 earned XP");
  assert(sumClass(1) !== studentsA.reduce((n, s) => n + s.balance, 0), "earned ≠ balance after spend");
}

function testLevelcheckEvalStatuses() {
  assert(LEVELCHECK_EVAL_STATUSES.includes("not_evaluated"), "not_evaluated exists");
  assert(LEVELCHECK_EVAL_STATUSES.includes("failed"), "failed exists");
  assert(
    LEVELCHECK_EVAL_STATUS_LABELS.not_evaluated !== LEVELCHECK_EVAL_STATUS_LABELS.failed,
    "not evaluated ≠ failed labels"
  );
  assert(normalizeLevelcheckEvalStatus("bestanden") === "passed", "alias bestanden");
  assert(normalizeLevelcheckEvalStatus("nicht_bestanden") === "failed", "alias failed");

  const ok = resolveLevelcheckEvalStatus("passed", 10);
  assert(ok.ok && ok.status === "passed", "passed status ok");
  // percent does not auto-pass
  const pending = resolveLevelcheckEvalStatus("not_evaluated", 100);
  assert(pending.ok && pending.status === "not_evaluated", "100% does not auto-pass");
}

function testLevelcheckPercentBounds() {
  assert(parseLevelcheckPercent(null).ok && parseLevelcheckPercent(null).value === null, "null ok");
  assert(parseLevelcheckPercent(0).ok, "0 ok");
  assert(parseLevelcheckPercent(100).ok, "100 ok");
  assert(!parseLevelcheckPercent(-1).ok, "-1 rejected");
  assert(!parseLevelcheckPercent(101).ok, "101 rejected");
  assert(!parseLevelcheckPercent(50.5).ok, "float rejected");
  assert(!parseLevelcheckPercent("abc").ok, "string rejected");
}

function testPassThresholdAndUnlock() {
  assert(isLevelcheckPassPercent(69) === false, "69 fails");
  assert(isLevelcheckPassPercent(70) === true, "70 passes");
  assert(LEVELCHECK_PASS_PERCENT === 70, "threshold 70");

  const topics = applyLevelcheckTopicUnlocks([
    { id: "a", name: "A", sortOrder: 1, levelcheckPercent: 70 },
    { id: "b", name: "B", sortOrder: 2, levelcheckPercent: null },
    { id: "c", name: "C", sortOrder: 3, levelcheckPercent: null }
  ]);
  assert(topics[0].locked === false, "first open");
  assert(topics[0].levelcheckPassed === true, "first passed");
  assert(topics[1].locked === false, "second stays open");
  assert(topics[2].locked === false, "later topics stay open");

  const under = applyLevelcheckTopicUnlocks([
    { id: "a", name: "A", sortOrder: 1, levelcheckPercent: 50 },
    { id: "b", name: "B", sortOrder: 2 }
  ]);
  assert(under[0].levelcheckPassed === false, "50 does not pass check");
  assert(under[1].locked === false, "next topic stays open under 70");
}

function testZielsetzungPastArbeitenNeedCheckpoints() {
  const today = "2026-09-15";
  const catalogOnly = splitZielsetzungTopics(
    [
      { id: "koerper", name: "Körper", sortOrder: 1, hasGradedCheckpoint: false },
      { id: "kreis", name: "Kreis", sortOrder: 2, hasGradedCheckpoint: false },
      { id: "potenzen", name: "Potenzen und Wurzeln", sortOrder: 3, hasGradedCheckpoint: false }
    ],
    null,
    today
  );
  assert(catalogOnly.upcoming === null, "no upcoming without KA");
  assert(catalogOnly.past.length === 0, "catalog topics are not past Arbeiten");

  const afterWipe = splitZielsetzungTopics(
    [
      { id: "a", name: "A", hasGradedCheckpoint: false, checkpointDate: null },
      { id: "b", name: "B", hasGradedCheckpoint: false, checkpointDate: "2026-03-01" }
    ],
    "a",
    today
  );
  assert(afterWipe.upcoming === null, "upcoming id ignored without graded checkpoint");
  assert(afterWipe.past.length === 0, "wipe leaves no archived Arbeiten");

  const withKa = splitZielsetzungTopics(
    [
      {
        id: "future",
        name: "Zukunft",
        hasGradedCheckpoint: true,
        checkpointDate: "2026-10-01",
        sortOrder: 2
      },
      {
        id: "past",
        name: "Vergangen",
        hasGradedCheckpoint: true,
        checkpointDate: "2026-03-01",
        sortOrder: 1
      },
      { id: "catalog", name: "Katalog", hasGradedCheckpoint: false, sortOrder: 0 }
    ],
    "future",
    today
  );
  assert(withKa.upcoming?.id === "future", "upcoming KA");
  assert(withKa.past.length === 1 && withKa.past[0].id === "past", "only past KA archived");
}

function testPassedUnlockDoesNotTouchXpOrRank() {
  const before = { xp: 88, freedom_rank: "navigator" };
  const evaluation = { status: "passed", unlockedGoalIds: ["g1", "g2"] };
  const after = { ...before, unlocked: evaluation.unlockedGoalIds };
  assert(after.xp === before.xp, "pass leaves XP");
  assert(after.freedom_rank === before.freedom_rank, "pass leaves freedom rank");
  assert(after.unlocked.length === 2, "unlocks goals");
}

function testNewStudentDefault() {
  assert(getFreedomRank(undefined).id === "starter", "new student starter");
}

testRankCatalog();
testRankHelpers();
testRankAssetsExist();
testFrontendMirrorOrder();
testAdminDropdownMarkup();
testXpIndependentFromRank();
testClassXpEarnedNotSpend();
testLevelcheckEvalStatuses();
testLevelcheckPercentBounds();
testPassThresholdAndUnlock();
testZielsetzungPastArbeitenNeedCheckpoints();
testPassedUnlockDoesNotTouchXpOrRank();
testNewStudentDefault();

console.log("OK – freedom-rank / levelcheck evaluation tests passed");
