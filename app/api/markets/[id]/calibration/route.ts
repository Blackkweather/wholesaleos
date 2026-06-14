import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isDbReady } from "@/lib/data/db";
import { checkDrift } from "@/lib/confidence/calibration";
import { apiOk, apiError } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET → calibration status (MAPE, sample size, drift) for a market, per kind. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const marketId = params.id;
  if (!(await isDbReady())) {
    return NextResponse.json(apiError("Database not available."), { status: 503 });
  }

  const market = await prisma.market.findUnique({ where: { id: marketId } });
  if (!market) return NextResponse.json(apiError("Market not found."), { status: 404 });

  const [arv, repair, records] = await Promise.all([
    checkDrift(marketId, "ARV"),
    checkDrift(marketId, "REPAIR"),
    prisma.calibration.findMany({ where: { marketId } }),
  ]);

  return NextResponse.json(
    apiOk({
      marketId,
      market: { city: market.city, state: market.state },
      arv,
      repair,
      records,
      automationSuspended: arv.drift || repair.drift,
    }),
  );
}
