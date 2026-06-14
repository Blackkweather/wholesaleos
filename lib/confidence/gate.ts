import "server-only";
import { prisma } from "@/lib/prisma";
import { isDbReady } from "@/lib/data/db";
import type { Prisma } from "@prisma/client";
import type { DealView } from "@/types";
import { estimateArv, ARV_MODEL_VERSION, type ArvEstimate } from "./arv";
import { estimateRepair, REPAIR_MODEL_VERSION, type RepairEstimate } from "./repair";
import { computeOffer, OFFER_MODEL_VERSION, type OfferEstimate } from "./offer";
import { checkDrift, type CalibrationStatus } from "./calibration";

/**
 * The confidence gate. No money-related action may proceed unless the deal's
 * estimates pass every check. Auto-block when:
 *   - confidence is below threshold
 *   - the ARV confidence interval is too wide for the market
 *   - calibration drift is active for the market
 *   - there are too few comparable sales
 */

const CONFIDENCE_MIN = 0.6;
const CI_MAX_RATIO = 0.16; // (ciHigh-ciLow)/point — ~±8% around the point estimate
const MIN_COMPS = 3;

export interface GateInput {
  confidence: number; // composite money-action confidence (0..1)
  point: number; // ARV point estimate
  ciLow: number; // ARV CI low
  ciHigh: number; // ARV CI high
  compCount: number; // comparable sales backing the ARV
  driftActive: boolean; // calibration drift for the market
  ciMaxRatio?: number; // per-market CI tolerance override
}

export interface GateResult {
  allowed: boolean;
  reason: string;
  confidence: number;
}

const pct = (n: number) => `${Math.round(n * 100)}%`;

/**
 * Pure gate decision. Exported for direct testing.
 */
export function canAutoAct(input: GateInput): GateResult {
  const confidence = Math.round(input.confidence * 100) / 100;

  if (input.driftActive) {
    return { allowed: false, reason: "Calibration drift active for this market — automation suspended", confidence };
  }
  if (input.confidence < CONFIDENCE_MIN) {
    return { allowed: false, reason: `Confidence ${pct(input.confidence)} is below the ${pct(CONFIDENCE_MIN)} threshold`, confidence };
  }
  if (input.compCount < MIN_COMPS) {
    return { allowed: false, reason: `Insufficient comparable sales (${input.compCount} < ${MIN_COMPS})`, confidence };
  }
  const width = input.point > 0 ? (input.ciHigh - input.ciLow) / input.point : Number.POSITIVE_INFINITY;
  const maxRatio = input.ciMaxRatio ?? CI_MAX_RATIO;
  if (width > maxRatio) {
    return {
      allowed: false,
      reason: `ARV confidence interval ${(width * 100).toFixed(1)}% exceeds the market maximum ${(maxRatio * 100).toFixed(1)}%`,
      confidence,
    };
  }
  return { allowed: true, reason: "All confidence checks passed", confidence };
}

export interface ConfidenceBundle {
  arv: ArvEstimate;
  repair: RepairEstimate;
  offer: OfferEstimate;
  drift: CalibrationStatus;
  gate: GateResult;
}

/**
 * Build the full ARV → repair → offer → drift → gate assessment for a deal.
 * Read-only (no persistence).
 */
export async function assessDeal(deal: DealView, marketId: string | null): Promise<ConfidenceBundle> {
  const arv = await estimateArv({
    address: deal.address,
    city: deal.city,
    state: deal.state,
    priorArv: deal.arv,
  });
  const repair = estimateRepair({
    priorRepair: deal.repairCost,
    arv: arv.point > 0 ? arv.point : deal.arv,
    conditionHints: deal.tags,
  });
  const offer = computeOffer({ arv, repair, assignmentFee: deal.assignmentFee });
  const drift = await checkDrift(marketId, "ARV");
  const gate = canAutoAct({
    confidence: offer.confidence,
    point: arv.point,
    ciLow: arv.ciLow,
    ciHigh: arv.ciHigh,
    compCount: arv.compCount,
    driftActive: drift.drift,
  });
  return { arv, repair, offer, drift, gate };
}

/** Persist the ARV/REPAIR/OFFER estimates as Estimate rows. */
async function persistEstimates(dealId: string, b: ConfidenceBundle): Promise<void> {
  const rows: Prisma.EstimateCreateManyInput[] = [
    {
      dealId, kind: "ARV", point: b.arv.point, ciLow: b.arv.ciLow, ciHigh: b.arv.ciHigh,
      confidence: b.arv.confidence, compCount: b.arv.compCount,
      sources: b.arv.sources as unknown as Prisma.InputJsonValue, modelVer: ARV_MODEL_VERSION,
    },
    {
      dealId, kind: "REPAIR", point: b.repair.point, ciLow: b.repair.ciLow, ciHigh: b.repair.ciHigh,
      confidence: b.repair.confidence, compCount: 0,
      sources: b.repair.sources as unknown as Prisma.InputJsonValue, modelVer: REPAIR_MODEL_VERSION,
    },
    {
      dealId, kind: "OFFER", point: b.offer.point, ciLow: b.offer.ciLow, ciHigh: b.offer.ciHigh,
      confidence: b.offer.confidence, compCount: 0,
      sources: b.offer.sources as unknown as Prisma.InputJsonValue, modelVer: OFFER_MODEL_VERSION,
    },
  ];
  await prisma.estimate.createMany({ data: rows });
}

/**
 * Assess a deal, persist its estimates, and set Deal.autoActBlocked from the
 * gate result. Returns the full bundle. Safe without a DB (assess only).
 */
export async function assessAndPersist(deal: DealView, marketId: string | null): Promise<ConfidenceBundle> {
  const bundle = await assessDeal(deal, marketId);
  if (await isDbReady()) {
    try {
      await persistEstimates(deal.id, bundle);
      await prisma.deal.update({ where: { id: deal.id }, data: { autoActBlocked: !bundle.gate.allowed } });
    } catch {
      /* persistence is best-effort; the assessment is still returned */
    }
  }
  return bundle;
}
