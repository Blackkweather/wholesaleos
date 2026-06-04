/**
 * Exports every verified lead's owner + mailing address to contracts/mail-list.json
 * for the batch direct-mail letter generator.
 * Run: npx tsx scripts/export-mail-list.ts
 */
import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const p = new PrismaClient();
  const deals = await p.deal.findMany({
    where: { userId: "solo-user", stage: { not: "DEAD" }, ownerName: { not: null } },
    select: { address: true, city: true, state: true, ownerName: true, tags: true, arv: true },
  });

  const rows = deals.map((d) => {
    const mailTag = (d.tags || []).find((t) => t.startsWith("mail: "));
    return {
      owner: d.ownerName,
      property: `${d.address}, ${d.city ?? "Houston"}, ${d.state ?? "TX"}`,
      mailing: mailTag ? mailTag.replace("mail: ", "") : null,
      absentee: (d.tags || []).includes("absentee-owner"),
      value: d.arv,
    };
  }).filter((r) => r.mailing); // only those with a real mailing address

  // Absentee owners first (hottest)
  rows.sort((a, b) => Number(b.absentee) - Number(a.absentee));

  const outDir = path.join(path.dirname(__dirname), "contracts");
  fs.mkdirSync(outDir, { recursive: true });
  const out = path.join(outDir, "mail-list.json");
  fs.writeFileSync(out, JSON.stringify(rows, null, 2));

  console.log(`Exported ${rows.length} letters (${rows.filter((r) => r.absentee).length} absentee) -> ${out}`);
  await p.$disconnect();
}
main();
