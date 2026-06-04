"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import type {
  BuyerView,
  NewBuyerInput,
  BuyerPitch,
  ScoredBuyer,
  BuyerScanInput,
} from "@/types";

const buyersKey = ["buyers"] as const;

export function useBuyers() {
  return useQuery({
    queryKey: buyersKey,
    queryFn: () =>
      apiFetch<{ buyers: BuyerView[] }>("/api/buyers").then((d) => d.buyers),
  });
}

export function useAddBuyer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: NewBuyerInput) =>
      apiFetch<{ buyer: BuyerView }>("/api/buyers", {
        method: "POST",
        body: JSON.stringify(input),
      }).then((d) => d.buyer),
    onSuccess: () => qc.invalidateQueries({ queryKey: buyersKey }),
  });
}

export function useDeleteBuyer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ deleted: boolean }>(`/api/buyers/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: buyersKey }),
  });
}

export function useGeneratePitch() {
  return useMutation({
    mutationFn: (dealId: string) =>
      apiFetch<{ pitch: BuyerPitch }>(`/api/deals/${dealId}/pitch`, {
        method: "POST",
      }).then((d) => d.pitch),
  });
}

export function useScanBuyers() {
  return useMutation({
    mutationFn: (input: BuyerScanInput) =>
      apiFetch<{ buyers: ScoredBuyer[]; live: boolean }>("/api/buyers/scan", {
        method: "POST",
        body: JSON.stringify(input),
      }),
  });
}

export function useSaveFoundBuyers() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (found: ScoredBuyer[]) =>
      apiFetch<{ buyers: BuyerView[] }>("/api/buyers", {
        method: "POST",
        body: JSON.stringify({ found }),
      }).then((d) => d.buyers),
    onSuccess: () => qc.invalidateQueries({ queryKey: buyersKey }),
  });
}
