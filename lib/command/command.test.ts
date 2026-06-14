/**
 * Executive OS tests (pure). Run: npx tsx lib/command/command.test.ts
 */
import assert from "node:assert/strict";
import Module from "node:module";

type ModuleLoader = (request: string, parent: unknown, isMain: boolean) => unknown;
const loadable = Module as unknown as { _load: ModuleLoader };
const originalLoad = loadable._load;
loadable._load = (request, parent, isMain) => (request === "server-only" ? {} : originalLoad(request, parent, isMain));

async function main(): Promise<void> {
  const { summarizeFeed } = await import("./feed");
  const { composeBriefing } = await import("../briefing/weekly");

  // Feed aggregation groups by kind.
  const s = summarizeFeed([
    { kind: "DECISION" }, { kind: "DECISION" }, { kind: "RISK" }, { kind: "OPPORTUNITY" }, { kind: "OTHER" },
  ]);
  assert.equal(s.decisions, 2);
  assert.equal(s.risks, 1);
  assert.equal(s.opportunities, 1);
  assert.equal(s.total, 5);
  console.log("✓ feed aggregation groups by kind");

  // Briefing headline reconciles to the metrics it was given.
  const b = composeBriefing(
    "daily",
    { activeDeals: 1040, hotLeads: 12, contractsInFlight: 3, pipelineValue: 58000, revenueTotal: 0, overdueFollowUps: 2, decisions: 8, risks: 2, opportunities: 3 },
    "Narrative goes here.",
  );
  assert.equal(b.kind, "daily");
  assert.match(b.headline, /1040 active/);
  assert.match(b.headline, /3 contracts in flight/);
  assert.match(b.headline, /8 decisions/);
  assert.match(b.headline, /2 risks/);
  assert.equal(b.narrative, "Narrative goes here.");
  assert.equal(b.metrics.decisions, 8);
  console.log("✓ briefing headline reconciles to metrics");

  console.log("\nCOMMAND TESTS PASSED");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
