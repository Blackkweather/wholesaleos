import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { isDbReady } from "@/lib/data/db";
import { replayDeadLetter } from "@/inngest/dead-letter";
import { apiOk, apiError } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET → recent dead-letter rows. */
export async function GET(req: Request) {
  const auth = await requireOwner(req);
  if (!auth.ok) return NextResponse.json(apiError(auth.error), { status: auth.status });
  if (!(await isDbReady())) return NextResponse.json(apiError("Database not available."), { status: 503 });

  const rows = await prisma.deadLetter.findMany({ orderBy: { createdAt: "desc" }, take: 100 });
  return NextResponse.json(apiOk({ count: rows.length, rows }));
}

/** POST { id } → replay a dead-lettered event (re-emit + increment attempts). */
export async function POST(req: Request) {
  const auth = await requireOwner(req);
  if (!auth.ok) return NextResponse.json(apiError(auth.error), { status: auth.status });

  const body = (await req.json().catch(() => ({}))) as { id?: string };
  if (!body.id) return NextResponse.json(apiError("id is required."), { status: 400 });

  const result = await replayDeadLetter(body.id);
  if (!result.ok) return NextResponse.json(apiError(result.error ?? "Replay failed."), { status: 400 });
  return NextResponse.json(apiOk({ id: body.id, replayed: true, attempts: result.attempts }));
}
