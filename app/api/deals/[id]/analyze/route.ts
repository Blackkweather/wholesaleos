import { NextResponse } from "next/server";
import { getDeal } from "@/lib/data/deals";
import { analyzeDeal } from "@/lib/claude";
import { assessAndPersist } from "@/lib/confidence/gate";
import { prisma } from "@/lib/prisma";
import { isDbReady } from "@/lib/data/db";
import { apiOk, apiError } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const deal = await getDeal(params.id);
  if (!deal) {
    return NextResponse.json(apiError("Deal not found."), { status: 404 });
  }
  const body = await req.json().catch(() => ({}));
  try {
    const analysis = await analyzeDeal({
      address: deal.address,
      city: deal.city ?? undefined,
      arv: deal.arv ?? undefined,
      repairCost: deal.repairCost ?? undefined,
      offerPrice: deal.offerPrice ?? undefined,
      assignmentFee: deal.assignmentFee ?? undefined,
      withComps: Boolean(body?.withComps),
    });

    // Data Confidence Layer: build estimates, evaluate the gate, persist, and
    // set Deal.autoActBlocked. Never breaks the analyze contract on failure.
    let confidence: Awaited<ReturnType<typeof assessAndPersist>> | null = null;
    try {
      let marketId: string | null = null;
      if (await isDbReady()) {
        const row = await prisma.deal.findUnique({ where: { id: deal.id }, select: { marketId: true } });
        marketId = row?.marketId ?? null;
      }
      confidence = await assessAndPersist(deal, marketId);
    } catch (e) {
      console.error("confidence assessment failed", e);
    }

    return NextResponse.json(
      apiOk({
        analysis,
        confidence: confidence
          ? {
              gate: confidence.gate,
              arv: confidence.arv,
              repair: confidence.repair,
              offer: confidence.offer,
              calibration: confidence.drift,
            }
          : null,
        autoActBlocked: confidence ? !confidence.gate.allowed : deal.autoActBlocked,
      }),
    );
  } catch (e) {
    console.error("analyze error", e);
    return NextResponse.json(apiError("Could not analyze deal."), {
      status: 500,
    });
  }
}
