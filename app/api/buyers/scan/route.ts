import { NextResponse } from "next/server";
import { z } from "zod";
import { findBuyers, isClaudeConfigured } from "@/lib/claude";
import { apiOk, apiError } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  city: z.string().min(2, "Enter a city"),
  state: z.string().optional(),
  limit: z.number().min(1).max(12).optional(),
});

export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(apiError("Enter a city to search."), {
      status: 400,
    });
  }
  try {
    const buyers = await findBuyers(parsed.data);
    return NextResponse.json(apiOk({ buyers, live: isClaudeConfigured() }));
  } catch (e) {
    console.error("buyer scan error", e);
    return NextResponse.json(apiError("Search failed. Try again."), {
      status: 500,
    });
  }
}
