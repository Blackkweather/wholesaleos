"use client";

import * as React from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Brain } from "lucide-react";

interface Intel {
  hasData: boolean;
  motivationLevel?: "Low" | "Medium" | "High";
  timeline?: string;
  propertyCondition?: string;
  priceExpectation?: string;
  objections?: string[];
  distressSignals?: string[];
  summary?: string;
  touchpoints?: number;
}

const MOT_TONE: Record<string, "brand" | "warning" | "danger"> = {
  High: "brand", Medium: "warning", Low: "danger",
};

export function SellerIntelCard({ dealId }: { dealId: string }) {
  const [intel, setIntel] = React.useState<Intel | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let on = true;
    fetch(`/api/deals/${dealId}/intelligence`)
      .then((r) => r.json())
      .then((j) => { if (on) setIntel(j?.data ?? null); })
      .finally(() => { if (on) setLoading(false); });
    return () => { on = false; };
  }, [dealId]);

  if (loading) return null;
  if (!intel?.hasData) {
    return (
      <Card className="border-dashed p-4 text-sm text-muted-foreground">
        <span className="flex items-center gap-2">
          <Brain className="h-4 w-4" /> Seller intelligence will appear here once the seller responds (call or text).
        </span>
      </Card>
    );
  }

  const field = (label: string, value?: string) =>
    value && value.toLowerCase() !== "unknown" ? (
      <div>
        <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="text-sm font-medium">{value}</div>
      </div>
    ) : null;

  return (
    <Card className="border-primary/30 p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-heading text-lg tracking-wide">
          <Brain className="h-5 w-5 text-primary" /> Seller Intelligence
        </h3>
        {intel.motivationLevel && (
          <Badge variant={MOT_TONE[intel.motivationLevel]}>{intel.motivationLevel} motivation</Badge>
        )}
      </div>

      {intel.summary && <p className="mb-4 text-[15px] leading-relaxed">{intel.summary}</p>}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {field("Timeline", intel.timeline)}
        {field("Condition", intel.propertyCondition)}
        {field("Price expectation", intel.priceExpectation)}
      </div>

      {(intel.distressSignals?.length ?? 0) > 0 && (
        <div className="mt-4">
          <div className="mb-1.5 text-xs uppercase tracking-wider text-muted-foreground">Distress signals</div>
          <div className="flex flex-wrap gap-1.5">
            {intel.distressSignals!.map((d, i) => <Badge key={i} variant="danger">{d}</Badge>)}
          </div>
        </div>
      )}

      {(intel.objections?.length ?? 0) > 0 && (
        <div className="mt-3">
          <div className="mb-1.5 text-xs uppercase tracking-wider text-muted-foreground">Objections to handle</div>
          <ul className="list-inside list-disc text-sm text-muted-foreground">
            {intel.objections!.map((o, i) => <li key={i}>{o}</li>)}
          </ul>
        </div>
      )}
    </Card>
  );
}
