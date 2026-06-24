import { NextRequest, NextResponse } from "next/server";
import { getDeal, updateDeal } from "@/lib/data/deals";
import { apiOk, apiError } from "@/types";
import type { PropertyPhoto } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface NominatimResult {
  lat: string;
  lon: string;
  display_name: string;
}

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
  const z = 18;
  return `https://staticmap.openstreetmap.de/staticmap.php?center=${lat},${lon}&zoom=${z}&size=800x600&maptype=mapnik&markers=${lat},${lon},red-pushpin`;
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const deal = await getDeal(params.id);
  if (!deal) return NextResponse.json(apiError("Deal not found"), { status: 404 });

  if (deal.photos && deal.photos.length > 0) {
    return NextResponse.json(apiOk({ photos: deal.photos, cached: true }));
  }

  const photos: PropertyPhoto[] = [];

  // Google Street View (if key is set — best quality, actual property photo)
  const gKey = process.env.GOOGLE_MAPS_API_KEY?.trim();
  if (gKey && deal.address) {
    try {
      const location = [deal.address, deal.city, deal.state].filter(Boolean).join(", ");
      const metaParams = new URLSearchParams({ location, key: gKey });
      const metaRes = await fetch(`https://maps.googleapis.com/maps/api/streetview/metadata?${metaParams}`, { signal: AbortSignal.timeout(5000) });
      const meta = (await metaRes.json()) as { status?: string };
      if (meta.status === "OK") {
        const imgParams = new URLSearchParams({ size: "800x600", location, key: gKey, fov: "90", pitch: "5" });
        photos.push({
          url: `https://maps.googleapis.com/maps/api/streetview?${imgParams}`,
          label: "Street View",
          source: "streetview",
        });
      }
    } catch { /* Street View unavailable */ }
  }

  // Free fallback: OpenStreetMap static map (no API key needed)
  if (photos.length === 0 && deal.address) {
    try {
      const geo = await geocode(deal.address, deal.city, deal.state);
      if (geo) {
        photos.push({
          url: osmMapUrl(geo.lat, geo.lon),
          label: "Map Location",
          source: "streetview",
        });
      }
    } catch { /* geocoding failed */ }
  }

  if (photos.length > 0) {
    await updateDeal(params.id, { photos });
  }

  return NextResponse.json(apiOk({ photos, cached: false }));
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const deal = await getDeal(params.id);
  if (!deal) return NextResponse.json(apiError("Deal not found"), { status: 404 });

  const body = (await req.json()) as { url?: string; label?: string; remove?: string };

  const existing: PropertyPhoto[] = deal.photos ?? [];

  if (body.remove) {
    const filtered = existing.filter((p) => p.url !== body.remove);
    await updateDeal(params.id, { photos: filtered });
    return NextResponse.json(apiOk({ photos: filtered }));
  }

  if (!body.url) {
    return NextResponse.json(apiError("url is required"), { status: 400 });
  }

  if (existing.some((p) => p.url === body.url)) {
    return NextResponse.json(apiOk({ photos: existing }));
  }

  const updated = [...existing, { url: body.url, label: body.label ?? "Photo", source: "manual" as const }];
  await updateDeal(params.id, { photos: updated });
  return NextResponse.json(apiOk({ photos: updated }));
}
