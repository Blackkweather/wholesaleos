import { PrismaClient } from "@prisma/client";

// Fake streets from lib/mock.ts — anything with these street names is sample data
const FAKE_STREETS = [
  "Maple Ave", "Pinecrest Dr", "Lakeview Ct", "Sycamore St", "Magnolia Blvd",
  "Birchwood Ln", "Harbor Rd", "Sunset Way", "Cypress Trl", "Brookside Dr",
  "Heron Pl", "Old Mill Rd", "Dogwood Cir", "Palmetto St", "Sandpiper Ln",
];

async function main() {
  const p = new PrismaClient();

  // Find all deals matching fake street names
  const fakeDeals = await p.deal.findMany({
    where: {
      OR: FAKE_STREETS.map((s) => ({ address: { contains: s } })),
    },
    select: { id: true, address: true, city: true },
  });

  console.log(`Found ${fakeDeals.length} fake deals to delete:`);
  fakeDeals.forEach((d) => console.log(` - ${d.address}, ${d.city}`));

  if (fakeDeals.length === 0) {
    console.log("Nothing to delete.");
    await p.$disconnect();
    return;
  }

  const ids = fakeDeals.map((d) => d.id);

  // Cascade-delete: scripts, SMS, activities, sequences first
  await p.script.deleteMany({ where: { dealId: { in: ids } } });
  await p.activity.deleteMany({ where: { dealId: { in: ids } } });
  await p.sMS.deleteMany({ where: { dealId: { in: ids } } });
  await p.smsSequence.deleteMany({ where: { dealId: { in: ids } } });
  const { count } = await p.deal.deleteMany({ where: { id: { in: ids } } });

  console.log(`\n✅ Deleted ${count} fake deals. DB is clean.`);
  await p.$disconnect();
}

main();
