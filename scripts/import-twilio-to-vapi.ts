/**
 * Imports your Twilio number (+1 424 699 3912) into Vapi so it can
 * make outbound calls to ANY number including international (+212).
 * Run: npx tsx scripts/import-twilio-to-vapi.ts
 */
import { PrismaClient } from "@prisma/client";
import { createDecipheriv, createHash } from "crypto";
import { config } from "dotenv";
config({ path: ".env" });

const VAPI_KEY  = process.env.VAPI_API_KEY!;
const ENC_KEY   = process.env.ENCRYPTION_KEY ?? "dev-only-insecure-encryption-key-change-me-32+";

function decrypt(encoded: string): string {
  const raw  = Buffer.from(encoded, "base64");
  const iv   = raw.subarray(0, 12);
  const tag  = raw.subarray(12, 28);
  const data = raw.subarray(28);
  const key  = createHash("sha256").update(ENC_KEY).digest();
  const dec  = createDecipheriv("aes-256-gcm", key, iv);
  dec.setAuthTag(tag);
  return Buffer.concat([dec.update(data), dec.final()]).toString("utf8");
}

async function main() {
  const p = new PrismaClient();
  const user = await p.user.findUnique({
    where: { id: "solo-user" },
    select: { twilioSid: true, twilioToken: true, twilioPhone: true },
  });

  if (!user?.twilioSid || !user.twilioToken || !user.twilioPhone) {
    console.error("❌ No Twilio credentials in DB.");
    process.exit(1);
  }

  const accountSid = decrypt(user.twilioSid);
  const authToken  = decrypt(user.twilioToken);
  const phone      = user.twilioPhone; // +14246993912

  console.log(`\n📞 Importing ${phone} into Vapi...`);

  const res = await fetch("https://api.vapi.ai/phone-number", {
    method:  "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${VAPI_KEY}` },
    body: JSON.stringify({
      provider:          "twilio",
      number:            phone,
      twilioAccountSid:  accountSid,
      twilioAuthToken:   authToken,
      name:              "WholesaleOS Twilio",
    }),
  });

  const data = await res.json() as { id?: string; number?: string; error?: string; message?: string };

  if (res.ok && data.id) {
    console.log(`\n✅ Twilio number imported into Vapi!`);
    console.log(`   Number : ${data.number}`);
    console.log(`   Vapi ID: ${data.id}`);
    console.log(`\nNow update .env:`);
    console.log(`  VAPI_PHONE_NUMBER_ID="${data.id}"`);
    // Auto-update .env
    const fs = await import("fs");
    let env = fs.readFileSync(".env", "utf8");
    env = env.replace(/VAPI_PHONE_NUMBER_ID=".*"/, `VAPI_PHONE_NUMBER_ID="${data.id}"`);
    fs.writeFileSync(".env", env);
    console.log(`\n✅ .env updated automatically!`);
    console.log(`   Restart the dev server and Vapi can now call ANY number including +212.`);
  } else {
    console.error(`❌ Import failed:`, data.message ?? data.error ?? data);
  }

  await p.$disconnect();
}

main().catch(console.error);
