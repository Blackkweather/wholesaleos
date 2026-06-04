import { MAO_ARV_MULTIPLIER } from "@/constants/config";
import type { Verdict } from "@/types";

export interface CalcInput {
  arv: number;
  repairCost: number;
  offerPrice: number;
  assignmentFee: number;
  closingCost?: number;
}

export interface CalcResult {
  mao: number;
  profit: number;
  marginPct: number;
  strength: number;
  verdict: Verdict;
  headroom: number;
}

/** Pure, instant wholesale deal math (client-safe — no AI, no server). */
export function computeDeal(input: CalcInput): CalcResult {
  const arv = Math.max(0, input.arv || 0);
  const repairs = Math.max(0, input.repairCost || 0);
  const offer = Math.max(0, input.offerPrice || 0);
  const fee = Math.max(0, input.assignmentFee || 0);

  const mao = Math.max(0, Math.round(arv * MAO_ARV_MULTIPLIER - repairs));
  const profit = fee;
  const marginPct = arv > 0 ? Math.round((profit / arv) * 1000) / 10 : 0;
  const headroom = mao - offer;
  const strength = Math.max(
    0,
    Math.min(
      100,
      Math.round(50 + marginPct * 4 + (headroom >= 0 ? 18 : -22)),
    ),
  );
  const verdict: Verdict = strength >= 78 ? "GO" : strength >= 60 ? "CAUTION" : "PASS";

  return { mao, profit, marginPct, strength, verdict, headroom };
}
