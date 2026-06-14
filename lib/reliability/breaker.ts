import "server-only";
import { kvGetRaw, kvSetRaw } from "../cache";

/**
 * Circuit breaker per external provider. State persisted at wos:breaker:{provider}.
 *
 *   CLOSED     — requests flow; failures are counted within a 60s window
 *   OPEN       — 5 failures in the window trips it; requests blocked for 30s
 *   HALF_OPEN  — after the cooldown, one trial request is allowed
 *                 success → CLOSED, failure → OPEN again
 */

export type BreakerStatus = "CLOSED" | "OPEN" | "HALF_OPEN";

const FAILURE_THRESHOLD = 5;
const WINDOW_MS = 60_000;
const OPEN_MS = 30_000;
const STATE_TTL_SECONDS = 2 * 60 * 60;

interface BreakerState {
  failures: number;
  windowStart: number;
  openUntil: number | null;
}

const stateKey = (provider: string) => `wos:breaker:${provider}`;

export class BreakerOpenError extends Error {
  readonly provider: string;
  constructor(provider: string) {
    super(`Circuit breaker open for ${provider}`);
    this.name = "BreakerOpenError";
    this.provider = provider;
  }
}

async function readState(provider: string): Promise<BreakerState> {
  const raw = await kvGetRaw(stateKey(provider));
  if (!raw) return { failures: 0, windowStart: Date.now(), openUntil: null };
  try {
    return JSON.parse(raw) as BreakerState;
  } catch {
    return { failures: 0, windowStart: Date.now(), openUntil: null };
  }
}

async function writeState(provider: string, state: BreakerState): Promise<void> {
  await kvSetRaw(stateKey(provider), JSON.stringify(state), STATE_TTL_SECONDS);
}

function deriveStatus(state: BreakerState, now: number): BreakerStatus {
  if (state.openUntil !== null) {
    return now < state.openUntil ? "OPEN" : "HALF_OPEN";
  }
  return "CLOSED";
}

export async function getStatus(provider: string): Promise<BreakerStatus> {
  return deriveStatus(await readState(provider), Date.now());
}

/** May a request proceed? True for CLOSED and HALF_OPEN (trial), false for OPEN. */
export async function canRequest(provider: string): Promise<boolean> {
  return (await getStatus(provider)) !== "OPEN";
}

export async function recordSuccess(provider: string): Promise<void> {
  // Any success fully closes the breaker and resets the window.
  await writeState(provider, { failures: 0, windowStart: Date.now(), openUntil: null });
}

export async function recordFailure(provider: string): Promise<void> {
  const now = Date.now();
  const state = await readState(provider);
  const status = deriveStatus(state, now);

  // A failure during the half-open trial reopens immediately.
  if (status === "HALF_OPEN") {
    await writeState(provider, { failures: 0, windowStart: now, openUntil: now + OPEN_MS });
    return;
  }

  // Roll the counting window.
  if (now - state.windowStart > WINDOW_MS) {
    state.failures = 0;
    state.windowStart = now;
  }
  state.failures += 1;

  if (state.failures >= FAILURE_THRESHOLD) {
    await writeState(provider, { failures: state.failures, windowStart: state.windowStart, openUntil: now + OPEN_MS });
    return;
  }
  await writeState(provider, { ...state, openUntil: null });
}

/**
 * Run `fn` under the breaker. Throws BreakerOpenError when open; records the
 * outcome otherwise. Re-throws the underlying error after recording a failure.
 */
export async function withBreaker<T>(provider: string, fn: () => Promise<T>): Promise<T> {
  if (!(await canRequest(provider))) throw new BreakerOpenError(provider);
  try {
    const result = await fn();
    await recordSuccess(provider);
    return result;
  } catch (e) {
    await recordFailure(provider);
    throw e;
  }
}
