"use client";

import { useState, useMemo } from "react";
import { useDashboardData, usePrices } from "@/hooks/use-dashboard";
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
  formatDuration,
  pnlColor,
} from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { TableSkeleton } from "@/components/dashboard/loading-skeleton";
import type { PositionWithPnl, PriceMap } from "@shared/web/api-types";
import { ArrowUpDown } from "lucide-react";

type SortKey = "symbol" | "side" | "pnl" | "pnlPct" | "entryTime";
type SortDir = "asc" | "desc";

function getLivePnl(pos: PositionWithPnl, prices: PriceMap) {
  const livePrice = prices[pos.symbol] ?? pos.currentPrice;
  const pnl =
    pos.side === "short"
      ? (pos.entryPrice - livePrice) * pos.quantity
      : (livePrice - pos.entryPrice) * pos.quantity;
  const costBasis = pos.entryPrice * pos.quantity;
  const pnlPct = costBasis > 0 ? pnl / costBasis : 0;
  return { livePrice, pnl, pnlPct };
}

export default function PositionsPage() {
  const { data, isLoading } = useDashboardData();
  const { data: prices } = usePrices();
  const [sortKey, setSortKey] = useState<SortKey>("pnl");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const sorted = useMemo(() => {
    if (!data) return [];
    const pm = prices ?? {};
    const list = data.positions.map((pos) => ({
      ...pos,
      ...getLivePnl(pos, pm),
    }));
    list.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "symbol":
          cmp = a.symbol.localeCompare(b.symbol);
          break;
        case "side":
          cmp = a.side.localeCompare(b.side);
          break;
        case "pnl":
          cmp = a.pnl - b.pnl;
          break;
        case "pnlPct":
          cmp = a.pnlPct - b.pnlPct;
          break;
        case "entryTime":
          cmp = a.entryTime - b.entryTime;
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [data, prices, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  if (isLoading) return <TableSkeleton rows={8} />;

  const now = data?.lastUpdate ?? 0;

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          Open Positions ({sorted.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="pb-2">
        {sorted.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground text-sm">
            No open positions
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <SortHead label="Symbol" sortKey="symbol" current={sortKey} dir={sortDir} onSort={toggleSort} />
                  <SortHead label="Side" sortKey="side" current={sortKey} dir={sortDir} onSort={toggleSort} />
                  <TableHead className="text-xs text-right">Qty</TableHead>
                  <TableHead className="text-xs text-right">Entry</TableHead>
                  <TableHead className="text-xs text-right">Current</TableHead>
                  <SortHead label="UPnL" sortKey="pnl" current={sortKey} dir={sortDir} onSort={toggleSort} align="right" />
                  <SortHead label="UPnL %" sortKey="pnlPct" current={sortKey} dir={sortDir} onSort={toggleSort} align="right" />
                  <TableHead className="text-xs text-right">SL</TableHead>
                  <TableHead className="text-xs text-right">TP</TableHead>
                  <SortHead label="Duration" sortKey="entryTime" current={sortKey} dir={sortDir} onSort={toggleSort} align="right" />
                  <TableHead className="text-xs">Scenario</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((pos) => {
                  const holdTime = now - pos.entryTime;
                  return (
                    <TableRow
                      key={`${pos.scenarioId}-${pos.symbol}`}
                      className="border-border hover:bg-accent/30"
                    >
                      <TableCell className="font-mono text-xs py-2">
                        {pos.symbol.replace("USDT", "")}
                      </TableCell>
                      <TableCell className="py-2">
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px] px-1.5 py-0",
                            pos.side === "long"
                              ? "border-profit/40 text-profit"
                              : "border-loss/40 text-loss",
                          )}
                        >
                          {pos.side.toUpperCase()}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-right py-2">
                        {pos.quantity.toFixed(4)}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-right py-2">
                        {formatPrice(pos.entryPrice)}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-right py-2">
                        {formatPrice(pos.livePrice)}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "font-mono text-xs text-right py-2 font-medium",
                          pnlColor(pos.pnl),
                        )}
                      >
                        {formatPnl(pos.pnl)}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "font-mono text-xs text-right py-2 font-medium",
                          pnlColor(pos.pnl),
                        )}
                      >
                        {formatPercent(pos.pnlPct)}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-right py-2 text-loss/70">
                        {formatPrice(pos.stopLoss)}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-right py-2 text-profit/70">
                        {pos.takeProfit > 0 ? formatPrice(pos.takeProfit) : "-"}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-right py-2">
                        {formatDuration(holdTime)}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground py-2">
                        {pos.scenarioId}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SortHead({
  label,
  sortKey: key,
  current,
  onSort,
  align,
}: {
  label: string;
  sortKey: SortKey;
  current: SortKey;
  dir: SortDir;
  onSort: (k: SortKey) => void;
  align?: "right";
}) {
  return (
    <TableHead
      className={cn(
        "text-xs cursor-pointer select-none hover:text-foreground",
        align === "right" && "text-right",
      )}
      onClick={() => onSort(key)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <ArrowUpDown
          className={cn(
            "w-3 h-3",
            current === key ? "text-primary" : "text-muted-foreground/50",
          )}
        />
      </span>
    </TableHead>
  );
}
