import type {
  DealView,
  ScoredDeal,
  NewDealInput,
  BuyerView,
  NewBuyerInput,
  ScoredBuyer,
} from "@/types";
import type { DealType, Stage } from "@prisma/client";
import { verdictFromScore } from "./mock";
import { MAO_ARV_MULTIPLIER } from "@/constants/config";

/**
 * In-memory single-user store used when no database is reachable. Persists for
 * the life of the dev server process. Seeded with a believable pipeline so the
 * app never looks empty before the user connects Supabase.
 */
function uid(): string {
  return `d_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-3)}`;
}

function scoredToView(
  s: ScoredDeal,
  stage: Stage = "FOUND",
  ageDays = 0,
): DealView {
  const created = new Date(Date.now() - ageDays * 86_400_000);
  return {
    id: uid(),
    address: s.address,
    city: s.city ?? null,
    state: s.state ?? null,
    zipCode: s.zipCode ?? null,
    situation: s.situation ?? null,
    dealType: s.dealType,
    stage,
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
    notes: null,
    hot: false,
    optedOut: false,
    nextFollowUpAt: null,
    expectedProfit: null,
    actualProfit: null,
    dateContacted: null,
    firstResponseDate: null,
    appointmentDate: null,
    offerDate: null,
    contractDate: null,
    assignmentDate: null,
    closingDate: null,
    deadDate: null,
    followUpStep: 0,
    lastContactAt: null,
    createdAt: created.toISOString(),
    updatedAt: created.toISOString(),
  };
}

const deals: DealView[] = [];

function all(): DealView[] {
  return deals;
}

export const demoDealStore = {
  list(): DealView[] {
    return [...all()].sort(
      (a, b) => +new Date(b.createdAt) - +new Date(a.createdAt),
    );
  },
  get(id: string): DealView | null {
    return all().find((d) => d.id === id) ?? null;
  },
  createMany(items: ScoredDeal[]): DealView[] {
    const created = items.map((s) => scoredToView(s, "FOUND", 0));
    all().unshift(...created);
    return created;
  },
  createManual(input: NewDealInput): DealView {
    const arv = input.arv;
    const offerPrice =
      input.offerPrice ??
      (arv !== undefined
        ? Math.max(0, Math.round(arv * MAO_ARV_MULTIPLIER - (input.repairCost ?? 0)))
        : undefined);
    const view = scoredToView(
      {
        address: input.address,
        city: input.city ?? "",
        state: input.state,
        situation: input.situation ?? "Manually added.",
        dealType: (input.dealType ?? "OTHER") as DealType,
        source: "manual",
        score: 70,
        arv,
        repairCost: input.repairCost,
        offerPrice,
        ownerName: input.ownerName,
        ownerPhone: input.ownerPhone,
        ownerEmail: input.ownerEmail,
        verdict: verdictFromScore(70),
      },
      "FOUND",
      0,
    );
    view.notes = input.notes ?? null;
    all().unshift(view);
    return view;
  },
  update(id: string, patch: Partial<DealView>): DealView | null {
    const deal = all().find((d) => d.id === id);
    if (!deal) return null;
    Object.assign(deal, patch, { updatedAt: new Date().toISOString() });
    return deal;
  },
  remove(id: string): boolean {
    const list = all();
    const idx = list.findIndex((d) => d.id === id);
    if (idx === -1) return false;
    list.splice(idx, 1);
    return true;
  },
};

let buyers: BuyerView[] | null = null;

function buyerFromScored(s: ScoredBuyer): BuyerView {
  return {
    id: uid(),
    name: s.name,
    email: s.email ?? null,
    phone: s.phone ?? null,
    company: s.company ?? null,
    website: s.website ?? null,
    buyerType: s.buyerType ?? null,
    cities: s.cities ?? [],
    minPrice: s.minPrice ?? null,
    maxPrice: s.maxPrice ?? null,
    dealTypes: [],
    tags: s.evidence ? [s.evidence] : [],
    createdAt: new Date().toISOString(),
  };
}

function allBuyers(): BuyerView[] {
  if (buyers === null) buyers = [];
  return buyers;
}

export const demoBuyerStore = {
  list(): BuyerView[] {
    return [...allBuyers()].sort(
      (a, b) => +new Date(b.createdAt) - +new Date(a.createdAt),
    );
  },
  create(input: NewBuyerInput): BuyerView {
    const buyer: BuyerView = {
      id: uid(),
      name: input.name,
      email: input.email ?? null,
      phone: input.phone ?? null,
      company: input.company ?? null,
      website: input.website ?? null,
      buyerType: input.buyerType ?? null,
      cities: input.cities ?? [],
      minPrice: input.minPrice ?? null,
      maxPrice: input.maxPrice ?? null,
      dealTypes: [],
      tags: input.tags ?? [],
      createdAt: new Date().toISOString(),
    };
    allBuyers().unshift(buyer);
    return buyer;
  },
  createMany(items: ScoredBuyer[]): BuyerView[] {
    const created = items.map(buyerFromScored);
    allBuyers().unshift(...created);
    return created;
  },
  remove(id: string): boolean {
    const list = allBuyers();
    const idx = list.findIndex((b) => b.id === id);
    if (idx === -1) return false;
    list.splice(idx, 1);
    return true;
  },
};
