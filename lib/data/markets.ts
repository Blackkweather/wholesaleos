import "server-only";
import { prisma } from "@/lib/prisma";
import { CURRENT_USER_ID, ensureUser } from "./db";
import type { DealType } from "@prisma/client";

export async function getMarkets() {
  return prisma.market.findMany({
    where: { userId: CURRENT_USER_ID },
    orderBy: { createdAt: "asc" },
  });
}

export async function getActiveMarket() {
  return prisma.market.findFirst({
    where: { userId: CURRENT_USER_ID, active: true },
    orderBy: { createdAt: "asc" },
  });
}

export async function hasAnyMarket(): Promise<boolean> {
  const count = await prisma.market.count({ where: { userId: CURRENT_USER_ID } });
  return count > 0;
}

export async function createMarket(data: {
  city: string;
  state: string;
  maxPrice?: number;
  minPrice?: number;
  dealTypes?: DealType[];
}) {
  await ensureUser();
  return prisma.market.create({
    data: {
      userId: CURRENT_USER_ID,
      city: data.city,
      state: data.state ?? "",
      minPrice: data.minPrice ?? null,
      maxPrice: data.maxPrice ?? null,
      dealTypes: data.dealTypes ?? [],
      active: true,
    },
  });
}

export async function updateMarket(
  id: string,
  data: Partial<{
    city: string;
    state: string;
    maxPrice: number;
    minPrice: number;
    dealTypes: DealType[];
    active: boolean;
  }>,
) {
  return prisma.market.update({ where: { id }, data });
}
