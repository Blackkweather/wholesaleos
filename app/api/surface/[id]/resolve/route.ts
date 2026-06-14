import { NextResponse } from "next/server";
import { resolveSurfaceItem } from "@/lib/surfacing/engine";
import { inngest } from "@/inngest/client";
import { apiOk, apiError } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RESOLUTIONS = ["approved", "modified", "rejected", "dismissed"] as const;
type Resolution = (typeof RESOLUTIONS)[number];

/** POST { resolution } → resolve a surfaced item and emit surface.resolved. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const body = (await req.json().catch(() => ({}))) as { resolution?: string };
  if (!body.resolution || !(RESOLUTIONS as readonly string[]).includes(body.resolution)) {
    return NextResponse.json(apiError(`resolution must be one of ${RESOLUTIONS.join(", ")}.`), { status: 400 });
  }
  const ok = await resolveSurfaceItem(params.id, body.resolution as Resolution);
  if (!ok) return NextResponse.json(apiError("Surface item not found."), { status: 404 });

  try {
    await inngest.send({ name: "surface.resolved", data: { id: params.id, resolution: body.resolution } });
  } catch {
    /* event bus best-effort */
  }
  return NextResponse.json(apiOk({ id: params.id, resolution: body.resolution }));
}
