import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { env, features } from "./env";
import { geminiGenerate } from "./gemini";
import { groqGenerate, isGroqConfigured } from "./groq";
import { tavilyMultiSearch, isTavilyConfigured } from "./tavily";
import { verifyProperty } from "./property-data";
import { MAO_ARV_MULTIPLIER, DEAL_TYPES } from "@/constants/config";
import type {
  ScanInput,
  ScoredDeal,
  DealAnalysis,
  Verdict,
  SequenceMessage,
  ReplyAnalysis,
  BuyerPitch,
  DealContext,
  ScoredBuyer,
  BuyerScanInput,
} from "@/types";
import type { DealType, ScriptType } from "@prisma/client";
import {
  mockDeals,
  mockAnalysis,
  mockScript,
  mockSmsSequence,
  mockBuyerPitch,
  mockReplyAnalysis,
  mockBuyers,
  verdictFromScore,
} from "./mock";

/**
 * Single home for every Claude call. Each generator degrades to lib/mock.ts
 * when ANTHROPIC_API_KEY is unset or the call fails, so the product is always
 * explorable and never hard-crashes on the AI dependency.
 */
export const CLAUDE_MODEL = "claude-sonnet-4-5"; // bump to claude-sonnet-4-6 for the latest Sonnet
export const CLAUDE_MODEL_FAST = "claude-haiku-4-5-20251001";

let client: Anthropic | null = null;
export function getClaude(): Anthropic | null {
  if (!features.anthropic) return null;
  if (!client) client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY! });
  return client;
}
export function isClaudeConfigured(): boolean {
  return features.anthropic || features.groq || features.gemini;
}

interface CallOptions {
  system?: string;
  prompt?: string;
  messages?: Anthropic.Messages.MessageParam[];
  model?: string;
  maxTokens?: number;
  temperature?: number;
  webSearch?: boolean;
  webSearchMaxUses?: number;
}

export async function callClaude(opts: CallOptions): Promise<string> {
  const c = getClaude();
  if (c) {
    const messages: Anthropic.Messages.MessageParam[] =
      opts.messages ?? [{ role: "user", content: opts.prompt ?? "" }];

    const tools: Anthropic.Messages.ToolUnion[] | undefined = opts.webSearch
      ? [
          {
            type: "web_search_20250305",
            name: "web_search",
            max_uses: opts.webSearchMaxUses ?? 5,
          },
        ]
      : undefined;

    const response = await c.messages.create({
      model: opts.model ?? CLAUDE_MODEL,
      max_tokens: opts.maxTokens ?? 2048,
      temperature: opts.temperature ?? 0.6,
      ...(opts.system ? { system: opts.system } : {}),
      messages,
      ...(tools ? { tools } : {}),
    });

    return response.content
      .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
  }

  // Groq: fast free LLM (Llama 3.3 70B) — primary free engine for scripts/analysis.
  if (isGroqConfigured()) {
    return groqGenerate({
      system: opts.system,
      prompt: opts.prompt ?? "",
      maxTokens: opts.maxTokens,
      temperature: opts.temperature,
    });
  }

  // Gemini: fallback with Google Search grounding.
  if (features.gemini) {
    return geminiGenerate({
      system: opts.system,
      prompt: opts.prompt ?? "",
      webSearch: opts.webSearch,
      maxTokens: opts.maxTokens,
      temperature: opts.temperature,
    });
  }

  throw new Error("AI_NOT_CONFIGURED");
}

/** Best-effort JSON extraction from a model response (handles prose + fences). */
export function extractJSON<T = unknown>(text: string): T | null {
  if (!text) return null;
  const cleaned = text.replace(/```json/gi, "```").replace(/```/g, "").trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    // fall through to balanced scan
  }
  const start = cleaned.search(/[[{]/);
  if (start === -1) return null;
  const open = cleaned[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(cleaned.slice(start, i + 1)) as T;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

// ---- coercion helpers ----
function num(v: unknown): number | undefined {
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  if (typeof v === "string") {
    const n = Number(v.replace(/[^0-9.\-]/g, ""));
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}
function clampScore(v: unknown, fallback = 70): number {
  const n = num(v);
  if (n === undefined) return fallback;
  return Math.max(0, Math.min(100, Math.round(n)));
}
function asDealType(v: unknown): DealType {
  const s = String(v ?? "").toUpperCase().replace(/[\s-]+/g, "_");
  return (DEAL_TYPES as readonly string[]).includes(s) ? (s as DealType) : "OTHER";
}
function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function coerceDeal(raw: Record<string, unknown>, city: string, state?: string): ScoredDeal | null {
  const address = str(raw.address);
  if (!address) return null;
  const arv = num(raw.arv);
  const repairCost = num(raw.repairCost ?? raw.repairs);
  let offerPrice = num(raw.offerPrice ?? raw.offer);
  if (offerPrice === undefined && arv !== undefined) {
    offerPrice = Math.max(0, Math.round(arv * MAO_ARV_MULTIPLIER - (repairCost ?? 0)));
  }
  const assignmentFee = num(raw.assignmentFee) ?? 10000;
  const profit = num(raw.profit) ?? assignmentFee;
  const dealType = asDealType(raw.dealType);

  // Deterministic score. The LLM's own "score" comes back on an inconsistent
  // scale (often 0-1, which rounded to "1" for every deal), so we compute it
  // from the deal's real economics + motivation, and only blend in the model's
  // number when it's a sane 0-100 value.
  const profitVal = profit ?? assignmentFee ?? 0;
  const marginPct = arv && arv > 0 ? profitVal / arv : 0;
  const MOTIVATION: Record<string, number> = {
    PROBATE: 85, FORECLOSURE: 82, TAX_DELINQUENT: 80, INHERITED: 78,
    DIVORCE: 76, ABSENTEE: 74, CODE_VIOLATION: 72, VACANT: 70, OTHER: 58,
  };
  const motivationScore = MOTIVATION[dealType] ?? 58;
  const profitScore = Math.max(0, Math.min(100, Math.round((profitVal / 20000) * 100)));
  const marginScore = Math.max(0, Math.min(100, Math.round((marginPct / 0.30) * 100)));
  const computed = Math.round(profitScore * 0.45 + marginScore * 0.25 + motivationScore * 0.30);
  const aiScore = num(raw.score);
  const score = Math.max(1, Math.min(100,
    aiScore !== undefined && aiScore >= 20 && aiScore <= 100
      ? Math.round(computed * 0.7 + aiScore * 0.3)
      : computed,
  ));

  return {
    address,
    city: str(raw.city) ?? city,
    state: str(raw.state) ?? state,
    zipCode: str(raw.zipCode ?? raw.zip),
    situation: str(raw.situation) ?? "Motivated seller.",
    dealType,
    source: str(raw.source) ?? "web",
    sourceUrl: str(raw.sourceUrl ?? raw.url),
    ownerName: str(raw.ownerName),
    ownerPhone: str(raw.ownerPhone ?? raw.phone),
    ownerEmail: str(raw.ownerEmail ?? raw.email),
    arv,
    listPrice: num(raw.listPrice),
    repairCost,
    offerPrice,
    assignmentFee,
    profit,
    score,
    motivationScore,
    profitScore,
    contactDifficulty: clampScore(raw.contactDifficulty, 50),
    verdict: (str(raw.verdict)?.toUpperCase() as Verdict) || verdictFromScore(score),
    aiSummary: str(raw.aiSummary ?? raw.summary),
    tags: Array.isArray(raw.tags) ? raw.tags.filter((t): t is string => typeof t === "string") : [],
  };
}

// ---- Generators ----------------------------------------------------------

/**
 * Truth filter: verify each candidate address against a real property database.
 * - Address found  → keep it, overwrite owner/ARV with the REAL county data.
 * - Address absent → drop it (it was hallucinated).
 * - API error      → keep it unverified (don't lose data on a transient hiccup).
 * If no property API is configured, returns the list unchanged.
 */
async function verifyDeals(deals: ScoredDeal[]): Promise<ScoredDeal[]> {
  // Always runs: paid key (Regrid/Estated) gives real owner+value; otherwise the
  // free Census geocoder at least confirms the address physically exists.
  const out: ScoredDeal[] = [];
  for (const d of deals) {
    try {
      const real = await verifyProperty(d.address, d.city ?? "", d.state ?? "");
      if (real === null) continue; // address doesn't exist → drop the hallucination
      const extraTags: string[] = ["verified", real.provider];
      if (real.absentee) extraTags.push("absentee-owner");
      if (real.mailAddress) extraTags.push(`mail: ${real.mailAddress}`);
      out.push({
        ...d,
        address: real.normalizedAddress ?? d.address,
        zipCode: real.zip ?? d.zipCode,
        ownerName: real.ownerName ?? d.ownerName,
        arv: real.estValue ?? d.arv,
        // Absentee owners (mail city ≠ property city) are higher-motivation leads
        motivationScore: real.absentee
          ? Math.min(100, (d.motivationScore ?? 60) + 15)
          : d.motivationScore,
        source: "verified",
        tags: Array.from(new Set([...(d.tags ?? []), ...extraTags])),
      });
    } catch {
      out.push(d); // transient API error → keep the lead, just unverified
    }
  }
  return out;
}

export async function findDeals(input: ScanInput): Promise<ScoredDeal[]> {
  if (!isClaudeConfigured()) return mockDeals(input.city, input.limit ?? 5);
  const limit = input.limit ?? 6;
  const cityState = `${input.city}${input.state ? `, ${input.state}` : ""}`;

  // ── Tavily: real web search for motivated seller listings ─────────────────
  if (isTavilyConfigured()) {
    try {
      // Target FREE, low-competition, genuinely-motivated sellers:
      // FSBO, by-owner, tired landlords, urgent/distressed — NOT public tax/HUD lists
      // that every wholesaler already scrapes.
      const queries = [
        `${cityState} for sale by owner house "must sell" OR "as-is" OR "cash only" site:craigslist.org`,
        `${cityState} FSBO house owner "motivated" OR "needs work" OR "fixer" site:zillow.com OR site:facebook.com/marketplace`,
        `${cityState} "for rent by owner" tired landlord selling rental property as-is`,
        `${cityState} house for sale by owner "moving" OR "relocating" OR "inherited" OR "divorce" OR "estate sale"`,
        `"${input.city}" owner financing OR "quick sale" OR "below market" house craigslist OR facebook`,
        `${cityState} expired listing FSBO distressed house owner contact phone`,
      ];

      const results = await tavilyMultiSearch(queries, 5);
      if (results.length === 0) throw new Error("no Tavily results");

      const searchContext = results
        .slice(0, 12)
        .map((r, i) => `[${i + 1}] ${r.title}\nURL: ${r.url}\n${r.content.slice(0, 400)}`)
        .join("\n\n---\n\n");

      const system = `You are a real estate wholesaling analyst. Extract REAL motivated-seller properties from the search results below. Only use addresses and details explicitly mentioned in the search results — NEVER fabricate. Reply STRICT JSON only.`;

      const prompt = `Extract up to ${limit} real motivated-seller / distressed single-family properties in ${cityState} from these search results:

${searchContext}

For each real property found, estimate wholesaler numbers (ARV from market, repairs from condition, offer = ARV*0.70 - repairs, assignment $8k-$20k).

Return ONLY a JSON array (empty [] if none found):
[{"address","city","state","situation","dealType":"PROBATE|FORECLOSURE|VACANT|TAX_DELINQUENT|ABSENTEE|INHERITED|DIVORCE|CODE_VIOLATION|OTHER","source","sourceUrl","ownerName","ownerPhone","arv","listPrice","repairCost","offerPrice","assignmentFee","profit","score","motivationScore","profitScore","contactDifficulty","verdict":"GO|CAUTION|PASS","aiSummary","tags":[]}]`;

      const text = await callClaude({ system, prompt, maxTokens: 4096, temperature: 0.3 });
      const parsed = extractJSON<Record<string, unknown>[]>(text);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const deals = parsed
          .map((r) => coerceDeal(r, input.city.split(",")[0].trim(), input.state))
          .filter((d): d is ScoredDeal => d !== null)
          .sort((a, b) => b.score - a.score);
        if (deals.length > 0) {
          const verified = await verifyDeals(deals);
          console.log(`[findDeals] ${verified.length}/${deals.length} verified real in ${cityState}`);
          if (verified.length > 0) return verified;
        }
      }
    } catch (e) {
      console.error("[findDeals] Tavily pipeline failed:", e instanceof Error ? e.message : e);
    }
  }

  // ── Fallback: LLM only (Anthropic with web search, or Gemini) ────────────
  const typesLine = input.dealTypes?.length
    ? `Prioritize: ${input.dealTypes.join(", ")}.`
    : "All distress types.";

  const system = `You are an expert real estate wholesaling acquisitions analyst. Use web search to find REAL distressed properties. Never fabricate addresses. Reply STRICT JSON only.`;
  const prompt = `Find up to ${limit} motivated-seller properties in ${cityState}. ${typesLine}
Return ONLY a JSON array:
[{"address","city","state","situation","dealType":"PROBATE|FORECLOSURE|VACANT|TAX_DELINQUENT|ABSENTEE|INHERITED|DIVORCE|CODE_VIOLATION|OTHER","source","sourceUrl","ownerName","ownerPhone","arv","listPrice","repairCost","offerPrice","assignmentFee","profit","score","motivationScore","profitScore","contactDifficulty","verdict":"GO|CAUTION|PASS","aiSummary","tags":[]}]`;

  try {
    const text = await callClaude({ system, prompt, maxTokens: 4096, temperature: 0.4, webSearch: true, webSearchMaxUses: 6 });
    const parsed = extractJSON<Record<string, unknown>[]>(text);
    if (!Array.isArray(parsed) || parsed.length === 0) return mockDeals(input.city, limit);
    const deals = parsed
      .map((r) => coerceDeal(r, input.city.split(",")[0].trim(), input.state))
      .filter((d): d is ScoredDeal => d !== null)
      .sort((a, b) => b.score - a.score);
    return deals.length ? deals : mockDeals(input.city, limit);
  } catch (e) {
    console.error("findDeals LLM fallback failed:", e);
    return mockDeals(input.city, limit);
  }
}

export interface ScoreResult {
  score: number;
  motivationScore: number;
  profitScore: number;
  contactDifficulty: number;
  verdict: Verdict;
  aiSummary: string;
  arv?: number;
  repairCost?: number;
  offerPrice?: number;
  profit?: number;
}

export async function scoreDeal(deal: DealContext): Promise<ScoreResult> {
  const fallback = (): ScoreResult => {
    const arv = deal.arv;
    const repairCost = deal.repairCost;
    const offerPrice =
      deal.offerPrice ??
      (arv !== undefined ? Math.max(0, Math.round(arv * MAO_ARV_MULTIPLIER - (repairCost ?? 0))) : undefined);
    const profit = deal.profit ?? deal.assignmentFee ?? 10000;
    const motivationScore = 72;
    const profitScore = arv ? clampScore(45 + (profit / arv) * 600) : 65;
    const contactDifficulty = 50;
    const score = clampScore(motivationScore * 0.5 + profitScore * 0.35 + (100 - contactDifficulty) * 0.15);
    return {
      score,
      motivationScore,
      profitScore,
      contactDifficulty,
      verdict: verdictFromScore(score),
      aiSummary: `${verdictFromScore(score)} — estimated spread looks ${score >= 78 ? "strong" : score >= 60 ? "workable" : "thin"} based on the numbers provided.`,
      arv,
      repairCost,
      offerPrice,
      profit,
    };
  };
  if (!isClaudeConfigured()) return fallback();

  const system = `You are a real estate wholesaling deal analyst. Reply with STRICT JSON only.`;
  const prompt = `Score this lead for a wholesaler. If financials are missing, estimate them conservatively.
Address: ${deal.address}, ${deal.city ?? ""}
Situation: ${deal.situation ?? "unknown"}
Type: ${deal.dealType ?? "OTHER"}
ARV: ${deal.arv ?? "unknown"}
Repairs: ${deal.repairCost ?? "unknown"}
Offer: ${deal.offerPrice ?? "unknown"}

Return ONLY:
{"score","motivationScore","profitScore","contactDifficulty","verdict":"GO|CAUTION|PASS","aiSummary","arv","repairCost","offerPrice","profit"}`;
  try {
    const text = await callClaude({ system, prompt, maxTokens: 700, temperature: 0.3 });
    const raw = extractJSON<Record<string, unknown>>(text);
    if (!raw) return fallback();
    const score = clampScore(raw.score, 70);
    return {
      score,
      motivationScore: clampScore(raw.motivationScore, score),
      profitScore: clampScore(raw.profitScore, score),
      contactDifficulty: clampScore(raw.contactDifficulty, 50),
      verdict: (str(raw.verdict)?.toUpperCase() as Verdict) || verdictFromScore(score),
      aiSummary: str(raw.aiSummary) ?? fallback().aiSummary,
      arv: num(raw.arv) ?? deal.arv,
      repairCost: num(raw.repairCost) ?? deal.repairCost,
      offerPrice: num(raw.offerPrice) ?? deal.offerPrice,
      profit: num(raw.profit) ?? deal.profit,
    };
  } catch (e) {
    console.error("scoreDeal failed, using fallback:", e);
    return fallback();
  }
}

export async function generateScript(
  deal: DealContext,
  type: ScriptType,
  tone: string = "warm",
): Promise<string> {
  if (!isClaudeConfigured()) return mockScript(type, deal);
  const system = `You are an elite real estate wholesaling copywriter. Write natural, human, high-converting outreach. Never sound like a robot or a scam. Always TCPA-friendly (include an opt-out for texts).`;
  const prompt = `Write a ${type.replace("_", " ").toLowerCase()} for this lead, ${tone} tone.
Address: ${deal.address}, ${deal.city ?? ""}
Owner: ${deal.ownerName ?? "the owner"}
Situation: ${deal.situation ?? "motivated seller"}
Offer: ${deal.offerPrice ? `$${deal.offerPrice.toLocaleString()}` : "fair cash offer"}
${type === "COLD_CALL" || type === "NEGOTIATION" ? "Include objection handlers." : ""}
Return only the script text, ready to use.`;
  try {
    const text = await callClaude({ system, prompt, maxTokens: 900, temperature: 0.7 });
    return text || mockScript(type, deal);
  } catch (e) {
    console.error("generateScript failed, using mock:", e);
    return mockScript(type, deal);
  }
}

export async function generateSmsSequence(deal: DealContext): Promise<SequenceMessage[]> {
  if (!isClaudeConfigured()) return mockSmsSequence(deal);
  const system = `You write high-converting, human SMS for real estate wholesalers. Each message < 160 characters, includes a soft opt-out ("Reply STOP to opt out"), TCPA-compliant. Reply with STRICT JSON only.`;
  const prompt = `Write a 7-message SMS sequence to a motivated seller.
Owner: ${deal.ownerName ?? "the owner"}; Property: ${deal.address}, ${deal.city ?? ""}; Situation: ${deal.situation ?? "motivated"}.
Cadence days: 0 (first), 1, 3, 7, 14, 30, 60 (re-engage).
Return ONLY a JSON array of 7 objects: {"day","label","message"} in order.`;
  try {
    const text = await callClaude({ system, prompt, maxTokens: 1200, temperature: 0.7 });
    const parsed = extractJSON<Record<string, unknown>[]>(text);
    if (!Array.isArray(parsed) || parsed.length === 0) return mockSmsSequence(deal);
    return parsed.map((r, i) => ({
      step: i,
      day: num(r.day) ?? [0, 1, 3, 7, 14, 30, 60][i] ?? i,
      label: str(r.label) ?? `Message ${i + 1}`,
      message: str(r.message) ?? "",
    })).filter((m) => m.message);
  } catch (e) {
    console.error("generateSmsSequence failed, using mock:", e);
    return mockSmsSequence(deal);
  }
}

export interface AnalyzeInput {
  address?: string;
  city?: string;
  arv?: number;
  repairCost?: number;
  offerPrice?: number;
  assignmentFee?: number;
  withComps?: boolean;
}

export async function analyzeDeal(input: AnalyzeInput): Promise<DealAnalysis> {
  const base = mockAnalysis(input);
  if (!isClaudeConfigured() || !input.withComps || !input.address) return base;
  const system = `You are a real estate analyst. Use web search to pull recent comparable sales near the subject and refine ARV. Reply with STRICT JSON only.`;
  const prompt = `Subject: ${input.address}, ${input.city ?? ""}.
Current assumptions — ARV: ${input.arv ?? base.arv}, repairs: ${input.repairCost ?? base.repairCost}, offer: ${input.offerPrice ?? base.offerPrice}.
Find 3-5 recent nearby comps, refine ARV, and assess the deal (MAO = ARV*0.70 - repairs).
Return ONLY:
{"arv","repairCost","offerPrice","mao","assignmentFee","profit","marginPct","strength","verdict":"GO|CAUTION|PASS","reasoning","comps":[{"address","soldPrice","beds","baths","sqft","distanceMi","soldDate","url"}],"negotiation","counters":[{"ifTheyCounter","youRespond"}]}`;
  try {
    const text = await callClaude({ system, prompt, maxTokens: 2500, temperature: 0.4, webSearch: true, webSearchMaxUses: 5 });
    const raw = extractJSON<Record<string, unknown>>(text);
    if (!raw) return base;
    const arv = num(raw.arv) ?? base.arv;
    const repairCost = num(raw.repairCost) ?? base.repairCost;
    const mao = num(raw.mao) ?? Math.max(0, Math.round(arv * MAO_ARV_MULTIPLIER - repairCost));
    const offerPrice = num(raw.offerPrice) ?? base.offerPrice;
    const assignmentFee = num(raw.assignmentFee) ?? base.assignmentFee;
    const profit = num(raw.profit) ?? assignmentFee;
    return {
      arv,
      repairCost,
      offerPrice,
      mao,
      assignmentFee,
      profit,
      marginPct: num(raw.marginPct) ?? Math.round((profit / Math.max(arv, 1)) * 1000) / 10,
      strength: clampScore(raw.strength, base.strength),
      verdict: (str(raw.verdict)?.toUpperCase() as Verdict) || base.verdict,
      reasoning: str(raw.reasoning) ?? base.reasoning,
      comps: Array.isArray(raw.comps) ? (raw.comps as DealAnalysis["comps"]) : base.comps,
      negotiation: str(raw.negotiation) ?? base.negotiation,
      counters: Array.isArray(raw.counters) ? (raw.counters as DealAnalysis["counters"]) : base.counters,
    };
  } catch (e) {
    console.error("analyzeDeal failed, using base:", e);
    return base;
  }
}

export async function generateBuyerPitch(deal: DealContext): Promise<BuyerPitch> {
  if (!isClaudeConfigured()) return mockBuyerPitch(deal);
  const system = `You write punchy off-market deal blasts to cash buyers. Reply with STRICT JSON only: {"subject","body"}.`;
  const prompt = `Write a buyer pitch for this assignment deal.
${deal.address}, ${deal.city ?? ""}. Situation: ${deal.situation ?? "motivated seller"}.
ARV ${deal.arv ?? "TBD"}, repairs ${deal.repairCost ?? "TBD"}, your price ${deal.offerPrice ?? "TBD"}, spread ${deal.profit ?? "TBD"}.
Return ONLY {"subject","body"}.`;
  try {
    const text = await callClaude({ system, prompt, maxTokens: 700, temperature: 0.7 });
    const raw = extractJSON<Record<string, unknown>>(text);
    if (!raw) return mockBuyerPitch(deal);
    return {
      subject: str(raw.subject) ?? mockBuyerPitch(deal).subject,
      body: str(raw.body) ?? mockBuyerPitch(deal).body,
    };
  } catch (e) {
    console.error("generateBuyerPitch failed, using mock:", e);
    return mockBuyerPitch(deal);
  }
}

export async function analyzeReply(message: string): Promise<ReplyAnalysis> {
  if (!isClaudeConfigured()) return mockReplyAnalysis(message);
  const system = `You analyze inbound SMS replies from property owners for a wholesaler and draft the next response. Reply with STRICT JSON only.`;
  const prompt = `Owner replied: "${message}"
Classify and draft a reply.
Return ONLY:
{"sentiment":"interested|not_interested|question|hostile|neutral","confidence":0-1,"summary","suggestedReply","markHot":bool,"stopSequence":bool}`;
  try {
    const text = await callClaude({ system, prompt, maxTokens: 500, temperature: 0.4, model: CLAUDE_MODEL_FAST });
    const raw = extractJSON<Record<string, unknown>>(text);
    if (!raw) return mockReplyAnalysis(message);
    const fb = mockReplyAnalysis(message);
    const sentiment = str(raw.sentiment) as ReplyAnalysis["sentiment"];
    return {
      sentiment: ["interested", "not_interested", "question", "hostile", "neutral"].includes(sentiment ?? "")
        ? sentiment
        : fb.sentiment,
      confidence: num(raw.confidence) ?? fb.confidence,
      summary: str(raw.summary) ?? fb.summary,
      suggestedReply: str(raw.suggestedReply) ?? fb.suggestedReply,
      markHot: typeof raw.markHot === "boolean" ? raw.markHot : fb.markHot,
      stopSequence: typeof raw.stopSequence === "boolean" ? raw.stopSequence : fb.stopSequence,
    };
  } catch (e) {
    console.error("analyzeReply failed, using mock:", e);
    return mockReplyAnalysis(message);
  }
}

export async function dailyInsight(context: {
  name?: string;
  city?: string;
  newDeals: number;
  followUpsDue: number;
  topDeal?: { address: string; score: number; profit?: number };
}): Promise<string> {
  const fallback = context.topDeal
    ? `Your best move today: ${context.topDeal.address} — a ${context.topDeal.score}/100 lead with an estimated $${(context.topDeal.profit ?? 0).toLocaleString()} spread. Send the first text before noon.`
    : `You have ${context.newDeals} new deals and ${context.followUpsDue} follow-ups due. Knock out the follow-ups first.`;
  if (!isClaudeConfigured()) return fallback;
  try {
    const text = await callClaude({
      system: "You are a sharp real estate wholesaling coach. One punchy, specific insight, max 2 sentences.",
      prompt: `${context.newDeals} new deals, ${context.followUpsDue} follow-ups due in ${context.city ?? "their markets"}. Top deal: ${context.topDeal ? `${context.topDeal.address}, score ${context.topDeal.score}, spread $${context.topDeal.profit ?? 0}` : "none"}. Give the single best action for today.`,
      maxTokens: 200,
      temperature: 0.6,
      model: CLAUDE_MODEL_FAST,
    });
    return text || fallback;
  } catch {
    return fallback;
  }
}

function coerceBuyer(raw: Record<string, unknown>): ScoredBuyer | null {
  const name = str(raw.name) ?? str(raw.company);
  if (!name) return null;
  return {
    name,
    company: str(raw.company),
    email: str(raw.email),
    phone: str(raw.phone),
    website: str(raw.website ?? raw.url),
    cities: Array.isArray(raw.cities)
      ? raw.cities.filter((c): c is string => typeof c === "string")
      : [],
    minPrice: num(raw.minPrice),
    maxPrice: num(raw.maxPrice),
    buyerType: str(raw.buyerType),
    evidence: str(raw.evidence),
    source: str(raw.source),
    sourceUrl: str(raw.sourceUrl ?? raw.url),
  };
}

export async function findBuyers(input: BuyerScanInput): Promise<ScoredBuyer[]> {
  if (!isClaudeConfigured()) return mockBuyers(input.city, input.limit ?? 6);
  const limit = input.limit ?? 8;
  const cityState = `${input.city}${input.state ? `, ${input.state}` : ""}`;

  // ── Tavily: real buyer search ─────────────────────────────────────────────
  if (isTavilyConfigured()) {
    try {
      const queries = [
        `"we buy houses" ${cityState} cash buyer investor phone contact`,
        `${cityState} real estate investor cash buyer flipper landlord buy homes`,
        `${cityState} house buyer company BBB reviews contact number`,
      ];
      const results = await tavilyMultiSearch(queries, 5);
      if (results.length > 0) {
        const context = results
          .slice(0, 10)
          .map((r, i) => `[${i + 1}] ${r.title}\nURL: ${r.url}\n${r.content.slice(0, 350)}`)
          .join("\n\n---\n\n");

        const system = `You are a real estate dispositions expert. Extract REAL active cash buyers from search results. Only include buyers with verifiable names, companies, or phone numbers found in the results. Never fabricate. Reply STRICT JSON only.`;
        const prompt = `Extract up to ${limit} real cash buyers/investors in ${cityState} from:

${context}

Return ONLY a JSON array ([] if none found):
[{"name","company","email","phone","website","cities":["${input.city}"],"minPrice","maxPrice","buyerType":"flipper|landlord|wholesaler|ibuyer","evidence","source","sourceUrl"}]`;

        const text = await callClaude({ system, prompt, maxTokens: 3000, temperature: 0.3 });
        const parsed = extractJSON<Record<string, unknown>[]>(text);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const buyers = parsed.map(coerceBuyer).filter((b): b is ScoredBuyer => b !== null);
          if (buyers.length > 0) {
            console.log(`[findBuyers] Tavily+AI found ${buyers.length} real buyers in ${cityState}`);
            return buyers;
          }
        }
      }
    } catch (e) {
      console.error("[findBuyers] Tavily pipeline failed:", e instanceof Error ? e.message : e);
    }
  }

  // ── Fallback: LLM with web search ─────────────────────────────────────────
  const system = `You are a real estate dispositions expert. Find REAL active cash buyers. Never fabricate. Reply STRICT JSON only.`;
  const prompt = `Find up to ${limit} active cash buyers in ${cityState}.
Return ONLY a JSON array:
[{"name","company","email","phone","website","cities":[],"minPrice","maxPrice","buyerType":"flipper|landlord|wholesaler|ibuyer","evidence","source","sourceUrl"}]`;
  try {
    const text = await callClaude({ system, prompt, maxTokens: 3500, temperature: 0.4, webSearch: true, webSearchMaxUses: 6 });
    const parsed = extractJSON<Record<string, unknown>[]>(text);
    if (!Array.isArray(parsed) || parsed.length === 0) return mockBuyers(input.city, limit);
    const buyers = parsed.map(coerceBuyer).filter((b): b is ScoredBuyer => b !== null);
    return buyers.length ? buyers : mockBuyers(input.city, limit);
  } catch (e) {
    console.error("findBuyers failed:", e);
    return mockBuyers(input.city, limit);
  }
}
