import "server-only";

/**
 * Surface scoring — decides how loudly an item competes for the operator's
 * attention. Pure: no I/O, fully testable.
 *
 *   score = (valueAtStake/1000) × urgency × (1−confidence) × novelty × humanWeight
 *
 * High value + urgent + low system-confidence + not-yet-seen ranks highest.
 * Items the system is confident about, or has shown recently, fall toward zero.
 */

export type SurfaceKind = "DECISION" | "RISK" | "OPPORTUNITY";

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

export interface SurfaceScoreInput {
  valueAtStake: number; // dollars at stake (spread/fee)
  urgency: number; // 0..1 (time pressure)
  confidence: number; // 0..1 (system confidence it is handling this correctly)
  novelty: number; // 0..1 (0 = already surfaced recently)
  humanRequired: boolean; // legally/financially gated OR out-of-policy
}

export function surfaceScore(i: SurfaceScoreInput): number {
  const v = Math.max(0, i.valueAtStake) / 1000;
  const base = v * clamp01(i.urgency) * (1 - clamp01(i.confidence)) * clamp01(i.novelty);
  const weight = i.humanRequired ? 1.5 : 1;
  return Math.round(base * weight * 100) / 100;
}

/** Novelty decays to 0 the more recently an item of the same shape was surfaced. */
export function noveltyFromAgeHours(hoursSinceLastShown: number | null): number {
  if (hoursSinceLastShown === null) return 1; // never shown
  if (hoursSinceLastShown <= 0) return 0;
  return clamp01(hoursSinceLastShown / 24); // full novelty again after ~24h
}
