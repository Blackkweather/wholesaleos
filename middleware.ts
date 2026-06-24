import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

const PUBLIC_PREFIXES = [
  "/login",
  "/api/auth",
  "/api/cron",
  "/api/webhooks",
  "/api/inngest",
  "/api/stripe/webhook",
  "/api/setup",
];

const PUBLIC_PAGES = ["/", "/terms", "/privacy"];

const rateLimit = new Map<string, { count: number; resetAt: number }>();

const RATE_LIMITS: Record<string, { max: number; windowMs: number }> = {
  "/api/auth": { max: 10, windowMs: 60_000 },
  "/api/deals/scan": { max: 5, windowMs: 60_000 },
  "/api/analyze": { max: 10, windowMs: 60_000 },
  "/api/lookup": { max: 10, windowMs: 60_000 },
  "/api/buyers/scan": { max: 5, windowMs: 60_000 },
  "/api/deals/": { max: 30, windowMs: 60_000 },
};

function checkLimit(ip: string, path: string): boolean {
  for (const [prefix, { max, windowMs }] of Object.entries(RATE_LIMITS)) {
    if (!path.startsWith(prefix)) continue;
    const key = `${ip}:${prefix}`;
    const now = Date.now();
    const entry = rateLimit.get(key);
    if (!entry || entry.resetAt < now) {
      rateLimit.set(key, { count: 1, resetAt: now + windowMs });
      return true;
    }
    entry.count++;
    return entry.count <= max;
  }
  return true;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  if (PUBLIC_PAGES.includes(pathname)) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? req.ip ?? "unknown";
    if (!checkLimit(ip, pathname)) {
      return NextResponse.json({ error: "Too many requests. Slow down." }, { status: 429 });
    }
  }

  const token = await getToken({
    req,
    secret:
      process.env.NEXTAUTH_SECRET ??
      "dev-only-secret-please-change-in-production-0001",
  });

  if (!token) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 },
      );
    }
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set(
      "callbackUrl",
      pathname === "/" ? "/dashboard" : pathname,
    );
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:png|svg|ico|jpg|jpeg|gif|webp|woff2?)$).*)",
  ],
};
