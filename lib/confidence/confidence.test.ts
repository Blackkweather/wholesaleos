/**
 * Data Confidence Layer tests. Standalone — no test framework required.
 *   Run:  npx tsx lib/confidence/confidence.test.ts
 *
 * Covers: ARV ensemble, gate, calibration MAPE, drift, RentCast quota, repair,
 * offer propagation, and the negotiation-blocking decision.
 */
import assert from "node:assert/strict";
import Module from "node:module";
import path from "node:path";

// Resolve `@/` like Next.js and stub the Next-only `server-only` shim so the
// confidence modules load under plain Node. Dummy DB url keeps Prisma's lazy
// client construction happy (no connection is made by these pure functions).
process.env.DATABASE_URL ??= "postgresql://u:p@localhost:5432/db";
process.env.DIRECT_URL ??= "postgresql://u:p@localhost:5432/db";

const ROOT = process.cwd();
type ModuleLoader = (request: string, parent: unknown, isMain: boolean) => unknown;
const loadable = Module as unknown as { _load: ModuleLoader };
const originalLoad = loadable._load;
loadable._load = (request, parent, isMain) => {
  if (request === "server-only") return {};
  if (request.startsWith("@/")) return originalLoad(path.join(ROOT, request.slice(2)), parent, isMain);
  return originalLoad(request, parent, isMain);
};

async function main(): Promise<void> {
  const { computeArvEnsemble, canCallRentcast, RENTCAST_MONTHLY_HARD_STOP } = await import("./arv");
  const { estimateRepair } = await import("./repair");
  const { computeOffer } = await import("./offer");
  const { canAutoAct } = await import("./gate");
  const { computeMAPE, isDrift } = await import("./calibration");

  // ── ARV ensemble ──────────────────────────────────────────────────────────
  const strong = computeArvEnsemble({
    members: [
      { source: "rentcast-avm", value: 200000, weight: 0.5 },
      { source: "rentcast-comps", value: 198000, weight: 0.2 },
      { source: "property-hcad", value: 202000, weight: 0.2 },
      { source: "prior-arv", value: 199000, weight: 0.1 },
    ],
    compCount: 6,
    rangeLow: 190000,
    rangeHigh: 210000,
  });
  assert.ok(strong.point >= 198000 && strong.point <= 202000, "strong ARV point near 200k");
  assert.ok(strong.confidence >= 0.8, `strong ARV confidence high (${strong.confidence})`);
  assert.ok(strong.ciHigh > strong.ciLow, "ARV CI ordered");
  assert.equal(strong.compCount, 6, "comp count preserved");

  const weak = computeArvEnsemble({ members: [{ source: "prior-arv", value: 200000, weight: 0.1 }], compCount: 0 });
  assert.ok(weak.confidence < 0.6, `single-source ARV confidence low (${weak.confidence})`);
  console.log("✓ ARV ensemble: strong=high-confidence, single-source=low-confidence");

  // ── Gate ──────────────────────────────────────────────────────────────────
  const pass = canAutoAct({ confidence: 0.85, point: 200000, ciLow: 190000, ciHigh: 210000, compCount: 6, driftActive: false });
  assert.equal(pass.allowed, true, "gate passes a strong estimate");

  const lowConf = canAutoAct({ confidence: 0.4, point: 200000, ciLow: 195000, ciHigh: 205000, compCount: 6, driftActive: false });
  assert.equal(lowConf.allowed, false, "gate blocks low confidence");
  assert.match(lowConf.reason, /below/i);

  const fewComps = canAutoAct({ confidence: 0.85, point: 200000, ciLow: 195000, ciHigh: 205000, compCount: 1, driftActive: false });
  assert.equal(fewComps.allowed, false, "gate blocks insufficient comps");
  assert.match(fewComps.reason, /comparable/i);

  const wideCi = canAutoAct({ confidence: 0.85, point: 200000, ciLow: 160000, ciHigh: 240000, compCount: 6, driftActive: false });
  assert.equal(wideCi.allowed, false, "gate blocks wide CI");
  assert.match(wideCi.reason, /interval/i);

  const drifting = canAutoAct({ confidence: 0.85, point: 200000, ciLow: 195000, ciHigh: 205000, compCount: 6, driftActive: true });
  assert.equal(drifting.allowed, false, "gate blocks active drift");
  assert.match(drifting.reason, /drift/i);
  console.log("✓ Gate: passes strong, blocks low-confidence / few-comps / wide-CI / drift");

  // ── Calibration MAPE ────────────────────────────────────────────────────────
  const mape = computeMAPE([
    { predicted: 100, actual: 100 },
    { predicted: 90, actual: 100 },
    { predicted: 110, actual: 100 },
    { predicted: 50, actual: 0 }, // skipped (actual <= 0)
  ]);
  assert.equal(mape.sampleN, 3, "MAPE skips non-positive actuals");
  assert.ok(Math.abs(mape.mape - 0.0667) < 0.001, `MAPE ~6.67% (${mape.mape})`);
  console.log("✓ Calibration: MAPE computed, invalid samples skipped");

  // ── Drift ───────────────────────────────────────────────────────────────────
  assert.equal(isDrift(0.2, 5), false, "no drift below min sample");
  assert.equal(isDrift(0.2, 20), true, "drift when error high + enough samples");
  assert.equal(isDrift(0.05, 50), false, "no drift when error low");
  console.log("✓ Drift: requires breached error AND minimum sample size");

  // ── RentCast quota ──────────────────────────────────────────────────────────
  assert.equal(canCallRentcast(RENTCAST_MONTHLY_HARD_STOP - 1), true, "quota allows below hard stop");
  assert.equal(canCallRentcast(RENTCAST_MONTHLY_HARD_STOP), false, "quota blocks at hard stop");
  assert.equal(canCallRentcast(RENTCAST_MONTHLY_HARD_STOP + 1), false, "quota blocks past hard stop");
  console.log("✓ RentCast quota: hard stop enforced");

  // ── Repair ──────────────────────────────────────────────────────────────────
  const knownRepair = estimateRepair({ priorRepair: 30000, arv: 200000 });
  assert.equal(knownRepair.point, 30000, "known repair point");
  assert.ok(knownRepair.confidence >= 0.6, `known repair confident (${knownRepair.confidence})`);
  assert.ok(knownRepair.ciLow < 30000 && knownRepair.ciHigh > 30000, "repair CI brackets point");

  const inferredRepair = estimateRepair({ arv: 200000 });
  assert.equal(inferredRepair.point, 30000, "inferred repair = 15% of ARV");
  assert.ok(inferredRepair.confidence < 0.5, `inferred repair low-confidence (${inferredRepair.confidence})`);
  assert.ok(
    inferredRepair.ciHigh - inferredRepair.ciLow > knownRepair.ciHigh - knownRepair.ciLow,
    "inferred repair CI wider than known",
  );
  console.log("✓ Repair: known=tight/confident, inferred=wide/low-confidence");

  // ── Offer propagation ────────────────────────────────────────────────────────
  const offer = computeOffer({
    arv: { kind: "ARV", point: 200000, ciLow: 190000, ciHigh: 210000, confidence: 0.9, compCount: 6, sources: [] },
    repair: { kind: "REPAIR", point: 30000, ciLow: 27000, ciHigh: 33000, confidence: 0.8, completeness: 0.8, sources: [] },
  });
  assert.equal(offer.point, 100000, "MAO = 200k*0.7 - 30k - 10k");
  assert.equal(offer.worstCaseOffer, 90000, "worst case = 190k*0.7 - 33k - 10k");
  assert.equal(offer.ciHigh, 110000, "best case = 210k*0.7 - 27k - 10k");
  assert.ok(offer.worstCaseOffer < offer.point && offer.point < offer.ciHigh, "offer uncertainty propagated");
  assert.equal(offer.confidence, 0.87, "offer confidence = 0.7*arv + 0.3*repair");
  console.log("✓ Offer: ARV+repair uncertainty propagated to worst-case offer");

  // ── Negotiation blocking (the decision the route enforces) ───────────────────
  const weakOffer = computeOffer({
    arv: weak, // single-source, low confidence, 0 comps
    repair: estimateRepair({ arv: weak.point }),
  });
  const negGate = canAutoAct({
    confidence: weakOffer.confidence,
    point: weak.point,
    ciLow: weak.ciLow,
    ciHigh: weak.ciHigh,
    compCount: weak.compCount,
    driftActive: false,
  });
  assert.equal(negGate.allowed, false, "negotiation refused on weak confidence");
  assert.ok(negGate.reason.length > 0, "block reason is explicit");
  console.log("✓ Negotiation blocking: refused with explicit reason on weak deal");

  console.log("\nALL TESTS PASSED");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
