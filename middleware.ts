import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export const AUTH_COOKIE = "wos_auth";

/** Paths that are always public — no auth required. */
const PUBLIC_PREFIXES = ["/login", "/api/auth/login", "/api/auth/logout", "/api/cron", "/api/webhooks", "/api/test", "/api/inngest"];

/**
 * Derive a deterministic auth token from the password + secret using HMAC-SHA256.
 * Works on the Edge (Web Crypto API, no Node built-ins).
 */
async function deriveToken(password: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(password));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Always allow Next.js internals and public paths.
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const password = process.env.APP_PASSWORD;
  // No password configured → open access (useful for local dev without a gate).
  if (!password) return NextResponse.next();

  const secret = process.env.NEXTAUTH_SECRET ?? "dev-only-secret-please-change-in-production-0001";
  const expected = await deriveToken(password, secret);
  const cookie = req.cookies.get(AUTH_COOKIE)?.value;

  if (cookie !== expected) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("from", pathname === "/" ? "/dashboard" : pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  /*
   * Match everything except:
   * - _next/static  (built assets)
   * - _next/image   (image optimisation)
   * - favicon.ico
   * - any *.png / *.svg / *.ico static images
   */
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:png|svg|ico)$).*)"],
};
