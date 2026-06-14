import type {
  Deal,
  Stage,
  DealType,
  Script,
  SMS,
  Activity,
  Buyer,
  Market,
  ScriptType,
} from "@prisma/client";

/** Consistent API envelope returned by every route. */
export type ApiResponse<T> =
  | { data: T; error: null }
  | { data: null; error: string };

export function apiOk<T>(data: T): { data: T; error: null } {
  return { data, error: null };
}
export function apiError(error: string): { data: null; error: string } {
  return { data: null, error };
}

export type Verdict = "GO" | "CAUTION" | "PASS";

/** Input to a deal scan. */
export interface ScanInput {
  city: string;
  state?: string;
  zipCode?: string;
  minPrice?: number;
  maxPrice?: number;
  dealTypes?: DealType[];
  limit?: number;
}

/** An AI-discovered/scored deal (pre-persistence shape). */
export interface ScoredDeal {
  address: string;
  city: string;
  state?: string;
  zipCode?: string;
  situation: string;
  dealType: DealType;
  source: string;
  sourceUrl?: string;
  ownerName?: string;
  ownerPhone?: string;
  ownerEmail?: string;
  arv?: number;
  listPrice?: number;
  repairCost?: number;
  offerPrice?: number;
  assignmentFee?: number;
  profit?: number;
  score: number;
  motivationScore?: number;
  profitScore?: number;
  contactDifficulty?: number;
  verdict?: Verdict;
  aiSummary?: string;
  tags?: string[];
}

export interface Comp {
  address: string;
  soldPrice?: number;
  beds?: number;
  baths?: number;
  sqft?: number;
  distanceMi?: number;
  soldDate?: string;
  url?: string;
}

export interface DealAnalysis {
  arv: number;
  repairCost: number;
  offerPrice: number;
  mao: number;
  assignmentFee: number;
  profit: number;
  marginPct: number;
  strength: number; // 0-100
  verdict: Verdict;
  reasoning: string;
  comps?: Comp[];
  negotiation?: string;
  counters?: { ifTheyCounter: string; youRespond: string }[];
}

export interface BriefingAction {
  id: string;
  kind: "sms" | "call" | "review" | "follow_up";
  dealId?: string;
  title: string;
  subtitle?: string;
  body?: string;
  phone?: string;
}

export interface Briefing {
  date: string;
  greeting: string;
  insight: string;
  newDeals: number;
  followUpsDue: number;
  hotDeals: number;
  stats: { label: string; value: string; tone?: "brand" | "warning" | "info" }[];
  actions: BriefingAction[];
}

export interface ScriptRequest {
  type: ScriptType;
  tone?: "warm" | "direct" | "empathetic" | "professional";
}

/** Lightweight context passed to AI generation functions. */
export interface DealContext {
  address: string;
  city?: string;
  state?: string;
  situation?: string;
  dealType?: DealType;
  ownerName?: string;
  arv?: number;
  listPrice?: number;
  offerPrice?: number;
  repairCost?: number;
  assignmentFee?: number;
  profit?: number;
}

export interface SequenceMessage {
  step: number;
  day: number;
  label: string;
  message: string;
}

export interface ReplyAnalysis {
  sentiment: "interested" | "not_interested" | "question" | "hostile" | "neutral";
  confidence: number;
  summary: string;
  suggestedReply: string;
  markHot: boolean;
  stopSequence: boolean;
}

export interface BuyerPitch {
  subject: string;
  body: string;
}

/** Canonical client-facing deal shape (DB rows and demo store both map to this). */
export interface DealView {
  id: string;
  address: string;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  situation: string | null;
  dealType: DealType;
  stage: Stage;
  score: number | null;
  motivationScore: number | null;
  arv: number | null;
  listPrice: number | null;
  offerPrice: number | null;
  repairCost: number | null;
  assignmentFee: number | null;
  profit: number | null;
  expectedProfit: number | null;
  actualProfit: number | null;
  verdict: string | null;
  ownerName: string | null;
  ownerPhone: string | null;
  ownerEmail: string | null;
  source: string | null;
  sourceUrl: string | null;
  aiSummary: string | null;
  tags: string[];
  notes: string | null;
  hot: boolean;
  optedOut: boolean;
  autoActBlocked: boolean;
  nextFollowUpAt: string | null;
  // Lifecycle timestamps (ISO strings)
  dateContacted: string | null;
  firstResponseDate: string | null;
  appointmentDate: string | null;
  offerDate: string | null;
  contractDate: string | null;
  assignmentDate: string | null;
  closingDate: string | null;
  deadDate: string | null;
  followUpStep: number;
  lastContactAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BuyerView {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  website: string | null;
  buyerType: string | null;
  cities: string[];
  minPrice: number | null;
  maxPrice: number | null;
  dealTypes: string[];
  tags: string[];
  createdAt: string;
}

export interface NewBuyerInput {
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  website?: string;
  buyerType?: string;
  cities?: string[];
  minPrice?: number;
  maxPrice?: number;
  tags?: string[];
  notes?: string;
}

/** An AI-discovered cash buyer (pre-save shape). */
export interface ScoredBuyer {
  name: string;
  company?: string;
  email?: string;
  phone?: string;
  website?: string;
  cities: string[];
  minPrice?: number;
  maxPrice?: number;
  buyerType?: string;
  evidence?: string;
  source?: string;
  sourceUrl?: string;
}

export interface BuyerScanInput {
  city: string;
  state?: string;
  limit?: number;
}

export interface NewDealInput {
  address: string;
  city?: string;
  state?: string;
  situation?: string;
  dealType?: DealType;
  arv?: number;
  repairCost?: number;
  offerPrice?: number;
  ownerName?: string;
  ownerPhone?: string;
  ownerEmail?: string;
  notes?: string;
}

/** Map Prisma Date fields to strings for client serialization. */
export type Serialized<T> = {
  [K in keyof T]: T[K] extends Date
    ? string
    : T[K] extends Date | null
      ? string | null
      : T[K];
};

export type DealDTO = Serialized<Deal>;
export type ScriptDTO = Serialized<Script>;
export type SMSDTO = Serialized<SMS>;
export type ActivityDTO = Serialized<Activity>;
export type BuyerDTO = Serialized<Buyer>;
export type MarketDTO = Serialized<Market>;

export type {
  Deal,
  Stage,
  DealType,
  Script,
  SMS,
  Activity,
  Buyer,
  Market,
  ScriptType,
};
