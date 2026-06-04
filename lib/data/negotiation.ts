import "server-only";
import { groqGenerate, isGroqConfigured } from "@/lib/groq";
import { MAO_ARV_MULTIPLIER } from "@/constants/config";
import type { DealView } from "@/types";

/**
 * Negotiation copilot. Numbers are computed deterministically (never hallucinated);
 * the AI only handles language — objection rebuttals, talking points, and live
 * suggested responses. It will never coach above your MAO.
 */

export interface ObjectionHandler { objection: string; response: string }

export interface NegotiationPlaybook {
  mao: number | null;          // max allowable offer (your ceiling)
  openingOffer: number | null; // where to start
  walkAway: number | null;     // never go above this
  counterLadder: number[];     // suggested counter steps opening → MAO
  objectionHandlers: ObjectionHandler[];
  talkingPoints: string[];
  summary: string;
}

const DEFAULT_ASSIGNMENT = 10000;

/** MAO = ARV×0.70 − repairs − your assignment fee. Your max offer to the seller. */
export function computeMao(deal: DealView): number | null {
  if (deal.arv == null) return null;
  const fee = deal.assignmentFee ?? DEFAULT_ASSIGNMENT;
  return Math.max(0, Math.round(deal.arv * MAO_ARV_MULTIPLIER - (deal.repairCost ?? 0) - fee));
}

const DEFAULT_OBJECTIONS: ObjectionHandler[] = [
  { objection: "“Your offer is too low.”", response: "I hear you. My number reflects the repairs and that I'm paying all cash with no fees or commissions — you net this amount clean. What number were you hoping for?" },
  { objection: "“I need more time to think.”", response: "Totally fair — no pressure. Can I check back in a few days? In the meantime, is there anything about the offer I can make clearer?" },
  { objection: "“A realtor said I could get more.”", response: "On the open market, maybe — but that's months of showings, repairs, and 6% commission. I close fast, as-is, on your date. When you factor that in, how do the two compare for you?" },
];

export async function getNegotiationPlaybook(deal: DealView): Promise<NegotiationPlaybook> {
  const mao = computeMao(deal);
  const opening = mao != null ? Math.round(mao * 0.85) : null;
  const ladder =
    mao != null && opening != null && mao > opening
      ? [opening, Math.round(opening + (mao - opening) * 0.4), Math.round(opening + (mao - opening) * 0.75), mao]
      : mao != null ? [mao] : [];

  let objectionHandlers = DEFAULT_OBJECTIONS;
  let talkingPoints: string[] = [];
  let summary = "";

  if (isGroqConfigured()) {
    const prompt = `You are coaching a real estate wholesaler negotiating to BUY a house.
Property: ${deal.address}, ${deal.city ?? ""}. Seller: ${deal.ownerName ?? "the owner"}.
Situation: ${deal.situation ?? "motivated seller"}.
Your MAX offer (never exceed): $${mao ?? "unknown"}. Suggested opening: $${opening ?? "unknown"}.
Reply STRICT JSON only:
{"talkingPoints":["3-5 short persuasion points: cash, as-is, no fees, close on their timeline, certainty"],"objectionHandlers":[{"objection":"...","response":"..."}],"summary":"2-sentence strategy for this specific seller"}`;
    try {
      const raw = await groqGenerate({ prompt, maxTokens: 700, temperature: 0.5 });
      const m = raw.match(/\{[\s\S]*\}/);
      if (m) {
        const p = JSON.parse(m[0]) as Partial<NegotiationPlaybook>;
        if (Array.isArray(p.talkingPoints)) talkingPoints = p.talkingPoints.slice(0, 6);
        if (Array.isArray(p.objectionHandlers) && p.objectionHandlers.length) objectionHandlers = p.objectionHandlers.slice(0, 5);
        if (typeof p.summary === "string") summary = p.summary;
      }
    } catch { /* keep defaults */ }
  }

  return { mao, openingOffer: opening, walkAway: mao, counterLadder: ladder, objectionHandlers, talkingPoints, summary };
}

/** Live: the seller just said X — what should the wholesaler say back? Stays ≤ MAO. */
export async function getLiveResponse(
  deal: DealView,
  sellerSaid: string,
  history: { role: "seller" | "you"; text: string }[] = [],
): Promise<string> {
  const mao = computeMao(deal);
  if (!isGroqConfigured()) {
    return "Acknowledge their point, restate your cash/as-is/no-fees value, and ask what number would work for them — without going above your max.";
  }
  const convo = history.map((h) => `${h.role === "seller" ? "Seller" : "You"}: ${h.text}`).join("\n");
  const prompt = `You are a real estate wholesaler's live negotiation coach (the wholesaler is BUYING).
Property: ${deal.address}. Seller: ${deal.ownerName ?? "owner"}.
YOUR HARD MAX OFFER: $${mao ?? "unknown"} — NEVER suggest going above this. If the seller demands more, coach to hold firm or politely walk.
${convo ? `Conversation so far:\n${convo}\n` : ""}
The seller just said: "${sellerSaid}"

Give ONLY the exact words the wholesaler should say back — natural, brief (1-3 sentences), confident, never above the max. No preamble.`;
  try {
    return (await groqGenerate({ prompt, maxTokens: 200, temperature: 0.6 })).trim();
  } catch {
    return "Stay calm — restate your value (cash, as-is, no fees, fast close) and ask what number works for them, but hold under your max.";
  }
}
