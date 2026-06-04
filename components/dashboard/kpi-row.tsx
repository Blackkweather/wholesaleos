import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { Briefing } from "@/types";

const TONE: Record<string, string> = {
  brand: "text-brand text-glow-sm",
  warning: "text-warning",
  info: "text-info",
};

export function KpiRow({ stats }: { stats: Briefing["stats"] }) {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      {stats.map((stat) => (
        <Card key={stat.label} className="p-4">
          <div
            className={cn(
              "font-heading text-3xl tracking-wide",
              stat.tone ? TONE[stat.tone] : "text-foreground",
            )}
          >
            {stat.value}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">{stat.label}</div>
        </Card>
      ))}
    </div>
  );
}
