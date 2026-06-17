# WholesaleOS — Production Build Progress

Frozen architecture. Build order: **Measurement → Reliability → Compliance → Automation → Autonomy.**
Each phase ships independently, is feature-flag safe, backward compatible, and verified with
`tsc --noEmit` (0 errors) + standalone tests + `next build`.

Legend: ✅ done & verified · 🟡 in progress · ⬜ not started

---

## Phase 0 — Foundation ✅
Kill local AI dependency, single AI gateway, Inngest event bus.

- [x] `lib/ai/types.ts`, `lib/ai/providers.ts`, `lib/ai/gateway.ts` (failover, circuit breaker, health)
- [x] `inngest/client.ts`, `inngest/functions/_smoke.ts`, `inngest/functions/index.ts`
- [x] `app/api/inngest/route.ts`, `app/api/test/ai-health/route.ts`
- [x] Refactor `lib/claude.ts`, `lib/gemini.ts`, `lib/groq.ts` → gateway (FreeLLMAPI removed)
- [x] `lib/env.ts` (AI gateway + Inngest vars), `package.json` (inngest dep), `vercel.json`
- [x] Tests: `lib/ai/gateway.test.ts` (failover + all-fail) · build green

## Phase 1 — Data Confidence Layer ✅
Every money number carries a confidence interval + calibration; gate blocks unsafe auto-actions.

- [x] Models: `Estimate`, `Outcome`, `Calibration`; `Deal.autoActBlocked`
- [x] `lib/confidence/{arv,repair,offer,score,match,calibration,gate}.ts`
- [x] `GET /api/deals/[id]/confidence`, `GET /api/markets/[id]/calibration`
- [x] Modify `analyze` (persist estimates + set gate) and `negotiation` (refuse on gate fail)
- [x] Redis: `wos:arv:{hash}` 24h · `wos:rentcast:month` 35d hard-stop 48 · `wos:calib` 1h
- [x] Tests: `lib/confidence/confidence.test.ts` (8 groups) · build green

## Phase 2 — Reliability Layer ✅
Spend caps, killswitch, circuit breakers, idempotency, cache, dead-letter.

- [x] `lib/cache.ts`, `lib/reliability/{budget,killswitch,breaker,idempotency}.ts`
- [x] Models: `SpendLedger`, `DeadLetter`
- [x] `POST/GET /api/admin/killswitch`, `GET /api/admin/spend`, `GET/POST /api/admin/deadletter` (OWNER)
- [x] Wrap `gateway`, `rentcast`, `resend`, `twilio`, `lob` (killswitch + budget + breaker + idempotency)
- [x] Events: `system.budget.warn|halt`, `system.deadletter`; Inngest `onFailure` dead-letter
- [x] Redis: `wos:budget` 36h · `wos:kill:*` · `wos:breaker` · `wos:idem` 24h · `wos:cache`
- [x] Tests: budget/breaker/idempotency/cache/deadletter · build green

---

## Phase 3 — Compliance Layer ✅
No send leaves without consent + DNC + channel-rule pass. Immutable audit.

- [x] `lib/compliance/{guard,consent,dnc,quiet-hours,audit}.ts`
- [x] Models: `Consent`, `DncEntry`, `AuditLog`
- [x] `GET/POST /api/compliance/consent`, `/api/compliance/dnc`, `GET /api/compliance/audit` (OWNER)
- [x] Wire `guard.canSend()` into resend/twilio/lob; inbound reply → consent GRANTED; STOP → REVOKE + DNC
- [x] Channel rules: cold SMS/CALL human-only (TCPA) · cold MAIL/EMAIL ok · quiet hours 8am–9pm
- [x] Events: `seller.replied`, `compliance.blocked`, `consent.revoked`
- [x] Redis: `wos:dnc` 12h (fail-closed on error) · `wos:consent` 1h · quiet hours computed live
- [x] Tests: `lib/compliance/compliance.test.ts` (opt-out, DNC, cold-SMS, quiet-hours, window) · build green

## Phase 4 — Automation Layer ✅
Cron → events; Surfacing Engine v2 (money-exempt bypass, adaptive threshold, audit sampling).

- [x] `inngest/functions/{lead-lifecycle,seller-reply,disposition,closed-deal}.ts`
- [x] `inngest/functions/scheduled/{daily-scan,rescore,skip-trace,health-check}.ts` (delegate to cron routes)
- [x] `lib/surfacing/{score,engine,sampling,metrics}.ts`
- [x] Models: `SurfaceItem`, `SurfacingThreshold`
- [x] `GET /api/surface`, `POST /api/surface/[id]/resolve`
- [x] Events emitted: `lead.created` (createDealsFromScored), `deal.contracted`/`deal.closed` (updateDeal), `lead.qualified`, `surface.resolved`, `surface.audit.sampled`
- [x] Redis: `wos:surface:T` 1h · `wos:surface:count` 36h · money items bypass suppression
- [x] Tests: `lib/surfacing/surfacing.test.ts` (score, novelty, money-exempt, adaptive threshold, P/R, sampling) · build green
- [x] **follow-up.ts** durable per-deal cadence (3/7/14/30/60d, stops on response/opt-out/advance) — `followup.start` on stage→CONTACTED
- [x] **lead-qualified.ts** auto-drafts first-contact outreach on qualification
- [x] **surface-resolved.ts** closes approve→act loop (approved disposition → blast executes)
- _Note: tenancy-required migration deferred (single-operator; non-breaking)._

## Phase 5 — Executive OS ✅
Owner sees Decisions / Risks / Opportunities + briefing. No raw-data monitoring.

- [x] `app/(app)/command/page.tsx` + `components/surface/command-feed.tsx`
- [x] `lib/briefing/weekly.ts`, `lib/command/feed.ts`; `inngest/functions/scheduled/{weekly,daily}-briefing.ts`
- [x] Model: `BriefingLog`
- [x] `GET /api/command/feed` (60s cache), `GET /api/command/briefing` (?fresh=1 to generate)
- [x] Events: `briefing.weekly.sent`, `briefing.daily.sent`, `surface.audit.sampled`
- [x] Redis: `wos:cache:command:feed` 60s
- [x] Tests: `lib/command/command.test.ts` (feed aggregation + briefing reconciliation) · build green

---

## Verification commands
```
npx tsc --noEmit
npm run test:ai && npm run test:confidence && npm run test:reliability
npx cross-env NODE_ENV=production next build
npx prisma db push
```

## Env vars by phase
- **P0:** `AI_GATEWAY_URL/KEY`, `OPENROUTER_API_KEY`, `AI_PRIMARY/FALLBACK/EMERGENCY_MODEL`, `INNGEST_EVENT_KEY/SIGNING_KEY`
- **P1:** `RENTCAST_API_KEY`
- **P2:** `CAP_AI/SMS/MAIL/DATA/EMAIL_CENTS`, `KILLSWITCH_SECRET`
- **P3:** _(none new — uses existing DB/Redis)_
- **P4–P5:** `NEXT_PUBLIC_APP_URL` + `CRON_SECRET` (scheduled functions delegate to cron routes)

---

## ✅ ALL PHASES COMPLETE — 2026-06-14

Every phase shipped, type-checks clean (strict), 10 standalone test suites green, `next build` succeeds.

| Phase | Tables added | Routes added | Tests |
|-------|--------------|--------------|-------|
| 0 Foundation | — | `inngest`, `test/ai-health` | `test:ai` |
| 1 Data Confidence | Estimate, Outcome, Calibration | `deals/[id]/confidence`, `markets/[id]/calibration` | `test:confidence` |
| 2 Reliability | SpendLedger, DeadLetter | `admin/{killswitch,spend,deadletter}` | `test:reliability` (5) |
| 3 Compliance | Consent, DncEntry, AuditLog | `compliance/{consent,dnc,audit}` | `test:compliance` |
| 4 Automation | SurfaceItem, SurfacingThreshold | `surface`, `surface/[id]/resolve` | `test:surfacing` |
| 5 Executive OS | BriefingLog | `command/{feed,briefing}`, `/command` page | `test:command` |

**Inngest functions (11):** smoke, lead-lifecycle, seller-reply, disposition, closed-deal,
scheduled daily-scan/rescore/skip-trace/health-check/weekly-briefing/daily-briefing.

**Run everything:**
```
npx tsc --noEmit
npm run test:ai && npm run test:confidence && npm run test:reliability && npm run test:compliance && npm run test:surfacing && npm run test:command
npx prisma db push && npx cross-env NODE_ENV=production next build
```
