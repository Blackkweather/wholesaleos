import "server-only";
import { prisma } from "@/lib/prisma";
import { isDbReady } from "@/lib/data/db";
import { kvGetRaw, kvSetRaw } from "@/lib/cache";

/**
 * Do-Not-Call list. Phone contacts only. Cached 12h (wos:dnc:{contact}).
 * Fail-closed on a verification ERROR (block when we cannot confirm the contact
 * is clear); when no DB is configured at all (demo mode) sends are allowed.
 */

export type DncScope = "FEDERAL" | "STATE" | "INTERNAL";

const norm = (contact: string) => contact.replace(/\D/g, "");
const dncKey = (contact: string) => `wos:dnc:${contact}`;
const TTL = 12 * 60 * 60;

export async function isOnDnc(contact: string): Promise<boolean> {
  const c = norm(contact);
  if (!c) return false;

  try {
    const cached = await kvGetRaw(dncKey(c));
    if (cached === "1") return true;
    if (cached === "0") return false;
  } catch {
    /* cache miss → check DB */
  }

  try {
    if (!(await isDbReady())) return false; // demo mode: nothing to verify against
    const row = await prisma.dncEntry.findUnique({ where: { contact: c } });
    const on = Boolean(row);
    try {
      await kvSetRaw(dncKey(c), on ? "1" : "0", TTL);
    } catch {
      /* best-effort */
    }
    return on;
  } catch {
    return true; // verification failed → fail closed (block)
  }
}

export async function addDnc(contact: string, scope: DncScope = "INTERNAL"): Promise<void> {
  const c = norm(contact);
  if (!c) return;
  if (await isDbReady()) {
    try {
      await prisma.dncEntry.upsert({ where: { contact: c }, create: { contact: c, scope }, update: { scope } });
    } catch {
      /* best-effort */
    }
  }
  try {
    await kvSetRaw(dncKey(c), "1", TTL);
  } catch {
    /* best-effort */
  }
}

export async function removeDnc(contact: string): Promise<void> {
  const c = norm(contact);
  if (!c) return;
  if (await isDbReady()) {
    try {
      await prisma.dncEntry.deleteMany({ where: { contact: c } });
    } catch {
      /* best-effort */
    }
  }
  try {
    await kvSetRaw(dncKey(c), "0", TTL);
  } catch {
    /* best-effort */
  }
}
