"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  MapPin,
  DollarSign,
  Phone,
  ArrowRight,
  CheckCircle2,
  Loader2,
  ChevronLeft,
} from "lucide-react";

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────
interface FormState {
  // step 1
  city: string;
  state: string;
  // step 2
  maxPrice: string;
  dealTypes: string[];
  // step 3
  twilioSid: string;
  twilioToken: string;
  twilioPhone: string;
}

const DEAL_TYPE_OPTIONS = [
  { value: "PROBATE", label: "Probate" },
  { value: "FORECLOSURE", label: "Foreclosure" },
  { value: "VACANT", label: "Vacant" },
  { value: "TAX_DELINQUENT", label: "Tax Delinquent" },
  { value: "ABSENTEE", label: "Absentee" },
  { value: "INHERITED", label: "Inherited" },
  { value: "DIVORCE", label: "Divorce" },
  { value: "OTHER", label: "Other" },
];

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY",
];

// ────────────────────────────────────────────────────────────
// Step indicators
// ────────────────────────────────────────────────────────────
const STEPS = [
  { icon: MapPin,      label: "Market"   },
  { icon: DollarSign, label: "Buy Box"  },
  { icon: Phone,      label: "Calling"  },
];

function StepBar({ current }: { current: number }) {
  return (
    <div className="flex items-center justify-center gap-0 mb-10">
      {STEPS.map((s, i) => {
        const done = i < current;
        const active = i === current;
        const Icon = s.icon;
        return (
          <div key={s.label} className="flex items-center">
            <div
              className={`flex flex-col items-center gap-1 ${
                active ? "opacity-100" : done ? "opacity-60" : "opacity-30"
              }`}
            >
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all ${
                  active
                    ? "border-[#00ff87] bg-[#00ff87]/10"
                    : done
                    ? "border-[#00ff87] bg-[#00ff87]/5"
                    : "border-white/20 bg-white/5"
                }`}
              >
                {done ? (
                  <CheckCircle2 className="w-5 h-5 text-[#00ff87]" />
                ) : (
                  <Icon
                    className={`w-5 h-5 ${
                      active ? "text-[#00ff87]" : "text-white/50"
                    }`}
                  />
                )}
              </div>
              <span
                className={`text-[10px] font-mono uppercase tracking-widest ${
                  active ? "text-[#00ff87]" : "text-white/30"
                }`}
              >
                {s.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={`w-12 h-px mx-2 mb-5 transition-colors ${
                  done ? "bg-[#00ff87]/40" : "bg-white/10"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Steps
// ────────────────────────────────────────────────────────────
function Step1({
  form,
  setForm,
  onNext,
}: {
  form: FormState;
  setForm: (f: Partial<FormState>) => void;
  onNext: () => void;
}) {
  const valid = form.city.trim().length > 0 && form.state.length > 0;
  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-bebas text-3xl tracking-widest text-white">
          WHERE ARE YOU <span className="text-[#00ff87]">WHOLESALING?</span>
        </h2>
        <p className="text-white/40 text-sm mt-1 font-syne">
          AI will scan this market for motivated sellers and cash buyers.
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-xs text-white/50 uppercase tracking-widest font-mono">
            City
          </label>
          <input
            type="text"
            autoFocus
            value={form.city}
            onChange={(e) => setForm({ city: e.target.value })}
            placeholder="e.g. Houston"
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white
                       placeholder-white/20 text-sm focus:outline-none focus:ring-2
                       focus:ring-[#00ff87]/50 focus:border-[#00ff87]/50 transition"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs text-white/50 uppercase tracking-widest font-mono">
            State
          </label>
          <select
            value={form.state}
            onChange={(e) => setForm({ state: e.target.value })}
            className="w-full bg-[#111] border border-white/10 rounded-xl px-4 py-3 text-white
                       text-sm focus:outline-none focus:ring-2 focus:ring-[#00ff87]/50
                       focus:border-[#00ff87]/50 transition appearance-none"
          >
            <option value="">Select state…</option>
            {US_STATES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="bg-[#00ff87]/5 border border-[#00ff87]/20 rounded-xl p-4 text-sm text-white/60 font-syne">
        💡 <strong className="text-[#00ff87]">Houston, TX</strong> is ranked the #1 US
        wholesaling market in 2026 — highest volume, lowest competition, motivated sellers
        everywhere.
      </div>

      <button
        onClick={onNext}
        disabled={!valid}
        className="w-full flex items-center justify-center gap-2 bg-[#00ff87] hover:bg-[#00ff87]/90
                   text-black font-bebas text-xl tracking-widest py-3 rounded-xl transition
                   disabled:opacity-30 disabled:cursor-not-allowed"
      >
        Continue <ArrowRight className="w-5 h-5" />
      </button>
    </div>
  );
}

function Step2({
  form,
  setForm,
  onNext,
  onBack,
}: {
  form: FormState;
  setForm: (f: Partial<FormState>) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  function toggleDealType(val: string) {
    const types = form.dealTypes.includes(val)
      ? form.dealTypes.filter((t) => t !== val)
      : [...form.dealTypes, val];
    setForm({ dealTypes: types });
  }

  const maxPriceNum = parseInt(form.maxPrice) || 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-bebas text-3xl tracking-widest text-white">
          SET YOUR <span className="text-[#00ff87]">BUY BOX</span>
        </h2>
        <p className="text-white/40 text-sm mt-1 font-syne">
          AI filters deals to match your criteria. You can change these anytime.
        </p>
      </div>

      <div className="space-y-5">
        {/* Max purchase price */}
        <div className="space-y-2">
          <div className="flex justify-between">
            <label className="text-xs text-white/50 uppercase tracking-widest font-mono">
              Max Purchase Price
            </label>
            <span className="text-[#00ff87] font-mono text-sm">
              {maxPriceNum > 0
                ? `$${maxPriceNum.toLocaleString()}`
                : "No limit"}
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={500000}
            step={10000}
            value={form.maxPrice === "" ? 0 : parseInt(form.maxPrice) || 0}
            onChange={(e) =>
              setForm({ maxPrice: e.target.value === "0" ? "" : e.target.value })
            }
            className="w-full accent-[#00ff87]"
          />
          <div className="flex justify-between text-[10px] text-white/20 font-mono">
            <span>No limit</span>
            <span>$500k</span>
          </div>
        </div>

        {/* Deal types */}
        <div className="space-y-2">
          <label className="text-xs text-white/50 uppercase tracking-widest font-mono">
            Deal Types (select all you want)
          </label>
          <div className="grid grid-cols-2 gap-2">
            {DEAL_TYPE_OPTIONS.map((dt) => {
              const selected = form.dealTypes.includes(dt.value);
              return (
                <button
                  key={dt.value}
                  type="button"
                  onClick={() => toggleDealType(dt.value)}
                  className={`px-3 py-2 rounded-lg text-sm font-syne transition text-left ${
                    selected
                      ? "bg-[#00ff87]/15 border border-[#00ff87]/40 text-[#00ff87]"
                      : "bg-white/5 border border-white/10 text-white/50 hover:border-white/20"
                  }`}
                >
                  {selected ? "✓ " : ""}{dt.label}
                </button>
              );
            })}
          </div>
          {form.dealTypes.length === 0 && (
            <p className="text-white/30 text-xs font-mono">
              Leave empty to accept all deal types.
            </p>
          )}
        </div>
      </div>

      <div className="flex gap-3">
        <button
          onClick={onBack}
          className="flex items-center gap-1 px-4 py-3 rounded-xl border border-white/10
                     text-white/50 hover:text-white hover:border-white/20 transition font-syne text-sm"
        >
          <ChevronLeft className="w-4 h-4" /> Back
        </button>
        <button
          onClick={onNext}
          className="flex-1 flex items-center justify-center gap-2 bg-[#00ff87] hover:bg-[#00ff87]/90
                     text-black font-bebas text-xl tracking-widest py-3 rounded-xl transition"
        >
          Continue <ArrowRight className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}

function Step3({
  form,
  setForm,
  onSubmit,
  onBack,
  loading,
}: {
  form: FormState;
  setForm: (f: Partial<FormState>) => void;
  onSubmit: () => void;
  onBack: () => void;
  loading: boolean;
}) {
  const hasTwilio =
    form.twilioSid.trim() && form.twilioToken.trim() && form.twilioPhone.trim();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-bebas text-3xl tracking-widest text-white">
          SET UP <span className="text-[#00ff87]">CALLING</span>
        </h2>
        <p className="text-white/40 text-sm mt-1 font-syne">
          Optional. Adds one-tap calling with AI scripts. Skip and add later in
          Settings.
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-xs text-white/50 uppercase tracking-widest font-mono">
            Twilio Account SID
          </label>
          <input
            type="text"
            value={form.twilioSid}
            onChange={(e) => setForm({ twilioSid: e.target.value })}
            placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white
                       placeholder-white/20 font-mono text-sm focus:outline-none focus:ring-2
                       focus:ring-[#00ff87]/50 focus:border-[#00ff87]/50 transition"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs text-white/50 uppercase tracking-widest font-mono">
            Auth Token
          </label>
          <input
            type="password"
            value={form.twilioToken}
            onChange={(e) => setForm({ twilioToken: e.target.value })}
            placeholder="Your Twilio Auth Token"
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white
                       placeholder-white/20 font-mono text-sm focus:outline-none focus:ring-2
                       focus:ring-[#00ff87]/50 focus:border-[#00ff87]/50 transition"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs text-white/50 uppercase tracking-widest font-mono">
            Twilio Phone Number
          </label>
          <input
            type="tel"
            value={form.twilioPhone}
            onChange={(e) => setForm({ twilioPhone: e.target.value })}
            placeholder="+1 (555) 000-0000"
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white
                       placeholder-white/20 font-mono text-sm focus:outline-none focus:ring-2
                       focus:ring-[#00ff87]/50 focus:border-[#00ff87]/50 transition"
          />
        </div>
      </div>

      {!hasTwilio && (
        <p className="text-white/30 text-xs font-mono text-center">
          You can add Twilio later in Settings → Integrations.
        </p>
      )}

      <div className="flex gap-3">
        <button
          onClick={onBack}
          className="flex items-center gap-1 px-4 py-3 rounded-xl border border-white/10
                     text-white/50 hover:text-white hover:border-white/20 transition font-syne text-sm"
        >
          <ChevronLeft className="w-4 h-4" /> Back
        </button>
        <button
          onClick={onSubmit}
          disabled={loading}
          className="flex-1 flex items-center justify-center gap-2 bg-[#00ff87] hover:bg-[#00ff87]/90
                     text-black font-bebas text-xl tracking-widest py-3 rounded-xl transition
                     disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {loading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <>
              START FINDING DEALS <ArrowRight className="w-5 h-5" />
            </>
          )}
        </button>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Main wizard
// ────────────────────────────────────────────────────────────
export function OnboardingWizard() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [form, setFormRaw] = useState<FormState>({
    city: "Houston",
    state: "TX",
    maxPrice: "",
    dealTypes: [],
    twilioSid: "",
    twilioToken: "",
    twilioPhone: "",
  });

  function setForm(partial: Partial<FormState>) {
    setFormRaw((prev) => ({ ...prev, ...partial }));
  }

  async function handleSubmit() {
    setLoading(true);
    setError("");
    try {
      const body: Record<string, unknown> = {
        city: form.city.trim(),
        state: form.state,
        dealTypes: form.dealTypes,
      };
      if (form.maxPrice) body.maxPrice = parseInt(form.maxPrice);
      if (form.twilioSid && form.twilioToken && form.twilioPhone) {
        body.twilioSid = form.twilioSid.trim();
        body.twilioToken = form.twilioToken.trim();
        body.twilioPhone = form.twilioPhone.trim();
      }

      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = (await res.json()) as { data?: { ok: boolean }; error?: string };
      if (!res.ok || !data.data?.ok) {
        setError(data.error ?? "Setup failed. Try again.");
        setLoading(false);
        return;
      }

      router.replace("/dashboard");
    } catch {
      setError("Network error. Try again.");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#080808] flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="font-bebas text-5xl tracking-widest text-white">
            WHOLESALE<span className="text-[#00ff87]">OS</span>
          </h1>
          <p className="text-white/40 text-sm mt-1 font-syne">
            Let&apos;s set up your AI command center — takes 60 seconds
          </p>
        </div>

        <StepBar current={step} />

        {/* Card */}
        <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-8">
          {step === 0 && (
            <Step1 form={form} setForm={setForm} onNext={() => setStep(1)} />
          )}
          {step === 1 && (
            <Step2
              form={form}
              setForm={setForm}
              onNext={() => setStep(2)}
              onBack={() => setStep(0)}
            />
          )}
          {step === 2 && (
            <Step3
              form={form}
              setForm={setForm}
              onSubmit={handleSubmit}
              onBack={() => setStep(1)}
              loading={loading}
            />
          )}

          {error && (
            <p className="text-red-400 text-sm text-center mt-4">{error}</p>
          )}
        </div>

        <p className="text-center text-white/15 text-xs mt-6 font-mono">
          {step + 1} of {STEPS.length} · Single-user mode
        </p>
      </div>
    </div>
  );
}
