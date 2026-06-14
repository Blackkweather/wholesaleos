import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/admin-auth";
import { enable, disable, killswitchStatus, KILL_CATEGORIES, type KillCategory } from "@/lib/reliability/killswitch";
import { apiOk, apiError } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function asCategory(v: unknown): KillCategory | null {
  return typeof v === "string" && (KILL_CATEGORIES as readonly string[]).includes(v) ? (v as KillCategory) : null;
}

/** POST { action: "enable"|"disable", category? } → engage/release the killswitch. */
export async function POST(req: Request) {
  const auth = await requireOwner(req);
  if (!auth.ok) return NextResponse.json(apiError(auth.error), { status: auth.status });

  const body = (await req.json().catch(() => ({}))) as { action?: string; category?: string };
  const action = body.action;
  if (action !== "enable" && action !== "disable") {
    return NextResponse.json(apiError("action must be 'enable' or 'disable'."), { status: 400 });
  }

  let category: KillCategory | undefined;
  if (body.category) {
    const c = asCategory(body.category);
    if (!c) return NextResponse.json(apiError(`category must be one of ${KILL_CATEGORIES.join(", ")}.`), { status: 400 });
    category = c;
  }

  if (action === "enable") await enable(category);
  else await disable(category);

  return NextResponse.json(apiOk({ action, category: category ?? "global", status: await killswitchStatus() }));
}

/** GET → current killswitch status. */
export async function GET(req: Request) {
  const auth = await requireOwner(req);
  if (!auth.ok) return NextResponse.json(apiError(auth.error), { status: auth.status });
  return NextResponse.json(apiOk(await killswitchStatus()));
}
