import { inngest } from "../../client";
import { triggerCron } from "./_trigger";

/** Batched skip-trace enrichment (17:00 UTC) — delegates to the existing cron endpoint. */
export const scheduledSkipTrace = inngest.createFunction(
  { id: "scheduled-skip-trace", name: "Scheduled: Skip Trace" },
  { cron: "0 17 * * *" },
  async ({ step }) => step.run("skip-trace", () => triggerCron("/api/cron/skip-trace")),
);
