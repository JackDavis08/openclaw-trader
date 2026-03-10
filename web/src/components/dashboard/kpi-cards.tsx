"use client";

import { Card, CardContent } from "@/components/ui/card";
import { formatUsdt, formatPercent, pnlColor } from "@/lib/formatters";
import { DollarSign, TrendingUp, Wallet, Target } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AccountSummary } from "@shared/web/api-types";

interface KpiCardsProps {
  accounts: AccountSummary[];
}

export function KpiCards({ accounts }: KpiCardsProps) {
  const totalEquity = accounts.reduce((s, a) => s + a.totalEquity, 0);
  const totalPnl = accounts.reduce((s, a) => s + a.totalPnl, 0);
  const totalInitial = accounts.reduce((s, a) => s + a.initialUsdt, 0);
  const totalPnlPercent = totalInitial > 0 ? totalPnl / totalInitial : 0;
  const totalPositions = accounts.reduce((s, a) => s + a.positionCount, 0);
  const totalTrades = accounts.reduce((s, a) => s + a.tradeCount, 0);

  const closedTrades = accounts.reduce((s, a) => {
    const ct = a.tradeCount > 0 ? Math.round(a.tradeCount * a.winRate) : 0;
    return s + ct;
  }, 0);
  const avgWinRate =
    totalTrades > 0 ? closedTrades / totalTrades : 0;

  const cards = [
    {
      label: "Total Equity",
      value: formatUsdt(totalEquity),
      icon: DollarSign,
      color: "text-primary",
    },
    {
      label: "Total P&L",
      value: formatUsdt(totalPnl),
      sub: formatPercent(totalPnlPercent),
      icon: TrendingUp,
      color: pnlColor(totalPnl),
    },
    {
      label: "Open Positions",
      value: String(totalPositions),
      sub: `${accounts.length} scenario${accounts.length !== 1 ? "s" : ""}`,
      icon: Wallet,
      color: "text-neutral-accent",
    },
    {
      label: "Win Rate",
      value: `${(avgWinRate * 100).toFixed(1)}%`,
      sub: `${totalTrades} trades`,
      icon: Target,
      color: "text-primary",
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {cards.map((c) => (
        <Card key={c.label} className="bg-card border-border">
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">{c.label}</span>
              <c.icon className={cn("w-4 h-4", c.color)} />
            </div>
            <div className={cn("text-xl font-bold font-mono", c.color)}>
              {c.value}
            </div>
            {c.sub && (
              <div className="text-xs text-muted-foreground mt-0.5">
                {c.sub}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
