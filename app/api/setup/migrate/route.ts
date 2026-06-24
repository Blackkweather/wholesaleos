import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/admin-auth";
import { apiOk, apiError } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * One-time, idempotent database setup. Creates the Phase 1–5 tables using the
 * DATABASE_URL already in the environment, so the operator can finish setup with
 * a single click (logged in) instead of running the Prisma CLI. Safe to re-run.
 */
const STATEMENTS: string[] = [
  `ALTER TABLE "Deal" ADD COLUMN IF NOT EXISTS "autoActBlocked" BOOLEAN NOT NULL DEFAULT false`,

  `CREATE TABLE IF NOT EXISTS "Estimate" ("id" TEXT NOT NULL, "dealId" TEXT NOT NULL, "kind" TEXT NOT NULL, "point" DOUBLE PRECISION NOT NULL, "ciLow" DOUBLE PRECISION NOT NULL, "ciHigh" DOUBLE PRECISION NOT NULL, "confidence" DOUBLE PRECISION NOT NULL, "compCount" INTEGER NOT NULL DEFAULT 0, "sources" JSONB NOT NULL, "modelVer" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "Estimate_pkey" PRIMARY KEY ("id"))`,
  `CREATE INDEX IF NOT EXISTS "Estimate_dealId_kind_idx" ON "Estimate"("dealId", "kind")`,
  `CREATE INDEX IF NOT EXISTS "Estimate_dealId_createdAt_idx" ON "Estimate"("dealId", "createdAt")`,

  `CREATE TABLE IF NOT EXISTS "Outcome" ("id" TEXT NOT NULL, "dealId" TEXT NOT NULL, "marketId" TEXT, "predictedArv" DOUBLE PRECISION, "actualSale" DOUBLE PRECISION, "predictedFee" DOUBLE PRECISION, "actualFee" DOUBLE PRECISION, "contracted" BOOLEAN NOT NULL DEFAULT false, "closed" BOOLEAN NOT NULL DEFAULT false, "daysToClose" INTEGER, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "Outcome_pkey" PRIMARY KEY ("id"))`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "Outcome_dealId_key" ON "Outcome"("dealId")`,
  `CREATE INDEX IF NOT EXISTS "Outcome_marketId_createdAt_idx" ON "Outcome"("marketId", "createdAt")`,

  `CREATE TABLE IF NOT EXISTS "Calibration" ("id" TEXT NOT NULL, "marketId" TEXT NOT NULL, "kind" TEXT NOT NULL, "mape" DOUBLE PRECISION NOT NULL, "sampleN" INTEGER NOT NULL, "drift" BOOLEAN NOT NULL DEFAULT false, "windowEnd" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "Calibration_pkey" PRIMARY KEY ("id"))`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "Calibration_marketId_kind_key" ON "Calibration"("marketId", "kind")`,
  `CREATE INDEX IF NOT EXISTS "Calibration_marketId_kind_idx" ON "Calibration"("marketId", "kind")`,

  `CREATE TABLE IF NOT EXISTS "SpendLedger" ("id" TEXT NOT NULL, "orgId" TEXT NOT NULL, "category" TEXT NOT NULL, "costCents" INTEGER NOT NULL, "ref" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "SpendLedger_pkey" PRIMARY KEY ("id"))`,
  `CREATE INDEX IF NOT EXISTS "SpendLedger_orgId_category_createdAt_idx" ON "SpendLedger"("orgId", "category", "createdAt")`,

  `CREATE TABLE IF NOT EXISTS "DeadLetter" ("id" TEXT NOT NULL, "event" TEXT NOT NULL, "payload" JSONB NOT NULL, "error" TEXT NOT NULL, "attempts" INTEGER NOT NULL DEFAULT 0, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "DeadLetter_pkey" PRIMARY KEY ("id"))`,
  `CREATE INDEX IF NOT EXISTS "DeadLetter_event_createdAt_idx" ON "DeadLetter"("event", "createdAt")`,

  `CREATE TABLE IF NOT EXISTS "Consent" ("id" TEXT NOT NULL, "contact" TEXT NOT NULL, "channel" TEXT NOT NULL, "status" TEXT NOT NULL, "method" TEXT NOT NULL, "proof" JSONB, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "Consent_pkey" PRIMARY KEY ("id"))`,
  `CREATE INDEX IF NOT EXISTS "Consent_contact_channel_idx" ON "Consent"("contact", "channel")`,
  `CREATE INDEX IF NOT EXISTS "Consent_createdAt_idx" ON "Consent"("createdAt")`,

  `CREATE TABLE IF NOT EXISTS "DncEntry" ("id" TEXT NOT NULL, "contact" TEXT NOT NULL, "scope" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "DncEntry_pkey" PRIMARY KEY ("id"))`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "DncEntry_contact_key" ON "DncEntry"("contact")`,

  `CREATE TABLE IF NOT EXISTS "AuditLog" ("id" TEXT NOT NULL, "actor" TEXT NOT NULL, "action" TEXT NOT NULL, "entityId" TEXT, "before" JSONB, "after" JSONB, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id"))`,
  `CREATE INDEX IF NOT EXISTS "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt")`,
  `CREATE INDEX IF NOT EXISTS "AuditLog_entityId_idx" ON "AuditLog"("entityId")`,

  `CREATE TABLE IF NOT EXISTS "SurfaceItem" ("id" TEXT NOT NULL, "orgId" TEXT NOT NULL, "kind" TEXT NOT NULL, "dealId" TEXT, "surfaceScore" DOUBLE PRECISION NOT NULL, "valueAtStake" INTEGER NOT NULL DEFAULT 0, "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0, "moneyExempt" BOOLEAN NOT NULL DEFAULT false, "batchKey" TEXT, "recommendation" JSONB NOT NULL, "defaultAction" JSONB NOT NULL, "status" TEXT NOT NULL DEFAULT 'OPEN', "resolution" TEXT, "expiresAt" TIMESTAMP(3) NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "SurfaceItem_pkey" PRIMARY KEY ("id"))`,
  `CREATE INDEX IF NOT EXISTS "SurfaceItem_orgId_kind_status_surfaceScore_idx" ON "SurfaceItem"("orgId", "kind", "status", "surfaceScore")`,
  `CREATE INDEX IF NOT EXISTS "SurfaceItem_batchKey_idx" ON "SurfaceItem"("batchKey")`,
  `CREATE INDEX IF NOT EXISTS "SurfaceItem_status_createdAt_idx" ON "SurfaceItem"("status", "createdAt")`,

  `CREATE TABLE IF NOT EXISTS "SurfacingThreshold" ("orgId" TEXT NOT NULL, "current" DOUBLE PRECISION NOT NULL DEFAULT 0, "targetDailyCount" INTEGER NOT NULL DEFAULT 12, "actualToday" INTEGER NOT NULL DEFAULT 0, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "SurfacingThreshold_pkey" PRIMARY KEY ("orgId"))`,

  `ALTER TABLE "Deal" ADD COLUMN IF NOT EXISTS "ownerCount" INTEGER`,
  `ALTER TABLE "Deal" ADD COLUMN IF NOT EXISTS "ownerHistory" JSONB`,
  `ALTER TABLE "Deal" ADD COLUMN IF NOT EXISTS "sellerProfile" JSONB`,
  `ALTER TABLE "Deal" ADD COLUMN IF NOT EXISTS "photos" JSONB`,

  `CREATE TABLE IF NOT EXISTS "BriefingLog" ("id" TEXT NOT NULL, "orgId" TEXT NOT NULL, "kind" TEXT NOT NULL, "payload" JSONB NOT NULL, "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "BriefingLog_pkey" PRIMARY KEY ("id"))`,
  `CREATE INDEX IF NOT EXISTS "BriefingLog_orgId_kind_sentAt_idx" ON "BriefingLog"("orgId", "kind", "sentAt")`,
];

async function runMigration() {
  const ran: string[] = [];
  const failed: { sql: string; error: string }[] = [];
  for (const sql of STATEMENTS) {
    try {
      await prisma.$executeRawUnsafe(sql);
      ran.push(sql.slice(0, 64));
    } catch (e) {
      failed.push({ sql: sql.slice(0, 64), error: e instanceof Error ? e.message : String(e) });
    }
  }
  return { ran: ran.length, failed };
}

/** GET/POST → create the Phase 1–5 tables. Idempotent. OWNER only. */
export async function GET(req: Request) {
  const auth = await requireOwner(req);
  if (!auth.ok) return NextResponse.json(apiError(auth.error), { status: auth.status });
  const result = await runMigration();
  const ok = result.failed.length === 0;
  return NextResponse.json(
    ok
      ? apiOk({ migrated: true, statements: result.ran, message: "Database is set up — all features are live." })
      : apiError(`Some statements failed: ${JSON.stringify(result.failed)}`),
    { status: ok ? 200 : 500 },
  );
}

export const POST = GET;
