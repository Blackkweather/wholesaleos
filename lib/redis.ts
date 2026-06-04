import "server-only";
import { Redis } from "@upstash/redis";
import { Ratelimit, type Duration } from "@upstash/ratelimit";
import { env, features } from "./env";

/**
 * Endpoint abuse protection. Uses Upstash if configured, otherwise an
 * in-process sliding window (fine for local dev / single instance). Durable
 * freemium quotas live in the DB via lib/limits.ts.
 */
export const redis = features.redis
  ? new Redis({
      url: env.UPSTASH_REDIS_REST_URL!,
      token: env.UPSTASH_REDIS_REST_TOKEN!,
    })
  : null;

const memory = new Map<string, { count: number; reset: number }>();
const limiterCache = new Map<string, Ratelimit>();

function parseDurationMs(d: Duration): number {
  const [n, unit] = d.split(" ");
  const mult: Record<string, number> = {
    ms: 1,
    s: 1000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  };
  return Number(n) * (mult[unit] ?? 1000);
}

export interface RateResult {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
}

export async function rateLimit(
  identifier: string,
  limit: number,
  window: Duration,
): Promise<RateResult> {
  if (redis) {
    const cacheKey = `${limit}:${window}`;
    let limiter = limiterCache.get(cacheKey);
    if (!limiter) {
      limiter = new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(limit, window),
        prefix: "wos:rl",
        analytics: false,
      });
      limiterCache.set(cacheKey, limiter);
    }
    const r = await limiter.limit(identifier);
    return {
      success: r.success,
      limit: r.limit,
      remaining: r.remaining,
      reset: r.reset,
    };
  }

  // In-memory fallback
  const now = Date.now();
  const windowMs = parseDurationMs(window);
  const entry = memory.get(identifier);
  if (!entry || entry.reset <= now) {
    memory.set(identifier, { count: 1, reset: now + windowMs });
    return { success: true, limit, remaining: limit - 1, reset: now + windowMs };
  }
  entry.count += 1;
  return {
    success: entry.count <= limit,
    limit,
    remaining: Math.max(0, limit - entry.count),
    reset: entry.reset,
  };
}
