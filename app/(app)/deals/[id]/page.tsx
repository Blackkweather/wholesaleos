"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  Flame,
  Trash2,
  MessageSquareText,
  Mail,
  Copy,
  Loader2,
  Sparkles,
  ChevronRight,
  Send,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScoreRing } from "@/components/deals/score-ring";
import { StageBadge } from "@/components/deals/stage-badge";
import { CallButton } from "@/components/deals/call-button";
import { LeadScoreCard } from "@/components/deals/lead-score-card";
import { SellerIntelCard } from "@/components/deals/seller-intel-card";
import { BuyerMatchesCard } from "@/components/deals/buyer-matches-card";
import { DispositionCard } from "@/components/deals/disposition-card";
import { SkipTracePanel } from "@/components/deals/skip-trace-panel";
import { NegotiationCopilot } from "@/components/deals/negotiation-copilot";
import {
  useDeal,
  useUpdateDeal,
  useDeleteDeal,
  useGenerateScript,
  useGenerateSms,
  useAnalyzeDeal,
} from "@/lib/hooks/use-deals";
import {
  DEAL_TYPE_META,
  KANBAN_STAGES,
  STAGE_META,
  MAO_ARV_MULTIPLIER,
} from "@/constants/config";
import { COPY } from "@/constants/copy";
import { formatCurrency, formatPercent, cn } from "@/lib/utils";
import type { Stage } from "@prisma/client";
import type { SequenceMessage, DealAnalysis } from "@/types";

const SCRIPT_TYPES: { type: string; label: string }[] = [
  { type: "COLD_CALL", label: "Cold call" },
  { type: "VOICEMAIL", label: "Voicemail" },
  { type: "TEXT", label: "Text" },
  { type: "EMAIL", label: "Email" },
  { type: "LETTER", label: "Letter" },
  { type: "NEGOTIATION", label: "Negotiation" },
];

function copyText(text: string, label: string = COPY.toasts.copied) {
  if (typeof navigator !== "undefined" && navigator.clipboard) {
    navigator.clipboard
      .writeText(text)
      .then(() => toast.success(label))
      .catch(() => toast.error("Copy failed"));
  }
}

export default function DealDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const router = useRouter();
  const { data: deal, isLoading } = useDeal(params.id);
  const update = useUpdateDeal();
  const del = useDeleteDeal();
  const [jvLoading, setJvLoading] = React.useState(false);
  const [letterLoading, setLetterLoading] = React.useState(false);
  const [lobLoading, setLobLoading] = React.useState(false);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (!deal) {
    return (
      <Card className="p-10 text-center">
        <h2 className="font-heading text-xl tracking-wide">Deal not found</h2>
        <Button asChild variant="outline" className="mt-4">
          <Link href="/deals">Back to pipeline</Link>
        </Button>
      </Card>
    );
  }

  const meta = DEAL_TYPE_META[deal.dealType] ?? DEAL_TYPE_META.OTHER;
  const mao =
    deal.arv != null
      ? Math.max(0, Math.round(deal.arv * MAO_ARV_MULTIPLIER - (deal.repairCost ?? 0)))
      : null;

  const setStage = (stage: Stage) =>
    update.mutate(
      { id: deal.id, patch: { stage } },
      { onSuccess: () => toast.success(`Moved to ${STAGE_META[stage].label}`) },
    );

  const remove = () =>
    del.mutate(deal.id, {
      onSuccess: () => {
        toast.success("Deal removed");
        router.push("/deals");
      },
    });

  // Build a shareable JV lead pack and copy it for pasting to a partner wholesaler
  const copyJvPack = async () => {
    setJvLoading(true);
    try {
      const res = await fetch(`/api/deals/${deal.id}/lead-pack`);
      const json = await res.json();
      if (json?.data?.text) {
        copyText(json.data.text, "JV pack copied — paste it to a partner wholesaler");
      } else {
        toast.error("Could not build lead pack");
      }
    } catch {
      toast.error("Could not build lead pack");
    } finally {
      setJvLoading(false);
    }
  };

  // Send the letter physically via Lob (human-approved one-click mail)
  const sendViaLob = async () => {
    setLobLoading(true);
    try {
      const preview = await fetch(`/api/deals/${deal.id}/mail`).then((r) => r.json());
      if (!preview?.data?.lobConfigured) {
        toast.error("Add your Lob API key + return address in .env to mail automatically");
        return;
      }
      if (!preview?.data?.to) {
        toast.error("No mailing address on this deal");
        return;
      }
      if (!window.confirm(`Mail this letter to ${preview.data.to.name} in ${preview.data.to.city}, ${preview.data.to.state}? This sends a real letter via Lob.`)) return;
      const res = await fetch(`/api/deals/${deal.id}/mail`, { method: "POST" });
      const json = await res.json();
      if (res.ok) toast.success(`Mailed! Expected delivery ${json?.data?.expectedDelivery ?? "soon"}`);
      else toast.error(json?.error ?? "Mail failed");
    } catch {
      toast.error("Mail failed");
    } finally {
      setLobLoading(false);
    }
  };

  // Fetch the ready-to-mail cash-offer letter (with owner's mailing address)
  const copyMailLetter = async () => {
    setLetterLoading(true);
    try {
      const res = await fetch(`/api/deals/${deal.id}/letter`);
      const json = await res.json();
      const d = json?.data;
      if (d?.content) {
        const header = d.mailingAddress ? `MAIL TO: ${d.owner}\n${d.mailingAddress}\n\n` : "";
        copyText(header + d.content, "Mail letter copied — ready to print & send");
      } else {
        toast.error("Could not build letter");
      }
    } catch {
      toast.error("Could not build letter");
    } finally {
      setLetterLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <Link
        href="/deals"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Pipeline
      </Link>

      {/* Header */}
      <Card className="p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            {typeof deal.score === "number" && (
              <ScoreRing score={deal.score} size={64} />
            )}
            <div>
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{meta.label}</Badge>
                <StageBadge stage={deal.stage} />
                {deal.hot && (
                  <Badge variant="danger">
                    <Flame className="mr-1 h-3 w-3" /> Hot
                  </Badge>
                )}
                {deal.verdict && (
                  <Badge
                    variant={
                      deal.verdict === "GO"
                        ? "brand"
                        : deal.verdict === "CAUTION"
                          ? "warning"
                          : "danger"
                    }
                  >
                    {deal.verdict}
                  </Badge>
                )}
              </div>
              <h1 className="font-heading text-2xl tracking-wide sm:text-3xl">
                {deal.address}
              </h1>
              <p className="text-sm text-muted-foreground">
                {[deal.city, deal.state].filter(Boolean).join(", ")}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="brand"
              size="sm"
              onClick={copyJvPack}
              disabled={jvLoading}
              title="Copy a shareable JV lead pack to send a partner wholesaler"
            >
              {jvLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
              JV Pack
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={copyMailLetter}
              disabled={letterLoading}
              title="Copy a ready-to-mail cash-offer letter addressed to the owner"
            >
              {letterLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Mail className="h-4 w-4" />
              )}
              Mail Letter
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={sendViaLob}
              disabled={lobLoading}
              title="Print & mail this letter from the US via Lob (one click)"
            >
              {lobLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Mail via Lob
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  Move <ChevronRight className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {KANBAN_STAGES.filter((s) => s !== deal.stage).map((s) => (
                  <DropdownMenuItem key={s} onClick={() => setStage(s)}>
                    {STAGE_META[s].label}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuItem onClick={() => setStage("DEAD")}>
                  Mark dead
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              variant={deal.hot ? "brand" : "outline"}
              size="icon"
              onClick={() => update.mutate({ id: deal.id, patch: { hot: !deal.hot } })}
              aria-label="Toggle hot"
            >
              <Flame className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={remove}
              aria-label="Delete deal"
              className="text-danger"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Financials */}
        <div className="mt-5 grid grid-cols-2 gap-3 border-t border-border pt-5 sm:grid-cols-5">
          <Metric label="ARV" value={formatCurrency(deal.arv)} />
          <Metric label="Offer" value={formatCurrency(deal.offerPrice)} />
          <Metric label="Repairs" value={formatCurrency(deal.repairCost)} />
          <Metric label="MAO" value={formatCurrency(mao)} />
          <Metric label="Spread" value={formatCurrency(deal.profit)} glow />
        </div>

        {/* Owner contact */}
        {(deal.ownerName || deal.ownerPhone || deal.ownerEmail) && (
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-4">
            {deal.ownerName && (
              <span className="text-sm font-medium">{deal.ownerName}</span>
            )}
            {deal.ownerPhone && (
              <>
                <CallButton
                  deal={{
                    id: deal.id,
                    address: deal.address,
                    ownerName: deal.ownerName,
                    ownerPhone: deal.ownerPhone,
                  }}
                  label={deal.ownerPhone}
                  variant="outline"
                />
                <Button asChild variant="outline" size="sm">
                  <a href={`sms:${deal.ownerPhone}`}>
                    <MessageSquareText className="h-4 w-4" /> Text
                  </a>
                </Button>
              </>
            )}
            {deal.ownerEmail && (
              <Button asChild variant="outline" size="sm">
                <a href={`mailto:${deal.ownerEmail}`}>
                  <Mail className="h-4 w-4" /> {deal.ownerEmail}
                </a>
              </Button>
            )}
          </div>
        )}
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <TabsList className="w-full justify-start overflow-x-auto sm:w-auto">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="negotiate">Negotiate</TabsTrigger>
          <TabsTrigger value="scripts">Scripts</TabsTrigger>
          <TabsTrigger value="sms">SMS</TabsTrigger>
          <TabsTrigger value="analyze">Analysis</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="space-y-4">
            <SkipTracePanel
              dealId={deal.id}
              ownerName={deal.ownerName}
              ownerPhone={deal.ownerPhone}
              ownerEmail={deal.ownerEmail}
            />
            <SellerIntelCard dealId={deal.id} />
            <LeadScoreCard dealId={deal.id} />
            <BuyerMatchesCard dealId={deal.id} />
            <DispositionCard dealId={deal.id} />
            <OverviewTab deal={deal} />
          </div>
        </TabsContent>
        <TabsContent value="negotiate">
          <NegotiationCopilot dealId={deal.id} />
        </TabsContent>
        <TabsContent value="scripts">
          <ScriptsTab dealId={deal.id} />
        </TabsContent>
        <TabsContent value="sms">
          <SmsTab dealId={deal.id} phone={deal.ownerPhone} />
        </TabsContent>
        <TabsContent value="analyze">
          <AnalyzeTab dealId={deal.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Metric({
  label,
  value,
  glow,
}: {
  label: string;
  value: string;
  glow?: boolean;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          "font-mono text-lg font-semibold",
          glow && "text-brand text-glow-sm",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function OverviewTab({
  deal,
}: {
  deal: NonNullable<ReturnType<typeof useDeal>["data"]>;
}) {
  const update = useUpdateDeal();
  const [notes, setNotes] = React.useState(deal.notes ?? "");

  return (
    <div className="space-y-4">
      {deal.aiSummary && (
        <Card className="border-primary/30">
          <CardContent className="flex gap-3 pt-6">
            <Sparkles className="h-5 w-5 shrink-0 text-primary" />
            <p className="text-sm">{deal.aiSummary}</p>
          </CardContent>
        </Card>
      )}
      {deal.situation && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Situation</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{deal.situation}</p>
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Notes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Add a note about this deal…"
            rows={4}
          />
          <Button
            size="sm"
            onClick={() =>
              update.mutate(
                { id: deal.id, patch: { notes } },
                { onSuccess: () => toast.success("Notes saved") },
              )
            }
            disabled={update.isPending}
          >
            Save notes
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function ScriptsTab({ dealId }: { dealId: string }) {
  const gen = useGenerateScript();
  const [type, setType] = React.useState("COLD_CALL");
  const [content, setContent] = React.useState("");

  const run = () =>
    gen.mutate(
      { id: dealId, type },
      {
        onSuccess: (c) => setContent(c),
        onError: () => toast.error("Could not generate"),
      },
    );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {SCRIPT_TYPES.map((s) => (
          <button
            key={s.type}
            onClick={() => setType(s.type)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs transition-colors",
              type === s.type
                ? "border-primary bg-primary/15 text-primary"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {s.label}
          </button>
        ))}
      </div>
      <Button onClick={run} variant="brand" disabled={gen.isPending}>
        {gen.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Sparkles className="h-4 w-4" />
        )}
        Generate {SCRIPT_TYPES.find((s) => s.type === type)?.label}
      </Button>
      {content && (
        <Card>
          <CardContent className="space-y-3 pt-6">
            <pre className="whitespace-pre-wrap font-sans text-sm">{content}</pre>
            <Button variant="outline" size="sm" onClick={() => copyText(content)}>
              <Copy className="h-4 w-4" /> Copy
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function SmsTab({ dealId, phone }: { dealId: string; phone: string | null }) {
  const gen = useGenerateSms();
  const [messages, setMessages] = React.useState<SequenceMessage[]>([]);
  const [starting, setStarting] = React.useState(false);
  const [started, setStarted] = React.useState(false);

  const run = () =>
    gen.mutate(dealId, {
      onSuccess: (m) => setMessages(m),
      onError: () => toast.error("Could not generate"),
    });

  const startDrip = async () => {
    setStarting(true);
    try {
      const res = await fetch(`/api/deals/${dealId}/start-sequence`, { method: "POST" });
      const json = await res.json();
      if (res.ok) {
        setStarted(true);
        toast.success(json?.data?.message ?? "Automated text sequence started");
      } else {
        toast.error(json?.error ?? "Could not start the sequence");
      }
    } catch {
      toast.error("Could not start the sequence");
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="border-primary/30">
        <CardContent className="space-y-3 pt-5">
          <div className="flex items-start gap-2">
            <Send className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <div>
              <p className="text-sm font-medium">Automated text drip (you approve this lead)</p>
              <p className="text-xs text-muted-foreground">
                Queues an AI-written 7-message sequence. Your Twilio number sends each one on
                cadence over the next weeks — first within the hour. Only start this for a lead
                you intend to contact.
              </p>
            </div>
          </div>
          <Button onClick={startDrip} variant="brand" disabled={starting || started || !phone}>
            {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {started ? "Drip running" : "Start automated drip"}
          </Button>
          {!phone && (
            <p className="text-xs text-warning">No seller phone on file — run a skip trace first.</p>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center gap-3 text-xs uppercase tracking-wider text-muted-foreground">
        <span className="h-px flex-1 bg-border" /> or text manually <span className="h-px flex-1 bg-border" />
      </div>

      <Button onClick={run} variant="outline" disabled={gen.isPending}>
        {gen.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <MessageSquareText className="h-4 w-4" />
        )}
        Generate follow-up sequence
      </Button>
      <div className="space-y-3">
        {messages.map((m) => (
          <Card key={m.step}>
            <CardContent className="space-y-2 pt-5">
              <div className="flex items-center justify-between">
                <Badge variant="info">Day {m.day}</Badge>
                <span className="text-xs text-muted-foreground">{m.label}</span>
              </div>
              <p className="text-sm">{m.message}</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => copyText(m.message)}>
                  <Copy className="h-4 w-4" /> Copy
                </Button>
                {phone && (
                  <Button asChild variant="outline" size="sm">
                    <a href={`sms:${phone}?&body=${encodeURIComponent(m.message)}`}>
                      <MessageSquareText className="h-4 w-4" /> Send
                    </a>
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function AnalyzeTab({ dealId }: { dealId: string }) {
  const analyze = useAnalyzeDeal();
  const [result, setResult] = React.useState<DealAnalysis | null>(null);

  const run = (withComps: boolean) =>
    analyze.mutate(
      { id: dealId, withComps },
      {
        onSuccess: (a) => setResult(a),
        onError: () => toast.error("Could not analyze"),
      },
    );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => run(false)} variant="brand" disabled={analyze.isPending}>
          {analyze.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          Run analysis
        </Button>
        <Button onClick={() => run(true)} variant="outline" disabled={analyze.isPending}>
          With live comps
        </Button>
      </div>

      {result && (
        <Card>
          <CardContent className="space-y-5 pt-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground">
                  Verdict
                </div>
                <Badge
                  variant={
                    result.verdict === "GO"
                      ? "brand"
                      : result.verdict === "CAUTION"
                        ? "warning"
                        : "danger"
                  }
                  className="mt-1"
                >
                  {result.verdict}
                </Badge>
              </div>
              <div className="w-1/2">
                <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                  <span>Deal strength</span>
                  <span>{formatPercent(result.strength)}</span>
                </div>
                <Progress value={result.strength} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Metric label="ARV" value={formatCurrency(result.arv)} />
              <Metric label="MAO" value={formatCurrency(result.mao)} />
              <Metric label="Profit" value={formatCurrency(result.profit)} glow />
              <Metric label="Margin" value={formatPercent(result.marginPct)} />
            </div>

            <p className="text-sm text-muted-foreground">{result.reasoning}</p>

            {result.comps && result.comps.length > 0 && (
              <div>
                <div className="mb-2 text-sm font-medium">Comparable sales</div>
                <div className="space-y-1.5">
                  {result.comps.map((c, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm"
                    >
                      <span className="truncate text-muted-foreground">
                        {c.address}
                      </span>
                      <span className="font-mono font-semibold">
                        {formatCurrency(c.soldPrice)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {result.negotiation && (
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
                <div className="mb-1 text-sm font-semibold text-primary">
                  Negotiation play
                </div>
                <p className="text-sm">{result.negotiation}</p>
              </div>
            )}

            {result.counters && result.counters.length > 0 && (
              <div className="space-y-2">
                <div className="text-sm font-medium">Counter-offer simulator</div>
                {result.counters.map((c, i) => (
                  <div key={i} className="rounded-md border border-border p-3 text-sm">
                    <div className="font-medium text-warning">{c.ifTheyCounter}</div>
                    <div className="mt-1 text-muted-foreground">{c.youRespond}</div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
