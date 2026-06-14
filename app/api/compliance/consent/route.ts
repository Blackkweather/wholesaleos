import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/lib/admin-auth";
import { recordConsent, getConsentStatus, type ConsentChannel, type ConsentStatus, type ConsentMethod } from "@/lib/compliance/consent";
import { apiOk, apiError } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CHANNELS = ["SMS", "EMAIL", "CALL"] as const;
const STATUSES = ["GRANTED", "REVOKED"] as const;

/** GET ?contact=&channel= → latest consent status. */
export async function GET(req: NextRequest) {
  const auth = await requireOwner(req);
  if (!auth.ok) return NextResponse.json(apiError(auth.error), { status: auth.status });

  const contact = req.nextUrl.searchParams.get("contact") ?? "";
  const channel = req.nextUrl.searchParams.get("channel") ?? "";
  if (!contact || !(CHANNELS as readonly string[]).includes(channel)) {
    return NextResponse.json(apiError("contact and channel (SMS|EMAIL|CALL) are required."), { status: 400 });
  }
  const status = await getConsentStatus(contact, channel as ConsentChannel);
  return NextResponse.json(apiOk({ contact, channel, status }));
}

/** POST { contact, channel, status, method, proof? } → record a consent change. */
export async function POST(req: NextRequest) {
  const auth = await requireOwner(req);
  if (!auth.ok) return NextResponse.json(apiError(auth.error), { status: auth.status });

  const body = (await req.json().catch(() => ({}))) as {
    contact?: string;
    channel?: string;
    status?: string;
    method?: string;
    proof?: Record<string, unknown>;
  };
  if (!body.contact || !(CHANNELS as readonly string[]).includes(body.channel ?? "")) {
    return NextResponse.json(apiError("contact and channel (SMS|EMAIL|CALL) are required."), { status: 400 });
  }
  if (!(STATUSES as readonly string[]).includes(body.status ?? "")) {
    return NextResponse.json(apiError("status must be GRANTED or REVOKED."), { status: 400 });
  }

  await recordConsent({
    contact: body.contact,
    channel: body.channel as ConsentChannel,
    status: body.status as ConsentStatus,
    method: (body.method as ConsentMethod) ?? "manual",
    proof: body.proof,
  });
  return NextResponse.json(apiOk({ recorded: true, contact: body.contact, channel: body.channel, status: body.status }));
}
