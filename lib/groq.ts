import "server-only";
import { env } from "./env";

/**
 * LLM engine layer — two-tier, zero rate-limit design:
 *
 * TIER 1 — FreeLLMAPI (when FREELLMAPI_URL + FREELLMAPI_KEY are set):
 *   Self-hosted proxy that round-robins across 16+ free providers (Groq, Gemini,
 *   Cerebras, SambaNova, Mistral, GitHub GPT-4.1, etc.) with auto-failover on 429.
 *   Effectively unlimited tokens. Runs locally, exposed via Cloudflare tunnel.
 *   github.com/tashfeenahmed/freellmapi
 *
 * TIER 2 — Direct Groq (fallback when FreeLLMAPI is not configured):
 *   llama-3.1-8b-instant for the agent (30k TPM), llama-3.3-70b for generation.
 */

const GROQ_BASE = "https://api.groq.com/openai/v1/chat/completions";

// Model names used when routing through direct Groq
export const GROQ_MODEL = "llama-3.3-70b-versatile";
const FALLBACK_MODEL = "llama3-70b-8192";
export const GROQ_AGENT_MODEL = "llama-3.1-8b-instant";
const GROQ_AGENT_FALLBACK = "llama-3.3-70b-versatile";

// ---------------------------------------------------------------------------
// FreeLLMAPI helpers
// ---------------------------------------------------------------------------

function freellmBase(): string | null {
  if (!env.FREELLMAPI_URL || !env.FREELLMAPI_KEY) return null;
  return env.FREELLMAPI_URL.replace(/\/$/, "") + "/v1/chat/completions";
}

export function isFreellmConfigured(): boolean {
  return Boolean(env.FREELLMAPI_URL && env.FREELLMAPI_KEY);
}

/**
 * Best model to request from FreeLLMAPI for the agent.
 * Gemini 2.5 Flash supports tool-calling and has massive free quota.
 * FreeLLMAPI auto-falls back to next provider if this one is rate-limited.
 */
const FREELLM_AGENT_MODEL = "gemini-2.5-flash";   // Google — huge free quota, tool-calling ✓
const FREELLM_GEN_MODEL   = "llama-3.3-70b-versatile"; // Groq via proxy for generation tasks

export function isGroqConfigured(): boolean {
  return Boolean(env.GROQ_API_KEY) || isFreellmConfigured();
}

/** One raw OpenAI-compatible chat call to any endpoint. */
async function rawChat(
  base: string,
  key: string,
  model: string,
  messages: { role: string; content: string | null; tool_calls?: unknown; tool_call_id?: string; name?: string }[],
  tools?: GroqTool[],
  maxTokens = 1024,
): Promise<{ ok: boolean; status: number; msg?: GroqMessage; text?: string }> {
  try {
    const res = await fetch(base, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        messages,
        tools: tools?.length ? tools : undefined,
        tool_choice: tools?.length ? "auto" : undefined,
        temperature: 0.4,
        max_tokens: maxTokens,
      }),
    });
    if (!res.ok) return { ok: false, status: res.status };
    const json = (await res.json()) as { choices?: { message?: GroqMessage }[] };
    const msg = json.choices?.[0]?.message;
    return msg ? { ok: true, status: 200, msg } : { ok: false, status: 200 };
  } catch {
    return { ok: false, status: 0 };
  }
}

interface GroqOptions {
  system?: string;
  prompt: string;
  maxTokens?: number;
  temperature?: number;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function groqGenerate(opts: GroqOptions): Promise<string> {
  const messages: { role: string; content: string }[] = [];
  if (opts.system) messages.push({ role: "system", content: opts.system });
  messages.push({ role: "user", content: opts.prompt });

  // Try FreeLLMAPI first (unlimited multi-provider failover)
  const freellm = freellmBase();
  if (freellm && env.FREELLMAPI_KEY) {
    try {
      const res = await fetch(freellm, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.FREELLMAPI_KEY}` },
        body: JSON.stringify({ model: FREELLM_GEN_MODEL, messages, max_tokens: opts.maxTokens ?? 2048, temperature: opts.temperature ?? 0.6 }),
      });
      if (res.ok) {
        const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
        const text = json.choices?.[0]?.message?.content?.trim() ?? "";
        if (text) return text;
      }
    } catch { /* fall through to Groq */ }
  }

  // Fallback: direct Groq
  const key = env.GROQ_API_KEY;
  if (!key) throw new Error("No LLM configured (set GROQ_API_KEY or FREELLMAPI_URL+KEY)");

  const models = [GROQ_MODEL, FALLBACK_MODEL];
  let lastError = "Groq request failed";

  for (let attempt = 0; attempt < models.length; attempt++) {
    const model = models[attempt];
    try {
      const res = await fetch(GROQ_BASE, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model, messages, max_tokens: opts.maxTokens ?? 2048, temperature: opts.temperature ?? 0.6 }),
      });
      if (res.ok) {
        const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
        const text = json.choices?.[0]?.message?.content?.trim() ?? "";
        if (text) return text;
        lastError = "Groq returned empty response";
      } else {
        const detail = await res.text().catch(() => "");
        lastError = `Groq ${res.status}: ${detail.slice(0, 200)}`;
        if (![429, 500, 502, 503, 504].includes(res.status)) throw new Error(lastError);
      }
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }
    if (attempt < models.length - 1) await sleep(1500 * (attempt + 1));
  }
  throw new Error(lastError);
}

// ---------------------------------------------------------------------------
// Tool-calling chat (for the Orchestrator agent)
// ---------------------------------------------------------------------------

export interface GroqToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface GroqMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: GroqToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface GroqTool {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

/**
 * One round of chat completion with optional tool-calling.
 * Returns the assistant message — which may contain tool_calls the caller
 * must execute and feed back in for the next round.
 *
 * Uses llama-3.1-8b-instant (30k TPM free) to avoid rate limits on the
 * multi-round orchestrator loop. Falls back to 70b on failure.
 */
export async function groqChat(
  messages: GroqMessage[],
  tools?: GroqTool[],
): Promise<GroqMessage> {
  // ── TIER 1: FreeLLMAPI (unlimited, multi-provider, auto-failover) ──────────
  // When running, this handles ALL agent traffic — Groq is never touched.
  // FreeLLMAPI routes to Gemini 2.5 Flash → Groq → Cerebras → SambaNova → ...
  const freellm = freellmBase();
  if (freellm && env.FREELLMAPI_KEY) {
    const r = await rawChat(freellm, env.FREELLMAPI_KEY, FREELLM_AGENT_MODEL, messages, tools);
    if (r.ok && r.msg) {
      console.log("[agent] FreeLLMAPI ✓ (Gemini 2.5 Flash via proxy)");
      return r.msg;
    }
    console.warn(`[agent] FreeLLMAPI failed (${r.status}) — falling back to direct Groq`);
  }

  // ── TIER 2: Direct Groq (fallback) ─────────────────────────────────────────
  const key = env.GROQ_API_KEY;
  if (!key) throw new Error("No LLM configured (set GROQ_API_KEY or FREELLMAPI_URL+KEY)");

  const models = [GROQ_AGENT_MODEL, GROQ_AGENT_FALLBACK];
  let lastError = "Groq agent request failed";

  for (let attempt = 0; attempt < models.length; attempt++) {
    const model = models[attempt];
    try {
      const res = await fetch(GROQ_BASE, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model, messages,
          tools: tools?.length ? tools : undefined,
          tool_choice: tools?.length ? "auto" : undefined,
          temperature: 0.4, max_tokens: 1024,
        }),
      });
      if (res.ok) {
        const json = (await res.json()) as { choices?: { message?: GroqMessage }[] };
        const msg = json.choices?.[0]?.message;
        if (msg) return msg;
        lastError = "Groq returned no message";
      } else {
        const detail = await res.text().catch(() => "");
        lastError = `Groq ${res.status}: ${detail.slice(0, 200)}`;
        if (![429, 500, 502, 503, 504].includes(res.status)) throw new Error(lastError);
      }
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }
    if (attempt < models.length - 1) await sleep(2000 * (attempt + 1));
  }
  throw new Error(lastError);
}
