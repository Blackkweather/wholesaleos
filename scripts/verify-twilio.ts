/**
 * Verify the Twilio connection is live.
 * Reads the encrypted credentials from the DB (same format as lib/encrypt.ts),
 * decrypts them, and pings Twilio's REST API to confirm:
 *   1. The account SID + auth token are valid (account is reachable & active)
 *   2. The saved phone number is actually owned by that account
 *   3. The number is SMS-capable
 *
 * Usage: npx tsx scripts/verify-twilio.ts
 */
import { PrismaClient } from "@prisma/client";
import { createDecipheriv, createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// ── Load .env into process.env (standalone scripts don't get Next's loader) ──
function loadEnv() {
  try {
    const raw = readFileSync(resolve(process.cwd(), ".env"), "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (!m) continue;
      const key = m[1];
      let val = m[2].trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = val;
    }
  } catch {
    /* no .env — rely on system env */
  }
}

// ── Decrypt mirroring lib/encrypt.ts exactly: "ivB64:tagB64:dataB64" ─────────
function decrypt(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split(":");
  if (!ivB64 || !tagB64 || !dataB64) throw new Error("Malformed ciphertext (expected iv:tag:data)");
  const key = createHash("sha256").update(process.env.ENCRYPTION_KEY ?? "insecure-development-key").digest();
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
}

async function main() {
  loadEnv();
  const p = new PrismaClient();

  let user;
  try {
    user = await p.user.findUnique({
      where: { id: "solo-user" },
      select: { twilioSid: true, twilioToken: true, twilioPhone: true },
    });
  } catch (e) {
    console.error("❌ Could not reach the database:", e instanceof Error ? e.message : e);
    console.error("   (Twilio creds live in the DB — start Postgres / check DATABASE_URL.)");
    await p.$disconnect();
    process.exit(1);
  }

  if (!user?.twilioSid || !user.twilioToken || !user.twilioPhone) {
    console.log("\n⚠️  Twilio is NOT connected.");
    console.log("   Missing:", [
      !user?.twilioSid && "account SID",
      !user?.twilioToken && "auth token",
      !user?.twilioPhone && "phone number",
    ].filter(Boolean).join(", ") || "—");
    console.log("\n   → Connect it in the app: Settings → Twilio, or re-run onboarding.");
    console.log("   Until then, the automated SMS drip stays off (manual texting still works).");
    await p.$disconnect();
    return;
  }

  let sid: string, token: string;
  try {
    sid = decrypt(user.twilioSid);
    token = decrypt(user.twilioToken);
  } catch (e) {
    console.error("\n❌ Found stored creds but could NOT decrypt them:", e instanceof Error ? e.message : e);
    console.error("   The ENCRYPTION_KEY in .env likely changed since they were saved.");
    console.error("   → Re-enter Twilio in Settings to re-encrypt with the current key.");
    await p.$disconnect();
    process.exit(1);
  }

  const phone = user.twilioPhone;
  const auth = Buffer.from(`${sid}:${token}`).toString("base64");
  const sidMasked = sid.length > 10 ? `${sid.slice(0, 6)}…${sid.slice(-4)}` : sid;
  console.log(`\n🔎 Verifying Twilio…`);
  console.log(`   Account SID : ${sidMasked}`);
  console.log(`   From number : ${phone}`);

  // 1) Validate account (SID + token)
  const acctRes = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}.json`, {
    headers: { Authorization: `Basic ${auth}` },
  });
  if (!acctRes.ok) {
    const body = await acctRes.text();
    console.error(`\n❌ Twilio rejected the credentials (HTTP ${acctRes.status}).`);
    console.error(`   ${body.slice(0, 200)}`);
    console.error("   → The SID or auth token is wrong/rotated. Re-enter them in Settings.");
    await p.$disconnect();
    process.exit(1);
  }
  const acct = (await acctRes.json()) as { friendly_name?: string; status?: string; type?: string };
  console.log(`\n✅ Credentials valid.`);
  console.log(`   Account     : ${acct.friendly_name ?? "—"}`);
  console.log(`   Status      : ${acct.status ?? "—"}   Type: ${acct.type ?? "—"}`);
  if (acct.status && acct.status !== "active") {
    console.log(`   ⚠️  Account status is "${acct.status}" — sends may be blocked until active.`);
  }
  if (acct.type && /trial/i.test(acct.type)) {
    console.log(`   ⚠️  TRIAL account — can only text VERIFIED numbers, and messages carry a trial prefix.`);
  }

  // 2) Confirm the number is owned + SMS-capable
  const numRes = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(phone)}`,
    { headers: { Authorization: `Basic ${auth}` } },
  );
  const numData = (await numRes.json()) as {
    incoming_phone_numbers?: { phone_number: string; capabilities?: { sms?: boolean; voice?: boolean }; sms_url?: string }[];
  };
  const num = numData.incoming_phone_numbers?.[0];
  if (!num) {
    console.error(`\n❌ The number ${phone} is NOT in this Twilio account.`);
    console.error("   → Fix the number in Settings, or buy/import it in Twilio.");
    await p.$disconnect();
    process.exit(1);
  }
  console.log(`\n✅ Number owned by the account.`);
  console.log(`   SMS capable : ${num.capabilities?.sms ? "yes" : "NO ⚠️"}`);
  console.log(`   Voice       : ${num.capabilities?.voice ? "yes" : "no"}`);
  console.log(`   Inbound hook: ${num.sms_url || "(none set — sellers' replies won't auto-route)"}`);

  console.log(`\n──────────────────────────────────────────`);
  const isTrial = !!acct.type && /trial/i.test(acct.type);
  const connected = acct.status === "active" && !!num.capabilities?.sms;
  if (connected && !isTrial) {
    console.log(`🟢 Twilio is LIVE — the automated SMS drip can text any seller.`);
  } else if (connected && isTrial) {
    console.log(`🟡 Connected, but TRIAL — drip only reaches numbers you've verified in`);
    console.log(`   the Twilio console, with a "trial account" prefix. Upgrade (add funds)`);
    console.log(`   to text real sellers. Connectivity itself is fine.`);
  } else {
    console.log(`🟡 Connected but check the ⚠️ items above before relying on auto-sends.`);
  }
  console.log(`──────────────────────────────────────────\n`);

  await p.$disconnect();
}

main().catch((e) => {
  console.error("verify-twilio failed:", e);
  process.exit(1);
});
