"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  Search,
  Loader2,
  Plus,
  Check,
  SlidersHorizontal,
  Radar,
  Info,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { DealCard } from "@/components/deals/deal-card";
import { useScan, useSaveDeals } from "@/lib/hooks/use-deals";
import { DEAL_TYPES, DEAL_TYPE_META } from "@/constants/config";
import { COPY } from "@/constants/copy";
import type { ScoredDeal } from "@/types";
import type { DealType } from "@prisma/client";

function toNumber(v: string): number | undefined {
  const n = Number(v.replace(/[^0-9.]/g, ""));
  return v.trim() && Number.isFinite(n) ? n : undefined;
}

export default function FindPage() {
  const [city, setCity] = React.useState("");
  const [minPrice, setMinPrice] = React.useState("");
  const [maxPrice, setMaxPrice] = React.useState("");
  const [types, setTypes] = React.useState<DealType[]>([]);
  const [showFilters, setShowFilters] = React.useState(false);
  const [results, setResults] = React.useState<ScoredDeal[]>([]);
  const [live, setLive] = React.useState(true);
  const [hasScanned, setHasScanned] = React.useState(false);
  const [added, setAdded] = React.useState<Set<string>>(new Set());

  const scan = useScan();
  const save = useSaveDeals();

  const toggleType = (t: DealType) =>
    setTypes((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t],
    );

  const runScan = (e: React.FormEvent) => {
    e.preventDefault();
    if (!city.trim()) {
      toast.error("Enter a city to scan");
      return;
    }
    scan.mutate(
      {
        city: city.trim(),
        minPrice: toNumber(minPrice),
        maxPrice: toNumber(maxPrice),
        dealTypes: types.length ? types : undefined,
        limit: 8,
      },
      {
        onSuccess: (data) => {
          setResults(data.deals);
          setLive(data.live);
          setHasScanned(true);
          setAdded(new Set());
        },
        onError: () => toast.error("Scan failed. Try again."),
      },
    );
  };

  const addOne = (deal: ScoredDeal) => {
    save.mutate([deal], {
      onSuccess: () => {
        setAdded((s) => new Set(s).add(deal.address));
        toast.success(COPY.toasts.dealSaved, { description: deal.address });
      },
      onError: () => toast.error("Could not add deal"),
    });
  };

  const addAll = () => {
    const remaining = results.filter((d) => !added.has(d.address));
    if (remaining.length === 0) return;
    save.mutate(remaining, {
      onSuccess: () => {
        setAdded(new Set(results.map((d) => d.address)));
        toast.success(`${remaining.length} deals added to pipeline`);
      },
      onError: () => toast.error("Could not add deals"),
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-3xl tracking-wide sm:text-4xl">
          Find Deals
        </h1>
        <p className="text-sm text-muted-foreground">
          Scan a market and let AI surface scored, motivated-seller properties.
        </p>
      </div>

      <Card className="p-4">
        <form onSubmit={runScan} className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="City or ZIP — e.g. Palm Bay, FL"
              className="h-11 pl-9"
              aria-label="City to scan"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="h-11"
            onClick={() => setShowFilters((v) => !v)}
          >
            <SlidersHorizontal className="h-4 w-4" />
            Filters
          </Button>
          <Button type="submit" variant="brand" size="lg" className="h-11" disabled={scan.isPending}>
            {scan.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Radar className="h-4 w-4" />
            )}
            {scan.isPending ? "Scanning…" : "Scan"}
          </Button>
        </form>

        {showFilters && (
          <div className="mt-4 space-y-4 border-t border-border pt-4">
            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="flex-1 space-y-1.5">
                <label className="text-xs text-muted-foreground">Min price</label>
                <Input
                  inputMode="numeric"
                  value={minPrice}
                  onChange={(e) => setMinPrice(e.target.value)}
                  placeholder="$0"
                />
              </div>
              <div className="flex-1 space-y-1.5">
                <label className="text-xs text-muted-foreground">Max price</label>
                <Input
                  inputMode="numeric"
                  value={maxPrice}
                  onChange={(e) => setMaxPrice(e.target.value)}
                  placeholder="Any"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Deal types</label>
              <div className="flex flex-wrap gap-2">
                {DEAL_TYPES.map((t) => {
                  const active = types.includes(t);
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => toggleType(t)}
                      className={
                        "rounded-full border px-3 py-1 text-xs transition-colors " +
                        (active
                          ? "border-primary bg-primary/15 text-primary"
                          : "border-border text-muted-foreground hover:text-foreground")
                      }
                    >
                      {DEAL_TYPE_META[t].label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </Card>

      {scan.isPending && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-56 w-full rounded-xl" />
          ))}
        </div>
      )}

      {!scan.isPending && results.length > 0 && (
        <div className="space-y-4">
          {!live && (
            <div className="flex items-center gap-2 rounded-lg border border-border bg-card/60 p-3 text-xs text-muted-foreground">
              <Info className="h-4 w-4 shrink-0 text-info" />
              Showing sample deals. Add <code className="text-foreground">ANTHROPIC_API_KEY</code> to run real, live scans.
            </div>
          )}
          <div className="flex items-center justify-between">
            <h2 className="font-heading text-xl tracking-wide">
              {results.length} deals found
            </h2>
            <Button
              variant="outline"
              size="sm"
              onClick={addAll}
              disabled={!live || save.isPending || results.every((d) => added.has(d.address))}
            >
              <Plus className="h-4 w-4" />
              Add all to pipeline
            </Button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {results.map((deal, i) => {
              const isAdded = added.has(deal.address);
              return (
                <DealCard
                  key={`${deal.address}-${i}`}
                  deal={deal}
                  footer={
                    !live ? (
                      <Badge variant="muted">Sample — not saved</Badge>
                    ) : isAdded ? (
                      <Badge variant="brand">
                        <Check className="mr-1 h-3 w-3" /> Added
                      </Badge>
                    ) : (
                      <Button
                        variant="brand"
                        size="sm"
                        onClick={() => addOne(deal)}
                        disabled={save.isPending}
                      >
                        <Plus className="h-4 w-4" /> Add
                      </Button>
                    )
                  }
                />
              );
            })}
          </div>
        </div>
      )}

      {!scan.isPending && hasScanned && results.length === 0 && (
        <Card className="p-10 text-center">
          <h3 className="font-heading text-xl tracking-wide">
            {COPY.empty.scanResults.title}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {COPY.empty.scanResults.body}
          </p>
        </Card>
      )}

      {!hasScanned && !scan.isPending && (
        <Card className="flex flex-col items-center justify-center gap-2 p-12 text-center">
          <div className="grid h-12 w-12 place-items-center rounded-xl bg-primary/15 text-primary">
            <Radar className="h-6 w-6" />
          </div>
          <h3 className="font-heading text-xl tracking-wide">Scan your first market</h3>
          <p className="max-w-sm text-sm text-muted-foreground">
            Enter a city above. AI searches distressed listings, scores each deal,
            and you add the best to your pipeline.
          </p>
        </Card>
      )}
    </div>
  );
}
