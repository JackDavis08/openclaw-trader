"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { DashboardData, PriceMap, PerfData, HealthStatus, LogResponse, ScenarioInfo, HealthSnapshot, WeeklyReportScenario, KillSwitchStatus } from "@shared/web/api-types";

export function useDashboardData() {
  return useQuery<DashboardData>({
    queryKey: ["dashboard-data"],
    queryFn: () => api.get("/api/data"),
    refetchInterval: 10_000,
  });
}

export function usePrices() {
  return useQuery<PriceMap>({
    queryKey: ["prices"],
    queryFn: () => api.get("/api/prices"),
    refetchInterval: 5_000,
  });
}

export function usePerformance() {
  return useQuery<PerfData>({
    queryKey: ["performance"],
    queryFn: () => api.get("/api/perf"),
    refetchInterval: 60_000,
  });
}

export function useHealth() {
  return useQuery<HealthStatus>({
    queryKey: ["health"],
    queryFn: () => api.get("/api/health"),
    refetchInterval: 30_000,
    retry: 0,
  });
}

export function useLogs(tail = 200) {
  return useQuery<LogResponse>({
    queryKey: ["logs", tail],
    queryFn: () => api.get(`/api/logs?tail=${tail}`),
    refetchInterval: 5_000,
  });
}

export function useScenarios() {
  return useQuery<ScenarioInfo[]>({
    queryKey: ["scenarios"],
    queryFn: () => api.get("/api/scenarios"),
  });
}

export function useHealthSnapshot() {
  return useQuery<HealthSnapshot>({
    queryKey: ["health-snapshot"],
    queryFn: () => api.get("/api/health/snapshot"),
    refetchInterval: 60_000,
  });
}

export function useKillSwitch() {
  return useQuery<KillSwitchStatus>({
    queryKey: ["kill-switch"],
    queryFn: () => api.get("/api/kill-switch"),
    refetchInterval: 10_000,
  });
}

export function useWeeklyReport() {
  return useQuery<{ reports: WeeklyReportScenario[]; date: string | null }>({
    queryKey: ["weekly-report"],
    queryFn: () => api.get("/api/reports/weekly"),
  });
}
