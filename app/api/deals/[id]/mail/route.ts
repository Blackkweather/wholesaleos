import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDeal, dealViewToContext } from "@/lib/data/deals";
import { generateScript } from "@/lib/claude";
import { getLatestScript, saveScript } from "@/lib/data/scripts";
import { isLobConfigured, parseMailAddress, sendLetterViaLob } from "@/lib/lob";
import { apiOk, apiError } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function mailingOf(tags: string[]): string | null {
  const t = tags.find((x) => x.startsWith("mail: "));
  return t ? t.replace("mail: ", "") : null;
}

/** GET → preview: letter + parsed recipient + whether Lob is ready. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const deal = await getDeal(params.id);
  if (!deal) return NextResponse.json(apiError("Deal not found."), { status: 404 });

  let letter = (await getLatestScript(deal.id, "LETTER"))?.content;
  if (!letter) {
    try { letter = await generateScript(dealViewToContext(deal), "LETTER"); await saveScript(deal.id, "LETTER", letter); }
    catch { letter = ""; }
  }
  const mailing = mailingOf(deal.tags ?? []);
  const to = mailing && deal.ownerName ? parseMailAddress(deal.ownerName, mailing) : null;

  return NextResponse.json(apiOk({ letter, to, lobConfigured: isLobConfigured() }));
}

/** POST → human-approved send via Lob; record the mail campaign on the deal. */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const deal = await getDeal(params.id);
  if (!deal) return NextResponse.json(apiError("Deal not found."), { status: 404 });
  if (!isLobConfigured()) return NextResponse.json(apiError("Lob not configured — add LOB_API_KEY + from address."), { status: 400 });

  const mailing = mailingOf(deal.tags ?? []);
  const to = mailing && deal.ownerName ? parseMailAddress(deal.ownerName, mailing) : null;
  if (!to) return NextResponse.json(apiError("No mailing address on this deal."), { status: 400 });

  let letter = (await getLatestScript(deal.id, "LETTER"))?.content;
  if (!letter) letter = await generateScript(dealViewToContext(deal), "LETTER");

  try {
    const result = await sendLetterViaLob(to, letter, `Deal ${deal.address}`);
    // Track the mail campaign + advance contact timeline
    await prisma.deal.update({
      where: { id: deal.id },
      data: {
        lastContactAt: new Date(),
        dateContacted: deal.dateContacted ? undefined : new Date(),
        stage: deal.stage === "FOUND" || deal.stage === "VERIFIED" ? "CONTACTED" : undefined,
        nextFollowUpAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });
    await prisma.activity.create({
      data: {
        dealId: deal.id,
        type: "EMAIL_SENT",
        content: `📬 Mailed via Lob to ${to.name} (${to.city}, ${to.state}) — expected ${result.expectedDelivery ?? "soon"}`,
        meta: { channel: "mail", lobId: result.id, expectedDelivery: result.expectedDelivery },
      },
    });
    return NextResponse.json(apiOk(result));
  } catch (e) {
    return NextResponse.json(apiError(e instanceof Error ? e.message : "Lob send failed."), { status: 500 });
  }
}
