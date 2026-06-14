import "server-only";
import { env } from "../env";
import type { ProviderConfig } from "./types";

/**
 * Three-tier provider chain, OpenAI-compatible transport for every tier:
 *
 *   primary   — Gemini 2.5 Flash via the AI Gateway (Vercel AI Gateway or OpenRouter)
 *   fallback  — Llama 3.3 70B via DIRECT Groq (separate failure domain from the gateway)
 *   emergency — GPT-4o-mini via the AI Gateway
 *
 * Tiers self-disable when their credential is absent (configured=false) and are
 * skipped by the gateway's failover loop.
 */

const OPENROUTER_BASE = "https://openrouter.ai/api/v1/chat/completions";
const GROQ_BASE = "https://api.groq.com/openai/v1/chat/completions";

function gatewayBase(): string {
  const url = env.AI_GATEWAY_URL?.trim();
  if (!url) return OPENROUTER_BASE;
  if (/\/chat\/completions\/?$/.test(url)) return url.replace(/\/$/, "");
  return url.replace(/\/$/, "") + "/chat/completions";
}

function gatewayKey(): string {
  return (env.AI_GATEWAY_KEY || env.OPENROUTER_API_KEY || "").trim();
}

function attribution(): Record<string, string> {
  return {
    "HTTP-Referer": env.NEXT_PUBLIC_APP_URL || "https://wholesaleos.app",
    "X-Title": "WholesaleOS",
  };
}

/** Build the provider chain from current env. Pure — safe to call per request. */
export function buildProviders(): ProviderConfig[] {
  const gw = gatewayBase();
  const gk = gatewayKey();
  const groqKey = (env.GROQ_API_KEY || "").trim();
  const headers = attribution();

  const primary: ProviderConfig = {
    id: "primary",
    label: "Gemini 2.5 Flash",
    baseUrl: gw,
    apiKey: gk,
    model: env.AI_PRIMARY_MODEL || "google/gemini-2.5-flash",
    configured: Boolean(gk),
    headers,
  };

  const fallback: ProviderConfig = {
    id: "fallback",
    label: "Llama 3.3 70B (Groq)",
    baseUrl: GROQ_BASE,
    apiKey: groqKey,
    model: env.AI_FALLBACK_MODEL || "llama-3.3-70b-versatile",
    configured: Boolean(groqKey),
  };

  const emergency: ProviderConfig = {
    id: "emergency",
    label: "GPT-4o-mini",
    baseUrl: gw,
    apiKey: gk,
    model: env.AI_EMERGENCY_MODEL || "openai/gpt-4o-mini",
    configured: Boolean(gk),
    headers,
  };

  return [primary, fallback, emergency];
}
