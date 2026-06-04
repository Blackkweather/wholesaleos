"use client";

import Link from "next/link";
import { toast } from "sonner";
import { MoreVertical, Trash2, Flame, ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ScoreRing } from "./score-ring";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  DEAL_TYPE_META,
  KANBAN_STAGES,
  STAGE_META,
} from "@/constants/config";
import { formatCurrency, timeAgo, cn } from "@/lib/utils";
import { useUpdateDeal, useDeleteDeal } from "@/lib/hooks/use-deals";
import { COPY } from "@/constants/copy";
import type { DealView } from "@/types";
import type { Stage } from "@prisma/client";

export function DealPipelineCard({ deal }: { deal: DealView }) {
  const update = useUpdateDeal();
  const del = useDeleteDeal();
  const meta = DEAL_TYPE_META[deal.dealType] ?? DEAL_TYPE_META.OTHER;

  const move = (stage: Stage) =>
    update.mutate(
      { id: deal.id, patch: { stage } },
      {
        onSuccess: () =>
          toast.success(COPY.toasts.dealMoved, {
            description: `${deal.address} → ${STAGE_META[stage].label}`,
          }),
      },
    );

  const toggleHot = () =>
    update.mutate({ id: deal.id, patch: { hot: !deal.hot } });

  const remove = () =>
    del.mutate(deal.id, {
      onSuccess: () => toast.success("Deal removed"),
    });

  return (
    <Card className={cn("p-3", deal.hot && "border-danger/40")}>
      <div className="flex items-start justify-between gap-2">
        <Link href={`/deals/${deal.id}`} className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {meta.label}
            </span>
            {deal.hot && <Flame className="h-3 w-3 text-danger" />}
          </div>
          <div className="truncate font-medium leading-tight">{deal.address}</div>
          <div className="mt-1 font-mono text-sm font-semibold text-brand text-glow-sm">
            {formatCurrency(deal.profit, { compact: true })} spread
          </div>
        </Link>

        <div className="flex flex-col items-end gap-1">
          {typeof deal.score === "number" && (
            <ScoreRing score={deal.score} size={38} stroke={4} />
          )}
          <DropdownMenu>
            <DropdownMenuTrigger className="rounded p-1 text-muted-foreground outline-none hover:text-foreground">
              <MoreVertical className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Move to</DropdownMenuLabel>
              {KANBAN_STAGES.filter((s) => s !== deal.stage).map((s) => (
                <DropdownMenuItem key={s} onClick={() => move(s)}>
                  <ArrowRight /> {STAGE_META[s].label}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={toggleHot}>
                <Flame /> {deal.hot ? "Unmark hot" : "Mark hot"}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => move("DEAD")}>
                Mark dead
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={remove}
                className="text-danger focus:text-danger"
              >
                <Trash2 /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between border-t border-border pt-2 text-[11px] text-muted-foreground">
        <span>{formatCurrency(deal.arv, { compact: true })} ARV</span>
        <span>{timeAgo(deal.updatedAt)}</span>
      </div>
    </Card>
  );
}
