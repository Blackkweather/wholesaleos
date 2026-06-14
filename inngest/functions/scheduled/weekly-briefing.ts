import { inngest } from "../../client";
import { generateBriefing } from "@/lib/briefing/weekly";

/** Weekly executive briefing — Monday 12:00 UTC. */
export const scheduledWeeklyBriefing = inngest.createFunction(
  { id: "scheduled-weekly-briefing", name: "Scheduled: Weekly Briefing" },
  { cron: "0 12 * * 1" },
  async ({ step }) => {
    const briefing = await step.run("generate", () => generateBriefing("weekly"));
    return { headline: briefing.headline };
  },
);
