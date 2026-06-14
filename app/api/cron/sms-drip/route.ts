import { NextRequest, NextResponse } from "next/server";
import { isDbReady, CURRENT_USER_ID } from "@/lib/data/db";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/encrypt";
import { sendSms } from "@/lib/twilio";
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
      // Route through sendSms → compliance guard (opt-out/DNC/quiet hours) +
      // budget + breaker + idempotency. The sequence was human-approved, so
      // these messages are human-initiated.
      const { data, error } = await sendSms(
        { sid: accountSid, token: authToken, phone: fromPhone },
        seq.deal.ownerPhone,
        nextMsg.message,
        { idempotencyKey: `drip:${nextMsg.id}`, compliance: { humanInitiated: true, dealId: seq.deal.id } },
      );

      if (error) {
        // Opted out / on DNC → stop texting this seller permanently.
        if (/opted out|Do-Not-Call/i.test(error)) {
          await prisma.smsSequence.update({ where: { id: seq.id }, data: { active: false } }).catch(() => null);
          continue;
        }
        // Quiet hours → hold this step and retry on a later cron tick.
        if (/contact hours/i.test(error)) {
          await prisma.smsSequence.update({
            where: { id: seq.id },
            data: { nextSendAt: new Date(Date.now() + 12 * 60 * 60 * 1000) },
          }).catch(() => null);
          continue;
        }
        errors.push(`seq/${seq.id}: ${error}`);
        await prisma.sMS.update({
          where: { id: nextMsg.id },
          data: { status: "FAILED", error: error.slice(0, 500) },
        }).catch(() => null);
        // Permanent failures (fake/invalid number) → stop retrying forever.
        if (/invalid.*phone|not a valid phone number|21211|21214|21217|21219|21408/i.test(error)) {
          await prisma.smsSequence.update({ where: { id: seq.id }, data: { active: false } }).catch(() => null);
        }
        continue;
      }

      // Sent — record + advance the sequence.
      await prisma.sMS.update({
        where: { id: nextMsg.id },
        data: { status: "SENT", sentAt: now, twilioSid: data?.sid },
      });
      const nextStep = seq.currentStep + 1;
      const hasMore = seq.messages.some((m) => m.step === nextStep);
      await prisma.smsSequence.update({
        where: { id: seq.id },
        data: {
          currentStep: nextStep,
          active: hasMore,
          nextSendAt: hasMore ? new Date(Date.now() + 3 * 24 * 60 * 60 * 1000) : null,
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
    }
  }

  return NextResponse.json(apiOk({ sent, errors }));
}
