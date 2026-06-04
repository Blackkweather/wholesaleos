import "server-only";
import twilio from "twilio";

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
  opts?: { statusCallback?: string },
): Promise<{ data: { sid: string; status: string } | null; error: string | null }> {
  try {
    const client = getTwilioClient(creds);
    const message = await client.messages.create({
      from: creds.phone,
      to,
      body,
      statusCallback: opts?.statusCallback,
    });
    return { data: { sid: message.sid, status: message.status }, error: null };
  } catch (e) {
    return {
      data: null,
      error: e instanceof Error ? e.message : "Failed to send SMS",
    };
  }
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
