import "server-only";
import { env } from "./env";

/**
 * Groq free-tier LLM engine.
 * Uses llama-3.3-70b-versatile — fast, high quality, generous free limits.
 * Drop-in replacement for Anthropic when no paid key is set.
 */

const GROQ_BASE = "https://api.groq.com/openai/v1/chat/completions";

// llama-3.3-70b-versatile: 6,000 TPM on free tier — hits rate limit fast with
// long tool-call chains. Use the generate (non-agent) path only.
export const GROQ_MODEL = "llama-3.3-70b-versatile";
const FALLBACK_MODEL = "llama3-70b-8192";

// Orchestrator agent uses 8b-instant: 30,000 TPM on free tier (5× headroom),
// streams fast, handles tool-calling well. Ideal for the multi-round chat loop.
export const GROQ_AGENT_MODEL = "llama-3.1-8b-instant";
const GROQ_AGENT_FALLBACK = "llama-3.3-70b-versatile";

export function isGroqConfigured(): boolean {
  return Boolean(env.GROQ_API_KEY);
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
  const key = env.GROQ_API_KEY;
  if (!key) throw new Error("GROQ_NOT_CONFIGURED");

  const messages: { role: string; content: string }[] = [];
  if (opts.system) messages.push({ role: "system", content: opts.system });
  messages.push({ role: "user", content: opts.prompt });

  const models = [GROQ_MODEL, FALLBACK_MODEL];
  let lastError = "Groq request failed";

  for (let attempt = 0; attempt < models.length; attempt++) {
    const model = models[attempt];
    try {
      const res = await fetch(GROQ_BASE, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model,
          messages,
          max_tokens: opts.maxTokens ?? 2048,
          temperature: opts.temperature ?? 0.6,
        }),
      });

      if (res.ok) {
        const json = (await res.json()) as {
          choices?: { message?: { content?: string } }[];
        };
        const text = json.choices?.[0]?.message?.content?.trim() ?? "";
        if (text) return text;
        lastError = "Groq returned empty response";
      } else {
        const detail = await res.text().catch(() => "");
        lastError = `Groq ${res.status}: ${detail.slice(0, 200)}`;
        if (![429, 500, 502, 503, 504].includes(res.status)) {
          throw new Error(lastError);
        }
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
  const key = env.GROQ_API_KEY;
  if (!key) throw new Error("GROQ_NOT_CONFIGURED");

  const models = [GROQ_AGENT_MODEL, GROQ_AGENT_FALLBACK];
  let lastError = "Groq agent request failed";

  for (let attempt = 0; attempt < models.length; attempt++) {
    const model = models[attempt];
    try {
      const res = await fetch(GROQ_BASE, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model,
          messages,
          tools: tools && tools.length ? tools : undefined,
          tool_choice: tools && tools.length ? "auto" : undefined,
          temperature: 0.4,
          max_tokens: 1024,
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
        // 429 = rate limited, 5xx = server error — retry with next model
        if (![429, 500, 502, 503, 504].includes(res.status)) {
          throw new Error(lastError);
        }
      }
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }
    if (attempt < models.length - 1) await sleep(2000 * (attempt + 1));
  }

  throw new Error(lastError);
}
