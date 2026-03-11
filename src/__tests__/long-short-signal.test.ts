/**
 * Long/Short ratio signal tests
 *
 * Covers: readLongShortCache / writeLongShortCache / fetchLongShortRatios / signal conditions
 * File I/O mocked via vi.spyOn(fs, ...), network calls mocked via vi.mock('../exchange/derivatives-data.js')
 */

import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import fs from "fs";

// Mock derivatives-data module to avoid real network requests
vi.mock("../exchange/derivatives-data.js", () => ({
  getLongShortRatio: vi.fn(),
}));

import {
  readLongShortCache,
  writeLongShortCache,
  fetchLongShortRatios,
} from "../strategy/long-short-signal.js";
import type { LongShortCache } from "../strategy/long-short-signal.js";
import { getLongShortRatio } from "../exchange/derivatives-data.js";
import { detectSignal } from "../strategy/signals.js";
import type { Indicators, StrategyConfig } from "../types.js";

const mockedGetLongShortRatio = vi.mocked(getLongShortRatio);

// ─── Helper: build minimal StrategyConfig for signal tests ──────────
function makeCfg(overrides?: Partial<StrategyConfig["strategy"]>): StrategyConfig {
  return {
    symbols: ["BTCUSDT"],
    timeframe: "1h",
    strategy: {
      name: "test",
      enabled: true,
      ma: { short: 7, long: 25 },
      rsi: { period: 14, oversold: 30, overbought: 70 },
      macd: { enabled: false, fast: 12, slow: 26, signal: 9 },
      ...overrides,
    },
    signals: { buy: ["ls_ratio_extreme_short"], sell: ["ls_ratio_extreme_long"] },
    risk: {
      stop_loss_percent: 3,
      take_profit_percent: 6,
      trailing_stop: { enabled: false, activation_percent: 0, callback_percent: 0 },
      position_ratio: 0.1,
      max_positions: 3,
      max_position_per_symbol: 1,
      max_total_loss_percent: 20,
      daily_loss_limit_percent: 5,
    },
    execution: {
      order_type: "market",
      limit_order_offset_percent: 0,
      min_order_usdt: 10,
      limit_order_timeout_seconds: 30,
    },
    notify: {
      on_signal: false,
      on_trade: false,
      on_stop_loss: false,
      on_take_profit: false,
      on_error: false,
      on_daily_summary: false,
      min_interval_minutes: 5,
    },
    news: { enabled: false, interval_hours: 6, price_alert_threshold: 5, fear_greed_alert: 25 },
    mode: "paper",
  };
}

function makeIndicators(overrides?: Partial<Indicators>): Indicators {
  return {
    maShort: 100, maLong: 99, rsi: 50, price: 100, volume: 1000, avgVolume: 1000,
    ...overrides,
  };
}

// ─── readLongShortCache ─────────────────────────────────────────

describe("readLongShortCache", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns undefined when file does not exist", () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(false);
    expect(readLongShortCache("BTCUSDT")).toBeUndefined();
  });

  it("returns undefined when symbol is not in cache", () => {
    const cache: LongShortCache = {};
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(fs, "readFileSync").mockReturnValue(JSON.stringify(cache));

    expect(readLongShortCache("BTCUSDT")).toBeUndefined();
  });

  it("returns data when cache is within validity period", () => {
    const cache: LongShortCache = {
      BTCUSDT: { globalLSRatio: 2.5, topAccountLSRatio: 1.8, fetchedAt: Date.now() - 1000 },
    };
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(fs, "readFileSync").mockReturnValue(JSON.stringify(cache));

    const result = readLongShortCache("BTCUSDT");
    expect(result).toBeDefined();
    expect(result!.globalLSRatio).toBeCloseTo(2.5);
    expect(result!.topAccountLSRatio).toBeCloseTo(1.8);
  });

  it("returns undefined when cache exceeds maxAgeMs", () => {
    const cache: LongShortCache = {
      BTCUSDT: { globalLSRatio: 2.5, topAccountLSRatio: 1.8, fetchedAt: Date.now() - 10 * 60_000 },
    };
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(fs, "readFileSync").mockReturnValue(JSON.stringify(cache));

    // Default maxAgeMs = 5min, cache written 10min ago, already expired
    expect(readLongShortCache("BTCUSDT")).toBeUndefined();
  });

  it("symbol is case-insensitive (normalized to uppercase)", () => {
    const cache: LongShortCache = {
      ETHUSDT: { globalLSRatio: 1.2, topAccountLSRatio: 0.9, fetchedAt: Date.now() - 1000 },
    };
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(fs, "readFileSync").mockReturnValue(JSON.stringify(cache));

    const result = readLongShortCache("ethusdt");
    expect(result).toBeDefined();
    expect(result!.globalLSRatio).toBeCloseTo(1.2);
  });

  it("returns undefined on corrupted JSON (does not throw)", () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(fs, "readFileSync").mockReturnValue("bad json!!!");

    expect(() => readLongShortCache("BTCUSDT")).not.toThrow();
    expect(readLongShortCache("BTCUSDT")).toBeUndefined();
  });
});

// ─── writeLongShortCache ────────────────────────────────────────

describe("writeLongShortCache", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("writes new symbol to empty file", () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(false);
    vi.spyOn(fs, "mkdirSync").mockImplementation(() => undefined);
    const writeSpy = vi.spyOn(fs, "writeFileSync").mockImplementation(() => undefined);

    writeLongShortCache("BTCUSDT", { globalLSRatio: 2.0, topAccountLSRatio: 1.5 });

    expect(writeSpy).toHaveBeenCalled();
    const written = writeSpy.mock.calls[0]?.[1] as string;
    const parsed = JSON.parse(written) as LongShortCache;
    expect(parsed["BTCUSDT"]?.globalLSRatio).toBeCloseTo(2.0);
    expect(parsed["BTCUSDT"]?.topAccountLSRatio).toBeCloseTo(1.5);
  });

  it("adding new symbol to existing cache does not lose old data", () => {
    const existing: LongShortCache = {
      ETHUSDT: { globalLSRatio: 1.2, topAccountLSRatio: 0.9, fetchedAt: Date.now() - 1000 },
    };
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(fs, "readFileSync").mockReturnValue(JSON.stringify(existing));
    vi.spyOn(fs, "mkdirSync").mockImplementation(() => undefined);
    const writeSpy = vi.spyOn(fs, "writeFileSync").mockImplementation(() => undefined);

    writeLongShortCache("BTCUSDT", { globalLSRatio: 3.5, topAccountLSRatio: 2.1 });

    const written = writeSpy.mock.calls[0]?.[1] as string;
    const parsed = JSON.parse(written) as LongShortCache;
    expect(parsed["ETHUSDT"]?.globalLSRatio).toBeCloseTo(1.2);
    expect(parsed["BTCUSDT"]?.globalLSRatio).toBeCloseTo(3.5);
  });
});

// ─── fetchLongShortRatios ──────────────────────────────────────────

describe("fetchLongShortRatios", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockedGetLongShortRatio.mockReset();
  });

  it("returns cached value directly on cache hit without calling API", async () => {
    const cache: LongShortCache = {
      BTCUSDT: { globalLSRatio: 2.0, topAccountLSRatio: 1.5, fetchedAt: Date.now() - 1000 },
    };
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(fs, "readFileSync").mockReturnValue(JSON.stringify(cache));

    const result = await fetchLongShortRatios("BTCUSDT");
    expect(result).toBeDefined();
    expect(result!.globalLSRatio).toBeCloseTo(2.0);
    expect(mockedGetLongShortRatio).not.toHaveBeenCalled();
  });

  it("calls getLongShortRatio on cache miss and writes to cache", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(false);
    vi.spyOn(fs, "mkdirSync").mockImplementation(() => undefined);
    const writeSpy = vi.spyOn(fs, "writeFileSync").mockImplementation(() => undefined);

    mockedGetLongShortRatio.mockResolvedValue({
      symbol: "BTCUSDT",
      globalLongRatio: 0.65,
      globalShortRatio: 0.35,
      globalLSRatio: 1.86,
      topAccountLSRatio: 1.42,
      topPositionLSRatio: 1.10,
      sentiment: "long_biased",
      sentimentLabel: "Retail leaning long",
    });

    const result = await fetchLongShortRatios("BTCUSDT");
    expect(result).toBeDefined();
    expect(result!.globalLSRatio).toBeCloseTo(1.86);
    expect(result!.topAccountLSRatio).toBeCloseTo(1.42);
    expect(writeSpy).toHaveBeenCalled();
  });

  it("returns undefined when getLongShortRatio throws", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(false);
    mockedGetLongShortRatio.mockRejectedValue(new Error("network error"));

    const result = await fetchLongShortRatios("BTCUSDT");
    expect(result).toBeUndefined();
  });

  it("cache hit is case-insensitive for symbol", async () => {
    const cache: LongShortCache = {
      ETHUSDT: { globalLSRatio: 0.8, topAccountLSRatio: 1.1, fetchedAt: Date.now() - 1000 },
    };
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(fs, "readFileSync").mockReturnValue(JSON.stringify(cache));

    const result = await fetchLongShortRatios("ethusdt");
    expect(result).toBeDefined();
    expect(result!.globalLSRatio).toBeCloseTo(0.8);
  });
});

// ─── Signal Conditions ────────────────────────────────────────────

describe("L/S ratio signal conditions", () => {
  it("ls_ratio_extreme_long triggers when longShortRatio > 3.0", () => {
    const cfg = makeCfg();
    cfg.signals = { buy: [], sell: ["ls_ratio_extreme_long"] };
    const ind = makeIndicators({ longShortRatio: 3.5 });

    const signal = detectSignal("BTCUSDT", ind, cfg, "long");
    expect(signal.type).toBe("sell");
    expect(signal.reason).toContain("ls_ratio_extreme_long");
  });

  it("ls_ratio_extreme_long does NOT trigger when longShortRatio <= 3.0", () => {
    const cfg = makeCfg();
    cfg.signals = { buy: [], sell: ["ls_ratio_extreme_long"] };
    const ind = makeIndicators({ longShortRatio: 2.9 });

    const signal = detectSignal("BTCUSDT", ind, cfg, "long");
    expect(signal.type).toBe("none");
  });

  it("ls_ratio_extreme_short triggers when longShortRatio < 0.5", () => {
    const cfg = makeCfg();
    cfg.signals = { buy: ["ls_ratio_extreme_short"], sell: [] };
    const ind = makeIndicators({ longShortRatio: 0.3 });

    const signal = detectSignal("BTCUSDT", ind, cfg);
    expect(signal.type).toBe("buy");
    expect(signal.reason).toContain("ls_ratio_extreme_short");
  });

  it("ls_ratio_extreme_short does NOT trigger when longShortRatio >= 0.5", () => {
    const cfg = makeCfg();
    cfg.signals = { buy: ["ls_ratio_extreme_short"], sell: [] };
    const ind = makeIndicators({ longShortRatio: 0.5 });

    const signal = detectSignal("BTCUSDT", ind, cfg);
    expect(signal.type).toBe("none");
  });

  it("ls_ratio_long_biased triggers when longShortRatio > 1.8", () => {
    const cfg = makeCfg();
    cfg.signals = { buy: [], sell: ["ls_ratio_long_biased"] };
    const ind = makeIndicators({ longShortRatio: 2.0 });

    const signal = detectSignal("BTCUSDT", ind, cfg, "long");
    expect(signal.type).toBe("sell");
  });

  it("ls_ratio_short_biased triggers when longShortRatio < 0.8", () => {
    const cfg = makeCfg();
    cfg.signals = { buy: ["ls_ratio_short_biased"], sell: [] };
    const ind = makeIndicators({ longShortRatio: 0.7 });

    const signal = detectSignal("BTCUSDT", ind, cfg);
    expect(signal.type).toBe("buy");
  });

  it("custom threshold overrides default", () => {
    const cfg = makeCfg({
      long_short_ratio: { extreme_long_threshold: 2.0 },
    });
    cfg.signals = { buy: [], sell: ["ls_ratio_extreme_long"] };
    const ind = makeIndicators({ longShortRatio: 2.5 });

    const signal = detectSignal("BTCUSDT", ind, cfg, "long");
    expect(signal.type).toBe("sell");
  });

  it("undefined longShortRatio → condition returns false", () => {
    const cfg = makeCfg();
    cfg.signals = { buy: ["ls_ratio_extreme_short"], sell: [] };
    const ind = makeIndicators(); // no longShortRatio

    const signal = detectSignal("BTCUSDT", ind, cfg);
    expect(signal.type).toBe("none");
  });
});
