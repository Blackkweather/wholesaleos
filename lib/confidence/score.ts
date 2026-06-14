import "server-only";
import { scoreDealHybrid, type HybridScore } from "@/lib/data/scoring";
import type { DealView } from "@/types";

/**
 * Lead-score confidence wrapper. The hybrid score itself is deterministic; this
 * layer attaches a confidence (0..1) reflecting how much real data backed the
 * score, so the gate can distinguish a well-supported score from a guess.
 */

export const SCORE_MODEL_VERSION = "score-confidence-v1";

export interface ScoreConfidence {
  kind: "SCORE";
  point: number; // the hybrid score, 0..100
  confidence: number; // 0..1
  verdict: HybridScore["verdict"];
  components: HybridScore["components"];
  reasons: string[];
}

export interface ScoreSignals {
  hasArv: boolean;
  hasRepair: boolean;
  hasSituation: boolean;
  hasTags: boolean;
  hasHistory: boolean;
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/**
 * Confidence purely from which inputs were present. Pure — testable.
 */
export function scoreConfidence(signals: ScoreSignals): number {
  let c = 0.2; // base
  if (signals.hasArv) c += 0.25;
  if (signals.hasRepair) c += 0.15;
  if (signals.hasSituation) c += 0.15;
  if (signals.hasTags) c += 0.1;
  if (signals.hasHistory) c += 0.15;
  return clamp01(c);
}

/** Score a deal and attach a data-completeness confidence. */
export async function scoreWithConfidence(deal: DealView): Promise<ScoreConfidence> {
  const hybrid = await scoreDealHybrid(deal);
  const confidence = scoreConfidence({
    hasArv: Boolean(deal.arv && deal.arv > 0),
    hasRepair: Boolean(deal.repairCost && deal.repairCost > 0),
    hasSituation: Boolean(deal.situation && deal.situation.trim()),
    hasTags: (deal.tags ?? []).length > 0,
    hasHistory: !hybrid.reasons.some((r) => r.includes("No closed-deal history")),
  });
  return {
    kind: "SCORE",
    point: hybrid.score,
    confidence: Math.round(confidence * 100) / 100,
    verdict: hybrid.verdict,
    components: hybrid.components,
    reasons: hybrid.reasons,
  };
}
