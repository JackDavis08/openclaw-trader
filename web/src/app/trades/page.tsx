"use client";

import { useState, useMemo } from "react";
import { useDashboardData, useScenarios } from "@/hooks/use-dashboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  formatPrice,
  formatPnl,
  formatTime,
  formatUsdt,
  pnlColor,
} from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { TableSkeleton } from "@/components/dashboard/loading-skeleton";
import type { TradeRecord } from "@shared/web/api-types";
import { Download, Search } from "lucide-react";

const PAGE_SIZE = 25;

export default function TradesPage() {
  const { data, isLoading } = useDashboardData();
  const { data: scenarios } = useScenarios();
  const [scenarioFilter, setScenarioFilter] = useState("all");
  const [sideFilter, setSideFilter] = useState("all");
  const [searchSymbol, setSearchSymbol] = useState("");
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    if (!data) return [];
    let trades = [...data.recentTrades].sort(
      (a, b) => b.timestamp - a.timestamp,
    );
    if (scenarioFilter !== "all") {
      trades = trades.filter((t) => t.scenarioId === scenarioFilter);
    }
    if (sideFilter !== "all") {
      trades = trades.filter((t) => t.side === sideFilter);
    }
    if (searchSymbol.trim()) {
      const q = searchSymbol.trim().toUpperCase();
      trades = trades.filter((t) => t.symbol.includes(q));
    }
    return trades;
  }, [data, scenarioFilter, sideFilter, searchSymbol]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageSlice = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  function exportCsv() {
    const header = "Time,Scenario,Symbol,Side,Qty,Price,USDT,PnL,PnL%,Reason";
    const rows = filtered.map(
      (t) =>
        `${new Date(t.timestamp).toISOString()},${t.scenarioId},${t.symbol},${t.side},${t.quantity},${t.price},${t.usdtAmount},${t.pnl ?? ""},${t.pnlPercent ?? ""},${t.reason}`,
    );
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `trades-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (isLoading) return <TableSkeleton rows={10} />;

  const scenarioIds = scenarios?.map((s) => s.id) ??
    [...new Set(data?.recentTrades.map((t) => t.scenarioId) ?? [])];

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            placeholder="Search symbol..."
            className="pl-8 h-9 w-44 bg-secondary border-border text-sm"
            value={searchSymbol}
            onChange={(e) => {
              setSearchSymbol(e.target.value);
              setPage(0);
            }}
          />
        </div>

        <Select
          value={scenarioFilter}
          onValueChange={(v) => {
            if (v) setScenarioFilter(v);
            setPage(0);
          }}
        >
          <SelectTrigger className="h-9 w-40 bg-secondary border-border text-sm">
            <SelectValue placeholder="Scenario" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Scenarios</SelectItem>
            {scenarioIds.map((id) => (
              <SelectItem key={id} value={id}>
                {id}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={sideFilter}
          onValueChange={(v) => {
            if (v) setSideFilter(v);
            setPage(0);
          }}
        >
          <SelectTrigger className="h-9 w-32 bg-secondary border-border text-sm">
            <SelectValue placeholder="Side" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sides</SelectItem>
            <SelectItem value="buy">Buy</SelectItem>
            <SelectItem value="sell">Sell</SelectItem>
            <SelectItem value="short">Short</SelectItem>
            <SelectItem value="cover">Cover</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex-1" />

        <Button
          variant="outline"
          size="sm"
          className="border-border text-xs"
          onClick={exportCsv}
          disabled={filtered.length === 0}
        >
          <Download className="w-3.5 h-3.5 mr-1.5" />
          CSV
        </Button>
      </div>

      {/* Table */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Trade History ({filtered.length} trades)
          </CardTitle>
        </CardHeader>
        <CardContent className="pb-2">
          {filtered.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground text-sm">
              No trades match filters
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border hover:bg-transparent">
                      <TableHead className="text-xs">Time</TableHead>
                      <TableHead className="text-xs">Scenario</TableHead>
                      <TableHead className="text-xs">Symbol</TableHead>
                      <TableHead className="text-xs">Side</TableHead>
                      <TableHead className="text-xs text-right">Qty</TableHead>
                      <TableHead className="text-xs text-right">Price</TableHead>
                      <TableHead className="text-xs text-right">USDT</TableHead>
                      <TableHead className="text-xs text-right">P&L</TableHead>
                      <TableHead className="text-xs text-right">P&L %</TableHead>
                      <TableHead className="text-xs">Reason</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pageSlice.map((t) => (
                      <TradeRow key={t.id} trade={t} />
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-3 px-1">
                  <span className="text-xs text-muted-foreground">
                    Page {page + 1} of {totalPages}
                  </span>
                  <div className="flex gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs border-border"
                      disabled={page === 0}
                      onClick={() => setPage((p) => p - 1)}
                    >
                      Prev
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs border-border"
                      disabled={page >= totalPages - 1}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function TradeRow({ trade: t }: { trade: TradeRecord }) {
  return (
    <TableRow className="border-border hover:bg-accent/30">
      <TableCell className="text-xs font-mono py-2">
        {formatTime(t.timestamp)}
      </TableCell>
      <TableCell className="text-xs text-muted-foreground py-2">
        {t.scenarioId}
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
        {t.quantity.toFixed(4)}
      </TableCell>
      <TableCell className="text-xs font-mono text-right py-2">
        {formatPrice(t.price)}
      </TableCell>
      <TableCell className="text-xs font-mono text-right py-2">
        {formatUsdt(t.usdtAmount)}
      </TableCell>
      <TableCell
        className={cn(
          "text-xs font-mono text-right py-2 font-medium",
          t.pnl != null ? pnlColor(t.pnl) : "",
        )}
      >
        {t.pnl != null ? formatPnl(t.pnl) : "-"}
      </TableCell>
      <TableCell
        className={cn(
          "text-xs font-mono text-right py-2",
          t.pnlPercent != null ? pnlColor(t.pnlPercent) : "",
        )}
      >
        {t.pnlPercent != null ? `${t.pnlPercent > 0 ? "+" : ""}${t.pnlPercent.toFixed(2)}%` : "-"}
      </TableCell>
      <TableCell className="text-xs text-muted-foreground py-2 max-w-[200px] truncate">
        {t.reason}
      </TableCell>
    </TableRow>
  );
}
