import "server-only";
import { prisma } from "@/lib/prisma";
import { tavilyMultiSearch, isTavilyConfigured } from "@/lib/tavily";
import { groqGenerate, isGroqConfigured } from "@/lib/groq";
import type { DealView } from "@/types";

export interface SkipTraceResult {
  phone?: string;
  email?: string;
  ownerName?: string;
  confidence: "high" | "medium" | "low";
  source?: string;
}

/**
 * Attempt to find the owner's phone and/or email using free web search.
 * Searches TruePeopleSearch, FastPeopleSearch, WhitePages for the owner's
 * contact info given their name and address.
 *
 * Returns null if skip tracing is not possible (no Tavily key, no owner name).
 */
export async function skipTraceDeal(deal: DealView): Promise<SkipTraceResult | null> {
  if (!isTavilyConfigured()) return null;
  if (!deal.ownerName && !deal.address) return null;

  // Already has both phone and email — nothing to do
  if (deal.ownerPhone && deal.ownerEmail) return null;

  const name    = deal.ownerName ?? "";
  const address = deal.address ?? "";
  const city    = deal.city ?? "Houston";
  const state   = "TX";

  // Build targeted search queries
  const queries: string[] = [];

  if (name) {
    queries.push(`"${name}" "${city}" ${state} phone number contact`);
    queries.push(`site:truepeoplesearch.com "${name}" Texas`);
    queries.push(`site:fastpeoplesearch.com "${name}" ${state}`);
  }

  if (address) {
    queries.push(`"${address}" owner contact phone Houston TX`);
  }

  try {
    const results = await tavilyMultiSearch(queries, 5);
    if (results.length === 0) return null;

    // Use Groq to extract structured contact info from search results
    const snippet = results
      .slice(0, 8)
      .map((r) => `SOURCE: ${r.url}\n${r.title}\n${r.content}`)
      .join("\n\n---\n\n")
      .slice(0, 4000);

    if (!isGroqConfigured()) return null;

    const prompt = `Extract contact information for a real estate property owner from these search results.
Property: ${address}, ${city}, ${state}
Owner name: ${name || "unknown"}

Search results:
${snippet}

Reply with STRICT JSON only, no explanation:
{
  "phone": "E.164 format like +12135550000 or null",
  "email": "email@example.com or null",
  "ownerName": "Full name if found or null",
  "confidence": "high|medium|low",
  "source": "website name where contact was found or null"
}

Rules:
- Only extract real phone numbers (10 digits, US format)
- Do NOT invent data — return null for fields you cannot confirm
- confidence=high means the name AND address clearly match the result
- confidence=low means name alone matches without address confirmation`;

    const raw = await groqGenerate({ prompt, maxTokens: 300, temperature: 0 });
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]) as SkipTraceResult;

    // Basic validation — reject clearly invalid data
    if (parsed.phone && !/^\+1\d{10}$/.test(parsed.phone.replace(/[\s\-().]/g, ""))) {
      parsed.phone = undefined;
    }
    if (parsed.email && !parsed.email.includes("@")) {
      parsed.email = undefined;
    }

    // Only trust medium/high confidence results
    if (parsed.confidence === "low") return null;

    return parsed;
  } catch (e) {
    console.error(`skipTraceDeal failed for ${address}:`, e instanceof Error ? e.message : e);
    return null;
  }
}

/**
 * Run skip trace on a deal and patch the DB record with any found contact info.
 * Returns true if any new contact info was saved.
 */
export async function skipTraceAndUpdate(deal: DealView): Promise<boolean> {
  const result = await skipTraceDeal(deal);
  if (!result) return false;

  const patch: Record<string, string> = {};
  if (result.phone && !deal.ownerPhone) patch.ownerPhone = result.phone;
  if (result.email && !deal.ownerEmail) patch.ownerEmail = result.email;
  if (result.ownerName && !deal.ownerName) patch.ownerName = result.ownerName;

  if (Object.keys(patch).length === 0) return false;

  try {
    await prisma.deal.update({ where: { id: deal.id }, data: patch });
    console.log(`🔍 Skip trace hit for ${deal.address}:`, patch);
    return true;
  } catch (e) {
    console.error(`skipTraceAndUpdate DB patch failed:`, e);
    return false;
  }
}
