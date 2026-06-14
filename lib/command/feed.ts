import "server-only";
import { listOpenSurface } from "@/lib/surfacing/engine";
import { getLatestBriefing, type Briefing } from "@/lib/briefing/weekly";
import { cacheGet, cacheSet } from "@/lib/cache";

/**
 * The Executive OS feed — the operator's entire surface. Three ranked stacks
 * (Decisions / Risks / Opportunities) plus the latest briefing. Cached 60s.
 */

const FEED_CACHE_KEY = "wos:cache:command:feed";
const FEED_TTL = 60;

export interface FeedItem {
  id: string;
  kind: string;
  dealId: string | null;
  surfaceScore: number;
  moneyExempt: boolean;
  recommendation: unknown;
  createdAt: string;
}

export interface CommandFeed {
  briefing: Briefing | null;
  decisions: FeedItem[];
  risks: FeedItem[];
  opportunities: FeedItem[];
  counts: { decisions: number; risks: number; opportunities: number; total: number };
}

/** Pure: count surfaced items by kind. Exported for testing. */
export function summarizeFeed(items: { kind: string }[]): {
  decisions: number;
  risks: number;
  opportunities: number;
  total: number;
} {
  let decisions = 0;
  let risks = 0;
  let opportunities = 0;
  for (const i of items) {
    if (i.kind === "DECISION") decisions++;
    else if (i.kind === "RISK") risks++;
    else if (i.kind === "OPPORTUNITY") opportunities++;
  }
  return { decisions, risks, opportunities, total: items.length };
}

type SurfaceRow = {
  id: string;
  kind: string;
  dealId: string | null;
  surfaceScore: number;
  moneyExempt: boolean;
  recommendation: unknown;
  createdAt: Date;
};

const toItem = (r: SurfaceRow): FeedItem => ({
  id: r.id,
  kind: r.kind,
  dealId: r.dealId,
  surfaceScore: r.surfaceScore,
  moneyExempt: r.moneyExempt,
  recommendation: r.recommendation,
  createdAt: r.createdAt.toISOString(),
});

export async function getCommandFeed(useCache = true): Promise<CommandFeed> {
  if (useCache) {
    const cached = await cacheGet<CommandFeed>(FEED_CACHE_KEY);
    if (cached) return cached;
  }

  const [briefing, decisions, risks, opportunities] = await Promise.all([
    getLatestBriefing(),
    listOpenSurface("DECISION"),
    listOpenSurface("RISK"),
    listOpenSurface("OPPORTUNITY"),
  ]);

  const feed: CommandFeed = {
    briefing,
    decisions: (decisions as SurfaceRow[]).map(toItem),
    risks: (risks as SurfaceRow[]).map(toItem),
    opportunities: (opportunities as SurfaceRow[]).map(toItem),
    counts: {
      decisions: decisions.length,
      risks: risks.length,
      opportunities: opportunities.length,
      total: decisions.length + risks.length + opportunities.length,
    },
  };

  await cacheSet(FEED_CACHE_KEY, feed, FEED_TTL);
  return feed;
}
