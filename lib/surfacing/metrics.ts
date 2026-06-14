import "server-only";
import { prisma } from "@/lib/prisma";
import { isDbReady } from "@/lib/data/db";

/**
 * Surfacing Engine self-measurement. The engine is judged on precision (of what
 * it surfaced, how much was useful) and recall (of what was useful, how much it
 * surfaced) — the latter estimated via the audit sample (see sampling.ts).
 */

export interface PrecisionRecallInput {
  surfacedUseful: number; // surfaced items the operator acted on (approved/modified)
  surfacedTotal: number; // surfaced items resolved (useful + dismissed)
  usefulTotal: number; // useful items found (surfaced-useful + sampled-but-suppressed-useful)
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Pure precision/recall. Exported for testing. */
export function precisionRecall(i: PrecisionRecallInput): { precision: number; recall: number } {
  const precision = i.surfacedTotal > 0 ? i.surfacedUseful / i.surfacedTotal : 0;
  const recall = i.usefulTotal > 0 ? i.surfacedUseful / i.usefulTotal : 0;
  return { precision: round2(precision), recall: round2(recall) };
}

/** Live engine metrics over resolved items in a recent window. */
export async function getSurfacingMetrics(windowDays = 30): Promise<{
  precision: number;
  recall: number;
  surfacedTotal: number;
  surfacedUseful: number;
}> {
  if (!(await isDbReady())) return { precision: 0, recall: 0, surfacedTotal: 0, surfacedUseful: 0 };
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
  const resolved = await prisma.surfaceItem.findMany({
    where: { status: "RESOLVED", createdAt: { gte: since } },
    select: { resolution: true },
  });
  const surfacedTotal = resolved.length;
  const surfacedUseful = resolved.filter((r) => r.resolution === "approved" || r.resolution === "modified").length;
  // Recall denominator approximated by surfaced-useful + audit-sampled useful suppressions.
  const sampledUseful = await prisma.surfaceItem.count({
    where: { status: "AUTO_DEFAULTED", resolution: "approved", createdAt: { gte: since } },
  });
  const pr = precisionRecall({ surfacedUseful, surfacedTotal, usefulTotal: surfacedUseful + sampledUseful });
  return { ...pr, surfacedTotal, surfacedUseful };
}
