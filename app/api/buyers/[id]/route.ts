import { NextResponse } from "next/server";
import { deleteBuyer } from "@/lib/data/buyers";
import { apiOk, apiError } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const ok = await deleteBuyer(params.id);
  if (!ok) return NextResponse.json(apiError("Buyer not found."), { status: 404 });
  return NextResponse.json(apiOk({ deleted: true }));
}
