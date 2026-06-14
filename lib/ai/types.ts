/**
 * Shared AI gateway types. No imports — safe to use from server and (type-only)
 * client code. Runtime AI code lives in ./gateway and ./providers (server-only).
 */

export type AIRole = "system" | "user" | "assistant" | "tool";
export type AIProviderId = "primary" | "fallback" | "emergency";

export interface AIToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface AIMessage {
  role: AIRole;
  content: string | null;
  tool_calls?: AIToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface AITool {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

export interface AIGenerateOptions {
  system?: string;
  prompt?: string;
  messages?: AIMessage[];
  maxTokens?: number;
  temperature?: number;
}

export interface AIResult {
  text: string;
  provider: AIProviderId;
  model: string;
  latencyMs: number;
}

export type ProviderStatus = "ok" | "degraded" | "down" | "unconfigured";

export interface ProviderHealth {
  id: AIProviderId;
  label: string;
  model: string;
  configured: boolean;
  status: ProviderStatus;
  consecutiveFailures: number;
  lastError: string | null;
  lastLatencyMs: number | null;
  lastCheck: string | null;
  openUntil: number | null;
}

export interface ProviderConfig {
  id: AIProviderId;
  label: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  configured: boolean;
  /** Extra request headers (e.g. OpenRouter attribution). */
  headers?: Record<string, string>;
}

/** Thrown when every configured provider fails. */
export class AIError extends Error {
  readonly providersTried: AIProviderId[];
  readonly lastStatus: number;
  constructor(message: string, providersTried: AIProviderId[], lastStatus: number) {
    super(message);
    this.name = "AIError";
    this.providersTried = providersTried;
    this.lastStatus = lastStatus;
  }
}
