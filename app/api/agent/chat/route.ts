import { NextRequest, NextResponse } from "next/server";
import {
  groqChat,
  isGroqConfigured,
  type GroqMessage,
  type GroqTool,
} from "@/lib/groq";
import { listDeals, dealStageCounts, createDealsFromScored, updateDeal } from "@/lib/data/deals";
import { listBuyers, matchBuyersForDeal, matchBuyersForDealScored } from "@/lib/data/buyers";
import { getMarkets } from "@/lib/data/markets";
import { findDeals, isClaudeConfigured } from "@/lib/claude";
import { getAnalytics } from "@/lib/data/analytics";
import { getFollowUpQueue } from "@/lib/data/follow-ups";
import { scoreDealHybrid } from "@/lib/data/scoring";
import { runLeadSource } from "@/lib/lead-sources";
import { sendDealToBuyers } from "@/lib/data/disposition";
import { tavilySearch, isTavilyConfigured } from "@/lib/tavily";
import { computeMao, getNegotiationPlaybook } from "@/lib/data/negotiation";
import { groqGenerate } from "@/lib/groq";
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
      name: "web_search",
      description: "Search the web for real-time information: market conditions, neighborhood data, recent home sales, foreclosure news, property tax info, investor activity, contractor costs, or anything else you need to research. Use for 'what are homes selling for in X', 'research this neighborhood', 'find cash buyers in Houston', 'what's the average repair cost for Y', etc.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "The search query, e.g. 'average home prices Cypress TX 2025' or 'Houston wholesale real estate investors'" },
          depth: { type: "string", enum: ["basic", "advanced"], description: "basic = fast/simple, advanced = deeper research (default)" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "research_property",
      description: "Deep-research a specific address or neighborhood: recent sales, flood zone, school ratings, crime, walkability, market trends, investor activity. Combines multiple searches into one report.",
      parameters: {
        type: "object",
        properties: {
          address: { type: "string", description: "Full property address, e.g. '8726 Arch Rock Dr, Cypress TX 77433'" },
          focus: { type: "string", description: "Optional focus area: 'comps', 'neighborhood', 'flood', 'investors', 'repairs'" },
        },
        required: ["address"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "move_deal_stage",
      description: "Move a deal to a new pipeline stage. Use when the user says 'move X to negotiating', 'mark X as contracted', 'kill X', 'X is dead', 'I signed a contract on X', etc. Valid stages: LEAD, CONTACTED, NEGOTIATING, CONTRACT, CLOSED, DEAD.",
      parameters: {
        type: "object",
        properties: {
          dealQuery: { type: "string", description: "Part of the deal's street address" },
          stage: { type: "string", enum: ["LEAD", "CONTACTED", "NEGOTIATING", "CONTRACT", "CLOSED", "DEAD"], description: "New pipeline stage" },
          note: { type: "string", description: "Optional note to log with this stage change" },
        },
        required: ["dealQuery", "stage"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_deal_note",
      description: "Add or update a note on a deal. Use when the user says 'note on X: ...', 'log that X ...', 'add to X: ...', 'update X notes'.",
      parameters: {
        type: "object",
        properties: {
          dealQuery: { type: "string", description: "Part of the deal's street address" },
          note: { type: "string", description: "The note text to append to this deal" },
        },
        required: ["dealQuery", "note"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "calculate_offer",
      description: "Calculate the MAO (max allowable offer), opening offer, and assignment fee breakdown for a deal. Use when the user asks 'what should I offer on X', 'run the numbers on X', 'what's the MAO for X', 'calculate offer'.",
      parameters: {
        type: "object",
        properties: {
          dealQuery: { type: "string", description: "Part of the deal's street address" },
        },
        required: ["dealQuery"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_negotiation_playbook",
      description: "Get a full negotiation playbook for a deal: opening offer, MAO, counter-offer ladder, talking points, and objection handlers. Use when the user is about to call/text a seller or wants to know how to negotiate.",
      parameters: {
        type: "object",
        properties: {
          dealQuery: { type: "string", description: "Part of the deal's street address" },
        },
        required: ["dealQuery"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "draft_seller_message",
      description: "Write a message the user should send to a seller — first contact, follow-up, or response. The user copies it and sends manually (TCPA compliance). Use for 'what should I say to X', 'write me a message for X', 'draft a text for X', 'how should I respond to X saying Y'.",
      parameters: {
        type: "object",
        properties: {
          dealQuery: { type: "string", description: "Part of the deal's street address" },
          messageType: { type: "string", enum: ["first_contact", "follow_up", "response"], description: "first_contact = cold outreach, follow_up = no reply yet, response = seller said something" },
          sellerSaid: { type: "string", description: "What the seller said (required for messageType=response)" },
          channel: { type: "string", enum: ["sms", "email", "whatsapp", "call_script"], description: "Channel to write for (default: sms)" },
        },
        required: ["dealQuery", "messageType"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "schedule_follow_up",
      description: "Set a follow-up reminder for a deal X days from now. Use when user says 'remind me about X in 3 days', 'follow up with X next week', 'check back with X on Friday'.",
      parameters: {
        type: "object",
        properties: {
          dealQuery: { type: "string", description: "Part of the deal's street address" },
          daysFromNow: { type: "number", description: "How many days until the follow-up (e.g. 3, 7, 14)" },
        },
        required: ["dealQuery", "daysFromNow"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "run_lead_source",
      description: "Run an advanced lead-source adapter and save verified leads. Sources: hcad-estate (estate/heir-owned straight from county records — the BEST free probate source), hcad-portfolio (landlords with 5+ properties), hcad-absentee (out-of-state owners), tax-delinquent, probate, code-violation, vacant. Use for 'pull probate leads' (prefer hcad-estate), 'find portfolio landlords', etc.",
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
    case "web_search": {
      if (!isTavilyConfigured()) return JSON.stringify({ error: "Web search not configured (TAVILY_API_KEY missing)." });
      const query = String(args.query ?? "");
      if (!query) return JSON.stringify({ error: "query is required" });
      const depth = args.depth === "basic" ? "basic" : "advanced";
      try {
        const results = await tavilySearch(query, { maxResults: 6, searchDepth: depth });
        return JSON.stringify({
          query,
          results: results.slice(0, 6).map(r => ({ title: r.title, url: r.url, summary: r.content.slice(0, 400) })),
        });
      } catch (e) {
        return JSON.stringify({ error: e instanceof Error ? e.message : "Search failed" });
      }
    }
    case "research_property": {
      if (!isTavilyConfigured()) return JSON.stringify({ error: "Web search not configured (TAVILY_API_KEY missing)." });
      const addr = String(args.address ?? "");
      const focus = String(args.focus ?? "");
      const queries = focus === "comps"
        ? [`recent home sales near ${addr}`, `home prices ${addr} 2025`]
        : focus === "flood"
        ? [`flood zone ${addr}`, `flood risk ${addr}`]
        : focus === "investors"
        ? [`cash buyers real estate investors ${addr.split(",").slice(-2).join(",").trim()}`, `wholesale real estate ${addr.split(",")[1]?.trim() ?? addr}`]
        : focus === "repairs"
        ? [`average repair costs house renovation Houston TX 2025`, `contractor costs ${addr.split(",")[1]?.trim() ?? "Houston TX"}`]
        : [
            `${addr} neighborhood home values 2025`,
            `recent sales near ${addr}`,
            `${addr.split(",").slice(1).join(",").trim()} real estate market trends`,
          ];
      try {
        const allResults: { title: string; url: string; summary: string }[] = [];
        for (const q of queries) {
          const r = await tavilySearch(q, { maxResults: 3, searchDepth: "advanced" });
          allResults.push(...r.slice(0, 3).map(x => ({ title: x.title, url: x.url, summary: x.content.slice(0, 300) })));
        }
        return JSON.stringify({ address: addr, focus: focus || "general", results: allResults.slice(0, 8) });
      } catch (e) {
        return JSON.stringify({ error: e instanceof Error ? e.message : "Research failed" });
      }
    }
    case "move_deal_stage": {
      const q = String(args.dealQuery ?? "").toLowerCase();
      const deal = (await listDeals()).find((d) => d.address.toLowerCase().includes(q));
      if (!deal) return JSON.stringify({ found: false, message: `No deal matching "${args.dealQuery}"` });
      const newStage = String(args.stage);
      const updated = await updateDeal(deal.id, { stage: newStage as never, notes: args.note ? `${deal.notes ?? ""}\n[Stage → ${newStage}] ${String(args.note)}`.trim() : deal.notes ?? undefined });
      return JSON.stringify({ success: Boolean(updated), address: deal.address, oldStage: deal.stage, newStage, message: updated ? `Moved ${deal.address} from ${deal.stage} → ${newStage}.` : "Update failed." });
    }
    case "add_deal_note": {
      const q = String(args.dealQuery ?? "").toLowerCase();
      const deal = (await listDeals()).find((d) => d.address.toLowerCase().includes(q));
      if (!deal) return JSON.stringify({ found: false, message: `No deal matching "${args.dealQuery}"` });
      const note = String(args.note ?? "");
      const ts = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
      const existing = (deal.notes ?? "").trim();
      const newNotes = existing ? `${existing}\n[${ts}] ${note}` : `[${ts}] ${note}`;
      const updated = await updateDeal(deal.id, { notes: newNotes });
      return JSON.stringify({ success: Boolean(updated), address: deal.address, noteAdded: note });
    }
    case "calculate_offer": {
      const q = String(args.dealQuery ?? "").toLowerCase();
      const deal = (await listDeals()).find((d) => d.address.toLowerCase().includes(q));
      if (!deal) return JSON.stringify({ found: false, message: `No deal matching "${args.dealQuery}"` });
      const mao = computeMao(deal);
      const opening = mao != null ? Math.round(mao * 0.85) : null;
      return JSON.stringify({
        address: deal.address,
        arv: money(deal.arv), repairs: money(deal.repairCost),
        assignmentFee: money(deal.assignmentFee ?? 10000),
        mao: money(mao), openingOffer: money(opening),
        estProfit: money(deal.profit),
        formula: `ARV×70% − Repairs − Assignment Fee = MAO`,
        verdict: mao && deal.offerPrice && deal.offerPrice <= mao ? "✅ Current offer is at or under MAO" : mao && deal.offerPrice && deal.offerPrice > mao ? "⚠️ Current offer EXCEEDS MAO" : "No offer set yet",
      });
    }
    case "get_negotiation_playbook": {
      const q = String(args.dealQuery ?? "").toLowerCase();
      const deal = (await listDeals()).find((d) => d.address.toLowerCase().includes(q));
      if (!deal) return JSON.stringify({ found: false, message: `No deal matching "${args.dealQuery}"` });
      const playbook = await getNegotiationPlaybook(deal);
      return JSON.stringify({
        address: deal.address, owner: deal.ownerName,
        mao: money(playbook.mao), openingOffer: money(playbook.openingOffer),
        counterLadder: playbook.counterLadder.map(money),
        talkingPoints: playbook.talkingPoints,
        objectionHandlers: playbook.objectionHandlers,
        summary: playbook.summary,
      });
    }
    case "draft_seller_message": {
      const q = String(args.dealQuery ?? "").toLowerCase();
      const deal = (await listDeals()).find((d) => d.address.toLowerCase().includes(q));
      if (!deal) return JSON.stringify({ found: false, message: `No deal matching "${args.dealQuery}"` });
      const mao = computeMao(deal);
      const type = String(args.messageType ?? "first_contact");
      const channel = String(args.channel ?? "sms");
      const sellerSaid = args.sellerSaid ? String(args.sellerSaid) : "";
      const isCall = channel === "call_script";
      const prompt = type === "response" && sellerSaid
        ? `You are a real estate wholesaler drafting a ${channel} reply to a motivated seller.
Property: ${deal.address}, ${deal.city ?? "Houston TX"}. Seller: ${deal.ownerName ?? "owner"}. Situation: ${deal.situation ?? "motivated seller"}.
Your MAX offer (never go above): ${money(mao)}.
The seller just said: "${sellerSaid}"
Write ONLY the exact ${isCall ? "words to say on the phone" : channel + " message"} — natural, brief (2-4 sentences), warm but firm. No preamble, no explanation.`
        : type === "follow_up"
        ? `You are a real estate wholesaler writing a ${channel} follow-up to a seller who hasn't replied yet.
Property: ${deal.address}, ${deal.city ?? "Houston TX"}. Seller: ${deal.ownerName ?? "owner"}. Situation: ${deal.situation ?? "motivated seller"}.
Keep it very short (1-2 sentences), friendly, non-pushy. Reference the property subtly. No preamble.`
        : `You are a real estate wholesaler writing a first-contact ${channel} to a homeowner.
Property: ${deal.address}, ${deal.city ?? "Houston TX"}. Owner: ${deal.ownerName ?? "owner"}. Situation: ${deal.situation ?? "motivated seller"}.
Write a brief (2-3 sentence) ${isCall ? "phone script opener" : channel + " message"}: introduce yourself, mention you buy houses as-is for cash, ask if they'd be open to an offer. Warm, personal, not spammy. No preamble.`;
      const draft = await groqGenerate({ prompt, maxTokens: 200, temperature: 0.7 });
      return JSON.stringify({ address: deal.address, owner: deal.ownerName, channel, messageType: type, draft: draft.trim(), important: "This is a DRAFT for you to review and send manually. Do NOT auto-send." });
    }
    case "schedule_follow_up": {
      const q = String(args.dealQuery ?? "").toLowerCase();
      const deal = (await listDeals()).find((d) => d.address.toLowerCase().includes(q));
      if (!deal) return JSON.stringify({ found: false, message: `No deal matching "${args.dealQuery}"` });
      const days = Number(args.daysFromNow ?? 3);
      const followUpDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
      const updated = await updateDeal(deal.id, { nextFollowUpAt: followUpDate.toISOString() });
      return JSON.stringify({ success: Boolean(updated), address: deal.address, followUpScheduled: followUpDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }), days });
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

const SYSTEM_PROMPT = `You are the WholesaleOS Orchestrator — the AI engine running a solo real-estate wholesaling business in Houston, TX. You don't just report — you DO the work.

Be concise, direct, action-oriented. Like a sharp ops partner, not a chatbot. Short paragraphs, plain language.

WHAT YOU CAN DO (use these tools aggressively):
- get_pipeline_summary / list_hot_leads — status and hot leads
- find_deal — look up any deal by address fragment
- move_deal_stage — move deals through the pipeline (LEAD → CONTACTED → NEGOTIATING → CONTRACT → CLOSED/DEAD)
- add_deal_note — log notes on any deal
- calculate_offer — run MAO math for any deal
- get_negotiation_playbook — full strategy: opening offer, counter ladder, objection scripts
- draft_seller_message — write the exact message for the user to send (sms/email/call script)
- schedule_follow_up — set a follow-up reminder X days out
- match_buyers_for_deal / best_buyers_for_deal — find who wants a deal
- send_deal_to_buyers — blast matched buyers (confirm-first: preview first, send only after user says yes)
- run_deal_scan — find new motivated-seller deals (~1 min)
- run_lead_source — pull probate/absentee/portfolio/tax-delinquent leads from HCAD
- get_analytics / most_likely_to_close / overdue_followups / explain_lead_score — data and prioritization
- web_search — real-time market data, news, trends
- research_property — deep multi-search on any address: comps, flood zone, schools, investor demand

RULES:
- ALWAYS call a tool to get real data before stating numbers. Never invent deals, buyers, prices, or counts.
- For status: call get_pipeline_summary. For specific property: call find_deal first, then act.
- For "what should I say to X": call draft_seller_message. For "how to negotiate with X": call get_negotiation_playbook. For "move X to Y stage": call move_deal_stage. For "remind me about X": call schedule_follow_up.
- SENDING TO BUYERS IS CONFIRM-FIRST: preview with confirm=false, show names, ask user to confirm, then send with confirm=true.
- You MUST NOT contact SELLERS yourself. draft_seller_message only writes a draft — the USER sends it. Never call/text/email a seller on their behalf.
- If overdue follow-ups exist, proactively mention them.
- Chain tools when needed: find_deal → calculate_offer → get_negotiation_playbook in one response if the user asks "prep me for a call with X".

Keep replies under ~150 words unless they ask for detail. Lead with the action taken, then explain.`;

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
    .slice(-8); // keep last 8 turns — enough context, fewer tokens = stays under 30k TPM

  const convo: GroqMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
  ];

  try {
    // Tool-calling loop — up to 6 rounds (allows chaining: find → calc → playbook in one shot)
    for (let round = 0; round < 6; round++) {
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
