import "server-only";
import { prisma } from "@/lib/prisma";
import { isDbReady, CURRENT_USER_ID } from "@/lib/data/db";

/**
 * Audit sampling — the only window into the Surfacing Engine's false negatives.
 * Randomly promotes a few recently-suppressed (AUTO_DEFAULTED) items into the
 * operator's review so true positives the engine hid become observable and the
 * engine's recall can be measured.
 */

export interface SampledItem {
  id: string;
  kind: string;
  dealId: string | null;
  surfaceScore: number;
  recommendation: unknown;
}

/** Pick `n` random items from a pool. Pure — testable. */
export function pickRandom<T>(pool: T[], n: number, rand: () => number = Math.random): T[] {
  if (n >= pool.length) return [...pool];
  const copy = [...pool];
  const out: T[] = [];
  for (let i = 0; i < n && copy.length > 0; i++) {
    const idx = Math.floor(rand() * copy.length);
    out.push(copy.splice(idx, 1)[0]);
  }
  return out;
}

/**
 * Sample up to `n` suppressed items from the last `windowHours` and flag them
 * for review. Returns the sampled items.
 */
export async function auditSample(n = 5, windowHours = 168, orgId: string = CURRENT_USER_ID): Promise<SampledItem[]> {
  if (!(await isDbReady())) return [];
  const since = new Date(Date.now() - windowHours * 60 * 60 * 1000);
  const pool = await prisma.surfaceItem.findMany({
    where: { orgId, status: "AUTO_DEFAULTED", createdAt: { gte: since }, resolution: null },
    select: { id: true, kind: true, dealId: true, surfaceScore: true, recommendation: true },
    take: 200,
  });

  const sampled = pickRandom(pool, n);
  if (sampled.length > 0) {
    await prisma.surfaceItem.updateMany({
      where: { id: { in: sampled.map((s) => s.id) } },
      data: { status: "OPEN" }, // surface for review without billing the daily budget
    });
    try {
      const { inngest } = await import("@/inngest/client");
      const send = inngest.send as (e: { name: string; data: Record<string, unknown> }) => Promise<unknown>;
      await send({ name: "surface.audit.sampled", data: { count: sampled.length, orgId } });
    } catch {
      /* event best-effort */
    }
  }

  return sampled.map((s) => ({
    id: s.id,
    kind: s.kind,
    dealId: s.dealId,
    surfaceScore: s.surfaceScore,
    recommendation: s.recommendation,
  }));
}
