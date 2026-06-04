import { NextResponse } from "next/server";
import { z } from "zod";
import {
  listDeals,
  createDealsFromScored,
  createManualDeal,
} from "@/lib/data/deals";
import { apiOk, apiError } from "@/types";
import type { ScoredDeal } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const deals = await listDeals();
    return NextResponse.json(apiOk({ deals }));
  } catch (e) {
    console.error("list deals error", e);
    return NextResponse.json(apiError("Could not load deals."), {
      status: 500,
    });
  }
}

const manualSchema = z.object({
  address: z.string().min(3, "Address is required"),
  city: z.string().optional(),
  state: z.string().optional(),
  situation: z.string().optional(),
  dealType: z.string().optional(),
  arv: z.number().optional(),
  repairCost: z.number().optional(),
  offerPrice: z.number().optional(),
  ownerName: z.string().optional(),
  ownerPhone: z.string().optional(),
  ownerEmail: z.string().optional(),
  notes: z.string().optional(),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();

    if (body?.manual) {
      const parsed = manualSchema.safeParse(body.manual);
      if (!parsed.success) {
        return NextResponse.json(apiError("A street address is required."), {
          status: 400,
        });
      }
      const deal = await createManualDeal({
        ...parsed.data,
        dealType: parsed.data.dealType as ScoredDeal["dealType"] | undefined,
      });
      return NextResponse.json(apiOk({ deals: [deal] }));
    }

    const items: ScoredDeal[] = Array.isArray(body?.deals)
      ? body.deals
      : body?.deal
        ? [body.deal]
        : [];
    const valid = items.filter(
      (d) => d && typeof d.address === "string" && d.address.length > 2,
    );
    if (valid.length === 0) {
      return NextResponse.json(apiError("No deals to save."), { status: 400 });
    }
    const created = await createDealsFromScored(valid);
    return NextResponse.json(apiOk({ deals: created }));
  } catch (e) {
    console.error("create deals error", e);
    return NextResponse.json(apiError("Could not save deal."), { status: 500 });
  }
}
