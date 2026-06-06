import { NextRequest, NextResponse } from "next/server";
import { isDbReady, CURRENT_USER_ID } from "@/lib/data/db";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/encrypt";
import { apiOk, apiError } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60; // Vercel Hobby cap; the drip already batches (take: 50).

function authCheck(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return (req.headers.get("authorization") ?? "") === `Bearer ${secret}`;
}

// Vercel native cron / free cron services trigger a GET. Delegate to POST.
export async function GET(req: NextRequest) {
  return POST(req);
}

/**
 * Process all active SMS sequences whose nextSendAt is in the past.
 * Sends the next message via Twilio and advances (or closes) the sequence.
 */
export async function POST(req: NextRequest) {
  if (!authCheck(req)) {
    return NextResponse.json(apiError("Unauthorized"), { status: 401 });
  }

  if (!(await isDbReady())) {
    return NextResponse.json(apiOk({ sent: 0, skipped: "no-db" }));
  }

  // Fetch Twilio credentials for the single user
  const user = await prisma.user.findUnique({
    where: { id: CURRENT_USER_ID },
    select: { twilioSid: true, twilioToken: true, twilioPhone: true },
  });

  if (!user?.twilioSid || !user.twilioToken || !user.twilioPhone) {
    return NextResponse.json(apiOk({ sent: 0, skipped: "no-twilio" }));
  }

  let accountSid: string, authToken: string;
  try {
    accountSid = decrypt(user.twilioSid);
    authToken = decrypt(user.twilioToken);
  } catch {
    return NextResponse.json(apiError("Could not decrypt Twilio credentials"), {
      status: 500,
    });
  }

  const fromPhone = user.twilioPhone;
  const now = new Date();

  // Find sequences that are due
  const dueSequences = await prisma.smsSequence.findMany({
    where: {
      active: true,
      nextSendAt: { lte: now },
    },
    include: {
      deal: {
        select: { id: true, ownerPhone: true, ownerName: true, address: true },
      },
      messages: { orderBy: { step: "asc" } },
    },
    take: 50,
  });

  let sent = 0;
  const errors: string[] = [];

  for (const seq of dueSequences) {
    if (!seq.deal.ownerPhone) continue;

    // Find the next message to send
    const nextMsg = seq.messages.find((m) => m.step === seq.currentStep);
    if (!nextMsg) {
      // No more messages → close the sequence
      await prisma.smsSequence.update({
        where: { id: seq.id },
        data: { active: false },
      });
      continue;
    }

    try {
      // Lazy-load Twilio to keep the bundle small
      const twilio = (await import("twilio")).default;
      const client = twilio(accountSid, authToken);

      const msg = await client.messages.create({
        body: nextMsg.message,
        from: fromPhone,
        to: seq.deal.ownerPhone,
      });

      // Mark message sent
      await prisma.sMS.update({
        where: { id: nextMsg.id },
        data: {
          status: "SENT",
          sentAt: now,
          twilioSid: msg.sid,
        },
      });

      // Advance or close the sequence
      const nextStep = seq.currentStep + 1;
      const hasMore = seq.messages.some((m) => m.step === nextStep);

      await prisma.smsSequence.update({
        where: { id: seq.id },
        data: {
          currentStep: nextStep,
          active: hasMore,
          // Schedule next step 3 days out by default
          nextSendAt: hasMore
            ? new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)
            : null,
        },
      });

      sent++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`seq/${seq.id}: ${msg}`);

      await prisma.sMS.update({
        where: { id: nextMsg?.id ?? "" },
        data: { status: "FAILED", error: msg.slice(0, 500) },
      }).catch(() => null);

      // Permanent failures (fake/invalid number) → stop retrying this sequence
      // forever so it can't waste sends or flag the Twilio account.
      if (/invalid.*phone|not a valid phone number|21211|21214|21217|21219|21408/i.test(msg)) {
        await prisma.smsSequence.update({
          where: { id: seq.id },
          data: { active: false },
        }).catch(() => null);
      }
    }
  }

  return NextResponse.json(apiOk({ sent, errors }));
}
