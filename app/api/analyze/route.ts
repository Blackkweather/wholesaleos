import { NextResponse } from "next/server";
import { z } from "zod";
import { analyzeDeal } from "@/lib/claude";
import { apiOk, apiError } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  address: z.string().optional(),
  city: z.string().optional(),
  arv: z.number().optional(),
  repairCost: z.number().optional(),
  offerPrice: z.number().optional(),
  assignmentFee: z.number().optional(),
  withComps: z.boolean().optional(),
});

export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(apiError("Invalid inputs."), { status: 400 });
  }
  try {
    const analysis = await analyzeDeal(parsed.data);
    return NextResponse.json(apiOk({ analysis }));
  } catch (e) {
    console.error("analyze error", e);
    return NextResponse.json(apiError("Could not analyze."), { status: 500 });
  }
}
