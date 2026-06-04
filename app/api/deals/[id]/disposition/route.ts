import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDeal } from "@/lib/data/deals";
import { getDispoForDeal, setDispoStatus } from "@/lib/data/disposition";
import { apiOk, apiError } from "@/types";
import type { DispoStatus } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUSES = ["SENT", "INTERESTED", "PASSED", "ASSIGNED"] as const;

/** GET → buyers this deal was sent to + their disposition status. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const rows = await getDispoForDeal(params.id);
  return NextResponse.json(apiOk({ rows }));
}

/** POST { buyerId, status } → update a buyer's disposition status. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const deal = await getDeal(params.id);
  if (!deal) return NextResponse.json(apiError("Deal not found."), { status: 404 });

  const body = (await req.json().catch(() => ({}))) as { buyerId?: string; status?: string };
  if (!body.buyerId || !body.status || !STATUSES.includes(body.status as (typeof STATUSES)[number])) {
    return NextResponse.json(apiError("buyerId and a valid status are required."), { status: 400 });
  }

  const ok = await setDispoStatus(params.id, body.buyerId, body.status as DispoStatus);
  if (!ok) return NextResponse.json(apiError("Could not update — was this buyer sent the deal?"), { status: 400 });

  if (body.status === "ASSIGNED") {
    try {
      const buyer = await prisma.buyer.findUnique({ where: { id: body.buyerId }, select: { name: true, company: true } });
      await prisma.activity.create({
        data: { dealId: deal.id, type: "NOTE", content: `🤝 Deal assigned to ${buyer?.company || buyer?.name || "a buyer"}.` },
      });
    } catch { /* non-fatal */ }
  }

  return NextResponse.json(apiOk({ updated: true }));
}
