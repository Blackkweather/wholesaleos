import { NextRequest, NextResponse } from "next/server";
import { isDbReady } from "@/lib/data/db";
import { prisma } from "@/lib/prisma";
import { getMarkets } from "@/lib/data/markets";
import { findDeals, findBuyers, dailyInsight, generateScript, isClaudeConfigured } from "@/lib/claude";
import { createDealsFromScored, listDeals, dealViewToContext } from "@/lib/data/deals";
import { createBuyersFromScored, matchBuyersForDeal } from "@/lib/data/buyers";
import { skipTraceAndUpdate } from "@/lib/data/skip-trace";
import { saveScript, hasScript } from "@/lib/data/scripts";
import { sendDailyBriefingEmail, isResendConfigured } from "@/lib/resend";
import { writeBriefing } from "@/lib/data/briefing-store";
import { runLeadSource } from "@/lib/lead-sources";
import { apiOk, apiError } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60; // Vercel Hobby caps functions at 60s. Heavy skip-tracing is offloaded to /api/cron/skip-trace.

function authCheck(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // dev: open
  const auth = req.headers.get("authorization") ?? "";
  return auth === `Bearer ${secret}`;
}

// Vercel native cron (and most free cron services) trigger a GET. Delegate to
// the same handler; auth is still enforced via CRON_SECRET inside.
export async function GET(req: NextRequest) {
  return POST(req);
}

export async function POST(req: NextRequest) {
  if (!authCheck(req)) {
    return NextResponse.json(apiError("Unauthorized"), { status: 401 });
  }

  const summary = {
    markets: 0,
    dealsFound: 0,
    dealsSaved: 0,
    buyersFound: 0,
    buyersSaved: 0,
    buyerMatchesTotal: 0,
    skipTraceHits: 0,
    hotLeadsForReview: 0,
    lettersDrafted: 0,
    briefingGenerated: false,
    errors: [] as string[],
  };

  try {
    if (!(await isDbReady())) {
      return NextResponse.json(apiOk({ ...summary, skipped: "no-db" }));
    }

    if (!isClaudeConfigured()) {
      return NextResponse.json(
        apiOk({ ...summary, skipped: "no-ai-key" }),
      );
    }

    const markets = await getMarkets();
    summary.markets = markets.length;

    // ── Authoritative county leads FIRST (real owners + values from HCAD) ─────
    // Runs before the slower web scan so it always lands inside the 60s budget.
    // Best-effort: failures here never block the rest of the scan.
    for (const srcId of ["hcad-estate", "hcad-distressed"] as const) {
      try {
        const r = await runLeadSource(srcId, { city: "Houston", state: "TX", limit: 4 });
        summary.dealsFound += r.found;
        summary.dealsSaved += r.saved;
      } catch (e) {
        summary.errors.push(`${srcId}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    for (const market of markets) {
      if (!market.active) continue;
      const cityStr = `${market.city}${market.state ? `, ${market.state}` : ""}`;

      // ── Deals ───────────────────────────────────────────────────────────────
      try {
        const deals = await findDeals({
          city: market.city,
          state: market.state ?? undefined,
          limit: 6,
        });
        summary.dealsFound += deals.length;
        const saved = await createDealsFromScored(deals);
        summary.dealsSaved += saved.length;

        // ── Skip trace: enrich contact info from public listings ──────────
        // Research only — contacts nobody. Looks up publicly-available info so
        // YOU have what you need when you decide to reach out.
        // Each lookup is slow (external API), so on Vercel Hobby (60s cap) this
        // is OFFLOADED to /api/cron/skip-trace, which batches a few per run.
        // Set SCAN_INLINE_SKIPTRACE=1 (local, or Vercel Pro with 300s) to run it here.
        if (process.env.SCAN_INLINE_SKIPTRACE === "1") {
          for (const deal of saved) {
            try {
              const hit = await skipTraceAndUpdate(deal);
              if (hit) summary.skipTraceHits++;
            } catch (e) {
              summary.errors.push(
                `skip-trace/${deal.address}: ${e instanceof Error ? e.message : String(e)}`,
              );
            }
          }
        }

        // ── Match buyers and log to the deal's activity feed (no auto-send) ─
        for (const deal of saved) {
          try {
            const matches = await matchBuyersForDeal(deal);
            if (matches.length > 0) {
              summary.buyerMatchesTotal += matches.length;
              await prisma.activity.createMany({
                data: matches.map((b) => ({
                  dealId:  deal.id,
                  type:    "NOTE" as const,
                  content: `🎯 Buyer match: ${b.name}${b.company ? ` (${b.company})` : ""} — ${b.phone ?? b.email ?? "no contact info"}`,
                })),
              });
            }
          } catch (e) {
            summary.errors.push(
              `buyer-match/${deal.address}: ${e instanceof Error ? e.message : String(e)}`,
            );
          }
        }

        // ── Flag HOT leads for YOUR review (human-in-the-loop, no outreach) ─
        // The scan finds, scores, and enriches — then surfaces the best leads
        // on your dashboard. Nothing is sent. You approve every contact yourself
        // from the deal page (Call / Text / Email buttons). This keeps outreach
        // TCPA/CAN-SPAM compliant: a human decides each touch.
        const HOT_SCORE_THRESHOLD = 70;
        for (const deal of saved) {
          const hasContact = Boolean(deal.ownerPhone || deal.ownerEmail);
          if ((deal.score ?? 0) >= HOT_SCORE_THRESHOLD && hasContact && !deal.optedOut) {
            summary.hotLeadsForReview++;
            try {
              await prisma.deal.update({ where: { id: deal.id }, data: { hot: true } });
              await prisma.activity.create({
                data: {
                  dealId:  deal.id,
                  type:    "NOTE" as const,
                  content: `⭐ Hot lead (score ${deal.score}) — ready for your review. Open the deal to approve outreach.`,
                },
              });
            } catch { /* non-fatal */ }
          }
        }

        // ── Auto-draft direct-mail letters for absentee owners ────────────
        // Direct mail is legal outreach (no TCPA). We have the owner's real
        // mailing address from HCAD, so the letter is ready to print & send.
        for (const deal of saved) {
          const absentee = (deal.tags ?? []).includes("absentee-owner");
          if (!absentee || !deal.ownerName) continue;
          try {
            if (await hasScript(deal.id, "LETTER")) continue; // already drafted
            const letter = await generateScript(dealViewToContext(deal), "LETTER");
            const ok = await saveScript(deal.id, "LETTER", letter);
            if (ok) {
              summary.lettersDrafted++;
              await prisma.activity.create({
                data: {
                  dealId:  deal.id,
                  type:    "NOTE" as const,
                  content: `✉️ Direct-mail letter drafted — ready to print & send to the owner's mailing address.`,
                },
              });
            }
          } catch (e) {
            summary.errors.push(
              `letter/${deal.address}: ${e instanceof Error ? e.message : String(e)}`,
            );
          }
        }
      } catch (e) {
        summary.errors.push(
          `deals/${cityStr}: ${e instanceof Error ? e.message : String(e)}`,
        );
      }

      // ── Buyers ──────────────────────────────────────────────────────────────
      try {
        const buyers = await findBuyers({
          city: market.city,
          state: market.state ?? undefined,
          limit: 4,
        });
        summary.buyersFound += buyers.length;
        const saved = await createBuyersFromScored(buyers);
        summary.buyersSaved += saved.length;
      } catch (e) {
        summary.errors.push(
          `buyers/${cityStr}: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }

    // ── AI Briefing ─────────────────────────────────────────────────────────
    try {
      const allDeals = await listDeals();
      const now = Date.now();
      const followUpsDue = allDeals.filter(
        (d) => d.nextFollowUpAt && new Date(d.nextFollowUpAt).getTime() <= now,
      ).length;
      const topDeal = allDeals
        .filter((d) => d.score != null)
        .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];

      const primaryMarket = markets[0];
      const briefText = await dailyInsight({
        city: primaryMarket
          ? `${primaryMarket.city}, ${primaryMarket.state}`
          : undefined,
        newDeals: summary.dealsSaved,
        followUpsDue,
        topDeal: topDeal
          ? {
              address: topDeal.address,
              score: topDeal.score ?? 0,
              profit: topDeal.profit ?? undefined,
            }
          : undefined,
      });

      writeBriefing({
        text: briefText,
        dealsScanned: summary.dealsFound,
        buyersScanned: summary.buyersFound,
        generatedAt: new Date().toISOString(),
      });
      summary.briefingGenerated = true;

      // Email the briefing to the owner's address (blackkfruits@gmail.com)
      if (isResendConfigured()) {
        const ownerEmail = process.env.OWNER_EMAIL ?? "blackkfruits@gmail.com";
        await sendDailyBriefingEmail({
          toEmail: ownerEmail,
          briefingText: briefText,
          dealsFound: summary.dealsSaved,
          buyersFound: summary.buyersSaved,
        }).catch(() => null);
      }
    } catch (e) {
      summary.errors.push(
        `briefing: ${e instanceof Error ? e.message : String(e)}`,
      );
    }

    return NextResponse.json(apiOk(summary));
  } catch (e) {
    console.error("cron/daily-scan error", e);
    return NextResponse.json(
      apiError(e instanceof Error ? e.message : "Cron failed"),
      { status: 500 },
    );
  }
}
