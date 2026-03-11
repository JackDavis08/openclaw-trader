import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Kline, StrategyConfig } from "../types.js";
import { runBacktest } from "../backtest/runner.js";

// Minimal kline data for testing
function makeKlines(count: number, basePrice = 100): Kline[] {
  const klines: Kline[] = [];
  const interval = 3600_000; // 1h
  for (let i = 0; i < count; i++) {
    const t = 1_700_000_000_000 + i * interval;
    const price = basePrice + Math.sin(i / 10) * 5;
    klines.push({
      openTime: t,
      open: price,
      high: price * 1.01,
      low: price * 0.99,
      close: price + (i % 3 === 0 ? 0.5 : -0.3),
      volume: 1000 + i * 10,
      closeTime: t + interval - 1,
    });
  }
  return klines;
}

// Minimal config
function makeConfig(): StrategyConfig {
  return {
    symbols: ["TESTUSDT"],
    timeframe: "1h",
    strategy: {
      name: "test",
      ma: { short: 10, long: 30 },
      rsi: { period: 14, overbought: 70, oversold: 30 },
      macd: { fast: 12, slow: 26, signal: 9 },
      volume: { ma_period: 20, surge_multiplier: 2 },
    },
    signals: {
      buy: ["ma_cross_up"],
      sell: ["ma_cross_down"],
    },
    risk: {
      stop_loss_percent: 5,
      take_profit_percent: 10,
      position_ratio: 0.5,
      max_positions: 3,
      max_daily_loss_percent: 5,
    },
    execution: { mode: "paper" },
    notify: { telegram: { enabled: false, token: "", chatId: "" } },
  } as StrategyConfig;
}

describe("BacktestWorkerPool", () => {
  // We can't easily test actual workers in vitest without compiled JS.
  // Instead, test the submitAll small-job optimization (direct execution path).
  // Worker thread integration would be tested via an e2e test.

  it("submitAll([]) returns empty array", async () => {
    // Import dynamically to avoid worker startup issues
    const { BacktestWorkerPool } = await import("../backtest/worker-pool.js");
    const pool = new BacktestWorkerPool(1);

    const results = await pool.submitAll([]);
    expect(results).toEqual([]);

    await pool.terminate();
  });

  it("submitAll with 1 job runs directly (small-job optimization)", async () => {
    const klines = makeKlines(200);
    const cfg = makeConfig();

    const { BacktestWorkerPool } = await import("../backtest/worker-pool.js");
    const pool = new BacktestWorkerPool(1);

    const results = await pool.submitAll([
      { klinesBySymbol: { TESTUSDT: klines }, cfg },
    ]);

    expect(results).toHaveLength(1);
    expect(results[0]!.metrics).toBeDefined();
    expect(results[0]!.metrics.totalTrades).toBeGreaterThanOrEqual(0);

    await pool.terminate();
  });

  it("single job result matches direct runBacktest()", async () => {
    const klines = makeKlines(200);
    const cfg = makeConfig();

    // Direct call
    const directResult = runBacktest({ TESTUSDT: klines }, cfg);

    // Via pool (single job → direct path)
    const { BacktestWorkerPool } = await import("../backtest/worker-pool.js");
    const pool = new BacktestWorkerPool(1);
    const [poolResult] = await pool.submitAll([
      { klinesBySymbol: { TESTUSDT: klines }, cfg },
    ]);

    expect(poolResult!.metrics.totalReturn).toBe(directResult.metrics.totalReturn);
    expect(poolResult!.metrics.totalTrades).toBe(directResult.metrics.totalTrades);
    expect(poolResult!.metrics.sharpeRatio).toBe(directResult.metrics.sharpeRatio);

    await pool.terminate();
  });

  it("terminate() cleans up", async () => {
    const { BacktestWorkerPool } = await import("../backtest/worker-pool.js");
    const pool = new BacktestWorkerPool(2);

    await pool.terminate();

    // After termination, submit should reject
    await expect(pool.submit({
      klinesBySymbol: { TESTUSDT: makeKlines(100) },
      cfg: makeConfig(),
    })).rejects.toThrow("terminated");
  });

  it("pool with size=1 works correctly", async () => {
    const { BacktestWorkerPool } = await import("../backtest/worker-pool.js");
    const pool = new BacktestWorkerPool(1);

    const results = await pool.submitAll([]);
    expect(results).toEqual([]);

    await pool.terminate();
  });
});
