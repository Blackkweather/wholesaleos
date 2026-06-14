import "server-only";
import { prisma } from "@/lib/prisma";
import { isDbReady } from "@/lib/data/db";
import type { Prisma } from "@prisma/client";

/**
 * Immutable audit trail. Every send decision and consent change is appended
 * here. There is intentionally no update/delete path — records are write-once.
 */

export interface AuditInput {
  actor: string; // userId | "system" | agent id
  action: string; // e.g. "send.sms.deny", "consent.revoke"
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
}

/** Append an audit record. Best-effort — never blocks the action it records. */
export async function recordAudit(input: AuditInput): Promise<void> {
  try {
    if (!(await isDbReady())) return;
    const data: Prisma.AuditLogCreateInput = {
      actor: input.actor,
      action: input.action,
      entityId: input.entityId ?? null,
    };
    if (input.before !== undefined) data.before = input.before as Prisma.InputJsonValue;
    if (input.after !== undefined) data.after = input.after as Prisma.InputJsonValue;
    await prisma.auditLog.create({ data });
  } catch {
    /* audit is best-effort */
  }
}

/** Recent audit records (newest first). */
export async function listAudit(limit = 100, action?: string) {
  if (!(await isDbReady())) return [];
  return prisma.auditLog.findMany({
    where: action ? { action } : undefined,
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(limit, 1), 500),
  });
}
