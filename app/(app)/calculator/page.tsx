"use client";

import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Sparkles, Loader2, Calculator as CalcIcon, Plus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { apiFetch } from "@/lib/api";
import { computeDeal } from "@/lib/calc";
import { useAddManualDeal } from "@/lib/hooks/use-deals";
import { formatCurrency, formatPercent, cn } from "@/lib/utils";
import type { DealAnalysis } from "@/types";

function toNum(v: string): number {
  return Number(v.replace(/[^0-9.]/g, "")) || 0;
}

function MoneyField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm text-muted-foreground">{label}</label>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
          $
        </span>
        <Input
          inputMode="numeric"
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, ""))}
          className="pl-7 font-mono"
        />
      </div>
    </div>
  );
}

const VERDICT_BAR: Record<string, string> = {
  GO: "bg-brand",
  CAUTION: "bg-warning",
  PASS: "bg-danger",
};

export default function CalculatorPage() {
  const [arv, setArv] = React.useState("300000");
  const [repairs, setRepairs] = React.useState("40000");
  const [offer, setOffer] = React.useState("165000");
  const [fee, setFee] = React.useState("12000");
  const [address, setAddress] = React.useState("");
  const [city, setCity] = React.useState("");

  const result = React.useMemo(
    () =>
      computeDeal({
        arv: toNum(arv),
        repairCost: toNum(repairs),
        offerPrice: toNum(offer),
        assignmentFee: toNum(fee),
      }),
    [arv, repairs, offer, fee],
  );

  const analyze = useMutation({
    mutationFn: (withComps: boolean) =>
      apiFetch<{ analysis: DealAnalysis }>("/api/analyze", {
        method: "POST",
        body: JSON.stringify({
          address: address || undefined,
          city: city || undefined,
          arv: toNum(arv),
          repairCost: toNum(repairs),
          offerPrice: toNum(offer),
          assignmentFee: toNum(fee),
          withComps,
        }),
      }).then((d) => d.analysis),
  });

  const save = useAddManualDeal();

  const saveDeal = () => {
    if (!address.trim()) {
      toast.error("Add a property address to save it");
      return;
    }
    save.mutate(
      {
        address: address.trim(),
        city: city.trim() || undefined,
        arv: toNum(arv),
        repairCost: toNum(repairs),
        offerPrice: toNum(offer),
      },
      { onSuccess: () => toast.success("Saved to pipeline", { description: address }) },
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-3xl tracking-wide sm:text-4xl">
          Deal Calculator
        </h1>
        <p className="text-sm text-muted-foreground">
          Run the numbers instantly, then let AI write your negotiation play.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Inputs */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalcIcon className="h-4 w-4 text-primary" /> The numbers
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <MoneyField label="After-repair value (ARV)" value={arv} onChange={setArv} />
            <MoneyField label="Estimated repairs" value={repairs} onChange={setRepairs} />
            <MoneyField label="Your offer price" value={offer} onChange={setOffer} />
            <MoneyField label="Assignment fee" value={fee} onChange={setFee} />
            <div className="grid grid-cols-2 gap-3 border-t border-border pt-4">
              <div className="space-y-1.5">
                <label className="text-sm text-muted-foreground">
                  Address (optional)
                </label>
                <Input
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="123 Maple Ave"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm text-muted-foreground">City (optional)</label>
                <Input
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="Palm Bay, FL"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Results */}
        <Card className="border-primary/20">
          <CardHeader>
            <CardTitle className="text-base">Verdict</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-center justify-between">
              <Badge
                variant={
                  result.verdict === "GO"
                    ? "brand"
                    : result.verdict === "CAUTION"
                      ? "warning"
                      : "danger"
                }
                className="text-sm"
              >
                {result.verdict}
              </Badge>
              <div className="text-right">
                <div className="font-heading text-4xl tracking-wide text-brand text-glow">
                  {formatCurrency(result.profit)}
                </div>
                <div className="text-xs text-muted-foreground">your spread</div>
              </div>
            </div>

            <div>
              <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                <span>Deal strength</span>
                <span>{formatPercent(result.strength)}</span>
              </div>
              <Progress
                value={result.strength}
                indicatorClassName={VERDICT_BAR[result.verdict]}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Stat label="MAO (max offer)" value={formatCurrency(result.mao)} />
              <Stat
                label="Offer vs MAO"
                value={
                  (result.headroom >= 0 ? "+" : "") + formatCurrency(result.headroom)
                }
                tone={result.headroom >= 0 ? "brand" : "danger"}
              />
              <Stat label="Margin on ARV" value={formatPercent(result.marginPct)} />
              <Stat label="Assignment fee" value={formatCurrency(result.profit)} />
            </div>

            <p className="text-xs text-muted-foreground">
              MAO = ARV × 70% − repairs. Stay at or below it to protect your spread.
            </p>

            <div className="flex flex-wrap gap-2 border-t border-border pt-4">
              <Button
                variant="brand"
                onClick={() => analyze.mutate(false)}
                disabled={analyze.isPending}
              >
                {analyze.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                AI negotiation
              </Button>
              <Button
                variant="outline"
                onClick={() => analyze.mutate(true)}
                disabled={analyze.isPending}
              >
                With live comps
              </Button>
              <Button variant="outline" onClick={saveDeal} disabled={save.isPending}>
                <Plus className="h-4 w-4" /> Save to pipeline
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {analyze.data && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-primary" /> AI deal play
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">{analyze.data.reasoning}</p>

            {analyze.data.negotiation && (
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
                <div className="mb-1 text-sm font-semibold text-primary">
                  Negotiation script
                </div>
                <p className="text-sm">{analyze.data.negotiation}</p>
              </div>
            )}

            {analyze.data.counters && analyze.data.counters.length > 0 && (
              <div className="space-y-2">
                <div className="text-sm font-medium">Counter-offer simulator</div>
                {analyze.data.counters.map((c, i) => (
                  <div key={i} className="rounded-md border border-border p-3 text-sm">
                    <div className="font-medium text-warning">{c.ifTheyCounter}</div>
                    <div className="mt-1 text-muted-foreground">{c.youRespond}</div>
                  </div>
                ))}
              </div>
            )}

            {analyze.data.comps && analyze.data.comps.length > 0 && (
              <div>
                <div className="mb-2 text-sm font-medium">Comparable sales</div>
                <div className="space-y-1.5">
                  {analyze.data.comps.map((c, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm"
                    >
                      <span className="truncate text-muted-foreground">{c.address}</span>
                      <span className="font-mono font-semibold">
                        {formatCurrency(c.soldPrice)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "brand" | "danger";
}) {
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          "font-mono text-lg font-semibold",
          tone === "brand" && "text-brand",
          tone === "danger" && "text-danger",
        )}
      >
        {value}
      </div>
    </div>
  );
}
