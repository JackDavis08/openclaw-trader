"use client";

import { useDashboardData } from "@/hooks/use-dashboard";
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
import { formatPrice, formatTime, formatPnl, pnlColor } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { TableSkeleton } from "@/components/dashboard/loading-skeleton";

const typeColors: Record<string, string> = {
  entry: "border-profit/40 text-profit",
  exit: "border-loss/40 text-loss",
  buy: "border-profit/40 text-profit",
  sell: "border-loss/40 text-loss",
  short: "border-orange-500/40 text-orange-400",
  cover: "border-sky-500/40 text-sky-400",
};

export default function SignalsPage() {
  const { data, isLoading } = useDashboardData();

  if (isLoading) return <TableSkeleton rows={10} />;

  const signals = data?.signalHistory ?? [];
  const sorted = [...signals].sort((a, b) => b.timestamp - a.timestamp);

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          Signal History ({sorted.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="pb-2">
        {sorted.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground text-sm">
            No signal history available
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="text-xs">Time</TableHead>
                  <TableHead className="text-xs">Symbol</TableHead>
                  <TableHead className="text-xs">Type</TableHead>
                  <TableHead className="text-xs text-right">Price</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-xs text-right">P&L</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((s) => (
                  <TableRow key={s.id} className="border-border hover:bg-accent/30">
                    <TableCell className="text-xs font-mono py-2">
                      {formatTime(s.timestamp)}
                    </TableCell>
                    <TableCell className="text-xs font-mono py-2">
                      {s.symbol.replace("USDT", "")}
                    </TableCell>
                    <TableCell className="py-2">
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[10px] px-1.5 py-0",
                          typeColors[s.type] ?? "border-muted-foreground/40 text-muted-foreground",
                        )}
                      >
                        {s.type.toUpperCase()}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs font-mono text-right py-2">
                      {formatPrice(s.price)}
                    </TableCell>
                    <TableCell className="text-xs py-2 text-muted-foreground">
                      {s.status}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-xs font-mono text-right py-2",
                        s.pnl != null ? pnlColor(s.pnl) : "",
                      )}
                    >
                      {s.pnl != null ? formatPnl(s.pnl) : "-"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
