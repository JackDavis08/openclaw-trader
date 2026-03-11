/**
 * In-Memory Kline Cache
 *
 * Wraps fetchHistoricalKlines with a Map-based cache to avoid
 * redundant API calls and JSON.parse overhead when the same
 * symbol/interval/range is requested multiple times (e.g. runCompare).
 */

import { fetchHistoricalKlines } from "./fetcher.js";
import { fetchAllSymbols, type FetchAllSymbolsOpts } from "./parallel-fetch.js";
import type { Kline } from "../types.js";

function cacheKey(symbol: string, interval: string, startMs: number, endMs: number): string {
  return `${symbol}|${interval}|${startMs}|${endMs}`;
}

export class KlineCache {
  private cache = new Map<string, Kline[]>();

  /** Check if data is cached for the given key */
  has(symbol: string, interval: string, startMs: number, endMs: number): boolean {
    return this.cache.has(cacheKey(symbol, interval, startMs, endMs));
  }

  /** Set cached klines for a specific key */
  set(symbol: string, interval: string, startMs: number, endMs: number, klines: Kline[]): void {
    this.cache.set(cacheKey(symbol, interval, startMs, endMs), klines);
  }

  /**
   * Get klines for a single symbol, fetching from API if not cached.
   */
  async get(
    symbol: string,
    interval: string,
    startMs: number,
    endMs: number
  ): Promise<Kline[]> {
    const key = cacheKey(symbol, interval, startMs, endMs);
    const cached = this.cache.get(key);
    if (cached) return cached;

    const klines = await fetchHistoricalKlines(symbol, interval, startMs, endMs);
    this.cache.set(key, klines);
    return klines;
  }

  /**
   * Get klines for multiple symbols, using parallel fetch for cold-cache misses.
   */
  async getAll(
    symbols: string[],
    interval: string,
    startMs: number,
    endMs: number,
    opts?: FetchAllSymbolsOpts
  ): Promise<Record<string, Kline[]>> {
    const result: Record<string, Kline[]> = {};
    const misses: string[] = [];

    for (const symbol of symbols) {
      const key = cacheKey(symbol, interval, startMs, endMs);
      const cached = this.cache.get(key);
      if (cached) {
        result[symbol] = cached;
      } else {
        misses.push(symbol);
      }
    }

    if (misses.length > 0) {
      const fetched = await fetchAllSymbols(misses, interval, startMs, endMs, opts);
      for (const [symbol, klines] of Object.entries(fetched)) {
        this.cache.set(cacheKey(symbol, interval, startMs, endMs), klines);
        result[symbol] = klines;
      }
    }

    return result;
  }

  /** Approximate memory usage in MB */
  memoryUsageMB(): number {
    let totalEntries = 0;
    for (const klines of this.cache.values()) {
      totalEntries += klines.length;
    }
    // Each Kline has ~7 numeric fields × 8 bytes ≈ 56 bytes + object overhead ≈ ~100 bytes
    return (totalEntries * 100) / (1024 * 1024);
  }

  /** Clear all cached data */
  clear(): void {
    this.cache.clear();
  }
}
