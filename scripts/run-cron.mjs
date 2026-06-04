/**
 * WholesaleOS local cron runner.
 * Run: npm run cron   (in a separate terminal while the dev server is up)
 *
 * Schedule:
 *   - 08:00 daily → POST /api/cron/daily-scan  (deals + buyers + briefing)
 *   - Every hour   → POST /api/cron/sms-drip   (send queued SMS)
 *
 * No extra npm packages needed — pure Node.js setInterval.
 */

import http from "http";
import https from "https";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const SECRET = process.env.CRON_SECRET ?? "dev-cron-secret";

const headers = {
  "Content-Type": "application/json",
  Authorization: `Bearer ${SECRET}`,
};

function post(path) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const lib = url.protocol === "https:" ? https : http;
    const req = lib.request(
      url,
      { method: "POST", headers },
      (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(body) });
          } catch {
            resolve({ status: res.statusCode, body });
          }
        });
      },
    );
    req.on("error", reject);
    req.end();
  });
}

function nowLocal() {
  return new Date().toLocaleString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function log(msg) {
  console.log(`[${nowLocal()}] ${msg}`);
}

// ── Handlers ────────────────────────────────────────────────────────────────

async function runDailyScan() {
  log("🔍 Running daily scan (deals + buyers + briefing)…");
  try {
    const r = await post("/api/cron/daily-scan");
    log(
      `✅ Scan complete: ${JSON.stringify(r.body?.data ?? r.body)}`,
    );
  } catch (e) {
    log(`❌ Daily scan error: ${e.message}`);
  }
}

async function runSmsDrip() {
  log("📨 Running SMS drip…");
  try {
    const r = await post("/api/cron/sms-drip");
    log(`✅ SMS drip: ${JSON.stringify(r.body?.data ?? r.body)}`);
  } catch (e) {
    log(`❌ SMS drip error: ${e.message}`);
  }
}

// ── Scheduler ───────────────────────────────────────────────────────────────

function msUntil(targetHour, targetMinute = 0) {
  const now = new Date();
  const next = new Date(now);
  next.setHours(targetHour, targetMinute, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1); // roll to tomorrow
  return next.getTime() - now.getTime();
}

log(`🚀 WholesaleOS cron runner started → ${BASE_URL}`);
log(`   Daily scan at 08:00 · SMS drip every hour`);

// Daily 08:00 scan
function scheduleDailyScan() {
  const ms = msUntil(8);
  const h = Math.round(ms / 3600000);
  log(`⏰ Next daily scan in ~${h}h`);
  setTimeout(async () => {
    await runDailyScan();
    scheduleDailyScan(); // reschedule for next day
  }, ms);
}

// Hourly SMS drip
async function runSmsDripLoop() {
  await runSmsDrip();
  setInterval(runSmsDrip, 60 * 60 * 1000); // every 60 min
}

// Kick off
scheduleDailyScan();
runSmsDripLoop();

// Optional: run scan immediately on startup if --now flag passed
if (process.argv.includes("--now")) {
  log("⚡ --now flag: running daily scan immediately");
  runDailyScan();
}
