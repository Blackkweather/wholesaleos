import "server-only";
import { env } from "@/lib/env";
import type { OwnerRecord } from "@/types";

const HCAD_URL = "https://www.gis.hctx.net/arcgis/rest/services/HCAD/Parcels/MapServer/0/query";

const DIRS = new Set(["N", "S", "E", "W", "NE", "NW", "SE", "SW", "NORTH", "SOUTH", "EAST", "WEST"]);
const STREET_SUFFIX = new Set([
  "ST", "STREET", "AVE", "AVENUE", "RD", "ROAD", "LN", "LANE", "DR", "DRIVE",
  "BLVD", "BOULEVARD", "CT", "COURT", "CIR", "CIRCLE", "TRL", "TRAIL", "WAY",
  "PL", "PLACE", "HWY", "FWY", "PKWY", "TER", "TERRACE", "CV", "COVE", "LOOP",
]);

function parseStreet(normalized: string): { num?: string; name?: string } {
  const tokens = normalized.trim().toUpperCase().split(/\s+/);
  if (tokens.length < 2) return {};
  const house = tokens[0];
  if (!/^\d+$/.test(house)) return {};
  let rest = tokens.slice(1);
  if (rest.length > 1 && DIRS.has(rest[0])) rest = rest.slice(1);
  if (rest.length > 1 && STREET_SUFFIX.has(rest[rest.length - 1])) rest = rest.slice(0, -1);
  if (rest.length > 1 && DIRS.has(rest[rest.length - 1])) rest = rest.slice(0, -1);
  return { num: house, name: rest.join(" ") };
}

interface HcadOwnerResult {
  currentOwner: string;
  estValue?: number;
  deedDate?: string;
}

async function hcadCurrentOwner(address: string): Promise<HcadOwnerResult | null> {
  const { num: houseNum, name } = parseStreet(address);
  if (!houseNum || !name) return null;
  const where = `site_str_num=${houseNum} AND site_str_name='${name.replace(/'/g, "''")}'`;
  const params = new URLSearchParams({
    where,
    outFields: "owner_name_1,total_market_val,deed_date",
    returnGeometry: "false",
    f: "json",
  });
  const res = await fetch(`${HCAD_URL}?${params}`, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) return null;
  const json = (await res.json()) as { features?: Array<{ attributes?: Record<string, unknown> }> };
  const a = json.features?.[0]?.attributes;
  if (!a || typeof a.owner_name_1 !== "string") return null;
  return {
    currentOwner: a.owner_name_1.trim(),
    estValue: typeof a.total_market_val === "number" ? a.total_market_val : undefined,
    deedDate: typeof a.deed_date === "string" ? a.deed_date : undefined,
  };
}

async function estatedDeedHistory(
  address: string, city: string, state: string, zip?: string,
): Promise<OwnerRecord[]> {
  const key = env.ESTATED_API_KEY?.trim();
  if (!key) return [];
  const params = new URLSearchParams({ token: key, street_address: address, city, state });
  if (zip) params.set("zip_code", zip);
  const res = await fetch(`https://apis.estated.com/v4/property?${params}`, { signal: AbortSignal.timeout(12000) });
  if (!res.ok) return [];
  const json = (await res.json()) as { data?: Record<string, unknown> | null };
  const d = json.data;
  if (!d) return [];

  const records: OwnerRecord[] = [];

  const owner = d.owner as Record<string, unknown> | undefined;
  if (owner?.name && typeof owner.name === "string") {
    records.push({ name: owner.name });
  }

  const deeds = d.deeds as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(deeds)) {
    for (const deed of deeds) {
      const buyer = typeof deed.buyer_name === "string" ? deed.buyer_name : undefined;
      const seller = typeof deed.seller_name === "string" ? deed.seller_name : undefined;
      const date = typeof deed.recording_date === "string" ? deed.recording_date : undefined;
      const type = typeof deed.deed_type === "string" ? deed.deed_type : undefined;
      const price = typeof deed.sale_price === "number" ? deed.sale_price : undefined;

      if (seller) {
        records.push({ name: seller, dateTo: date, deedType: type, salePrice: price });
      }
      if (buyer && !records.some((r) => r.name === buyer)) {
        records.push({ name: buyer, dateFrom: date, deedType: type, salePrice: price });
      }
    }
  }

  const unique = new Map<string, OwnerRecord>();
  for (const r of records) {
    const key = r.name.toUpperCase().trim();
    if (!unique.has(key)) unique.set(key, r);
    else {
      const existing = unique.get(key)!;
      if (r.dateFrom && !existing.dateFrom) existing.dateFrom = r.dateFrom;
      if (r.dateTo && !existing.dateTo) existing.dateTo = r.dateTo;
      if (r.salePrice && !existing.salePrice) existing.salePrice = r.salePrice;
      if (r.deedType && !existing.deedType) existing.deedType = r.deedType;
    }
  }

  return Array.from(unique.values());
}

export interface OwnershipResult {
  ownerCount: number;
  owners: OwnerRecord[];
  provider: "estated" | "hcad" | "manual";
}

export async function lookupOwnership(
  address: string, city: string, state: string, zip?: string,
): Promise<OwnershipResult> {
  // Estated has full deed history — try it first
  try {
    const deeds = await estatedDeedHistory(address, city, state, zip);
    if (deeds.length > 0) {
      return { ownerCount: deeds.length, owners: deeds, provider: "estated" };
    }
  } catch { /* fall through */ }

  // HCAD for Harris County — current owner only
  const isTexas = state.toUpperCase().startsWith("TX") || state.toUpperCase() === "TEXAS";
  if (isTexas) {
    try {
      const hcad = await hcadCurrentOwner(address);
      if (hcad) {
        return {
          ownerCount: 1,
          owners: [{ name: hcad.currentOwner, dateFrom: hcad.deedDate }],
          provider: "hcad",
        };
      }
    } catch { /* fall through */ }
  }

  return { ownerCount: 0, owners: [], provider: "manual" };
}
