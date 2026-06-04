import { PrismaClient } from "@prisma/client";

async function main() {
  const p = new PrismaClient();
  // Remove buyers with fake 555 numbers or no real source
  const { count } = await p.buyer.deleteMany({
    where: {
      OR: [
        { phone: { contains: "555" } },
        { name: "John Smith" },
        { name: "David Lee" },
        { name: "Emily Chen" },
      ],
    },
  });
  console.log(`✅ Removed ${count} fake buyers.`);
  const remaining = await p.buyer.count();
  console.log(`${remaining} real buyers remain.`);
  await p.$disconnect();
}
main();
