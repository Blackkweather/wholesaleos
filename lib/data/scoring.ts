import "server-only";
import { listDeals } from "./deals";
import type { DealView } from "@/types";

/**
 * Phase 3 — Hybrid Lead Scoring.
 *   LeadScore = 40% property signals + 30% historical conversion + 30% profitability
 * Degrades gracefully: with no closed-deal history, the historical component is
 * neutral and the score leans on property signals + projected profit.
 */

export interface ScoreComponents {
  propertySignals: number;       // 0-100
  historicalConversion: number;  // 0-100
  profitability: number;         // 0-100
}

export interface HybridScore {
  score: number;
  verdict: "GO" | "CAUTION" | "PASS";
  components: ScoreComponents;
  reasons: string[];
}

const HIGH_MOTIVATION_TYPES = new Set([
  "FORECLOSURE", "PROBATE", "TAX_DELINQUENT", "VACANT", "INHERITED", "DIVORCE", "CODE_VIOLATION", "ABSENTEE",
]);

const MOTIVATION_KEYWORDS = [
  "must sell", "as-is", "as is", "motivated", "needs work", "fixer", "vacant",
  "distress", "urgent", "cash only", "quick sale", "relocat", "moving", "estate",
  "inherit", "foreclos", "behind", "tired landlord", "probate", "divorce",
];

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
const money = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

// ---------------------------------------------------------------------------
// Historical performance (learned from outcomes)
// ---------------------------------------------------------------------------

export interface TypeStats {
  type: string;
  deals: number;
  closed: number;
  closeRate: number;
}

export interface HistoricalStats {
  overallCloseRate: number;
  byType: Map<string, TypeStats>;
  hasHistory: boolean;
}

const reachedClosed = (d: DealView) => Boolean(d.closingDate) || d.stage === "CLOSED";

export async function getHistoricalStats(): Promise<HistoricalStats> {
  const deals = await listDeals();
  const byType = new Map<string, TypeStats>();
  let totalClosed = 0;

  for (const d of deals) {
    const key = d.dealType ?? "OTHER";
    const t = byType.get(key) ?? { type: key, deals: 0, closed: 0, closeRate: 0 };
    t.deals++;
    if (reachedClosed(d)) { t.closed++; totalClosed++; }
    byType.set(key, t);
  }
  Array.from(byType.values()).forEach((t) => { t.closeRate = t.deals ? t.closed / t.deals : 0; });

  return {
    overallCloseRate: deals.length ? totalClosed / deals.length : 0,
    byType,
    hasHistory: totalClosed > 0,
  };
}

// ---------------------------------------------------------------------------
// The hybrid score
// ---------------------------------------------------------------------------

export function computeHybridScore(d: DealView, hist: HistoricalStats): HybridScore {
  const reasons: string[] = [];
  const tags = d.tags ?? [];
  const text = `${d.situation ?? ""} ${tags.join(" ")}`.toLowerCase();

  // ---- Part A: Property signals (0-100) ----
  let property = 25; // base
  if (tags.includes("absentee-owner")) {
    property += 30;
    reasons.push("Absentee owner — lives elsewhere (high motivation)");
  }
  if (d.dealType && HIGH_MOTIVATION_TYPES.has(d.dealType)) {
    property += 22;
    reasons.push(`${d.dealType.replace("_", " ").toLowerCase()} situation`);
  }
  if (MOTIVATION_KEYWORDS.some((k) => text.includes(k))) {
    property += 15;
    reasons.push("Listing language signals motivation");
  }
  if (tags.includes("verified")) property += 8; // real, confirmed
  property = clamp(property);

  // ---- Part B: Historical conversion (0-100) ----
  let historical: number;
  if (!hist.hasHistory) {
    historical = 50; // neutral until real outcomes exist
    reasons.push("No closed-deal history yet — leaning on property + profit");
  } else {
    const t = d.dealType ? hist.byType.get(d.dealType) : undefined;
    const typeRate = t?.closeRate ?? hist.overallCloseRate;
    const mult = hist.overallCloseRate > 0 ? typeRate / hist.overallCloseRate : 1;
    historical = clamp(50 * mult);
    if (mult >= 1.15) reasons.push(`Similar ${d.dealType} leads close ${mult.toFixed(1)}x the average`);
    else if (mult <= 0.85) reasons.push(`${d.dealType} leads underperform (${mult.toFixed(1)}x average)`);
  }

  // ---- Part C: Profitability (0-100) ----
  const spread = d.expectedProfit ?? d.profit ?? 0;
  const profitability = clamp((spread / 25000) * 100); // $25k+ spread = full marks
  if (spread > 0) reasons.push(`Projected spread ${money(spread)}`);

  // ---- Weighted blend ----
  const score = clamp(0.4 * property + 0.3 * historical + 0.3 * profitability);
  const verdict: HybridScore["verdict"] = score >= 70 ? "GO" : score >= 45 ? "CAUTION" : "PASS";

  return {
    score,
    verdict,
    components: { propertySignals: property, historicalConversion: historical, profitability },
    reasons,
  };
}

/** Convenience: score a single deal with fresh historical stats. */
export async function scoreDealHybrid(deal: DealView): Promise<HybridScore> {
  const hist = await getHistoricalStats();
  return computeHybridScore(deal, hist);
}
