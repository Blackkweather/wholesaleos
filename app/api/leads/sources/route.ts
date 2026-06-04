import { NextResponse } from "next/server";
import { listAdapters } from "@/lib/lead-sources";
import { apiOk } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(apiOk({ sources: listAdapters() }));
}
