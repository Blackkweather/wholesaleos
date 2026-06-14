import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/admin-auth";
import { getDailySpend } from "@/lib/reliability/budget";
import { KILL_CATEGORIES } from "@/lib/reliability/killswitch";
import { apiOk, apiError } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET → today's spend vs cap for every category. */
export async function GET(req: Request) {
  const auth = await requireOwner(req);
  if (!auth.ok) return NextResponse.json(apiError(auth.error), { status: auth.status });

  const categories = await Promise.all(KILL_CATEGORIES.map((c) => getDailySpend(c)));
  const anyHalted = categories.some((c) => c.halted);
  const anyWarn = categories.some((c) => c.warn);

  return NextResponse.json(apiOk({ date: new Date().toISOString().slice(0, 10), categories, anyWarn, anyHalted }));
}
