import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();

async function main() {
  const count = await p.market.count({ where: { userId: "solo-user" } });
  if (count > 0) {
    console.log("Market already exists:", count);
    return;
  }
  const m = await p.market.create({
    data: {
      userId: "solo-user",
      city: "Houston",
      state: "TX",
      active: true,
      dealTypes: [],
    },
  });
  console.log("Created market:", m.id, m.city, m.state);
}

main().finally(() => p.$disconnect());
