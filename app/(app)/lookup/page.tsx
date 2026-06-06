"use client";

import * as React from "react";
import { toast } from "sonner";
import { Search, Loader2, Phone, Mail, Home, Plus, Check } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useSaveDeals } from "@/lib/hooks/use-deals";
import { formatCurrency } from "@/lib/utils";
import type { ScoredDeal } from "@/types";

interface TracedPhone { number: string; type?: string }
interface LookupResult {
  found: boolean;
  message?: string;
  property?: {
    address: string; city: string; state: string; zip: string | null;
    ownerName: string | null; estValue: number | null; absentee: boolean;
    mailAddress: string | null; provider: string | null;
  };
  contacts?: { phones: TracedPhone[]; emails: string[]; confidence: number; source: string | null };
  valuation?: {
    avm?: number; avmLow?: number; avmHigh?: number;
    comps: { address?: string; price?: number; sqft?: number; beds?: number; baths?: number; distanceMi?: number }[];
  } | null;
  apifyReady?: boolean;
  rentcastReady?: boolean;
}

export default function LookupPage() {
  const [address, setAddress] = React.useState("");
  const [city, setCity] = React.useState("Houston");
  const [state, setState] = React.useState("TX");
  const [loading, setLoading] = React.useState(false);
  const [result, setResult] = React.useState<LookupResult | null>(null);
  const [saved, setSaved] = React.useState(false);
  const save = useSaveDeals();

  const run = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!address.trim()) { toast.error("Enter a property address"); return; }
    setLoading(true);
    setResult(null);
    setSaved(false);
    try {
      const res = await fetch("/api/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: address.trim(), city: city.trim(), state: state.trim() }),
      });
      const json = await res.json();
      if (res.ok) setResult(json.data);
      else toast.error(json?.error ?? "Lookup failed");
    } catch {
      toast.error("Lookup failed");
    } finally {
      setLoading(false);
    }
  };

  const saveAsDeal = () => {
    const p = result?.property;
    if (!p) return;
    const c = result?.contacts;
    const deal: ScoredDeal = {
      address: p.address,
      city: p.city,
      state: p.state,
      zipCode: p.zip ?? undefined,
      situation: p.absentee ? "Absentee owner (mailing address differs)" : "Direct property lookup",
      dealType: p.absentee ? "ABSENTEE" : "OTHER",
      source: "lookup",
      ownerName: p.ownerName ?? undefined,
      ownerPhone: c?.phones[0]?.number,
      ownerEmail: c?.emails[0],
      arv: p.estValue ?? undefined,
      score: Math.max(40, c?.confidence ?? 50),
      tags: ["lookup", ...(p.absentee ? ["absentee-owner"] : [])],
    };
    save.mutate([deal], {
      onSuccess: () => { setSaved(true); toast.success("Saved to pipeline", { description: p.address }); },
      onError: () => toast.error("Could not save"),
    });
  };

  const prop = result?.property;
  const contacts = result?.contacts;
  const val = result?.valuation;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-3xl tracking-wide sm:text-4xl">Property Lookup</h1>
        <p className="text-sm text-muted-foreground">
          Type any address — get the real owner, county value, and their phone + email in one shot.
        </p>
      </div>

      <Card className="p-4">
        <form onSubmit={run} className="space-y-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="123 Main St" className="h-11 pl-9" aria-label="Property address" />
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="City" className="h-11 sm:max-w-[200px]" aria-label="City" />
            <Input value={state} onChange={(e) => setState(e.target.value)} placeholder="State" className="h-11 sm:max-w-[100px]" aria-label="State" />
            <Button type="submit" variant="brand" size="lg" className="h-11 sm:ml-auto" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              {loading ? "Looking up…" : "Look up"}
            </Button>
          </div>
        </form>
      </Card>

      {loading && (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
          Pulling county records + skip tracing the owner… (up to a minute)
        </Card>
      )}

      {result && !result.found && (
        <Card className="p-6 text-center">
          <p className="text-sm text-muted-foreground">{result.message ?? "Not found."}</p>
        </Card>
      )}

      {result?.found && prop && (
        <div className="space-y-4">
          {/* Property + owner */}
          <Card className="p-5">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h2 className="flex items-center gap-2 font-heading text-xl tracking-wide">
                  <Home className="h-5 w-5 text-primary" /> {prop.address}
                </h2>
                <p className="text-sm text-muted-foreground">{prop.city}, {prop.state} {prop.zip ?? ""}</p>
              </div>
              {prop.absentee && <Badge variant="warning">Absentee owner</Badge>}
            </div>
            <div className="grid grid-cols-2 gap-3 border-t border-border pt-3 sm:grid-cols-3">
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground">Owner</div>
                <div className="font-medium">{prop.ownerName ?? "—"}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground">County value</div>
                <div className="font-medium">{prop.estValue ? formatCurrency(prop.estValue) : "—"}</div>
              </div>
              {val?.avm != null ? (
                <div>
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">Market value (AVM)</div>
                  <div className="font-medium text-[#00ff87]">{formatCurrency(val.avm)}</div>
                </div>
              ) : (
                <div>
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">Source</div>
                  <div className="font-medium">{prop.provider ?? "county"}</div>
                </div>
              )}
              {prop.mailAddress && (
                <div className="col-span-2 sm:col-span-3">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">Owner mailing address</div>
                  <div className="text-sm">{prop.mailAddress}</div>
                </div>
              )}
            </div>
          </Card>

          {/* Sold comps (RentCast) */}
          {val && val.comps.length > 0 && (
            <Card className="p-5">
              <h3 className="mb-3 flex flex-wrap items-center gap-2 font-heading text-lg tracking-wide">
                <Home className="h-5 w-5 text-primary" /> Recent sold comps
                {val.avmLow != null && val.avmHigh != null && (
                  <span className="text-sm font-normal text-muted-foreground">AVM range {formatCurrency(val.avmLow)}–{formatCurrency(val.avmHigh)}</span>
                )}
              </h3>
              <div className="space-y-2">
                {val.comps.map((c, i) => (
                  <div key={i} className="flex items-center justify-between gap-2 rounded-lg border border-border p-3 text-sm">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{c.address ?? "Comparable sale"}</div>
                      <div className="text-xs text-muted-foreground">
                        {[
                          c.beds != null ? `${c.beds} bd` : null,
                          c.baths != null ? `${c.baths} ba` : null,
                          c.sqft != null ? `${c.sqft.toLocaleString()} sqft` : null,
                          c.distanceMi != null ? `${c.distanceMi.toFixed(1)} mi` : null,
                        ].filter(Boolean).join(" · ")}
                      </div>
                    </div>
                    {c.price != null && <span className="shrink-0 font-heading text-[#00ff87]">{formatCurrency(c.price)}</span>}
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Contacts */}
          <Card className="p-5">
            <h3 className="mb-3 flex items-center gap-2 font-heading text-lg tracking-wide">
              <Phone className="h-5 w-5 text-primary" /> Owner contacts
              {contacts && contacts.confidence > 0 && <Badge variant="muted">{contacts.confidence}% confidence</Badge>}
            </h3>
            {contacts && (contacts.phones.length > 0 || contacts.emails.length > 0) ? (
              <div className="space-y-2">
                {contacts.phones.map((ph) => (
                  <div key={ph.number} className="flex items-center justify-between gap-2 rounded-lg border border-border p-3">
                    <span className="flex items-center gap-2 font-mono text-sm">
                      <Phone className="h-4 w-4 text-muted-foreground" /> {ph.number}
                      {ph.type && ph.type !== "unknown" && <Badge variant={ph.type === "mobile" ? "brand" : "muted"} className="text-[10px]">{ph.type}</Badge>}
                    </span>
                    <div className="flex shrink-0 gap-1">
                      <Button asChild variant="outline" size="sm"><a href={`tel:${ph.number}`}>Call</a></Button>
                      <Button asChild variant="outline" size="sm"><a href={`sms:${ph.number}`}>Text</a></Button>
                    </div>
                  </div>
                ))}
                {contacts.emails.map((em) => (
                  <div key={em} className="flex items-center justify-between gap-2 rounded-lg border border-border p-3">
                    <span className="flex items-center gap-2 text-sm"><Mail className="h-4 w-4 text-muted-foreground" /> {em}</span>
                    <Button asChild variant="outline" size="sm"><a href={`mailto:${em}`}>Email</a></Button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                {result.apifyReady === false
                  ? "Skip tracing isn't configured (no APIFY_API_KEY)."
                  : "No phone/email found for this owner — they may be a company/trust, or have no public listing. Try the owner's name on a people-search site."}
              </p>
            )}
          </Card>

          {/* Save */}
          <div className="flex justify-end">
            {saved ? (
              <Badge variant="brand"><Check className="mr-1 h-3 w-3" /> Saved to pipeline</Badge>
            ) : (
              <Button variant="brand" onClick={saveAsDeal} disabled={save.isPending}>
                {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Save as deal
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
