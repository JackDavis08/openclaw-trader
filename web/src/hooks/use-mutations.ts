"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type {
  ClosePositionRequest,
  ClosePositionResponse,
  AdjustStopLossRequest,
  AdjustStopLossResponse,
  ManualTradeRequest,
  ManualTradeResponse,
  KillSwitchToggleRequest,
  KillSwitchStatus,
} from "@shared/web/api-types";

export function useClosePosition() {
  const qc = useQueryClient();
  return useMutation<ClosePositionResponse, Error, { symbol: string } & ClosePositionRequest>({
    mutationFn: ({ symbol, scenarioId }) =>
      api.post(`/api/positions/${encodeURIComponent(symbol)}/close`, { scenarioId }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["dashboard-data"] });
      void qc.invalidateQueries({ queryKey: ["prices"] });
      void qc.invalidateQueries({ queryKey: ["performance"] });
    },
  });
}

export function useAdjustStopLoss() {
  const qc = useQueryClient();
  return useMutation<AdjustStopLossResponse, Error, { symbol: string } & AdjustStopLossRequest>({
    mutationFn: ({ symbol, scenarioId, stopLoss }) =>
      api.put(`/api/positions/${encodeURIComponent(symbol)}/stop-loss`, { scenarioId, stopLoss }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["dashboard-data"] });
    },
  });
}

export function useManualTrade() {
  const qc = useQueryClient();
  return useMutation<ManualTradeResponse, Error, ManualTradeRequest>({
    mutationFn: (body) => api.post("/api/manual-trade", body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["dashboard-data"] });
      void qc.invalidateQueries({ queryKey: ["prices"] });
    },
  });
}

export function useToggleKillSwitch() {
  const qc = useQueryClient();
  return useMutation<KillSwitchStatus, Error, KillSwitchToggleRequest>({
    mutationFn: (body) => api.put("/api/kill-switch", body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["kill-switch"] });
    },
  });
}
