import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "./env";

// Mirror of middleware.ts AUTH_COOKIE (kept in sync; not imported to avoid
// pulling Edge middleware into the Node runtime).
const AUTH_COOKIE = "wos_auth";

/**
 * OWNER enforcement for admin routes. This is a single-operator app: the
 * authenticated cookie holder IS the owner. A request is authorized when it
 * carries either
 *   - a valid wos_auth cookie (same HMAC derivation as the middleware), or
 *   - Authorization: Bearer <KILLSWITCH_SECRET> (programmatic ops/monitoring).
 * When APP_PASSWORD is unset the app runs open (dev), matching the middleware.
 */

export type OwnerCheck = { ok: true } | { ok: false; status: number; error: string };

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

function deriveToken(password: string, secret: string): string {
  return createHmac("sha256", secret).update(password).digest("hex");
}

function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) return decodeURIComponent(part.slice(idx + 1).trim());
  }
  return null;
}

export async function requireOwner(req: Request): Promise<OwnerCheck> {
  // 1) Bearer admin secret (programmatic).
  const secret = env.KILLSWITCH_SECRET?.trim();
  if (secret) {
    const header = req.headers.get("authorization") ?? req.headers.get("x-admin-secret") ?? "";
    const bearer = header.replace(/^Bearer\s+/i, "").trim();
    if (bearer && safeEqual(bearer, secret)) return { ok: true };
  }

  // 2) Open dev mode (no password gate configured).
  const appPassword = process.env.APP_PASSWORD;
  if (!appPassword) return { ok: true };

  // 3) Owner cookie (same derivation as the middleware).
  const cookie = readCookie(req.headers.get("cookie"), AUTH_COOKIE);
  if (cookie) {
    const expected = deriveToken(appPassword, process.env.NEXTAUTH_SECRET ?? "dev-only-secret-please-change-in-production-0001");
    if (safeEqual(cookie, expected)) return { ok: true };
  }

  return { ok: false, status: 401, error: "Owner authorization required" };
}
