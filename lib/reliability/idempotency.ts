import "server-only";
import { kvGetRaw, kvSetRaw } from "../cache";

/**
 * Idempotency guard. The first call for a key runs `fn` and stores its result
 * for 24h; subsequent calls with the same key return the stored result without
 * re-executing — preventing duplicate sends/charges on retries.
 */

const TTL_SECONDS = 24 * 60 * 60;
const idemKey = (key: string) => `wos:idem:${key}`;

interface StoredResult<T> {
  s: "done";
  r: T;
}

export async function withIdempotency<T>(key: string, fn: () => Promise<T>, ttlSeconds: number = TTL_SECONDS): Promise<T> {
  const k = idemKey(key);

  const existing = await kvGetRaw(k);
  if (existing !== null) {
    try {
      return (JSON.parse(existing) as StoredResult<T>).r;
    } catch {
      /* corrupt entry — fall through and recompute */
    }
  }

  const result = await fn();
  await kvSetRaw(k, JSON.stringify({ s: "done", r: result } satisfies StoredResult<T>), ttlSeconds);
  return result;
}

/** Has a result already been recorded for this key? */
export async function isProcessed(key: string): Promise<boolean> {
  return (await kvGetRaw(idemKey(key))) !== null;
}
