import "server-only";
import { prisma } from "@/lib/prisma";
import { isDbReady } from "./db";
import { groqGenerate, isGroqConfigured } from "@/lib/groq";
import type { SellerProfile } from "@/types";
import type { Prisma } from "@prisma/client";

export interface SellerIntelligence {
  hasData: boolean;
  motivationLevel?: "Low" | "Medium" | "High";
  timeline?: string;
  propertyCondition?: string;
  priceExpectation?: string;
  objections?: string[];
  distressSignals?: string[];      // financial issues, inheritance, landlord fatigue, etc.
  summary?: string;
  touchpoints?: number;
}

/**
 * Reads a deal's call transcripts + SMS + notes and uses AI to extract a
 * structured seller profile. Returns hasData:false when there's no conversation yet.
 */
export async function getSellerIntelligence(dealId: string): Promise<SellerIntelligence> {
  if (!(await isDbReady())) return { hasData: false };

  const [activities, sms] = await Promise.all([
    prisma.activity.findMany({ where: { dealId }, orderBy: { createdAt: "asc" } }),
    prisma.sMS.findMany({ where: { dealId }, orderBy: { createdAt: "asc" } }),
  ]);

  // Gather any real conversation content
  const lines: string[] = [];
  for (const a of activities) {
    const meta = a.meta as { transcript?: string } | null;
    if (meta?.transcript) lines.push(`CALL TRANSCRIPT:\n${meta.transcript}`);
    else if (a.type === "SMS_RECEIVED" || a.type === "NOTE") lines.push(a.content);
  }
  for (const m of sms) {
    lines.push(`${m.direction === "INBOUND" ? "Seller" : "Us"}: ${m.message}`);
  }

  const sellerSpoke = sms.some((m) => m.direction === "INBOUND")
    || activities.some((a) => (a.meta as { transcript?: string } | null)?.transcript);

  const touchpoints = sms.length + activities.filter((a) => a.type !== "NOTE").length;

  if (!sellerSpoke || !isGroqConfigured()) {
    return { hasData: false, touchpoints };
  }

  const convo = lines.join("\n").slice(0, 4000);
  const prompt = `You are a real estate acquisitions analyst. From the seller communication below, extract a structured profile. Reply STRICT JSON only.

${convo}

Return: {"motivationLevel":"Low|Medium|High","timeline":"short phrase","propertyCondition":"short phrase","priceExpectation":"short phrase or unknown","objections":["..."],"distressSignals":["financial issues, inheritance, divorce, landlord fatigue, vacancy, foreclosure, etc."],"summary":"2 sentence read on this seller"}
Only use what's stated; use "unknown" where unclear.`;

  try {
    const raw = await groqGenerate({ prompt, maxTokens: 500, temperature: 0.2 });
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return { hasData: false, touchpoints };
    const p = JSON.parse(m[0]) as Partial<SellerIntelligence>;

    // Auto-sync intel into the seller profile (best-effort, merge only empty fields)
    syncIntelToProfile(dealId, p).catch(() => {});

    return {
      hasData: true,
      motivationLevel: p.motivationLevel,
      timeline: p.timeline,
      propertyCondition: p.propertyCondition,
      priceExpectation: p.priceExpectation,
      objections: Array.isArray(p.objections) ? p.objections : [],
      distressSignals: Array.isArray(p.distressSignals) ? p.distressSignals : [],
      summary: p.summary,
      touchpoints,
    };
  } catch {
    return { hasData: false, touchpoints };
  }
}

async function syncIntelToProfile(dealId: string, intel: Partial<SellerIntelligence>): Promise<void> {
  if (!(await isDbReady())) return;
  const deal = await prisma.deal.findUnique({ where: { id: dealId }, select: { sellerProfile: true } });
  const existing = (deal?.sellerProfile as SellerProfile | null) ?? {};
  const updates: Partial<SellerProfile> = {};
  if (intel.motivationLevel && !existing.motivationLevel) updates.motivationLevel = intel.motivationLevel as SellerProfile["motivationLevel"];
  if (intel.timeline && !existing.timeline) updates.timeline = intel.timeline;
  if (intel.propertyCondition && !existing.propertyCondition) updates.propertyCondition = intel.propertyCondition;
  if (intel.distressSignals?.length && !existing.painPoints?.length) updates.painPoints = intel.distressSignals;
  if (Object.keys(updates).length === 0) return;
  const merged = { ...existing, ...updates, lastUpdated: new Date().toISOString() };
  await prisma.deal.update({ where: { id: dealId }, data: { sellerProfile: merged as unknown as Prisma.InputJsonValue } });
}
