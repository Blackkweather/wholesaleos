"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  MessageSquareText,
  Loader2,
  Copy,
  Send,
  Phone,
  Radar,
  Info,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useDeals, useGenerateSms } from "@/lib/hooks/use-deals";
import { COPY } from "@/constants/copy";
import { formatCurrency } from "@/lib/utils";
import type { DealView, SequenceMessage } from "@/types";

export default function SmsHubPage() {
  const { data: deals, isLoading } = useDeals();
  const active = (deals ?? []).filter((d) => d.stage !== "DEAD" && d.stage !== "CLOSED");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-3xl tracking-wide sm:text-4xl">SMS Hub</h1>
        <p className="text-sm text-muted-foreground">
          Generate human follow-up sequences and fire them off with one tap.
        </p>
      </div>

      <div className="flex items-center gap-2 rounded-lg border border-border bg-card/60 p-3 text-xs text-muted-foreground">
        <Info className="h-4 w-4 shrink-0 text-info" />
        One-tap send opens your phone&apos;s messages app pre-filled. Add Twilio in
        Settings to auto-send scheduled sequences hands-free.
      </div>

      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      )}

      {!isLoading && active.length === 0 && (
        <Card className="flex flex-col items-center gap-3 p-12 text-center">
          <div className="grid h-12 w-12 place-items-center rounded-xl bg-primary/15 text-primary">
            <MessageSquareText className="h-6 w-6" />
          </div>
          <h3 className="font-heading text-xl tracking-wide">{COPY.empty.sms.title}</h3>
          <p className="max-w-sm text-sm text-muted-foreground">{COPY.empty.sms.body}</p>
          <Button asChild variant="brand">
            <Link href="/find">
              <Radar className="h-4 w-4" /> Find deals
            </Link>
          </Button>
        </Card>
      )}

      {!isLoading && active.length > 0 && (
        <div className="space-y-4">
          {active.map((deal) => (
            <SmsDealRow key={deal.id} deal={deal} />
          ))}
        </div>
      )}
    </div>
  );
}

function SmsDealRow({ deal }: { deal: DealView }) {
  const gen = useGenerateSms();
  const [messages, setMessages] = React.useState<SequenceMessage[]>([]);
  const [open, setOpen] = React.useState(false);

  const generate = () => {
    setOpen(true);
    gen.mutate(deal.id, {
      onSuccess: (m) => setMessages(m),
      onError: () => toast.error("Could not generate"),
    });
  };

  const copy = (text: string) =>
    navigator.clipboard?.writeText(text).then(() => toast.success(COPY.toasts.smsCopied));

  return (
    <Card>
      <CardContent className="pt-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <Link href={`/deals/${deal.id}`} className="font-medium hover:text-primary">
              {deal.address}
            </Link>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {deal.ownerPhone ? (
                <span className="flex items-center gap-1">
                  <Phone className="h-3 w-3" /> {deal.ownerPhone}
                </span>
              ) : (
                <span>No phone on file</span>
              )}
              <Badge variant="secondary">
                {formatCurrency(deal.profit, { compact: true })} spread
              </Badge>
            </div>
          </div>
          <Button variant="brand" size="sm" onClick={generate} disabled={gen.isPending}>
            {gen.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <MessageSquareText className="h-4 w-4" />
            )}
            {messages.length ? "Regenerate" : "Generate sequence"}
          </Button>
        </div>

        {open && messages.length > 0 && (
          <div className="mt-4 space-y-2 border-t border-border pt-4">
            {messages.map((m) => (
              <div
                key={m.step}
                className="flex flex-col gap-2 rounded-lg border border-border p-3 sm:flex-row sm:items-center"
              >
                <Badge variant="info" className="w-fit shrink-0">
                  Day {m.day}
                </Badge>
                <p className="flex-1 text-sm">{m.message}</p>
                <div className="flex gap-1.5">
                  <Button variant="ghost" size="icon" onClick={() => copy(m.message)}>
                    <Copy className="h-4 w-4" />
                  </Button>
                  {deal.ownerPhone && (
                    <Button asChild variant="ghost" size="icon">
                      <a
                        href={`sms:${deal.ownerPhone}?&body=${encodeURIComponent(m.message)}`}
                      >
                        <Send className="h-4 w-4" />
                      </a>
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
