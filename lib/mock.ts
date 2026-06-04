/**
 * Realistic demo/fallback data. Powers the public landing-page demo and acts as
 * a graceful fallback whenever ANTHROPIC_API_KEY is not configured, so the whole
 * app is explorable without any keys. Deterministic per-city so results feel
 * "cached" and stable.
 */
import type {
  ScoredDeal,
  DealAnalysis,
  Verdict,
  SequenceMessage,
  ReplyAnalysis,
  BuyerPitch,
  DealContext,
  Briefing,
  ScoredBuyer,
} from "@/types";
import type { DealType, ScriptType } from "@prisma/client";
import { MAO_ARV_MULTIPLIER } from "@/constants/config";

function mulberry(seedStr: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seedStr.length; i++) {
    h ^= seedStr.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const STREETS = [
  "Maple Ave", "Pinecrest Dr", "Lakeview Ct", "Sycamore St", "Magnolia Blvd",
  "Birchwood Ln", "Harbor Rd", "Sunset Way", "Cypress Trl", "Brookside Dr",
  "Heron Pl", "Old Mill Rd", "Dogwood Cir", "Palmetto St", "Sandpiper Ln",
];
const FIRST = ["Robert", "Linda", "James", "Patricia", "Carl", "Dorothy", "Eugene", "Gloria", "Walter", "Estelle", "Marcus", "Yvonne"];
const LAST = ["Hayes", "Whitfield", "Okafor", "Delgado", "Brennan", "Castellano", "Nguyen", "Abernathy", "Russo", "Coleman"];

const DEAL_TYPE_ROTATION: DealType[] = [
  "FORECLOSURE", "PROBATE", "VACANT", "TAX_DELINQUENT", "INHERITED", "ABSENTEE", "CODE_VIOLATION", "DIVORCE",
];

const SITUATIONS: Record<DealType, string> = {
  FORECLOSURE: "Notice of default filed; owner 4 months behind and wants to avoid the auction.",
  PROBATE: "Estate in probate after the owner passed; heirs live out of state and want a fast cash sale.",
  VACANT: "Property sat vacant 8+ months; utilities off, yard overgrown, owner relocated.",
  TAX_DELINQUENT: "Two years of unpaid property taxes; owner can't cover the lien and wants out.",
  INHERITED: "Recently inherited; family doesn't want the upkeep and would take a quick offer.",
  ABSENTEE: "Owner lives 1,200 miles away; tired landlord done with the tenant headaches.",
  CODE_VIOLATION: "Open city code violations stacking fines; owner can't afford repairs.",
  DIVORCE: "Divorce in progress; both parties want a clean, fast split of the asset.",
  OTHER: "Motivated seller looking to move quickly for the right cash offer.",
};

const TAGS: Record<DealType, string[]> = {
  FORECLOSURE: ["pre-foreclosure", "time-sensitive"],
  PROBATE: ["probate", "out-of-state heirs"],
  VACANT: ["vacant", "as-is"],
  TAX_DELINQUENT: ["tax lien", "motivated"],
  INHERITED: ["inherited", "as-is"],
  ABSENTEE: ["absentee", "tired landlord"],
  CODE_VIOLATION: ["code violation", "as-is"],
  DIVORCE: ["divorce", "fast close"],
  OTHER: ["motivated"],
};

const SOURCES = [
  { source: "zillow", url: "https://www.zillow.com/homedetails/" },
  { source: "craigslist", url: "https://craigslist.org/reo/" },
  { source: "facebook", url: "https://www.facebook.com/marketplace/item/" },
  { source: "county", url: "https://county-records.gov/parcel/" },
  { source: "auction", url: "https://www.auction.com/details/" },
];

function round(n: number, to: number): number {
  return Math.round(n / to) * to;
}
function clampScore(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}
export function verdictFromScore(score: number): Verdict {
  return score >= 78 ? "GO" : score >= 60 ? "CAUTION" : "PASS";
}

export function mockDeals(city = "Palm Bay", count = 5, salt = ""): ScoredDeal[] {
  const cityName = city.split(",")[0].trim() || "Palm Bay";
  const state = city.includes(",") ? city.split(",")[1].trim() : "FL";
  const rand = mulberry(`${cityName.toLowerCase()}|${salt}`);
  const deals: ScoredDeal[] = [];

  for (let i = 0; i < count; i++) {
    const dealType = DEAL_TYPE_ROTATION[Math.floor(rand() * DEAL_TYPE_ROTATION.length)];
    const arv = round(180000 + rand() * 250000, 1000);
    const repairCost = round(12000 + rand() * 58000, 500);
    const offerPrice = Math.max(20000, round(arv * MAO_ARV_MULTIPLIER - repairCost, 500));
    const listPrice = round(offerPrice * (1.03 + rand() * 0.16), 500);
    const assignmentFee = round(8000 + rand() * 17000, 500);
    const profit = assignmentFee;

    const motivationScore = clampScore(58 + rand() * 40);
    const margin = profit / Math.max(arv, 1);
    const profitScore = clampScore(45 + margin * 600);
    const contactDifficulty = clampScore(20 + rand() * 62);
    const score = clampScore(
      motivationScore * 0.5 + profitScore * 0.35 + (100 - contactDifficulty) * 0.15,
    );

    const src = SOURCES[Math.floor(rand() * SOURCES.length)];
    const streetNo = 100 + Math.floor(rand() * 9800);
    const street = STREETS[Math.floor(rand() * STREETS.length)];
    const owner = `${FIRST[Math.floor(rand() * FIRST.length)]} ${LAST[Math.floor(rand() * LAST.length)]}`;
    const phone = `(${321 + Math.floor(rand() * 3)}) ${200 + Math.floor(rand() * 700)}-${1000 + Math.floor(rand() * 8999)}`;

    deals.push({
      address: `${streetNo} ${street}`,
      city: cityName,
      state,
      situation: SITUATIONS[dealType],
      dealType,
      source: src.source,
      sourceUrl: `${src.url}${streetNo}${cityName.toLowerCase().replace(/\s+/g, "-")}`,
      ownerName: owner,
      ownerPhone: phone,
      arv,
      listPrice,
      repairCost,
      offerPrice,
      assignmentFee,
      profit,
      score,
      motivationScore,
      profitScore,
      contactDifficulty,
      verdict: verdictFromScore(score),
      aiSummary: `${verdictFromScore(score)} — ~${Math.round(margin * 100)}% spread on ARV with a ${motivationScore}/100 motivation signal. ${SITUATIONS[dealType].split(";")[0]}.`,
      tags: TAGS[dealType],
    });
  }
  // Highest-scoring first
  return deals.sort((a, b) => b.score - a.score);
}

/** Three polished deals for the public landing-page demo. */
export function demoDeals(city = "Palm Bay, FL"): ScoredDeal[] {
  return mockDeals(city, 3, "demo");
}

export function mockAnalysis(input: {
  arv?: number;
  repairCost?: number;
  offerPrice?: number;
  assignmentFee?: number;
}): DealAnalysis {
  const arv = input.arv ?? 285000;
  const repairCost = input.repairCost ?? 38000;
  const mao = Math.max(0, Math.round(arv * MAO_ARV_MULTIPLIER - repairCost));
  const offerPrice = input.offerPrice ?? mao;
  const assignmentFee = input.assignmentFee ?? 12000;
  const profit = assignmentFee;
  const marginPct = Math.round((profit / Math.max(arv, 1)) * 1000) / 10;
  const headroom = mao - offerPrice;
  const strength = clampScore(50 + marginPct * 4 + (headroom > 0 ? 18 : -22));
  const verdict = verdictFromScore(strength);

  return {
    arv,
    repairCost,
    offerPrice,
    mao,
    assignmentFee,
    profit,
    marginPct,
    strength,
    verdict,
    reasoning:
      verdict === "GO"
        ? `Offer sits at or below your MAO of $${mao.toLocaleString()}, leaving a clean assignment spread. Numbers support an aggressive but safe contract.`
        : verdict === "CAUTION"
          ? `Margin is workable but thin. You're close to MAO — negotiate repairs or price before locking it up.`
          : `Offer exceeds MAO; the spread doesn't justify the risk. Re-trade hard or pass.`,
    comps: [
      { address: "Comparable sold 0.4mi away", soldPrice: Math.round(arv * 1.02), beds: 3, baths: 2, sqft: 1480, distanceMi: 0.4, soldDate: "recent" },
      { address: "Comparable sold 0.7mi away", soldPrice: Math.round(arv * 0.97), beds: 3, baths: 2, sqft: 1420, distanceMi: 0.7, soldDate: "recent" },
      { address: "Comparable sold 1.1mi away", soldPrice: Math.round(arv * 1.05), beds: 4, baths: 2, sqft: 1610, distanceMi: 1.1, soldDate: "recent" },
    ],
    negotiation: `Anchor at $${Math.round(offerPrice * 0.93).toLocaleString()} citing $${repairCost.toLocaleString()} in repairs and recent comps. Settle no higher than your MAO of $${mao.toLocaleString()}.`,
    counters: [
      { ifTheyCounter: `They counter at $${Math.round(offerPrice * 1.08).toLocaleString()}`, youRespond: `"I hear you. With $${repairCost.toLocaleString()} in repairs I can stretch to $${offerPrice.toLocaleString()} cash, close in 14 days, no contingencies."` },
      { ifTheyCounter: "They say it's worth more", youRespond: `"It is — fully renovated. As-is and on your timeline, $${offerPrice.toLocaleString()} is real money today, no agents, no fees."` },
    ],
  };
}

export function mockScript(type: ScriptType, ctx: DealContext): string {
  const addr = ctx.address ?? "your property";
  const owner = ctx.ownerName?.split(" ")[0] ?? "there";
  const offer = ctx.offerPrice ? `$${ctx.offerPrice.toLocaleString()}` : "a fair cash price";
  switch (type) {
    case "COLD_CALL":
      return `Hi, is this ${owner}? My name's Alex — I'm a local cash buyer. I'm reaching out about ${addr}. I buy houses as-is, no agents or fees, and can close on your timeline.\n\n[If "not interested"]: Totally understand — can I ask, if the price and terms were right, is it something you'd ever consider? ... Great, what would need to happen for this to make sense for you?\n\n[On price]: Based on the condition and recent sales nearby, I could do around ${offer} cash, closing in as little as 2 weeks. How does that sound?`;
    case "VOICEMAIL":
      return `Hi ${owner}, this is Alex — a local cash home buyer. I'm interested in ${addr} and can pay cash, as-is, and close fast with no fees. No pressure at all — if you'd consider an offer, call or text me back at this number. Thanks, and have a good one.`;
    case "TEXT":
      return `Hi ${owner}, I'm a local cash buyer interested in ${addr}. As-is, no fees, close on your timeline. Open to a quick cash offer? Reply STOP to opt out.`;
    case "EMAIL":
      return `Subject: Cash offer for ${addr}\n\nHi ${owner},\n\nI'm a local investor who buys homes directly — as-is, no agent commissions, no repairs, and I cover closing costs. For ${addr}, I can put together a fair cash offer around ${offer} and close on whatever date works for you.\n\nWould you be open to a quick chat? Just reply here or call anytime.\n\nBest,\nAlex`;
    case "LETTER":
      return `Dear ${ctx.ownerName ?? "Neighbor"},\n\nMy name is Alex and I buy homes here in ${ctx.city ?? "the area"}. I'm writing because I'd genuinely like to buy ${addr}.\n\nI pay cash, buy as-is (no cleaning, no repairs), cover all closing costs, and close on your schedule — whether that's two weeks or two months.\n\nIf you've ever thought about selling without the hassle of agents and showings, I'd love the chance to make you a fair, no-obligation offer.\n\nWarm regards,\nAlex\n(555) 010-2030`;
    case "NEGOTIATION":
      return `Open warm, anchor below MAO, justify with repairs + comps, and trade concessions for a faster close.\n\nAnchor: "Based on ${ctx.repairCost ? `$${ctx.repairCost.toLocaleString()} in repairs and ` : ""}recent comps, I can do ${offer} cash."\nIf they push: trade on terms, not just price — faster close, covering their moving costs, flexible possession.\nWalk-away: never exceed your MAO.`;
    case "BUYER_PITCH":
      return `🔥 OFF-MARKET DEAL — ${ctx.city ?? "Local"}\n\n${addr}\n${ctx.situation ?? "Motivated seller, as-is."}\n\nARV: ${ctx.arv ? `$${ctx.arv.toLocaleString()}` : "TBD"}\nRepairs (est): ${ctx.repairCost ? `$${ctx.repairCost.toLocaleString()}` : "TBD"}\nAsking (assignment): ${ctx.offerPrice ? `$${ctx.offerPrice.toLocaleString()}` : "Call"}\n\nCash or hard money, quick close. First with proof of funds takes it. Reply for the address + numbers.`;
    default:
      return `Personalized outreach for ${addr}.`;
  }
}

export function mockSmsSequence(ctx: DealContext): SequenceMessage[] {
  const owner = ctx.ownerName?.split(" ")[0] ?? "there";
  const addr = ctx.address ?? "your property";
  const steps: { day: number; label: string; message: string }[] = [
    { day: 0, label: "First outreach", message: `Hi ${owner}, I'm a local cash buyer interested in ${addr}. As-is, no fees, close on your timeline. Open to a quick cash offer? Reply STOP to opt out.` },
    { day: 1, label: "Day 1 follow-up", message: `Hi ${owner}, just making sure my note came through about ${addr}. Happy to text you a no-obligation number — want me to? Reply STOP to opt out.` },
    { day: 3, label: "Day 3 follow-up", message: `${owner}, still buying in your area and ${addr} fits what I'm looking for. Even if it needs work, I buy as-is. Worth a 2-min chat? Reply STOP to opt out.` },
    { day: 7, label: "Day 7 follow-up", message: `Hi ${owner}, no pressure at all on ${addr} — if the timing's just not right, totally fine. If it is, I can close fast and cover closing costs. Reply STOP to opt out.` },
    { day: 14, label: "Day 14 follow-up", message: `${owner}, checking in one more time on ${addr}. I keep my offers fair and simple — cash, as-is, your date. Want a number? Reply STOP to opt out.` },
    { day: 30, label: "Day 30 follow-up", message: `Hi ${owner}, still happy to make a cash offer on ${addr} whenever you're ready. I'll be around. Reply STOP to opt out.` },
    { day: 60, label: "Day 60 re-engage", message: `Hi ${owner}, circling back on ${addr}. If selling's back on your radar, I can still buy cash, as-is, fast. Reply STOP to opt out.` },
  ];
  return steps.map((s, i) => ({ step: i, ...s }));
}

export function mockBuyerPitch(ctx: DealContext): BuyerPitch {
  const addr = ctx.address ?? "Off-market property";
  return {
    subject: `Off-market ${ctx.city ?? "deal"} — ${ctx.offerPrice ? `$${ctx.offerPrice.toLocaleString()}` : "cash buyers"}, quick close`,
    body: `New off-market deal just locked up:\n\n📍 ${addr}, ${ctx.city ?? ""}\n${ctx.situation ?? "Motivated seller, as-is."}\n\n• ARV: ${ctx.arv ? `$${ctx.arv.toLocaleString()}` : "TBD"}\n• Estimated repairs: ${ctx.repairCost ? `$${ctx.repairCost.toLocaleString()}` : "TBD"}\n• Your price (assignment): ${ctx.offerPrice ? `$${ctx.offerPrice.toLocaleString()}` : "Reply for numbers"}\n• Est. spread: ${ctx.profit ? `$${ctx.profit.toLocaleString()}` : "Strong"}\n\nCash or hard money only, quick close. First with proof of funds takes it — reply and I'll send the full packet.`,
  };
}

export function mockReplyAnalysis(message: string): ReplyAnalysis {
  const m = message.toLowerCase();
  if (/\b(stop|unsubscribe|remove|do not|don't contact|fuck|leave me)\b/.test(m)) {
    return { sentiment: "hostile", confidence: 0.9, summary: "Owner wants no further contact.", suggestedReply: "Understood — I've removed you and you won't hear from me again. Take care.", markHot: false, stopSequence: true };
  }
  if (/\b(yes|interested|how much|offer|call me|sure|ok|okay|sounds good|let's talk|what.*price)\b/.test(m)) {
    return { sentiment: "interested", confidence: 0.82, summary: "Owner is open and asking for details/price.", suggestedReply: "Great! Based on the condition and recent sales nearby, I can make a fair cash offer and close on your timeline. What's the best number to reach you for 2 minutes?", markHot: true, stopSequence: true };
  }
  if (/\?$|\bwho|\bwhat|\bwhy|\bhow\b/.test(m)) {
    return { sentiment: "question", confidence: 0.7, summary: "Owner has a question before engaging.", suggestedReply: "Good question — I'm a local cash buyer, no agents or fees involved. I buy as-is and cover closing costs. Happy to explain anything. What would you like to know?", markHot: false, stopSequence: false };
  }
  if (/\b(no|not interested|already sold|stop texting)\b/.test(m)) {
    return { sentiment: "not_interested", confidence: 0.8, summary: "Owner not interested right now.", suggestedReply: "No problem at all — thanks for letting me know. If anything changes, I'm here. All the best.", markHot: false, stopSequence: true };
  }
  return { sentiment: "neutral", confidence: 0.5, summary: "Unclear response; needs a human glance.", suggestedReply: "Thanks for getting back to me! Just to confirm — would you be open to a no-obligation cash offer on the property?", markHot: false, stopSequence: false };
}

export function mockBriefing(name = "there", city = "Palm Bay"): Briefing {
  const deals = mockDeals(city, 5);
  const best = deals[0];
  const today = new Date();
  return {
    date: today.toISOString(),
    greeting: `Good morning, ${name}.`,
    insight: best
      ? `Your best opportunity right now is ${best.address} — a ${best.score}/100 ${best.dealType.toLowerCase().replace("_", " ")} with an estimated $${(best.profit ?? 0).toLocaleString()} spread. Send the first text before noon.`
      : "No new deals overnight — run a scan to refresh your markets.",
    newDeals: 3,
    followUpsDue: 2,
    hotDeals: 1,
    stats: [
      { label: "New deals", value: "3", tone: "info" },
      { label: "Follow-ups due", value: "2", tone: "warning" },
      { label: "Hot leads", value: "1", tone: "brand" },
      { label: "Avg spread", value: "$12,400", tone: "brand" },
    ],
    actions: [
      best && {
        id: "a1",
        kind: "sms" as const,
        title: `Text owner of ${best.address}`,
        subtitle: `${best.dealType.replace("_", " ")} · score ${best.score}`,
        body: mockSmsSequence({ address: best.address, ownerName: best.ownerName, offerPrice: best.offerPrice })[0].message,
        phone: best.ownerPhone,
      },
      deals[1] && {
        id: "a2",
        kind: "follow_up" as const,
        title: `Follow up on ${deals[1].address}`,
        subtitle: "Day 3 of sequence",
        body: mockSmsSequence({ address: deals[1].address, ownerName: deals[1].ownerName })[2].message,
        phone: deals[1].ownerPhone,
      },
      deals[2] && {
        id: "a3",
        kind: "review" as const,
        title: `Review new ${deals[2].dealType.replace("_", " ").toLowerCase()} deal`,
        subtitle: deals[2].address,
      },
    ].filter(Boolean) as Briefing["actions"],
  };
}

const BUYER_COMPANIES = [
  "Vega Capital Group", "Brightline Home Buyers", "Coastal Equity Partners",
  "Summit REI Holdings", "Redoor Property Group", "Anchor Cash Offers",
  "Silverline Holdings", "Greenlight Investors", "Keystone Property Buyers",
  "Harbor & Oak Capital", "Evergreen Rentals", "Ironclad Home Buyers",
];
const BUYER_TYPES = ["flipper", "landlord", "wholesaler", "buy-and-hold"];
const BUYER_EVIDENCE = [
  "Closed 4 cash purchases in the area in the last 12 months",
  "Active 'we buy houses' advertiser in this market",
  "Owns 20+ rental doors locally",
  "Frequent BiggerPockets poster seeking off-market deals",
  "Bought 2 flips within 3 miles recently",
  "LLC recorded multiple cash deeds at the county",
];

export function mockBuyers(city = "Palm Bay", count = 6): ScoredBuyer[] {
  const cityName = city.split(",")[0].trim() || "Palm Bay";
  const rand = mulberry(`buyers|${cityName.toLowerCase()}`);
  const out: ScoredBuyer[] = [];
  for (let i = 0; i < count; i++) {
    const company = BUYER_COMPANIES[Math.floor(rand() * BUYER_COMPANIES.length)];
    const type = BUYER_TYPES[Math.floor(rand() * BUYER_TYPES.length)];
    const first = FIRST[Math.floor(rand() * FIRST.length)];
    const last = LAST[Math.floor(rand() * LAST.length)];
    const slug = company.toLowerCase().replace(/[^a-z]+/g, "");
    const hasEmail = rand() > 0.4;
    const minPrice = round(60000 + rand() * 60000, 5000);
    const maxPrice = round(minPrice + 120000 + rand() * 250000, 5000);
    out.push({
      name: `${first} ${last}`,
      company,
      email: hasEmail ? `${first.toLowerCase()}@${slug}.com` : undefined,
      phone: `(${321 + Math.floor(rand() * 3)}) ${200 + Math.floor(rand() * 700)}-${1000 + Math.floor(rand() * 8999)}`,
      website: `https://${slug}.com`,
      cities: [cityName],
      minPrice,
      maxPrice,
      buyerType: type,
      evidence: BUYER_EVIDENCE[Math.floor(rand() * BUYER_EVIDENCE.length)],
      source: "public records",
    });
  }
  return out;
}
