"use client";

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
import {
  formatPrice,
  formatPnl,
  formatPercent,
  formatTime,
  pnlColor,
} from "@/lib/formatters";
import { cn } from "@/lib/utils";
import type { TradeRecord } from "@shared/web/api-types";

interface RecentTradesProps {
  trades: TradeRecord[];
  limit?: number;
}

export function RecentTrades({ trades, limit = 10 }: RecentTradesProps) {
  const sorted = [...trades]
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, limit);

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          Recent Trades
        </CardTitle>
      </CardHeader>
      <CardContent className="pb-2">
        {sorted.length === 0 ? (
          <div className="py-6 text-center text-muted-foreground text-sm">
            No trades yet
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="text-xs">Time</TableHead>
                  <TableHead className="text-xs">Symbol</TableHead>
                  <TableHead className="text-xs">Side</TableHead>
                  <TableHead className="text-xs text-right">Price</TableHead>
                  <TableHead className="text-xs text-right">P&L</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((t) => (
                  <TableRow
                    key={t.id}
                    className="border-border hover:bg-accent/30"
                  >
                    <TableCell className="text-xs font-mono py-2">
                      {formatTime(t.timestamp)}
                    </TableCell>
                    <TableCell className="text-xs font-mono py-2">
                      {t.symbol.replace("USDT", "")}
                    </TableCell>
                    <TableCell className="py-2">
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[10px] px-1.5 py-0",
                          t.side === "buy" || t.side === "cover"
                            ? "border-profit/40 text-profit"
                            : "border-loss/40 text-loss",
                        )}
                      >
                        {t.side.toUpperCase()}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs font-mono text-right py-2">
                      {formatPrice(t.price)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-xs font-mono text-right py-2",
                        t.pnl != null ? pnlColor(t.pnl) : "",
                      )}
                    >
                      {t.pnl != null ? formatPnl(t.pnl) : "-"}
                      {t.pnlPercent != null && (
                        <span className="ml-1 text-muted-foreground">
                          {formatPercent(t.pnlPercent / 100)}
                        </span>
                      )}
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
