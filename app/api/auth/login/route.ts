import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE } from "@/middleware";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

async function deriveToken(password: string, secret: string): Promise<string> {
  const { createHmac } = await import("crypto");
  return createHmac("sha256", secret).update(password).digest("hex");
}

export async function POST(req: NextRequest) {
  try {
    const { password, from } = (await req.json()) as {
      password?: string;
      from?: string;
    };

    const appPassword = process.env.APP_PASSWORD;

    // If no APP_PASSWORD set, any password works (dev open mode).
    if (appPassword && password !== appPassword) {
      return NextResponse.json({ error: "Wrong password" }, { status: 401 });
    }

    const secret =
      process.env.NEXTAUTH_SECRET ??
      "dev-only-secret-please-change-in-production-0001";
    const token = await deriveToken(appPassword ?? "open", secret);

    const redirectTo = from && from.startsWith("/") ? from : "/dashboard";
    const res = NextResponse.json({ ok: true, redirect: redirectTo });

    res.cookies.set(AUTH_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: COOKIE_MAX_AGE,
      // secure: true — enable in production behind HTTPS
    });

    return res;
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}
