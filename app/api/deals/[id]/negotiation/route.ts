import { NextResponse } from "next/server";
import { getDeal } from "@/lib/data/deals";
import { getNegotiationPlaybook, getLiveResponse } from "@/lib/data/negotiation";
import { apiOk, apiError } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET → the negotiation playbook (MAO, ladder, objections, talking points). */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const deal = await getDeal(params.id);
  if (!deal) return NextResponse.json(apiError("Deal not found."), { status: 404 });
  const playbook = await getNegotiationPlaybook(deal);
  return NextResponse.json(apiOk(playbook));
}

/** POST { sellerSaid, history } → suggested live response (never above MAO). */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const deal = await getDeal(params.id);
  if (!deal) return NextResponse.json(apiError("Deal not found."), { status: 404 });
  const body = await req.json().catch(() => ({})) as { sellerSaid?: string; history?: { role: "seller" | "you"; text: string }[] };
  if (!body.sellerSaid?.trim()) return NextResponse.json(apiError("What did the seller say?"), { status: 400 });
  const response = await getLiveResponse(deal, body.sellerSaid, body.history ?? []);
  return NextResponse.json(apiOk({ response }));
}
