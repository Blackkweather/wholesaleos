import "server-only";
import { isOnDnc } from "./dnc";
import { getConsentStatus, hasGrantedConsent, type ConsentChannel } from "./consent";
import { isWithinSendWindow, DEFAULT_TIMEZONE } from "./quiet-hours";
import { recordAudit } from "./audit";

/**
 * The compliance gate. canSend() runs before every outbound send. It enforces:
 *   - opt-out (revoked consent) on every channel
 *   - DNC on SMS/CALL
 *   - channel rules: cold SMS/CALL must be human-initiated (TCPA); MAIL/EMAIL ok
 *   - quiet hours for SMS/CALL
 *
 * Every decision is written to the immutable audit log; denials emit
 * compliance.blocked. The pure rule core (evaluateSend) is unit-tested.
 */

export type SendChannel = "SMS" | "EMAIL" | "CALL" | "MAIL";

export interface SendContext {
  warm?: boolean; // seller opted in / replied. Looked up when omitted.
  humanInitiated?: boolean; // default true (existing flows are human-approved)
  timezone?: string;
  dealId?: string;
  actor?: string;
}

export interface SendDecision {
  allow: boolean;
  reason: string;
}

export interface EvaluateInput {
  channel: SendChannel;
  onDnc: boolean;
  revoked: boolean;
  warm: boolean;
  humanInitiated: boolean;
  withinWindow: boolean;
}

/** Pure rule core. Exported for direct testing. */
export function evaluateSend(i: EvaluateInput): SendDecision {
  if (i.revoked) return { allow: false, reason: "Recipient has opted out" };
  if ((i.channel === "SMS" || i.channel === "CALL") && i.onDnc) {
    return { allow: false, reason: "Recipient is on the Do-Not-Call list" };
  }
  if (i.channel === "MAIL" || i.channel === "EMAIL") return { allow: true, reason: "Allowed" };
  if (!i.warm && !i.humanInitiated) {
    return { allow: false, reason: "Cold SMS/calls must be human-initiated (TCPA)" };
  }
  if (!i.withinWindow) return { allow: false, reason: "Outside contact hours (8am–9pm local)" };
  return { allow: true, reason: "Allowed" };
}

function normalize(contact: string, channel: SendChannel): string {
  if (channel === "EMAIL") return contact.trim().toLowerCase();
  if (channel === "MAIL") return contact.trim();
  return contact.replace(/\D/g, "");
}

async function emitBlocked(channel: SendChannel, contact: string, reason: string): Promise<void> {
  try {
    const { inngest } = await import("@/inngest/client");
    const send = inngest.send as (e: { name: string; data: Record<string, unknown> }) => Promise<unknown>;
    await send({ name: "compliance.blocked", data: { channel, contact, reason } });
  } catch {
    /* event bus best-effort */
  }
}

/**
 * Decide whether a send may proceed. When `context` is omitted only the always-on
 * floor (opt-out + DNC) is enforced; pass a context to apply the full channel +
 * quiet-hours rules.
 */
export async function canSend(channel: SendChannel, contact: string, context?: SendContext): Promise<SendDecision> {
  const c = normalize(contact, channel);
  const consentChannel: ConsentChannel = channel === "CALL" ? "CALL" : channel === "SMS" ? "SMS" : "EMAIL";

  const onDnc = channel === "SMS" || channel === "CALL" ? await isOnDnc(c) : false;
  const revoked = channel !== "MAIL" ? (await getConsentStatus(c, consentChannel)) === "REVOKED" : false;

  let warm = true;
  let humanInitiated = true;
  let withinWindow = true;
  if (context) {
    humanInitiated = context.humanInitiated ?? true;
    warm = context.warm ?? (channel !== "MAIL" ? await hasGrantedConsent(c, consentChannel) : true);
    if (channel === "SMS" || channel === "CALL") {
      withinWindow = isWithinSendWindow(new Date(), context.timezone ?? DEFAULT_TIMEZONE);
    }
  }

  const decision = evaluateSend({ channel, onDnc, revoked, warm, humanInitiated, withinWindow });

  await recordAudit({
    actor: context?.actor ?? "system",
    action: `send.${channel.toLowerCase()}.${decision.allow ? "allow" : "deny"}`,
    entityId: context?.dealId ?? null,
    after: { contact: c, reason: decision.reason },
  });
  if (!decision.allow) await emitBlocked(channel, c, decision.reason);

  return decision;
}
