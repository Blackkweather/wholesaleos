import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isDbReady } from "@/lib/data/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Vapi.ai webhook — receives call events after each call.
 * Saves transcript and outcome to the deal's activity feed.
 * Updates deal stage to CONTACTED when seller picks up.
 * Sets optedOut=true if seller asked to be removed.
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  const type    = body.type as string | undefined;
  const message = body.message as Record<string, unknown> | undefined;

  // Only handle call-ended events
  if (type !== "end-of-call-report" && type !== "call.ended") {
    return NextResponse.json({ ok: true, ignored: type });
  }

  const call       = (message ?? body) as Record<string, unknown>;
  const callId     = call.id as string | undefined;
  const duration   = (call.duration as number | undefined) ?? 0;
  const transcript = (call.transcript as string | undefined) ?? "";
  const summary    = (call.summary as string | undefined) ?? "";
  const endReason  = (call.endedReason as string | undefined) ?? "";

  // Extract dealId from metadata (we pass it when creating the call)
  const metadata = call.metadata as Record<string, string> | undefined;
  const dealId   = metadata?.dealId;

  if (!dealId || !(await isDbReady())) {
    return NextResponse.json({ ok: true, saved: false });
  }

  // Classify outcome
  const t       = transcript.toLowerCase();
  const noAnswer   = endReason === "customer-did-not-answer" || duration < 5;
  const optOut     = t.includes("don't call") || t.includes("remove me") || t.includes("stop calling") || t.includes("take me off");
  const interested = !optOut && (t.includes("yes") || t.includes("interested") || t.includes("offer") || t.includes("sure") || t.includes("how much"));

  const outcomeLabel = noAnswer    ? "📵 No answer"
    : optOut      ? "🚫 Opted out"
    : interested  ? "✅ Interested"
    : "📞 Called — not interested";

  try {
    // Log the call as an activity on the deal
    await prisma.activity.create({
      data: {
        dealId,
        type:    "CALL_LOGGED",
        content: `${outcomeLabel} | ${Math.round(duration)}s | callId: ${callId ?? "?"}`,
        meta:    { transcript: transcript.slice(0, 2000), summary, endReason },
      },
    });

    // Update deal stage + optedOut flag
    if (!noAnswer) {
      await prisma.deal.update({
        where: { id: dealId },
        data:  {
          stage:    interested ? "CONTACTED" : undefined,
          optedOut: optOut || undefined,
          notes:    summary
            ? `AI call summary: ${summary}`
            : undefined,
        },
      });
    }

    console.log(`📞 Vapi webhook saved: deal=${dealId} outcome=${outcomeLabel}`);
    return NextResponse.json({ ok: true, dealId, outcome: outcomeLabel });
  } catch (e) {
    console.error("Vapi webhook DB error:", e);
    return NextResponse.json({ ok: false, error: "db error" }, { status: 500 });
  }
}
