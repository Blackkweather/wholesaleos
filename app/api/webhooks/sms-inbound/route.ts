import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isDbReady, CURRENT_USER_ID } from "@/lib/data/db";
import { groqGenerate, isGroqConfigured } from "@/lib/groq";
import { decrypt } from "@/lib/encrypt";
import { recordConsent } from "@/lib/compliance/consent";
import { addDnc } from "@/lib/compliance/dnc";
import { inngest } from "@/inngest/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Twilio inbound SMS webhook.
 * When a seller texts your Twilio number, this endpoint:
 *  1. Finds the deal by the sender's phone number
 *  2. Loads recent SMS history for context
 *  3. Uses Groq to generate a smart reply
 *  4. Replies via Twilio and saves both messages to DB
 *
 * Configure in Twilio Console:
 *   Phone Numbers → Your number → Messaging → Webhook URL:
 *   https://<your-tunnel>.trycloudflare.com/api/webhooks/sms-inbound
 */
export async function POST(req: NextRequest) {
  // Twilio sends URL-encoded form data
  let from = "", to = "", body = "", messageSid = "";
  try {
    const form = await req.formData();
    from       = String(form.get("From") ?? "");
    to         = String(form.get("To")   ?? "");
    body       = String(form.get("Body") ?? "").trim();
    messageSid = String(form.get("MessageSid") ?? "");
  } catch {
    return twiml(""); // empty response so Twilio doesn't retry
  }

  if (!from || !body) return twiml("");

  // Opt-out keywords — TCPA compliance
  const stopWords = ["stop", "unsubscribe", "cancel", "quit", "end", "stopall"];
  if (stopWords.includes(body.toLowerCase())) {
    await markOptedOut(from);
    return twiml("You have been unsubscribed. Reply START to re-subscribe.");
  }

  if (!(await isDbReady())) return twiml("");

  // Find deal by seller phone number
  const deal = await prisma.deal.findFirst({
    where: { ownerPhone: from, userId: CURRENT_USER_ID },
    orderBy: { createdAt: "desc" },
  });

  // Save inbound message regardless of whether we find a deal
  if (deal) {
    await prisma.sMS.create({
      data: {
        deal:      { connect: { id: deal.id } },
        direction: "INBOUND",
        message:   body,
        phone:     from,
        status:    "DELIVERED",
        sentAt:    new Date(),
        twilioSid: messageSid,
      },
    });

    await prisma.activity.create({
      data: {
        dealId:  deal.id,
        type:    "SMS_RECEIVED",
        content: `📩 Seller replied: "${body.slice(0, 200)}"`,
      },
    });

    // A seller-initiated reply grants SMS consent (warm) — TCPA provenance.
    await recordConsent({
      contact: from,
      channel: "SMS",
      status: "GRANTED",
      method: "inbound_reply",
      proof: { messageSid, at: new Date().toISOString() },
    });
    try {
      await inngest.send({ name: "seller.replied", data: { dealId: deal.id, contact: from, body } });
    } catch {
      /* event bus best-effort */
    }
  }

  // Generate AI reply if Groq is configured and we have deal context
  let reply = "";
  if (deal && isGroqConfigured()) {
    // Load last 6 messages for context
    const history = await prisma.sMS.findMany({
      where:   { dealId: deal.id },
      orderBy: { createdAt: "desc" },
      take:    6,
    });
    const historyText = history
      .reverse()
      .map((m) => `${m.direction === "INBOUND" ? "Seller" : "Us"}: ${m.message}`)
      .join("\n");

    try {
      reply = await groqGenerate({
        system: `You are a real estate wholesaler replying to a motivated seller via SMS.
Property: ${deal.address}, ${deal.city ?? "Houston"}, TX
Owner: ${deal.ownerName ?? "the seller"}
Deal situation: ${deal.situation ?? "motivated seller"}

Rules:
- Keep replies under 160 characters
- Be warm, professional, and human — not salesy
- Your goal: keep them engaged and move toward a call or offer
- If they ask for a price/offer: say "I'd love to get you a number! Can we hop on a quick 5-min call?"
- If they say not interested: acknowledge and leave the door open
- End every message with your name: "- Alex"
- Never include "Reply STOP to opt out" more than once per conversation`,

        prompt: `Conversation so far:\n${historyText}\n\nSeller just replied: "${body}"\n\nWrite a natural SMS reply:`,
        maxTokens: 100,
        temperature: 0.7,
      });
    } catch (e) {
      console.error("AI SMS reply failed:", e);
    }
  }

  // Default reply if AI fails or no deal found
  if (!reply) {
    reply = deal
      ? `Thanks for getting back to us! Can we schedule a quick call to discuss ${deal.address}? - Alex`
      : "Thanks for your message! We'll be in touch shortly. - Alex";
  }

  // Send reply via Twilio and save it
  if (deal) {
    try {
      const user = await prisma.user.findUnique({
        where:  { id: CURRENT_USER_ID },
        select: { twilioSid: true, twilioToken: true, twilioPhone: true },
      });

      if (user?.twilioSid && user.twilioToken) {
        const accountSid = decrypt(user.twilioSid);
        const authToken  = decrypt(user.twilioToken);
        const twilio     = (await import("twilio")).default;
        const client     = twilio(accountSid, authToken);

        const sent = await client.messages.create({
          body: reply,
          from: to,   // our Twilio number
          to:   from, // seller's number
        });

        await prisma.sMS.create({
          data: {
            deal:      { connect: { id: deal.id } },
            direction: "OUTBOUND",
            message:   reply,
            phone:     from,
            status:    "SENT",
            sentAt:    new Date(),
            twilioSid: sent.sid,
          },
        });

        await prisma.activity.create({
          data: {
            dealId:  deal.id,
            type:    "SMS_SENT",
            content: `🤖 AI replied: "${reply.slice(0, 200)}"`,
          },
        });
      }
    } catch (e) {
      console.error("Failed to send Twilio reply:", e);
    }
  }

  // Return empty TwiML — we already sent the reply programmatically above
  return twiml("");
}

function twiml(message: string): NextResponse {
  const xml = message
    ? `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(message)}</Message></Response>`
    : `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`;
  return new NextResponse(xml, {
    status:  200,
    headers: { "Content-Type": "text/xml" },
  });
}

function escapeXml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function markOptedOut(phone: string) {
  // Honor the opt-out everywhere, even in demo mode: revoke consent + add to DNC.
  await recordConsent({ contact: phone, channel: "SMS", status: "REVOKED", method: "stop_keyword" });
  await addDnc(phone, "INTERNAL");
  try {
    await inngest.send({ name: "consent.revoked", data: { contact: phone, channel: "SMS", method: "stop_keyword" } });
  } catch {
    /* event bus best-effort */
  }
  if (!(await isDbReady())) return;
  await prisma.deal.updateMany({
    where: { ownerPhone: phone, userId: CURRENT_USER_ID },
    data:  { optedOut: true },
  });
}
