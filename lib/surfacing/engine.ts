import "server-only";
import { prisma } from "@/lib/prisma";
import { isDbReady, CURRENT_USER_ID } from "@/lib/data/db";
import { kvGetRaw, kvSetRaw, kvIncrBy, kvExpire } from "@/lib/cache";
import type { Prisma } from "@prisma/client";
import { surfaceScore, type SurfaceKind, type SurfaceScoreInput } from "./score";

/**
 * Surfacing Engine v2. Produces SurfaceItems, suppresses below an adaptive
 * threshold that keeps the daily surfaced count within the operator's attention
 * budget, and exempts money/legal items from suppression entirely.
 */

export const DEFAULT_TARGET_DAILY = 12;
const T_TTL = 60 * 60; // wos:surface:T — 1h
const COUNT_TTL = 36 * 60 * 60; // wos:surface:count — 36h
const DEFAULT_EXPIRY_DAYS = 7;

const tKey = (orgId: string) => `wos:surface:T:${orgId}`;
const countKey = (orgId: string) => {
  const d = new Date();
  const ymd = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
  return `wos:surface:count:${orgId}:${ymd}`;
};

// ---------------------------------------------------------------------------
// Pure decision helpers (tested directly)
// ---------------------------------------------------------------------------

/** Money/legal-exempt items always surface; others must beat the threshold. */
export function shouldSurface(score: number, threshold: number, moneyExempt: boolean): boolean {
  return moneyExempt || score > threshold;
}

/** Adaptive threshold: raise when too noisy, lower when too quiet, to hold budget. */
export function nextThreshold(current: number, actualToday: number, target: number): number {
  if (target <= 0) return current;
  if (actualToday > target) return Math.round((current + 1) * 100) / 100;
  if (actualToday < target * 0.5) return Math.max(0, Math.round((current - 0.5) * 100) / 100);
  return current;
}

// ---------------------------------------------------------------------------
// Threshold persistence
// ---------------------------------------------------------------------------

export async function getThreshold(orgId: string = CURRENT_USER_ID): Promise<number> {
  const cached = await kvGetRaw(tKey(orgId));
  if (cached !== null) {
    const n = Number(cached);
    if (Number.isFinite(n)) return n;
  }
  if (await isDbReady()) {
    const row = await prisma.surfacingThreshold.findUnique({ where: { orgId } });
    const current = row?.current ?? 0;
    await kvSetRaw(tKey(orgId), String(current), T_TTL);
    return current;
  }
  return 0;
}

export async function recalibrateThreshold(orgId: string = CURRENT_USER_ID): Promise<number> {
  if (!(await isDbReady())) return 0;
  const row = await prisma.surfacingThreshold.findUnique({ where: { orgId } });
  const target = row?.targetDailyCount ?? DEFAULT_TARGET_DAILY;
  const actualToday = Number((await kvGetRaw(countKey(orgId))) ?? 0);
  const next = nextThreshold(row?.current ?? 0, actualToday, target);
  await prisma.surfacingThreshold.upsert({
    where: { orgId },
    create: { orgId, current: next, targetDailyCount: target, actualToday },
    update: { current: next, actualToday },
  });
  await kvSetRaw(tKey(orgId), String(next), T_TTL);
  return next;
}

// ---------------------------------------------------------------------------
// Create / list / resolve
// ---------------------------------------------------------------------------

export interface CreateSurfaceInput {
  kind: SurfaceKind;
  dealId?: string | null;
  score: SurfaceScoreInput;
  moneyExempt?: boolean;
  batchKey?: string;
  recommendation: Record<string, unknown>;
  defaultAction: Record<string, unknown>;
  orgId?: string;
  expiresInDays?: number;
}

export interface SurfaceResult {
  surfaced: boolean;
  id: string | null;
  score: number;
  status: "OPEN" | "AUTO_DEFAULTED" | "DEDUPED";
}

/**
 * Score an item, apply the adaptive threshold (money-exempt bypasses it), dedupe
 * by batchKey, and persist. Surfaced items count against the daily budget.
 */
export async function createSurfaceItem(input: CreateSurfaceInput): Promise<SurfaceResult> {
  const orgId = input.orgId ?? CURRENT_USER_ID;
  const score = surfaceScore(input.score);
  const moneyExempt = input.moneyExempt ?? input.score.humanRequired;

  if (!(await isDbReady())) {
    return { surfaced: shouldSurface(score, await getThreshold(orgId), moneyExempt), id: null, score, status: "AUTO_DEFAULTED" };
  }

  // Dedupe: an existing OPEN item with the same batchKey absorbs this one.
  if (input.batchKey) {
    const existing = await prisma.surfaceItem.findFirst({
      where: { orgId, batchKey: input.batchKey, status: "OPEN" },
      select: { id: true },
    });
    if (existing) return { surfaced: true, id: existing.id, score, status: "DEDUPED" };
  }

  const threshold = await getThreshold(orgId);
  const surfaced = shouldSurface(score, threshold, moneyExempt);
  const status = surfaced ? "OPEN" : "AUTO_DEFAULTED";

  const item = await prisma.surfaceItem.create({
    data: {
      orgId,
      kind: input.kind,
      dealId: input.dealId ?? null,
      surfaceScore: score,
      valueAtStake: Math.round(input.score.valueAtStake),
      confidence: input.score.confidence,
      moneyExempt,
      batchKey: input.batchKey ?? null,
      recommendation: input.recommendation as Prisma.InputJsonValue,
      defaultAction: input.defaultAction as Prisma.InputJsonValue,
      status,
      expiresAt: new Date(Date.now() + (input.expiresInDays ?? DEFAULT_EXPIRY_DAYS) * 24 * 60 * 60 * 1000),
    },
  });

  if (surfaced) {
    const key = countKey(orgId);
    const n = await kvIncrBy(key, 1);
    if (n === 1) await kvExpire(key, COUNT_TTL);
  }

  return { surfaced, id: item.id, score, status: surfaced ? "OPEN" : "AUTO_DEFAULTED" };
}

export async function listOpenSurface(kind?: SurfaceKind, orgId: string = CURRENT_USER_ID) {
  if (!(await isDbReady())) return [];
  return prisma.surfaceItem.findMany({
    where: { orgId, status: "OPEN", ...(kind ? { kind } : {}) },
    orderBy: [{ moneyExempt: "desc" }, { surfaceScore: "desc" }],
    take: 100,
  });
}

export async function resolveSurfaceItem(
  id: string,
  resolution: "approved" | "modified" | "rejected" | "dismissed",
): Promise<boolean> {
  if (!(await isDbReady())) return false;
  try {
    await prisma.surfaceItem.update({ where: { id }, data: { status: "RESOLVED", resolution } });
    return true;
  } catch {
    return false;
  }
}
