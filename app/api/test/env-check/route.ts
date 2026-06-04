import { NextResponse } from "next/server";
import { env, features } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    features,
    vapi_key_set: Boolean(env.VAPI_API_KEY),
    vapi_key_prefix: env.VAPI_API_KEY?.slice(0, 8) ?? "NOT SET",
    vapi_phone_id: env.VAPI_PHONE_NUMBER_ID ?? "NOT SET",
    resend_set: Boolean(env.RESEND_API_KEY),
    groq_set: Boolean(env.GROQ_API_KEY),
    tavily_set: Boolean(env.TAVILY_API_KEY),
  });
}
