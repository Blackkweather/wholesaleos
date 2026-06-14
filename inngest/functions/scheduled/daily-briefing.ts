import { inngest } from "../../client";
import { generateBriefing } from "@/lib/briefing/weekly";

/** Daily executive briefing — 11:00 UTC (before the morning scan results land). */
export const scheduledDailyBriefing = inngest.createFunction(
  { id: "scheduled-daily-briefing", name: "Scheduled: Daily Briefing" },
  { cron: "0 11 * * *" },
  async ({ step }) => {
    const briefing = await step.run("generate", () => generateBriefing("daily"));
    return { headline: briefing.headline };
  },
);
