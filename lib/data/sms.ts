import "server-only";
import { prisma } from "@/lib/prisma";
import { isDbReady, CURRENT_USER_ID } from "./db";
import { generateSmsSequence } from "@/lib/claude";
import { dealViewToContext } from "./deals";
import type { DealView } from "@/types";

export interface StartSequenceResult {
  started: boolean;
  /** Machine reason: started | no-phone | no-twilio | already-active | ai-failed | db-error */
  reason: "started" | "no-phone" | "no-twilio" | "already-active" | "ai-failed" | "db-error";
  /** Human-friendly explanation for the UI. */
  message: string;
  /** Number of messages queued (when started). */
  queued?: number;
}

/**
 * Starts a 7-message SMS drip sequence for a deal that has a seller phone and
 * Twilio configured. The hourly `sms-drip` cron then sends each message on its
 * cadence. This is human-approved by design — call it only when the user has
 * explicitly chosen to text this specific lead (keeps outreach TCPA-compliant).
 *
 * Returns a structured result so the caller can explain skips to the user.
 */
export async function autoStartSequenceForDeal(deal: DealView): Promise<StartSequenceResult> {
  // Skip if no phone number to text
  if (!deal.ownerPhone) {
    return { started: false, reason: "no-phone", message: "No seller phone on file — run a skip trace first." };
  }

  // Skip if Twilio is not configured
  if (!(await isDbReady())) {
    return { started: false, reason: "no-twilio", message: "Database not ready." };
  }
  const user = await prisma.user.findUnique({
    where: { id: CURRENT_USER_ID },
    select: { twilioSid: true, twilioToken: true, twilioPhone: true },
  });
  if (!user?.twilioSid || !user.twilioToken || !user.twilioPhone) {
    return { started: false, reason: "no-twilio", message: "Twilio isn't connected — add your number in Settings to enable automated texts." };
  }

  // Skip if a sequence already exists for this deal
  const existing = await prisma.smsSequence.findFirst({
    where: { dealId: deal.id },
    select: { id: true },
  });
  if (existing) {
    return { started: false, reason: "already-active", message: "A text sequence is already running for this deal." };
  }

  // Generate the 7-message sequence via AI (or mock fallback)
  let messages;
  try {
    messages = await generateSmsSequence(dealViewToContext(deal));
  } catch (e) {
    console.error(`autoStartSequenceForDeal: generateSmsSequence failed for ${deal.address}`, e);
    return { started: false, reason: "ai-failed", message: "Couldn't generate the message sequence — try again." };
  }

  if (!messages || messages.length === 0) {
    return { started: false, reason: "ai-failed", message: "No messages were generated — try again." };
  }

  const now = new Date();
  // Schedule first message 1 hour from now to avoid immediate sends
  const firstSendAt = new Date(now.getTime() + 60 * 60 * 1000);

  try {
    // Create the sequence record first, then attach SMS rows
    const seq = await prisma.smsSequence.create({
      data: {
        deal: { connect: { id: deal.id } },
        active: true,
        currentStep: 0,
        startedAt: now,
        nextSendAt: firstSendAt,
      },
    });

    // Create one SMS row per message step
    await prisma.$transaction(
      messages.map((m) =>
        prisma.sMS.create({
          data: {
            deal:      { connect: { id: deal.id } },
            sequence:  { connect: { id: seq.id } },
            step:      m.step,
            message:   m.message,
            phone:     deal.ownerPhone!,
            status:    "SCHEDULED",
            direction: "OUTBOUND",
            // Schedule each message relative to sequence start, respecting the day cadence
            scheduledFor: new Date(now.getTime() + m.day * 24 * 60 * 60 * 1000),
          },
        }),
      ),
    );

    console.log(`📱 Started ${messages.length}-msg SMS sequence for ${deal.address} → ${deal.ownerPhone}`);
    return {
      started: true,
      reason: "started",
      message: `Text sequence started — ${messages.length} messages will go out on cadence, first within the hour.`,
      queued: messages.length,
    };
  } catch (e) {
    console.error(`autoStartSequenceForDeal: DB write failed for ${deal.address}`, e);
    return { started: false, reason: "db-error", message: "Couldn't save the sequence — please try again." };
  }
}
