import "server-only";
import { prisma } from "@/lib/prisma";
import { isDbReady, CURRENT_USER_ID } from "@/lib/data/db";
import { getAnalytics } from "@/lib/data/analytics";
import { listDeals } from "@/lib/data/deals";
import { countFollowUpsDue } from "@/lib/data/follow-ups";
import { listOpenSurface } from "@/lib/surfacing/engine";
import { aiGenerate, isAIConfigured } from "@/lib/ai/gateway";
import type { Prisma } from "@prisma/client";

/**
 * Executive briefing. Every number is computed deterministically from the data;
 * the AI only narrates it. The owner reads this instead of monitoring dashboards.
 */

export type BriefingKind = "daily" | "weekly";

export interface BriefingMetrics {
  activeDeals: number;
  hotLeads: number;
  contractsInFlight: number;
  pipelineValue: number;
  revenueTotal: number;
  overdueFollowUps: number;
  decisions: number;
  risks: number;
  opportunities: number;
}

export interface Briefing {
  kind: BriefingKind;
  headline: string;
  metrics: BriefingMetrics;
  narrative: string;
  generatedAt: string;
}

const money = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

/** Deterministic headline from the metrics. Pure — testable. */
export function composeBriefing(kind: BriefingKind, metrics: BriefingMetrics, narrative: string): Briefing {
  const headline =
    `${metrics.activeDeals} active · ${metrics.contractsInFlight} contracts in flight · ` +
    `${money(metrics.pipelineValue)} pipeline · ${metrics.decisions} decisions · ${metrics.risks} risks`;
  return { kind, headline, metrics, narrative, generatedAt: new Date().toISOString() };
}

async function gatherMetrics(): Promise<BriefingMetrics> {
  const [analytics, deals, overdue, decisions, risks, opportunities] = await Promise.all([
    getAnalytics(),
    listDeals(),
    countFollowUpsDue(),
    listOpenSurface("DECISION"),
    listOpenSurface("RISK"),
    listOpenSurface("OPPORTUNITY"),
  ]);
  const active = deals.filter((d) => d.stage !== "DEAD");
  const hot = active.filter((d) => d.hot || (d.score ?? 0) >= 70);
  const contractsInFlight = deals.filter((d) => d.stage === "CONTRACT_SIGNED").length;
  return {
    activeDeals: active.length,
    hotLeads: hot.length,
    contractsInFlight,
    pipelineValue: analytics.revenue.pipeline,
    revenueTotal: analytics.revenue.total,
    overdueFollowUps: overdue,
    decisions: decisions.length,
    risks: risks.length,
    opportunities: opportunities.length,
  };
}

async function narrate(kind: BriefingKind, m: BriefingMetrics): Promise<string> {
  const fallback =
    `${m.decisions} decision${m.decisions === 1 ? "" : "s"} need you, ${m.risks} risk${m.risks === 1 ? "" : "s"} to watch, ` +
    `${m.opportunities} opportunit${m.opportunities === 1 ? "y" : "ies"}. Pipeline ${money(m.pipelineValue)}, ` +
    `${m.overdueFollowUps} follow-ups overdue.`;
  if (!isAIConfigured()) return fallback;
  try {
    const text = await aiGenerate({
      system: "You are a real-estate wholesaling chief of staff. Write a 2-sentence executive brief. Be concrete and direct. Use only the numbers given.",
      prompt: `Write the ${kind} brief from: active=${m.activeDeals}, hot=${m.hotLeads}, contracts in flight=${m.contractsInFlight}, pipeline=${money(m.pipelineValue)}, realized revenue=${money(m.revenueTotal)}, overdue follow-ups=${m.overdueFollowUps}, decisions=${m.decisions}, risks=${m.risks}, opportunities=${m.opportunities}.`,
      maxTokens: 160,
      temperature: 0.5,
    });
    return text.trim() || fallback;
  } catch {
    return fallback;
  }
}

/** Generate, persist, and emit a briefing. */
export async function generateBriefing(kind: BriefingKind): Promise<Briefing> {
  const metrics = await gatherMetrics();
  const narrative = await narrate(kind, metrics);
  const briefing = composeBriefing(kind, metrics, narrative);

  if (await isDbReady()) {
    try {
      await prisma.briefingLog.create({
        data: { orgId: CURRENT_USER_ID, kind, payload: briefing as unknown as Prisma.InputJsonValue },
      });
    } catch {
      /* best-effort persist */
    }
  }
  try {
    const { inngest } = await import("@/inngest/client");
    await inngest.send({ name: kind === "weekly" ? "briefing.weekly.sent" : "briefing.daily.sent", data: { orgId: CURRENT_USER_ID } });
  } catch {
    /* event best-effort */
  }
  return briefing;
}

/** Latest persisted briefing of a kind (or any kind). */
export async function getLatestBriefing(kind?: BriefingKind): Promise<Briefing | null> {
  if (!(await isDbReady())) return null;
  const row = await prisma.briefingLog.findFirst({
    where: { orgId: CURRENT_USER_ID, ...(kind ? { kind } : {}) },
    orderBy: { sentAt: "desc" },
  });
  return row ? (row.payload as unknown as Briefing) : null;
}
