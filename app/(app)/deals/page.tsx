"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { LayoutGrid, Rows3, Radar, Search, Loader2 } from "lucide-react";
import { useDeals } from "@/lib/hooks/use-deals";
import { DealKanban } from "@/components/deals/deal-kanban";
import { DealCard } from "@/components/deals/deal-card";
import { StageBadge } from "@/components/deals/stage-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { COPY } from "@/constants/copy";

export default function DealsPage() {
  const { data: deals, isLoading } = useDeals();
  const qc = useQueryClient();
  const [view, setView] = React.useState<"board" | "list">("board");
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [tracing, setTracing] = React.useState(false);
  const [progress, setProgress] = React.useState({ current: 0, total: 0 });

  const activeCount = deals?.filter((d) => d.stage !== "DEAD").length ?? 0;

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });

  // Skip trace selected leads IN SEQUENCE (avoid Apify rate limits) with progress
  const runBulkSkipTrace = async () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    setTracing(true);
    setProgress({ current: 0, total: ids.length });
    let found = 0;
    for (let i = 0; i < ids.length; i++) {
      setProgress({ current: i + 1, total: ids.length });
      try {
        const res = await fetch(`/api/deals/${ids[i]}/skip-trace`, { method: "POST" });
        const json = await res.json();
        if (res.ok && ((json.data?.phones?.length ?? 0) > 0 || (json.data?.emails?.length ?? 0) > 0)) found++;
      } catch { /* keep going */ }
    }
    setTracing(false);
    setSelected(new Set());
    toast.success(`Skip traced ${ids.length} lead${ids.length === 1 ? "" : "s"} — ${found} had contact info`);
    qc.invalidateQueries({ queryKey: ["deals"] });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-heading text-3xl tracking-wide sm:text-4xl">
            Pipeline
          </h1>
          <p className="text-sm text-muted-foreground">
            {activeCount} active {activeCount === 1 ? "deal" : "deals"} in motion.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-border p-0.5">
            <button
              onClick={() => setView("board")}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors",
                view === "board"
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <LayoutGrid className="h-4 w-4" /> Board
            </button>
            <button
              onClick={() => setView("list")}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors",
                view === "list"
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Rows3 className="h-4 w-4" /> List
            </button>
          </div>
          <Button asChild variant="brand">
            <Link href="/find">
              <Radar className="h-4 w-4" /> Find deals
            </Link>
          </Button>
        </div>
      </div>

      {isLoading && (
        <div className="flex gap-4 overflow-hidden">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-64 w-72 shrink-0 rounded-xl" />
          ))}
        </div>
      )}

      {!isLoading && deals && deals.length === 0 && (
        <Card className="flex flex-col items-center justify-center gap-3 p-12 text-center">
          <h3 className="font-heading text-xl tracking-wide">
            {COPY.empty.deals.title}
          </h3>
          <p className="max-w-sm text-sm text-muted-foreground">
            {COPY.empty.deals.body}
          </p>
          <Button asChild variant="brand">
            <Link href="/find">
              <Radar className="h-4 w-4" /> Run your first scan
            </Link>
          </Button>
        </Card>
      )}

      {!isLoading && deals && deals.length > 0 && (
        <>
          {view === "board" ? (
            <DealKanban deals={deals} />
          ) : (
            <>
              <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/20 px-3 py-2">
                <span className="text-sm text-muted-foreground">
                  {selected.size > 0 ? `${selected.size} selected` : "Tick leads to skip trace in bulk"}
                </span>
                <Button variant="brand" size="sm" onClick={runBulkSkipTrace} disabled={selected.size === 0 || tracing}>
                  {tracing ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Tracing {progress.current} of {progress.total}…</>
                  ) : (
                    <><Search className="h-4 w-4" /> Skip Trace Selected{selected.size > 0 ? ` (${selected.size})` : ""}</>
                  )}
                </Button>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {deals.map((deal) => (
                  <div key={deal.id} className="relative">
                    <input
                      type="checkbox"
                      checked={selected.has(deal.id)}
                      onChange={() => toggle(deal.id)}
                      className="absolute left-3 top-3 z-10 h-4 w-4 cursor-pointer accent-[#00ff87]"
                      aria-label={`Select ${deal.address}`}
                    />
                    <DealCard deal={deal} href={`/deals/${deal.id}`} footer={<StageBadge stage={deal.stage} />} />
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
