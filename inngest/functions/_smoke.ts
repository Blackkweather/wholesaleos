import { inngest } from "../client";
import { getAIHealth } from "@/lib/ai/gateway";
import { captureDeadLetter } from "../dead-letter";

/**
 * Smoke function — proves the Inngest pipeline is registered and executing, and
 * surfaces the AI gateway health snapshot. Triggered by the `app/ping` event.
 *
 * onFailure demonstrates the dead-letter pattern: when retries are exhausted the
 * event + error are captured to the DeadLetter table for replay.
 */
export const smoke = inngest.createFunction(
  {
    id: "smoke-ping",
    name: "Smoke: Ping",
    onFailure: async ({ event, error }) => {
      await captureDeadLetter({
        event: "app/ping",
        payload: event.data?.event?.data ?? {},
        error: error?.message ?? "unknown error",
      });
    },
  },
  { event: "app/ping" },
  async ({ event, step }) => {
    const providers = await step.run("ai-health", async () =>
      getAIHealth().map((h) => ({ id: h.id, status: h.status })),
    );
    return {
      ok: true,
      source: event.data.source ?? "unknown",
      receivedAt: new Date().toISOString(),
      providers,
    };
  },
);
