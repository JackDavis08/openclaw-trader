"use client";

import { useState } from "react";
import { useStrategies, useBacktestResults, useBacktestResult } from "@/hooks/use-dashboard";
import { useRunBacktest } from "@/hooks/use-mutations";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { TableSkeleton } from "@/components/dashboard/loading-skeleton";
import { cn } from "@/lib/utils";
import { formatPnl, pnlColor } from "@/lib/formatters";
import { FlaskConical, Play, ArrowLeft, Loader2 } from "lucide-react";
import type { BacktestResponse } from "@shared/web/api-types";

export default function BacktestPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (selectedId) {
    return <BacktestDetail id={selectedId} onBack={() => setSelectedId(null)} />;
  }

  return (
    <div className="space-y-4">
      <RunBacktestForm />
      <ResultsList onSelect={setSelectedId} />
    </div>
  );
}

// ─────────────────────────────────────────────────────
// Run Form
// ─────────────────────────────────────────────────────

function RunBacktestForm() {
  const { data: strategies } = useStrategies();
  const run = useRunBacktest();
  const [strategy, setStrategy] = useState("");
  const [days, setDays] = useState("90");
  const [timeframe, setTimeframe] = useState("");
  const [symbols, setSymbols] = useState("");
  const [initialUsdt, setInitialUsdt] = useState("1000");
  const [spreadBps, setSpreadBps] = useState("0");
  const [nextOpen, setNextOpen] = useState(true);

  function handleRun() {
    run.mutate({
      strategy: strategy || undefined,
      days: parseInt(days, 10) || 90,
      timeframe: timeframe || undefined,
      symbols: symbols ? symbols.split(",").map((s) => s.trim().toUpperCase()) : undefined,
      initialUsdt: parseFloat(initialUsdt) || 1000,
      spreadBps: parseInt(spreadBps, 10) || undefined,
      signalToNextOpen: nextOpen,
    });
  }

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Run Backtest</CardTitle>
      </CardHeader>
      <CardContent className="pb-3">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="text-[11px] text-muted-foreground block mb-1">Strategy</label>
            <select
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={strategy}
              onChange={(e) => setStrategy(e.target.value)}
            >
              <option value="">Default (strategy.yaml)</option>
              {(strategies ?? []).map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground block mb-1">Days</label>
            <Input value={days} onChange={(e) => setDays(e.target.value)} placeholder="90" />
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground block mb-1">Timeframe</label>
            <select
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={timeframe}
              onChange={(e) => setTimeframe(e.target.value)}
            >
              <option value="">Strategy default</option>
              <option value="15m">15m</option>
              <option value="1h">1h</option>
              <option value="4h">4h</option>
              <option value="1d">1d</option>
            </select>
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground block mb-1">Initial USDT</label>
            <Input value={initialUsdt} onChange={(e) => setInitialUsdt(e.target.value)} placeholder="1000" />
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground block mb-1">Symbols (comma-separated)</label>
            <Input value={symbols} onChange={(e) => setSymbols(e.target.value)} placeholder="BTCUSDT,ETHUSDT,..." />
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground block mb-1">Spread (bps)</label>
            <Input value={spreadBps} onChange={(e) => setSpreadBps(e.target.value)} placeholder="0" />
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={nextOpen}
                onChange={(e) => setNextOpen(e.target.checked)}
                className="accent-primary"
              />
              Next-open execution
            </label>
          </div>
          <div className="flex items-end">
            <Button onClick={handleRun} disabled={run.isPending} className="w-full">
              {run.isPending ? (
                <><Loader2 className="w-4 h-4 mr-1 animate-spin" />Running...</>
              ) : (
                <><Play className="w-4 h-4 mr-1" />Run Backtest</>
              )}
            </Button>
          </div>
        </div>
        {run.error && (
          <div className="mt-2 text-xs text-destructive">{run.error.message}</div>
        )}
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────
// Results List
// ─────────────────────────────────────────────────────

function ResultsList({ onSelect }: { onSelect: (id: string) => void }) {
  const { data: results, isLoading } = useBacktestResults();

  if (isLoading) return <TableSkeleton rows={4} />;

  if (!results || results.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-40 text-muted-foreground gap-3">
        <FlaskConical className="w-8 h-8" />
        <p className="text-sm">No backtest results yet</p>
        <p className="text-xs">Run a backtest above or use <code className="bg-muted px-1.5 py-0.5 rounded">npm run backtest</code></p>
      </div>
    );
  }

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Saved Results</CardTitle>
      </CardHeader>
      <CardContent className="pb-3">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="text-xs">Strategy</TableHead>
              <TableHead className="text-xs text-right">Days</TableHead>
              <TableHead className="text-xs text-right">Return</TableHead>
              <TableHead className="text-xs text-right">Sharpe</TableHead>
              <TableHead className="text-xs text-right">Max DD</TableHead>
              <TableHead className="text-xs text-right">Trades</TableHead>
              <TableHead className="text-xs text-right">Win Rate</TableHead>
              <TableHead className="text-xs text-right">Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {results.map((r) => (
              <TableRow
                key={r.id}
                className="border-border hover:bg-accent/30 cursor-pointer"
                onClick={() => onSelect(r.id)}
              >
                <TableCell className="font-mono text-xs">{r.strategy}</TableCell>
                <TableCell className="text-xs text-right">{r.days}d</TableCell>
                <TableCell className={cn("text-xs text-right font-mono font-medium", pnlColor(r.totalReturnPercent))}>
                  {r.totalReturnPercent >= 0 ? "+" : ""}{r.totalReturnPercent.toFixed(2)}%
                </TableCell>
                <TableCell className="text-xs text-right font-mono">{r.sharpeRatio.toFixed(2)}</TableCell>
                <TableCell className="text-xs text-right font-mono text-loss">-{r.maxDrawdown.toFixed(2)}%</TableCell>
                <TableCell className="text-xs text-right">{r.totalTrades}</TableCell>
                <TableCell className="text-xs text-right font-mono">{(r.winRate * 100).toFixed(1)}%</TableCell>
                <TableCell className="text-xs text-right text-muted-foreground">
                  {new Date(r.createdAt).toLocaleDateString()}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────
// Detail View
// ─────────────────────────────────────────────────────

function BacktestDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const { data, isLoading } = useBacktestResult(id);

  if (isLoading) return <TableSkeleton rows={8} />;
  if (!data) return <p className="text-sm text-muted-foreground">Result not found</p>;

  return (
    <div className="space-y-4">
      <Button variant="outline" size="sm" onClick={onBack}>
        <ArrowLeft className="w-3.5 h-3.5 mr-1" />
        Back to Results
      </Button>

      <DetailHeader data={data} />

      <Tabs defaultValue={0}>
        <TabsList>
          <TabsTrigger value={0}>Metrics</TabsTrigger>
          <TabsTrigger value={1}>Equity Curve</TabsTrigger>
          <TabsTrigger value={2}>Trades</TabsTrigger>
          <TabsTrigger value={3}>Per Symbol</TabsTrigger>
        </TabsList>

        <TabsContent value={0}>
          <MetricsView data={data} />
        </TabsContent>
        <TabsContent value={1}>
          <EquityCurveView data={data} />
        </TabsContent>
        <TabsContent value={2}>
          <TradesView data={data} />
        </TabsContent>
        <TabsContent value={3}>
          <PerSymbolView data={data} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function DetailHeader({ data }: { data: BacktestResponse }) {
  const { config: c, metrics: m } = data;
  return (
    <Card className="bg-card border-border">
      <CardContent className="pt-4 pb-3">
        <div className="flex items-center gap-3 mb-3">
          <h2 className="text-base font-semibold">{c.strategy}</h2>
          <Badge variant="outline" className="text-[10px]">{c.timeframe}</Badge>
          <Badge variant="outline" className="text-[10px]">{c.days}d</Badge>
          {c.signalToNextOpen && (
            <Badge variant="outline" className="text-[10px] border-profit/40 text-profit">next-open</Badge>
          )}
        </div>
        <div className="text-xs text-muted-foreground">
          {c.startDate} &rarr; {c.endDate} &middot; {c.symbols.join(", ")} &middot; ${c.initialUsdt}
          {(c.spreadBps ?? 0) > 0 && ` \u00b7 spread: ${c.spreadBps}bps`}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-3">
          <Kpi label="Return" value={`${m.totalReturnPercent >= 0 ? "+" : ""}${m.totalReturnPercent.toFixed(2)}%`} color={pnlColor(m.totalReturnPercent)} />
          <Kpi label="Sharpe" value={m.sharpeRatio.toFixed(2)} />
          <Kpi label="Max DD" value={`-${m.maxDrawdown.toFixed(2)}%`} color="text-loss" />
          <Kpi label="Trades" value={String(m.totalTrades)} />
          <Kpi label="Win Rate" value={`${(m.winRate * 100).toFixed(1)}%`} />
        </div>
      </CardContent>
    </Card>
  );
}

function Kpi({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className={cn("font-mono text-sm font-medium", color)}>{value}</div>
    </div>
  );
}

function MetricsView({ data }: { data: BacktestResponse }) {
  const m = data.metrics;
  const rows: [string, string][] = [
    ["Total Return", `${formatPnl(m.totalReturn)} (${m.totalReturnPercent >= 0 ? "+" : ""}${m.totalReturnPercent.toFixed(2)}%)`],
    ["Sharpe Ratio", m.sharpeRatio.toFixed(2)],
    ["Sortino Ratio", m.sortinoRatio.toFixed(2)],
    ["Calmar Ratio", m.calmarRatio.toFixed(2)],
    ["Max Drawdown", `-${m.maxDrawdown.toFixed(2)}%`],
    ["Profit Factor", isFinite(m.profitFactor) ? m.profitFactor.toFixed(2) : "\u221e"],
    ["Win Rate", `${(m.winRate * 100).toFixed(1)}% (${m.wins}W / ${m.losses}L)`],
    ["Win/Loss Ratio", `${m.winLossRatio.toFixed(2)}:1`],
    ["Avg Win", `${m.avgWinPercent >= 0 ? "+" : ""}${m.avgWinPercent.toFixed(2)}%`],
    ["Avg Loss", `-${m.avgLossPercent.toFixed(2)}%`],
    ["Avg Hold", `${m.avgHoldingHours.toFixed(1)} hours`],
    ["Best Trade", `${m.bestTradePct >= 0 ? "+" : ""}${m.bestTradePct.toFixed(2)}%`],
    ["Worst Trade", `${m.worstTradePct.toFixed(2)}%`],
  ];

  if (m.benchmarkReturn !== undefined) {
    rows.push(["BTC Benchmark", `${m.benchmarkReturn >= 0 ? "+" : ""}${m.benchmarkReturn.toFixed(2)}%`]);
  }
  if (m.alpha !== undefined) {
    rows.push(["Alpha", `${m.alpha >= 0 ? "+" : ""}${m.alpha.toFixed(2)}%`]);
  }

  const exitTotal = m.totalTrades || 1;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs text-muted-foreground">Performance Metrics</CardTitle>
        </CardHeader>
        <CardContent className="pb-3">
          <div className="space-y-1.5">
            {rows.map(([label, value]) => (
              <div key={label} className="flex justify-between text-xs">
                <span className="text-muted-foreground">{label}</span>
                <span className="font-mono">{value}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs text-muted-foreground">Exit Reasons</CardTitle>
        </CardHeader>
        <CardContent className="pb-3">
          <div className="space-y-2">
            <ExitBar label="Signal" count={m.signalExitCount} total={exitTotal} />
            <ExitBar label="Take Profit" count={m.takeProfitCount} total={exitTotal} />
            <ExitBar label="Stop Loss" count={m.stopLossCount} total={exitTotal} />
            <ExitBar label="Trailing Stop" count={m.trailingStopCount} total={exitTotal} />
            <ExitBar label="End of Data" count={m.endOfDataCount} total={exitTotal} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ExitBar({ label, count, total }: { label: string; count: number; total: number }) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  if (count === 0) return null;
  return (
    <div>
      <div className="flex justify-between text-xs mb-0.5">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono">{count} ({pct.toFixed(0)}%)</span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function EquityCurveView({ data }: { data: BacktestResponse }) {
  const curve = data.equityCurve;
  if (curve.length === 0) {
    return <p className="text-sm text-muted-foreground p-4">No equity data</p>;
  }

  const maxEquity = Math.max(...curve.map((p) => p.equity));
  const minEquity = Math.min(...curve.map((p) => p.equity));
  const range = maxEquity - minEquity || 1;
  const initial = data.config.initialUsdt;

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-xs text-muted-foreground">
          Equity Curve ({curve.length} points)
        </CardTitle>
      </CardHeader>
      <CardContent className="pb-3">
        <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
          <span>{new Date(curve[0]!.time).toLocaleDateString()}</span>
          <span>High: ${maxEquity.toFixed(2)}</span>
          <span>{new Date(curve[curve.length - 1]!.time).toLocaleDateString()}</span>
        </div>
        <div className="relative h-[200px] border border-border rounded bg-muted/20">
          <svg
            viewBox={`0 0 ${curve.length} 100`}
            preserveAspectRatio="none"
            className="w-full h-full"
          >
            {/* Initial baseline */}
            <line
              x1="0"
              y1={100 - ((initial - minEquity) / range) * 100}
              x2={curve.length}
              y2={100 - ((initial - minEquity) / range) * 100}
              stroke="currentColor"
              strokeWidth="0.3"
              className="text-muted-foreground/40"
              strokeDasharray="2,2"
            />
            {/* Equity line */}
            <polyline
              points={curve
                .map((p, i) => `${i},${100 - ((p.equity - minEquity) / range) * 100}`)
                .join(" ")}
              fill="none"
              stroke="currentColor"
              strokeWidth="0.8"
              className={
                curve[curve.length - 1]!.equity >= initial
                  ? "text-profit"
                  : "text-loss"
              }
            />
          </svg>
        </div>
        <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
          <span>Low: ${minEquity.toFixed(2)}</span>
          <span>
            Final: ${curve[curve.length - 1]!.equity.toFixed(2)} (
            <span className={pnlColor(curve[curve.length - 1]!.equity - initial)}>
              {formatPnl(curve[curve.length - 1]!.equity - initial)}
            </span>
            )
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function TradesView({ data }: { data: BacktestResponse }) {
  const trades = data.trades;
  if (trades.length === 0) {
    return <p className="text-sm text-muted-foreground p-4">No trades</p>;
  }

  const reasonBadge: Record<string, string> = {
    signal: "border-sky-500/40 text-sky-400",
    stop_loss: "border-loss/40 text-loss",
    take_profit: "border-profit/40 text-profit",
    trailing_stop: "border-yellow-500/40 text-yellow-400",
    end_of_data: "border-muted-foreground/40 text-muted-foreground",
    time_stop: "border-muted-foreground/40 text-muted-foreground",
  };

  return (
    <Card className="bg-card border-border overflow-x-auto">
      <CardContent className="pt-4 pb-3">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="text-xs">Symbol</TableHead>
              <TableHead className="text-xs">Side</TableHead>
              <TableHead className="text-xs text-right">Entry</TableHead>
              <TableHead className="text-xs text-right">Exit</TableHead>
              <TableHead className="text-xs text-right">P&L</TableHead>
              <TableHead className="text-xs text-right">P&L %</TableHead>
              <TableHead className="text-xs">Exit Reason</TableHead>
              <TableHead className="text-xs text-right">Duration</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {trades.map((t, i) => {
              const hours = (t.exitTime - t.entryTime) / 3_600_000;
              return (
                <TableRow key={i} className="border-border hover:bg-accent/30">
                  <TableCell className="font-mono text-xs">{t.symbol.replace("USDT", "")}</TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={cn("text-[10px] px-1.5 py-0", t.side === "sell" ? "border-loss/40 text-loss" : "border-purple-500/40 text-purple-400")}
                    >
                      {t.side}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-right">${t.entryPrice.toFixed(2)}</TableCell>
                  <TableCell className="font-mono text-xs text-right">${t.exitPrice.toFixed(2)}</TableCell>
                  <TableCell className={cn("font-mono text-xs text-right font-medium", pnlColor(t.pnl))}>
                    {formatPnl(t.pnl)}
                  </TableCell>
                  <TableCell className={cn("font-mono text-xs text-right", pnlColor(t.pnlPercent))}>
                    {t.pnlPercent >= 0 ? "+" : ""}{t.pnlPercent.toFixed(2)}%
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", reasonBadge[t.exitReason] ?? "")}>
                      {t.exitReason.replace("_", " ")}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-right text-muted-foreground">
                    {hours >= 24 ? `${Math.floor(hours / 24)}d ${Math.floor(hours % 24)}h` : `${hours.toFixed(1)}h`}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function PerSymbolView({ data }: { data: BacktestResponse }) {
  const entries = Object.entries(data.perSymbol).sort(([, a], [, b]) => b.pnl - a.pnl);
  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground p-4">No per-symbol data</p>;
  }

  return (
    <Card className="bg-card border-border">
      <CardContent className="pt-4 pb-3">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="text-xs">Symbol</TableHead>
              <TableHead className="text-xs text-right">Trades</TableHead>
              <TableHead className="text-xs text-right">Wins</TableHead>
              <TableHead className="text-xs text-right">Losses</TableHead>
              <TableHead className="text-xs text-right">Win Rate</TableHead>
              <TableHead className="text-xs text-right">P&L</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map(([symbol, stats]) => (
              <TableRow key={symbol} className="border-border hover:bg-accent/30">
                <TableCell className="font-mono text-xs">{symbol.replace("USDT", "")}</TableCell>
                <TableCell className="text-xs text-right">{stats.trades}</TableCell>
                <TableCell className="text-xs text-right text-profit">{stats.wins}</TableCell>
                <TableCell className="text-xs text-right text-loss">{stats.losses}</TableCell>
                <TableCell className="text-xs text-right font-mono">{(stats.winRate * 100).toFixed(1)}%</TableCell>
                <TableCell className={cn("font-mono text-xs text-right font-medium", pnlColor(stats.pnl))}>
                  {formatPnl(stats.pnl)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
