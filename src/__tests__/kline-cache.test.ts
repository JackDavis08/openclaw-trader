import { describe, it, expect, vi, beforeEach } from "vitest";
import { KlineCache } from "../backtest/kline-cache.js";
import type { Kline } from "../types.js";

const mockKlines: Kline[] = [
  { openTime: 1000, open: 1, high: 2, low: 0.5, close: 1.5, volume: 100, closeTime: 2000 },
  { openTime: 2000, open: 1.5, high: 3, low: 1, close: 2, volume: 200, closeTime: 3000 },
];

// Mock fetcher and parallel-fetch
vi.mock("../backtest/fetcher.js", () => ({
  fetchHistoricalKlines: vi.fn(async () => [...mockKlines]),
}));

vi.mock("../backtest/parallel-fetch.js", () => ({
  fetchAllSymbols: vi.fn(async (symbols: string[]) => {
    const result: Record<string, Kline[]> = {};
    for (const s of symbols) result[s] = [...mockKlines];
    return result;
  }),
}));

import { fetchHistoricalKlines } from "../backtest/fetcher.js";
import { fetchAllSymbols } from "../backtest/parallel-fetch.js";

const mockFetch = vi.mocked(fetchHistoricalKlines);
const mockFetchAll = vi.mocked(fetchAllSymbols);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("KlineCache", () => {
  it("cache miss delegates to fetchHistoricalKlines", async () => {
    const cache = new KlineCache();
    const result = await cache.get("BTCUSDT", "1h", 0, 1000);

    expect(result).toHaveLength(2);
    expect(mockFetch).toHaveBeenCalledOnce();
    expect(mockFetch).toHaveBeenCalledWith("BTCUSDT", "1h", 0, 1000);
  });

  it("cache hit does not re-fetch", async () => {
    const cache = new KlineCache();

    // First call — miss
    await cache.get("BTCUSDT", "1h", 0, 1000);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Second call — hit
    const result = await cache.get("BTCUSDT", "1h", 0, 1000);
    expect(mockFetch).toHaveBeenCalledTimes(1); // still 1
    expect(result).toHaveLength(2);
  });

  it("getAll() populates per-symbol cache entries", async () => {
    const cache = new KlineCache();

    const result = await cache.getAll(["BTCUSDT", "ETHUSDT"], "1h", 0, 1000);
    expect(Object.keys(result)).toHaveLength(2);
    expect(mockFetchAll).toHaveBeenCalledOnce();

    // Now individual gets should be cache hits
    await cache.get("BTCUSDT", "1h", 0, 1000);
    await cache.get("ETHUSDT", "1h", 0, 1000);
    expect(mockFetch).not.toHaveBeenCalled(); // no individual fetches
  });

  it("clear() empties the cache", async () => {
    const cache = new KlineCache();

    await cache.get("BTCUSDT", "1h", 0, 1000);
    expect(cache.has("BTCUSDT", "1h", 0, 1000)).toBe(true);

    cache.clear();
    expect(cache.has("BTCUSDT", "1h", 0, 1000)).toBe(false);

    // Fetching again should call the API
    await cache.get("BTCUSDT", "1h", 0, 1000);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("memoryUsageMB() returns reasonable value", async () => {
    const cache = new KlineCache();

    expect(cache.memoryUsageMB()).toBe(0);

    await cache.get("BTCUSDT", "1h", 0, 1000);
    const usage = cache.memoryUsageMB();
    expect(usage).toBeGreaterThan(0);
    expect(usage).toBeLessThan(1); // 2 klines should be well under 1MB
  });
});
