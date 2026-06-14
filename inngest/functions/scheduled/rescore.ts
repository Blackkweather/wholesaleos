import { inngest } from "../../client";
import { triggerCron } from "./_trigger";

/** Re-score active deals (14:00 UTC) — delegates to the existing cron endpoint. */
export const scheduledRescore = inngest.createFunction(
  { id: "scheduled-rescore", name: "Scheduled: Rescore" },
  { cron: "0 14 * * *" },
  async ({ step }) => step.run("rescore", () => triggerCron("/api/cron/rescore")),
);
