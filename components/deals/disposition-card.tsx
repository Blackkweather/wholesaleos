"use client";

import * as React from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Send, Loader2, ThumbsUp, ThumbsDown, Handshake, CheckCircle2 } from "lucide-react";

type Status = "SENT" | "INTERESTED" | "PASSED" | "ASSIGNED";
interface Dispo {
  id: string;
  buyerId: string;
  name: string;
  email: string | null;
  phone: string | null;
  status: Status;
  sentAt: string;
}

const STATUS_META: Record<Status, { label: string; variant: "secondary" | "warning" | "muted" | "brand" }> = {
  SENT: { label: "Sent", variant: "secondary" },
  INTERESTED: { label: "Interested", variant: "warning" },
  PASSED: { label: "Passed", variant: "muted" },
  ASSIGNED: { label: "Assigned ✓", variant: "brand" },
};

export function DispositionCard({ dealId }: { dealId: string }) {
  const [rows, setRows] = React.useState<Dispo[] | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);

  const load = React.useCallback(() => {
    fetch(`/api/deals/${dealId}/disposition`)
      .then((r) => r.json())
      .then((j) => setRows(j?.data?.rows ?? []))
      .catch(() => setRows([]));
  }, [dealId]);

  React.useEffect(() => {
    load();
    const h = () => load();
    window.addEventListener("dispo:refresh", h);
    return () => window.removeEventListener("dispo:refresh", h);
  }, [load]);

  const setStatus = async (buyerId: string, status: Status) => {
    setBusy(buyerId);
    try {
      const res = await fetch(`/api/deals/${dealId}/disposition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ buyerId, status }),
      });
      const j = await res.json();
      if (res.ok) {
        if (status === "ASSIGNED") toast.success("Deal assigned — stage moved to Assigned 🤝");
        load();
      } else {
        toast.error(j?.error ?? "Could not update");
      }
    } catch {
      toast.error("Could not update");
    } finally {
      setBusy(null);
    }
  };

  // Hidden until at least one deal sheet has gone out.
  if (!rows || rows.length === 0) return null;

  const assigned = rows.find((r) => r.status === "ASSIGNED");

  return (
    <Card className="p-5">
      <h3 className="mb-3 flex items-center gap-2 font-heading text-lg tracking-wide">
        <Send className="h-5 w-5 text-primary" /> Disposition
        <span className="text-sm font-normal text-muted-foreground">({rows.length} sent)</span>
      </h3>

      {assigned && (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-primary/40 bg-primary/5 p-3 text-sm">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-[#00ff87]" />
          Assigned to <b>{assigned.name}</b>
        </div>
      )}

      <div className="space-y-2">
        {rows.map((r) => {
          const meta = STATUS_META[r.status];
          const isBusy = busy === r.buyerId;
          return (
            <div key={r.id} className="flex items-center gap-3 rounded-lg border border-border p-3">
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{r.name}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {r.email ?? r.phone ?? "—"} · sent {new Date(r.sentAt).toLocaleDateString()}
                </div>
              </div>
              <Badge variant={meta.variant}>{meta.label}</Badge>
              {r.status !== "ASSIGNED" && (
                <div className="flex shrink-0 gap-1">
                  {r.status !== "INTERESTED" && (
                    <Button size="icon" variant="outline" disabled={isBusy} onClick={() => setStatus(r.buyerId, "INTERESTED")} aria-label="Mark interested">
                      <ThumbsUp className="h-4 w-4" />
                    </Button>
                  )}
                  {r.status !== "PASSED" && (
                    <Button size="icon" variant="outline" disabled={isBusy} onClick={() => setStatus(r.buyerId, "PASSED")} aria-label="Mark passed">
                      <ThumbsDown className="h-4 w-4" />
                    </Button>
                  )}
                  <Button size="sm" variant="brand" disabled={isBusy} onClick={() => setStatus(r.buyerId, "ASSIGNED")}>
                    {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Handshake className="h-4 w-4" />}
                    Assign
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
