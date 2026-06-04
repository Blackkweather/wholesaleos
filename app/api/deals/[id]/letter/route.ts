import { NextResponse } from "next/server";
import { getDeal, dealViewToContext } from "@/lib/data/deals";
import { generateScript } from "@/lib/claude";
import { getLatestScript, saveScript } from "@/lib/data/scripts";
import { apiOk, apiError } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Returns the direct-mail letter for a deal — the saved one if the cron already
 * drafted it, otherwise generates + saves it on the spot.
 * The mailing address (from HCAD) is carried on the deal's "mail: ..." tag.
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const deal = await getDeal(params.id);
  if (!deal) return NextResponse.json(apiError("Deal not found."), { status: 404 });

  // Use the saved letter if present
  const existing = await getLatestScript(deal.id, "LETTER");
  let content = existing?.content ?? "";

  if (!content) {
    try {
      content = await generateScript(dealViewToContext(deal), "LETTER");
      await saveScript(deal.id, "LETTER", content);
    } catch {
      return NextResponse.json(apiError("Could not generate letter."), { status: 500 });
    }
  }

  // Pull the owner's mailing address off the tags for the envelope
  const mailTag = (deal.tags ?? []).find((t) => t.startsWith("mail: "));
  const mailingAddress = mailTag ? mailTag.replace("mail: ", "") : null;

  return NextResponse.json(apiOk({
    content,
    owner: deal.ownerName,
    mailingAddress,
    property: deal.address,
  }));
}
