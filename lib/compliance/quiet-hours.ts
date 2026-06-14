import "server-only";

/**
 * Quiet-hours enforcement. Outbound SMS/calls are only permitted inside the
 * local contact window (8am–9pm). Pure — testable without a clock dependency.
 */

export const DEFAULT_TIMEZONE = "America/Chicago"; // Houston market default
const WINDOW_START_HOUR = 8; // 8:00 local
const WINDOW_END_HOUR = 21; // 21:00 local (exclusive)

/** Local hour (0–23) for `now` in the given IANA timezone. */
export function localHour(now: Date, timezone: string = DEFAULT_TIMEZONE): number {
  try {
    const s = new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "numeric", hour12: false }).format(now);
    const h = parseInt(s, 10);
    if (!Number.isFinite(h)) return now.getUTCHours();
    return h === 24 ? 0 : h;
  } catch {
    return now.getUTCHours();
  }
}

/** True when `now` is inside the allowed contact window for the timezone. */
export function isWithinSendWindow(now: Date, timezone: string = DEFAULT_TIMEZONE): boolean {
  const h = localHour(now, timezone);
  return h >= WINDOW_START_HOUR && h < WINDOW_END_HOUR;
}
