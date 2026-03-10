"use client";

import { Card, CardContent } from "@/components/ui/card";

export default function BacktestError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex items-center justify-center h-[60vh]">
      <Card className="bg-card border-border max-w-md w-full">
        <CardContent className="pt-8 pb-6 text-center space-y-4">
          <div className="text-3xl font-bold text-loss">Backtest Error</div>
          <p className="text-muted-foreground text-sm">
            {error.message || "Backtest failed due to a network or exchange error"}
          </p>
          <button
            onClick={reset}
            className="inline-block px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Try Again
          </button>
        </CardContent>
      </Card>
    </div>
  );
}
