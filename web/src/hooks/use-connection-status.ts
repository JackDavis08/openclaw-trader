"use client";

import { useMemo } from "react";
import { useHealth } from "./use-dashboard";

export type ConnectionState = "connected" | "degraded" | "disconnected";

export function useConnectionStatus(): {
  state: ConnectionState;
} {
  const { failureCount, dataUpdatedAt } = useHealth();

  const state = useMemo<ConnectionState>(() => {
    if (failureCount >= 3) return "disconnected";
    if (failureCount >= 1) return "degraded";
    if (dataUpdatedAt > 0) return "connected";
    return "connected";
  }, [failureCount, dataUpdatedAt]);

  return { state };
}
