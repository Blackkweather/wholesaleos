"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  Plus,
  Trash2,
  Mail,
  Phone,
  Globe,
  Loader2,
  Sparkles,
  Copy,
  Send,
  Search,
  Check,
  Info,
  UserPlus,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  useBuyers,
  useAddBuyer,
  useDeleteBuyer,
  useGeneratePitch,
  useScanBuyers,
  useSaveFoundBuyers,
} from "@/lib/hooks/use-buyers";
import { useDeals } from "@/lib/hooks/use-deals";
import { formatCurrency } from "@/lib/utils";
import { COPY } from "@/constants/copy";
import type { BuyerPitch, ScoredBuyer } from "@/types";

export default function BuyersPage() {
  const { data: buyers, isLoading } = useBuyers();
  const del = useDeleteBuyer();
  const emails = (buyers ?? []).map((b) => b.email).filter((e): e is string => !!e);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-heading text-3xl tracking-wide sm:text-4xl">Buyers</h1>
          <p className="text-sm text-muted-foreground">
            AI finds active cash buyers in your markets. You just approve.
          </p>
        </div>
        <AddBuyerDialog />
      </div>

      <FindBuyersPanel />

      {buyers && buyers.length > 0 && (
        <BlastTool buyerCount={emails.length} emails={emails} />
      )}

      <div>
        <h2 className="mb-3 font-heading text-xl tracking-wide">Your buyer list</h2>

        {isLoading && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-40 rounded-xl" />
            ))}
          </div>
        )}

        {!isLoading && buyers && buyers.length === 0 && (
          <Card className="p-8 text-center text-sm text-muted-foreground">
            {COPY.empty.buyers.body}
          </Card>
        )}

        {!isLoading && buyers && buyers.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {buyers.map((buyer) => (
              <Card key={buyer.id} className="p-4">
                <div className="flex items-start justify-between">
                  <div className="min-w-0">
                    <div className="truncate font-heading text-lg tracking-wide">
                      {buyer.company || buyer.name}
                    </div>
                    {buyer.company && (
                      <div className="truncate text-xs text-muted-foreground">
                        {buyer.name}
                      </div>
                    )}
                    {buyer.buyerType && (
                      <Badge variant="secondary" className="mt-1">
                        {buyer.buyerType}
                      </Badge>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:text-danger"
                    onClick={() =>
                      del.mutate(buyer.id, {
                        onSuccess: () => toast.success("Buyer removed"),
                      })
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <div className="mt-3 space-y-1 border-t border-border pt-3 text-xs text-muted-foreground">
                  {buyer.email && (
                    <a href={`mailto:${buyer.email}`} className="flex items-center gap-1 hover:text-foreground">
                      <Mail className="h-3 w-3" /> {buyer.email}
                    </a>
                  )}
                  {buyer.phone && (
                    <a href={`tel:${buyer.phone}`} className="flex items-center gap-1 hover:text-foreground">
                      <Phone className="h-3 w-3" /> {buyer.phone}
                    </a>
                  )}
                  {(buyer.minPrice || buyer.maxPrice) && (
                    <div>
                      {formatCurrency(buyer.minPrice, { compact: true })}–
                      {formatCurrency(buyer.maxPrice, { compact: true })}
                    </div>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function FindBuyersPanel() {
  const scan = useScanBuyers();
  const save = useSaveFoundBuyers();
  const [city, setCity] = React.useState("");
  const [results, setResults] = React.useState<ScoredBuyer[]>([]);
  const [live, setLive] = React.useState(true);
  const [added, setAdded] = React.useState<Set<string>>(new Set());

  const keyOf = (b: ScoredBuyer) => `${b.name}|${b.company ?? ""}`;

  const run = (e: React.FormEvent) => {
    e.preventDefault();
    if (!city.trim()) {
      toast.error("Enter a city");
      return;
    }
    scan.mutate(
      { city: city.trim(), limit: 8 },
      {
        onSuccess: (data) => {
          setResults(data.buyers);
          setLive(data.live);
          setAdded(new Set());
        },
        onError: () => toast.error("Search failed"),
      },
    );
  };

  const addOne = (b: ScoredBuyer) =>
    save.mutate([b], {
      onSuccess: () => {
        setAdded((s) => new Set(s).add(keyOf(b)));
        toast.success("Buyer added", { description: b.company || b.name });
      },
    });

  const addAll = () => {
    const remaining = results.filter((b) => !added.has(keyOf(b)));
    if (!remaining.length) return;
    save.mutate(remaining, {
      onSuccess: () => {
        setAdded(new Set(results.map(keyOf)));
        toast.success(`${remaining.length} buyers added`);
      },
    });
  };

  return (
    <Card className="border-primary/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Search className="h-4 w-4 text-primary" /> Find cash buyers
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={run} className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="City or ZIP — e.g. Palm Bay, FL"
            className="h-11"
          />
          <Button type="submit" variant="brand" size="lg" className="h-11" disabled={scan.isPending}>
            {scan.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            {scan.isPending ? "Searching…" : "Find buyers"}
          </Button>
        </form>

        {scan.isPending && (
          <div className="grid gap-3 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-32 rounded-lg" />
            ))}
          </div>
        )}

        {!scan.isPending && results.length > 0 && (
          <div className="space-y-3">
            {!live && (
              <div className="flex items-center gap-2 rounded-lg border border-border bg-background p-3 text-xs text-muted-foreground">
                <Info className="h-4 w-4 shrink-0 text-info" />
                Showing sample buyers. Add <code className="text-foreground">ANTHROPIC_API_KEY</code> for live results.
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{results.length} buyers found</span>
              <Button variant="outline" size="sm" onClick={addAll} disabled={!live || save.isPending || results.every((b) => added.has(keyOf(b)))}>
                <Plus className="h-4 w-4" /> Add all
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {results.map((b, i) => {
                const isAdded = added.has(keyOf(b));
                return (
                  <div key={`${keyOf(b)}-${i}`} className="rounded-lg border border-border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate font-medium">{b.company || b.name}</div>
                        {b.buyerType && (
                          <Badge variant="secondary" className="mt-0.5">
                            {b.buyerType}
                          </Badge>
                        )}
                      </div>
                      {!live ? (
                        <Badge variant="muted">Sample</Badge>
                      ) : isAdded ? (
                        <Badge variant="brand">
                          <Check className="mr-1 h-3 w-3" /> Added
                        </Badge>
                      ) : (
                        <Button variant="brand" size="sm" onClick={() => addOne(b)} disabled={save.isPending}>
                          <Plus className="h-4 w-4" /> Add
                        </Button>
                      )}
                    </div>
                    {b.evidence && (
                      <p className="mt-2 text-xs text-muted-foreground">{b.evidence}</p>
                    )}
                    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      {b.phone && (
                        <span className="flex items-center gap-1">
                          <Phone className="h-3 w-3" /> {b.phone}
                        </span>
                      )}
                      {b.email && (
                        <span className="flex items-center gap-1">
                          <Mail className="h-3 w-3" /> {b.email}
                        </span>
                      )}
                      {b.website && (
                        <a href={b.website} target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:text-foreground">
                          <Globe className="h-3 w-3" /> site
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AddBuyerDialog() {
  const add = useAddBuyer();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [phone, setPhone] = React.useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    add.mutate(
      { name, email: email || undefined, phone: phone || undefined },
      {
        onSuccess: () => {
          toast.success(COPY.toasts.buyerAdded);
          setOpen(false);
          setName("");
          setEmail("");
          setPhone("");
        },
        onError: (err) => toast.error(err instanceof Error ? err.message : "Failed"),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <UserPlus className="h-4 w-4" /> Add manually
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a buyer manually</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="b-name">Name or company</Label>
            <Input id="b-name" required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="b-email">Email</Label>
            <Input id="b-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="b-phone">Phone</Label>
            <Input id="b-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <Button type="submit" variant="brand" className="w-full" disabled={add.isPending}>
            {add.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Add buyer
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function BlastTool({ buyerCount, emails }: { buyerCount: number; emails: string[] }) {
  const { data: deals } = useDeals();
  const pitch = useGeneratePitch();
  const [dealId, setDealId] = React.useState("");
  const [result, setResult] = React.useState<BuyerPitch | null>(null);

  const activeDeals = (deals ?? []).filter((d) => d.stage !== "DEAD");

  const generate = () => {
    if (!dealId) {
      toast.error("Pick a deal to pitch");
      return;
    }
    pitch.mutate(dealId, {
      onSuccess: (p) => setResult(p),
      onError: () => toast.error("Could not generate pitch"),
    });
  };

  const mailtoAll = result
    ? `mailto:?bcc=${encodeURIComponent(emails.join(","))}&subject=${encodeURIComponent(result.subject)}&body=${encodeURIComponent(result.body)}`
    : "#";

  return (
    <Card className="border-primary/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Send className="h-4 w-4 text-primary" /> Blast a deal to {buyerCount} buyers
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row">
          <select
            value={dealId}
            onChange={(e) => setDealId(e.target.value)}
            className="h-10 flex-1 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">Select a deal…</option>
            {activeDeals.map((d) => (
              <option key={d.id} value={d.id}>
                {d.address} — {formatCurrency(d.profit, { compact: true })} spread
              </option>
            ))}
          </select>
          <Button variant="brand" onClick={generate} disabled={pitch.isPending}>
            {pitch.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Generate pitch
          </Button>
        </div>

        {result && (
          <div className="space-y-3 rounded-lg border border-border bg-background p-4">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Subject</div>
              <div className="font-medium">{result.subject}</div>
            </div>
            <pre className="whitespace-pre-wrap font-sans text-sm text-muted-foreground">
              {result.body}
            </pre>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="brand" size="sm" disabled={emails.length === 0}>
                <a href={mailtoAll}>
                  <Mail className="h-4 w-4" /> Email all {buyerCount}
                </a>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  navigator.clipboard
                    ?.writeText(`${result.subject}\n\n${result.body}`)
                    .then(() => toast.success(COPY.toasts.copied))
                }
              >
                <Copy className="h-4 w-4" /> Copy
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
