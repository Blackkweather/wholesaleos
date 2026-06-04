import "server-only";
import { Resend } from "resend";
import { env, features } from "./env";
import type { DealView, BuyerView } from "@/types";

export const resend = features.resend ? new Resend(env.RESEND_API_KEY!) : null;

export const EMAIL_FROM =
  env.EMAIL_FROM ?? "WholesaleOS <onboarding@resend.dev>";

export function isResendConfigured(): boolean {
  return features.resend;
}

export interface SendEmailInput {
  to: string | string[];
  subject: string;
  html: string;
  replyTo?: string;
  text?: string;
}

// ---------------------------------------------------------------------------
// Email templates
// ---------------------------------------------------------------------------

function formatCur(n?: number | null) {
  if (!n) return "TBD";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

/** First outreach email to a motivated seller */
export async function sendSellerIntroEmail(deal: DealView): Promise<boolean> {
  if (!isResendConfigured() || !deal.ownerEmail) return false;
  const owner = deal.ownerName?.split(" ")[0] ?? "there";
  const { error } = await sendEmail({
    to: deal.ownerEmail,
    subject: `Quick question about ${deal.address}`,
    html: `<div style="font-family:Arial,sans-serif;max-width:540px;margin:0 auto;color:#222">
<p>Hi ${owner},</p>
<p>I came across your property at <strong>${deal.address}, ${deal.city ?? ""}</strong> and wanted to reach out.</p>
<p>We're local cash buyers who close quickly, buy <em>as-is</em>, and cover all closing costs — no repairs, no agent fees, no hassle.</p>
<p>If you'd be open to a <strong>no-obligation cash offer</strong>, simply reply to this email and I'll get you a number right away.</p>
<p>Best,<br/>WholesaleOS Acquisitions</p>
<hr style="border:none;border-top:1px solid #eee;margin:20px 0"/>
<p style="font-size:11px;color:#999">Reply STOP to opt out of future messages.</p>
</div>`,
  });
  if (error) console.error(`sendSellerIntroEmail error for ${deal.address}:`, error);
  return !error;
}

/** Deal alert email to a matched cash buyer */
export async function sendBuyerDealAlert(buyer: BuyerView, deal: DealView): Promise<boolean> {
  if (!isResendConfigured() || !buyer.email) return false;
  const buyerFirst = buyer.name?.split(" ")[0] ?? "there";
  const { error } = await sendEmail({
    to: buyer.email,
    subject: `🏠 New Deal: ${deal.address}, ${deal.city ?? "Houston"}`,
    html: `<div style="font-family:Arial,sans-serif;max-width:540px;margin:0 auto;color:#222">
<p>Hi ${buyerFirst},</p>
<p>A new deal just hit our pipeline that matches your buy criteria in <strong>${deal.city ?? "Houston"}, TX</strong>.</p>
<div style="background:#f9f9f9;border:1px solid #e5e5e5;border-radius:8px;padding:18px;margin:16px 0">
  <h2 style="margin:0 0 10px;font-size:17px">${deal.address}</h2>
  <table style="font-size:14px;border-collapse:collapse;width:100%">
    <tr><td style="padding:3px 0;color:#666">Type</td><td style="font-weight:600">${deal.dealType ?? "N/A"}</td></tr>
    <tr><td style="padding:3px 0;color:#666">ARV</td><td style="font-weight:600">${formatCur(deal.arv)}</td></tr>
    <tr><td style="padding:3px 0;color:#666">Asking</td><td style="font-weight:600">${formatCur(deal.offerPrice)}</td></tr>
    <tr><td style="padding:3px 0;color:#666">Est. profit</td><td style="font-weight:600;color:#16a34a">${formatCur(deal.profit)}</td></tr>
    ${deal.situation ? `<tr><td style="padding:3px 0;color:#666">Situation</td><td>${deal.situation}</td></tr>` : ""}
  </table>
</div>
<p>Reply to this email to express interest or request more details. We move fast.</p>
<p>Best,<br/>WholesaleOS Acquisitions</p>
<hr style="border:none;border-top:1px solid #eee;margin:20px 0"/>
<p style="font-size:11px;color:#999">Reply STOP to unsubscribe from deal alerts.</p>
</div>`,
  });
  if (error) console.error(`sendBuyerDealAlert error for ${buyer.name}:`, error);
  return !error;
}

/** Morning briefing email to yourself */
export async function sendDailyBriefingEmail(opts: {
  toEmail: string;
  briefingText: string;
  dealsFound: number;
  buyersFound: number;
}): Promise<boolean> {
  if (!isResendConfigured()) return false;
  const date = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric" }).format(new Date());
  const { error } = await sendEmail({
    to: opts.toEmail,
    subject: `WholesaleOS Morning Brief — ${date}`,
    html: `<div style="font-family:Arial,sans-serif;max-width:540px;margin:0 auto;color:#222">
<h1 style="font-size:22px;margin-bottom:4px">Good morning 👋</h1>
<p style="color:#888;font-size:13px">${date}</p>
<hr style="border:none;border-top:1px solid #eee;margin:16px 0"/>
<p style="font-size:15px;line-height:1.7">${opts.briefingText}</p>
<div style="display:flex;gap:32px;background:#f9f9f9;border-radius:8px;padding:16px;margin:20px 0">
  <div><div style="font-size:28px;font-weight:700">${opts.dealsFound}</div><div style="font-size:12px;color:#666">new deals</div></div>
  <div><div style="font-size:28px;font-weight:700">${opts.buyersFound}</div><div style="font-size:12px;color:#666">buyers scanned</div></div>
</div>
<a href="http://localhost:3000/dashboard" style="display:inline-block;background:#7c3aed;color:#fff;padding:10px 22px;border-radius:6px;text-decoration:none;font-size:14px">Open Dashboard →</a>
</div>`,
  });
  if (error) console.error("sendDailyBriefingEmail error:", error);
  return !error;
}

// ---------------------------------------------------------------------------

/** Send a transactional email. Returns {data,error}; no-op when unconfigured. */
export async function sendEmail(
  input: SendEmailInput,
): Promise<{ data: { id: string } | null; error: string | null }> {
  if (!resend) {
    return { data: null, error: "Email not configured (set RESEND_API_KEY)" };
  }
  try {
    const { data, error } = await resend.emails.send({
      from: EMAIL_FROM,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
      replyTo: input.replyTo,
    });
    if (error) return { data: null, error: error.message };
    return { data: data ? { id: data.id } : null, error: null };
  } catch (e) {
    return {
      data: null,
      error: e instanceof Error ? e.message : "Failed to send email",
    };
  }
}
