import "server-only";
import { env, features } from "./env";

/**
 * Apify skip tracing — owner name → phone(s) + email(s).
 * Primary: TruePeopleSearch scraper. Fallback: Whitepages scraper.
 * Fails gracefully (returns empty result) so it never crashes the app.
 *
 * NOTE: phone numbers returned here are for HUMAN-INITIATED contact only
 * (Call/Text buttons). Respect TCPA + the DNC registry before calling/texting.
 */

// Primary: returns rich phone (with mobile/landline type) + email by name+citystatezip.
const PRIMARY_ACTOR = env.APIFY_TPS_ACTOR || "one-api/skip-trace";
// Fallback: name-based people search.
const FALLBACK_ACTOR = env.APIFY_WP_ACTOR || "parseforge/skip-trace-scraper";

export interface TracedPhone {
  number: string;     // E.164 (+1XXXXXXXXXX)
  type?: "mobile" | "landline" | "unknown";
}

export interface SkipTraceResult {
  phones: TracedPhone[];
  emails: string[];
  confidence: number; // 0-100
  source: string | null;
}

export function isApifyConfigured(): boolean {
  return features.apify;
}

// ---------------------------------------------------------------------------
// Apify call
// ---------------------------------------------------------------------------

async function runActor(actorId: string, input: object): Promise<unknown[]> {
  const token = env.APIFY_API_KEY;
  if (!token) throw new Error("APIFY_NOT_CONFIGURED");
  const id = actorId.replace("/", "~"); // Apify path form
  const url = `https://api.apify.com/v2/acts/${id}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(120000), // scrapers can be slow
  });
  if (!res.ok) throw new Error(`Apify ${actorId} → ${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

// ---------------------------------------------------------------------------
// Defensive extraction — works across varied actor output shapes
// ---------------------------------------------------------------------------

const PHONE_RE = /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;
const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

function normalizePhone(raw: string): string | null {
  const d = raw.replace(/\D/g, "");
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith("1")) return `+${d}`;
  return null;
}

function classify(keyHint: string, surrounding: string): TracedPhone["type"] {
  const s = `${keyHint} ${surrounding}`.toLowerCase();
  if (/mobile|cell|wireless/.test(s)) return "mobile";
  if (/land\s?line|home|residential/.test(s)) return "landline";
  return "unknown";
}

function extract(items: unknown[]): { phones: TracedPhone[]; emails: string[] } {
  const phones = new Map<string, TracedPhone["type"]>();
  const emails = new Set<string>();

  const walk = (v: unknown, keyHint = "") => {
    if (v == null) return;
    if (typeof v === "string") {
      for (const e of v.match(EMAIL_RE) ?? []) emails.add(e.toLowerCase());
      for (const p of v.match(PHONE_RE) ?? []) {
        const norm = normalizePhone(p);
        if (!norm) continue;
        const type = classify(keyHint, v);
        // upgrade to mobile if any source says so
        if (!phones.has(norm) || type === "mobile") phones.set(norm, type === "unknown" ? phones.get(norm) ?? "unknown" : type);
      }
    } else if (Array.isArray(v)) {
      for (const x of v) walk(x, keyHint);
    } else if (typeof v === "object") {
      const obj = v as Record<string, unknown>;
      // one-api style: "Phone-1": "(713)...", "Phone-1 Type": "Wireless"
      for (const [k, val] of Object.entries(obj)) {
        if (typeof val === "string" && /^phone[-\s]?\d/i.test(k) && !/type|provider|reported/i.test(k)) {
          const norm = normalizePhone(val);
          if (!norm) continue;
          const typeKey = Object.keys(obj).find((kk) => kk.toLowerCase().startsWith(k.toLowerCase()) && /type/i.test(kk));
          const tv = typeKey ? String(obj[typeKey]) : "";
          const type: TracedPhone["type"] = /wireless|mobile|cell/i.test(tv) ? "mobile" : /land/i.test(tv) ? "landline" : "unknown";
          if (!phones.has(norm) || type === "mobile") phones.set(norm, type);
        }
      }
      for (const [k, val] of Object.entries(obj)) walk(val, k);
    }
  };
  for (const it of items) walk(it);

  const phoneList = Array.from(phones.entries())
    .map(([number, type]) => ({ number, type }))
    .sort((a, b) => Number(b.type === "mobile") - Number(a.type === "mobile")); // mobile first

  return { phones: phoneList, emails: Array.from(emails) };
}

function confidenceOf(phones: TracedPhone[], emails: string[]): number {
  let c = 0;
  if (phones.some((p) => p.type === "mobile")) c += 50;
  else if (phones.length) c += 35;
  if (emails.length) c += 30;
  if (phones.length > 1) c += 10;
  if (emails.length > 1) c += 5;
  return Math.min(100, c);
}

/** Convert HCAD "LASTNAME FIRSTNAME MIDDLE" → {firstName, lastName} best-effort. */
function splitName(ownerName: string): { firstName?: string; lastName?: string } {
  const t = ownerName.trim().split(/\s+/);
  if (t.length >= 2) return { lastName: t[0], firstName: t[1] };
  return {};
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function skipTrace(opts: {
  ownerName: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
}): Promise<SkipTraceResult> {
  const empty: SkipTraceResult = { phones: [], emails: [], confidence: 0, source: null };
  if (!isApifyConfigured() || !opts.ownerName?.trim()) return empty;

  const { firstName, lastName } = splitName(opts.ownerName);
  const fullName = [firstName, lastName].filter(Boolean).join(" ") || opts.ownerName.trim();
  const csz = [opts.city, opts.state].filter(Boolean).join(", ");

  // Primary: one-api skip trace — by owner name + city/state (and address when present)
  try {
    const input: Record<string, unknown> = { max_results: 3 };
    if (csz) input.name = [`${fullName}; ${csz}`];
    if (opts.address && opts.city) {
      input.street_citystatezip = [`${opts.address}; ${opts.city}, ${opts.state ?? "TX"} ${opts.zip ?? ""}`.trim()];
    }
    const { phones, emails } = extract(await runActor(PRIMARY_ACTOR, input));
    if (phones.length || emails.length) {
      return { phones, emails, confidence: confidenceOf(phones, emails), source: "one-api" };
    }
  } catch (e) {
    console.warn("[skipTrace] primary failed:", e instanceof Error ? e.message : e);
  }

  // Fallback: name-based people search
  if (firstName && lastName) {
    try {
      const { phones, emails } = extract(await runActor(FALLBACK_ACTOR, { firstName, lastName, state: opts.state ?? "Texas", maxItems: 5 }));
      if (phones.length || emails.length) {
        return { phones, emails, confidence: confidenceOf(phones, emails), source: "people-search" };
      }
    } catch (e) {
      console.warn("[skipTrace] fallback failed:", e instanceof Error ? e.message : e);
    }
  }

  return empty;
}
