import { NextResponse } from "next/server";
import { features } from "@/lib/env";
import { isDbReady } from "@/lib/data/db";
import { apiOk } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const database = await isDbReady();
  return NextResponse.json(
    apiOk({
      anthropic: features.anthropic,
      groq: features.groq,
      gemini: features.gemini,
      ai: features.anthropic || features.groq || features.gemini,
      resend: features.resend,
      redis: features.redis,
      google: features.google,
      database,
    }),
  );
}
