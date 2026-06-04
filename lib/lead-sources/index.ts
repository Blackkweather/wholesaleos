import "server-only";
import { verifyProperty } from "@/lib/property-data";
import { createDealsFromScored } from "@/lib/data/deals";
import { hcadPortfolioAdapter, hcadAbsenteeAdapter } from "./hcad";
import { taxDelinquentAdapter, probateAdapter, codeViolationAdapter, vacantAdapter } from "./tavily";
import type { LeadSourceAdapter, LeadSourceContext } from "./types";
import type { ScoredDeal } from "@/types";

export const ADAPTERS: LeadSourceAdapter[] = [
  hcadPortfolioAdapter,
  hcadAbsenteeAdapter,
  taxDelinquentAdapter,
  probateAdapter,
  codeViolationAdapter,
  vacantAdapter,
];

export function listAdapters() {
  return ADAPTERS.map((a) => ({ id: a.id, label: a.label, kind: a.kind }));
}

export interface RunResult {
  source: string;
  found: number;     // raw leads emitted
  verified: number;  // survived address verification
  saved: number;     // new (after dedup)
}

/**
 * Run one source adapter → verify every lead through Census/HCAD (the truth
 * filter) → enrich owner + mailing + absentee → save as deals (deduped).
 */
export async function runLeadSource(id: string, ctx: LeadSourceContext): Promise<RunResult> {
  const adapter = ADAPTERS.find((a) => a.id === id);
  if (!adapter) throw new Error(`Unknown lead source: ${id}`);

  const raw = await adapter.fetch(ctx);
  const scored: ScoredDeal[] = [];

  for (const lead of raw) {
    let owner = lead.ownerName;
    let value = lead.estValue;
    let zip = lead.zip;
    const tags = [...lead.motivationIndicators, "verified", lead.source];

    try {
      const v = await verifyProperty(lead.address, lead.city, lead.state);
      if (v === null) continue; // address not real → drop
      owner = v.ownerName ?? owner;
      value = v.estValue ?? value;
      zip = v.zip ?? zip;
      if (v.normalizedAddress) lead.address = v.normalizedAddress;
      if (v.absentee) tags.push("absentee-owner");
      if (v.mailAddress) tags.push(`mail: ${v.mailAddress}`);
    } catch {
      if (adapter.kind !== "county") continue; // web leads must verify; county is already real
    }
    if (lead.dealType === "ABSENTEE" && !tags.includes("absentee-owner")) tags.push("absentee-owner");

    scored.push({
      address: lead.address,
      city: lead.city,
      state: lead.state,
      zipCode: zip,
      situation: lead.motivationIndicators.join("; "),
      dealType: lead.dealType ?? "OTHER",
      source: lead.source,
      ownerName: owner,
      arv: value,
      score: lead.confidence,
      tags: Array.from(new Set(tags)),
    });
  }

  const saved = await createDealsFromScored(scored);
  return { source: id, found: raw.length, verified: scored.length, saved: saved.length };
}
