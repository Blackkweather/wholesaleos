import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KANBAN_STAGES, STAGE_META, type StageKey } from "@/constants/config";
import { cn } from "@/lib/utils";

const BAR_TONE: Record<string, string> = {
  info: "bg-info",
  warning: "bg-warning",
  brand: "bg-brand",
  danger: "bg-danger",
  muted: "bg-muted-foreground",
};

export function PipelineSnapshot({
  counts,
}: {
  counts: Partial<Record<StageKey, number>>;
}) {
  const max = Math.max(1, ...KANBAN_STAGES.map((s) => counts[s] ?? 0));

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Pipeline</CardTitle>
        <Link href="/deals" className="text-xs text-primary hover:underline">
          View board
        </Link>
      </CardHeader>
      <CardContent className="space-y-3">
        {KANBAN_STAGES.map((stage) => {
          const meta = STAGE_META[stage];
          const count = counts[stage] ?? 0;
          return (
            <div key={stage} className="flex items-center gap-3">
              <div className="w-28 shrink-0 text-sm text-muted-foreground">
                {meta.label}
              </div>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
                <div
                  className={cn("h-full rounded-full transition-all", BAR_TONE[meta.token])}
                  style={{ width: `${(count / max) * 100}%` }}
                />
              </div>
              <div className="w-6 text-right font-mono text-sm font-semibold">
                {count}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
