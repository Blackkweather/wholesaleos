"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import type {
  DealView,
  ScoredDeal,
  ScanInput,
  NewDealInput,
  SequenceMessage,
  DealAnalysis,
} from "@/types";
import type { DealPatch } from "@/lib/data/deals";

export const dealsKey = ["deals"] as const;

export function useDeals() {
  return useQuery({
    queryKey: dealsKey,
    queryFn: () =>
      apiFetch<{ deals: DealView[] }>("/api/deals").then((d) => d.deals),
  });
}

export function useDeal(id: string) {
  return useQuery({
    queryKey: ["deal", id],
    queryFn: () =>
      apiFetch<{ deal: DealView }>(`/api/deals/${id}`).then((d) => d.deal),
    enabled: Boolean(id),
  });
}

export function useScan() {
  return useMutation({
    mutationFn: (input: ScanInput) =>
      apiFetch<{ deals: ScoredDeal[]; live: boolean }>("/api/deals/scan", {
        method: "POST",
        body: JSON.stringify(input),
      }),
  });
}

export function useSaveDeals() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (deals: ScoredDeal[]) =>
      apiFetch<{ deals: DealView[] }>("/api/deals", {
        method: "POST",
        body: JSON.stringify({ deals }),
      }).then((d) => d.deals),
    onSuccess: () => qc.invalidateQueries({ queryKey: dealsKey }),
  });
}

export function useAddManualDeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (manual: NewDealInput) =>
      apiFetch<{ deals: DealView[] }>("/api/deals", {
        method: "POST",
        body: JSON.stringify({ manual }),
      }).then((d) => d.deals[0]),
    onSuccess: () => qc.invalidateQueries({ queryKey: dealsKey }),
  });
}

export function useUpdateDeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: DealPatch }) =>
      apiFetch<{ deal: DealView }>(`/api/deals/${id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      }).then((d) => d.deal),
    onSuccess: () => qc.invalidateQueries({ queryKey: dealsKey }),
  });
}

export function useDeleteDeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ deleted: boolean }>(`/api/deals/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: dealsKey }),
  });
}

export function useGenerateScript() {
  return useMutation({
    mutationFn: ({
      id,
      type,
      tone,
    }: {
      id: string;
      type: string;
      tone?: string;
    }) =>
      apiFetch<{ content: string }>(`/api/deals/${id}/script`, {
        method: "POST",
        body: JSON.stringify({ type, tone }),
      }).then((d) => d.content),
  });
}

export function useGenerateSms() {
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ messages: SequenceMessage[] }>(`/api/deals/${id}/sms`, {
        method: "POST",
      }).then((d) => d.messages),
  });
}

export function useAnalyzeDeal() {
  return useMutation({
    mutationFn: ({ id, withComps }: { id: string; withComps?: boolean }) =>
      apiFetch<{ analysis: DealAnalysis }>(`/api/deals/${id}/analyze`, {
        method: "POST",
        body: JSON.stringify({ withComps }),
      }).then((d) => d.analysis),
  });
}
