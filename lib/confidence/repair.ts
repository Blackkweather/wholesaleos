import "server-only";

/**
 * Repair confidence engine — point estimate + confidence interval driven by data
 * completeness. A known repair budget is tight and confident; a value inferred
 * from ARV alone is wide and low-confidence. CI width scales inversely with
 * completeness, so missing data widens the band rather than faking precision.
 */

export const REPAIR_MODEL_VERSION = "repair-completeness-v1";
const DEFAULT_REPAIR_RATIO = 0.15; // fallback rehab as a fraction of ARV
const MIN_HALF_WIDTH = 0.15; // ±15% at full completeness
const MAX_HALF_WIDTH = 0.5; // ±50% with no signal

export interface RepairEstimate {
  kind: "REPAIR";
  point: number;
  ciLow: number;
  ciHigh: number;
  confidence: number; // 0..1
  completeness: number; // 0..1
  sources: { source: string; value: number; weight: number }[];
}

export interface RepairSignals {
  priorRepair?: number | null;
  arv?: number | null;
  sqft?: number | null;
  conditionHints?: string[];
}

const round = (n: number) => Math.round(n);
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/**
 * Completeness score from the signals we actually have. Pure — testable.
 */
export function repairCompleteness(signals: RepairSignals): number {
  let score = 0;
  if (signals.priorRepair && signals.priorRepair > 0) score += 0.6; // an explicit budget dominates
  if (signals.sqft && signals.sqft > 0) score += 0.15;
  if (signals.conditionHints && signals.conditionHints.length > 0) score += 0.15;
  if (signals.arv && signals.arv > 0) score += 0.1;
  return clamp01(score);
}

/**
 * Pure repair estimate from signals. Exported for direct testing.
 */
export function estimateRepair(signals: RepairSignals): RepairEstimate {
  const completeness = repairCompleteness(signals);
  const sources: RepairEstimate["sources"] = [];

  let point: number;
  if (signals.priorRepair && signals.priorRepair > 0) {
    point = signals.priorRepair;
    sources.push({ source: "prior-repair", value: round(point), weight: 1 });
  } else if (signals.arv && signals.arv > 0) {
    point = signals.arv * DEFAULT_REPAIR_RATIO;
    sources.push({ source: "arv-ratio", value: round(point), weight: 1 });
  } else {
    return { kind: "REPAIR", point: 0, ciLow: 0, ciHigh: 0, confidence: 0, completeness, sources };
  }

  // Half-width interpolates from MAX (no data) down to MIN (full completeness).
  const halfWidth = MAX_HALF_WIDTH - (MAX_HALF_WIDTH - MIN_HALF_WIDTH) * completeness;
  const ciLow = Math.max(0, point * (1 - halfWidth));
  const ciHigh = point * (1 + halfWidth);
  const confidence = clamp01(0.2 + 0.8 * completeness);

  return {
    kind: "REPAIR",
    point: round(point),
    ciLow: round(ciLow),
    ciHigh: round(ciHigh),
    confidence: Math.round(confidence * 100) / 100,
    completeness: Math.round(completeness * 100) / 100,
    sources,
  };
}
