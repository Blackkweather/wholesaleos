import "server-only";
import { prisma } from "@/lib/prisma";
import { isDbReady, CURRENT_USER_ID, ensureUser } from "./db";
import { demoDealStore } from "../demo-store";
import { MAO_ARV_MULTIPLIER, STAGE_TIMESTAMP, type StageKey } from "@/constants/config";
import type { DealView, ScoredDeal, NewDealInput, DealContext } from "@/types";
import type { Deal, Stage, Prisma } from "@prisma/client";

/** Best-effort event emission to the Inngest bus (never blocks DB work). */
async function emitDealEvent(name: "lead.created" | "deal.contracted" | "deal.closed", dealId: string): Promise<void> {
  try {
    const { inngest } = await import("@/inngest/client");
    await inngest.send({ name, data: { dealId } });
  } catch {
    /* event bus best-effort */
  }
}

/** Map a stored deal to the lightweight context AI generators expect. */
export function dealViewToContext(d: DealView): DealContext {
  return {
    address: d.address,
    city: d.city ?? undefined,
    state: d.state ?? undefined,
    situation: d.situation ?? undefined,
    dealType: d.dealType,
    ownerName: d.ownerName ?? undefined,
    arv: d.arv ?? undefined,
    listPrice: d.listPrice ?? undefined,
    offerPrice: d.offerPrice ?? undefined,
    repairCost: d.repairCost ?? undefined,
    assignmentFee: d.assignmentFee ?? undefined,
    profit: d.profit ?? undefined,
  };
}

function serialize(d: Deal): DealView {
  return {
    id: d.id,
    address: d.address,
    city: d.city,
    state: d.state,
    zipCode: d.zipCode,
    situation: d.situation,
    dealType: d.dealType,
    stage: d.stage,
    score: d.score,
    motivationScore: d.motivationScore,
    arv: d.arv,
    listPrice: d.listPrice,
    offerPrice: d.offerPrice,
    repairCost: d.repairCost,
    assignmentFee: d.assignmentFee,
    profit: d.profit,
    expectedProfit: d.expectedProfit,
    actualProfit: d.actualProfit,
    verdict: d.verdict,
    ownerName: d.ownerName,
    ownerPhone: d.ownerPhone,
    ownerEmail: d.ownerEmail,
    source: d.source,
    sourceUrl: d.sourceUrl,
    aiSummary: d.aiSummary,
    tags: d.tags,
    notes: d.notes,
    hot: d.hot,
    optedOut: d.optedOut,
    autoActBlocked: d.autoActBlocked,
    nextFollowUpAt: d.nextFollowUpAt ? d.nextFollowUpAt.toISOString() : null,
    dateContacted: d.dateContacted ? d.dateContacted.toISOString() : null,
    firstResponseDate: d.firstResponseDate ? d.firstResponseDate.toISOString() : null,
    appointmentDate: d.appointmentDate ? d.appointmentDate.toISOString() : null,
    offerDate: d.offerDate ? d.offerDate.toISOString() : null,
    contractDate: d.contractDate ? d.contractDate.toISOString() : null,
    assignmentDate: d.assignmentDate ? d.assignmentDate.toISOString() : null,
    closingDate: d.closingDate ? d.closingDate.toISOString() : null,
    deadDate: d.deadDate ? d.deadDate.toISOString() : null,
    followUpStep: d.followUpStep,
    lastContactAt: d.lastContactAt ? d.lastContactAt.toISOString() : null,
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
  };
}

function scoredToCreate(s: ScoredDeal): Prisma.DealCreateInput {
  return {
    user: { connect: { id: CURRENT_USER_ID } },
    address: s.address,
    city: s.city ?? "",
    state: s.state ?? null,
    zipCode: s.zipCode ?? null,
    situation: s.situation ?? null,
    dealType: s.dealType,
    score: s.score ?? null,
    motivationScore: s.motivationScore ?? null,
    arv: s.arv ?? null,
    listPrice: s.listPrice ?? null,
    offerPrice: s.offerPrice ?? null,
    repairCost: s.repairCost ?? null,
    assignmentFee: s.assignmentFee ?? null,
    profit: s.profit ?? null,
    verdict: s.verdict ?? null,
    ownerName: s.ownerName ?? null,
    ownerPhone: s.ownerPhone ?? null,
    ownerEmail: s.ownerEmail ?? null,
    source: s.source ?? null,
    sourceUrl: s.sourceUrl ?? null,
    aiSummary: s.aiSummary ?? null,
    tags: s.tags ?? [],
  };
}

export async function listDeals(): Promise<DealView[]> {
  if (await isDbReady()) {
    const rows = await prisma.deal.findMany({
      where: { userId: CURRENT_USER_ID },
      orderBy: { createdAt: "desc" },
    });
    return rows.map(serialize);
  }
  return demoDealStore.list();
}

export async function getDeal(id: string): Promise<DealView | null> {
  if (await isDbReady()) {
    const d = await prisma.deal.findFirst({
      where: { id, userId: CURRENT_USER_ID },
    });
    return d ? serialize(d) : null;
  }
  return demoDealStore.get(id);
}

export async function createDealsFromScored(
  items: ScoredDeal[],
): Promise<DealView[]> {
  if (items.length === 0) return [];
  if (await isDbReady()) {
    await ensureUser();

    // Dedup: skip addresses already in the DB (case-insensitive)
    const existing = await prisma.deal.findMany({
      where: { userId: CURRENT_USER_ID },
      select: { address: true },
    });
    const existingAddrs = new Set(existing.map((d) => d.address.toLowerCase().trim()));
    const fresh = items.filter(
      (s) => !existingAddrs.has(s.address.toLowerCase().trim()),
    );

    if (fresh.length === 0) return [];

    const created = await prisma.$transaction(
      fresh.map((s) => prisma.deal.create({ data: scoredToCreate(s) })),
    );
    const views = created.map(serialize);
    for (const v of views) void emitDealEvent("lead.created", v.id);
    return views;
  }
  return demoDealStore.createMany(items);
}

export async function createManualDeal(input: NewDealInput): Promise<DealView> {
  if (await isDbReady()) {
    await ensureUser();
    const offerPrice =
      input.offerPrice ??
      (input.arv !== undefined
        ? Math.max(
            0,
            Math.round(input.arv * MAO_ARV_MULTIPLIER - (input.repairCost ?? 0)),
          )
        : null);
    const d = await prisma.deal.create({
      data: {
        user: { connect: { id: CURRENT_USER_ID } },
        address: input.address,
        city: input.city ?? "",
        state: input.state ?? null,
        situation: input.situation ?? "Manually added.",
        dealType: input.dealType ?? "OTHER",
        score: 70,
        arv: input.arv ?? null,
        repairCost: input.repairCost ?? null,
        offerPrice,
        ownerName: input.ownerName ?? null,
        ownerPhone: input.ownerPhone ?? null,
        ownerEmail: input.ownerEmail ?? null,
        notes: input.notes ?? null,
        source: "manual",
      },
    });
    return serialize(d);
  }
  return demoDealStore.createManual(input);
}

export interface DealPatch {
  stage?: Stage;
  notes?: string;
  hot?: boolean;
  autoActBlocked?: boolean;
  nextFollowUpAt?: string | null;
  ownerName?: string;
  ownerPhone?: string;
  ownerEmail?: string;
  arv?: number;
  repairCost?: number;
  offerPrice?: number;
  assignmentFee?: number;
  expectedProfit?: number;
  actualProfit?: number;
}

export async function updateDeal(
  id: string,
  patch: DealPatch,
): Promise<DealView | null> {
  if (await isDbReady()) {
    try {
      // Auto-stamp the lifecycle timestamp the first time a deal enters a stage.
      const tsPatch: Record<string, Date> = {};
      if (patch.stage) {
        const existing = await prisma.deal.findUnique({ where: { id } });
        const field = STAGE_TIMESTAMP[patch.stage as StageKey];
        if (field && existing && !(existing as Record<string, unknown>)[field]) {
          tsPatch[field] = new Date();
        }
        if (patch.stage === "CONTACTED") {
          tsPatch.lastContactAt = new Date();
          // Kick off the follow-up cadence (first follow-up due in 3 days)
          if (patch.nextFollowUpAt === undefined) {
            tsPatch.nextFollowUpAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
          }
        }
      }
      const d = await prisma.deal.update({
        where: { id },
        data: {
          ...patch,
          nextFollowUpAt:
            patch.nextFollowUpAt === undefined
              ? undefined
              : patch.nextFollowUpAt
                ? new Date(patch.nextFollowUpAt)
                : null,
          ...tsPatch,
        },
      });
      // Reactive automation: fire lifecycle events on the gated transitions.
      if (patch.stage === "CONTRACT_SIGNED") void emitDealEvent("deal.contracted", id);
      else if (patch.stage === "CLOSED") void emitDealEvent("deal.closed", id);
      return serialize(d);
    } catch {
      return null;
    }
  }
  return demoDealStore.update(id, patch as Partial<DealView>);
}

export async function deleteDeal(id: string): Promise<boolean> {
  if (await isDbReady()) {
    try {
      await prisma.deal.delete({ where: { id } });
      return true;
    } catch {
      return false;
    }
  }
  return demoDealStore.remove(id);
}

export async function dealStageCounts(): Promise<Record<string, number>> {
  const list = await listDeals();
  return list.reduce<Record<string, number>>((acc, d) => {
    acc[d.stage] = (acc[d.stage] ?? 0) + 1;
    return acc;
  }, {});
}
