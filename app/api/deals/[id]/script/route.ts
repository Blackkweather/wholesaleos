import { NextResponse } from "next/server";
import { z } from "zod";
import { getDeal, dealViewToContext } from "@/lib/data/deals";
import { generateScript } from "@/lib/claude";
import { apiOk, apiError } from "@/types";
import type { ScriptType } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  type: z.enum([
    "COLD_CALL",
    "VOICEMAIL",
    "TEXT",
    "LETTER",
    "EMAIL",
    "NEGOTIATION",
    "BUYER_PITCH",
  ]),
  tone: z.string().optional(),
});

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const deal = await getDeal(params.id);
  if (!deal) {
    return NextResponse.json(apiError("Deal not found."), { status: 404 });
  }
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(apiError("Pick a script type."), { status: 400 });
  }
  try {
    const content = await generateScript(
      dealViewToContext(deal),
      parsed.data.type as ScriptType,
      parsed.data.tone,
    );
    return NextResponse.json(apiOk({ content }));
  } catch (e) {
    console.error("script gen error", e);
    return NextResponse.json(apiError("Could not generate script."), {
      status: 500,
    });
  }
}
