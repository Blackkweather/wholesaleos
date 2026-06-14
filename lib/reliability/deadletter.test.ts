/**
 * Dead-letter capture/replay tests (pure helpers).
 * Run: npx tsx lib/reliability/deadletter.test.ts
 */
import assert from "node:assert/strict";
import Module from "node:module";

type ModuleLoader = (request: string, parent: unknown, isMain: boolean) => unknown;
const loadable = Module as unknown as { _load: ModuleLoader };
const originalLoad = loadable._load;
loadable._load = (request, parent, isMain) => (request === "server-only" ? {} : originalLoad(request, parent, isMain));

async function main(): Promise<void> {
  const { buildDeadLetterRecord, nextAttempt } = await import("../../inngest/dead-letter");

  // Capture builds a faithful record.
  const rec = buildDeadLetterRecord({ event: "app/ping", payload: { x: 1 }, error: "boom" });
  assert.equal(rec.event, "app/ping");
  assert.equal(rec.error, "boom");
  assert.equal(rec.attempts, 0);
  assert.equal(JSON.stringify(rec.payload), '{"x":1}');
  console.log("✓ dead-letter capture builds record");

  // Long errors are truncated; null payload normalizes to {}; prior attempts carried.
  const rec2 = buildDeadLetterRecord({ event: "e", payload: null, error: "e".repeat(5000) }, 2);
  assert.equal(rec2.error.length, 2000);
  assert.equal(JSON.stringify(rec2.payload), "{}");
  assert.equal(rec2.attempts, 2);
  console.log("✓ capture truncates error + normalizes payload");

  // Replay advances the attempt counter.
  assert.equal(nextAttempt(0), 1);
  assert.equal(nextAttempt(2), 3);
  console.log("✓ replay increments attempts");

  console.log("\nDEAD-LETTER TESTS PASSED");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
