import Link from "next/link";
import { MapPin } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScoreRing } from "./score-ring";
import { DEAL_TYPE_META } from "@/constants/config";
import { formatCurrency, cn } from "@/lib/utils";
import type { DealType } from "@prisma/client";

export interface DealCardData {
  id?: string;
  address: string;
  city?: string | null;
  state?: string | null;
  situation?: string | null;
  dealType: DealType;
  score?: number | null;
  arv?: number | null;
  offerPrice?: number | null;
  profit?: number | null;
  verdict?: string | null;
  source?: string | null;
}

function Stat({ label, value, glow }: { label: string; value: string; glow?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          "font-mono text-sm font-semibold",
          glow && "text-brand text-glow-sm",
        )}
      >
        {value}
      </div>
    </div>
  );
}

export function DealCard({
  deal,
  href,
  footer,
  className,
}: {
  deal: DealCardData;
  href?: string;
  footer?: React.ReactNode;
  className?: string;
}) {
  const meta = DEAL_TYPE_META[deal.dealType] ?? DEAL_TYPE_META.OTHER;
  const verdictVariant =
    deal.verdict === "GO"
      ? "brand"
      : deal.verdict === "CAUTION"
        ? "warning"
        : deal.verdict === "PASS"
          ? "danger"
          : "muted";

  const body = (
    <Card
      className={cn(
        "flex h-full flex-col gap-3 p-4 transition-colors hover:border-primary/40",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Badge variant="secondary" className="mb-1.5">
            {meta.label}
          </Badge>
          <h3 className="truncate font-heading text-lg tracking-wide">
            {deal.address}
          </h3>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="h-3 w-3" />
            {[deal.city, deal.state].filter(Boolean).join(", ")}
          </div>
        </div>
        {typeof deal.score === "number" && <ScoreRing score={deal.score} />}
      </div>

      {deal.situation && (
        <p className="line-clamp-2 text-sm text-muted-foreground">
          {deal.situation}
        </p>
      )}

      <div className="mt-auto grid grid-cols-3 gap-2 border-t border-border pt-3">
        <Stat label="ARV" value={formatCurrency(deal.arv, { compact: true })} />
        <Stat label="Offer" value={formatCurrency(deal.offerPrice, { compact: true })} />
        <Stat label="Spread" value={formatCurrency(deal.profit, { compact: true })} glow />
      </div>

      {(deal.verdict || footer) && (
        <div className="flex items-center justify-between gap-2">
          {deal.verdict ? (
            <Badge variant={verdictVariant}>{deal.verdict}</Badge>
          ) : (
            <span />
          )}
          {footer}
        </div>
      )}
    </Card>
  );

  return href ? (
    <Link href={href} className="block h-full">
      {body}
    </Link>
  ) : (
    body
  );
}
