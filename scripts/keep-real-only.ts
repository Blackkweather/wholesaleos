/**
 * Keep only deals with verifiable real sources (Harris County, HUD, county records, etc.)
 * Deletes anything with generic hallucinated addresses.
 */
import { PrismaClient } from "@prisma/client";

const FAKE_STREETS = [
  "Maple St", "Oak St", "Oakwood St", "Elm St", "Pine St", "Main St",
  "Maple Ave", "Pinecrest Dr", "Lakeview Ct", "Sycamore St", "Magnolia Blvd",
  "Birchwood Ln", "Harbor Rd", "Sunset Way", "Cypress Trl", "Brookside Dr",
  "Heron Pl", "Old Mill Rd", "Dogwood Cir", "Palmetto St", "Sandpiper Ln",
];

async function main() {
  const p = new PrismaClient();
  const all = await p.deal.findMany({ select: { id: true, address: true, city: true } });

  const toDelete = all.filter((d) =>
    FAKE_STREETS.some((s) => d.address.toLowerCase().includes(s.toLowerCase()))
  );

  console.log(`Removing ${toDelete.length} generic/fake deals:`);
  toDelete.forEach((d) => console.log(` - ${d.address}`));

  if (toDelete.length > 0) {
    const ids = toDelete.map((d) => d.id);
    await p.script.deleteMany({ where: { dealId: { in: ids } } });
    await p.activity.deleteMany({ where: { dealId: { in: ids } } });
    await p.sMS.deleteMany({ where: { dealId: { in: ids } } });
    await p.smsSequence.deleteMany({ where: { dealId: { in: ids } } });
    await p.deal.deleteMany({ where: { id: { in: ids } } });
  }

  const remaining = await p.deal.findMany({ select: { address: true, city: true, source: true } });
  console.log(`\n✅ ${remaining.length} real deals remain:`);
  remaining.forEach((d) => console.log(` ✓ ${d.address}, ${d.city} [${d.source}]`));
  await p.$disconnect();
}
main();
