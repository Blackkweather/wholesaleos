/**
 * Run a full Houston scan right now — finds real deals + buyers, saves to DB.
 * Usage: npx tsx scripts/scan-now.ts
 */
import { PrismaClient } from "@prisma/client";
import { findDeals, findBuyers } from "../lib/claude";
import { createDealsFromScored } from "../lib/data/deals";
import { createBuyersFromScored } from "../lib/data/buyers";

async function main() {
  const p = new PrismaClient();

  console.log("🔍 Scanning Houston, TX for motivated sellers...\n");

  // ── Deals ──────────────────────────────────────────────────────────────────
  let dealsSaved = 0;
  try {
    const deals = await findDeals({ city: "Houston", state: "TX", limit: 8 });
    console.log(`Found ${deals.length} deals from AI scan:`);
    deals.forEach((d) =>
      console.log(`  ${d.score ?? "??"}/100  ${d.address}, ${d.city}  [${d.dealType}]  src:${d.source}`)
    );

    if (deals.length > 0) {
      const saved = await createDealsFromScored(deals);
      dealsSaved = saved.length;
      console.log(`\n✅ Saved ${dealsSaved} deals to DB.\n`);
    }
  } catch (e) {
    console.error("❌ Deal scan error:", e instanceof Error ? e.message : e);
  }

  // ── Buyers ─────────────────────────────────────────────────────────────────
  let buyersSaved = 0;
  try {
    // Check how many buyers we already have
    const existing = await p.buyer.count();
    if (existing >= 9) {
      console.log(`ℹ️  Already have ${existing} buyers — skipping buyer scan.\n`);
    } else {
      const buyers = await findBuyers({ city: "Houston", state: "TX", limit: 6 });
      console.log(`Found ${buyers.length} buyers:`);
      buyers.forEach((b) => console.log(`  ${b.name} / ${b.company} / ${b.phone}`));
      const saved = await createBuyersFromScored(buyers);
      buyersSaved = saved.length;
      console.log(`\n✅ Saved ${buyersSaved} buyers to DB.\n`);
    }
  } catch (e) {
    console.error("❌ Buyer scan error:", e instanceof Error ? e.message : e);
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  const totalDeals = await p.deal.count();
  const totalBuyers = await p.buyer.count();
  console.log("═══════════════════════════════");
  console.log(`✅ DONE — DB now has:`);
  console.log(`   ${totalDeals} deals`);
  console.log(`   ${totalBuyers} buyers`);
  console.log("═══════════════════════════════");
  console.log("\nRefresh your dashboard to see them.");

  await p.$disconnect();
}

main();
