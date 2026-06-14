import "server-only";
import { aiGenerate, isAIConfigured } from "./ai/gateway";
import { env } from "./env";

/**
 * Backward-compatible shim. Gemini now flows through lib/ai/gateway as the
 * primary tier; this module's exports are preserved for existing callers.
 * The `webSearch` flag is accepted for signature compatibility (the gateway
 * does not perform search grounding; real web search is handled via Tavily).
 */

export const GEMINI_MODEL = "gemini-2.5-flash";

interface GeminiOptions {
  system?: string;
  prompt: string;
  webSearch?: boolean;
  maxTokens?: number;
  temperature?: number;
  model?: string;
}

export function isGeminiConfigured(): boolean {
  return Boolean(env.GEMINI_API_KEY) || isAIConfigured();
}

export async function geminiGenerate(opts: GeminiOptions): Promise<string> {
  return aiGenerate({
    system: opts.system,
    prompt: opts.prompt,
    maxTokens: opts.maxTokens,
    temperature: opts.temperature,
  });
}
