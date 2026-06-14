import "server-only";
import { aiChat, aiGenerate, isAIConfigured } from "./ai/gateway";
import type { AIMessage, AITool, AIToolCall } from "./ai/types";

/**
 * Backward-compatible shim. All LLM traffic now routes through lib/ai/gateway
 * (primary Gemini 2.5 Flash → fallback Llama 3.3 70B → emergency GPT-4o-mini).
 * The legacy Groq/FreeLLMAPI implementation has been removed; these exports are
 * preserved so existing callers keep working unchanged.
 */

export type GroqToolCall = AIToolCall;
export type GroqMessage = AIMessage;
export type GroqTool = AITool;

// Retained for callers importing these constants (no behavioral effect — model
// selection now lives in lib/ai/providers).
export const GROQ_MODEL = "llama-3.3-70b-versatile";
export const GROQ_AGENT_MODEL = "llama-3.1-8b-instant";

export function isGroqConfigured(): boolean {
  return isAIConfigured();
}

interface GroqOptions {
  system?: string;
  prompt: string;
  maxTokens?: number;
  temperature?: number;
}

export async function groqGenerate(opts: GroqOptions): Promise<string> {
  return aiGenerate({
    system: opts.system,
    prompt: opts.prompt,
    maxTokens: opts.maxTokens,
    temperature: opts.temperature,
  });
}

export async function groqChat(messages: GroqMessage[], tools?: GroqTool[]): Promise<GroqMessage> {
  return aiChat(messages, tools);
}
