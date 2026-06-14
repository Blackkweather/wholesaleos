import "server-only";
import { kvGetRaw, kvSetRaw, kvDel } from "../cache";

/**
 * Manual halt switch. When engaged (globally or per-category) all guarded
 * sends/calls are blocked. Persisted in Redis with no TTL — stays engaged until
 * explicitly released. Keys: wos:kill:global, wos:kill:{cat}.
 */

export const KILL_CATEGORIES = ["AI", "SMS", "MAIL", "DATA", "EMAIL"] as const;
export type KillCategory = (typeof KILL_CATEGORIES)[number];

const GLOBAL_KEY = "wos:kill:global";
const catKey = (c: KillCategory) => `wos:kill:${c}`;

export class KillSwitchEngagedError extends Error {
  readonly scope: string;
  constructor(scope: string) {
    super(`Killswitch engaged${scope === "global" ? "" : ` for ${scope}`} — action blocked`);
    this.name = "KillSwitchEngagedError";
    this.scope = scope;
  }
}

/** Is the GLOBAL killswitch engaged? */
export async function isEnabled(): Promise<boolean> {
  return (await kvGetRaw(GLOBAL_KEY)) !== null;
}

/** Is THIS category's killswitch engaged? */
export async function isCategoryEnabled(category: KillCategory): Promise<boolean> {
  return (await kvGetRaw(catKey(category))) !== null;
}

/** Engage the killswitch — global when no category is given, else category-only. */
export async function enable(category?: KillCategory): Promise<void> {
  await kvSetRaw(category ? catKey(category) : GLOBAL_KEY, String(Date.now()));
}

/** Release the killswitch — global when no category is given, else category-only. */
export async function disable(category?: KillCategory): Promise<void> {
  await kvDel(category ? catKey(category) : GLOBAL_KEY);
}

/** Convenience: is this category currently halted (global OR category switch)? */
export async function isHalted(category: KillCategory): Promise<boolean> {
  if (await isEnabled()) return true;
  return isCategoryEnabled(category);
}

/** Throw if the category is halted. Used by guarded integrations. */
export async function assertNotHalted(category: KillCategory): Promise<void> {
  if (await isEnabled()) throw new KillSwitchEngagedError("global");
  if (await isCategoryEnabled(category)) throw new KillSwitchEngagedError(category);
}

/** Full status snapshot for the admin surface. */
export async function killswitchStatus(): Promise<{ global: boolean; categories: Record<KillCategory, boolean> }> {
  const global = await isEnabled();
  const entries = await Promise.all(KILL_CATEGORIES.map(async (c) => [c, await isCategoryEnabled(c)] as const));
  const categories = Object.fromEntries(entries) as Record<KillCategory, boolean>;
  return { global, categories };
}
