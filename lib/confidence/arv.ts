import "server-only";
import { redis } from "../redis";
import { getRentcastValue, isRentcastConfigured } from "../rentcast";
import { verifyProperty } from "../property-data";

/**
 * ARV confidence engine — ensemble estimate with a confidence interval.
 *
 * Members (each contributes a point estimate + weight):
 *   - RentCast AVM           (real automated valuation; strongest)
 *   - RentCast comp median   (recent sold comparables)
 *   - Property-data estValue (HCAD / Estated / Regrid market value)
 *   - Prior ARV              (existing AI/manual estimate; weakest)
 *
 * The point estimate is the weighted mean of available members; the confidence
 * interval is seeded from the RentCast price range and widened by inter-source
 * dispersion. Confidence (0..1) rises with member count + comp count and falls
 * with disagreement.
 *
 * RentCast is on a 50/month free tier: a persistent monthly counter
 * (wos:rentcast:month:{YYYYMM}) hard-stops at 48 and the full ensemble result is
 * cached for 24h (wos:arv:{hash}) so repeat loads never re-bill the quota.
 */

export const ARV_MODEL_VERSION = "arv-ensemble-v1";
export const RENTCAST_MONTHLY_HARD_STOP = 48; // leave headroom under the 50/mo free tier
const CACHE_TTL_SECONDS = 24 * 60 * 60;

/** Pure quota check: may we still call RentCast this month? Exported for testing. */
export function canCallRentcast(usedThisMonth: number): boolean {
  return usedThisMonth < RENTCAST_MONTHLY_HARD_STOP;
}

export interface ArvSource {
  source: string;
  value: number;
  weight: number;
}

export interface ArvEstimate {
  kind: "ARV";
  point: number;
  ciLow: number;
  ciHigh: number;
  confidence: number; // 0..1
  compCount: number;
  sources: ArvSource[];
}

export interface ArvMember {
  source: string;
  value: number;
  weight: number;
}

export interface ArvEnsembleInput {
  members: ArvMember[];
  compCount: number;
  /** Hard CI bounds from a real AVM range, if available. */
  rangeLow?: number;
  rangeHigh?: number;
}

const round = (n: number) => Math.round(n);
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/**
 * Pure ensemble math — no I/O. Combines member estimates into a point + CI +
 * confidence. Exported for direct testing.
 */
export function computeArvEnsemble(input: ArvEnsembleInput): ArvEstimate {
  const members = input.members.filter((m) => Number.isFinite(m.value) && m.value > 0 && m.weight > 0);
  if (members.length === 0) {
    return { kind: "ARV", point: 0, ciLow: 0, ciHigh: 0, confidence: 0, compCount: input.compCount, sources: [] };
  }

  const totalWeight = members.reduce((s, m) => s + m.weight, 0);
  const point = members.reduce((s, m) => s + m.value * m.weight, 0) / totalWeight;

  // Weighted dispersion → coefficient of variation around the point estimate.
  const variance = members.reduce((s, m) => s + m.weight * (m.value - point) ** 2, 0) / totalWeight;
  const stdev = Math.sqrt(variance);
  const cov = point > 0 ? stdev / point : 1; // 0 = perfect agreement

  // CI: start from ±(dispersion + base), widen to cover any real AVM range.
  const baseHalfWidthPct = 0.05; // floor uncertainty even with perfect agreement
  const halfWidthPct = baseHalfWidthPct + cov;
  let ciLow = point * (1 - halfWidthPct);
  let ciHigh = point * (1 + halfWidthPct);
  if (input.rangeLow !== undefined && input.rangeLow > 0) ciLow = Math.min(ciLow, input.rangeLow);
  if (input.rangeHigh !== undefined && input.rangeHigh > 0) ciHigh = Math.max(ciHigh, input.rangeHigh);

  // Confidence: member coverage + comp depth, penalized by disagreement.
  const memberScore = Math.min(1, members.length / 3); // 3+ members = full
  const compScore = Math.min(1, input.compCount / 5); // 5+ comps = full
  const agreementScore = clamp01(1 - cov / 0.25); // 25% CoV = zero agreement credit
  const confidence = clamp01(0.45 * memberScore + 0.25 * compScore + 0.3 * agreementScore);

  return {
    kind: "ARV",
    point: round(point),
    ciLow: round(Math.max(0, ciLow)),
    ciHigh: round(ciHigh),
    confidence: Math.round(confidence * 100) / 100,
    compCount: input.compCount,
    sources: members.map((m) => ({ source: m.source, value: round(m.value), weight: m.weight })),
  };
}

function monthKey(): string {
  const d = new Date();
  return `wos:rentcast:month:${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * RentCast behind a persistent monthly quota guard. Returns null (and skips the
 * call) once the month's hard stop is reached, protecting the free tier.
 */
export async function guardedRentcast(
  address: string,
): Promise<Awaited<ReturnType<typeof getRentcastValue>>> {
  if (!isRentcastConfigured() || !address.trim()) return null;
  if (redis) {
    try {
      const key = monthKey();
      const used = Number((await redis.get<number>(key)) ?? 0);
      if (!canCallRentcast(used)) {
        console.warn(`[RentCast] monthly hard stop reached (${used}/${RENTCAST_MONTHLY_HARD_STOP}) — skipping ${address}`);
        return null;
      }
      const next = await redis.incr(key);
      if (next === 1) await redis.expire(key, 35 * 24 * 60 * 60);
    } catch {
      /* if the guard store is unavailable, fail closed: do not risk the quota */
      return null;
    }
  }
  return getRentcastValue(address);
}

function arvCacheKey(address: string, city: string | null, state: string | null): string {
  const norm = `${address}|${city ?? ""}|${state ?? ""}`.toLowerCase().replace(/\s+/g, " ").trim();
  let h = 0;
  for (let i = 0; i < norm.length; i++) h = (Math.imul(31, h) + norm.charCodeAt(i)) | 0;
  return `wos:arv:${(h >>> 0).toString(36)}`;
}

export interface EstimateArvParams {
  address: string;
  city: string | null;
  state: string | null;
  priorArv?: number | null;
}

/**
 * Full ensemble estimate for a real address. Fetches members (quota-guarded
 * RentCast + property-data), caches the result 24h. Falls back gracefully when
 * external sources are unconfigured or fail.
 */
export async function estimateArv(params: EstimateArvParams): Promise<ArvEstimate> {
  const cacheKey = arvCacheKey(params.address, params.city, params.state);
  if (redis) {
    try {
      const cached = await redis.get<ArvEstimate>(cacheKey);
      if (cached && cached.kind === "ARV") return cached;
    } catch {
      /* cache miss path */
    }
  }

  const members: ArvMember[] = [];
  let compCount = 0;
  let rangeLow: number | undefined;
  let rangeHigh: number | undefined;

  // Member 1+2: RentCast AVM + comp median
  try {
    const rc = await guardedRentcast(params.address);
    if (rc) {
      if (rc.avm && rc.avm > 0) {
        members.push({ source: "rentcast-avm", value: rc.avm, weight: 0.5 });
        rangeLow = rc.avmLow;
        rangeHigh = rc.avmHigh;
      }
      const prices = rc.comps.map((c) => c.price).filter((p): p is number => typeof p === "number" && p > 0);
      compCount = prices.length;
      if (prices.length > 0) {
        const sorted = [...prices].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
        members.push({ source: "rentcast-comps", value: median, weight: 0.2 });
      }
    }
  } catch {
    /* RentCast hiccup — continue with other members */
  }

  // Member 3: property-data market value (HCAD / Estated / Regrid)
  try {
    const verified = await verifyProperty(params.address, params.city ?? "", params.state ?? "");
    if (verified?.estValue && verified.estValue > 0) {
      members.push({ source: `property-${verified.provider}`, value: verified.estValue, weight: 0.2 });
    }
  } catch {
    /* property-data transient error — continue */
  }

  // Member 4: prior ARV (existing AI/manual estimate)
  if (params.priorArv && params.priorArv > 0) {
    members.push({ source: "prior-arv", value: params.priorArv, weight: 0.1 });
  }

  const estimate = computeArvEnsemble({ members, compCount, rangeLow, rangeHigh });

  if (redis && estimate.point > 0) {
    try {
      await redis.set(cacheKey, JSON.stringify(estimate), { ex: CACHE_TTL_SECONDS });
    } catch {
      /* best-effort cache */
    }
  }

  return estimate;
}
