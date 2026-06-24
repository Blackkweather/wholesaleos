"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, RefreshCw, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/utils";
import type { OwnerRecord } from "@/types";

interface OwnershipData {
  ownerCount: number;
  owners: OwnerRecord[];
  provider?: string;
  cached?: boolean;
}

export function OwnershipCard({ dealId }: { dealId: string }) {
  const [data, setData] = React.useState<OwnershipData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);

  const load = React.useCallback(async (showToast = false) => {
    try {
      const res = await fetch(`/api/deals/${dealId}/ownership`);
      const json = await res.json();
      if (json?.data) setData(json.data);
      if (showToast) toast.success("Ownership data refreshed");
    } catch {
      if (showToast) toast.error("Could not load ownership");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [dealId]);

  React.useEffect(() => { load(); }, [load]);

  const refresh = () => {
    setRefreshing(true);
    load(true);
  };

  if (loading) return <Skeleton className="h-28 w-full rounded-xl" />;

  const owners = data?.owners ?? [];
  const count = data?.ownerCount ?? 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4 text-primary" />
            Ownership History
            {count > 0 && (
              <Badge variant="info">{count} owner{count !== 1 ? "s" : ""}</Badge>
            )}
          </CardTitle>
          <Button variant="ghost" size="icon" onClick={refresh} disabled={refreshing} className="h-7 w-7">
            {refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {owners.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No ownership records found. Click refresh to pull from county records, or ownership will be looked up automatically during deal verification.
          </p>
        ) : (
          <div className="space-y-2">
            {owners.map((o, i) => (
              <div
                key={`${o.name}-${i}`}
                className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate">{o.name}</span>
                    {i === 0 && <Badge variant="brand" className="text-[10px]">Current</Badge>}
                    {o.deedType && <Badge variant="secondary" className="text-[10px]">{o.deedType}</Badge>}
                  </div>
                  {(o.dateFrom || o.dateTo) && (
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {o.dateFrom && `From ${o.dateFrom}`}
                      {o.dateFrom && o.dateTo && " — "}
                      {o.dateTo && `To ${o.dateTo}`}
                    </div>
                  )}
                </div>
                {o.salePrice != null && o.salePrice > 0 && (
                  <span className="ml-2 shrink-0 font-mono text-sm font-semibold">
                    {formatCurrency(o.salePrice)}
                  </span>
                )}
              </div>
            ))}
            {data?.provider && (
              <p className="text-[11px] text-muted-foreground">
                Source: {data.provider === "estated" ? "Estated deed records" : data.provider === "hcad" ? "Harris County (HCAD)" : "Manual"}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
