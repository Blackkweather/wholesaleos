"use client";

import * as React from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, Phone, MessageSquareText, Mail, Loader2 } from "lucide-react";

interface Phone { number: string; type?: string }

export function SkipTracePanel({
  dealId, ownerName, ownerPhone, ownerEmail,
}: {
  dealId: string;
  ownerName: string | null;
  ownerPhone: string | null;
  ownerEmail: string | null;
}) {
  const [phone, setPhone] = React.useState(ownerPhone);
  const [email, setEmail] = React.useState(ownerEmail);
  const [extra, setExtra] = React.useState<{ phones: Phone[]; emails: string[]; confidence: number; source: string | null } | null>(null);
  const [loading, setLoading] = React.useState(false);

  const run = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/deals/${dealId}/skip-trace`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) { toast.error(json?.error ?? "Skip trace failed"); return; }
      const d = json.data;
      setExtra(d);
      if (d.saved?.ownerPhone) setPhone(d.saved.ownerPhone);
      if (d.saved?.ownerEmail) setEmail(d.saved.ownerEmail);
      if (d.phones.length || d.emails.length) toast.success(`Found ${d.phones.length} phone(s), ${d.emails.length} email(s)`);
      else toast.message("No contact info found for this owner");
    } catch {
      toast.error("Skip trace failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-heading text-lg tracking-wide">
          <Search className="h-5 w-5 text-primary" /> Owner Contact
        </h3>
        <Button variant={phone ? "outline" : "brand"} size="sm" onClick={run} disabled={loading || !ownerName}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          {phone ? "Re-trace" : "Skip Trace"}
        </Button>
      </div>

      {ownerName && <p className="text-sm text-muted-foreground">{ownerName}</p>}

      {/* Primary contact + actions */}
      {(phone || email) ? (
        <div className="mt-3 space-y-2">
          {phone && (
            <div className="flex items-center justify-between rounded-lg border border-border p-2.5">
              <span className="font-mono text-sm">{phone}</span>
              <div className="flex gap-2">
                <Button asChild variant="brand" size="sm"><a href={`tel:${phone}`}><Phone className="h-4 w-4" /> Call</a></Button>
                <Button asChild variant="outline" size="sm"><a href={`sms:${phone}`}><MessageSquareText className="h-4 w-4" /> Text</a></Button>
              </div>
            </div>
          )}
          {email && (
            <div className="flex items-center justify-between rounded-lg border border-border p-2.5">
              <span className="truncate text-sm">{email}</span>
              <Button asChild variant="outline" size="sm"><a href={`mailto:${email}`}><Mail className="h-4 w-4" /> Email</a></Button>
            </div>
          )}
        </div>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">No phone on file. Run a skip trace to find the owner&apos;s number.</p>
      )}

      {/* Extra numbers found */}
      {extra && (extra.phones.length > 1 || extra.source) && (
        <div className="mt-3 border-t border-border pt-3">
          <div className="mb-1.5 flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
            Traced via {extra.source ?? "—"} {extra.confidence > 0 && <Badge variant="secondary">{extra.confidence}% confidence</Badge>}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {extra.phones.map((p) => (
              <a key={p.number} href={`tel:${p.number}`} className="rounded-full border border-border px-2.5 py-1 text-xs hover:border-primary/50">
                {p.number}{p.type === "mobile" ? " 📱" : ""}
              </a>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
