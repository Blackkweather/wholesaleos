/**
 * Test: triggers a real Vapi AI voice call to a phone number.
 * Uses the first real deal in DB as context.
 * Usage: npx tsx scripts/test-vapi-call.ts +212720155047
 */
import { makeOutboundCall } from "../lib/vapi";
import { PrismaClient } from "@prisma/client";

// Load env manually for script context
import { config } from "dotenv";
config({ path: ".env" });

async function main() {
  const testPhone = process.argv[2] ?? "+212720155047";
  const p = new PrismaClient();

  // Get the best real deal from DB
  const deal = await p.deal.findFirst({
    where: { userId: "solo-user" },
    orderBy: { score: "desc" },
  });

  if (!deal) {
    console.error("❌ No deals in DB. Run a scan first.");
    process.exit(1);
  }

  console.log(`\n📞 Initiating Vapi test call...`);
  console.log(`   Deal    : ${deal.address}, ${deal.city}`);
  console.log(`   Calling : ${testPhone}`);
  console.log(`   Vapi #  : +1 (586) 304-7285\n`);

  // Override phone for the test call
  const testDeal = {
    id:          deal.id,
    address:     deal.address,
    city:        deal.city,
    state:       deal.state,
    ownerName:   "Test Seller",
    ownerPhone:  testPhone,
    ownerEmail:  deal.ownerEmail,
    situation:   deal.situation,
    dealType:    deal.dealType,
    score:       deal.score,
    arv:         deal.arv,
    offerPrice:  deal.offerPrice,
    profit:      deal.profit,
    // DealView required fields
    motivationScore: null, listPrice: null, repairCost: null,
    assignmentFee: null, verdict: null, sourceUrl: null,
    aiSummary: null, tags: [], notes: null, hot: false, optedOut: false,
    nextFollowUpAt: null, source: deal.source,
    createdAt: deal.createdAt.toISOString(),
    updatedAt: deal.updatedAt.toISOString(),
    stage: deal.stage as "FOUND",
  };

  const result = await makeOutboundCall(testDeal as any);

  if (result) {
    console.log(`✅ Call initiated!`);
    console.log(`   Call ID : ${result.callId}`);
    console.log(`   Status  : ${result.status}`);
    console.log(`\n📱 Your phone (+${testPhone.replace("+", "")}) will ring in ~10 seconds.`);
    console.log(`   Pick up and talk to Alex the AI wholesaling agent!`);
  } else {
    console.error(`❌ Call failed — check VAPI_API_KEY and VAPI_PHONE_NUMBER_ID in .env`);
  }

  await p.$disconnect();
}

main().catch(console.error);
