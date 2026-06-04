"use client";

import { useState, FormEvent, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, Lock } from "lucide-react";

function LoginFormInner() {
  const router = useRouter();
  const params = useSearchParams();
  const from = params?.get("from") ?? "/dashboard";

  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, from }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        redirect?: string;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Wrong password. Try again.");
        setLoading(false);
        return;
      }
      router.replace(data.redirect ?? "/dashboard");
    } catch {
      setError("Network error. Try again.");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#080808] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[#00ff87]/10 border border-[#00ff87]/20 mb-4">
            <Lock className="w-6 h-6 text-[#00ff87]" />
          </div>
          <h1 className="font-bebas text-4xl tracking-widest text-white">
            WHOLESALE<span className="text-[#00ff87]">OS</span>
          </h1>
          <p className="text-white/40 text-sm mt-1 font-syne">
            Your AI real-estate command center
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-white/[0.03] border border-white/10 rounded-2xl p-8 space-y-5"
        >
          <div className="space-y-1.5">
            <label
              htmlFor="password"
              className="text-xs font-medium text-white/50 uppercase tracking-widest"
            >
              Access Password
            </label>
            <input
              id="password"
              type="password"
              autoFocus
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3
                         text-white placeholder-white/20 font-mono text-sm
                         focus:outline-none focus:ring-2 focus:ring-[#00ff87]/50
                         focus:border-[#00ff87]/50 transition"
              placeholder="Enter your password"
            />
          </div>

          {error && (
            <p className="text-red-400 text-sm text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || !password}
            className="w-full flex items-center justify-center gap-2
                       bg-[#00ff87] hover:bg-[#00ff87]/90 active:scale-[0.98]
                       text-black font-bebas text-xl tracking-widest
                       py-3 rounded-xl transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "ENTER"}
          </button>
        </form>

        <p className="text-center text-white/20 text-xs mt-6 font-mono">
          Single-user · CEO access only
        </p>
      </div>
    </div>
  );
}

export function LoginForm() {
  return (
    <Suspense>
      <LoginFormInner />
    </Suspense>
  );
}
