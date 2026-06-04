/**
 * Re-score existing deals with the deterministic formula (same as coerceDeal),
 * fixing rows saved with the old buggy "always ~1" score.
 *
 * Usage: $env:CLOUD_URL = "<neon direct url>"; npx tsx scripts/rescore-deals.ts
 * (falls back to local DATABASE_URL if CLOUD_URL is not set)
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
  } catch { /* env already set */ }
}
loadEnv();

const url = process.env.CLOUD_URL || process.env.DATABASE_URL;
if (!url) { console.error("No DB url (set CLOUD_URL)."); process.exit(1); }
const db = new PrismaClient({ datasources: { db: { url } } });

const MOTIVATION: Record<string, number> = {
  PROBATE: 85, FORECLOSURE: 82, TAX_DELINQUENT: 80, INHERITED: 78,
  DIVORCE: 76, ABSENTEE: 74, CODE_VIOLATION: 72, VACANT: 70, OTHER: 58,
};

function rescore(d: { profit: number | null; assignmentFee: number | null; arv: number | null; dealType: string }) {
  const profitVal = d.profit ?? d.assignmentFee ?? 10000;
  const marginPct = d.arv && d.arv > 0 ? profitVal / d.arv : 0;
  const motivationScore = MOTIVATION[d.dealType] ?? 58;
  const profitScore = Math.max(0, Math.min(100, Math.round((profitVal / 20000) * 100)));
  const marginScore = Math.max(0, Math.min(100, Math.round((marginPct / 0.30) * 100)));
  const score = Math.max(1, Math.min(100, Math.round(profitScore * 0.45 + marginScore * 0.25 + motivationScore * 0.30)));
  const verdict = score >= 78 ? "GO" : score >= 60 ? "CAUTION" : "PASS";
  return { score, motivationScore, profitScore, verdict };
}

async function main() {
  const deals = await db.deal.findMany({
    select: { id: true, address: true, profit: true, assignmentFee: true, arv: true, dealType: true, score: true },
  });
  let updated = 0;
  for (const d of deals) {
    const r = rescore(d);
    if (r.score !== d.score) {
      await db.deal.update({ where: { id: d.id }, data: r });
      updated++;
    }
  }
  console.log(`Re-scored ${updated}/${deals.length} deals.`);
  await db.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
