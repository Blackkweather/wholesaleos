import { NextResponse } from "next/server";
import { getDeal } from "@/lib/data/deals";
import { getNegotiationPlaybook, getLiveResponse } from "@/lib/data/negotiation";
import { assessDeal } from "@/lib/confidence/gate";
import { prisma } from "@/lib/prisma";
import { isDbReady } from "@/lib/data/db";
import { apiOk, apiError } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function marketIdFor(dealId: string): Promise<string | null> {
  if (!(await isDbReady())) return null;
  const row = await prisma.deal.findUnique({ where: { id: dealId }, select: { marketId: true } });
  return row?.marketId ?? null;
}

/** GET → the negotiation playbook. Offer numbers are withheld when the gate fails. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const deal = await getDeal(params.id);
  if (!deal) return NextResponse.json(apiError("Deal not found."), { status: 404 });

  const bundle = await assessDeal(deal, await marketIdFor(deal.id));
  const playbook = await getNegotiationPlaybook(deal);

  if (!bundle.gate.allowed) {
    return NextResponse.json(
      apiOk({
        ...playbook,
        mao: null,
        openingOffer: null,
        walkAway: null,
        counterLadder: [],
        blocked: true,
        blockReason: bundle.gate.reason,
        confidence: bundle.gate.confidence,
      }),
    );
  }

  return NextResponse.json(apiOk({ ...playbook, blocked: false, confidence: bundle.gate.confidence }));
}

/** POST { sellerSaid, history } → suggested live response. Refused when the gate fails. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const deal = await getDeal(params.id);
  if (!deal) return NextResponse.json(apiError("Deal not found."), { status: 404 });
  const body = (await req.json().catch(() => ({}))) as {
    sellerSaid?: string;
    history?: { role: "seller" | "you"; text: string }[];
  };
  if (!body.sellerSaid?.trim()) return NextResponse.json(apiError("What did the seller say?"), { status: 400 });

  const bundle = await assessDeal(deal, await marketIdFor(deal.id));
  if (!bundle.gate.allowed) {
    return NextResponse.json(apiError(`Offer recommendation blocked: ${bundle.gate.reason}`), { status: 422 });
  }

  const response = await getLiveResponse(deal, body.sellerSaid, body.history ?? []);
  return NextResponse.json(apiOk({ response }));
}
