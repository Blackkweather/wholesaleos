"use client";

import * as React from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Sparkles, CheckCircle2 } from "lucide-react";

interface ScoreData {
  score: number;
  verdict: "GO" | "CAUTION" | "PASS";
  components: { propertySignals: number; historicalConversion: number; profitability: number };
  reasons: string[];
}

const VERDICT_TONE: Record<string, "brand" | "warning" | "danger"> = {
  GO: "brand", CAUTION: "warning", PASS: "danger",
};

function Bar({ label, value, weight }: { label: string; value: number; weight: string }) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-sm">
        <span className="text-muted-foreground">{label} <span className="text-xs opacity-60">({weight})</span></span>
        <span className="font-semibold">{value}</span>
      </div>
      <div className="h-2 overflow-hidden rounded bg-muted/40">
        <div className="h-full rounded bg-primary/70" style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

export function LeadScoreCard({ dealId }: { dealId: string }) {
  const [data, setData] = React.useState<ScoreData | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let on = true;
    fetch(`/api/deals/${dealId}/score`)
      .then((r) => r.json())
      .then((j) => { if (on) setData(j?.data ?? null); })
      .finally(() => { if (on) setLoading(false); });
    return () => { on = false; };
  }, [dealId]);

  if (loading) {
    return (
      <Card className="flex items-center justify-center p-6 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </Card>
    );
  }
  if (!data) return null;

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-heading text-lg tracking-wide">
          <Sparkles className="h-5 w-5 text-primary" /> Lead Score
        </h3>
        <div className="flex items-center gap-3">
          <span className="font-heading text-3xl tracking-wide text-[#00ff87]">{data.score}</span>
          <Badge variant={VERDICT_TONE[data.verdict]}>{data.verdict}</Badge>
        </div>
      </div>

      <div className="space-y-3">
        <Bar label="Property signals" value={data.components.propertySignals} weight="40%" />
        <Bar label="Historical conversion" value={data.components.historicalConversion} weight="30%" />
        <Bar label="Projected profitability" value={data.components.profitability} weight="30%" />
      </div>

      {data.reasons.length > 0 && (
        <div className="mt-4 border-t border-border pt-3">
          <div className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Why</div>
          <ul className="space-y-1.5">
            {data.reasons.map((r, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#00ff87]" />
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
