import { PrismaClient } from "@prisma/client";

async function main() {
  const p = new PrismaClient();
  const [dealCount, buyerCount, markets, deals, buyers] = await Promise.all([
    p.deal.count(),
    p.buyer.count(),
    p.market.findMany({ select: { city: true, state: true, active: true } }),
    p.deal.findMany({ select: { address: true, city: true, stage: true, source: true }, take: 20 }),
    p.buyer.findMany({ select: { name: true, company: true, phone: true, source: true }, take: 20 }),
  ]);
  console.log("\n=== DB CONTENTS ===");
  console.log(`Markets (${markets.length}):`, JSON.stringify(markets));
  console.log(`\nDeals total: ${dealCount}`);
  deals.forEach((d) => console.log(` - ${d.address}, ${d.city} [${d.stage}] src:${d.source}`));
  console.log(`\nBuyers total: ${buyerCount}`);
  buyers.forEach((b) => console.log(` - ${b.name} / ${b.company ?? "—"} ph:${b.phone ?? "—"} src:${b.source}`));
  await p.$disconnect();
}

main();
