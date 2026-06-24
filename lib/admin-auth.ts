import "server-only";
import { timingSafeEqual } from "node:crypto";
import { env } from "./env";

export type OwnerCheck = { ok: true } | { ok: false; status: number; error: string };

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export async function requireOwner(req: Request): Promise<OwnerCheck> {
  const header = req.headers.get("authorization") ?? req.headers.get("x-admin-secret") ?? "";
  const bearer = header.replace(/^Bearer\s+/i, "").trim();

  const secret = env.KILLSWITCH_SECRET?.trim();
  if (secret && bearer && safeEqual(bearer, secret)) return { ok: true };

  try {
    const { getServerSession } = await import("next-auth");
    const { authOptions } = await import("./auth");
    const session = await getServerSession(authOptions);
    if (session?.user) return { ok: true };
  } catch {
    // Fallback if NextAuth not available
  }

  const appPassword = process.env.APP_PASSWORD?.trim();
  if (!appPassword && process.env.NODE_ENV !== "production") return { ok: true };
  if (appPassword && bearer && safeEqual(bearer, appPassword)) return { ok: true };

  return { ok: false, status: 401, error: "Owner authorization required" };
}
