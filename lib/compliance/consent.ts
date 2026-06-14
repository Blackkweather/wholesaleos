import "server-only";
import { prisma } from "@/lib/prisma";
import { isDbReady } from "@/lib/data/db";
import { kvGetRaw, kvSetRaw } from "@/lib/cache";
import type { Prisma } from "@prisma/client";

/**
 * Consent ledger with provenance. Every grant/revoke is recorded immutably; the
 * latest status per contact+channel is cached 1h (wos:consent:{contact}:{channel}).
 */

export type ConsentChannel = "SMS" | "EMAIL" | "CALL";
export type ConsentStatus = "GRANTED" | "REVOKED";
export type ConsentMethod = "inbound_reply" | "web_optin" | "imported_proof" | "stop_keyword" | "manual";

export function normalizeContact(contact: string, channel: ConsentChannel): string {
  return channel === "EMAIL" ? contact.trim().toLowerCase() : contact.replace(/\D/g, "");
}

const cacheKey = (contact: string, channel: ConsentChannel) => `wos:consent:${contact}:${channel}`;

export interface RecordConsentInput {
  contact: string;
  channel: ConsentChannel;
  status: ConsentStatus;
  method: ConsentMethod;
  proof?: Record<string, unknown>;
}

/** Append a consent record (with provenance) and refresh the status cache. */
export async function recordConsent(input: RecordConsentInput): Promise<void> {
  const contact = normalizeContact(input.contact, input.channel);
  if (!contact) return;

  if (await isDbReady()) {
    try {
      const data: Prisma.ConsentCreateInput = {
        contact,
        channel: input.channel,
        status: input.status,
        method: input.method,
      };
      if (input.proof) data.proof = input.proof as Prisma.InputJsonValue;
      await prisma.consent.create({ data });
    } catch {
      /* best-effort persist */
    }
  }
  try {
    await kvSetRaw(cacheKey(contact, input.channel), input.status, 3600);
  } catch {
    /* best-effort cache */
  }
}

/** Latest consent status for a contact+channel, or null if none on record. */
export async function getConsentStatus(contact: string, channel: ConsentChannel): Promise<ConsentStatus | null> {
  const c = normalizeContact(contact, channel);
  if (!c) return null;

  const cached = await kvGetRaw(cacheKey(c, channel));
  if (cached === "GRANTED" || cached === "REVOKED") return cached;

  if (!(await isDbReady())) return null;
  const row = await prisma.consent.findFirst({ where: { contact: c, channel }, orderBy: { createdAt: "desc" } });
  const status = (row?.status as ConsentStatus | undefined) ?? null;
  if (status) {
    try {
      await kvSetRaw(cacheKey(c, channel), status, 3600);
    } catch {
      /* best-effort */
    }
  }
  return status;
}

export async function hasGrantedConsent(contact: string, channel: ConsentChannel): Promise<boolean> {
  return (await getConsentStatus(contact, channel)) === "GRANTED";
}
