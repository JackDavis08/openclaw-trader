"use client";

import { useConnectionStatus, type ConnectionState } from "@/hooks/use-connection-status";
import { cn } from "@/lib/utils";
import { Wifi, WifiOff } from "lucide-react";

const stateConfig: Record<
  ConnectionState,
  { label: string; dotClass: string; textClass: string }
> = {
  connected: {
    label: "Connected",
    dotClass: "bg-profit",
    textClass: "text-profit",
  },
  degraded: {
    label: "Unstable",
    dotClass: "bg-yellow-500",
    textClass: "text-yellow-500",
  },
  disconnected: {
    label: "Disconnected",
    dotClass: "bg-loss",
    textClass: "text-loss",
  },
};

export function ConnectionBadge() {
  const { state } = useConnectionStatus();
  const cfg = stateConfig[state];
  const Icon = state === "disconnected" ? WifiOff : Wifi;

  return (
    <div
      className={cn(
        "flex items-center gap-2 text-xs px-2.5 py-1 rounded-full border",
        state === "connected" && "border-profit/30 bg-profit/5",
        state === "degraded" && "border-yellow-500/30 bg-yellow-500/5",
        state === "disconnected" && "border-loss/30 bg-loss/5",
      )}
    >
      <Icon className={cn("w-3 h-3", cfg.textClass)} />
      <span className={cn("w-1.5 h-1.5 rounded-full", cfg.dotClass)} />
      <span className={cfg.textClass}>{cfg.label}</span>
    </div>
  );
}
