/**
 * Starter lead pack v2 — pulls real absentee-owner and distressed-home leads
 * from HCAD (out-of-state, alive = skip-traceable) and traces phone/email via
 * Apify. Prints a clean contact list ready to reach out.
 * Usage: npx tsx scripts/lead-pack.ts [--limit 10] [--mode absentee|distressed|both]
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnv() {
  try {
    for (const line of readFileSync(resolve(process.cwd(), ".env"), "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (!m) continue;
      let val = m[2].trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
      if (process.env[m[1]] === undefined) process.env[m[1]] = val;
    }
  } catch {}
}
loadEnv();

const HCAD = "https://www.gis.hctx.net/arcgis/rest/services/HCAD/Parcels/MapServer/0/query";
const APIFY = process.env.APIFY_API_KEY;

const PHONE_RE = /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;
const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

function extract(items: unknown): { phones: string[]; emails: string[] } {
  const s = JSON.stringify(items);
  const emails = new Set<string>();
  const phones = new Set<string>();
  for (const m of s.match(EMAIL_RE) ?? []) if (!/example\.com|sentry|apify/i.test(m)) emails.add(m.toLowerCase());
  for (const m of s.match(PHONE_RE) ?? []) {
    const d = m.replace(/\D/g, "");
    if (d.length === 10) phones.add(`+1${d}`);
    else if (d.length === 11 && d[0] === "1") phones.add(`+${d}`);
  }
  return { phones: [...phones].slice(0, 4), emails: [...emails].slice(0, 3) };
}

async function hcad(where: string, outFields: string, count: number) {
  const qs = new URLSearchParams({ f: "json", returnGeometry: "false", where, outFields, orderByFields: "total_market_val DESC", resultRecordCount: String(count) });
  const r = await fetch(`${HCAD}?${qs}`, { signal: AbortSignal.timeout(20000) });
  const j = (await r.json()) as { features?: { attributes: Record<string, unknown> }[] };
  return j.features ?? [];
}

async function trace(ownerName: string, mailCity: string, mailState: string, address: string) {
  if (!APIFY) return { phones: [], emails: [] };
  const t = ownerName.trim().split(/\s+/);
  const fullName = t.length >= 2 ? `${t[1]} ${t[0]}` : ownerName;
  const input = { max_results: 3, name: [`${fullName}; ${mailCity}, ${mailState}`], street_citystatezip: [`${address}; Houston, TX`] };
  const url = `https://api.apify.com/v2/acts/one-api~skip-trace/run-sync-get-dataset-items?token=${encodeURIComponent(APIFY)}`;
  try {
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input), signal: AbortSignal.timeout(90000) });
    if (!r.ok) return { phones: [], emails: [] };
    return extract(await r.json());
  } catch { return { phones: [], emails: [] }; }
}

// Parse CLI args
const args = process.argv.slice(2);
const limitArg = args[args.indexOf("--limit") + 1];
const LIMIT = limitArg ? parseInt(limitArg, 10) : 10;
const modeArg = args[args.indexOf("--mode") + 1] as "absentee" | "distressed" | "both" | undefined;
const MODE = modeArg ?? "both";

const EXCLUDE = "AND owner_name_1 NOT LIKE '%LLC%' AND owner_name_1 NOT LIKE '%LTD%' AND owner_name_1 NOT LIKE '%INC%' AND owner_name_1 NOT LIKE '%TRUST%' AND owner_name_1 NOT LIKE '%ESTATE%'";

const QUERIES: Record<string, { label: string; where: string; outFields: string }> = {
  absentee: {
    label: "Out-of-state absentee owners",
    where: `mail_state<>'TX' AND mail_state<>'' AND owner_name_1<>'' ${EXCLUDE} AND state_class LIKE 'A%' AND total_market_val > 90000 AND total_market_val < 380000`,
    outFields: "owner_name_1,site_str_num,site_str_name,site_city,site_zip,mail_city,mail_state,total_market_val",
  },
  distressed: {
    label: "Pre-1975 homes, absentee owner (distressed)",
    where: `mail_state<>'TX' AND mail_state<>'' AND owner_name_1<>'' ${EXCLUDE} AND state_class LIKE 'A%' AND yr_impr > 0 AND yr_impr < 1976 AND total_market_val > 80000 AND total_market_val < 320000`,
    outFields: "owner_name_1,site_str_num,site_str_name,site_city,site_zip,mail_city,mail_state,total_market_val,yr_impr",
  },
};

async function main() {
  const modes: ("absentee" | "distressed")[] = MODE === "both" ? ["absentee", "distressed"] : [MODE];
  let globalIdx = 1;
  const perMode = Math.ceil(LIMIT / modes.length);

  for (const mode of modes) {
    const q = QUERIES[mode];
    const rows = await hcad(q.where, q.outFields, perMode * 4);
    const toTrace = rows.slice(0, perMode);

    console.log(`\n--- ${q.label} (${toTrace.length} leads) ---\n`);
    console.log(`Apify skip trace: ${APIFY ? "ready" : "MISSING - set APIFY_API_KEY"}\n`);

    for (const row of toTrace) {
      const a = row.attributes;
      const addr = [a.site_str_num, a.site_str_name].filter(Boolean).join(" ");
      if (!addr) continue;

      const c = await trace(String(a.owner_name_1), String(a.mail_city), String(a.mail_state), addr);
      const yr = a.yr_impr ? ` | Built ${a.yr_impr}` : "";

      console.log(`${globalIdx++}. ${addr}, ${a.site_city} ${a.site_zip}`);
      console.log(`   Owner : ${a.owner_name_1}  (${a.mail_city}, ${a.mail_state})`);
      console.log(`   Value : $${Math.round(Number(a.total_market_val)).toLocaleString()}${yr}`);
      console.log(`   Phone : ${c.phones.join(", ") || "(none found)"}`);
      console.log(`   Email : ${c.emails.join(", ") || "(none found)"}`);
      console.log("");
    }
  }

  console.log("These are real Houston absentee/distressed owners. Contact the ones with phones first.");
}

main().catch((e) => { console.error(e); process.exit(1); });
