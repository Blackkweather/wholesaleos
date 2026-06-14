/**
 * AI gateway failover tests. Standalone — no test framework required.
 *   Run:  npx tsx lib/ai/gateway.test.ts
 *
 * Mocks global.fetch with a scripted response queue, then asserts:
 *   1. primary 429 (retried) → fails over to fallback (Groq) 200
 *   2. all providers fail → throws AIError
 */
import assert from "node:assert/strict";
import Module from "node:module";

// Stub the Next-only `server-only` import so the gateway loads under plain Node.
type ModuleLoader = (request: string, parent: unknown, isMain: boolean) => unknown;
const loadable = Module as unknown as { _load: ModuleLoader };
const originalLoad = loadable._load;
loadable._load = (request, parent, isMain) =>
  request === "server-only" ? {} : originalLoad(request, parent, isMain);

// Configure providers BEFORE importing the gateway (env is read at module load).
process.env.AI_GATEWAY_URL = "https://gateway.test/v1";
process.env.AI_GATEWAY_KEY = "gw-key";
process.env.GROQ_API_KEY = "groq-key";
process.env.OPENROUTER_API_KEY = "";
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;

type Responder = () => { status: number; body: unknown };

let queue: Responder[] = [];
const calls: string[] = [];

function setQueue(rs: Responder[]): void {
  queue = rs;
  calls.length = 0;
}

const mockFetch = (async (input: string | URL | Request) => {
  calls.push(typeof input === "string" ? input : input.toString());
  const responder = queue.shift();
  const { status, body } = responder ? responder() : { status: 500, body: {} };
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}) as typeof fetch;

globalThis.fetch = mockFetch;

function chat(content: string): unknown {
  return { choices: [{ message: { role: "assistant", content } }] };
}

async function main(): Promise<void> {
  const { aiGenerate, getAIHealth, isAIConfigured } = await import("./gateway");

  assert.equal(isAIConfigured(), true, "providers should be configured");

  // Case 1: primary 429 x2 (initial + retry) → fallback 200.
  setQueue([
    () => ({ status: 429, body: { error: "rate_limited" } }),
    () => ({ status: 429, body: { error: "rate_limited" } }),
    () => ({ status: 200, body: chat("FALLBACK_OK") }),
  ]);
  const out1 = await aiGenerate({ prompt: "hi" });
  assert.equal(out1, "FALLBACK_OK", "should fail over to fallback");
  assert.equal(calls.length, 3, "primary tried twice, fallback once");
  const h1 = getAIHealth();
  assert.equal(h1.find((h) => h.id === "primary")?.status, "degraded", "primary degraded");
  assert.equal(h1.find((h) => h.id === "fallback")?.status, "ok", "fallback ok");
  console.log("✓ failover primary→fallback");

  // Case 2: every provider returns 500 (each retried once) → AIError.
  setQueue([
    () => ({ status: 500, body: {} }),
    () => ({ status: 500, body: {} }),
    () => ({ status: 500, body: {} }),
    () => ({ status: 500, body: {} }),
    () => ({ status: 500, body: {} }),
    () => ({ status: 500, body: {} }),
  ]);
  await assert.rejects(
    () => aiGenerate({ prompt: "hi" }),
    (err: unknown) => err instanceof Error && err.name === "AIError",
    "should throw AIError when all providers fail",
  );
  console.log("✓ throws AIError when all providers fail");

  console.log("\nALL TESTS PASSED");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
