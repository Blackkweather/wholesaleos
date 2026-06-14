/**
 * Budget cap tests. Run: npx tsx lib/reliability/budget.test.ts
 * Uses the in-process KV fallback (no Redis) so caps are fully enforced.
 */
import assert from "node:assert/strict";
import Module from "node:module";

type ModuleLoader = (request: string, parent: unknown, isMain: boolean) => unknown;
const loadable = Module as unknown as { _load: ModuleLoader };
const originalLoad = loadable._load;
loadable._load = (request, parent, isMain) => (request === "server-only" ? {} : originalLoad(request, parent, isMain));

// Hermetic: disable the DB so the best-effort spend ledger is a no-op in tests.
process.env.DATABASE_URL = "";
process.env.DIRECT_URL = "";
process.env.CAP_AI_CENTS = "100";

async function main(): Promise<void> {
  const { checkAndIncr, getDailySpend } = await import("./budget");
  const ks = await import("./killswitch");
  await Promise.all([ks.disable(), ks.disable("AI"), ks.disable("SMS")]);

  // 80% warning
  const r1 = await checkAndIncr("AI", 50);
  assert.equal(r1.spentCents, 50);
  assert.equal(r1.warned, false);
  const r2 = await checkAndIncr("AI", 35);
  assert.equal(r2.spentCents, 85);
  assert.equal(r2.warned, true, "warns when crossing 80%");
  assert.equal(r2.halted, false);
  console.log("✓ warning emitted at 80%");

  // 100% halt engages the category killswitch
  const r3 = await checkAndIncr("AI", 20);
  assert.equal(r3.spentCents, 105);
  assert.equal(r3.halted, true, "halts at/over cap");
  assert.equal(await ks.isCategoryEnabled("AI"), true, "halt engages killswitch");
  console.log("✓ halt at 100% engages killswitch");

  const daily = await getDailySpend("AI");
  assert.equal(daily.capCents, 100);
  assert.equal(daily.halted, true);

  // Over cap, killswitch released → BudgetExceeded path
  await ks.disable("AI");
  await assert.rejects(
    () => checkAndIncr("AI", 1),
    (e: unknown) => e instanceof Error && e.name === "BudgetExceededError",
    "blocks execution once over cap",
  );
  console.log("✓ budget cap blocks execution");

  // Killswitch blocks the spend gate (which fronts every guarded send)
  await ks.enable("SMS");
  await assert.rejects(
    () => checkAndIncr("SMS", 1),
    (e: unknown) => e instanceof Error && e.name === "KillSwitchEngagedError",
    "killswitch blocks sends",
  );
  await ks.disable("SMS");
  console.log("✓ killswitch blocks sends");

  console.log("\nBUDGET TESTS PASSED");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
