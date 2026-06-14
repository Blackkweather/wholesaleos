import "server-only";
import { checkAndIncr } from "./reliability/budget";
import { withBreaker } from "./reliability/breaker";

/**
 * RentCast — real AVM (market value estimate) + recent SOLD comps for any US
 * address. This is what makes ARV trustworthy (vs. lagging county values).
 *
 * FREE TIER: 50 calls/month. Every call is logged. Cache prevents duplicate
 * calls for the same address within the same process lifetime (~1hr on Vercel).
 * NEVER call this from a cron or batch process — only from manual user lookups.
 *
 * Get a key at rentcast.io/api → set RENTCAST_API_KEY env var.
 * Graceful: returns null when unconfigured so nothing breaks without a key.
 */

const KEY = process.env.RENTCAST_API_KEY;

// ---------------------------------------------------------------------------
// In-process cache: prevents duplicate API hits for the same address within
// the same serverless instance lifetime (~15-60 min on Vercel). Not persisted
// across cold starts, but eliminates accidental double-calls in one session.
// ---------------------------------------------------------------------------
interface CacheEntry { value: RentcastValue | null; ts: number }
const CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours
const _cache = new Map<string, CacheEntry>();

let _callsThisProcess = 0; // rough usage counter for this process lifetime

function cacheKey(address: string): string {
  return address.toLowerCase().replace(/\s+/g, " ").trim();
}

export function isRentcastConfigured(): boolean {
  return Boolean(KEY && KEY.trim());
}

export interface RentcastComp {
  address?: string;
  price?: number;
  sqft?: number;
  beds?: number;
  baths?: number;
  distanceMi?: number;
}

export interface RentcastValue {
  avm?: number;        // estimated market value
  avmLow?: number;
  avmHigh?: number;
  comps: RentcastComp[];
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

/** AVM + sold comparables for an address. Null if unconfigured or no hit. */
export async function getRentcastValue(address: string): Promise<RentcastValue | null> {
  if (!isRentcastConfigured() || !address.trim()) return null;

  // Check in-process cache first (saves API quota)
  const ck = cacheKey(address);
  const cached = _cache.get(ck);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    console.log(`[RentCast] cache hit: ${ck}`);
    return cached.value;
  }

  // Phase 2 reliability: DATA killswitch + daily budget. Block → skip the call.
  try {
    await checkAndIncr("DATA", 1, "rentcast");
  } catch {
    _cache.set(ck, { value: null, ts: Date.now() });
    return null;
  }

  _callsThisProcess++;
  console.log(`[RentCast] API call #${_callsThisProcess} this process: ${address} (free tier: 50/mo)`);

  try {
    // Circuit breaker around the live call; a non-OK status counts as a failure.
    const result = await withBreaker<RentcastValue>("rentcast", async () => {
      const url = `https://api.rentcast.io/v1/avm/value?address=${encodeURIComponent(address)}`;
      const res = await fetch(url, {
        headers: { "X-Api-Key": KEY as string, Accept: "application/json" },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) throw new Error(`RentCast ${res.status}`);
      const j = (await res.json()) as Record<string, unknown>;

      const rawComps = Array.isArray(j.comparables) ? (j.comparables as Record<string, unknown>[]) : [];
      const comps: RentcastComp[] = rawComps.slice(0, 6).map((c) => ({
        address: typeof c.formattedAddress === "string" ? c.formattedAddress
          : typeof c.address === "string" ? c.address : undefined,
        price: num(c.price) ?? num(c.lastSalePrice),
        sqft: num(c.squareFootage),
        beds: num(c.bedrooms),
        baths: num(c.bathrooms),
        distanceMi: num(c.distance),
      }));

      return {
        avm: num(j.price),
        avmLow: num(j.priceRangeLow),
        avmHigh: num(j.priceRangeHigh),
        comps,
      };
    });
    _cache.set(ck, { value: result, ts: Date.now() });
    return result;
  } catch {
    _cache.set(ck, { value: null, ts: Date.now() });
    return null;
  }
}
