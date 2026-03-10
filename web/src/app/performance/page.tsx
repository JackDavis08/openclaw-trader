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
import { TableSkeleton } from "@/components/dashboard/loading-skeleton";

export default function PerformancePage() {
  const { data, isLoading } = usePerformance();

  if (isLoading) return <TableSkeleton rows={8} />;

  if (!data) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        No performance data available
      </div>
    );
  }

  return (
    <div className="space-y-4">
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
                      <TableCell className="text-xs text-right py-2">{s.wins}</TableCell>
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

      {/* By Day */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Daily P&L
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
