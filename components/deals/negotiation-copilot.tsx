"use client";

import * as React from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Handshake, Loader2, Send, ShieldAlert, Copy, FileSignature } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

interface Playbook {
  mao: number | null;
  openingOffer: number | null;
  walkAway: number | null;
  counterLadder: number[];
  objectionHandlers: { objection: string; response: string }[];
  talkingPoints: string[];
  summary: string;
}

interface Turn { role: "seller" | "you"; text: string }

function copy(t: string) {
  navigator.clipboard?.writeText(t).then(() => toast.success("Copied")).catch(() => {});
}

export function NegotiationCopilot({ dealId }: { dealId: string }) {
  const [pb, setPb] = React.useState<Playbook | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [history, setHistory] = React.useState<Turn[]>([]);
  const [input, setInput] = React.useState("");
  const [thinking, setThinking] = React.useState(false);
  const [agreedPrice, setAgreedPrice] = React.useState("");
  const [sending, setSending] = React.useState(false);

  React.useEffect(() => {
    fetch(`/api/deals/${dealId}/negotiation`)
      .then((r) => r.json())
      .then((j) => { setPb(j?.data ?? null); if (j?.data?.mao) setAgreedPrice(String(j.data.mao)); })
      .finally(() => setLoading(false));
  }, [dealId]);

  const sendContract = async () => {
    setSending(true);
    try {
      const price = Number(agreedPrice.replace(/[^0-9.]/g, "")) || undefined;
      const res = await fetch(`/api/deals/${dealId}/send-contract`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agreedPrice: price }),
      });
      const json = await res.json();
      if (res.ok) toast.success(`Agreement sent to ${json.data.to} for signature`);
      else toast.error(json?.error ?? "Could not send");
    } catch {
      toast.error("Could not send");
    } finally {
      setSending(false);
    }
  };

  const ask = async () => {
    const said = input.trim();
    if (!said || thinking) return;
    const newHistory: Turn[] = [...history, { role: "seller", text: said }];
    setHistory(newHistory);
    setInput("");
    setThinking(true);
    try {
      const res = await fetch(`/api/deals/${dealId}/negotiation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sellerSaid: said, history }),
      });
      const json = await res.json();
      const reply = json?.data?.response ?? "Couldn't generate a response.";
      setHistory((h) => [...h, { role: "you", text: reply }]);
    } catch {
      toast.error("Copilot failed");
    } finally {
      setThinking(false);
    }
  };

  if (loading) return <Card className="flex justify-center p-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></Card>;
  if (!pb) return null;

  return (
    <div className="space-y-4">
      {/* The numbers — your ceiling */}
      <Card className="p-5">
        <h3 className="mb-3 flex items-center gap-2 font-heading text-lg tracking-wide">
          <Handshake className="h-5 w-5 text-primary" /> Negotiation Playbook
        </h3>
        {pb.summary && <p className="mb-4 text-[15px] leading-relaxed">{pb.summary}</p>}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg border border-border p-3">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Open at</div>
            <div className="font-heading text-xl tracking-wide">{formatCurrency(pb.openingOffer)}</div>
          </div>
          <div className="rounded-lg border border-primary/40 bg-primary/5 p-3">
            <div className="text-xs uppercase tracking-wider text-primary">Max offer (MAO)</div>
            <div className="font-heading text-xl tracking-wide text-[#00ff87]">{formatCurrency(pb.mao)}</div>
          </div>
          <div className="rounded-lg border border-border p-3">
            <div className="flex items-center gap-1 text-xs uppercase tracking-wider text-danger"><ShieldAlert className="h-3 w-3" /> Walk above</div>
            <div className="font-heading text-xl tracking-wide">{formatCurrency(pb.walkAway)}</div>
          </div>
        </div>
        {pb.counterLadder.length > 1 && (
          <div className="mt-3">
            <div className="mb-1.5 text-xs uppercase tracking-wider text-muted-foreground">Counter ladder</div>
            <div className="flex flex-wrap items-center gap-2">
              {pb.counterLadder.map((n, i) => (
                <React.Fragment key={i}>
                  <Badge variant={i === pb.counterLadder.length - 1 ? "brand" : "secondary"}>{formatCurrency(n)}</Badge>
                  {i < pb.counterLadder.length - 1 && <span className="text-muted-foreground">→</span>}
                </React.Fragment>
              ))}
            </div>
          </div>
        )}
        {pb.talkingPoints.length > 0 && (
          <div className="mt-4">
            <div className="mb-1.5 text-xs uppercase tracking-wider text-muted-foreground">Talking points</div>
            <ul className="list-inside list-disc space-y-1 text-sm">{pb.talkingPoints.map((t, i) => <li key={i}>{t}</li>)}</ul>
          </div>
        )}
      </Card>

      {/* Live coach */}
      <Card className="p-5">
        <h3 className="mb-1 font-heading text-lg tracking-wide">Live Coach</h3>
        <p className="mb-3 text-xs text-muted-foreground">Type what the seller just said — get the exact words to say back (always under your max).</p>

        {history.length > 0 && (
          <div className="mb-3 space-y-2">
            {history.map((t, i) => (
              <div key={i} className={`flex ${t.role === "you" ? "justify-end" : ""}`}>
                <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${t.role === "you" ? "bg-primary text-primary-foreground" : "bg-muted/50"}`}>
                  {t.role === "you" && <span className="mr-1 text-[10px] uppercase opacity-70">say:</span>}{t.text}
                  {t.role === "you" && <button onClick={() => copy(t.text)} className="ml-2 inline-flex opacity-70 hover:opacity-100"><Copy className="h-3 w-3" /></button>}
                </div>
              </div>
            ))}
          </div>
        )}

        <form onSubmit={(e) => { e.preventDefault(); ask(); }} className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="“Your offer is too low…”"
            className="flex-1 rounded-xl border border-border bg-background px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/50"
            disabled={thinking}
          />
          <Button type="submit" variant="brand" size="icon" disabled={thinking || !input.trim()}>
            {thinking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </form>

        {/* Objection cheat-sheet */}
        {pb.objectionHandlers.length > 0 && (
          <div className="mt-4 border-t border-border pt-3">
            <div className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">Common objections</div>
            <div className="space-y-2">
              {pb.objectionHandlers.map((o, i) => (
                <details key={i} className="rounded-lg border border-border p-2.5">
                  <summary className="cursor-pointer text-sm font-medium">{o.objection}</summary>
                  <div className="mt-1.5 flex items-start justify-between gap-2 text-sm text-muted-foreground">
                    <span>{o.response}</span>
                    <button onClick={() => copy(o.response)} className="shrink-0 opacity-70 hover:opacity-100"><Copy className="h-3.5 w-3.5" /></button>
                  </div>
                </details>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* Close it — route the contract for signature (human-approved) */}
      <Card className="border-primary/30 p-5">
        <h3 className="mb-1 flex items-center gap-2 font-heading text-lg tracking-wide">
          <FileSignature className="h-5 w-5 text-primary" /> Close It — Send for Signature
        </h3>
        <p className="mb-3 text-xs text-muted-foreground">
          Once you&apos;ve agreed on a price, route the purchase agreement to the seller. They sign their copy, you countersign yours — no one signs for anyone.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={agreedPrice}
            onChange={(e) => setAgreedPrice(e.target.value)}
            placeholder="Agreed price"
            className="flex-1 rounded-xl border border-border bg-background px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/50"
          />
          <Button variant="brand" onClick={sendContract} disabled={sending}>
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSignature className="h-4 w-4" />}
            Send for Signature
          </Button>
        </div>
      </Card>
    </div>
  );
}
