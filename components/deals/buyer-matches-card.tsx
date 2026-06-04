"use client";

import * as React from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Users, Loader2, Phone, Mail, Send } from "lucide-react";

interface Match {
  buyer: { id: string; name: string; company: string | null; phone: string | null; email: string | null };
  matchScore: number;
  reasons: string[];
}

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

export function BuyerMatchesCard({ dealId }: { dealId: string }) {
  const [matches, setMatches] = React.useState<Match[] | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [sending, setSending] = React.useState(false);

  React.useEffect(() => {
    let on = true;
    fetch(`/api/deals/${dealId}/buyers`)
      .then((r) => r.json())
      .then((j) => {
        if (!on) return;
        const ms: Match[] = j?.data?.matches ?? [];
        setMatches(ms);
        // Pre-select the top matches that actually have an email
        setSelected(new Set(ms.filter((m) => m.buyer.email).slice(0, 10).map((m) => m.buyer.id)));
      })
      .finally(() => { if (on) setLoading(false); });
    return () => { on = false; };
  }, [dealId]);

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const send = async () => {
    const buyerIds = Array.from(selected);
    if (buyerIds.length === 0) return;
    setSending(true);
    try {
      const res = await fetch(`/api/deals/${dealId}/send-to-buyers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ buyerIds }),
      });
      const json = await res.json();
      if (res.ok) {
        toast.success(`Deal sheet sent to ${json.data.sent} buyer${json.data.sent === 1 ? "" : "s"}`, {
          description: `Priced at ${fmt(json.data.buyerPrice)} — replies come to your inbox`,
        });
        window.dispatchEvent(new CustomEvent("dispo:refresh"));
      } else {
        toast.error(json?.error ?? "Could not send");
      }
    } catch {
      toast.error("Could not send");
    } finally {
      setSending(false);
    }
  };

  if (loading) return <Card className="flex justify-center p-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></Card>;
  if (!matches) return null;

  const emailable = matches.filter((m) => m.buyer.email).length;
  const tone = (s: number) => (s >= 70 ? "brand" : s >= 50 ? "warning" : "muted") as "brand" | "warning" | "muted";

  return (
    <Card className="p-5">
      <h3 className="mb-3 flex items-center gap-2 font-heading text-lg tracking-wide">
        <Users className="h-5 w-5 text-primary" /> Best Buyer Matches
        {matches.length > 0 && <span className="text-sm font-normal text-muted-foreground">({matches.length})</span>}
      </h3>

      {matches.length === 0 ? (
        <p className="text-sm text-muted-foreground">No buyer matches yet — add buyers or run a buyer scan.</p>
      ) : (
        <>
          <div className="space-y-2">
            {matches.slice(0, 8).map((m) => {
              const hasEmail = !!m.buyer.email;
              const isSel = selected.has(m.buyer.id);
              return (
                <div key={m.buyer.id} className={`flex items-center gap-3 rounded-lg border p-3 ${isSel ? "border-primary/40 bg-primary/5" : "border-border"}`}>
                  <input
                    type="checkbox"
                    checked={isSel}
                    disabled={!hasEmail}
                    onChange={() => toggle(m.buyer.id)}
                    className="h-4 w-4 shrink-0 accent-[#00ff87] disabled:opacity-30"
                    aria-label={`Select ${m.buyer.name}`}
                  />
                  <div className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-lg bg-primary/10">
                    <span className="font-heading text-sm leading-none text-[#00ff87]">{m.matchScore}%</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{m.buyer.company || m.buyer.name}</div>
                    <div className="flex flex-wrap gap-1 pt-0.5">
                      {!hasEmail && <Badge variant="muted" className="text-[10px]">no email</Badge>}
                      {m.reasons.slice(0, 3).map((r, i) => (
                        <Badge key={i} variant={tone(m.matchScore)} className="text-[10px]">{r}</Badge>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    {m.buyer.phone && (
                      <Button asChild variant="outline" size="icon" aria-label="Call buyer">
                        <a href={`tel:${m.buyer.phone}`}><Phone className="h-4 w-4" /></a>
                      </Button>
                    )}
                    {m.buyer.email && (
                      <Button asChild variant="outline" size="icon" aria-label="Email buyer">
                        <a href={`mailto:${m.buyer.email}`}><Mail className="h-4 w-4" /></a>
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {emailable > 0 && (
            <div className="mt-4 flex flex-col gap-2 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-muted-foreground">
                Emails a deal sheet (their price + their spread) to the selected buyers. Replies come to your inbox.
              </p>
              <Button variant="brand" onClick={send} disabled={sending || selected.size === 0} className="shrink-0">
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Send to {selected.size} buyer{selected.size === 1 ? "" : "s"}
              </Button>
            </div>
          )}
        </>
      )}
    </Card>
  );
}
