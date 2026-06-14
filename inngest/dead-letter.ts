import "server-only";

/**
 * Dead-letter support for Inngest. When a function exhausts its retries the
 * onFailure handler captures the event + error into the DeadLetter table and
 * emits system.deadletter. The admin surface can replay a row, which re-sends
 * the original event and increments its attempt count.
 *
 * prisma / inngest are imported dynamically so the pure helpers can be unit
 * tested under plain Node without resolving Next path aliases.
 */

export interface DeadLetterInput {
  event: string;
  payload: unknown;
  error: string;
}

export interface DeadLetterRecord {
  event: string;
  payload: unknown;
  error: string;
  attempts: number;
}

/** Build the row to persist for a failed execution. Pure — testable. */
export function buildDeadLetterRecord(input: DeadLetterInput, priorAttempts = 0): DeadLetterRecord {
  return {
    event: input.event,
    payload: input.payload ?? {},
    error: input.error.slice(0, 2000),
    attempts: priorAttempts,
  };
}

/** Attempt counter advance on replay. Pure — testable. */
export function nextAttempt(current: number): number {
  return current + 1;
}

/** Persist a failed execution and emit system.deadletter. Best-effort. */
export async function captureDeadLetter(input: DeadLetterInput): Promise<string | null> {
  try {
    const { prisma } = await import("@/lib/prisma");
    const { isDbReady } = await import("@/lib/data/db");
    if (!(await isDbReady())) return null;
    const record = buildDeadLetterRecord(input);
    const row = await prisma.deadLetter.create({
      data: {
        event: record.event,
        payload: record.payload as object,
        error: record.error,
        attempts: record.attempts,
      },
    });
    try {
      const { inngest } = await import("./client");
      await inngest.send({ name: "system.deadletter", data: { id: row.id, event: record.event } });
    } catch {
      /* event emit is best-effort */
    }
    return row.id;
  } catch {
    return null;
  }
}

export interface ReplayResult {
  ok: boolean;
  attempts: number;
  error?: string;
}

/** Re-emit a dead-lettered event and bump its attempt count. */
export async function replayDeadLetter(id: string): Promise<ReplayResult> {
  try {
    const { prisma } = await import("@/lib/prisma");
    const { isDbReady } = await import("@/lib/data/db");
    if (!(await isDbReady())) return { ok: false, attempts: 0, error: "Database not available" };

    const row = await prisma.deadLetter.findUnique({ where: { id } });
    if (!row) return { ok: false, attempts: 0, error: "Dead-letter row not found" };

    const { inngest } = await import("./client");
    const send = inngest.send as (e: { name: string; data: Record<string, unknown> }) => Promise<unknown>;
    await send({ name: row.event, data: (row.payload ?? {}) as Record<string, unknown> });

    const attempts = nextAttempt(row.attempts);
    await prisma.deadLetter.update({ where: { id }, data: { attempts } });
    return { ok: true, attempts };
  } catch (e) {
    return { ok: false, attempts: 0, error: e instanceof Error ? e.message : "Replay failed" };
  }
}
