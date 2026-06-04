import "server-only";
import { listDeals } from "./deals";
import { STAGE_ORDER, type StageKey } from "@/constants/config";
import type { DealView } from "@/types";

// ---------------------------------------------------------------------------
// Funnel — how far each lead progressed (timestamp first, stage-order fallback)
// ---------------------------------------------------------------------------

const ord = (d: DealView) => STAGE_ORDER[d.stage as StageKey] ?? 0;

const reachedContacted = (d: DealView) => Boolean(d.dateContacted) || ord(d) >= 2;
const reachedResponded = (d: DealView) => Boolean(d.firstResponseDate) || ord(d) >= 3;
const reachedInterested = (d: DealView) => ord(d) >= 4 && d.stage !== "DEAD";
const reachedOffer = (d: DealView) => Boolean(d.offerDate) || ord(d) >= 6;
const reachedContract = (d: DealView) => Boolean(d.contractDate) || ord(d) >= 8;
const reachedAssigned = (d: DealView) => Boolean(d.assignmentDate) || ord(d) >= 9;
const reachedClosed = (d: DealView) => Boolean(d.closingDate) || d.stage === "CLOSED";

export interface Funnel {
  found: number;
  verified: number;
  contacted: number;
  responded: number;
  interested: number;
  offerSent: number;
  contractSigned: number;
  assigned: number;
  closed: number;
  dead: number;
}

export interface ConversionRates {
  leadToResponse: number;     // responded / contacted
  responseToContract: number; // contracts / responded
  contractToClose: number;    // closed / contracts
  overallCloseRate: number;   // closed / total
}

export interface SourceStat {
  source: string;
  deals: number;
  contacted: number;
  responded: number;
  closed: number;
  revenue: number;
  closeRate: number;          // closed / deals
}

export interface ZipStat {
  zip: string;
  deals: number;
  closed: number;
  revenue: number;
}

export interface Analytics {
  totals: {
    leads: number;
    contacted: number;
    responses: number;
    contractsSigned: number;
    assigned: number;
    closed: number;
    deadLeads: number;
  };
  funnel: Funnel;
  rates: ConversionRates;
  revenue: {
    total: number;          // realized (closed deals)
    pipeline: number;       // expected profit of live deals
    avgAssignmentFee: number;
    bySource: SourceStat[];
    byZip: ZipStat[];
  };
}

/** Realized revenue for a deal — actual profit, else assignment fee at close. */
function realizedRevenue(d: DealView): number {
  if (!reachedClosed(d)) return 0;
  return d.actualProfit ?? d.assignmentFee ?? d.profit ?? 0;
}

function rate(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 1000) / 10; // one-decimal %
}

export async function getAnalytics(): Promise<Analytics> {
  const deals = await listDeals();
  const live = deals.filter((d) => d.stage !== "DEAD");

  const contacted = deals.filter(reachedContacted);
  const responded = deals.filter(reachedResponded);
  const interested = deals.filter(reachedInterested);
  const offers = deals.filter(reachedOffer);
  const contracts = deals.filter(reachedContract);
  const assigned = deals.filter(reachedAssigned);
  const closed = deals.filter(reachedClosed);
  const dead = deals.filter((d) => d.stage === "DEAD");

  const funnel: Funnel = {
    found: deals.length,
    verified: deals.filter((d) => ord(d) >= 1 && d.stage !== "DEAD").length,
    contacted: contacted.length,
    responded: responded.length,
    interested: interested.length,
    offerSent: offers.length,
    contractSigned: contracts.length,
    assigned: assigned.length,
    closed: closed.length,
    dead: dead.length,
  };

  const rates: ConversionRates = {
    leadToResponse: rate(responded.length, contacted.length),
    responseToContract: rate(contracts.length, responded.length),
    contractToClose: rate(closed.length, contracts.length),
    overallCloseRate: rate(closed.length, deals.length),
  };

  // Revenue by source
  const sourceMap = new Map<string, SourceStat>();
  for (const d of deals) {
    const key = d.source || "unknown";
    const s = sourceMap.get(key) ?? { source: key, deals: 0, contacted: 0, responded: 0, closed: 0, revenue: 0, closeRate: 0 };
    s.deals++;
    if (reachedContacted(d)) s.contacted++;
    if (reachedResponded(d)) s.responded++;
    if (reachedClosed(d)) { s.closed++; s.revenue += realizedRevenue(d); }
    sourceMap.set(key, s);
  }
  const bySource = Array.from(sourceMap.values())
    .map((s) => ({ ...s, closeRate: rate(s.closed, s.deals) }))
    .sort((a, b) => b.revenue - a.revenue || b.deals - a.deals);

  // Revenue by ZIP
  const zipMap = new Map<string, ZipStat>();
  for (const d of deals) {
    const key = d.zipCode || "—";
    const z = zipMap.get(key) ?? { zip: key, deals: 0, closed: 0, revenue: 0 };
    z.deals++;
    if (reachedClosed(d)) { z.closed++; z.revenue += realizedRevenue(d); }
    zipMap.set(key, z);
  }
  const byZip = Array.from(zipMap.values()).sort((a, b) => b.revenue - a.revenue || b.deals - a.deals);

  const closedWithFee = closed.filter((d) => (d.actualProfit ?? d.assignmentFee) != null);
  const avgAssignmentFee = closedWithFee.length
    ? Math.round(closedWithFee.reduce((s, d) => s + (d.actualProfit ?? d.assignmentFee ?? 0), 0) / closedWithFee.length)
    : 0;

  return {
    totals: {
      leads: deals.length,
      contacted: contacted.length,
      responses: responded.length,
      contractsSigned: contracts.length,
      assigned: assigned.length,
      closed: closed.length,
      deadLeads: dead.length,
    },
    funnel,
    rates,
    revenue: {
      total: deals.reduce((s, d) => s + realizedRevenue(d), 0),
      pipeline: live.reduce((s, d) => s + (d.expectedProfit ?? d.profit ?? 0), 0),
      avgAssignmentFee,
      bySource,
      byZip,
    },
  };
}
