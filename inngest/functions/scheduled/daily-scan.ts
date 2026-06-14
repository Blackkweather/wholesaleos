import { inngest } from "../../client";
import { triggerCron } from "./_trigger";

/** Daily lead scan (13:00 UTC) — delegates to the existing cron endpoint. */
export const scheduledDailyScan = inngest.createFunction(
  { id: "scheduled-daily-scan", name: "Scheduled: Daily Scan" },
  { cron: "0 13 * * *" },
  async ({ step }) => step.run("daily-scan", () => triggerCron("/api/cron/daily-scan")),
);
