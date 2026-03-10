"use client";

import { useWeeklyReport } from "@/hooks/use-dashboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatPnl, formatUsdt, pnlColor } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { TableSkeleton } from "@/components/dashboard/loading-skeleton";
import { FileText } from "lucide-react";

export default function ReportsPage() {
  const { data, isLoading } = useWeeklyReport();

  if (isLoading) return <TableSkeleton rows={6} />;

  if (!data || data.reports.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-muted-foreground gap-3">
        <FileText className="w-8 h-8" />
        <p className="text-sm">No weekly reports available</p>
        <p className="text-xs">
          Run <code className="bg-muted px-1.5 py-0.5 rounded">npm run report:weekly</code> to generate one
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {data.date && (
        <div className="text-sm text-muted-foreground">
          Weekly report: <span className="font-mono text-foreground">{data.date}</span>
        </div>
      )}

      {data.reports.map((report) => (
        <Card key={report.scenarioId} className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              {report.scenarioName}
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-neutral-accent/40 text-neutral-accent">
                {report.strategyName}
              </Badge>
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-muted-foreground/40 text-muted-foreground">
                {report.market} {report.leverage !== "None" ? `${report.leverage}` : ""}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-3 space-y-4">
            {/* Account Summary */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <div className="text-[11px] text-muted-foreground">Initial</div>
                <div className="font-mono text-sm">{formatUsdt(report.account.initialUsdt)}</div>
              </div>
              <div>
                <div className="text-[11px] text-muted-foreground">Current</div>
                <div className="font-mono text-sm">{formatUsdt(report.account.currentUsdt)}</div>
              </div>
              <div>
                <div className="text-[11px] text-muted-foreground">P&L</div>
                <div className={cn("font-mono text-sm font-medium", pnlColor(report.account.totalPnl))}>
                  {formatPnl(report.account.totalPnl)}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-muted-foreground">Return</div>
                <div className={cn("font-mono text-sm font-medium", pnlColor(report.account.totalPnlPercent))}>
                  {report.account.totalPnlPercent > 0 ? "+" : ""}{report.account.totalPnlPercent.toFixed(2)}%
                </div>
              </div>
            </div>

            {/* Trade Stats */}
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 text-xs">
              <Stat label="Trades" value={String(report.stats.totalTrades)} />
              <Stat label="Wins" value={String(report.stats.wins)} className="text-profit" />
              <Stat label="Losses" value={String(report.stats.losses)} className="text-loss" />
              <Stat label="Win Rate" value={`${(report.stats.winRate * 100).toFixed(1)}%`} />
              <Stat label="Best Symbol" value={report.stats.bestSymbol.replace("USDT", "")} className="text-profit" />
              <Stat label="Worst Symbol" value={report.stats.worstSymbol.replace("USDT", "")} className="text-loss" />
            </div>

            {/* Risk Metrics */}
            {report.metrics && (
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 text-xs">
                <Stat label="Sharpe" value={report.metrics.sharpeRatio.toFixed(2)} />
                <Stat label="Sortino" value={report.metrics.sortinoRatio.toFixed(2)} />
                <Stat label="Max DD" value={`${report.metrics.maxDrawdownPct.toFixed(1)}%`} className="text-loss" />
                <Stat label="Profit Factor" value={report.metrics.profitFactor.toFixed(2)} />
                <Stat label="Win/Loss" value={report.metrics.winLossRatio.toFixed(2)} />
                <Stat label="Expectancy" value={formatUsdt(report.metrics.expectancy)} />
              </div>
            )}

            {/* Symbol Breakdown */}
            {Object.keys(report.stats.symbolStats).length > 0 && (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border hover:bg-transparent">
                      <TableHead className="text-xs">Symbol</TableHead>
                      <TableHead className="text-xs text-right">Trades</TableHead>
                      <TableHead className="text-xs text-right">P&L</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Object.entries(report.stats.symbolStats)
                      .sort(([, a], [, b]) => b.pnl - a.pnl)
                      .map(([symbol, stat]) => (
                        <TableRow key={symbol} className="border-border hover:bg-accent/30">
                          <TableCell className="font-mono text-xs py-1.5">{symbol.replace("USDT", "")}</TableCell>
                          <TableCell className="text-xs text-right py-1.5">{stat.trades}</TableCell>
                          <TableCell className={cn("font-mono text-xs text-right py-1.5 font-medium", pnlColor(stat.pnl))}>
                            {formatPnl(stat.pnl)}
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function Stat({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className={cn("font-mono text-sm font-medium", className)}>{value}</div>
    </div>
  );
}
