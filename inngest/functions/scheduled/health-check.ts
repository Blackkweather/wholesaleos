import { inngest } from "../../client";
import { getAIHealth } from "@/lib/ai/gateway";
import { recalibrateThreshold } from "@/lib/surfacing/engine";
import { auditSample } from "@/lib/surfacing/sampling";

/**
 * Every 15 minutes: snapshot AI provider health, recalibrate the surfacing
 * threshold to hold the attention budget, and audit-sample suppressed items so
 * the engine's false negatives stay observable.
 */
export const scheduledHealthCheck = inngest.createFunction(
  { id: "scheduled-health-check", name: "Scheduled: Health Check" },
  { cron: "*/15 * * * *" },
  async ({ step }) => {
    const providers = await step.run("ai-health", async () => getAIHealth().map((h) => ({ id: h.id, status: h.status })));
    const threshold = await step.run("recalibrate", () => recalibrateThreshold());
    const sampled = await step.run("audit-sample", () => auditSample(3));
    return { providers, threshold, sampled: sampled.length };
  },
);
