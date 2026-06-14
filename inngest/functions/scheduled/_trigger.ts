/**
 * Triggers an existing internal cron endpoint (reusing all of its logic) with
 * the CRON_SECRET. Scheduled Inngest functions delegate here so there is a
 * single source of truth for the scan/rescore/skip-trace work.
 */
export async function triggerCron(path: string): Promise<{ status: number; ok: boolean }> {
  const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const secret = process.env.CRON_SECRET;
  const res = await fetch(`${base}${path}`, {
    method: "GET",
    headers: secret ? { authorization: `Bearer ${secret}` } : {},
  });
  return { status: res.status, ok: res.ok };
}
