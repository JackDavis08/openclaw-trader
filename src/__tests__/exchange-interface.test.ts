/**
 * Exchange interface tests — factory + DataProvider injection
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Kline } from "../types.js";
import type { IExchange } from "../exchange/types.js";
import { DataProvider, type KlineFetcher } from "../exchange/data-provider.js";

// ── Mock binance.ts so DataProvider default fetcher doesn't hit the network ──
vi.mock("../exchange/binance.js", () => ({
  getKlines: vi.fn(),
}));

// ── Mock fs for BinanceClient constructor (reads credentials file) ──
vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs")>();
  return {
    ...actual,
    default: {
      ...actual,
      readFileSync: vi.fn().mockReturnValue(
        JSON.stringify({ apiKey: "test-key", secretKey: "test-secret" })
      ),
    },
  };
});

// After mocking, import the factory
import { createExchange } from "../exchange/factory.js";
import { BinanceClient } from "../exchange/binance-client.js";

function makeKlines(n: number, basePrice = 100): Kline[] {
  return Array.from({ length: n }, (_, i) => ({
    openTime: i * 3_600_000,
    open: basePrice,
    high: basePrice * 1.01,
    low: basePrice * 0.99,
    close: basePrice + i * 0.1,
    volume: 1000,
    closeTime: (i + 1) * 3_600_000,
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ─────────────────────────────────────────────────────
// createExchange factory
// ─────────────────────────────────────────────────────

describe("createExchange factory", () => {
  it("returns a BinanceClient for name='binance'", () => {
    const exchange = createExchange({
      name: "binance",
      market: "spot",
      credentials_path: ".secrets/binance.json",
    });
    expect(exchange).toBeInstanceOf(BinanceClient);
  });

  it("returns a BinanceClient when name is omitted (default)", () => {
    const exchange = createExchange({
      market: "futures",
      credentials_path: ".secrets/binance.json",
    });
    expect(exchange).toBeInstanceOf(BinanceClient);
  });

  it("throws for unsupported exchange name", () => {
    expect(() =>
      createExchange({
        name: "okx" as any,
        market: "spot",
      })
    ).toThrow(/Unsupported exchange.*okx/);
  });
});

// ─────────────────────────────────────────────────────
// BinanceClient satisfies IExchange
// ─────────────────────────────────────────────────────

describe("BinanceClient implements IExchange", () => {
  it("has all IExchange methods", () => {
    const exchange: IExchange = createExchange({
      market: "spot",
      credentials_path: ".secrets/binance.json",
    });

    // Verify all IExchange methods exist and are functions
    const methods: (keyof IExchange)[] = [
      "ping",
      "getPrice",
      "getKlines",
      "getSymbolInfo",
      "getAccountInfo",
      "getUsdtBalance",
      "getFuturesPositions",
      "createOrder",
      "marketBuy",
      "marketSell",
      "marketBuyByQty",
      "placeStopLossOrder",
      "placeTakeProfitOrder",
      "cancelOrder",
      "getOrder",
      "getOpenOrders",
    ];

    for (const m of methods) {
      expect(typeof exchange[m]).toBe("function");
    }
  });
});

// ─────────────────────────────────────────────────────
// DataProvider with injected KlineFetcher
// ─────────────────────────────────────────────────────

describe("DataProvider — injectable KlineFetcher", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("uses injected fetcher instead of legacy getKlines", async () => {
    const klines = makeKlines(10);
    const mockFetcher: KlineFetcher = vi.fn().mockResolvedValue(klines);

    const provider = new DataProvider(30, mockFetcher);
    await provider.refresh(["BTCUSDT"], "1h", 60);

    expect(mockFetcher).toHaveBeenCalledWith("BTCUSDT", "1h", 60);
    expect(provider.get("BTCUSDT", "1h")).toEqual(klines);
  });

  it("injected fetcher respects cache TTL", async () => {
    const mockFetcher: KlineFetcher = vi.fn().mockResolvedValue(makeKlines(10));

    const provider = new DataProvider(30, mockFetcher);
    await provider.refresh(["BTCUSDT"], "1h", 60);

    // Within TTL — no re-fetch
    vi.advanceTimersByTime(10_000);
    await provider.refresh(["BTCUSDT"], "1h", 60);
    expect(mockFetcher).toHaveBeenCalledTimes(1);

    // After TTL — re-fetch
    vi.advanceTimersByTime(21_000);
    await provider.refresh(["BTCUSDT"], "1h", 60);
    expect(mockFetcher).toHaveBeenCalledTimes(2);
  });

  it("fetcher failure is handled silently", async () => {
    const mockFetcher: KlineFetcher = vi.fn()
      .mockRejectedValueOnce(new Error("timeout"))
      .mockResolvedValueOnce(makeKlines(10, 200));

    const provider = new DataProvider(30, mockFetcher);
    await provider.refresh(["BTCUSDT", "ETHUSDT"], "1h", 60);

    expect(provider.get("BTCUSDT", "1h")).toBeUndefined();
    expect(provider.get("ETHUSDT", "1h")).toBeDefined();
  });
});
