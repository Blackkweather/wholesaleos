"use client";

import { KANBAN_STAGES, STAGE_META } from "@/constants/config";
import { DealPipelineCard } from "./deal-pipeline-card";
import { cn } from "@/lib/utils";
import type { DealView } from "@/types";

const DOT: Record<string, string> = {
  info: "bg-info",
  warning: "bg-warning",
  brand: "bg-brand",
  danger: "bg-danger",
  muted: "bg-muted-foreground",
};

export function DealKanban({ deals }: { deals: DealView[] }) {
  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {KANBAN_STAGES.map((stage) => {
        const col = deals.filter((d) => d.stage === stage);
        const meta = STAGE_META[stage];
        return (
          <div key={stage} className="flex w-72 shrink-0 flex-col">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className={cn("h-2 w-2 rounded-full", DOT[meta.token])} />
                <span className="font-heading tracking-wide">{meta.label}</span>
                <span className="text-xs text-muted-foreground">
                  {col.length}
                </span>
              </div>
            </div>
            <div className="space-y-3">
              {col.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
                  Empty
                </div>
              ) : (
                col.map((d) => <DealPipelineCard key={d.id} deal={d} />)
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
