/**
 * JSON cache tests. Run: npx tsx lib/reliability/cache.test.ts
 */
import assert from "node:assert/strict";
import Module from "node:module";

type ModuleLoader = (request: string, parent: unknown, isMain: boolean) => unknown;
const loadable = Module as unknown as { _load: ModuleLoader };
const originalLoad = loadable._load;
loadable._load = (request, parent, isMain) => (request === "server-only" ? {} : originalLoad(request, parent, isMain));

async function main(): Promise<void> {
  const { cacheGet, cacheSet, cacheDel, hashKey } = await import("../cache");

  // set / get / del
  await cacheSet("wos:cache:test:obj", { a: 1, b: "x" }, 60);
  const hit = await cacheGet<{ a: number; b: string }>("wos:cache:test:obj");
  assert.deepEqual(hit, { a: 1, b: "x" });
  await cacheDel("wos:cache:test:obj");
  assert.equal(await cacheGet("wos:cache:test:obj"), null);
  console.log("✓ cache set / get / del");

  // deterministic key hashing
  assert.equal(hashKey(["a", "b", 1]), hashKey(["a", "b", 1]));
  assert.notEqual(hashKey(["a"]), hashKey(["b"]));
  assert.match(hashKey(["x"]), /^wos:cache:/);
  console.log("✓ hashKey deterministic + namespaced");

  // cache hit bypasses the external call
  let external = 0;
  const compute = async (): Promise<{ v: number }> => {
    external += 1;
    return { v: external };
  };
  const key = "wos:cache:test:bypass";
  let v = await cacheGet<{ v: number }>(key);
  if (v === null) {
    v = await compute();
    await cacheSet(key, v, 60);
  }
  const v2 = await cacheGet<{ v: number }>(key);
  assert.equal(external, 1, "compute ran once");
  assert.deepEqual(v2, { v: 1 }, "second read served from cache");
  await cacheDel(key);
  console.log("✓ cache hit bypasses external call");

  console.log("\nCACHE TESTS PASSED");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
