import "server-only";
import type { DealType } from "@prisma/client";

/** A raw lead emitted by a source adapter, before verification. */
export interface RawLead {
  address: string;
  city: string;
  state: string;
  zip?: string;
  ownerName?: string;
  estValue?: number;
  source: string;                 // adapter id
  confidence: number;             // 0-100 (how sure the source is it's a lead)
  motivationIndicators: string[]; // human-readable signals
  dealType?: DealType;
}

export interface LeadSourceContext {
  city: string;
  state: string;
  limit?: number;
}

/** Every lead source implements this. Output flows through the verification pipeline. */
export interface LeadSourceAdapter {
  id: string;
  label: string;
  /** Free + real, or best-effort web search? */
  kind: "county" | "web";
  fetch(ctx: LeadSourceContext): Promise<RawLead[]>;
}
