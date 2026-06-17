import { smoke } from "./_smoke";
import { leadLifecycle } from "./lead-lifecycle";
import { leadQualified } from "./lead-qualified";
import { sellerReply } from "./seller-reply";
import { disposition } from "./disposition";
import { closedDeal } from "./closed-deal";
import { surfaceResolved } from "./surface-resolved";
import { scheduledDailyScan } from "./scheduled/daily-scan";
import { scheduledRescore } from "./scheduled/rescore";
import { scheduledSkipTrace } from "./scheduled/skip-trace";
import { scheduledHealthCheck } from "./scheduled/health-check";
import { scheduledWeeklyBriefing } from "./scheduled/weekly-briefing";
import { scheduledDailyBriefing } from "./scheduled/daily-briefing";

/** Every Inngest function served at /api/inngest. */
export const functions = [
  smoke,
  leadLifecycle,
  leadQualified,
  sellerReply,
  disposition,
  closedDeal,
  surfaceResolved,
  scheduledDailyScan,
  scheduledRescore,
  scheduledSkipTrace,
  scheduledHealthCheck,
  scheduledWeeklyBriefing,
  scheduledDailyBriefing,
];
