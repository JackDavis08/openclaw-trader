"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useScenarios } from "@/hooks/use-dashboard";
import { useManualTrade } from "@/hooks/use-mutations";
import { api } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { formatPrice } from "@/lib/formatters";
import { cn } from "@/lib/utils";

export default function ManualTradePage() {
  const { data: scenarios } = useScenarios();
  const tradeMut = useManualTrade();

  const [symbol, setSymbol] = useState("");
  const [side, setSide] = useState<"buy" | "short">("buy");
  const [amountUsdt, setAmountUsdt] = useState("");
  const [scenarioId, setScenarioId] = useState("");
  const [slPercent, setSlPercent] = useState("5");
  const [tpPercent, setTpPercent] = useState("15");
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Live price preview
  const [livePrice, setLivePrice] = useState<number | null>(null);
  const [priceLoading, setPriceLoading] = useState(false);
  const [priceError, setPriceError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const fetchPrice = useCallback((sym: string) => {
    if (!sym) {
      setLivePrice(null);
      setPriceError(null);
      return;
    }
    const normalized = sym.toUpperCase().endsWith("USDT") ? sym.toUpperCase() : sym.toUpperCase() + "USDT";
    setPriceLoading(true);
    setPriceError(null);
    api.get<{ price: number }>(`/api/price/${encodeURIComponent(normalized)}`)
      .then((r) => { setLivePrice(r.price); setPriceError(null); })
      .catch((e) => { setLivePrice(null); setPriceError(e instanceof Error ? e.message : "Price lookup failed"); })
      .finally(() => setPriceLoading(false));
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchPrice(symbol), 500);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [symbol, fetchPrice]);

  const normalizedSymbol = symbol.toUpperCase().endsWith("USDT") ? symbol.toUpperCase() : symbol.toUpperCase() + "USDT";
  const amount = parseFloat(amountUsdt);
  const sl = parseFloat(slPercent);
  const tp = parseFloat(tpPercent);

  const estimatedQty = livePrice && amount > 0 ? amount / livePrice : 0;
  const estimatedSl = livePrice && sl > 0
    ? (side === "buy" ? livePrice * (1 - sl / 100) : livePrice * (1 + sl / 100))
    : null;
  const estimatedTp = livePrice && tp > 0
    ? (side === "buy" ? livePrice * (1 + tp / 100) : livePrice * (1 - tp / 100))
    : null;

  const canSubmit = symbol.trim() && amount > 0 && scenarioId && livePrice !== null && !priceError;

  function handleSubmit() {
    tradeMut.mutate({
      symbol: normalizedSymbol,
      side,
      amountUsdt: amount,
      scenarioId,
      stopLossPercent: sl > 0 ? sl : undefined,
      takeProfitPercent: tp > 0 ? tp : undefined,
    }, {
      onSuccess: () => {
        setConfirmOpen(false);
        setSymbol("");
        setAmountUsdt("");
      },
    });
  }

  return (
    <div className="max-w-lg mx-auto space-y-4">
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            New Manual Trade
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Symbol */}
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Symbol</label>
            <Input
              placeholder="e.g. BTCUSDT or BTC"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              className="font-mono"
            />
          </div>

          {/* Side */}
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Side</label>
            <Select value={side} onValueChange={(v) => setSide(v as "buy" | "short")}>
              <SelectTrigger className="w-full bg-secondary border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="buy">Buy (Long)</SelectItem>
                <SelectItem value="short">Short</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Amount */}
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Amount (USDT)</label>
            <Input
              type="number"
              min="0"
              step="any"
              placeholder="100"
              value={amountUsdt}
              onChange={(e) => setAmountUsdt(e.target.value)}
              className="font-mono"
            />
          </div>

          {/* Scenario */}
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Scenario</label>
            <Select value={scenarioId} onValueChange={(v) => setScenarioId(v ?? "")}>
              <SelectTrigger className="w-full bg-secondary border-border">
                <SelectValue placeholder="Select scenario" />
              </SelectTrigger>
              <SelectContent>
                {(scenarios ?? []).map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name || s.id}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* SL / TP */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Stop Loss %</label>
              <Input
                type="number"
                min="0"
                step="0.5"
                value={slPercent}
                onChange={(e) => setSlPercent(e.target.value)}
                className="font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Take Profit %</label>
              <Input
                type="number"
                min="0"
                step="0.5"
                value={tpPercent}
                onChange={(e) => setTpPercent(e.target.value)}
                className="font-mono"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Price Preview */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Price Preview
          </CardTitle>
        </CardHeader>
        <CardContent>
          {priceLoading ? (
            <div className="text-xs text-muted-foreground py-4 text-center">Loading price...</div>
          ) : priceError ? (
            <div className="text-xs text-loss py-4 text-center">{priceError}</div>
          ) : livePrice ? (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Market Price</span>
                <span className="font-mono font-medium">{formatPrice(livePrice)}</span>
              </div>
              {estimatedQty > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Est. Quantity</span>
                  <span className="font-mono">{estimatedQty.toFixed(6)}</span>
                </div>
              )}
              {estimatedSl !== null && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Est. Stop Loss</span>
                  <span className="font-mono text-loss/70">{formatPrice(estimatedSl)}</span>
                </div>
              )}
              {estimatedTp !== null && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Est. Take Profit</span>
                  <span className="font-mono text-profit/70">{formatPrice(estimatedTp)}</span>
                </div>
              )}
            </div>
          ) : (
            <div className="text-xs text-muted-foreground py-4 text-center">Enter a symbol to see price preview</div>
          )}
        </CardContent>
      </Card>

      {/* Submit */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogTrigger
          render={
            <Button
              className="w-full"
              size="lg"
              disabled={!canSubmit}
            />
          }
        >
          {side === "buy" ? "Buy (Long)" : "Short"} {symbol ? normalizedSymbol.replace("USDT", "") : "..."}
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Trade</DialogTitle>
            <DialogDescription>
              Please review the details before submitting.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Symbol</span>
              <span className="font-mono">{normalizedSymbol}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Side</span>
              <Badge
                variant="outline"
                className={cn(
                  "text-[10px] px-1.5 py-0",
                  side === "buy" ? "border-profit/40 text-profit" : "border-loss/40 text-loss",
                )}
              >
                {side === "buy" ? "LONG" : "SHORT"}
              </Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Amount</span>
              <span className="font-mono">{amount} USDT</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Scenario</span>
              <span>{scenarioId}</span>
            </div>
            {livePrice && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Est. Price</span>
                <span className="font-mono">{formatPrice(livePrice)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">SL / TP</span>
              <span className="font-mono">{sl}% / {tp}%</span>
            </div>
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" size="sm" />}>
              Cancel
            </DialogClose>
            <Button
              size="sm"
              disabled={tradeMut.isPending}
              onClick={handleSubmit}
            >
              {tradeMut.isPending ? "Submitting..." : "Confirm"}
            </Button>
          </DialogFooter>
          {tradeMut.isError && (
            <p className="text-xs text-loss mt-1">{tradeMut.error.message}</p>
          )}
        </DialogContent>
      </Dialog>

      {/* Success/Error result */}
      {tradeMut.isSuccess && (
        <Card className="bg-card border-profit/20">
          <CardContent className="py-3">
            <p className="text-sm text-profit font-medium">Trade executed successfully!</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
