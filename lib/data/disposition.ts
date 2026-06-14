import "server-only";
import { prisma } from "@/lib/prisma";
import { CURRENT_USER_ID } from "@/lib/data/db";
import { updateDeal } from "@/lib/data/deals";
import { sendEmail, isResendConfigured } from "@/lib/resend";
import type { DealView } from "@/types";
import type { DispoStatus } from "@prisma/client";

/**
 * Disposition — send a deal to your cash buyers (the step that earns the
 * assignment fee). Builds a buyer-facing deal sheet showing THEIR price
 * (your contract price + your assignment fee) and THEIR potential spread,
 * then emails the selected buyers. Human-approved: only runs when you click
 * "Send to buyers", and only goes to your own consented buyer list.
 */

const SENDER_NAME = process.env.BUYER_LEGAL_NAME || process.env.LOB_FROM_NAME || "Acquisitions";
const REPLY_TO = process.env.OWNER_EMAIL || undefined;
const SENDER_PHONE = process.env.SENDER_PHONE || "";

const money = (n?: number | null) =>
  n == null ? "TBD" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

export interface DispoResult {
  sent: number;
  failed: number;
  recipients: string[];
  /** Price presented to buyers (contract price + assignment fee). */
  buyerPrice: number;
  error?: string;
}

function dealSheetHtml(deal: DealView, buyerFirst: string, price: number, buyerProfit: number, repairs: number): string {
  return `
<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a">
  <p>Hi ${buyerFirst},</p>
  <p>Off-market deal that fits your buy box — cash, as-is, quick close:</p>
  <div style="border:1px solid #e5e5e5;border-radius:10px;padding:20px;margin:16px 0;background:#fafafa">
    <h2 style="margin:0 0 2px;font-size:18px">${deal.address}</h2>
    <p style="margin:0 0 14px;color:#666;font-size:13px">${deal.city ?? ""}${deal.state ? ", " + deal.state : ""} ${deal.zipCode ?? ""}</p>
    <table style="width:100%;font-size:14px;border-collapse:collapse">
      <tr><td style="padding:5px 0;color:#666">Your price</td><td style="text-align:right;font-weight:700">${money(price)}</td></tr>
      <tr><td style="padding:5px 0;color:#666">ARV (after-repair value)</td><td style="text-align:right;font-weight:600">${money(deal.arv)}</td></tr>
      <tr><td style="padding:5px 0;color:#666">Est. repairs</td><td style="text-align:right;font-weight:600">${repairs > 0 ? money(repairs) : "TBD"}</td></tr>
      <tr style="border-top:1px solid #e5e5e5"><td style="padding:8px 0 0;color:#16a34a;font-weight:600">Your potential spread</td><td style="padding:8px 0 0;text-align:right;font-weight:700;color:#16a34a">${money(buyerProfit)}</td></tr>
    </table>
    ${deal.situation ? `<p style="margin:14px 0 0;font-size:13px;color:#444"><b>Situation:</b> ${deal.situation}</p>` : ""}
  </div>
  <p>First to commit locks it up. Reply to this email${SENDER_PHONE ? ` or call/text ${SENDER_PHONE}` : ""} and it's yours.</p>
  <p style="margin-top:18px">— ${SENDER_NAME}</p>
  <hr style="border:none;border-top:1px solid #eee;margin:20px 0"/>
  <p style="font-size:11px;color:#999">You're on our cash-buyer list. Reply STOP to opt out of deal alerts.</p>
</div>`;
}

export async function sendDealToBuyers(deal: DealView, buyerIds: string[]): Promise<DispoResult> {
  const repairs = deal.repairCost ?? 0;
  const assignmentFee = deal.assignmentFee ?? 10000;
  const buyerPrice = Math.max(0, (deal.offerPrice ?? 0) + assignmentFee);
  const buyerProfit = (deal.arv ?? 0) - buyerPrice - repairs;
  const base: DispoResult = { sent: 0, failed: 0, recipients: [], buyerPrice };

  if (!isResendConfigured()) return { ...base, error: "Email isn't configured (set RESEND_API_KEY)." };
  if (!buyerIds?.length) return { ...base, error: "No buyers selected." };

  const buyers = await prisma.buyer.findMany({
    where: { id: { in: buyerIds }, userId: CURRENT_USER_ID, email: { not: null } },
    select: { id: true, name: true, email: true },
  });
  if (buyers.length === 0) return { ...base, error: "None of the selected buyers have an email on file." };

  let sent = 0, failed = 0;
  const recipients: string[] = [];
  for (const b of buyers) {
    const first = b.name?.split(" ")[0] || "there";
    const { error } = await sendEmail({
      to: b.email!,
      replyTo: REPLY_TO,
      subject: `Off-market deal — ${deal.address}, ${deal.city ?? ""} (${money(buyerPrice)})`,
      html: dealSheetHtml(deal, first, buyerPrice, buyerProfit, repairs),
      // Buyers are the operator's own consented list (warm); opt-out is still honored.
      idempotencyKey: `dispo:${deal.id}:${b.id}`,
      compliance: { warm: true, humanInitiated: true, dealId: deal.id, actor: "system" },
    });
    if (error) { failed++; continue; }
    sent++;
    recipients.push(b.email!);
    // Record the send for the disposition tracker (keep status if re-sent)
    try {
      await prisma.dealBuyer.upsert({
        where: { dealId_buyerId: { dealId: deal.id, buyerId: b.id } },
        create: { dealId: deal.id, buyerId: b.id, status: "SENT" },
        update: { sentAt: new Date() },
      });
    } catch { /* non-fatal */ }
  }
  return { ...base, sent, failed, recipients };
}

export interface DispoRow {
  id: string;
  buyerId: string;
  name: string;
  email: string | null;
  phone: string | null;
  status: DispoStatus;
  sentAt: string;
}

/** Buyers this deal was sent to, with their current disposition status. */
export async function getDispoForDeal(dealId: string): Promise<DispoRow[]> {
  const rows = await prisma.dealBuyer.findMany({
    where: { dealId },
    include: { buyer: { select: { id: true, name: true, company: true, email: true, phone: true } } },
    orderBy: { sentAt: "desc" },
  });
  return rows.map((r) => ({
    id: r.id,
    buyerId: r.buyerId,
    name: r.buyer.company || r.buyer.name,
    email: r.buyer.email,
    phone: r.buyer.phone,
    status: r.status,
    sentAt: r.sentAt.toISOString(),
  }));
}

export interface DispoSummary {
  /** Distinct deals out to buyers and not yet assigned. */
  dealsOut: number;
  /** Total active buyer touches (SENT + INTERESTED). */
  buyersEngaged: number;
  /** Buyers who've signaled interest. */
  interested: number;
  /** Distinct deals already assigned to a buyer. */
  assigned: number;
  /** Deals waiting on you to pick a buyer (most interest first). */
  awaitingAssignment: { dealId: string; address: string; sent: number; interested: number }[];
}

/** Pipeline-wide disposition snapshot for the executive view. */
export async function getDispoSummary(): Promise<DispoSummary> {
  const rows = await prisma.dealBuyer.findMany({
    where: { deal: { userId: CURRENT_USER_ID } },
    include: { deal: { select: { id: true, address: true } } },
  });

  const byDeal = new Map<string, { address: string; sent: number; interested: number; assigned: number }>();
  let interested = 0;
  for (const r of rows) {
    const d = byDeal.get(r.dealId) ?? { address: r.deal.address, sent: 0, interested: 0, assigned: 0 };
    if (r.status === "SENT") d.sent++;
    else if (r.status === "INTERESTED") { d.interested++; interested++; }
    else if (r.status === "ASSIGNED") d.assigned++;
    byDeal.set(r.dealId, d);
  }

  let dealsOut = 0, assigned = 0, buyersEngaged = 0;
  const awaiting: DispoSummary["awaitingAssignment"] = [];
  for (const [dealId, d] of Array.from(byDeal.entries())) {
    const active = d.sent + d.interested;
    buyersEngaged += active;
    if (d.assigned > 0) {
      assigned++;
    } else if (active > 0) {
      dealsOut++;
      awaiting.push({ dealId, address: d.address, sent: d.sent, interested: d.interested });
    }
  }
  awaiting.sort((a, b) => b.interested - a.interested || b.sent - a.sent);

  return { dealsOut, buyersEngaged, interested, assigned, awaitingAssignment: awaiting.slice(0, 8) };
}

/**
 * Update a buyer's disposition status. Assigning one buyer marks every other
 * still-open buyer as PASSED and advances the deal to the ASSIGNED stage.
 */
export async function setDispoStatus(dealId: string, buyerId: string, status: DispoStatus): Promise<boolean> {
  try {
    await prisma.dealBuyer.update({
      where: { dealId_buyerId: { dealId, buyerId } },
      data: { status },
    });
    if (status === "ASSIGNED") {
      await prisma.dealBuyer.updateMany({
        where: { dealId, buyerId: { not: buyerId }, status: { in: ["SENT", "INTERESTED"] } },
        data: { status: "PASSED" },
      });
      await updateDeal(dealId, { stage: "ASSIGNED" });
    }
    return true;
  } catch {
    return false;
  }
}
