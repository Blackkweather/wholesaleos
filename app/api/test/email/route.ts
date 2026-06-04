import { NextRequest, NextResponse } from "next/server";
import { sendDailyBriefingEmail } from "@/lib/resend";
import { apiOk, apiError } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const { toEmail, briefingText, dealsFound, buyersFound } = await req.json() as {
    toEmail: string; briefingText: string; dealsFound: number; buyersFound: number;
  };
  const sent = await sendDailyBriefingEmail({ toEmail, briefingText, dealsFound, buyersFound });
  if (!sent) return NextResponse.json(apiError("Email failed"), { status: 500 });
  return NextResponse.json(apiOk({ sent: true, to: toEmail }));
}
