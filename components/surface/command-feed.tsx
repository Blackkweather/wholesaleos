"use client";

import { useState } from "react";
import type { CommandFeed as Feed, FeedItem } from "@/lib/command/feed";

/**
 * The Executive OS surface: a briefing plus three ranked stacks. The operator
 * lives here — Decisions / Risks / Opportunities — and resolves by exception.
 */

type Resolution = "approved" | "rejected" | "dismissed";

function recoLine(reco: unknown): string {
  if (reco && typeof reco === "object") {
    const r = reco as Record<string, unknown>;
    const addr = typeof r.address === "string" ? r.address : null;
    const extra =
      typeof r.score === "number" ? `score ${r.score}` :
      typeof r.matchCount === "number" ? `${r.matchCount} buyers` :
      typeof r.said === "string" ? `"${String(r.said).slice(0, 80)}"` : null;
    return [addr, extra].filter(Boolean).join(" — ") || JSON.stringify(r).slice(0, 120);
  }
  return String(reco ?? "");
}

function Card({ item, onResolve }: { item: FeedItem; onResolve: (id: string, r: Resolution) => void }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3 text-sm">
      <div className="flex items-center justify-between">
        <span className="font-medium">{recoLine(item.recommendation)}</span>
        {item.moneyExempt && (
          <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600">GATE</span>
        )}
      </div>
      <div className="mt-2 flex gap-2">
        <button onClick={() => onResolve(item.id, "approved")} className="rounded bg-primary px-2 py-1 text-xs font-medium text-primary-foreground">Approve</button>
        <button onClick={() => onResolve(item.id, "rejected")} className="rounded border border-border px-2 py-1 text-xs">Reject</button>
        <button onClick={() => onResolve(item.id, "dismissed")} className="rounded px-2 py-1 text-xs text-muted-foreground">Dismiss</button>
      </div>
    </div>
  );
}

function Stack({ title, accent, items, onResolve }: { title: string; accent: string; items: FeedItem[]; onResolve: (id: string, r: Resolution) => void }) {
  return (
    <section className="flex-1">
      <h2 className={`mb-2 text-sm font-semibold ${accent}`}>{title} <span className="text-muted-foreground">({items.length})</span></h2>
      <div className="space-y-2">
        {items.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nothing needs you here.</p>
        ) : (
          items.map((i) => <Card key={i.id} item={i} onResolve={onResolve} />)
        )}
      </div>
    </section>
  );
}

export function CommandFeed({ initial }: { initial: Feed }) {
  const [feed, setFeed] = useState<Feed>(initial);

  async function resolve(id: string, resolution: Resolution) {
    setFeed((f) => ({
      ...f,
      decisions: f.decisions.filter((i) => i.id !== id),
      risks: f.risks.filter((i) => i.id !== id),
      opportunities: f.opportunities.filter((i) => i.id !== id),
    }));
    try {
      await fetch(`/api/surface/${id}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resolution }),
      });
    } catch {
      /* optimistic — server reconciles on next load */
    }
  }

  return (
    <div className="space-y-6">
      <header className="rounded-lg border border-border bg-card p-4">
        <h1 className="text-lg font-semibold">Command</h1>
        {feed.briefing ? (
          <>
            <p className="mt-1 text-sm text-muted-foreground">{feed.briefing.headline}</p>
            <p className="mt-2 text-sm">{feed.briefing.narrative}</p>
          </>
        ) : (
          <p className="mt-1 text-sm text-muted-foreground">No briefing yet — it generates each morning.</p>
        )}
      </header>

      <div className="flex flex-col gap-6 lg:flex-row">
        <Stack title="🔴 Decisions" accent="text-red-600" items={feed.decisions} onResolve={resolve} />
        <Stack title="⚠️ Risks" accent="text-amber-600" items={feed.risks} onResolve={resolve} />
        <Stack title="💡 Opportunities" accent="text-emerald-600" items={feed.opportunities} onResolve={resolve} />
      </div>
    </div>
  );
}
