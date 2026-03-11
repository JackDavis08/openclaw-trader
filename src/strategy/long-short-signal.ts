/**
 * Long/Short Ratio Contrarian Signal
 *
 * Logic: Extreme L/S ratio = retail heavily skewed to one side = reversal precursor
 *
 *   Global L/S ratio > 3.0  -> retail extremely long -> contrarian top signal (ls_ratio_extreme_long)
 *   Global L/S ratio < 0.5  -> retail extremely short -> contrarian bottom signal (ls_ratio_extreme_short)
 *   Global L/S ratio > 1.8  -> retail leaning long -> mild warning (ls_ratio_long_biased)
 *   Global L/S ratio < 0.8  -> retail leaning short -> mild signal (ls_ratio_short_biased)
 *
 * Data source: Binance Futures globalLongShortAccountRatio + topLongShortAccountRatio
 *
 * Usage:
 *   Add to buy/sell/short/cover conditions in strategy.yaml:
 *     buy:  [ma_bullish, ls_ratio_extreme_short]   # retail shorts crowded + uptrend = strong long
 *     short: [ma_bearish, ls_ratio_extreme_long]    # retail longs crowded + downtrend = strong short
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getLongShortRatio } from "../exchange/derivatives-data.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LS_CACHE_PATH = path.resolve(__dirname, "../../logs/long-short-cache.json");

// ─── Types ──────────────────────────────────────────────

export type LongShortCache = Record<string, {
  globalLSRatio: number;       // Global account L/S ratio
  topAccountLSRatio: number;   // Top trader account L/S ratio
  fetchedAt: number;           // Fetch timestamp (ms)
}>;

// ─── Cache IO ──────────────────────────────────────────

/** Read long/short ratio cache (returns undefined if miss or expired) */
export function readLongShortCache(
  symbol: string,
  maxAgeMs = 5 * 60_000
): { globalLSRatio: number; topAccountLSRatio: number } | undefined {
  try {
    if (!fs.existsSync(LS_CACHE_PATH)) return undefined;
    const cache = JSON.parse(fs.readFileSync(LS_CACHE_PATH, "utf-8")) as LongShortCache;
    const entry = cache[symbol.toUpperCase()];
    if (!entry) return undefined;
    if (Date.now() - entry.fetchedAt > maxAgeMs) return undefined;
    return { globalLSRatio: entry.globalLSRatio, topAccountLSRatio: entry.topAccountLSRatio };
  } catch {
    return undefined;
  }
}

/** Write long/short ratio cache */
export function writeLongShortCache(
  symbol: string,
  data: { globalLSRatio: number; topAccountLSRatio: number }
): void {
  let cache: LongShortCache = {};
  try {
    if (fs.existsSync(LS_CACHE_PATH)) {
      cache = JSON.parse(fs.readFileSync(LS_CACHE_PATH, "utf-8")) as LongShortCache;
    }
  } catch { /* Read failed, create new */ }
  cache[symbol.toUpperCase()] = { ...data, fetchedAt: Date.now() };
  fs.mkdirSync(path.dirname(LS_CACHE_PATH), { recursive: true });
  fs.writeFileSync(LS_CACHE_PATH, JSON.stringify(cache, null, 2));
}

// ─── Fetch Long/Short Ratios (with cache) ───────────────────────────

/**
 * Fetch long/short ratios (reads cache first, valid for 5 minutes)
 * Returns { globalLSRatio, topAccountLSRatio } or undefined on failure
 */
export async function fetchLongShortRatios(
  symbol: string
): Promise<{ globalLSRatio: number; topAccountLSRatio: number } | undefined> {
  // Read cache first
  const cached = readLongShortCache(symbol);
  if (cached !== undefined) return cached;

  // Cache expired or doesn't exist, fetch new data
  try {
    const lsData = await getLongShortRatio(symbol);
    const result = {
      globalLSRatio: lsData.globalLSRatio,
      topAccountLSRatio: lsData.topAccountLSRatio,
    };
    writeLongShortCache(symbol, result);
    return result;
  } catch {
    return undefined;
  }
}
