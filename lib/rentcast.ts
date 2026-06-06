import "server-only";

/**
 * RentCast — real AVM (market value estimate) + recent SOLD comps for any US
 * address. This is what makes ARV trustworthy (vs. lagging county values).
 * Free tier: ~50 calls/mo. Get a key at rentcast.io/api → set RENTCAST_API_KEY.
 * Graceful: returns null when unconfigured, so nothing breaks without a key.
 */

const KEY = process.env.RENTCAST_API_KEY;

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
  try {
    const url = `https://api.rentcast.io/v1/avm/value?address=${encodeURIComponent(address)}`;
    const res = await fetch(url, {
      headers: { "X-Api-Key": KEY as string, Accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
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
  } catch {
    return null;
  }
}
