import "server-only";
import { kvGetRaw, kvIncrBy, kvExpire } from "../cache";
import { enable as engageKillswitch, assertNotHalted, type KillCategory } from "./killswitch";

/**
 * Per-category daily spend caps. Spend accrues in Redis day buckets
 * (wos:budget:{cat}:{YYYYMMDD}, 36h TTL). At 80% a warning fires; at 100% the
 * category killswitch is engaged and BudgetExceeded is thrown. Guarded
 * integrations call checkAndIncr() before performing the external action.
 */

export type BudgetCategory = KillCategory; // AI | SMS | MAIL | DATA | EMAIL

const BUCKET_TTL_SECONDS = 36 * 60 * 60;
const WARN_RATIO = 0.8;

const CAP_ENV: Record<BudgetCategory, string> = {
  AI: "CAP_AI_CENTS",
  SMS: "CAP_SMS_CENTS",
  MAIL: "CAP_MAIL_CENTS",
  DATA: "CAP_DATA_CENTS",
  EMAIL: "CAP_EMAIL_CENTS",
};

const CAP_DEFAULT: Record<BudgetCategory, number> = {
  AI: 2000,
  SMS: 5000,
  MAIL: 10000,
  DATA: 1000,
  EMAIL: 500,
};

export class BudgetExceededError extends Error {
  readonly category: BudgetCategory;
  readonly spentCents: number;
  readonly capCents: number;
  constructor(category: BudgetCategory, spentCents: number, capCents: number) {
    super(`Daily ${category} budget exceeded (${spentCents}¢ / ${capCents}¢)`);
    this.name = "BudgetExceededError";
    this.category = category;
    this.spentCents = spentCents;
    this.capCents = capCents;
  }
}

/** Cap in cents, read from env at call time (defaults applied). */
export function capFor(category: BudgetCategory): number {
  const raw = process.env[CAP_ENV[category]];
  const n = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : CAP_DEFAULT[category];
}

function dayBucketKey(category: BudgetCategory, date = new Date()): string {
  const ymd = `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, "0")}${String(date.getUTCDate()).padStart(2, "0")}`;
  return `wos:budget:${category}:${ymd}`;
}

/** Best-effort system event (warn/halt). Never blocks the caller. */
async function emit(name: string, data: Record<string, unknown>): Promise<void> {
  try {
    const { inngest } = await import("@/inngest/client");
    const send = inngest.send as (e: { name: string; data: Record<string, unknown> }) => Promise<unknown>;
    await send({ name, data });
  } catch {
    /* event bus unavailable — non-fatal */
  }
}

/** Best-effort durable ledger row. */
async function writeLedger(category: BudgetCategory, costCents: number, ref?: string): Promise<void> {
  try {
    const { prisma } = await import("@/lib/prisma");
    const { isDbReady, CURRENT_USER_ID } = await import("@/lib/data/db");
    if (!(await isDbReady())) return;
    await prisma.spendLedger.create({
      data: { orgId: CURRENT_USER_ID, category, costCents: Math.round(costCents), ref: ref ?? null },
    });
  } catch {
    /* ledger is best-effort */
  }
}

/** Cents spent in this category today. */
export async function getSpend(category: BudgetCategory): Promise<number> {
  return Number((await kvGetRaw(dayBucketKey(category))) ?? 0);
}

export interface DailySpend {
  category: BudgetCategory;
  spentCents: number;
  capCents: number;
  pct: number;
  warn: boolean;
  halted: boolean;
}

/** Detailed daily spend for one category (for the admin surface). */
export async function getDailySpend(category: BudgetCategory): Promise<DailySpend> {
  const spentCents = await getSpend(category);
  const capCents = capFor(category);
  const pct = capCents > 0 ? spentCents / capCents : 0;
  return { category, spentCents, capCents, pct: Math.round(pct * 100) / 100, warn: pct >= WARN_RATIO, halted: pct >= 1 };
}

export interface CheckResult {
  allowed: true;
  spentCents: number;
  capCents: number;
  warned: boolean;
  halted: boolean;
}

/**
 * Reserve `costCents` against the category's daily cap. Throws when the category
 * is halted or already at/over cap; emits warn at 80% and halt at 100%.
 */
export async function checkAndIncr(category: BudgetCategory, costCents: number, ref?: string): Promise<CheckResult> {
  // Killswitch (global or category) blocks before any spend is recorded.
  await assertNotHalted(category);

  const cap = capFor(category);
  const key = dayBucketKey(category);
  const before = Number((await kvGetRaw(key)) ?? 0);

  if (before >= cap) {
    await emit("system.budget.halt", { category, spentCents: before, capCents: cap });
    await engageKillswitch(category);
    throw new BudgetExceededError(category, before, cap);
  }

  const cost = Math.max(0, Math.round(costCents));
  const after = await kvIncrBy(key, cost);
  await kvExpire(key, BUCKET_TTL_SECONDS);

  const warned = before < cap * WARN_RATIO && after >= cap * WARN_RATIO;
  const halted = after >= cap;
  if (warned) await emit("system.budget.warn", { category, spentCents: after, capCents: cap });
  if (halted) {
    await emit("system.budget.halt", { category, spentCents: after, capCents: cap });
    await engageKillswitch(category);
  }

  void writeLedger(category, cost, ref);
  return { allowed: true, spentCents: after, capCents: cap, warned, halted };
}
