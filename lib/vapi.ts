import "server-only";
import { env, features } from "./env";
import type { DealView } from "@/types";

const VAPI_BASE = "https://api.vapi.ai";

export function isVapiConfigured(): boolean {
  return features.vapi;
}

// ---------------------------------------------------------------------------
// Smart number routing
// ---------------------------------------------------------------------------

function normalizePhone(phone: string): string {
  return phone.replace(/[\s\-().]/g, "");
}

/** US/Canada E.164 number: +1 followed by exactly 10 digits. */
export function isNorthAmerican(phone: string): boolean {
  return /^\+1\d{10}$/.test(normalizePhone(phone));
}

/**
 * Pick the right outbound caller ID:
 *  - US/Canada → Vapi's own free number (clean, no trial message, free)
 *  - International → imported Twilio number (Vapi free numbers can't dial intl)
 */
function pickPhoneNumberId(phone: string): string | undefined {
  if (isNorthAmerican(phone)) return env.VAPI_PHONE_NUMBER_ID;
  return env.VAPI_TWILIO_PHONE_NUMBER_ID ?? env.VAPI_PHONE_NUMBER_ID;
}

// ---------------------------------------------------------------------------
// Assistant persona — wholesaling acquisition agent
// ---------------------------------------------------------------------------

function buildAssistant(deal: DealView) {
  const firstName = deal.ownerName?.split(" ")[0] ?? "";
  const greeting  = firstName ? `Hi ${firstName}` : "Hi there";
  const address   = deal.address ?? "your property";

  return {
    firstMessage: `${greeting}, my name is Alex and I'm reaching out about your property at ${address}. Is this a good time to chat for just a minute?`,

    model: {
      provider: "groq",
      model:    "llama-3.3-70b-versatile",
      systemPrompt: `You are Alex, a professional real estate acquisitions agent for a local cash buying company.
You are calling about the property at ${address}.
Your goal: qualify the seller's motivation and interest in a cash offer. Keep it friendly, brief, and professional.

Qualification questions (ask naturally, one at a time):
1. Are they the owner of the property?
2. Are they open to selling?
3. What's their timeline? (urgent, a few months, not sure)
4. What price are they hoping for?
5. What's the situation? (inherited, behind on payments, moving, divorce, etc.)

If interested: "That's great! I'd love to have one of our team members follow up with you about a specific offer. Is it okay if I pass your info along?"
If not interested: "Absolutely, I completely understand. If anything changes in the future, feel free to reach out. Have a wonderful day!"
If they hang up or say stop: end the call politely.

Keep responses SHORT — under 2 sentences. This is a phone call, not a chat.
Never make up numbers or make offers on this call. Just qualify.`,
    },

    voice: {
      provider: "vapi",
      voiceId:  "Elliot",
    },

    endCallMessage:    "Have a wonderful day! Goodbye.",
    endCallPhrases:    ["goodbye", "not interested", "take me off", "don't call", "stop calling", "remove me"],
    maxDurationSeconds: 240, // 4 min max
    recordingEnabled:  true,

    // Send webhook when call ends
    serverUrl: env.PUBLIC_WEBHOOK_URL
      ? `${env.PUBLIC_WEBHOOK_URL}/api/webhooks/vapi`
      : undefined,
  };
}

// ---------------------------------------------------------------------------
// Make an outbound call
// ---------------------------------------------------------------------------

export interface VapiCallResult {
  callId: string;
  status: string;
}

export async function makeOutboundCall(deal: DealView): Promise<VapiCallResult | null> {
  if (!isVapiConfigured()) return null;
  if (!deal.ownerPhone) return null;

  const phoneNumberId = pickPhoneNumberId(deal.ownerPhone);
  const routedVia = isNorthAmerican(deal.ownerPhone) ? "Vapi (US, clean)" : "Twilio (international)";

  const body = {
    phoneNumberId,
    customer: {
      number: deal.ownerPhone,
      name:   deal.ownerName ?? undefined,
    },
    assistant: buildAssistant(deal),
    // Attach deal ID in metadata so webhook can look it up
    assistantOverrides: {
      metadata: { dealId: deal.id },
    },
  };

  try {
    const res = await fetch(`${VAPI_BASE}/call/phone`, {
      method:  "POST",
      headers: {
        "Content-Type":  "application/json",
        Authorization:   `Bearer ${env.VAPI_API_KEY}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => "");
      const msg = `Vapi ${res.status}: ${err.slice(0, 400)}`;
      console.error(`Vapi call failed for ${deal.address}:`, msg);
      throw new Error(msg);
    }

    const data = (await res.json()) as { id?: string; status?: string };
    const callId = data.id ?? "";
    console.log(`📞 Vapi call started for ${deal.address} → ${deal.ownerPhone} via ${routedVia} (callId=${callId})`);
    return { callId, status: data.status ?? "queued" };
  } catch (e) {
    console.error(`makeOutboundCall error for ${deal.address}:`, e instanceof Error ? e.message : e);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Fetch call transcript after it ends
// ---------------------------------------------------------------------------

export interface VapiTranscript {
  callId:     string;
  duration:   number;
  transcript: string;
  summary:    string;
  outcome:    "interested" | "not_interested" | "no_answer" | "callback_requested" | "unknown";
  endReason:  string;
}

export async function getCallTranscript(callId: string): Promise<VapiTranscript | null> {
  if (!isVapiConfigured()) return null;

  try {
    const res = await fetch(`${VAPI_BASE}/call/${callId}`, {
      headers: { Authorization: `Bearer ${env.VAPI_API_KEY}` },
    });
    if (!res.ok) return null;

    const data = (await res.json()) as {
      id?: string;
      status?: string;
      duration?: number;
      transcript?: string;
      summary?: string;
      endedReason?: string;
    };

    // Classify outcome from transcript keywords
    const t = (data.transcript ?? "").toLowerCase();
    let outcome: VapiTranscript["outcome"] = "unknown";
    if (data.status === "no-answer" || data.endedReason === "customer-did-not-answer") {
      outcome = "no_answer";
    } else if (t.includes("not interested") || t.includes("don't call") || t.includes("remove me")) {
      outcome = "not_interested";
    } else if (t.includes("call me back") || t.includes("call back") || t.includes("not a good time")) {
      outcome = "callback_requested";
    } else if (t.includes("yes") || t.includes("interested") || t.includes("offer") || t.includes("sure")) {
      outcome = "interested";
    }

    return {
      callId:     data.id ?? callId,
      duration:   data.duration ?? 0,
      transcript: data.transcript ?? "",
      summary:    data.summary ?? "",
      outcome,
      endReason:  data.endedReason ?? "",
    };
  } catch {
    return null;
  }
}
