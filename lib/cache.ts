import "server-only";
import { createHash } from "node:crypto";
import { redis } from "./redis";

/**
 * Reliability KV + JSON cache. Separate from lib/redis.ts (which owns endpoint
 * rate limiting). Every primitive uses Upstash Redis when configured and falls
 * back to a process-local TTL map otherwise, so the reliability layer works in
 * tests and degrades gracefully when Redis is unavailable.
 */

interface MemEntry {
  value: string;
  expireAt: number | null; // epoch ms, or null = no expiry
}
const mem = new Map<string, MemEntry>();

function memGet(key: string): string | null {
  const e = mem.get(key);
  if (!e) return null;
  if (e.expireAt !== null && e.expireAt <= Date.now()) {
    mem.delete(key);
    return null;
  }
  return e.value;
}

function memSet(key: string, value: string, ttlSeconds?: number): void {
  mem.set(key, { value, expireAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null });
}

// ---------------------------------------------------------------------------
// Low-level KV primitives (used by the reliability modules)
// ---------------------------------------------------------------------------

export async function kvGetRaw(key: string): Promise<string | null> {
  if (redis) {
    try {
      const v = await redis.get<string | number>(key);
      return v === null || v === undefined ? null : String(v);
    } catch {
      return memGet(key);
    }
  }
  return memGet(key);
}

export async function kvSetRaw(key: string, value: string, ttlSeconds?: number): Promise<void> {
  if (redis) {
    try {
      if (ttlSeconds) await redis.set(key, value, { ex: ttlSeconds });
      else await redis.set(key, value);
      return;
    } catch {
      /* fall back to memory */
    }
  }
  memSet(key, value, ttlSeconds);
}

/** Set only if absent. Returns true when this call created the key. */
export async function kvSetNX(key: string, value: string, ttlSeconds?: number): Promise<boolean> {
  if (redis) {
    try {
      const res = ttlSeconds
        ? await redis.set(key, value, { nx: true, ex: ttlSeconds })
        : await redis.set(key, value, { nx: true });
      return res === "OK";
    } catch {
      /* fall back to memory */
    }
  }
  if (memGet(key) !== null) return false;
  memSet(key, value, ttlSeconds);
  return true;
}

export async function kvDel(key: string): Promise<void> {
  if (redis) {
    try {
      await redis.del(key);
      return;
    } catch {
      /* fall back to memory */
    }
  }
  mem.delete(key);
}

export async function kvIncrBy(key: string, amount: number): Promise<number> {
  const delta = Math.round(amount);
  if (redis) {
    try {
      return await redis.incrby(key, delta);
    } catch {
      /* fall back to memory */
    }
  }
  const current = Number(memGet(key) ?? 0);
  const next = current + delta;
  const existing = mem.get(key);
  memSet(key, String(next), existing?.expireAt ? Math.ceil((existing.expireAt - Date.now()) / 1000) : undefined);
  return next;
}

export async function kvExpire(key: string, ttlSeconds: number): Promise<void> {
  if (redis) {
    try {
      await redis.expire(key, ttlSeconds);
      return;
    } catch {
      /* fall back to memory */
    }
  }
  const e = mem.get(key);
  if (e) e.expireAt = Date.now() + ttlSeconds * 1000;
}

// ---------------------------------------------------------------------------
// JSON cache wrapper
// ---------------------------------------------------------------------------

export const ANALYTICS_SUMMARY_KEY = "wos:cache:analytics:summary";

/** Deterministic `wos:cache:{sha}` key from arbitrary parts. */
export function hashKey(parts: Array<string | number>): string {
  const h = createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 40);
  return `wos:cache:${h}`;
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  const raw = await kvGetRaw(key);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function cacheSet<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
  await kvSetRaw(key, JSON.stringify(value), ttlSeconds);
}

export async function cacheDel(key: string): Promise<void> {
  await kvDel(key);
}
