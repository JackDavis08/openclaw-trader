import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchAllSymbols } from "../backtest/parallel-fetch.js";

// Mock fetchHistoricalKlines
vi.mock("../backtest/fetcher.js", () => ({
  fetchHistoricalKlines: vi.fn(
    async (symbol: string, _interval: string, _startMs: number, _endMs: number) => {
      // Simulate async delay
      await new Promise((r) => setTimeout(r, 10));
      return [
        { openTime: 1000, open: 1, high: 2, low: 0.5, close: 1.5, volume: 100, closeTime: 2000 },
        { openTime: 2000, open: 1.5, high: 3, low: 1, close: 2, volume: 200, closeTime: 3000 },
      ];
    }
  ),
}));

import { fetchHistoricalKlines } from "../backtest/fetcher.js";
const mockFetch = vi.mocked(fetchHistoricalKlines);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("fetchAllSymbols", () => {
  it("returns empty object for empty symbols array", async () => {
    const result = await fetchAllSymbols([], "1h", 0, 1000);
    expect(result).toEqual({});
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("fetches all symbols and returns correct data", async () => {
    const result = await fetchAllSymbols(["BTCUSDT", "ETHUSDT"], "1h", 0, 1000);
    expect(Object.keys(result)).toHaveLength(2);
    expect(result["BTCUSDT"]).toHaveLength(2);
    expect(result["ETHUSDT"]).toHaveLength(2);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("respects concurrency limit", async () => {
    let concurrent = 0;
    let maxConcurrent = 0;

    mockFetch.mockImplementation(async () => {
      concurrent++;
      if (concurrent > maxConcurrent) maxConcurrent = concurrent;
      await new Promise((r) => setTimeout(r, 50));
      concurrent--;
      return [{ openTime: 0, open: 1, high: 2, low: 0.5, close: 1, volume: 10, closeTime: 100 }];
    });

    await fetchAllSymbols(
      ["A", "B", "C", "D", "E"],
      "1h", 0, 1000,
      { concurrency: 2 }
    );

    expect(maxConcurrent).toBeLessThanOrEqual(2);
    expect(mockFetch).toHaveBeenCalledTimes(5);
  });

  it("concurrency=1 means serial execution", async () => {
    let concurrent = 0;
    let maxConcurrent = 0;

    mockFetch.mockImplementation(async () => {
      concurrent++;
      if (concurrent > maxConcurrent) maxConcurrent = concurrent;
      await new Promise((r) => setTimeout(r, 10));
      concurrent--;
      return [];
    });

    await fetchAllSymbols(["A", "B", "C"], "1h", 0, 1000, { concurrency: 1 });
    expect(maxConcurrent).toBe(1);
  });

  it("invokes onProgress callback per symbol", async () => {
    const progress: { symbol: string; count: number }[] = [];

    await fetchAllSymbols(["BTCUSDT", "ETHUSDT"], "1h", 0, 1000, {
      onProgress: (symbol, count) => progress.push({ symbol, count }),
    });

    expect(progress).toHaveLength(2);
    expect(progress.map((p) => p.symbol).sort()).toEqual(["BTCUSDT", "ETHUSDT"]);
  });

  it("error in one symbol does not block others", async () => {
    mockFetch.mockImplementation(async (symbol) => {
      if (symbol === "BADUSDT") throw new Error("API error");
      return [{ openTime: 0, open: 1, high: 2, low: 0.5, close: 1, volume: 10, closeTime: 100 }];
    });

    // Should not throw
    const result = await fetchAllSymbols(["BTCUSDT", "BADUSDT", "ETHUSDT"], "1h", 0, 1000);

    expect(result["BTCUSDT"]).toHaveLength(1);
    expect(result["ETHUSDT"]).toHaveLength(1);
    // Failed symbol gets empty array
    expect(result["BADUSDT"]).toEqual([]);
  });
});
