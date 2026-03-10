"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  formatPrice,
  formatPnl,
  formatPercent,
  formatDuration,
  pnlColor,
} from "@/lib/formatters";
import { cn } from "@/lib/utils";
import type { PositionWithPnl, PriceMap } from "@shared/web/api-types";

interface PositionCardsProps {
  positions: PositionWithPnl[];
  prices: PriceMap;
  now: number;
}

function calcLivePnl(pos: PositionWithPnl, prices: PriceMap) {
  const livePrice = prices[pos.symbol] ?? pos.currentPrice;
  const pnl =
    pos.side === "short"
      ? (pos.entryPrice - livePrice) * pos.quantity
      : (livePrice - pos.entryPrice) * pos.quantity;
  const costBasis =
    pos.side === "short"
      ? pos.entryPrice * pos.quantity
      : pos.entryPrice * pos.quantity;
  const pnlPct = costBasis > 0 ? pnl / costBasis : 0;
  return { livePrice, pnl, pnlPct };
}

export function PositionCards({ positions, prices, now }: PositionCardsProps) {
  if (positions.length === 0) {
    return (
      <Card className="bg-card border-border">
        <CardContent className="py-8 text-center text-muted-foreground text-sm">
          No open positions
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
      {positions.map((pos) => {
        const { livePrice, pnl, pnlPct } = calcLivePnl(pos, prices);
        const holdTime = now - pos.entryTime;
        return (
          <Card key={`${pos.scenarioId}-${pos.symbol}`} className="bg-card border-border">
            <CardContent className="pt-3 pb-3 px-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm font-mono">
                    {pos.symbol.replace("USDT", "")}
                  </span>
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
                </div>
                <span className="text-xs text-muted-foreground">
                  {pos.scenarioId}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <div>
                  <span className="text-muted-foreground">Entry</span>
                  <div className="font-mono">{formatPrice(pos.entryPrice)}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">Current</span>
                  <div className="font-mono">{formatPrice(livePrice)}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">UPnL</span>
                  <div className={cn("font-mono font-medium", pnlColor(pnl))}>
                    {formatPnl(pnl)}
                  </div>
                </div>
                <div>
                  <span className="text-muted-foreground">UPnL %</span>
                  <div className={cn("font-mono font-medium", pnlColor(pnl))}>
                    {formatPercent(pnlPct)}
                  </div>
                </div>
                <div>
                  <span className="text-muted-foreground">SL</span>
                  <div className="font-mono text-loss/80">
                    {formatPrice(pos.stopLoss)}
                  </div>
                </div>
                <div>
                  <span className="text-muted-foreground">Hold</span>
                  <div className="font-mono">{formatDuration(holdTime)}</div>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
