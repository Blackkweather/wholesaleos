import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { isDbReady, CURRENT_USER_ID, ensureUser } from "@/lib/data/db";
import { encrypt } from "@/lib/encrypt";
import { apiOk, apiError } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  sid: z.string().min(2),
  token: z.string().min(2),
  phone: z.string().min(5),
});

export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(apiError("All Twilio fields are required."), {
      status: 400,
    });
  }
  if (!(await isDbReady())) {
    return NextResponse.json(
      apiOk({
        saved: false,
        message: "Connect a database (DATABASE_URL) to securely store credentials.",
      }),
    );
  }
  try {
    await ensureUser();
    await prisma.user.update({
      where: { id: CURRENT_USER_ID },
      data: {
        twilioSid: encrypt(parsed.data.sid),
        twilioToken: encrypt(parsed.data.token),
        twilioPhone: parsed.data.phone,
      },
    });
    return NextResponse.json(apiOk({ saved: true }));
  } catch (e) {
    console.error("twilio save error", e);
    return NextResponse.json(apiError("Could not save credentials."), {
      status: 500,
    });
  }
}
