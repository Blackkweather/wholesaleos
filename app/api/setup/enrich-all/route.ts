import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isDbReady, getCurrentUserId } from "@/lib/data/db";
import { lookupOwnership } from "@/lib/data/ownership";
import { requireOwner } from "@/lib/admin-auth";
import { apiOk, apiError } from "@/types";
import type { PropertyPhoto, OwnerRecord } from "@/types";
import type { Prisma } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface NominatimResult { lat: string; lon: string }

async function geocode(address: string, city: string | null, state: string | null): Promise<{ lat: number; lon: number } | null> {
  const q = [address, city, state].filter(Boolean).join(", ");
  const params = new URLSearchParams({ q, format: "json", limit: "1" });
  const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
    headers: { "User-Agent": "WholesaleOS/1.0" },
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as NominatimResult[];
  if (!data.length) return null;
  return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
}

function osmMapUrl(lat: number, lon: number): string {
  return `https://staticmap.openstreetmap.de/staticmap.php?center=${lat},${lon}&zoom=18&size=800x600&maptype=mapnik&markers=${lat},${lon},red-pushpin`;
}

export async function GET(req: Request) {
  const auth = await requireOwner(req);
  if (!auth.ok) return NextResponse.json(apiError(auth.error), { status: auth.status });
  if (!(await isDbReady())) return NextResponse.json(apiError("No database"), { status: 500 });

  const userId = await getCurrentUserId();
  const deals = await prisma.deal.findMany({
    where: { userId },
    select: { id: true, address: true, city: true, state: true, zipCode: true, photos: true, ownerCount: true },
  });

  let photosAdded = 0;
  let ownershipAdded = 0;
  const errors: string[] = [];

  for (const deal of deals) {
    // Nominatim rate limit: 1 request/second
    await new Promise((r) => setTimeout(r, 1100));

    // Photos — skip if already has photos
    const existing = deal.photos as PropertyPhoto[] | null;
    if (!existing?.length && deal.address) {
      try {
        const geo = await geocode(deal.address, deal.city, deal.state);
        if (geo) {
          const photos: PropertyPhoto[] = [{ url: osmMapUrl(geo.lat, geo.lon), label: "Map Location", source: "streetview" }];
          await prisma.deal.update({
            where: { id: deal.id },
            data: { photos: photos as unknown as Prisma.InputJsonValue },
          });
          photosAdded++;
        }
      } catch (e) {
        errors.push(`photo:${deal.address}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    // Ownership — skip if already has ownership data
    if (!deal.ownerCount && deal.address && deal.city) {
      try {
        const result = await lookupOwnership(deal.address, deal.city, deal.state ?? "TX", deal.zipCode ?? undefined);
        if (result.owners.length > 0) {
          await prisma.deal.update({
            where: { id: deal.id },
            data: {
              ownerCount: result.ownerCount,
              ownerHistory: result.owners as unknown as Prisma.InputJsonValue,
            },
          });
          ownershipAdded++;
        }
      } catch (e) {
        errors.push(`owner:${deal.address}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  return NextResponse.json(apiOk({
    total: deals.length,
    photosAdded,
    ownershipAdded,
    errors: errors.slice(0, 20),
  }));
}

export const POST = GET;
