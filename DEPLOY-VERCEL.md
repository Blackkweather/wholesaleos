# Deploy WholesaleOS to Vercel (always-on, free tier)

This hosts the app 24/7 on Vercel so it runs without your PC. It replaces the
local cron + Cloudflare tunnel + Windows scheduled tasks entirely — you get a
permanent `https://your-app.vercel.app` URL.

The code is already prepared for this (`prisma generate` in the build, a Vercel
binary target, `vercel.json` cron, and 60s-safe cron routes). You just need to
do the account steps below — I can't create accounts for you.

> **Free-tier reality:** Vercel Hobby caps functions at **60s** and native cron
> at **once per day**. The daily scan is now split so it fits, and the hourly
> SMS drip runs from a **free external cron** (Step 6). Hobby is also technically
> non-commercial per Vercel's ToS — for a real business, Pro ($20/mo) is cleaner
> (native hourly cron + 5-min functions), but everything below works on free.

---

## Step 1 — Cloud database (Supabase, free)

Your app currently uses `localhost:5432` (MAMP). Vercel can't reach your PC, so
you need a cloud Postgres.

1. Go to **supabase.com** → create a free account → **New project**.
2. Pick a strong database password, region close to you, and create it.
3. Once ready: **Project Settings → Database → Connection string**. Grab two:
   - **Transaction pooler** (port `6543`) → this becomes `DATABASE_URL`
   - **Session / direct** (port `5432`) → this becomes `DIRECT_URL`
   - Append `?pgbouncer=true&connection_limit=1` to the pooled `DATABASE_URL`.
4. Push the schema to Supabase from your PC (one time):
   ```powershell
   cd "C:\MAMP\htdocs\PROP SCANNER\wholesaleos"
   $env:DATABASE_URL="<your supabase pooled url>"
   $env:DIRECT_URL="<your supabase direct url>"
   npx prisma db push
   ```
   This creates all the tables in Supabase. (Your local data stays in MAMP; the
   cloud DB starts empty — you'll re-add markets/buyers and re-enter Twilio in
   Step 7.)

---

## Step 2 — Put the code on GitHub

Vercel deploys from a Git repo. You have a local repo but no GitHub remote yet.

1. Create a **private** repo at github.com (e.g. `wholesaleos`).
2. From the project folder:
   ```powershell
   cd "C:\MAMP\htdocs\PROP SCANNER\wholesaleos"
   git add -A
   git commit -m "Prepare for Vercel deploy"
   git branch -M main
   git remote add origin https://github.com/<you>/wholesaleos.git
   git push -u origin main
   ```
   > `.env` is gitignored — your secrets are NOT pushed. You'll add them in Step 4.

---

## Step 3 — Create the Vercel project

1. Go to **vercel.com** → sign up (use "Continue with GitHub").
2. **Add New → Project** → import your `wholesaleos` repo.
3. Framework preset: **Next.js** (auto-detected). Leave build settings default —
   the `build` script already runs `prisma generate && next build`.
4. **Don't deploy yet** — add env vars first (Step 4), then deploy.

---

## Step 4 — Environment variables (Vercel dashboard)

In the project's **Settings → Environment Variables**, add each of these for the
**Production** environment. Most are copied straight from your local `.env`; the
ones marked **CHANGE** get a production value.

| Variable | Value |
|---|---|
| `DATABASE_URL` | **CHANGE** → Supabase pooled URL (Step 1) |
| `DIRECT_URL` | **CHANGE** → Supabase direct URL (Step 1) |
| `ENCRYPTION_KEY` | **CHANGE** → a new strong 32+ char random string (then keep it stable forever) |
| `NEXTAUTH_SECRET` | **CHANGE** → a new strong random string |
| `NEXTAUTH_URL` | **CHANGE** → `https://your-app.vercel.app` |
| `NEXT_PUBLIC_APP_URL` | **CHANGE** → `https://your-app.vercel.app` |
| `PUBLIC_WEBHOOK_URL` | **CHANGE** → `https://your-app.vercel.app` |
| `CRON_SECRET` | **CHANGE** → a strong random string (used to authorize cron calls) |
| `APP_PASSWORD` | your single-user login password (see `.env` auth-gate line) |
| `GROQ_API_KEY` | copy from `.env` |
| `TAVILY_API_KEY` | copy from `.env` |
| `GEMINI_API_KEY` | copy from `.env` |
| `APIFY_API_KEY` | copy from `.env` |
| `REGRID_API_KEY` | copy from `.env` |
| `RESEND_API_KEY` | copy from `.env` |
| `EMAIL_FROM` | copy from `.env` |
| `VAPI_API_KEY` | copy from `.env` |
| `VAPI_PHONE_NUMBER_ID` | copy from `.env` |
| `VAPI_TWILIO_PHONE_NUMBER_ID` | copy from `.env` |
| `OWNER_EMAIL` | copy from `.env` (your briefing email) |

Optional (only if you use them): `ANTHROPIC_API_KEY`, `ESTATED_API_KEY`,
`LOB_API_KEY` + `LOB_FROM_*`, `UPSTASH_REDIS_REST_URL` + `_TOKEN`,
`APIFY_TPS_ACTOR`, `APIFY_WP_ACTOR`, `GOOGLE_CLIENT_ID` + `_SECRET`.

> Twilio creds are **not** env vars — they live encrypted in the DB and you'll
> re-enter them in Step 7.

---

## Step 5 — Deploy

Click **Deploy**. After it builds, you get `https://your-app.vercel.app`.
Open it — you should hit the login gate. Log in with `APP_PASSWORD`.

The native daily scan (`vercel.json`) is already scheduled for **13:00 UTC**
(~8am Central). Change the time in `vercel.json` if you like (it's UTC).

---

## Step 6 — Free external cron for the hourly jobs

Hobby native cron is daily-only, so the **SMS drip** (hourly) and **skip-trace**
(batched) run from a free service.

1. Go to **cron-job.org** → sign up (free).
2. Create **two** cron jobs. For each, set:
   - **URL:** `https://your-app.vercel.app/api/cron/<name>`
   - **Request method:** `POST` (GET also works)
   - **Header:** `Authorization: Bearer <your CRON_SECRET>`
   - **Schedule:** as below

   | Job | URL path | Schedule |
   |---|---|---|
   | SMS drip | `/api/cron/sms-drip` | every hour |
   | Skip trace | `/api/cron/skip-trace` | every 4 hours |

   (Optional 3rd: `/api/cron/daily-scan` daily, if you'd rather not use Vercel's
   native cron.)

---

## Step 7 — Re-point webhooks + re-enter Twilio

1. **Twilio inbound SMS** → in the Twilio Console, set your number's Messaging
   webhook to:
   `https://your-app.vercel.app/api/webhooks/sms-inbound`  (method POST).
2. **Vapi** → in the Vapi dashboard, set the server/webhook URL to:
   `https://your-app.vercel.app/api/webhooks/vapi`.
3. **Re-enter Twilio creds** in the app: open `https://your-app.vercel.app` →
   **Settings → Twilio** → paste your Account SID, Auth Token, and number. (They
   get encrypted into the cloud DB with your production `ENCRYPTION_KEY`.)
4. Re-add your **market(s)** and any **buyers** (the cloud DB started empty).

---

## Step 8 — Verify it's live

- Visit `https://your-app.vercel.app/api/status` → should return OK.
- In Vercel → **Deployments → Functions/Logs**, manually run the daily scan:
  `https://your-app.vercel.app/api/cron/daily-scan` won't run without the
  `CRON_SECRET` header — trigger it from cron-job.org "Run now", or from the
  Vercel Cron tab.
- Text your Twilio number → watch the deal's activity feed for the inbound +
  AI reply (subject to the Twilio **trial** cap — verified numbers only until
  you upgrade Twilio).

---

## After it's live — retire the local stopgaps (optional)

Once Vercel is serving traffic, the local hacks are no longer needed:
```powershell
schtasks /delete /tn "WholesaleOS App" /f
schtasks /delete /tn "WholesaleOS Cron" /f
schtasks /delete /tn "WholesaleOS Tunnel" /f
```
And stop the local Cloudflare tunnel. Your webhooks now point at Vercel's
permanent URL, so nothing depends on your PC anymore.

---

## What did NOT change
- **Twilio trial cap** — still verified-numbers-only for outbound until you add
  funds. Hosting doesn't affect this.
- **Human-in-the-loop** — the app still drafts; you still approve each outreach
  and run the real negotiations. Vercel just keeps it running 24/7.
