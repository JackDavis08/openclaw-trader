"use client";

import { useState, useMemo } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { formatPrice, formatTime, formatPnl, pnlColor } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { TableSkeleton } from "@/components/dashboard/loading-skeleton";
import { Search } from "lucide-react";

const typeColors: Record<string, string> = {
  entry: "border-profit/40 text-profit",
  exit: "border-loss/40 text-loss",
  buy: "border-profit/40 text-profit",
  sell: "border-loss/40 text-loss",
  short: "border-orange-500/40 text-orange-400",
  cover: "border-sky-500/40 text-sky-400",
  long_entry: "border-profit/40 text-profit",
  long_exit: "border-loss/40 text-loss",
  short_entry: "border-orange-500/40 text-orange-400",
  short_exit: "border-sky-500/40 text-sky-400",
};

export default function SignalsPage() {
  const { data, isLoading } = useDashboardData();
  const [typeFilter, setTypeFilter] = useState("all");
  const [searchSymbol, setSearchSymbol] = useState("");

  const signals = useMemo(() => data?.signalHistory ?? [], [data?.signalHistory]);

  const allTypes = useMemo(() => {
    const types = new Set(signals.map((s) => s.type));
    return Array.from(types).sort();
  }, [signals]);

  const filtered = useMemo(() => {
    let list = [...signals].sort((a, b) => b.timestamp - a.timestamp);
    if (typeFilter !== "all") {
      list = list.filter((s) => s.type === typeFilter);
    }
    if (searchSymbol.trim()) {
      const q = searchSymbol.trim().toUpperCase();
      list = list.filter((s) => s.symbol.includes(q));
    }
    return list;
  }, [signals, typeFilter, searchSymbol]);

  if (isLoading) return <TableSkeleton rows={10} />;

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
            onChange={(e) => setSearchSymbol(e.target.value)}
          />
        </div>

        <Select value={typeFilter} onValueChange={(v) => { if (v) setTypeFilter(v); }}>
          <SelectTrigger className="h-9 w-36 bg-secondary border-border text-sm">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {allTypes.map((t) => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <span className="text-xs text-muted-foreground">
          {filtered.length} signal{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Signal History
          </CardTitle>
        </CardHeader>
        <CardContent className="pb-2">
          {filtered.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground text-sm">
              No signals match filters
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
                    <TableHead className="text-xs text-right">P&L %</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((s) => (
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
                      <TableCell
                        className={cn(
                          "text-xs font-mono text-right py-2",
                          s.pnlPercent != null ? pnlColor(s.pnlPercent) : "",
                        )}
                      >
                        {s.pnlPercent != null
                          ? `${s.pnlPercent > 0 ? "+" : ""}${s.pnlPercent.toFixed(2)}%`
                          : "-"}
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
