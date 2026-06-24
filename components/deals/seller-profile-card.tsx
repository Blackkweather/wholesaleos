"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ClipboardList, Save, Loader2, X, Plus } from "lucide-react";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/utils";
import type { SellerProfile } from "@/types";

const MOTIVATION_OPTIONS = ["Low", "Medium", "High", "Very High"] as const;
const URGENCY_OPTIONS = ["None", "Low", "Medium", "High", "Critical"] as const;
const OCCUPANCY_OPTIONS = ["Owner-occupied", "Tenant-occupied", "Vacant", "Unknown"];
const CONTACT_OPTIONS = ["Phone", "Text", "Email", "In person", "No preference"];

const URGENCY_COLOR: Record<string, "secondary" | "info" | "warning" | "danger" | "brand"> = {
  None: "secondary", Low: "info", Medium: "warning", High: "danger", Critical: "danger",
};
const MOT_COLOR: Record<string, "secondary" | "info" | "warning" | "brand"> = {
  Low: "secondary", Medium: "warning", High: "brand", "Very High": "brand",
};

function TagList({ tags, onChange, placeholder }: { tags: string[]; onChange: (t: string[]) => void; placeholder: string }) {
  const [input, setInput] = React.useState("");
  const add = () => {
    const v = input.trim();
    if (v && !tags.includes(v)) onChange([...tags, v]);
    setInput("");
  };
  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-1.5">
        {tags.map((t) => (
          <Badge key={t} variant="secondary" className="gap-1 pr-1">
            {t}
            <button onClick={() => onChange(tags.filter((x) => x !== t))} className="hover:text-danger">
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
      </div>
      <div className="flex gap-1.5">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={placeholder}
          className="h-7 text-xs"
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
        />
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={add} disabled={!input.trim()}>
          <Plus className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

export function SellerProfileCard({ dealId }: { dealId: string }) {
  const [profile, setProfile] = React.useState<SellerProfile>({});
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [expanded, setExpanded] = React.useState(false);

  React.useEffect(() => {
    let on = true;
    fetch(`/api/deals/${dealId}/seller-profile`)
      .then((r) => r.json())
      .then((j) => { if (on && j?.data) setProfile(j.data); })
      .finally(() => { if (on) setLoading(false); });
    return () => { on = false; };
  }, [dealId]);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/deals/${dealId}/seller-profile`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile),
      });
      if (res.ok) toast.success("Seller profile saved");
      else toast.error("Could not save");
    } catch {
      toast.error("Could not save");
    } finally {
      setSaving(false);
    }
  };

  const set = <K extends keyof SellerProfile>(key: K, value: SellerProfile[K]) =>
    setProfile((p) => ({ ...p, [key]: value }));

  if (loading) return <Skeleton className="h-28 w-full rounded-xl" />;

  const hasSomeData = profile.motivationLevel || profile.timeline || profile.reasonForSelling || profile.askingPrice;

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <ClipboardList className="h-4 w-4 text-primary" />
            Seller Wants & Needs
            {profile.motivationLevel && (
              <Badge variant={MOT_COLOR[profile.motivationLevel]}>{profile.motivationLevel} motivation</Badge>
            )}
            {profile.urgency && profile.urgency !== "None" && (
              <Badge variant={URGENCY_COLOR[profile.urgency]}>{profile.urgency} urgency</Badge>
            )}
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={() => setExpanded(!expanded)} className="text-xs">
            {expanded ? "Collapse" : hasSomeData ? "Edit" : "Fill in"}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {!expanded && !hasSomeData && (
          <p className="text-sm text-muted-foreground">
            No seller profile yet. Click "Fill in" to capture what the seller wants, needs, and their deal-breakers.
          </p>
        )}

        {!expanded && hasSomeData && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {profile.askingPrice != null && (
                <Field label="Asking price" value={formatCurrency(profile.askingPrice)} />
              )}
              {profile.timeline && <Field label="Timeline" value={profile.timeline} />}
              {profile.reasonForSelling && <Field label="Reason for selling" value={profile.reasonForSelling} />}
              {profile.financialSituation && <Field label="Financial situation" value={profile.financialSituation} />}
              {profile.occupancy && <Field label="Occupancy" value={profile.occupancy} />}
              {profile.propertyCondition && <Field label="Property condition" value={profile.propertyCondition} />}
              {profile.preferredContact && <Field label="Preferred contact" value={profile.preferredContact} />}
              {profile.bestTimeToCall && <Field label="Best time to call" value={profile.bestTimeToCall} />}
              {profile.emotionalState && <Field label="Emotional state" value={profile.emotionalState} />}
            </div>
            {profile.behindOnMortgage && (
              <Badge variant="danger">Behind on mortgage</Badge>
            )}
            {profile.wantsLeaseback && (
              <Badge variant="warning">Wants leaseback</Badge>
            )}
            {profile.mortgageBalance != null && (
              <div className="text-sm">
                <span className="text-muted-foreground">Mortgage balance: </span>
                <span className="font-mono font-semibold">{formatCurrency(profile.mortgageBalance)}</span>
              </div>
            )}
            {(profile.mustHaves?.length ?? 0) > 0 && (
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Must-haves</div>
                <div className="flex flex-wrap gap-1">{profile.mustHaves!.map((m) => <Badge key={m} variant="brand">{m}</Badge>)}</div>
              </div>
            )}
            {(profile.dealBreakers?.length ?? 0) > 0 && (
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Deal-breakers</div>
                <div className="flex flex-wrap gap-1">{profile.dealBreakers!.map((d) => <Badge key={d} variant="danger">{d}</Badge>)}</div>
              </div>
            )}
            {(profile.painPoints?.length ?? 0) > 0 && (
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Pain points</div>
                <div className="flex flex-wrap gap-1">{profile.painPoints!.map((p) => <Badge key={p} variant="warning">{p}</Badge>)}</div>
              </div>
            )}
            {profile.sellerNotes && (
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Notes</div>
                <p className="text-sm">{profile.sellerNotes}</p>
              </div>
            )}
          </div>
        )}

        {expanded && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FormField label="Asking price">
                <Input
                  type="number"
                  value={profile.askingPrice ?? ""}
                  onChange={(e) => set("askingPrice", e.target.value ? Number(e.target.value) : undefined)}
                  placeholder="e.g. 150000"
                />
              </FormField>
              <FormField label="Timeline">
                <Input
                  value={profile.timeline ?? ""}
                  onChange={(e) => set("timeline", e.target.value || undefined)}
                  placeholder="e.g. ASAP, 30 days, flexible"
                />
              </FormField>
              <FormField label="Reason for selling">
                <Input
                  value={profile.reasonForSelling ?? ""}
                  onChange={(e) => set("reasonForSelling", e.target.value || undefined)}
                  placeholder="e.g. Relocating, inherited, tired landlord"
                />
              </FormField>
              <FormField label="Financial situation">
                <Input
                  value={profile.financialSituation ?? ""}
                  onChange={(e) => set("financialSituation", e.target.value || undefined)}
                  placeholder="e.g. Behind on payments, paid off"
                />
              </FormField>
              <FormField label="Emotional state">
                <Input
                  value={profile.emotionalState ?? ""}
                  onChange={(e) => set("emotionalState", e.target.value || undefined)}
                  placeholder="e.g. Stressed, motivated, reluctant"
                />
              </FormField>
              <FormField label="Property condition">
                <Input
                  value={profile.propertyCondition ?? ""}
                  onChange={(e) => set("propertyCondition", e.target.value || undefined)}
                  placeholder="e.g. Needs full rehab, cosmetic only"
                />
              </FormField>
              <FormField label="Motivation level">
                <Select value={profile.motivationLevel ?? ""} onValueChange={(v: string) => set("motivationLevel", v as SellerProfile["motivationLevel"])}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    {MOTIVATION_OPTIONS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                  </SelectContent>
                </Select>
              </FormField>
              <FormField label="Urgency">
                <Select value={profile.urgency ?? ""} onValueChange={(v: string) => set("urgency", v as SellerProfile["urgency"])}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    {URGENCY_OPTIONS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                  </SelectContent>
                </Select>
              </FormField>
              <FormField label="Occupancy">
                <Select value={profile.occupancy ?? ""} onValueChange={(v: string) => set("occupancy", v || undefined)}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    {OCCUPANCY_OPTIONS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                  </SelectContent>
                </Select>
              </FormField>
              <FormField label="Preferred contact">
                <Select value={profile.preferredContact ?? ""} onValueChange={(v: string) => set("preferredContact", v || undefined)}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    {CONTACT_OPTIONS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                  </SelectContent>
                </Select>
              </FormField>
              <FormField label="Best time to call">
                <Input
                  value={profile.bestTimeToCall ?? ""}
                  onChange={(e) => set("bestTimeToCall", e.target.value || undefined)}
                  placeholder="e.g. Mornings, after 5pm"
                />
              </FormField>
              <FormField label="Mortgage balance">
                <Input
                  type="number"
                  value={profile.mortgageBalance ?? ""}
                  onChange={(e) => set("mortgageBalance", e.target.value ? Number(e.target.value) : undefined)}
                  placeholder="e.g. 80000"
                />
              </FormField>
            </div>

            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={profile.behindOnMortgage ?? false}
                  onChange={(e) => set("behindOnMortgage", e.target.checked)}
                  className="rounded border-border"
                />
                Behind on mortgage
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={profile.wantsLeaseback ?? false}
                  onChange={(e) => set("wantsLeaseback", e.target.checked)}
                  className="rounded border-border"
                />
                Wants leaseback
              </label>
            </div>

            <FormField label="Must-haves (what the seller requires)">
              <TagList
                tags={profile.mustHaves ?? []}
                onChange={(t) => set("mustHaves", t)}
                placeholder="e.g. Cash only, Quick close"
              />
            </FormField>

            <FormField label="Deal-breakers (what kills the deal)">
              <TagList
                tags={profile.dealBreakers ?? []}
                onChange={(t) => set("dealBreakers", t)}
                placeholder="e.g. Won't go below 120k, No inspections"
              />
            </FormField>

            <FormField label="Pain points (what's hurting them)">
              <TagList
                tags={profile.painPoints ?? []}
                onChange={(t) => set("painPoints", t)}
                placeholder="e.g. Bad tenants, Foreclosure notice"
              />
            </FormField>

            <FormField label="Notes from conversations">
              <Textarea
                value={profile.sellerNotes ?? ""}
                onChange={(e) => set("sellerNotes", e.target.value || undefined)}
                placeholder="Any extra details about the seller's situation, needs, or preferences..."
                rows={3}
              />
            </FormField>

            <div className="flex gap-2 pt-1">
              <Button onClick={save} variant="brand" size="sm" disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save profile
              </Button>
              <Button variant="outline" size="sm" onClick={() => setExpanded(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-sm font-medium">{value}</div>
    </div>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}
