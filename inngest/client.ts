import { EventSchemas, Inngest } from "inngest";
import { env } from "@/lib/env";

/**
 * Inngest client — event bus + durable workers. Serverless; no local process.
 * `eventKey`/`signingKey` are read from env in production and may be absent in
 * local dev (the Inngest Dev Server handles auth locally).
 */

type Events = {
  "app/ping": { data: { source?: string } };
  "system.budget.warn": { data: { category: string; spentCents: number; capCents: number } };
  "system.budget.halt": { data: { category: string; spentCents: number; capCents: number } };
  "system.deadletter": { data: { id: string; event: string } };
  "seller.replied": { data: { dealId: string; contact: string; body: string } };
  "compliance.blocked": { data: { channel: string; contact: string; reason: string } };
  "consent.revoked": { data: { contact: string; channel: string; method: string } };
  "lead.created": { data: { dealId: string } };
  "lead.qualified": { data: { dealId: string; score: number } };
  "deal.contracted": { data: { dealId: string } };
  "deal.closed": { data: { dealId: string } };
  "followup.start": { data: { dealId: string } };
  "followup.due": { data: { dealId: string } };
  "surface.audit.sampled": { data: { count: number; orgId: string } };
  "surface.resolved": { data: { id: string; resolution: string } };
  "briefing.daily.sent": { data: { orgId: string } };
  "briefing.weekly.sent": { data: { orgId: string } };
};

export const inngest = new Inngest({
  id: "wholesaleos",
  schemas: new EventSchemas().fromRecord<Events>(),
  eventKey: env.INNGEST_EVENT_KEY,
});
