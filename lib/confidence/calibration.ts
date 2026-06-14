import "server-only";
import { prisma } from "@/lib/prisma";
import { isDbReady } from "@/lib/data/db";
import { redis } from "../redis";

/**
 * Calibration engine — tracks prediction error per market + kind on a rolling
 * window and flags drift. When drift is active for a market/kind, the gate
 * blocks money actions (auto-suspension) until error recovers.
 */

export type CalibrationKind = "ARV" | "REPAIR";

const ROLLING_WINDOW = 50; // most recent outcomes per market/kind
const DRIFT_MAPE_THRESHOLD = 0.12; // 12% rolling error trips drift
const DRIFT_MIN_SAMPLE = 10; // need this many samples before trusting drift
const CALIB_CACHE_TTL = 60 * 60; // wos:calib:{marketId}:{kind} — 1h

export interface MapeSample {
  predicted: number;
  actual: number;
}

export interface CalibrationStatus {
  marketId: string;
  kind: CalibrationKind;
  mape: number;
  sampleN: number;
  drift: boolean;
}

/**
 * Mean Absolute Percentage Error over valid samples. Pure — testable.
 * Samples with a non-positive actual are skipped (cannot divide).
 */
export function computeMAPE(samples: MapeSample[]): { mape: number; sampleN: number } {
  const valid = samples.filter((s) => Number.isFinite(s.actual) && s.actual > 0 && Number.isFinite(s.predicted));
  if (valid.length === 0) return { mape: 0, sampleN: 0 };
  const total = valid.reduce((sum, s) => sum + Math.abs((s.actual - s.predicted) / s.actual), 0);
  return { mape: total / valid.length, sampleN: valid.length };
}

/**
 * Drift decision from a rolling error + sample size. Pure — testable.
 * Drift requires both a breached error threshold AND a minimum sample size.
 */
export function isDrift(mape: number, sampleN: number): boolean {
  return sampleN >= DRIFT_MIN_SAMPLE && mape > DRIFT_MAPE_THRESHOLD;
}

function calibCacheKey(marketId: string, kind: CalibrationKind): string {
  return `wos:calib:${marketId}:${kind}`;
}

/**
 * Record a realized actual against a prior prediction, then recompute the
 * rolling calibration aggregate for the market/kind. No-op without a DB.
 */
export async function recordOutcome(params: {
  dealId: string;
  marketId: string | null;
  kind: CalibrationKind;
  predicted: number;
  actual: number;
}): Promise<CalibrationStatus | null> {
  if (!(await isDbReady())) return null;
  const { dealId, marketId, kind, predicted, actual } = params;

  // Persist the actual on the deal's Outcome row (one per deal).
  const outcomeData =
    kind === "ARV"
      ? { predictedArv: predicted, actualSale: actual }
      : { predictedFee: predicted, actualFee: actual };
  await prisma.outcome.upsert({
    where: { dealId },
    create: { dealId, marketId, ...outcomeData },
    update: { marketId: marketId ?? undefined, ...outcomeData },
  });

  if (!marketId) return null;

  // Recompute rolling MAPE from the most recent outcomes in this market.
  const recent = await prisma.outcome.findMany({
    where: { marketId },
    orderBy: { createdAt: "desc" },
    take: ROLLING_WINDOW,
  });

  const samples: MapeSample[] = recent
    .map((o) =>
      kind === "ARV"
        ? { predicted: o.predictedArv ?? NaN, actual: o.actualSale ?? NaN }
        : { predicted: o.predictedFee ?? NaN, actual: o.actualFee ?? NaN },
    )
    .filter((s) => Number.isFinite(s.predicted) && Number.isFinite(s.actual));

  const { mape, sampleN } = computeMAPE(samples);
  const drift = isDrift(mape, sampleN);

  await prisma.calibration.upsert({
    where: { marketId_kind: { marketId, kind } },
    create: { marketId, kind, mape, sampleN, drift, windowEnd: new Date() },
    update: { mape, sampleN, drift, windowEnd: new Date() },
  });

  const status: CalibrationStatus = { marketId, kind, mape, sampleN, drift };
  if (redis) {
    try {
      await redis.set(calibCacheKey(marketId, kind), JSON.stringify(status), { ex: CALIB_CACHE_TTL });
    } catch {
      /* best-effort */
    }
  }
  return status;
}

/**
 * Current drift status for a market/kind. Reads the 1h Redis cache first, then
 * the Calibration table. Returns a non-drift default when no data exists.
 */
export async function checkDrift(marketId: string | null, kind: CalibrationKind): Promise<CalibrationStatus> {
  const fallback: CalibrationStatus = { marketId: marketId ?? "", kind, mape: 0, sampleN: 0, drift: false };
  if (!marketId) return fallback;

  if (redis) {
    try {
      const cached = await redis.get<CalibrationStatus>(calibCacheKey(marketId, kind));
      if (cached) return cached;
    } catch {
      /* fall through to DB */
    }
  }

  if (!(await isDbReady())) return fallback;
  const row = await prisma.calibration.findUnique({ where: { marketId_kind: { marketId, kind } } });
  if (!row) return fallback;
  const status: CalibrationStatus = { marketId, kind, mape: row.mape, sampleN: row.sampleN, drift: row.drift };
  if (redis) {
    try {
      await redis.set(calibCacheKey(marketId, kind), JSON.stringify(status), { ex: CALIB_CACHE_TTL });
    } catch {
      /* best-effort */
    }
  }
  return status;
}
