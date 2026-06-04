import { NextResponse } from "next/server";
import { z } from "zod";
import {
  listBuyers,
  createBuyer,
  createBuyersFromScored,
} from "@/lib/data/buyers";
import { apiOk, apiError } from "@/types";
import type { ScoredBuyer } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const buyers = await listBuyers();
    return NextResponse.json(apiOk({ buyers }));
  } catch (e) {
    console.error("list buyers error", e);
    return NextResponse.json(apiError("Could not load buyers."), {
      status: 500,
    });
  }
}

const manualSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  company: z.string().optional(),
  website: z.string().optional(),
  buyerType: z.string().optional(),
  cities: z.array(z.string()).optional(),
  minPrice: z.number().optional(),
  maxPrice: z.number().optional(),
  tags: z.array(z.string()).optional(),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // Bulk save AI-found buyers
    if (Array.isArray(body?.found)) {
      const items = (body.found as ScoredBuyer[]).filter(
        (b) => b && typeof b.name === "string" && b.name.length > 1,
      );
      if (items.length === 0) {
        return NextResponse.json(apiError("No buyers to save."), { status: 400 });
      }
      const buyers = await createBuyersFromScored(items);
      return NextResponse.json(apiOk({ buyers }));
    }

    // Single manual add
    const parsed = manualSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(apiError("A name is required."), { status: 400 });
    }
    const buyer = await createBuyer({
      ...parsed.data,
      email: parsed.data.email || undefined,
    });
    return NextResponse.json(apiOk({ buyer }));
  } catch (e) {
    console.error("create buyer error", e);
    return NextResponse.json(apiError("Could not add buyer."), { status: 500 });
  }
}
