import "server-only";
import { sendEmail, isResendConfigured } from "@/lib/resend";
import type { DealView } from "@/types";

/**
 * E-sign routing. Auto-fills the purchase agreement and routes it to the seller
 * to sign. NOTE: an AI never signs — the seller signs their copy, you countersign
 * yours. For a tracked signing ceremony + audit trail, set DROPBOX_SIGN_API_KEY
 * (provider integration point); otherwise it routes via email for review & signature.
 */

const BUYER = process.env.BUYER_LEGAL_NAME || "Mohammed Henna";

const money = (n?: number | null) =>
  n == null ? "$_______" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

export interface SendContractResult {
  sent: boolean;
  channel: "dropbox-sign" | "email" | "none";
  to?: string;
  error?: string;
}

function contractHtml(deal: DealView, price: number): string {
  return `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#222">
  <h2 style="margin-bottom:4px">Residential Purchase &amp; Sale Agreement</h2>
  <p style="color:#666;font-size:13px;margin-top:0">For signature — ${deal.address}, ${deal.city ?? ""} ${deal.state ?? ""}</p>
  <hr style="border:none;border-top:1px solid #eee"/>
  <p>Dear ${deal.ownerName?.split(" ")[1] ?? "Owner"},</p>
  <p>Thank you for working with me. As discussed, here are the agreed terms for the cash purchase of your property. Please review, sign where indicated, and reply — I'll countersign and we'll close at the title company.</p>
  <table style="width:100%;border-collapse:collapse;font-size:14px;margin:16px 0">
    <tr><td style="padding:6px 0;color:#666">Property</td><td style="font-weight:600">${deal.address}, ${deal.city ?? ""} ${deal.state ?? ""}</td></tr>
    <tr><td style="padding:6px 0;color:#666">Seller</td><td style="font-weight:600">${deal.ownerName ?? "________"}</td></tr>
    <tr><td style="padding:6px 0;color:#666">Buyer</td><td style="font-weight:600">${BUYER}, and/or assigns</td></tr>
    <tr><td style="padding:6px 0;color:#666">Purchase price</td><td style="font-weight:700;color:#16a34a">${money(price)}</td></tr>
    <tr><td style="padding:6px 0;color:#666">Terms</td><td>All cash, as-is, buyer pays closing costs, close on seller's timeline</td></tr>
  </table>
  <p style="font-size:13px;color:#444"><b>Texas disclosure:</b> Buyer is acquiring an equitable interest and may assign this contract. Buyer does not hold title and is acting as a principal, not a licensed broker.</p>
  <div style="margin-top:24px;display:flex;gap:40px">
    <div>SELLER<br/><br/>______________________<br/>${deal.ownerName ?? ""}<br/>Date: __________</div>
    <div>BUYER<br/><br/>______________________<br/>${BUYER}<br/>Date: __________</div>
  </div>
  <hr style="border:none;border-top:1px solid #eee;margin:24px 0"/>
  <p style="font-size:11px;color:#999">Reply to this email to accept, or with any questions. This is a draft agreement for your review and signature.</p>
</div>`;
}

export async function sendContractForSignature(deal: DealView, agreedPrice?: number): Promise<SendContractResult> {
  if (!deal.ownerEmail) {
    return { sent: false, channel: "none", error: "No seller email on file — run a skip trace first." };
  }
  const price = agreedPrice ?? deal.offerPrice ?? 0;

  // Provider integration point (tracked signing ceremony + audit trail).
  if (process.env.DROPBOX_SIGN_API_KEY) {
    // Reserved for Dropbox Sign / DocuSign — plug in here when a key is provided.
    // Falls through to email routing until then.
  }

  if (!isResendConfigured()) {
    return { sent: false, channel: "none", error: "Email not configured (set RESEND_API_KEY)." };
  }

  const { error } = await sendEmail({
    to: deal.ownerEmail,
    subject: `Purchase agreement for your review & signature — ${deal.address}`,
    html: contractHtml(deal, price),
  });
  if (error) return { sent: false, channel: "email", error };
  return { sent: true, channel: "email", to: deal.ownerEmail };
}
