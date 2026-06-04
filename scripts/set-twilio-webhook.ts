/**
 * Sets the Twilio inbound SMS webhook URL directly via REST API.
 * Bypasses the Twilio console A2P 10DLC block.
 * Usage: npx tsx scripts/set-twilio-webhook.ts
 */
import { PrismaClient } from "@prisma/client";
import { createDecipheriv, createHash } from "crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// ── Load .env into process.env (standalone scripts don't get Next's loader) ──
function loadEnv() {
  try {
    const raw = readFileSync(resolve(process.cwd(), ".env"), "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (!m) continue;
      let val = m[2].trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
      if (process.env[m[1]] === undefined) process.env[m[1]] = val;
    }
  } catch { /* rely on system env */ }
}

// ── Decrypt mirroring lib/encrypt.ts exactly: "ivB64:tagB64:dataB64" ─────────
function decrypt(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split(":");
  if (!ivB64 || !tagB64 || !dataB64) throw new Error("Malformed ciphertext (expected iv:tag:data)");
  const key = createHash("sha256").update(process.env.ENCRYPTION_KEY ?? "insecure-development-key").digest();
  const dec = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
  dec.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([dec.update(Buffer.from(dataB64, "base64")), dec.final()]).toString("utf8");
}

async function main() {
  loadEnv();

  const WEBHOOK_URL = (process.env.PUBLIC_WEBHOOK_URL ?? "").replace(/\/$/, "");
  if (!WEBHOOK_URL) {
    console.error("❌ PUBLIC_WEBHOOK_URL is not set (.env or env var).");
    console.error("   Start the tunnel (npm run tunnel), then set PUBLIC_WEBHOOK_URL to the https URL it prints.");
    process.exit(1);
  }
  const SMS_WEBHOOK = `${WEBHOOK_URL}/api/webhooks/sms-inbound`;
  console.log(`🎯 Target webhook: ${SMS_WEBHOOK}`);

  const p = new PrismaClient();
  const user = await p.user.findUnique({
    where: { id: "solo-user" },
    select: { twilioSid: true, twilioToken: true, twilioPhone: true },
  });

  if (!user?.twilioSid || !user.twilioToken || !user.twilioPhone) {
    console.error("❌ No Twilio credentials in DB. Run onboarding first.");
    process.exit(1);
  }

  const accountSid = decrypt(user.twilioSid);
  const authToken  = decrypt(user.twilioToken);
  const phone      = user.twilioPhone; // e.g. +14246993912

  // Look up the IncomingPhoneNumber SID for this number
  const listUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(phone)}`;
  const auth    = Buffer.from(`${accountSid}:${authToken}`).toString("base64");

  const listRes  = await fetch(listUrl, { headers: { Authorization: `Basic ${auth}` } });
  const listData = await listRes.json() as { incoming_phone_numbers?: { sid: string; phone_number: string }[] };

  const numbers = listData.incoming_phone_numbers ?? [];
  if (numbers.length === 0) {
    console.error("❌ Phone number not found in Twilio account:", phone);
    process.exit(1);
  }

  const numberSid = numbers[0].sid;
  console.log(`📞 Found number ${phone} → SID: ${numberSid}`);

  // Update the SMS webhook URL
  const updateUrl  = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/IncomingPhoneNumbers/${numberSid}.json`;
  const body       = new URLSearchParams({ SmsUrl: SMS_WEBHOOK, SmsMethod: "POST" });

  const updateRes  = await fetch(updateUrl, {
    method:  "POST",
    headers: {
      Authorization:  `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  const updated = await updateRes.json() as { sid?: string; sms_url?: string };

  if (updateRes.ok) {
    console.log(`\n✅ Webhook set successfully!`);
    console.log(`   Number : ${phone}`);
    console.log(`   SmsUrl : ${updated.sms_url}`);
    console.log(`\nSellers who text your number will now get AI replies automatically.`);
  } else {
    console.error("❌ Failed to set webhook:", updated);
  }

  await p.$disconnect();
}

main().catch(console.error);
