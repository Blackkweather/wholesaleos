"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  Sparkles,
  MessageSquareText,
  Phone,
  Eye,
  Clock,
  Check,
  Send,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { COPY } from "@/constants/copy";
import type { Briefing, BriefingAction } from "@/types";

const ACTION_ICON: Record<BriefingAction["kind"], React.ComponentType<{ className?: string }>> = {
  sms: MessageSquareText,
  call: Phone,
  review: Eye,
  follow_up: Clock,
};

export function BriefingCard({ briefing }: { briefing: Briefing }) {
  const [done, setDone] = React.useState<Record<string, boolean>>({});

  const approve = (action: BriefingAction) => {
    if (action.body && typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(action.body).catch(() => undefined);
      toast.success(COPY.toasts.smsCopied, { description: action.title });
    } else {
      toast.success("Approved", { description: action.title });
    }
    setDone((d) => ({ ...d, [action.id]: true }));
  };

  return (
    <Card className="overflow-hidden border-primary/30">
      <div className="flex items-start gap-3 border-b border-border bg-primary/5 p-5 sm:p-6">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary shadow-glow-sm">
          <Sparkles className="h-5 w-5" />
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-primary">
            Today&apos;s AI insight
          </div>
          <p className="mt-1 text-pretty text-[15px] leading-relaxed">
            {briefing.insight}
          </p>
        </div>
      </div>

      <div className="p-5 sm:p-6">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-heading text-lg tracking-wide">Today&apos;s approvals</h3>
          <span className="text-xs text-muted-foreground">
            {briefing.actions.length} ready
          </span>
        </div>

        <div className="space-y-2">
          {briefing.actions.map((action) => {
            const Icon = ACTION_ICON[action.kind];
            const isDone = done[action.id];
            return (
              <div
                key={action.id}
                className={cn(
                  "flex items-center gap-3 rounded-lg border border-border bg-background p-3 transition-colors",
                  isDone && "opacity-60",
                )}
              >
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{action.title}</div>
                  {action.subtitle && (
                    <div className="truncate text-xs text-muted-foreground">
                      {action.subtitle}
                    </div>
                  )}
                </div>
                {action.kind === "review" ? (
                  <Button variant="outline" size="sm" disabled={isDone}>
                    Review
                  </Button>
                ) : isDone ? (
                  <Button variant="ghost" size="sm" disabled className="text-brand">
                    <Check className="h-4 w-4" /> Done
                  </Button>
                ) : (
                  <Button variant="brand" size="sm" onClick={() => approve(action)}>
                    <Send className="h-4 w-4" /> Approve
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}
