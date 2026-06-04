import { NextResponse } from "next/server";
import { z } from "zod";
import { isDbReady, CURRENT_USER_ID, ensureUser } from "@/lib/data/db";
import { hasAnyMarket, createMarket } from "@/lib/data/markets";
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/encrypt";
import { apiOk, apiError } from "@/types";
import type { DealType } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/onboarding — check if the user has completed onboarding */
export async function GET() {
  if (!(await isDbReady())) {
    // DB not connected → skip onboarding, go straight to app
    return NextResponse.json(apiOk({ onboarded: true }));
  }
  const onboarded = await hasAnyMarket();
  return NextResponse.json(apiOk({ onboarded }));
}

const schema = z.object({
  // Step 1
  city: z.string().min(1),
  state: z.string().min(1),

  // Step 2 (optional)
  minPrice: z.number().optional(),
  maxPrice: z.number().optional(),
  dealTypes: z.array(z.string()).optional(),

  // Step 3 (optional Twilio)
  twilioSid: z.string().optional(),
  twilioToken: z.string().optional(),
  twilioPhone: z.string().optional(),
});

/** POST /api/onboarding — save setup and mark user as onboarded */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(apiError("Missing required fields."), {
      status: 400,
    });
  }

  if (!(await isDbReady())) {
    return NextResponse.json(apiOk({ ok: true, demo: true }));
  }

  const d = parsed.data;

  try {
    await ensureUser();

    // Create the target market
    await createMarket({
      city: d.city,
      state: d.state,
      minPrice: d.minPrice,
      maxPrice: d.maxPrice,
      dealTypes: (d.dealTypes ?? []) as DealType[],
    });

    // Optionally save Twilio credentials (encrypted at rest)
    const hasTwilio = d.twilioSid && d.twilioToken && d.twilioPhone;
    if (hasTwilio) {
      await prisma.user.update({
        where: { id: CURRENT_USER_ID },
        data: {
          twilioSid: encrypt(d.twilioSid!),
          twilioToken: encrypt(d.twilioToken!),
          twilioPhone: d.twilioPhone,
          onboardedAt: new Date(),
        },
      });
    } else {
      await prisma.user.update({
        where: { id: CURRENT_USER_ID },
        data: { onboardedAt: new Date() },
      });
    }

    return NextResponse.json(apiOk({ ok: true }));
  } catch (e) {
    console.error("onboarding error", e);
    return NextResponse.json(apiError("Setup failed. Try again."), {
      status: 500,
    });
  }
}
