import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDeal } from "@/lib/data/deals";
import { skipTrace, isApifyConfigured } from "@/lib/skipTrace";
import { apiOk, apiError } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 150;

/** POST → skip trace this lead's owner, save phone/email to the record. */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  if (!isApifyConfigured()) {
    return NextResponse.json(apiError("Skip tracing not configured — add APIFY_API_KEY to .env."), { status: 400 });
  }

  const deal = await getDeal(params.id);
  if (!deal) return NextResponse.json(apiError("Deal not found."), { status: 404 });
  if (!deal.ownerName) return NextResponse.json(apiError("No owner name to trace."), { status: 400 });

  const result = await skipTrace({
    ownerName: deal.ownerName,
    address: deal.address ?? undefined,
    city: deal.city ?? undefined,
    state: deal.state ?? undefined,
    zip: deal.zipCode ?? undefined,
  });

  const primaryPhone = result.phones[0]?.number ?? null;
  const primaryEmail = result.emails[0] ?? null;

  // Persist primary contacts + tag + activity log (no schema change needed)
  try {
    const tags = Array.from(new Set([...(deal.tags ?? []), "skip-traced"]));
    await prisma.deal.update({
      where: { id: deal.id },
      data: {
        ownerPhone: primaryPhone ?? deal.ownerPhone,
        ownerEmail: primaryEmail ?? deal.ownerEmail,
        tags,
      },
    });
    await prisma.activity.create({
      data: {
        dealId: deal.id,
        type: "NOTE",
        content: `🔎 Skip trace (${result.source ?? "no hit"}): ${result.phones.length} phone(s), ${result.emails.length} email(s) — confidence ${result.confidence}%`,
        meta: JSON.parse(JSON.stringify({ phones: result.phones, emails: result.emails, confidence: result.confidence, source: result.source })),
      },
    });
  } catch (e) {
    console.error("skip-trace save error", e);
  }

  return NextResponse.json(apiOk({
    phones: result.phones,
    emails: result.emails,
    confidence: result.confidence,
    source: result.source,
    saved: { ownerPhone: primaryPhone, ownerEmail: primaryEmail },
  }));
}
