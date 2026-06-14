import "server-only";
import { MAO_ARV_MULTIPLIER, DEFAULT_ASSIGNMENT_FEE } from "@/constants/config";
import type { ArvEstimate } from "./arv";
import type { RepairEstimate } from "./repair";

/**
 * Offer confidence engine. Computes the Max Allowable Offer and propagates the
 * uncertainty from the ARV and repair confidence intervals into the offer CI.
 *
 *   point          = ARV.point  * MAO_mult - Repair.point  - fee
 *   worstCaseOffer = ARV.ciLow  * MAO_mult - Repair.ciHigh - fee   (most conservative)
 *   bestCase       = ARV.ciHigh * MAO_mult - Repair.ciLow  - fee
 *
 * Offer confidence is the weakest-link blend of ARV + repair confidence (ARV
 * dominates because it drives the larger term).
 */

export const OFFER_MODEL_VERSION = "offer-propagated-v1";

export interface OfferEstimate {
  kind: "OFFER";
  point: number;
  ciLow: number;
  ciHigh: number;
  confidence: number; // 0..1
  worstCaseOffer: number;
  mao: number;
  sources: { source: string; value: number; weight: number }[];
}

export interface OfferInput {
  arv: ArvEstimate;
  repair: RepairEstimate;
  assignmentFee?: number | null;
  maoMultiplier?: number;
}

const round = (n: number) => Math.round(n);
const atLeastZero = (n: number) => Math.max(0, n);
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/**
 * Pure offer computation with uncertainty propagation. Exported for testing.
 */
export function computeOffer(input: OfferInput): OfferEstimate {
  const mult = input.maoMultiplier ?? MAO_ARV_MULTIPLIER;
  const fee = input.assignmentFee ?? DEFAULT_ASSIGNMENT_FEE;
  const { arv, repair } = input;

  const mao = arv.point * mult - repair.point - fee;
  const worstCase = arv.ciLow * mult - repair.ciHigh - fee;
  const bestCase = arv.ciHigh * mult - repair.ciLow - fee;

  // ARV drives the larger term, so it carries more weight in offer confidence.
  const confidence = clamp01(0.7 * arv.confidence + 0.3 * repair.confidence);

  return {
    kind: "OFFER",
    point: round(atLeastZero(mao)),
    ciLow: round(atLeastZero(worstCase)),
    ciHigh: round(atLeastZero(bestCase)),
    confidence: Math.round(confidence * 100) / 100,
    worstCaseOffer: round(atLeastZero(worstCase)),
    mao: round(atLeastZero(mao)),
    sources: [
      { source: "arv", value: arv.point, weight: mult },
      { source: "repair", value: repair.point, weight: -1 },
      { source: "assignment-fee", value: fee, weight: -1 },
    ],
  };
}
