"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Clock, MessageSquareText, Mail, FileText, Loader2, Check, ChevronRight, Flame, Phone } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";

interface QueueItem {
  deal: { id: string; address: string; city: string | null; ownerName: string | null; ownerPhone: string | null; offerPrice: number | null; profit: number | null; stage: string };
  step: number;
  dueDate: string;
  overdueDays: number;
  priority: number;
  priorityLabel: string;
}

interface Drafts { sms: string; email: string; letter: string }

const PRIORITY_TONE: Record<number, "danger" | "brand" | "warning" | "muted"> = {
  1: "brand", 2: "warning", 3: "danger", 4: "muted",
};

function copy(text: string) {
  navigator.clipboard?.writeText(text).then(() => toast.success("Copied")).catch(() => toast.error("Copy failed"));
}

export function FollowUpQueue() {
  const [items, setItems] = React.useState<QueueItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [dueOnly, setDueOnly] = React.useState(true);
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [drafts, setDrafts] = React.useState<Record<string, Drafts>>({});
  const [drafting, setDrafting] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/follow-ups${dueOnly ? "?due=1" : ""}`);
      const json = await res.json();
      setItems(json?.data?.queue ?? []);
    } finally {
      setLoading(false);
    }
  }, [dueOnly]);

  React.useEffect(() => { load(); }, [load]);

  const draft = async (id: string) => {
    setOpenId(openId === id ? null : id);
    if (drafts[id] || openId === id) return;
    setDrafting(id);
    try {
      const res = await fetch(`/api/deals/${id}/follow-up`);
      const json = await res.json();
      if (json?.data?.drafts) setDrafts((d) => ({ ...d, [id]: json.data.drafts }));
      else toast.error("Could not draft");
    } finally {
      setDrafting(null);
    }
  };

  const markSent = async (id: string) => {
    const res = await fetch(`/api/deals/${id}/follow-up`, { method: "POST" });
    if (res.ok) {
      toast.success("Follow-up logged — cadence advanced");
      setOpenId(null);
      load();
    } else toast.error("Could not record");
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 font-heading text-3xl tracking-wide">
            <Clock className="h-7 w-7 text-primary" /> Follow-Ups {dueOnly ? "Due Today" : "(All)"}
          </h1>
          <p className="text-sm text-muted-foreground">
            Prioritized: interested sellers → previous responders → hot leads → everyone else.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setDueOnly((v) => !v)}>
          {dueOnly ? "Show all scheduled" : "Show due only"}
        </Button>
      </div>

      {loading ? (
        <Card className="p-10 text-center text-muted-foreground">
          <Loader2 className="mx-auto h-5 w-5 animate-spin" />
        </Card>
      ) : items.length === 0 ? (
        <Card className="p-10 text-center">
          <Check className="mx-auto h-8 w-8 text-[#00ff87]" />
          <p className="mt-2 font-heading text-xl tracking-wide">All caught up</p>
          <p className="text-sm text-muted-foreground">No follow-ups {dueOnly ? "due right now" : "scheduled"}.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((it) => (
            <Card key={it.deal.id} className="overflow-hidden">
              <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                <div className="flex-1">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <Badge variant={PRIORITY_TONE[it.priority]}>
                      {it.priority === 3 && <Flame className="mr-1 h-3 w-3" />}
                      {it.priorityLabel}
                    </Badge>
                    <Badge variant="secondary">Follow-up #{it.step}</Badge>
                    {it.overdueDays > 0 && <Badge variant="danger">{it.overdueDays}d overdue</Badge>}
                    {it.deal.ownerPhone && <Badge variant="brand">📞 Call/text preferred</Badge>}
                  </div>
                  <div className="font-medium">{it.deal.address}</div>
                  <div className="text-sm text-muted-foreground">
                    {it.deal.ownerName ?? "Owner"} · {it.deal.city} · est. {formatCurrency(it.deal.profit)} spread
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {it.deal.ownerPhone ? (
                    <>
                      <Button asChild variant="brand" size="sm" title="Preferred: call the seller">
                        <a href={`tel:${it.deal.ownerPhone}`}><Phone className="h-4 w-4" /> Call</a>
                      </Button>
                      <Button asChild variant="outline" size="sm">
                        <a href={`sms:${it.deal.ownerPhone}`}><MessageSquareText className="h-4 w-4" /> Text</a>
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => draft(it.deal.id)} disabled={drafting === it.deal.id} title="Draft a message">
                        {drafting === it.deal.id ? <Loader2 className="h-4 w-4 animate-spin" /> : "Draft"}
                      </Button>
                    </>
                  ) : (
                    <Button variant="brand" size="sm" onClick={() => draft(it.deal.id)} disabled={drafting === it.deal.id}>
                      {drafting === it.deal.id ? <Loader2 className="h-4 w-4 animate-spin" /> : "Draft follow-up"}
                    </Button>
                  )}
                  <Button asChild variant="ghost" size="sm">
                    <Link href={`/deals/${it.deal.id}`}>Open <ChevronRight className="h-4 w-4" /></Link>
                  </Button>
                </div>
              </div>

              {openId === it.deal.id && drafts[it.deal.id] && (
                <div className="space-y-3 border-t border-border bg-muted/20 p-4">
                  {([
                    { key: "sms", label: "SMS", icon: MessageSquareText },
                    { key: "email", label: "Email", icon: Mail },
                    { key: "letter", label: "Letter", icon: FileText },
                  ] as const).map(({ key, label, icon: Icon }) => (
                    <div key={key}>
                      <div className="mb-1 flex items-center justify-between">
                        <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          <Icon className="h-3.5 w-3.5" /> {label}
                        </span>
                        <Button variant="ghost" size="sm" onClick={() => copy(drafts[it.deal.id][key])}>Copy</Button>
                      </div>
                      <p className="whitespace-pre-wrap rounded-lg bg-background p-3 text-sm">{drafts[it.deal.id][key]}</p>
                    </div>
                  ))}
                  <div className="flex justify-end pt-1">
                    <Button variant="brand" size="sm" onClick={() => markSent(it.deal.id)}>
                      <Check className="h-4 w-4" /> I sent this — log it
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
