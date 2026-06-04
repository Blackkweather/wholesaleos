import { NextRequest, NextResponse } from "next/server";
import {
  groqChat,
  isGroqConfigured,
  type GroqMessage,
  type GroqTool,
} from "@/lib/groq";
import { listDeals, dealStageCounts, createDealsFromScored } from "@/lib/data/deals";
import { listBuyers, matchBuyersForDeal, matchBuyersForDealScored } from "@/lib/data/buyers";
import { getMarkets } from "@/lib/data/markets";
import { findDeals, isClaudeConfigured } from "@/lib/claude";
import { getAnalytics } from "@/lib/data/analytics";
import { getFollowUpQueue } from "@/lib/data/follow-ups";
import { scoreDealHybrid } from "@/lib/data/scoring";
import { runLeadSource } from "@/lib/lead-sources";
import { sendDealToBuyers } from "@/lib/data/disposition";
import { apiOk, apiError } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120; // scans can take ~1 min

function money(n?: number | null): string {
  if (!n) return "n/a";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

// ---------------------------------------------------------------------------
// Tools the orchestrator can call — all READ-ONLY / advisory.
// It can report and recommend, but never contacts sellers or buyers.
// ---------------------------------------------------------------------------

const TOOLS: GroqTool[] = [
  {
    type: "function",
    function: {
      name: "get_pipeline_summary",
      description: "Get an overview of the whole pipeline: total deals, counts by stage, hot leads, total estimated spread, and the top-scoring deal. Use this when the user asks 'what's going on', 'status', or 'how are we doing'.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "list_hot_leads",
      description: "List the hottest leads (flagged hot or score >= 70) that need the user's attention, with their numbers and contact status.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "find_deal",
      description: "Look up a specific deal by part of its street address. Returns full details: numbers, owner contact, score, situation.",
      parameters: {
        type: "object",
        properties: { query: { type: "string", description: "Part of the street address, e.g. 'Henry' or 'Adriana'" } },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_buyers",
      description: "List the user's cash buyers, optionally filtered by a price the deal must fall within their min/max budget.",
      parameters: {
        type: "object",
        properties: { withinPrice: { type: "number", description: "Optional: only buyers whose budget range includes this dollar amount" } },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "match_buyers_for_deal",
      description: "Given part of a deal's address, return which cash buyers match it by city and price range — the people you'd JV with or sell the lead to.",
      parameters: {
        type: "object",
        properties: { dealQuery: { type: "string", description: "Part of the deal's street address" } },
        required: ["dealQuery"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "run_deal_scan",
      description: "Run a NEW search for motivated-seller deals and save fresh ones to the pipeline. Use when the user asks to scan, find more deals, or get new leads. Optionally pass a specific city/state (e.g. 'find deals in Spring, TX'); omit to use the configured market. Searches public listings only and contacts nobody. Takes about a minute.",
      parameters: {
        type: "object",
        properties: {
          city: { type: "string", description: "Optional city to scan, e.g. 'Spring'. Omit to use the configured market." },
          state: { type: "string", description: "Optional 2-letter state, e.g. 'TX'." },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "send_deal_to_buyers",
      description: "Email the deal sheet (their price + their spread) to the cash buyers matched to a deal — your OWN buyer list. TWO-STEP and confirm-first: call with confirm=false (or omit) to PREVIEW exactly who would receive it; only call again with confirm=true AFTER the user explicitly replies yes.",
      parameters: {
        type: "object",
        properties: {
          dealQuery: { type: "string", description: "Part of the deal's street address, e.g. 'Rodriguez' or 'Henry Rd'" },
          confirm: { type: "boolean", description: "true ONLY after the user has explicitly confirmed the preview. Otherwise false." },
        },
        required: ["dealQuery"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_analytics",
      description: "Get revenue + conversion analytics: total revenue, average assignment fee, conversion rates (lead→response, response→contract, contract→close), revenue by lead source, and revenue by ZIP. Use for 'which source made the most money', 'which ZIPs produce the highest spreads', 'what are my conversion rates'.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "overdue_followups",
      description: "List leads whose follow-up is due or overdue right now, prioritized. Use for 'what follow-ups are overdue', 'who do I need to follow up with'.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "most_likely_to_close",
      description: "List the highest-scoring active leads (most likely to close), with their lead score. Use for 'show leads most likely to close', 'what are my best leads'.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "explain_lead_score",
      description: "Explain WHY a specific deal is scored GO/CAUTION/PASS, with the component breakdown and reasons. Use for 'why is this lead a GO', 'explain the score for {address}'.",
      parameters: { type: "object", properties: { dealQuery: { type: "string", description: "Part of the deal's street address" } }, required: ["dealQuery"] },
    },
  },
  {
    type: "function",
    function: {
      name: "best_buyers_for_deal",
      description: "Rank the best cash-buyer matches for a deal with confidence %. Use for 'which buyers should get {address}', 'who would buy this'.",
      parameters: { type: "object", properties: { dealQuery: { type: "string", description: "Part of the deal's street address" } }, required: ["dealQuery"] },
    },
  },
  {
    type: "function",
    function: {
      name: "run_lead_source",
      description: "Run an advanced lead-source adapter and save verified leads. Sources: hcad-portfolio (landlords with 5+ properties), hcad-absentee (out-of-state owners), tax-delinquent, probate, code-violation, vacant. Use for 'find portfolio landlords', 'pull probate leads', etc.",
      parameters: { type: "object", properties: { source: { type: "string", description: "adapter id, e.g. hcad-portfolio" } }, required: ["source"] },
    },
  },
];

async function runTool(name: string, args: Record<string, unknown>): Promise<string> {
  switch (name) {
    case "get_pipeline_summary": {
      const deals = await listDeals();
      const counts = await dealStageCounts();
      const active = deals.filter((d) => d.stage !== "DEAD");
      const hot = deals.filter((d) => d.hot || (d.score ?? 0) >= 70);
      const spread = active.reduce((s, d) => s + (d.profit ?? 0), 0);
      const top = [...active].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];
      return JSON.stringify({
        totalDeals: deals.length,
        activeDeals: active.length,
        hotLeads: hot.length,
        byStage: counts,
        totalEstimatedSpread: money(spread),
        topDeal: top ? { address: top.address, score: top.score, spread: money(top.profit) } : null,
      });
    }
    case "list_hot_leads": {
      const deals = await listDeals();
      const hot = deals
        .filter((d) => (d.hot || (d.score ?? 0) >= 70) && d.stage !== "DEAD")
        .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
        .slice(0, 8)
        .map((d) => ({
          address: d.address, city: d.city, score: d.score,
          offer: money(d.offerPrice), spread: money(d.profit),
          hasPhone: Boolean(d.ownerPhone), hasEmail: Boolean(d.ownerEmail),
          situation: d.situation,
        }));
      return JSON.stringify({ count: hot.length, hotLeads: hot });
    }
    case "find_deal": {
      const q = String(args.query ?? "").toLowerCase();
      const deals = await listDeals();
      const d = deals.find((x) => x.address.toLowerCase().includes(q));
      if (!d) return JSON.stringify({ found: false, message: `No deal matching "${args.query}"` });
      return JSON.stringify({
        found: true,
        address: d.address, city: d.city, state: d.state,
        dealType: d.dealType, situation: d.situation, stage: d.stage,
        score: d.score, verdict: d.verdict,
        arv: money(d.arv), offer: money(d.offerPrice), repairs: money(d.repairCost),
        estProfit: money(d.profit),
        owner: d.ownerName, phone: d.ownerPhone ?? "not found yet", email: d.ownerEmail ?? "not found yet",
        source: d.source,
      });
    }
    case "list_buyers": {
      const within = typeof args.withinPrice === "number" ? args.withinPrice : null;
      let buyers = await listBuyers();
      if (within != null) {
        buyers = buyers.filter((b) => (b.minPrice == null || within >= b.minPrice) && (b.maxPrice == null || within <= b.maxPrice));
      }
      return JSON.stringify({
        count: buyers.length,
        buyers: buyers.slice(0, 12).map((b) => ({
          name: b.name, company: b.company, phone: b.phone, email: b.email,
          budget: `${money(b.minPrice)} - ${money(b.maxPrice)}`,
        })),
      });
    }
    case "match_buyers_for_deal": {
      const q = String(args.dealQuery ?? "").toLowerCase();
      const deals = await listDeals();
      const deal = deals.find((x) => x.address.toLowerCase().includes(q));
      if (!deal) return JSON.stringify({ found: false, message: `No deal matching "${args.dealQuery}"` });
      const matches = await matchBuyersForDeal(deal);
      return JSON.stringify({
        deal: deal.address,
        matchCount: matches.length,
        matches: matches.slice(0, 10).map((b) => ({
          name: b.name, company: b.company, phone: b.phone, email: b.email,
        })),
      });
    }
    case "run_deal_scan": {
      if (!isClaudeConfigured()) return JSON.stringify({ error: "AI engine not configured." });
      let city = typeof args.city === "string" && args.city.trim() ? args.city.trim() : undefined;
      let state = typeof args.state === "string" && args.state.trim() ? args.state.trim() : undefined;
      if (!city) {
        const markets = await getMarkets();
        const market = markets.find((m) => m.active) ?? markets[0];
        if (!market) return JSON.stringify({ error: "No market set. Configure one in onboarding first." });
        city = market.city;
        state = market.state ?? undefined;
      }
      const found = await findDeals({ city, state, limit: 6 });
      const saved = await createDealsFromScored(found);
      return JSON.stringify({
        market: `${city}, ${state ?? ""}`.trim(),
        listingsFound: found.length,
        newlyAdded: saved.length,
        alreadyHad: found.length - saved.length,
        newDeals: saved.slice(0, 6).map((d) => ({ address: d.address, score: d.score, offer: money(d.offerPrice) })),
      });
    }
    case "send_deal_to_buyers": {
      const q = String(args.dealQuery ?? "").toLowerCase();
      const deal = (await listDeals()).find((d) => d.address.toLowerCase().includes(q));
      if (!deal) return JSON.stringify({ found: false, message: `No deal matching "${args.dealQuery}"` });
      const emailable = (await matchBuyersForDealScored(deal)).filter((m) => m.buyer.email);
      if (emailable.length === 0) {
        return JSON.stringify({ deal: deal.address, error: "None of the matched buyers have an email on file." });
      }
      if (args.confirm !== true) {
        return JSON.stringify({
          needsConfirmation: true,
          deal: deal.address,
          wouldSendTo: emailable.length,
          buyers: emailable.slice(0, 10).map((m) => m.buyer.company || m.buyer.name),
          note: "PREVIEW ONLY — nothing was sent. Show the user who would receive it and ask them to confirm before sending.",
        });
      }
      const result = await sendDealToBuyers(deal, emailable.map((m) => m.buyer.id));
      return JSON.stringify({
        deal: deal.address,
        sent: result.sent,
        failed: result.failed,
        buyerPrice: money(result.buyerPrice),
        message: result.sent > 0 ? `Sent the deal sheet to ${result.sent} buyer(s) at ${money(result.buyerPrice)}.` : (result.error ?? "Nothing sent."),
      });
    }
    case "get_analytics": {
      const a = await getAnalytics();
      return JSON.stringify({
        totalRevenue: money(a.revenue.total),
        avgAssignmentFee: money(a.revenue.avgAssignmentFee),
        pipelineValue: money(a.revenue.pipeline),
        conversionRates: a.rates,
        revenueBySource: a.revenue.bySource.slice(0, 6).map((s) => ({ source: s.source, deals: s.deals, closed: s.closed, revenue: money(s.revenue), closeRate: `${s.closeRate}%` })),
        revenueByZip: a.revenue.byZip.slice(0, 6).map((z) => ({ zip: z.zip, deals: z.deals, revenue: money(z.revenue) })),
        funnel: a.funnel,
      });
    }
    case "overdue_followups": {
      const q = await getFollowUpQueue({ dueOnly: true });
      return JSON.stringify({ count: q.length, items: q.slice(0, 10).map((i) => ({ address: i.deal.address, owner: i.deal.ownerName, step: i.step, overdueDays: i.overdueDays, priority: i.priorityLabel })) });
    }
    case "most_likely_to_close": {
      const deals = await listDeals();
      const ranked = deals.filter((d) => d.stage !== "DEAD").sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, 8);
      return JSON.stringify({ leads: ranked.map((d) => ({ address: d.address, score: d.score, verdict: d.verdict, stage: d.stage, spread: money(d.profit ?? 0) })) });
    }
    case "explain_lead_score": {
      const q = String(args.dealQuery ?? "").toLowerCase();
      const deal = (await listDeals()).find((d) => d.address.toLowerCase().includes(q));
      if (!deal) return JSON.stringify({ found: false, message: `No deal matching "${args.dealQuery}"` });
      const s = await scoreDealHybrid(deal);
      return JSON.stringify({ address: deal.address, score: s.score, verdict: s.verdict, components: s.components, reasons: s.reasons });
    }
    case "best_buyers_for_deal": {
      const q = String(args.dealQuery ?? "").toLowerCase();
      const deal = (await listDeals()).find((d) => d.address.toLowerCase().includes(q));
      if (!deal) return JSON.stringify({ found: false, message: `No deal matching "${args.dealQuery}"` });
      const matches = await matchBuyersForDealScored(deal);
      return JSON.stringify({ deal: deal.address, matches: matches.slice(0, 8).map((m) => ({ buyer: m.buyer.company || m.buyer.name, confidence: `${m.matchScore}%`, phone: m.buyer.phone, reasons: m.reasons })) });
    }
    case "run_lead_source": {
      const markets = await getMarkets();
      const market = markets.find((m) => m.active) ?? markets[0];
      const r = await runLeadSource(String(args.source), { city: market?.city ?? "Houston", state: market?.state ?? "TX" });
      return JSON.stringify(r);
    }
    default:
      return JSON.stringify({ error: `Unknown tool: ${name}` });
  }
}

const SYSTEM_PROMPT = `You are the WholesaleOS Orchestrator — the user's AI command center for their solo real-estate wholesaling business in Houston, TX.

Your job: keep the user informed and help them decide what to do next. Be concise, direct, and conversational — like a sharp operations partner, not a chatbot. Short paragraphs, plain language.

RULES:
- ALWAYS call a tool to get real data before stating numbers. Never invent deals, buyers, prices, or counts.
- When the user asks "what's going on" or for status, call get_pipeline_summary first.
- When they ask about a specific property, call find_deal.
- When they ask who would buy a deal, call match_buyers_for_deal.
- When they ask to scan, find more deals, or get new leads, call run_deal_scan. It takes ~1 minute and searches public listings only. Briefly mention you're running it, then report what came back (new deals added, how many were already in the pipeline). If few or none are new, be honest that free public sources have limited fresh inventory and suggest the real lever is better lead data or working the deals already in the pipeline.
- For money questions (revenue, best source, ZIP spreads, conversion rates) call get_analytics. For "what should I work" call most_likely_to_close. For "who's overdue" call overdue_followups. To justify a score call explain_lead_score. For buyer recommendations call best_buyers_for_deal. To pull a specific lead type (portfolio landlords, probate, tax-delinquent, etc.) call run_lead_source.
- You can report, summarize, explain, recommend, RUN SCANS (any city — pass city/state to run_deal_scan, e.g. "find deals in Spring TX"), RUN LEAD SOURCES, and SEND A DEAL TO THE USER'S OWN CASH BUYERS.
- SENDING TO BUYERS IS CONFIRM-FIRST: when asked to send/blast a deal to buyers, FIRST call send_deal_to_buyers with confirm=false to preview exactly who would receive it, list the names + count for the user, and ask them to confirm. Only call again with confirm=true AFTER they reply yes. Buyers are the user's own consented list, so this is allowed.
- You MUST NOT contact SELLERS. All seller outreach (calling/texting/emailing a property owner) is human-approved from the deal page — if they want to reach a seller, tell them to open the deal and use the Call / Text buttons.
- If the user asks what to do, give a clear next action based on the data (e.g. "Open 14027 Henry Rd and send the JV pack to a buyer — it matches 3 of yours").
- If there's no data yet, tell them to run a scan from the Find Deals page.

Keep replies under ~120 words unless they ask for detail.`;

export async function POST(req: NextRequest) {
  if (!isGroqConfigured()) {
    return NextResponse.json(apiError("AI not configured (set GROQ_API_KEY)."), { status: 503 });
  }

  let incoming: { messages?: { role: string; content: string }[] };
  try {
    incoming = await req.json();
  } catch {
    return NextResponse.json(apiError("Invalid request."), { status: 400 });
  }

  const history = (incoming.messages ?? [])
    .filter((m) => m.role === "user" || m.role === "assistant")
    .slice(-12); // keep last 12 turns for context

  const convo: GroqMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
  ];

  try {
    // Tool-calling loop — up to 4 rounds
    for (let round = 0; round < 4; round++) {
      const msg = await groqChat(convo, TOOLS);

      if (msg.tool_calls && msg.tool_calls.length > 0) {
        convo.push(msg); // assistant's tool-call request
        for (const tc of msg.tool_calls) {
          let result: string;
          try {
            const parsedArgs = tc.function.arguments ? JSON.parse(tc.function.arguments) : {};
            result = await runTool(tc.function.name, parsedArgs);
          } catch (e) {
            result = JSON.stringify({ error: e instanceof Error ? e.message : "tool failed" });
          }
          convo.push({ role: "tool", tool_call_id: tc.id, name: tc.function.name, content: result });
        }
        continue; // let the model read tool results and respond
      }

      // Final natural-language answer
      return NextResponse.json(apiOk({ reply: msg.content ?? "(no response)" }));
    }
    return NextResponse.json(apiOk({ reply: "I pulled the data but couldn't summarize — try asking again." }));
  } catch (e) {
    console.error("agent/chat error", e);
    return NextResponse.json(apiError(e instanceof Error ? e.message : "Agent failed."), { status: 500 });
  }
}
