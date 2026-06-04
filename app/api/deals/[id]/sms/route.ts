import { NextResponse } from "next/server";
import { getDeal, dealViewToContext } from "@/lib/data/deals";
import { generateSmsSequence } from "@/lib/claude";
import { apiOk, apiError } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const deal = await getDeal(params.id);
  if (!deal) {
    return NextResponse.json(apiError("Deal not found."), { status: 404 });
  }
  try {
    const messages = await generateSmsSequence(dealViewToContext(deal));
    return NextResponse.json(apiOk({ messages }));
  } catch (e) {
    console.error("sms gen error", e);
    return NextResponse.json(apiError("Could not generate sequence."), {
      status: 500,
    });
  }
}
