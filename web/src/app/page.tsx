"use client";

import { useDashboardData, usePrices } from "@/hooks/use-dashboard";
import { KpiCards } from "@/components/dashboard/kpi-cards";
import { EquityChart } from "@/components/dashboard/equity-chart";
import { PositionCards } from "@/components/dashboard/position-cards";
import { RecentTrades } from "@/components/dashboard/recent-trades";
import {
  KpiSkeleton,
  ChartSkeleton,
  TableSkeleton,
} from "@/components/dashboard/loading-skeleton";

export default function DashboardPage() {
  const { data, isLoading, isError } = useDashboardData();
  const { data: prices } = usePrices();

  if (isError) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        Failed to connect to backend. Is the dashboard server running?
      </div>
    );
  }

  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <KpiSkeleton />
        <ChartSkeleton />
        <TableSkeleton />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <KpiCards accounts={data.accounts} />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <EquityChart data={data.equityCurve} />
        <PositionCards positions={data.positions} prices={prices ?? {}} now={data.lastUpdate} />
      </div>

      <RecentTrades trades={data.recentTrades} limit={15} />
    </div>
  );
}
