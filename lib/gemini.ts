import "server-only";
import { env } from "./env";

/**
 * Free AI engine via Google Gemini, with Google Search grounding for real,
 * web-backed results. Used by lib/claude.ts's dispatch when no Anthropic key is
 * set. The free tier throws transient 503/429s under load, so we retry with
 * backoff and fall back to a lighter model.
 */
export const GEMINI_MODEL = "gemini-2.5-flash";
const FALLBACK_MODELS = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-2.0-flash"];

interface GeminiOptions {
  system?: string;
  prompt: string;
  webSearch?: boolean;
  maxTokens?: number;
  temperature?: number;
  model?: string;
}

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isGeminiConfigured(): boolean {
  return Boolean(env.GEMINI_API_KEY);
}

export async function geminiGenerate(opts: GeminiOptions): Promise<string> {
  const key = env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_NOT_CONFIGURED");

  const body: Record<string, unknown> = {
    contents: [{ role: "user", parts: [{ text: opts.prompt }] }],
    generationConfig: {
      maxOutputTokens: opts.maxTokens ?? 2048,
      temperature: opts.temperature ?? 0.6,
    },
  };
  if (opts.system) {
    body.system_instruction = { parts: [{ text: opts.system }] };
  }
  if (opts.webSearch) {
    body.tools = [{ google_search: {} }];
  }
  const payload = JSON.stringify(body);

  const models = opts.model ? [opts.model, "gemini-2.0-flash"] : FALLBACK_MODELS;
  let lastError = "Gemini request failed";

  for (let attempt = 0; attempt < models.length; attempt++) {
    const model = models[attempt];
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
      });

      if (res.ok) {
        const json = (await res.json()) as GeminiResponse;
        const text = (json.candidates?.[0]?.content?.parts ?? [])
          .map((p) => p.text ?? "")
          .join("")
          .trim();
        if (text) return text;
        lastError = "Gemini returned an empty response";
      } else {
        const detail = await res.text().catch(() => "");
        lastError = `Gemini ${res.status}: ${detail.slice(0, 200)}`;
        // Non-transient errors: stop retrying.
        if (![429, 500, 502, 503, 504].includes(res.status)) {
          throw new Error(lastError);
        }
      }
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }
    // backoff before next attempt
    await sleep(1500 * (attempt + 1));
  }

  throw new Error(lastError);
}
