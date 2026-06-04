/**
 * One-time migration: copy local (MAMP) data into the cloud (Neon) database so
 * nothing has to be re-entered after deploying to Vercel.
 *
 * Copies the User row (incl. encrypted Twilio creds — same ENCRYPTION_KEY, so
 * the ciphertext stays valid), Markets, Buyers, and Deals.
 *
 * Usage (PowerShell):
 *   $env:CLOUD_URL = "<neon direct url>"; npx tsx scripts/migrate-to-cloud.ts
 */
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnv() {
  try {
    const raw = readFileSync(resolve(process.cwd(), ".env"), "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (!m) continue;
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (process.env[m[1]] === undefined) process.env[m[1]] = v;
    }
  } catch { /* rely on env */ }
}
loadEnv();

const LOCAL = process.env.DATABASE_URL;
const CLOUD = process.env.CLOUD_URL;
if (!LOCAL || !CLOUD) {
  console.error("Need DATABASE_URL (.env, local) and CLOUD_URL (Neon direct).");
  process.exit(1);
}

const local = new PrismaClient({ datasources: { db: { url: LOCAL } } });
const cloud = new PrismaClient({ datasources: { db: { url: CLOUD } } });

async function main() {
  // 1) User first (FK target) — carries the encrypted Twilio creds
  const users = await local.user.findMany();
  for (const u of users) {
    const { id, ...rest } = u;
    await cloud.user.upsert({ where: { id }, create: u, update: rest });
  }
  const twilioUser = users.find((u) => u.twilioSid && u.twilioToken && u.twilioPhone);
  console.log(`users: ${users.length}${twilioUser ? " (Twilio creds included)" : ""}`);

  // 2) Markets, Buyers, Deals (scalars + FK ids copy cleanly via createMany)
  for (const [label, model] of [["markets", "market"], ["buyers", "buyer"], ["deals", "deal"]] as const) {
    try {
      const rows = await (local as Record<string, { findMany: () => Promise<unknown[]> }>)[model].findMany();
      if (rows.length) {
        await (cloud as Record<string, { createMany: (a: { data: unknown[]; skipDuplicates: boolean }) => Promise<{ count: number }> }>)[model]
          .createMany({ data: rows, skipDuplicates: true });
      }
      console.log(`${label}: ${rows.length} copied`);
    } catch (e) {
      console.log(`${label}: ERROR ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  await local.$disconnect();
  await cloud.$disconnect();
  console.log("✅ Migration done.");
}

main().catch((e) => { console.error(e); process.exit(1); });
