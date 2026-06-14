/**
 * Surfacing Engine tests (pure core). Run: npx tsx lib/surfacing/surfacing.test.ts
 */
import assert from "node:assert/strict";
import Module from "node:module";

type ModuleLoader = (request: string, parent: unknown, isMain: boolean) => unknown;
const loadable = Module as unknown as { _load: ModuleLoader };
const originalLoad = loadable._load;
loadable._load = (request, parent, isMain) => (request === "server-only" ? {} : originalLoad(request, parent, isMain));

async function main(): Promise<void> {
  const { surfaceScore, noveltyFromAgeHours } = await import("./score");
  const { shouldSurface, nextThreshold } = await import("./engine");
  const { precisionRecall } = await import("./metrics");
  const { pickRandom } = await import("./sampling");

  // Surface score: high value + urgent + low confidence + novel ranks high.
  const hot = surfaceScore({ valueAtStake: 20000, urgency: 0.9, confidence: 0.2, novelty: 1, humanRequired: false });
  const cold = surfaceScore({ valueAtStake: 20000, urgency: 0.9, confidence: 0.95, novelty: 1, humanRequired: false });
  assert.ok(hot > cold, "low system-confidence scores higher than high-confidence");
  assert.ok(surfaceScore({ valueAtStake: 0, urgency: 1, confidence: 0, novelty: 1, humanRequired: false }) === 0, "no value → no score");
  const human = surfaceScore({ valueAtStake: 20000, urgency: 0.9, confidence: 0.2, novelty: 1, humanRequired: true });
  assert.ok(human > hot, "human-required carries extra weight");
  console.log("✓ surface score ranks by value × urgency × (1−confidence) × novelty");

  // Novelty decays with recency.
  assert.equal(noveltyFromAgeHours(null), 1);
  assert.equal(noveltyFromAgeHours(0), 0);
  assert.ok(noveltyFromAgeHours(12) > 0 && noveltyFromAgeHours(12) < 1);
  console.log("✓ novelty decays with recency");

  // Money-exempt items always surface; others must beat the threshold.
  assert.equal(shouldSurface(1, 5, true), true, "money-exempt bypasses threshold");
  assert.equal(shouldSurface(1, 5, false), false, "below threshold suppressed");
  assert.equal(shouldSurface(6, 5, false), true, "above threshold surfaces");
  console.log("✓ money-exempt bypasses suppression; others gated by threshold");

  // Adaptive threshold protects the attention budget.
  assert.ok(nextThreshold(2, 20, 12) > 2, "too noisy → raise threshold");
  assert.ok(nextThreshold(2, 3, 12) < 2, "too quiet → lower threshold");
  assert.equal(nextThreshold(2, 10, 12), 2, "near target → hold");
  assert.equal(nextThreshold(0, 3, 12), 0, "threshold never goes below 0");
  console.log("✓ adaptive threshold raises when noisy, lowers when quiet");

  // Precision/recall.
  const pr = precisionRecall({ surfacedUseful: 8, surfacedTotal: 10, usefulTotal: 16 });
  assert.equal(pr.precision, 0.8);
  assert.equal(pr.recall, 0.5);
  console.log("✓ precision/recall computed");

  // Audit sampling picks the requested count.
  const picked = pickRandom([1, 2, 3, 4, 5], 3, () => 0);
  assert.equal(picked.length, 3, "samples requested count");
  assert.equal(pickRandom([1, 2], 5).length, 2, "caps at pool size");
  console.log("✓ audit sampling selects from suppressed pool");

  console.log("\nSURFACING TESTS PASSED");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
