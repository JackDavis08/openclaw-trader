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
  ScenarioToggleRequest,
  ScenarioToggleResponse,
  ConfigWriteResponse,
  BacktestRequest,
  BacktestResponse,
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

export function useToggleScenario() {
  const qc = useQueryClient();
  return useMutation<ScenarioToggleResponse, Error, { id: string } & ScenarioToggleRequest>({
    mutationFn: ({ id, enabled }) =>
      api.put(`/api/scenarios/${encodeURIComponent(id)}/toggle`, { enabled }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["strategies"] });
      void qc.invalidateQueries({ queryKey: ["scenarios"] });
    },
  });
}

export function useSaveConfig() {
  const qc = useQueryClient();
  return useMutation<ConfigWriteResponse, Error, { file: string; content: string }>({
    mutationFn: ({ file, content }) =>
      api.put(`/api/config/raw/${file}`, { content }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["config-raw"] });
      void qc.invalidateQueries({ queryKey: ["strategies"] });
      void qc.invalidateQueries({ queryKey: ["scenarios"] });
    },
  });
}

export function useRunBacktest() {
  const qc = useQueryClient();
  return useMutation<BacktestResponse, Error, BacktestRequest>({
    mutationFn: (body) => api.post("/api/backtest/run", body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["backtest-results"] });
    },
  });
}
