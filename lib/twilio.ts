import "server-only";
import twilio from "twilio";
import { checkAndIncr } from "./reliability/budget";
import { withBreaker } from "./reliability/breaker";
import { withIdempotency } from "./reliability/idempotency";
import { canSend, type SendContext } from "./compliance/guard";

/**
 * Twilio is a per-user (BYO) integration. Credentials are stored encrypted on
 * the User row and decrypted just before use — never held app-wide.
 */
export interface TwilioCreds {
  sid: string;
  token: string;
  phone: string;
}

export function getTwilioClient(creds: TwilioCreds) {
  return twilio(creds.sid, creds.token);
}

export async function sendSms(
  creds: TwilioCreds,
  to: string,
  body: string,
  opts?: { statusCallback?: string; idempotencyKey?: string; compliance?: SendContext },
): Promise<{ data: { sid: string; status: string } | null; error: string | null }> {
  // Compliance gate (opt-out + DNC always; channel + quiet hours when context given).
  const gate = await canSend("SMS", to, opts?.compliance);
  if (!gate.allow) return { data: null, error: `Blocked by compliance: ${gate.reason}` };

  // Killswitch + daily SMS budget. Block → return an error (contract preserved).
  try {
    await checkAndIncr("SMS", 1, "twilio");
  } catch (e) {
    return { data: null, error: e instanceof Error ? e.message : "SMS blocked" };
  }

  const doSend = async (): Promise<{ data: { sid: string; status: string } | null; error: string | null }> => {
    try {
      const sent = await withBreaker("twilio", async () => {
        const client = getTwilioClient(creds);
        const message = await client.messages.create({
          from: creds.phone,
          to,
          body,
          statusCallback: opts?.statusCallback,
        });
        return { sid: message.sid, status: message.status };
      });
      return { data: sent, error: null };
    } catch (e) {
      return { data: null, error: e instanceof Error ? e.message : "Failed to send SMS" };
    }
  };

  if (opts?.idempotencyKey) return withIdempotency(`sms:${opts.idempotencyKey}`, doSend);
  return doSend();
}

/** Validate that an inbound webhook request genuinely came from Twilio. */
export function validateTwilioSignature(
  authToken: string,
  signature: string,
  url: string,
  params: Record<string, string>,
): boolean {
  try {
    return twilio.validateRequest(authToken, signature, url, params);
  } catch {
    return false;
  }
}
