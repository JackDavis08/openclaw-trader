"use client";

import { usePerformance } from "@/hooks/use-dashboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatPnl, formatUsdt, pnlColor } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { TableSkeleton, KpiSkeleton } from "@/components/dashboard/loading-skeleton";
import type { RiskMetrics } from "@shared/web/api-types";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
} from "recharts";

function MetricsCards({ m }: { m: RiskMetrics }) {
  const cards = [
    { label: "Sharpe Ratio", value: m.sharpeRatio.toFixed(2), good: m.sharpeRatio > 1 },
    { label: "Sortino Ratio", value: m.sortinoRatio.toFixed(2), good: m.sortinoRatio > 1.5 },
    { label: "Calmar Ratio", value: m.calmarRatio.toFixed(2), good: m.calmarRatio > 1 },
    { label: "Max Drawdown", value: `${m.maxDrawdownPct.toFixed(1)}%`, good: m.maxDrawdownPct < 10 },
    { label: "Profit Factor", value: m.profitFactor.toFixed(2), good: m.profitFactor > 1.5 },
    { label: "Win Rate", value: `${(m.winRate * 100).toFixed(1)}%`, good: m.winRate > 0.5 },
    { label: "Avg Win", value: `${m.avgWinPercent.toFixed(2)}%`, good: true },
    { label: "Avg Loss", value: `${m.avgLossPercent.toFixed(2)}%`, good: false },
    { label: "Win/Loss Ratio", value: m.winLossRatio.toFixed(2), good: m.winLossRatio > 1 },
    { label: "Expectancy", value: formatUsdt(m.expectancy), good: m.expectancy > 0 },
    { label: "Total Return", value: `${m.totalReturnPercent.toFixed(2)}%`, good: m.totalReturnPercent > 0 },
    { label: "Best Trade", value: `${m.bestTradePct.toFixed(2)}%`, good: true },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
      {cards.map((c) => (
        <Card key={c.label} className="bg-card border-border">
          <CardContent className="pt-3 pb-2 px-3">
            <div className="text-[11px] text-muted-foreground mb-1">{c.label}</div>
            <div className={cn(
              "text-lg font-bold font-mono",
              c.good ? "text-profit" : "text-loss",
            )}>
              {c.value}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default function PerformancePage() {
  const { data, isLoading } = usePerformance();

  if (isLoading) {
    return (
      <div className="space-y-4">
        <KpiSkeleton />
        <TableSkeleton rows={8} />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        No performance data available
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Risk Metrics Cards */}
      {data.riskMetrics && <MetricsCards m={data.riskMetrics} />}

      {/* Daily P&L Bar Chart */}
      {data.byDay.length > 0 && (
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Daily P&L
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-3">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={data.byDay} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                <XAxis
                  dataKey="date"
                  tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }}
                  axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: number) => `$${v.toFixed(0)}`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    fontSize: "12px",
                    color: "hsl(var(--foreground))",
                  }}
                  formatter={(value) => [`$${Number(value).toFixed(2)}`, "P&L"]}
                />
                <ReferenceLine y={0} stroke="rgba(255,255,255,0.1)" />
                <Bar dataKey="pnl" radius={[3, 3, 0, 0]}>
                  {data.byDay.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={entry.pnl >= 0 ? "#34d399" : "#f87171"}
                      opacity={0.8}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* By Symbol */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Performance by Symbol
          </CardTitle>
        </CardHeader>
        <CardContent className="pb-2">
          {data.bySymbol.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground text-sm">
              No trade data yet
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead className="text-xs">Symbol</TableHead>
                    <TableHead className="text-xs text-right">Trades</TableHead>
                    <TableHead className="text-xs text-right">Wins</TableHead>
                    <TableHead className="text-xs text-right">Losses</TableHead>
                    <TableHead className="text-xs text-right">Win Rate</TableHead>
                    <TableHead className="text-xs text-right">Total P&L</TableHead>
                    <TableHead className="text-xs text-right">Avg P&L</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.bySymbol.map((s) => (
                    <TableRow key={s.symbol} className="border-border hover:bg-accent/30">
                      <TableCell className="font-mono text-xs py-2">
                        {s.symbol.replace("USDT", "")}
                      </TableCell>
                      <TableCell className="text-xs text-right py-2">{s.trades}</TableCell>
                      <TableCell className="text-xs text-right py-2 text-profit">{s.wins}</TableCell>
                      <TableCell className="text-xs text-right py-2 text-loss">{s.losses}</TableCell>
                      <TableCell className="text-xs text-right py-2">
                        {(s.winRate * 100).toFixed(1)}%
                      </TableCell>
                      <TableCell className={cn("font-mono text-xs text-right py-2 font-medium", pnlColor(s.totalPnl))}>
                        {formatPnl(s.totalPnl)}
                      </TableCell>
                      <TableCell className={cn("font-mono text-xs text-right py-2", pnlColor(s.avgPnl))}>
                        {formatUsdt(s.avgPnl)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* By Day Table */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Daily Breakdown
          </CardTitle>
        </CardHeader>
        <CardContent className="pb-2">
          {data.byDay.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground text-sm">
              No daily data yet
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead className="text-xs">Date</TableHead>
                    <TableHead className="text-xs text-right">Trades</TableHead>
                    <TableHead className="text-xs text-right">P&L</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...data.byDay].reverse().map((d) => (
                    <TableRow key={d.date} className="border-border hover:bg-accent/30">
                      <TableCell className="font-mono text-xs py-2">{d.date}</TableCell>
                      <TableCell className="text-xs text-right py-2">{d.trades}</TableCell>
                      <TableCell className={cn("font-mono text-xs text-right py-2 font-medium", pnlColor(d.pnl))}>
                        {formatPnl(d.pnl)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
