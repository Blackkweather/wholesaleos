import "server-only";
import { prisma } from "@/lib/prisma";
import { isDbReady } from "./db";
import { listDeals } from "./deals";
import type { DealView } from "@/types";

/** Cadence (days after first contact) for follow-ups #1..#5 on no-response leads. */
export const FOLLOWUP_CADENCE_DAYS = [3, 7, 14, 30, 60];
const DAY = 24 * 60 * 60 * 1000;

export interface FollowUpItem {
  deal: DealView;
  step: number;          // which follow-up is due (1..5)
  dueDate: string;       // ISO
  overdueDays: number;
  priority: number;      // 1 = highest
  priorityLabel: string;
}

/** When the next follow-up is due, anchored on dateContacted + cadence[followUpStep]. */
function nextDueDate(d: DealView): Date | null {
  if (!d.dateContacted) return null;
  const step = d.followUpStep; // 0 = first follow-up not yet sent
  if (step >= FOLLOWUP_CADENCE_DAYS.length) return null; // cadence exhausted
  return new Date(new Date(d.dateContacted).getTime() + FOLLOWUP_CADENCE_DAYS[step] * DAY);
}

/** Priority: 1) interested  2) previous responders  3) hot  4) everyone else. */
function priorityOf(d: DealView): { p: number; label: string } {
  if (d.stage === "INTERESTED") return { p: 1, label: "Interested seller" };
  if (d.firstResponseDate) return { p: 2, label: "Previous responder" };
  if (d.hot) return { p: 3, label: "Hot lead" };
  return { p: 4, label: "Standard" };
}

const PARKED = new Set(["CLOSED", "DEAD", "ASSIGNED", "CONTRACT_SIGNED"]);

/**
 * The Follow-Up Queue: contacted leads that haven't converted and are due (or
 * overdue) for their next touch, sorted by priority then most-overdue first.
 */
export async function getFollowUpQueue(opts: { dueOnly?: boolean } = {}): Promise<FollowUpItem[]> {
  const deals = await listDeals();
  const now = Date.now();
  const items: FollowUpItem[] = [];

  for (const d of deals) {
    if (d.optedOut || PARKED.has(d.stage) || !d.dateContacted) continue;
    const due = nextDueDate(d);
    if (!due) continue;
    const isDue = due.getTime() <= now;
    if (opts.dueOnly && !isDue) continue;
    const { p, label } = priorityOf(d);
    items.push({
      deal: d,
      step: d.followUpStep + 1,
      dueDate: due.toISOString(),
      overdueDays: Math.max(0, Math.floor((now - due.getTime()) / DAY)),
      priority: p,
      priorityLabel: label,
    });
  }

  items.sort((a, b) => a.priority - b.priority || b.overdueDays - a.overdueDays);
  return items;
}

/** Count due today/overdue — for the dashboard badge. */
export async function countFollowUpsDue(): Promise<number> {
  return (await getFollowUpQueue({ dueOnly: true })).length;
}

/** Advance a lead's follow-up step after an approved send, and schedule the next. */
export async function markFollowUpSent(dealId: string): Promise<boolean> {
  if (!(await isDbReady())) return false;
  const d = await prisma.deal.findUnique({ where: { id: dealId } });
  if (!d) return false;

  const nextStep = (d.followUpStep ?? 0) + 1;
  const anchor = d.dateContacted ?? new Date();
  const nextDue =
    nextStep < FOLLOWUP_CADENCE_DAYS.length
      ? new Date(new Date(anchor).getTime() + FOLLOWUP_CADENCE_DAYS[nextStep] * DAY)
      : null;

  await prisma.deal.update({
    where: { id: dealId },
    data: { followUpStep: nextStep, lastContactAt: new Date(), nextFollowUpAt: nextDue },
  });
  await prisma.activity.create({
    data: { dealId, type: "SMS_SENT", content: `📨 Follow-up #${nextStep} approved & logged.` },
  });
  return true;
}
