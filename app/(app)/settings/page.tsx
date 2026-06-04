"use client";

import * as React from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, CheckCircle2, Circle, MessageSquareText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";

interface Status {
  anthropic: boolean;
  database: boolean;
  resend: boolean;
  google: boolean;
  redis: boolean;
}

const INTEGRATIONS: { key: keyof Status; label: string; desc: string }[] = [
  { key: "anthropic", label: "Anthropic AI", desc: "Live deal scans, scripts, SMS, analysis" },
  { key: "database", label: "Database (Supabase)", desc: "Persistent storage for deals & buyers" },
  { key: "resend", label: "Email (Resend)", desc: "Daily briefing + buyer blasts" },
  { key: "google", label: "Google login", desc: "Optional OAuth sign-in" },
];

export default function SettingsPage() {
  const status = useQuery({
    queryKey: ["status"],
    queryFn: () => apiFetch<Status>("/api/status"),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-3xl tracking-wide sm:text-4xl">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Connect services to switch features from sample data to live.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Integrations</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {INTEGRATIONS.map((item) => {
            const ok = status.data?.[item.key] ?? false;
            return (
              <div
                key={item.key}
                className="flex items-center justify-between gap-3 rounded-lg border border-border p-3"
              >
                <div className="flex items-center gap-3">
                  {status.isLoading ? (
                    <Circle className="h-5 w-5 text-muted-foreground" />
                  ) : ok ? (
                    <CheckCircle2 className="h-5 w-5 text-brand" />
                  ) : (
                    <Circle className="h-5 w-5 text-muted-foreground" />
                  )}
                  <div>
                    <div className="text-sm font-medium">{item.label}</div>
                    <div className="text-xs text-muted-foreground">{item.desc}</div>
                  </div>
                </div>
                <span
                  className={cn(
                    "text-xs font-semibold",
                    ok ? "text-brand" : "text-muted-foreground",
                  )}
                >
                  {ok ? "Connected" : "Not set"}
                </span>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <TwilioCard />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Connecting services</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            Add keys to <code className="text-foreground">wholesaleos/.env</code> and
            restart the dev server. The app runs on sample data until then.
          </p>
          <ul className="ml-4 list-disc space-y-1">
            <li>
              <code className="text-foreground">ANTHROPIC_API_KEY</code> — real AI scans &amp; generation
            </li>
            <li>
              <code className="text-foreground">DATABASE_URL</code> &amp;{" "}
              <code className="text-foreground">DIRECT_URL</code> — your Supabase Postgres
            </li>
            <li>
              <code className="text-foreground">RESEND_API_KEY</code> — email features
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

function TwilioCard() {
  const [sid, setSid] = React.useState("");
  const [token, setToken] = React.useState("");
  const [phone, setPhone] = React.useState("");

  const save = useMutation({
    mutationFn: () =>
      apiFetch<{ saved: boolean; message?: string }>("/api/settings/twilio", {
        method: "POST",
        body: JSON.stringify({ sid, token, phone }),
      }),
    onSuccess: (res) => {
      if (res.saved) toast.success("Twilio connected");
      else toast.info(res.message ?? "Saved");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageSquareText className="h-4 w-4 text-primary" /> Twilio (auto-send SMS)
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
          className="space-y-3"
        >
          <div className="space-y-1.5">
            <Label htmlFor="t-sid">Account SID</Label>
            <Input id="t-sid" value={sid} onChange={(e) => setSid(e.target.value)} placeholder="AC…" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="t-token">Auth token</Label>
            <Input
              id="t-token"
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="••••••••"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="t-phone">Twilio phone number</Label>
            <Input id="t-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1…" />
          </div>
          <p className="text-xs text-muted-foreground">
            Stored encrypted (AES-256). Used only to send your follow-up sequences.
          </p>
          <Button type="submit" variant="brand" disabled={save.isPending}>
            {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Save Twilio credentials
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
