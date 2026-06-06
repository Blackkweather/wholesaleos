import "server-only";
import type { LeadSourceAdapter, RawLead } from "./types";

const HCAD = "https://www.gis.hctx.net/arcgis/rest/services/HCAD/Parcels/MapServer/0/query";

interface HcadFields {
  owner_name_1?: string;
  site_str_num?: number;
  site_str_pfx?: string;
  site_str_name?: string;
  site_str_sfx?: string;
  site_city?: string;
  site_zip?: string;
  mail_city?: string;
  mail_state?: string;
  total_market_val?: number;
}

function siteAddress(f: HcadFields): string {
  return [f.site_str_num, f.site_str_pfx, f.site_str_name, f.site_str_sfx]
    .filter((p) => p != null && String(p).trim() !== "")
    .join(" ")
    .trim();
}

async function hcadQuery(params: Record<string, string>): Promise<Array<{ attributes: HcadFields }>> {
  const qs = new URLSearchParams({ f: "json", returnGeometry: "false", ...params });
  const res = await fetch(`${HCAD}?${qs}`, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`HCAD ${res.status}`);
  const json = (await res.json()) as { features?: Array<{ attributes: HcadFields }> };
  return json.features ?? [];
}

const OUT_FIELDS = "owner_name_1,site_str_num,site_str_pfx,site_str_name,site_str_sfx,site_city,site_zip,mail_city,mail_state,total_market_val";

// ---------------------------------------------------------------------------
// Portfolio landlords — owners of 5–25 residential Houston parcels, out of area.
// The wholesale sweet spot: real people / small LLCs who may be tired of tenants.
// ---------------------------------------------------------------------------

export const hcadPortfolioAdapter: LeadSourceAdapter = {
  id: "hcad-portfolio",
  label: "Portfolio landlords (5+ properties)",
  kind: "county",
  async fetch({ limit = 8 }) {
    // 1) Group out-of-state owners of residential parcels by parcel count
    const groups = await hcadQuery({
      where: "mail_state<>'TX' AND mail_state<>'' AND owner_name_1<>'' AND state_class LIKE 'A%'",
      groupByFieldsForStatistics: "owner_name_1",
      outStatistics: JSON.stringify([{ statisticType: "count", onStatisticField: "acct_num", outStatisticFieldName: "cnt" }]),
      orderByFields: "cnt DESC",
      resultRecordCount: "400",
    }) as unknown as Array<{ attributes: { owner_name_1?: string; cnt?: number } }>;

    // Sweet spot: 5–25 parcels (skip mega-institutions)
    const owners = groups
      .filter((g) => (g.attributes.cnt ?? 0) >= 5 && (g.attributes.cnt ?? 0) <= 25 && g.attributes.owner_name_1)
      .slice(0, limit);

    const leads: RawLead[] = [];
    for (const o of owners) {
      const name = o.attributes.owner_name_1!;
      const count = o.attributes.cnt ?? 0;
      // 2) Pull one representative parcel for this owner to use as the lead
      const parcels = await hcadQuery({
        where: `owner_name_1='${name.replace(/'/g, "''")}' AND state_class LIKE 'A%'`,
        outFields: OUT_FIELDS,
        resultRecordCount: "1",
      });
      const f = parcels[0]?.attributes;
      if (!f) continue;
      const addr = siteAddress(f);
      if (!addr) continue;
      leads.push({
        address: addr,
        city: f.site_city || "Houston",
        state: "TX",
        zip: f.site_zip,
        ownerName: name,
        estValue: f.total_market_val,
        source: "hcad-portfolio",
        confidence: 85,
        motivationIndicators: [`Owns ${count} Houston properties`, `Out-of-state landlord (${f.mail_city}, ${f.mail_state})`, "Possible tired landlord"],
        dealType: "ABSENTEE",
      });
    }
    return leads;
  },
};

// ---------------------------------------------------------------------------
// Long-term absentee — out-of-state owners of single residential parcels.
// ---------------------------------------------------------------------------

export const hcadAbsenteeAdapter: LeadSourceAdapter = {
  id: "hcad-absentee",
  label: "Long-term absentee owners",
  kind: "county",
  async fetch({ limit = 10 }) {
    const rows = await hcadQuery({
      where: "mail_state<>'TX' AND mail_state<>'' AND owner_name_1<>'' AND state_class LIKE 'A%'",
      outFields: OUT_FIELDS,
      orderByFields: "total_market_val DESC",
      resultRecordCount: String(Math.min(limit * 3, 60)),
    });
    const leads: RawLead[] = [];
    for (const r of rows) {
      const f = r.attributes;
      const addr = siteAddress(f);
      if (!addr || !f.owner_name_1) continue;
      leads.push({
        address: addr,
        city: f.site_city || "Houston",
        state: "TX",
        zip: f.site_zip,
        ownerName: f.owner_name_1,
        estValue: f.total_market_val,
        source: "hcad-absentee",
        confidence: 75,
        motivationIndicators: [`Out-of-state owner (${f.mail_city}, ${f.mail_state})`, "Absentee — not living in the property"],
        dealType: "ABSENTEE",
      });
      if (leads.length >= limit) break;
    }
    return leads;
  },
};

// ---------------------------------------------------------------------------
// Estate / heir-owned — owner of record is a deceased person's estate or heirs.
// The strongest free probate signal: it's written right into the county owner
// name. Heirs typically want a fast, as-is sale. Excludes "REAL ESTATE" firms
// and companies, and caps at a wholesale-appropriate value.
// ---------------------------------------------------------------------------

export const hcadEstateAdapter: LeadSourceAdapter = {
  id: "hcad-estate",
  label: "Estate / heir-owned (probate)",
  kind: "county",
  async fetch({ limit = 10 }) {
    const rows = await hcadQuery({
      where:
        "(owner_name_1 LIKE '%ESTATE OF%' OR owner_name_1 LIKE '%HEIRS%') " +
        "AND owner_name_1 NOT LIKE '%REAL ESTATE%' AND owner_name_1 NOT LIKE '%LLC%' " +
        "AND owner_name_1 NOT LIKE '%LTD%' AND owner_name_1 NOT LIKE '%INC%' " +
        "AND state_class LIKE 'A%' AND total_market_val > 60000 AND total_market_val < 400000",
      outFields: OUT_FIELDS,
      orderByFields: "total_market_val DESC",
      resultRecordCount: String(Math.min(limit * 3, 60)),
    });
    const leads: RawLead[] = [];
    for (const r of rows) {
      const f = r.attributes;
      const addr = siteAddress(f);
      if (!addr || !f.owner_name_1) continue;
      const isHeir = /HEIRS/i.test(f.owner_name_1);
      leads.push({
        address: addr,
        city: f.site_city || "Houston",
        state: "TX",
        zip: f.site_zip,
        ownerName: f.owner_name_1,
        estValue: f.total_market_val,
        source: "hcad-estate",
        confidence: 88,
        motivationIndicators: [
          isHeir ? "Heir-owned (inherited)" : "Estate-owned (probate)",
          "Owner of record is deceased — heirs often sell fast & as-is",
        ],
        dealType: isHeir ? "INHERITED" : "PROBATE",
      });
      if (leads.length >= limit) break;
    }
    return leads;
  },
};
