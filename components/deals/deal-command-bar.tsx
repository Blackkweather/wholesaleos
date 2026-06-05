"use client";

import * as React from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Phone, MessageSquareText, Mail, FileText, Handshake, FileSignature, Send, Loader2 } from "lucide-react";

/**
 * One command bar for every action on a deal — so nothing is buried in a tab.
 * Quick actions execute (call / text drip / email); deal-making actions jump to
 * the right tool. All outreach is still human-approved (you click it).
 */
export function DealCommandBar({
  dealId,
  ownerPhone,
  ownerEmail,
  onGoTo,
  onScrollToBuyers,
}: {
  dealId: string;
  ownerPhone: string | null;
  ownerEmail: string | null;
  onGoTo: (tab: string) => void;
  onScrollToBuyers: () => void;
}) {
  const [busy, setBusy] = React.useState<string | null>(null);

  const run = async (key: string, url: string, fallbackMsg: string) => {
    setBusy(key);
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" } });
      const j = await res.json().catch(() => ({}));
      if (res.ok) toast.success(j?.data?.message ?? fallbackMsg);
      else toast.error(j?.error ?? "Couldn't complete that");
    } catch {
      toast.error("Couldn't complete that");
    } finally {
      setBusy(null);
    }
  };

  const Divider = () => <span className="mx-1 hidden w-px self-stretch bg-border sm:block" />;

  return (
    <Card className="p-4">
      <div className="mb-2.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Deal command — one tap each
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {/* ── Contact the seller ── */}
        {ownerPhone ? (
          <Button asChild variant="outline" size="sm">
            <a href={`tel:${ownerPhone}`}><Phone className="h-4 w-4" /> Call</a>
          </Button>
        ) : (
          <Button variant="outline" size="sm" disabled><Phone className="h-4 w-4" /> Call</Button>
        )}
        <Button
          variant="brand"
          size="sm"
          onClick={() => run("text", `/api/deals/${dealId}/start-sequence`, "Text drip started")}
          disabled={!ownerPhone || busy === "text"}
        >
          {busy === "text" ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquareText className="h-4 w-4" />}
          Start text drip
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => run("email", `/api/deals/${dealId}/email-seller`, "Intro email sent")}
          disabled={!ownerEmail || busy === "email"}
        >
          {busy === "email" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
          Email seller
        </Button>
        <Button variant="outline" size="sm" onClick={() => onGoTo("scripts")}>
          <FileText className="h-4 w-4" /> Mail letter
        </Button>

        <Divider />

        {/* ── Make the deal ── */}
        <Button variant="outline" size="sm" onClick={() => onGoTo("negotiate")}>
          <Handshake className="h-4 w-4" /> Negotiate
        </Button>
        <Button variant="outline" size="sm" onClick={() => onGoTo("negotiate")}>
          <FileSignature className="h-4 w-4" /> Send contract
        </Button>

        <Divider />

        {/* ── Sell to a buyer ── */}
        <Button variant="outline" size="sm" onClick={onScrollToBuyers}>
          <Send className="h-4 w-4" /> Send to buyers
        </Button>
      </div>

      {(!ownerPhone || !ownerEmail) && (
        <p className="mt-2.5 text-xs text-muted-foreground">
          {!ownerPhone && "No phone yet — run a skip trace (Overview) to enable Call + Text. "}
          {!ownerEmail && "No email yet for the intro email."}
        </p>
      )}
    </Card>
  );
}
