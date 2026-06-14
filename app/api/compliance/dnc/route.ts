import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/lib/admin-auth";
import { isOnDnc, addDnc, removeDnc, type DncScope } from "@/lib/compliance/dnc";
import { apiOk, apiError } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SCOPES = ["FEDERAL", "STATE", "INTERNAL"] as const;

/** GET ?contact= → is the number on the Do-Not-Call list. */
export async function GET(req: NextRequest) {
  const auth = await requireOwner(req);
  if (!auth.ok) return NextResponse.json(apiError(auth.error), { status: auth.status });

  const contact = req.nextUrl.searchParams.get("contact") ?? "";
  if (!contact) return NextResponse.json(apiError("contact is required."), { status: 400 });
  return NextResponse.json(apiOk({ contact, onDnc: await isOnDnc(contact) }));
}

/** POST { contact, action: "add"|"remove", scope? } → manage the DNC list. */
export async function POST(req: NextRequest) {
  const auth = await requireOwner(req);
  if (!auth.ok) return NextResponse.json(apiError(auth.error), { status: auth.status });

  const body = (await req.json().catch(() => ({}))) as { contact?: string; action?: string; scope?: string };
  if (!body.contact) return NextResponse.json(apiError("contact is required."), { status: 400 });
  if (body.action !== "add" && body.action !== "remove") {
    return NextResponse.json(apiError("action must be 'add' or 'remove'."), { status: 400 });
  }

  if (body.action === "add") {
    const scope = (SCOPES as readonly string[]).includes(body.scope ?? "") ? (body.scope as DncScope) : "INTERNAL";
    await addDnc(body.contact, scope);
  } else {
    await removeDnc(body.contact);
  }
  return NextResponse.json(apiOk({ contact: body.contact, action: body.action, onDnc: await isOnDnc(body.contact) }));
}
