import "server-only";
import { matchBuyersForDealScored } from "@/lib/data/buyers";
import type { DealView } from "@/types";

/**
 * Buyer-match confidence. A deal with several strong buyer matches can be
 * dispositioned with confidence; one weak match cannot. Confidence rises with
 * the number of matches and the quality of the best ones.
 */

export const MATCH_MODEL_VERSION = "match-confidence-v1";

export interface MatchConfidence {
  kind: "MATCH";
  confidence: number; // 0..1
  matchCount: number;
  topScore: number; // 0..100
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/**
 * Confidence from match scores (each 0..100). Pure — testable.
 * Blends count coverage (3+ matches = full) with the best match's strength.
 */
export function matchConfidenceFrom(matchScores: number[]): MatchConfidence {
  const valid = matchScores.filter((s) => Number.isFinite(s) && s >= 0);
  if (valid.length === 0) return { kind: "MATCH", confidence: 0, matchCount: 0, topScore: 0 };
  const topScore = Math.max(...valid);
  const countScore = Math.min(1, valid.length / 3);
  const qualityScore = clamp01(topScore / 100);
  const confidence = clamp01(0.5 * countScore + 0.5 * qualityScore);
  return {
    kind: "MATCH",
    confidence: Math.round(confidence * 100) / 100,
    matchCount: valid.length,
    topScore: Math.round(topScore),
  };
}

/** Compute buyer-match confidence for a deal from the live buyer list. */
export async function matchConfidence(deal: DealView): Promise<MatchConfidence> {
  const matches = await matchBuyersForDealScored(deal);
  return matchConfidenceFrom(matches.map((m) => m.matchScore));
}
