import { NextResponse } from "next/server";
import { z } from "zod";
import { getDeal, updateDeal, deleteDeal, type DealPatch } from "@/lib/data/deals";
import { apiOk, apiError } from "@/types";
import { STAGES } from "@/constants/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

export async function GET(_req: Request, { params }: Ctx) {
  const deal = await getDeal(params.id);
  if (!deal) return NextResponse.json(apiError("Deal not found."), { status: 404 });
  return NextResponse.json(apiOk({ deal }));
}

const patchSchema = z.object({
  stage: z.enum(STAGES).optional(),
  notes: z.string().optional(),
  hot: z.boolean().optional(),
  nextFollowUpAt: z.string().nullable().optional(),
  ownerPhone: z.string().optional(),
  ownerEmail: z.string().optional(),
  arv: z.number().optional(),
  repairCost: z.number().optional(),
  offerPrice: z.number().optional(),
});

export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const parsed = patchSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(apiError("Invalid update."), { status: 400 });
    }
    const deal = await updateDeal(params.id, parsed.data as DealPatch);
    if (!deal) return NextResponse.json(apiError("Deal not found."), { status: 404 });
    return NextResponse.json(apiOk({ deal }));
  } catch (e) {
    console.error("update deal error", e);
    return NextResponse.json(apiError("Could not update deal."), { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const ok = await deleteDeal(params.id);
  if (!ok) return NextResponse.json(apiError("Deal not found."), { status: 404 });
  return NextResponse.json(apiOk({ deleted: true }));
}
