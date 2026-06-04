import { NextResponse } from "next/server";
import { z } from "zod";
import { findDeals, isClaudeConfigured } from "@/lib/claude";
import { apiOk, apiError } from "@/types";
import type { DealType } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  city: z.string().min(2, "Enter a city"),
  state: z.string().optional(),
  zipCode: z.string().optional(),
  minPrice: z.number().nonnegative().optional(),
  maxPrice: z.number().nonnegative().optional(),
  dealTypes: z.array(z.string()).optional(),
  limit: z.number().min(1).max(12).optional(),
});

export async function POST(req: Request) {
  try {
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(apiError("Enter a city to scan."), {
        status: 400,
      });
    }
    const deals = await findDeals({
      ...parsed.data,
      dealTypes: parsed.data.dealTypes as DealType[] | undefined,
    });
    return NextResponse.json(apiOk({ deals, live: isClaudeConfigured() }));
  } catch (e) {
    console.error("scan route error", e);
    return NextResponse.json(apiError("Scan failed. Try again."), {
      status: 500,
    });
  }
}
