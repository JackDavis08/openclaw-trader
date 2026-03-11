/**
 * Parallel Symbol Fetch — Concurrent kline fetching with semaphore
 *
 * Fetches multiple symbols concurrently (default concurrency=3) while
 * respecting Binance rate limits. Each symbol's internal pagination
 * keeps the 250ms delay; different symbols run in parallel.
 */

import { fetchHistoricalKlines } from "./fetcher.js";
import type { Kline } from "../types.js";

/**
 * Async semaphore: limits concurrent async operations.
 */
class Semaphore {
  private queue: (() => void)[] = [];
  private running = 0;

  constructor(private readonly limit: number) {}

  async acquire(): Promise<void> {
    if (this.running < this.limit) {
      this.running++;
      return;
    }
    return new Promise<void>((resolve) => {
      this.queue.push(resolve);
    });
  }

  release(): void {
    const next = this.queue.shift();
    if (next) {
      next(); // hand the slot to the next waiter
    } else {
      this.running--;
    }
  }
}

export interface FetchAllSymbolsOpts {
  /** Max concurrent symbol fetches (default 3) */
  concurrency?: number;
  /** Progress callback per symbol completion */
  onProgress?: (symbol: string, barCount: number) => void;
}

/**
 * Fetch historical klines for multiple symbols concurrently.
 *
 * @param symbols  Trading pairs to fetch
 * @param interval Kline interval (e.g. "1h", "4h")
 * @param startMs  Start timestamp (ms)
 * @param endMs    End timestamp (ms)
 * @param opts     Concurrency and progress options
 * @returns Record mapping symbol → Kline[]
 */
export async function fetchAllSymbols(
  symbols: string[],
  interval: string,
  startMs: number,
  endMs: number,
  opts?: FetchAllSymbolsOpts
): Promise<Record<string, Kline[]>> {
  if (symbols.length === 0) return {};

  const concurrency = opts?.concurrency ?? 3;
  const sem = new Semaphore(concurrency);
  const result: Record<string, Kline[]> = {};
  const errors: { symbol: string; error: Error }[] = [];

  const tasks = symbols.map(async (symbol) => {
    await sem.acquire();
    try {
      const klines = await fetchHistoricalKlines(symbol, interval, startMs, endMs);
      result[symbol] = klines;
      opts?.onProgress?.(symbol, klines.length);
    } catch (err: unknown) {
      errors.push({
        symbol,
        error: err instanceof Error ? err : new Error(String(err)),
      });
    } finally {
      sem.release();
    }
  });

  await Promise.all(tasks);

  // If some symbols failed, still return the successful ones but log warnings
  for (const { symbol, error } of errors) {
    console.warn(`[parallel-fetch] Failed to fetch ${symbol}: ${error.message}`);
    result[symbol] = [];
  }

  return result;
}
