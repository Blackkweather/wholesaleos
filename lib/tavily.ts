import "server-only";
import { env } from "./env";

const TAVILY_URL = "https://api.tavily.com/search";

export interface TavilyResult {
  title: string;
  url: string;
  content: string;
  score: number;
}

interface TavilyResponse {
  results?: TavilyResult[];
  answer?: string;
}

export function isTavilyConfigured(): boolean {
  return Boolean(env.TAVILY_API_KEY);
}

export async function tavilySearch(
  query: string,
  opts: { maxResults?: number; searchDepth?: "basic" | "advanced" } = {},
): Promise<TavilyResult[]> {
  const key = env.TAVILY_API_KEY;
  if (!key) throw new Error("TAVILY_NOT_CONFIGURED");

  const res = await fetch(TAVILY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: key,
      query,
      search_depth: opts.searchDepth ?? "advanced",
      max_results: opts.maxResults ?? 10,
      include_answer: true,
      include_raw_content: false,
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`Tavily ${res.status}: ${err.slice(0, 200)}`);
  }

  const data = (await res.json()) as TavilyResponse;
  return data.results ?? [];
}

/** Run multiple queries and merge unique results */
export async function tavilyMultiSearch(
  queries: string[],
  maxPerQuery = 5,
): Promise<TavilyResult[]> {
  const all: TavilyResult[] = [];
  const seen = new Set<string>();

  for (const q of queries) {
    try {
      const results = await tavilySearch(q, { maxResults: maxPerQuery });
      for (const r of results) {
        if (!seen.has(r.url)) {
          seen.add(r.url);
          all.push(r);
        }
      }
    } catch (e) {
      console.warn(`Tavily query failed: "${q}"`, e instanceof Error ? e.message : e);
    }
  }

  return all;
}
