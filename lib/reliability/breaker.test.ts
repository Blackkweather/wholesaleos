/**
 * Circuit breaker tests. Run: npx tsx lib/reliability/breaker.test.ts
 * Time is controlled by overriding Date.now to exercise OPEN → HALF_OPEN → CLOSED.
 */
import assert from "node:assert/strict";
import Module from "node:module";

type ModuleLoader = (request: string, parent: unknown, isMain: boolean) => unknown;
const loadable = Module as unknown as { _load: ModuleLoader };
const originalLoad = loadable._load;
loadable._load = (request, parent, isMain) => (request === "server-only" ? {} : originalLoad(request, parent, isMain));

async function main(): Promise<void> {
  const b = await import("./breaker");
  const realNow = Date.now;
  let t = 1_000_000;
  Date.now = () => t;
  const P = "test-provider";

  try {
    // 5 failures within the window → OPEN
    for (let i = 0; i < 5; i++) await b.recordFailure(P);
    assert.equal(await b.getStatus(P), "OPEN");
    assert.equal(await b.canRequest(P), false);
    console.log("✓ opens after 5 failures");

    // withBreaker refuses while OPEN
    await assert.rejects(
      () => b.withBreaker(P, async () => 1),
      (e: unknown) => e instanceof Error && e.name === "BreakerOpenError",
    );

    // After 30s cooldown → HALF_OPEN (a trial request is allowed)
    t += 31_000;
    assert.equal(await b.getStatus(P), "HALF_OPEN");
    assert.equal(await b.canRequest(P), true);
    console.log("✓ half-open after cooldown");

    // Success closes the breaker
    await b.recordSuccess(P);
    assert.equal(await b.getStatus(P), "CLOSED");
    console.log("✓ success closes");

    // Reopen path: trip again, cool down, fail the trial → OPEN
    for (let i = 0; i < 5; i++) await b.recordFailure(P);
    assert.equal(await b.getStatus(P), "OPEN");
    t += 31_000;
    assert.equal(await b.getStatus(P), "HALF_OPEN");
    await b.recordFailure(P);
    assert.equal(await b.getStatus(P), "OPEN");
    console.log("✓ half-open failure reopens");
  } finally {
    Date.now = realNow;
  }

  console.log("\nBREAKER TESTS PASSED");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
