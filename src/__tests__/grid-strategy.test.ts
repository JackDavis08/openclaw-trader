/**
 * Grid Strategy Plugin Tests (v0.8)
 */
import { describe, it, expect, beforeEach } from "vitest";
import { computeGridLevels, autoDetectRange, gridStrategy } from "../strategies/grid.js";
import type { StrategyContext } from "../strategies/types.js";
import type { Kline, StrategyConfig, Indicators } from "../types.js";
import { createStateStore } from "../strategies/state-store.js";
import * as fs from "fs";
import * as path from "path";

// Trigger strategy registration
await import("../strategies/index.js");
import { getStrategy } from "../strategies/registry.js";

// ─────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────

const TEST_LOGS = path.resolve("logs/test-grid");

function cleanup() {
  try { fs.rmSync(TEST_LOGS, { recursive: true, force: true }); } catch { /* ok */ }
}

function makeKline(close: number, high?: number, low?: number): Kline {
  return {
    openTime: Date.now(),
    open: close,
    high: high ?? close * 1.01,
    low: low ?? close * 0.99,
    close,
    volume: 1000,
    closeTime: Date.now() + 3600000,
  };
}

function makeKlines(prices: number[]): Kline[] {
  return prices.map((p) => makeKline(p));
}

function makeGridCfg(overrides: Record<string, unknown> = {}): StrategyConfig {
  return {
    symbols: ["BTCUSDT"],
    timeframe: "1h",
    strategy: {
      name: "test",
      enabled: true,
      ma: { short: 5, long: 10 },
      rsi: { period: 14, oversold: 30, overbought: 70 },
      macd: { enabled: false, fast: 12, slow: 26, signal: 9 },
      grid: {
        enabled: true,
        upper: 110,
        lower: 90,
        grid_count: 5,
        grid_type: "arithmetic" as const,
        position_per_grid: 100,
        ...overrides,
      },
    },
    signals: { buy: [], sell: [], short: [], cover: [] },
    risk: {
      stop_loss_percent: 8,
      take_profit_percent: 20,
      trailing_stop: { enabled: false, activation_percent: 2, callback_percent: 1 },
      position_ratio: 0.1,
      max_positions: 5,
      max_position_per_symbol: 0.5,
      max_total_loss_percent: 25,
      daily_loss_limit_percent: 10,
    },
    execution: {
      order_type: "market",
      limit_order_offset_percent: 0,
      min_order_usdt: 10,
      limit_order_timeout_seconds: 30,
    },
    notify: {
      on_signal: false, on_trade: false, on_stop_loss: false,
      on_take_profit: false, on_error: false, on_daily_summary: false,
      min_interval_minutes: 60,
    },
    news: { enabled: false, interval_hours: 24, price_alert_threshold: 5, fear_greed_alert: 20 },
    mode: "paper",
  };
}

function makeIndicators(price: number): Indicators {
  return {
    maShort: price, maLong: price, rsi: 50, price, volume: 1000, avgVolume: 1000,
  };
}

function makeCtx(
  price: number,
  cfg: StrategyConfig,
  stateStore: ReturnType<typeof createStateStore>,
  currentPosSide?: "long" | "short",
): StrategyContext {
  return {
    klines: makeKlines([100, 101, 102, 99, 98, price]),
    cfg,
    indicators: makeIndicators(price),
    stateStore,
    ...(currentPosSide !== undefined ? { currentPosSide } : {}),
  };
}

// ─────────────────────────────────────────────────────
// Grid Level Computation Tests
// ─────────────────────────────────────────────────────

describe("computeGridLevels", () => {
  it("arithmetic: produces evenly spaced levels", () => {
    const levels = computeGridLevels(110, 90, 5, "arithmetic");
    expect(levels).toHaveLength(5);
    expect(levels[0]).toBeCloseTo(90);
    expect(levels[1]).toBeCloseTo(95);
    expect(levels[2]).toBeCloseTo(100);
    expect(levels[3]).toBeCloseTo(105);
    expect(levels[4]).toBeCloseTo(110);
  });

  it("geometric: produces geometrically spaced levels", () => {
    const levels = computeGridLevels(200, 100, 3, "geometric");
    expect(levels).toHaveLength(3);
    expect(levels[0]).toBeCloseTo(100);
    expect(levels[1]).toBeCloseTo(Math.sqrt(200 * 100)); // ~141.42
    expect(levels[2]).toBeCloseTo(200);
  });

  it("edge case: count < 2 returns empty", () => {
    expect(computeGridLevels(110, 90, 1, "arithmetic")).toEqual([]);
  });

  it("edge case: upper <= lower returns empty", () => {
    expect(computeGridLevels(90, 110, 5, "arithmetic")).toEqual([]);
    expect(computeGridLevels(100, 100, 5, "arithmetic")).toEqual([]);
  });

  it("edge case: lower <= 0 returns empty", () => {
    expect(computeGridLevels(100, 0, 5, "arithmetic")).toEqual([]);
    expect(computeGridLevels(100, -10, 5, "arithmetic")).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────
// Auto-Range Detection Tests
// ─────────────────────────────────────────────────────

describe("autoDetectRange", () => {
  it("detects range from klines with 2% padding", () => {
    const klines: Kline[] = [
      makeKline(100, 105, 95),
      makeKline(102, 108, 96),
      makeKline(98, 103, 92),
    ];
    const range = autoDetectRange(klines, 10);
    // high=108, low=92, spread=16, padding=0.32
    expect(range.upper).toBeCloseTo(108.32);
    expect(range.lower).toBeCloseTo(91.68);
  });

  it("empty klines returns zeros", () => {
    const range = autoDetectRange([], 10);
    expect(range.upper).toBe(0);
    expect(range.lower).toBe(0);
  });

  it("respects lookback parameter", () => {
    const klines: Kline[] = [
      makeKline(50, 55, 45),  // should be excluded with lookback=2
      makeKline(100, 105, 95),
      makeKline(102, 108, 96),
    ];
    const range = autoDetectRange(klines, 2);
    // Only last 2 klines: high=108, low=95
    expect(range.upper).toBeCloseTo(108.26);
    expect(range.lower).toBeCloseTo(94.74);
  });
});

// ─────────────────────────────────────────────────────
// Strategy Registration Tests
// ─────────────────────────────────────────────────────

describe("grid strategy registration", () => {
  it("is registered and retrievable", () => {
    const strategy = getStrategy("grid");
    expect(strategy.id).toBe("grid");
    expect(strategy.name).toBe("Grid Trading");
  });
});

// ─────────────────────────────────────────────────────
// populateSignal Tests
// ─────────────────────────────────────────────────────

describe("populateSignal", () => {
  beforeEach(cleanup);

  it("returns none when grid not enabled", () => {
    const cfg = makeGridCfg({ enabled: false });
    const store = createStateStore("grid", "BTCUSDT", TEST_LOGS);
    const ctx = makeCtx(100, cfg, store);
    expect(gridStrategy.populateSignal(ctx)).toBe("none");
  });

  it("returns none when stateStore is missing", () => {
    const cfg = makeGridCfg();
    const ctx: StrategyContext = {
      klines: makeKlines([100]),
      cfg,
      indicators: makeIndicators(100),
    };
    expect(gridStrategy.populateSignal(ctx)).toBe("none");
  });

  it("buy at unfilled level when price drops to grid level (no position)", () => {
    const cfg = makeGridCfg(); // levels: 90, 95, 100, 105, 110
    const store = createStateStore("grid", "TEST1", TEST_LOGS);
    // Price at 95 → should buy at level 95
    const ctx = makeCtx(95, cfg, store);
    expect(gridStrategy.populateSignal(ctx)).toBe("buy");
  });

  it("returns none when price is above all grid levels (no position)", () => {
    const cfg = makeGridCfg(); // levels: 90, 95, 100, 105, 110
    const store = createStateStore("grid", "TEST2", TEST_LOGS);
    const ctx = makeCtx(115, cfg, store);
    expect(gridStrategy.populateSignal(ctx)).toBe("none");
  });

  it("sell when price exceeds upper bound (holding long)", () => {
    const cfg = makeGridCfg(); // upper = 110
    const store = createStateStore("grid", "TEST3", TEST_LOGS);
    // First buy to initialize state
    const ctx1 = makeCtx(95, cfg, store);
    gridStrategy.populateSignal(ctx1);
    // Now check with position and price above upper
    const ctx2 = makeCtx(115, cfg, store, "long");
    expect(gridStrategy.populateSignal(ctx2)).toBe("sell");
  });

  it("returns none when holding long and price within grid range", () => {
    const cfg = makeGridCfg();
    const store = createStateStore("grid", "TEST4", TEST_LOGS);
    // Initialize state
    const ctx1 = makeCtx(95, cfg, store);
    gridStrategy.populateSignal(ctx1);
    // Price within range
    const ctx2 = makeCtx(102, cfg, store, "long");
    expect(gridStrategy.populateSignal(ctx2)).toBe("none");
  });
});

// ─────────────────────────────────────────────────────
// adjustPosition Tests
// ─────────────────────────────────────────────────────

describe("adjustPosition", () => {
  beforeEach(cleanup);

  it("adds position at lower unfilled level", () => {
    const cfg = makeGridCfg(); // levels: 90, 95, 100, 105, 110
    const store = createStateStore("grid", "ADJ1", TEST_LOGS);
    // Buy at 100 first
    const ctx1 = makeCtx(100, cfg, store);
    gridStrategy.populateSignal(ctx1); // fills level 90 (price 100 is below or at levels 100, 105, 110; will fill 100)

    // Now adjust: price dropped to 92 (between 90 and 95)
    const position = {
      symbol: "BTCUSDT", side: "long" as const,
      entryPrice: 100, currentPrice: 92,
      quantity: 1, costBasis: 100,
      profitRatio: -0.08, holdMs: 3600000, dcaCount: 0,
    };
    const ctx2 = makeCtx(92, cfg, store, "long");
    const result = gridStrategy.adjustPosition!(position, ctx2);
    // Should return position_per_grid (100 USDT)
    expect(result).toBe(100);
  });

  it("returns null when no unfilled levels below", () => {
    const cfg = makeGridCfg();
    const store = createStateStore("grid", "ADJ2", TEST_LOGS);
    // Buy first to initialize
    const ctx1 = makeCtx(100, cfg, store);
    gridStrategy.populateSignal(ctx1);

    const position = {
      symbol: "BTCUSDT", side: "long" as const,
      entryPrice: 100, currentPrice: 102,
      quantity: 1, costBasis: 100,
      profitRatio: 0.02, holdMs: 3600000, dcaCount: 0,
    };
    const ctx2 = makeCtx(102, cfg, store, "long");
    const result = gridStrategy.adjustPosition!(position, ctx2);
    expect(result).toBeNull();
  });

  it("returns null when grid not enabled", () => {
    const cfg = makeGridCfg({ enabled: false });
    const store = createStateStore("grid", "ADJ3", TEST_LOGS);
    const position = {
      symbol: "BTCUSDT", side: "long" as const,
      entryPrice: 100, currentPrice: 92,
      quantity: 1, costBasis: 100,
      profitRatio: -0.08, holdMs: 3600000, dcaCount: 0,
    };
    const ctx = makeCtx(92, cfg, store, "long");
    const result = gridStrategy.adjustPosition!(position, ctx);
    expect(result).toBeNull();
  });
});

// ─────────────────────────────────────────────────────
// shouldExit Tests
// ─────────────────────────────────────────────────────

describe("shouldExit", () => {
  beforeEach(cleanup);

  it("returns null when no grid state", () => {
    const cfg = makeGridCfg();
    const store = createStateStore("grid", "EXIT1", TEST_LOGS);
    const position = {
      symbol: "BTCUSDT", side: "long" as const,
      entryPrice: 95, currentPrice: 100, holdMs: 3600000,
    };
    const ctx = makeCtx(100, cfg, store, "long");
    const result = gridStrategy.shouldExit!(position, ctx);
    expect(result).toBeNull();
  });

  it("returns null when grid not enabled", () => {
    const cfg = makeGridCfg({ enabled: false });
    const store = createStateStore("grid", "EXIT2", TEST_LOGS);
    const position = {
      symbol: "BTCUSDT", side: "long" as const,
      entryPrice: 95, currentPrice: 105, holdMs: 3600000,
    };
    const ctx = makeCtx(105, cfg, store, "long");
    expect(gridStrategy.shouldExit!(position, ctx)).toBeNull();
  });

  it("exits at grid TP when price reaches unfilled level above entry", () => {
    const cfg = makeGridCfg(); // levels: 90, 95, 100, 105, 110
    const store = createStateStore("grid", "EXIT3", TEST_LOGS);
    // Buy at 95 (fills level 95)
    const ctx1 = makeCtx(95, cfg, store);
    gridStrategy.populateSignal(ctx1);

    // Price rises to 100 → should exit (unfilled level 100 is above entry 95)
    const position = {
      symbol: "BTCUSDT", side: "long" as const,
      entryPrice: 95, currentPrice: 100, holdMs: 3600000,
    };
    const ctx2 = makeCtx(100, cfg, store, "long");
    const result = gridStrategy.shouldExit!(position, ctx2);
    expect(result).toEqual({ exit: true, reason: "grid_tp" });
  });
});

// ─────────────────────────────────────────────────────
// onTradeClosed Tests
// ─────────────────────────────────────────────────────

describe("onTradeClosed", () => {
  beforeEach(cleanup);

  it("unmarks highest filled level on sell", () => {
    const cfg = makeGridCfg(); // levels: 90, 95, 100, 105, 110
    const store = createStateStore("grid", "CLOSE1", TEST_LOGS);
    // Buy at 95 then at 90
    const ctx1 = makeCtx(95, cfg, store);
    gridStrategy.populateSignal(ctx1);

    // Manually add another filled level
    const state = store.get<{ filledLevels: number[] }>("gridState", { filledLevels: [] });
    state.filledLevels.push(90);
    store.set("gridState", state);

    // Close trade (long side)
    const result = {
      symbol: "BTCUSDT", side: "long" as const,
      entryPrice: 95, exitPrice: 105,
      pnl: 10, pnlPercent: 0.105, holdMs: 7200000, exitReason: "grid_tp",
    };
    const ctx2 = makeCtx(105, cfg, store, "long");
    gridStrategy.onTradeClosed!(result, ctx2);

    // Highest filled (95) should be removed, 90 should remain
    const updated = store.get<{ filledLevels: number[] }>("gridState", { filledLevels: [] });
    expect(updated.filledLevels).toContain(90);
    expect(updated.filledLevels).not.toContain(95);
  });
});

// ─────────────────────────────────────────────────────
// State Persistence Tests
// ─────────────────────────────────────────────────────

describe("state persistence", () => {
  beforeEach(cleanup);

  it("grid state round-trips through StateStore", () => {
    const cfg = makeGridCfg();
    const store = createStateStore("grid", "PERSIST1", TEST_LOGS);
    // Initialize by calling populateSignal
    const ctx = makeCtx(95, cfg, store);
    gridStrategy.populateSignal(ctx);

    // Read from a fresh store instance
    const store2 = createStateStore("grid", "PERSIST1", TEST_LOGS);
    const state = store2.get<{ levels: number[]; filledLevels: number[] } | null>("gridState", null);
    expect(state).not.toBeNull();
    expect(state!.levels).toHaveLength(5);
    expect(state!.filledLevels.length).toBeGreaterThan(0);
  });
});
