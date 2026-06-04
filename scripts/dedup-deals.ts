import { PrismaClient } from "@prisma/client";

async function main() {
  const p = new PrismaClient();

  // Get all deals ordered by creation date (oldest first = keep, newer = dupe)
  const all = await p.deal.findMany({ orderBy: { createdAt: "asc" } });

  const seen = new Set<string>();
  const toDelete: string[] = [];

  for (const d of all) {
    const key = `${d.address.toLowerCase()}|${d.city?.toLowerCase()}`;
    if (seen.has(key)) {
      toDelete.push(d.id);
    } else {
      seen.add(key);
    }
  }

  if (toDelete.length === 0) {
    console.log("✅ No duplicates found.");
    await p.$disconnect();
    return;
  }

  console.log(`Removing ${toDelete.length} duplicates...`);
  await p.script.deleteMany({ where: { dealId: { in: toDelete } } });
  await p.activity.deleteMany({ where: { dealId: { in: toDelete } } });
  await p.sMS.deleteMany({ where: { dealId: { in: toDelete } } });
  await p.smsSequence.deleteMany({ where: { dealId: { in: toDelete } } });
  await p.deal.deleteMany({ where: { id: { in: toDelete } } });

  const remaining = await p.deal.count();
  console.log(`✅ Done. ${remaining} unique deals in DB.`);
  await p.$disconnect();
}

main();
