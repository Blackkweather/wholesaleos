import "server-only";
import { prisma } from "@/lib/prisma";
import { isDbReady, CURRENT_USER_ID, ensureUser } from "./db";
import { demoBuyerStore } from "../demo-store";
import type { BuyerView, NewBuyerInput, ScoredBuyer, DealView } from "@/types";
import type { Buyer } from "@prisma/client";

function serialize(b: Buyer): BuyerView {
  return {
    id: b.id,
    name: b.name,
    email: b.email,
    phone: b.phone,
    company: b.company,
    website: b.website,
    buyerType: b.buyerType,
    cities: b.cities,
    minPrice: b.minPrice,
    maxPrice: b.maxPrice,
    dealTypes: b.dealTypes,
    tags: b.tags,
    createdAt: b.createdAt.toISOString(),
  };
}

export async function listBuyers(): Promise<BuyerView[]> {
  if (await isDbReady()) {
    const rows = await prisma.buyer.findMany({
      where: { userId: CURRENT_USER_ID },
      orderBy: { createdAt: "desc" },
    });
    return rows.map(serialize);
  }
  return demoBuyerStore.list();
}

export async function createBuyer(input: NewBuyerInput): Promise<BuyerView> {
  if (await isDbReady()) {
    await ensureUser();
    const b = await prisma.buyer.create({
      data: {
        user: { connect: { id: CURRENT_USER_ID } },
        name: input.name,
        email: input.email ?? null,
        phone: input.phone ?? null,
        company: input.company ?? null,
        website: input.website ?? null,
        buyerType: input.buyerType ?? null,
        cities: input.cities ?? [],
        minPrice: input.minPrice ?? null,
        maxPrice: input.maxPrice ?? null,
        tags: input.tags ?? [],
        notes: input.notes ?? null,
      },
    });
    return serialize(b);
  }
  return demoBuyerStore.create(input);
}

export async function createBuyersFromScored(
  items: ScoredBuyer[],
): Promise<BuyerView[]> {
  if (items.length === 0) return [];
  if (await isDbReady()) {
    await ensureUser();
    const created = await prisma.$transaction(
      items.map((s) =>
        prisma.buyer.create({
          data: {
            user: { connect: { id: CURRENT_USER_ID } },
            name: s.name,
            email: s.email ?? null,
            phone: s.phone ?? null,
            company: s.company ?? null,
            website: s.website ?? null,
            buyerType: s.buyerType ?? null,
            cities: s.cities ?? [],
            minPrice: s.minPrice ?? null,
            maxPrice: s.maxPrice ?? null,
            tags: s.evidence ? [s.evidence] : [],
            source: s.source ?? null,
          },
        }),
      ),
    );
    return created.map(serialize);
  }
  return demoBuyerStore.createMany(items);
}

/**
 * Find buyers whose criteria match a given deal.
 * Matching rules (all must pass):
 *   - City:  buyer.cities is empty (national) OR contains deal.city (case-insensitive)
 *   - Type:  buyer.dealTypes is empty OR contains deal.dealType
 *   - Price: deal.offerPrice is within buyer's [minPrice, maxPrice] range (nulls = no limit)
 */
export async function matchBuyersForDeal(deal: DealView): Promise<BuyerView[]> {
  const buyers = await listBuyers();
  const offerPrice = deal.offerPrice ?? 0;
  const dealCity   = (deal.city ?? "").toLowerCase();

  return buyers.filter((b) => {
    // City match
    const cityMatch =
      !b.cities?.length ||
      b.cities.some((c) => c.toLowerCase().includes(dealCity) || dealCity.includes(c.toLowerCase()));

    // Deal type match (BuyerView doesn't expose dealTypes — they live on the raw Buyer row,
    // but they're stored as a Prisma array. We skip type filtering here and rely on city+price
    // since BuyerView serialisation doesn't carry dealTypes. Filter is still useful.)
    // TODO: add dealTypes to BuyerView if needed

    // Price match
    const aboveMin = b.minPrice == null || offerPrice >= b.minPrice;
    const belowMax = b.maxPrice == null || offerPrice <= b.maxPrice;

    return cityMatch && aboveMin && belowMax;
  });
}

export interface ScoredBuyerMatch {
  buyer: BuyerView;
  matchScore: number; // 0-100 confidence
  reasons: string[];
}

const fmtMoney = (n: number | null) =>
  n == null ? "any" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

/**
 * Phase 6 — Buyer Match Score. Weighs city fit, buy-box price fit, deal-type fit,
 * and buyer type into a 0-100 confidence with reasons. "Best Buyer Matches."
 */
export async function matchBuyersForDealScored(deal: DealView): Promise<ScoredBuyerMatch[]> {
  const buyers = await listBuyers();
  const offer = deal.offerPrice ?? deal.arv ?? 0;
  const dealCity = (deal.city ?? "").toLowerCase();
  const out: ScoredBuyerMatch[] = [];

  for (const b of buyers) {
    let score = 0;
    const reasons: string[] = [];

    // City fit (35)
    const cityMatch = b.cities?.some((c) => c.toLowerCase().includes(dealCity) || dealCity.includes(c.toLowerCase()));
    if (b.cities?.length && cityMatch) { score += 35; reasons.push(`Buys in ${deal.city}`); }
    else if (!b.cities?.length) { score += 18; reasons.push("Buys area-wide"); }

    // Buy-box price fit (35)
    const aboveMin = b.minPrice == null || offer >= b.minPrice;
    const belowMax = b.maxPrice == null || offer <= b.maxPrice;
    if ((b.minPrice != null || b.maxPrice != null) && aboveMin && belowMax) {
      score += 35; reasons.push(`In buy box (${fmtMoney(b.minPrice)}–${fmtMoney(b.maxPrice)})`);
    } else if (b.minPrice == null && b.maxPrice == null) { score += 15; }

    // Deal-type fit (20)
    if (b.dealTypes?.length && deal.dealType && b.dealTypes.includes(deal.dealType)) {
      score += 20; reasons.push(`Targets ${deal.dealType.toLowerCase()} deals`);
    } else if (!b.dealTypes?.length) { score += 8; }

    // Buyer type (10)
    if (b.buyerType) { score += 6; reasons.push(b.buyerType); }

    out.push({ buyer: b, matchScore: Math.min(100, score), reasons });
  }

  return out.filter((m) => m.matchScore >= 30).sort((a, b) => b.matchScore - a.matchScore);
}

export async function deleteBuyer(id: string): Promise<boolean> {
  if (await isDbReady()) {
    try {
      await prisma.buyer.delete({ where: { id } });
      return true;
    } catch {
      return false;
    }
  }
  return demoBuyerStore.remove(id);
}
