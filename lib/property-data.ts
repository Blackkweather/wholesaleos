import "server-only";
import { env, features } from "./env";

/**
 * Property-data verification — the TRUTH FILTER + real owner enrichment.
 *
 * Pipeline (calibrated against live APIs):
 *  1. US Census Geocoder (FREE) — arbiter: is the address real? Normalizes it,
 *     returns canonical street + ZIP. Hallucinated addresses fail → dropped.
 *  2. HCAD (Harris County Appraisal District, FREE ArcGIS) — for Houston/TX,
 *     the authoritative source: real owner name, market value, and the owner's
 *     MAILING address (→ absentee-owner detection + legal direct-mail target).
 *  3. Regrid / Estated (paid, optional) — enrichment fallback outside Harris Co.
 */

export interface VerifiedProperty {
  ownerName?: string;
  estValue?: number;
  normalizedAddress?: string;
  zip?: string;
  mailAddress?: string;   // owner's mailing address (HCAD) — direct-mail target
  absentee?: boolean;     // owner's mail city ≠ property city → motivated lead
  matchedAddress?: string;
  provider: "estated" | "regrid" | "census" | "hcad";
}

export function isPropertyApiConfigured(): boolean {
  return features.propertyApi;
}

function num(v: unknown): number | undefined {
  const n = typeof v === "string" ? parseFloat(v.replace(/[^0-9.]/g, "")) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function addressesMatch(a: string, b: string): boolean {
  const SUFFIX = /\b(st|street|ave|avenue|rd|road|ln|lane|dr|drive|blvd|boulevard|ct|court|cir|circle|trl|trail|way|pl|place|hwy|fwy|pkwy|ter)\b/g;
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(SUFFIX, " ").replace(/\s+/g, " ").trim();
  const na = norm(a), nb = norm(b);
  const numA = na.match(/^\d+/)?.[0];
  const numB = nb.match(/^\d+/)?.[0];
  if (!numA || numA !== numB) return false;
  const wordsA = new Set(na.split(" ").slice(1).filter((w) => w.length > 2));
  return nb.split(" ").slice(1).some((w) => w.length > 2 && wordsA.has(w));
}

const DIRS = new Set(["N", "S", "E", "W", "NE", "NW", "SE", "SW", "NORTH", "SOUTH", "EAST", "WEST"]);
const STREET_SUFFIX = new Set([
  "ST", "STREET", "AVE", "AVENUE", "RD", "ROAD", "LN", "LANE", "DR", "DRIVE", "BLVD", "BOULEVARD",
  "CT", "COURT", "CIR", "CIRCLE", "TRL", "TRAIL", "WAY", "PL", "PLACE", "HWY", "FWY", "PKWY",
  "TER", "TERRACE", "CV", "COVE", "LOOP", "PASS", "PATH", "RUN", "BND", "BEND", "XING", "CROSSING",
]);

/** Parse a normalized street line into HCAD's house-number + core street name. */
function parseStreet(normalized: string): { num?: string; name?: string } {
  const tokens = normalized.trim().toUpperCase().split(/\s+/);
  if (tokens.length < 2) return {};
  const house = tokens[0];
  if (!/^\d+$/.test(house)) return {};
  let rest = tokens.slice(1);
  if (rest.length > 1 && DIRS.has(rest[0])) rest = rest.slice(1);            // drop leading dir
  if (rest.length > 1 && STREET_SUFFIX.has(rest[rest.length - 1])) rest = rest.slice(0, -1); // drop suffix
  if (rest.length > 1 && DIRS.has(rest[rest.length - 1])) rest = rest.slice(0, -1);          // drop trailing dir
  return { num: house, name: rest.join(" ") };
}

// ---------------------------------------------------------------------------
// US Census Geocoder — free arbiter
// ---------------------------------------------------------------------------

interface CensusHit { normalizedAddress: string; zip?: string }

async function censusGeocode(address: string, city: string, state: string): Promise<CensusHit | null> {
  const params = new URLSearchParams({ address: `${address}, ${city}, ${state}`.trim(), benchmark: "Public_AR_Current", format: "json" });
  const res = await fetch(`https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?${params}`, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`Census ${res.status}`);
  const json = (await res.json()) as { result?: { addressMatches?: Array<{ matchedAddress?: string }> } };
  const m = json.result?.addressMatches?.[0];
  if (!m?.matchedAddress) return null;
  const parts = m.matchedAddress.split(",").map((s) => s.trim());
  return { normalizedAddress: parts[0] ?? address, zip: parts.find((p) => /^\d{5}$/.test(p)) };
}

// ---------------------------------------------------------------------------
// HCAD — free, authoritative Harris County owner + value
// ---------------------------------------------------------------------------

const HCAD_URL = "https://www.gis.hctx.net/arcgis/rest/services/HCAD/Parcels/MapServer/0/query";

async function hcadLookup(houseNum: string, streetName: string): Promise<Partial<VerifiedProperty> | null> {
  const where = `site_str_num=${houseNum} AND site_str_name='${streetName.replace(/'/g, "''")}'`;
  const params = new URLSearchParams({
    where,
    outFields: "owner_name_1,total_market_val,land_value,mail_addr_1,mail_city,mail_state,mail_zip,site_city",
    returnGeometry: "false",
    f: "json",
  });
  const res = await fetch(`${HCAD_URL}?${params}`, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`HCAD ${res.status}`);
  const json = (await res.json()) as { features?: Array<{ attributes?: Record<string, unknown> }> };
  const a = json.features?.[0]?.attributes;
  if (!a || typeof a.owner_name_1 !== "string" || !a.owner_name_1.trim()) return null;

  const mailCity = String(a.mail_city ?? "").toUpperCase().trim();
  const siteCity = String(a.site_city ?? "HOUSTON").toUpperCase().trim();
  const mailState = String(a.mail_state ?? "").toUpperCase().trim();
  const absentee = Boolean(mailCity) && mailCity !== siteCity;

  return {
    provider: "hcad",
    ownerName: a.owner_name_1.trim(),
    estValue: num(a.total_market_val) ?? num(a.land_value),
    mailAddress: [a.mail_addr_1, a.mail_city, mailState, a.mail_zip].map(String).filter((s) => s && s !== "null").join(", "),
    absentee,
  };
}

// ---------------------------------------------------------------------------
// Regrid / Estated — paid enrichment fallback (outside Harris County)
// ---------------------------------------------------------------------------

async function regridLookup(address: string, city: string, state: string): Promise<Partial<VerifiedProperty> | null> {
  const params = new URLSearchParams({ query: `${address}, ${city}, ${state}`, token: env.REGRID_API_KEY!, limit: "1" });
  const res = await fetch(`https://app.regrid.com/api/v2/parcels/address?${params}`, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`Regrid ${res.status}`);
  const json = (await res.json()) as { parcels?: { features?: Array<{ properties?: { fields?: Record<string, unknown> } }> } };
  const f = json.parcels?.features?.[0]?.properties?.fields;
  if (!f) return null;
  return {
    provider: "regrid",
    ownerName: typeof f.owner === "string" ? f.owner : undefined,
    estValue: num(f.parval) ?? num(f.landval),
    matchedAddress: typeof f.address === "string" ? f.address : undefined,
  };
}

async function estatedLookup(address: string, city: string, state: string, zip?: string): Promise<Partial<VerifiedProperty> | null> {
  const params = new URLSearchParams({ token: env.ESTATED_API_KEY!, street_address: address, city, state });
  if (zip) params.set("zip_code", zip);
  const res = await fetch(`https://apis.estated.com/v4/property?${params}`, { signal: AbortSignal.timeout(10000) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Estated ${res.status}`);
  const json = (await res.json()) as { data?: Record<string, unknown> | null };
  const d = json.data;
  if (!d) return null;
  const owner = d.owner as Record<string, unknown> | undefined;
  const valuation = d.valuation as Record<string, unknown> | undefined;
  const addr = d.address as Record<string, unknown> | undefined;
  return {
    provider: "estated",
    ownerName: typeof owner?.name === "string" ? owner.name : undefined,
    estValue: num(valuation?.value),
    matchedAddress: typeof addr?.formatted_street_address === "string" ? addr.formatted_street_address : undefined,
  };
}

/**
 * Verify + enrich an address.
 * @returns property record, or `null` if the address isn't real (drop it).
 *          Throws on transient errors so the caller can keep the lead unverified.
 */
export async function verifyProperty(
  address: string, city: string, state: string,
): Promise<VerifiedProperty | null> {
  if (!address || !city) return null;

  // 1) Arbiter — real address?
  const hit = await censusGeocode(address, city, state);
  if (hit === null) return null; // hallucination → drop

  const base: VerifiedProperty = { provider: "census", normalizedAddress: hit.normalizedAddress, zip: hit.zip };
  const enrichAddr = hit.normalizedAddress || address;

  // 2) HCAD — free authoritative owner+value for Harris County (Houston market)
  const isTexas = state.toUpperCase().startsWith("TX") || state.toUpperCase() === "TEXAS";
  if (isTexas) {
    try {
      const { num: houseNum, name } = parseStreet(enrichAddr);
      if (houseNum && name) {
        const h = await hcadLookup(houseNum, name);
        if (h?.ownerName) return { ...base, ...h, provider: "hcad" };
      }
    } catch { /* HCAD hiccup → try paid fallback or census-only */ }
  }

  // 3) Paid fallback (guarded by address match)
  try {
    const e = env.ESTATED_API_KEY
      ? await estatedLookup(enrichAddr, city, state, hit.zip)
      : env.REGRID_API_KEY
        ? await regridLookup(enrichAddr, city, state)
        : null;
    if (e?.ownerName && e.matchedAddress && addressesMatch(enrichAddr, e.matchedAddress)) {
      return { ...base, ...e };
    }
  } catch { /* fall through */ }

  return base; // real address confirmed; owner unchanged
}
