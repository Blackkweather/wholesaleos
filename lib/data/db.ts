import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * Auto-detect whether a real Postgres is reachable. When it is, repositories
 * use Prisma; otherwise they fall back to the in-memory demo store so the whole
 * app stays usable before the user wires up Supabase. Result is cached for the
 * process lifetime (a server restart re-checks).
 */
let dbReady: boolean | null = null;
let inFlight: Promise<boolean> | null = null;

export async function isDbReady(): Promise<boolean> {
  if (dbReady !== null) return dbReady;
  if (!inFlight) {
    inFlight = (async () => {
      try {
        await Promise.race([
          prisma.$queryRaw`SELECT 1`,
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("db-timeout")), 1500),
          ),
        ]);
        dbReady = true;
      } catch {
        dbReady = false;
      } finally {
        inFlight = null;
      }
      return dbReady ?? false;
    })();
  }
  return inFlight;
}

/** Single-user app: stable id until a real auth session replaces it. */
export const CURRENT_USER_ID = "solo-user";

/** Ensure the single user row exists (FK target) when running against a real DB. */
export async function ensureUser(): Promise<void> {
  try {
    await prisma.user.upsert({
      where: { id: CURRENT_USER_ID },
      create: {
        id: CURRENT_USER_ID,
        email: "me@wholesaleos.local",
        name: "Me",
        onboardedAt: new Date(),
      },
      update: {},
    });
  } catch {
    /* ignore — demo mode */
  }
}
