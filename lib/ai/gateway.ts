import "server-only";
import { redis } from "../redis";
import { features } from "../env";
import { cacheGet, cacheSet, hashKey } from "../cache";
import { checkAndIncr } from "../reliability/budget";
import { buildProviders } from "./providers";
import {
  AIError,
  type AIGenerateOptions,
  type AIMessage,
  type AIProviderId,
  type AITool,
  type ProviderConfig,
  type ProviderHealth,
  type ProviderStatus,
} from "./types";

/**
 * Single entry point for every LLM call in WholesaleOS.
 *
 *   aiChat(messages, tools?) — one tool-calling round (returns assistant message)
 *   aiGenerate(opts)         — text completion (returns string)
 *
 * Failover walks the provider chain (primary → fallback → emergency), retrying
 * transient failures once per provider before advancing. A per-provider circuit
 * breaker opens after repeated failures and is skipped until it cools down.
 * Health is tracked in-process and mirrored to Redis (60s TTL) for telemetry.
 */

const MAX_RETRIES_PER_PROVIDER = 1; // 1 retry after first failure (2 attempts total)
const RETRYABLE_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504]);
const BREAKER_THRESHOLD = 4; // consecutive failures before the circuit opens
const BREAKER_COOLDOWN_MS = 30_000;
const REQUEST_TIMEOUT_MS = 45_000;
const DEFAULT_GENERATE_TOKENS = 2048;
const DEFAULT_CHAT_TOKENS = 1024;

interface HealthState {
  consecutiveFailures: number;
  lastError: string | null;
  lastLatencyMs: number | null;
  lastCheck: number | null;
  openUntil: number | null;
}

const healthMap = new Map<AIProviderId, HealthState>();

function stateFor(id: AIProviderId): HealthState {
  let s = healthMap.get(id);
  if (!s) {
    s = { consecutiveFailures: 0, lastError: null, lastLatencyMs: null, lastCheck: null, openUntil: null };
    healthMap.set(id, s);
  }
  return s;
}

function breakerOpen(id: AIProviderId): boolean {
  const s = stateFor(id);
  return s.openUntil !== null && s.openUntil > Date.now();
}

function recordSuccess(id: AIProviderId, latencyMs: number): void {
  const s = stateFor(id);
  s.consecutiveFailures = 0;
  s.lastError = null;
  s.lastLatencyMs = latencyMs;
  s.lastCheck = Date.now();
  s.openUntil = null;
  void persist(id);
}

function recordFailure(id: AIProviderId, error: string): void {
  const s = stateFor(id);
  s.consecutiveFailures += 1;
  s.lastError = error;
  s.lastCheck = Date.now();
  if (s.consecutiveFailures >= BREAKER_THRESHOLD) {
    s.openUntil = Date.now() + BREAKER_COOLDOWN_MS;
  }
  void persist(id);
}

async function persist(id: AIProviderId): Promise<void> {
  if (!redis) return;
  try {
    await redis.set(`wos:ai:health:${id}`, JSON.stringify(stateFor(id)), { ex: 60 });
  } catch {
    /* telemetry is best-effort; never block an AI call on Redis */
  }
}

function withTimeout(ms: number): { signal: AbortSignal; clear: () => void } {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, clear: () => clearTimeout(t) };
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Rough per-call cost estimate (cents) for the AI daily budget. */
function estimateAiCents(maxTokens: number): number {
  return Math.max(1, Math.ceil(maxTokens / 2000));
}

interface RawResult {
  ok: boolean;
  status: number;
  message?: AIMessage;
  error?: string;
}

async function callProvider(
  p: ProviderConfig,
  messages: AIMessage[],
  tools: AITool[] | undefined,
  maxTokens: number,
  temperature: number,
): Promise<RawResult> {
  const payload = JSON.stringify({
    model: p.model,
    messages,
    tools: tools?.length ? tools : undefined,
    tool_choice: tools?.length ? "auto" : undefined,
    temperature,
    max_tokens: maxTokens,
  });
  const { signal, clear } = withTimeout(REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(p.baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${p.apiKey}`,
        ...(p.headers ?? {}),
      },
      body: payload,
      signal,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return { ok: false, status: res.status, error: `${p.label} ${res.status}: ${detail.slice(0, 180)}` };
    }
    const json = (await res.json()) as { choices?: { message?: AIMessage }[] };
    const message = json.choices?.[0]?.message;
    if (!message) return { ok: false, status: 200, error: `${p.label}: empty response` };
    return { ok: true, status: 200, message };
  } catch (e) {
    const error =
      e instanceof Error
        ? e.name === "AbortError"
          ? `${p.label}: timeout after ${REQUEST_TIMEOUT_MS}ms`
          : e.message
        : String(e);
    return { ok: false, status: 0, error };
  } finally {
    clear();
  }
}

interface RunResult {
  message: AIMessage;
  provider: AIProviderId;
  model: string;
  latencyMs: number;
}

async function run(
  messages: AIMessage[],
  tools: AITool[] | undefined,
  maxTokens: number,
  temperature: number,
): Promise<RunResult> {
  const providers = buildProviders().filter((p) => p.configured);
  if (providers.length === 0) {
    throw new AIError(
      "No AI provider configured (set AI_GATEWAY_KEY/OPENROUTER_API_KEY for the gateway, or GROQ_API_KEY).",
      [],
      0,
    );
  }

  // Phase 2 reliability: killswitch + daily AI budget (throws if halted / over cap).
  await checkAndIncr("AI", estimateAiCents(maxTokens));

  const tried: AIProviderId[] = [];
  let lastStatus = 0;
  let lastError = "AI request failed";

  for (const p of providers) {
    if (breakerOpen(p.id)) {
      lastError = `${p.label}: circuit open`;
      continue;
    }
    tried.push(p.id);

    for (let attempt = 0; attempt <= MAX_RETRIES_PER_PROVIDER; attempt++) {
      const started = Date.now();
      const r = await callProvider(p, messages, tools, maxTokens, temperature);
      const latencyMs = Date.now() - started;

      if (r.ok && r.message) {
        recordSuccess(p.id, latencyMs);
        return { message: r.message, provider: p.id, model: p.model, latencyMs };
      }

      lastStatus = r.status;
      lastError = r.error ?? lastError;
      const retryable = RETRYABLE_STATUS.has(r.status) || r.status === 0;
      if (attempt < MAX_RETRIES_PER_PROVIDER && retryable) {
        await sleep(800 * (attempt + 1));
        continue;
      }
      recordFailure(p.id, lastError);
      break;
    }
  }

  throw new AIError(lastError, tried, lastStatus);
}

/** True when at least one provider tier has a credential. */
export function isAIConfigured(): boolean {
  return buildProviders().some((p) => p.configured);
}

/** One tool-calling chat round. Returns the assistant message (may hold tool_calls). */
export async function aiChat(messages: AIMessage[], tools?: AITool[]): Promise<AIMessage> {
  const { message } = await run(messages, tools, DEFAULT_CHAT_TOKENS, 0.4);
  return message;
}

/** Text generation. Pass `messages`, or `system`+`prompt`. Returns trimmed text. */
export async function aiGenerate(opts: AIGenerateOptions): Promise<string> {
  let messages: AIMessage[];
  if (opts.messages && opts.messages.length > 0) {
    messages = [...opts.messages];
  } else {
    messages = [];
    if (opts.system) messages.push({ role: "system", content: opts.system });
    messages.push({ role: "user", content: opts.prompt ?? "" });
  }

  const maxTokens = opts.maxTokens ?? DEFAULT_GENERATE_TOKENS;
  const temperature = opts.temperature ?? 0.6;

  // Response cache (Redis only) — a hit bypasses the providers and the budget.
  const cacheKey = features.redis ? hashKey(["aigen", maxTokens, temperature, JSON.stringify(messages)]) : null;
  if (cacheKey) {
    const hit = await cacheGet<string>(cacheKey);
    if (hit !== null) return hit;
  }

  const { message } = await run(messages, undefined, maxTokens, temperature);
  const text = (message.content ?? "").trim();

  if (cacheKey && text) await cacheSet(cacheKey, text, 3600);
  return text;
}

function statusOf(p: ProviderConfig, s: HealthState): ProviderStatus {
  if (!p.configured) return "unconfigured";
  if (s.openUntil !== null && s.openUntil > Date.now()) return "down";
  if (s.consecutiveFailures > 0) return "degraded";
  return "ok";
}

/** Current in-process health snapshot for every provider tier. */
export function getAIHealth(): ProviderHealth[] {
  return buildProviders().map((p) => {
    const s = stateFor(p.id);
    return {
      id: p.id,
      label: p.label,
      model: p.model,
      configured: p.configured,
      status: statusOf(p, s),
      consecutiveFailures: s.consecutiveFailures,
      lastError: s.lastError,
      lastLatencyMs: s.lastLatencyMs,
      lastCheck: s.lastCheck ? new Date(s.lastCheck).toISOString() : null,
      openUntil: s.openUntil,
    };
  });
}

/** Live one-token probe of a single provider; updates its health record. */
export async function pingProvider(
  id: AIProviderId,
): Promise<{ id: AIProviderId; ok: boolean; latencyMs: number; error: string | null }> {
  const p = buildProviders().find((x) => x.id === id);
  if (!p || !p.configured) return { id, ok: false, latencyMs: 0, error: "unconfigured" };
  const started = Date.now();
  const r = await callProvider(p, [{ role: "user", content: "ping" }], undefined, 8, 0);
  const latencyMs = Date.now() - started;
  if (r.ok) {
    recordSuccess(id, latencyMs);
    return { id, ok: true, latencyMs, error: null };
  }
  recordFailure(id, r.error ?? "ping failed");
  return { id, ok: false, latencyMs, error: r.error ?? "ping failed" };
}
