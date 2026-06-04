/**
 * Domain display config (deal types, pipeline stages) and deal-math constants.
 * Single-user app — no tiers, plans, or usage limits. Client-safe.
 */

export const DEAL_TYPES = [
  "PROBATE",
  "FORECLOSURE",
  "VACANT",
  "TAX_DELINQUENT",
  "ABSENTEE",
  "INHERITED",
  "DIVORCE",
  "CODE_VIOLATION",
  "OTHER",
] as const;
export type DealTypeKey = (typeof DEAL_TYPES)[number];

export const DEAL_TYPE_META: Record<
  DealTypeKey,
  { label: string; short: string }
> = {
  PROBATE: { label: "Probate", short: "Estate in probate court" },
  FORECLOSURE: { label: "Foreclosure", short: "Pre-foreclosure / NOD filed" },
  VACANT: { label: "Vacant", short: "Empty / abandoned property" },
  TAX_DELINQUENT: { label: "Tax Delinquent", short: "Behind on property taxes" },
  ABSENTEE: { label: "Absentee Owner", short: "Owner lives out of area" },
  INHERITED: { label: "Inherited", short: "Recently inherited, wants out" },
  DIVORCE: { label: "Divorce", short: "Divorce-driven sale" },
  CODE_VIOLATION: { label: "Code Violation", short: "Active city code issues" },
  OTHER: { label: "Other", short: "Other motivated seller" },
};

export const STAGES = [
  "FOUND",
  "VERIFIED",
  "CONTACTED",
  "RESPONSE_RECEIVED",
  "INTERESTED",
  "APPOINTMENT_SCHEDULED",
  "OFFER_SENT",
  "NEGOTIATING",
  "CONTRACT_SIGNED",
  "ASSIGNED",
  "CLOSED",
  "DEAD",
] as const;
export type StageKey = (typeof STAGES)[number];

export const STAGE_META: Record<
  StageKey,
  {
    label: string;
    token: "info" | "warning" | "brand" | "danger" | "muted";
    description: string;
  }
> = {
  FOUND: { label: "Found", token: "info", description: "New, not yet verified" },
  VERIFIED: { label: "Verified", token: "info", description: "Real address + owner confirmed" },
  CONTACTED: { label: "Contacted", token: "warning", description: "Outreach sent" },
  RESPONSE_RECEIVED: { label: "Responded", token: "warning", description: "Seller replied" },
  INTERESTED: { label: "Interested", token: "brand", description: "Wants to talk numbers" },
  APPOINTMENT_SCHEDULED: { label: "Appointment", token: "brand", description: "Call/visit booked" },
  OFFER_SENT: { label: "Offer Sent", token: "warning", description: "Offer presented" },
  NEGOTIATING: { label: "Negotiating", token: "warning", description: "Working the price" },
  CONTRACT_SIGNED: { label: "Contract Signed", token: "brand", description: "Under contract" },
  ASSIGNED: { label: "Assigned", token: "brand", description: "Sold to a buyer" },
  CLOSED: { label: "Closed", token: "brand", description: "Funded — fee paid" },
  DEAD: { label: "Dead", token: "muted", description: "No deal" },
};

/** Maps each stage to the lifecycle timestamp it sets when first entered. */
export const STAGE_TIMESTAMP: Partial<Record<StageKey, string>> = {
  CONTACTED: "dateContacted",
  RESPONSE_RECEIVED: "firstResponseDate",
  APPOINTMENT_SCHEDULED: "appointmentDate",
  OFFER_SENT: "offerDate",
  CONTRACT_SIGNED: "contractDate",
  ASSIGNED: "assignmentDate",
  CLOSED: "closingDate",
  DEAD: "deadDate",
};

/** Funnel order index for each stage — used for analytics & "furthest reached". */
export const STAGE_ORDER: Record<StageKey, number> = {
  FOUND: 0, VERIFIED: 1, CONTACTED: 2, RESPONSE_RECEIVED: 3, INTERESTED: 4,
  APPOINTMENT_SCHEDULED: 5, OFFER_SENT: 6, NEGOTIATING: 7, CONTRACT_SIGNED: 8,
  ASSIGNED: 9, CLOSED: 10, DEAD: -1,
};

/** Pipeline stages shown as kanban columns (excludes DEAD by default). */
export const KANBAN_STAGES: StageKey[] = [
  "FOUND",
  "VERIFIED",
  "CONTACTED",
  "RESPONSE_RECEIVED",
  "INTERESTED",
  "APPOINTMENT_SCHEDULED",
  "OFFER_SENT",
  "NEGOTIATING",
  "CONTRACT_SIGNED",
  "ASSIGNED",
  "CLOSED",
];

/** MAO rule of thumb used across the calculator + scoring. */
export const MAO_ARV_MULTIPLIER = 0.7;
export const DEFAULT_ASSIGNMENT_FEE = 10_000;
