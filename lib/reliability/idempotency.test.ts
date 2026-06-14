/**
 * Idempotency tests. Run: npx tsx lib/reliability/idempotency.test.ts
 */
import assert from "node:assert/strict";
import Module from "node:module";

type ModuleLoader = (request: string, parent: unknown, isMain: boolean) => unknown;
const loadable = Module as unknown as { _load: ModuleLoader };
const originalLoad = loadable._load;
loadable._load = (request, parent, isMain) => (request === "server-only" ? {} : originalLoad(request, parent, isMain));

async function main(): Promise<void> {
  const { withIdempotency, isProcessed } = await import("./idempotency");

  let calls = 0;
  const fn = async (): Promise<{ n: number }> => {
    calls += 1;
    return { n: calls };
  };

  const r1 = await withIdempotency("key-A", fn);
  const r2 = await withIdempotency("key-A", fn);
  assert.equal(calls, 1, "fn executed exactly once for the same key");
  assert.equal(r1.n, 1);
  assert.equal(r2.n, 1, "second call returns the prior result");
  assert.equal(await isProcessed("key-A"), true);
  console.log("✓ duplicate execution prevented; prior result returned");

  const r3 = await withIdempotency("key-B", fn);
  assert.equal(calls, 2, "a different key executes again");
  assert.equal(r3.n, 2);
  console.log("✓ distinct keys execute independently");

  console.log("\nIDEMPOTENCY TESTS PASSED");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
