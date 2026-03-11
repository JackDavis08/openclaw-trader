/**
 * Grid Trading Strategy Plugin (v0.8)
 *
 * Range-bound grid trading using populateSignal() + adjustPosition() + shouldExit() hooks.
 *
 * Constraint: system supports one position per symbol. Grid works within this by:
 *   - Initial entry: populateSignal() returns "buy" when price drops to first unfilled grid level
 *   - Grid DCA: adjustPosition() returns USDT amount when price hits lower unfilled levels
 *   - Grid TP: shouldExit() returns exit when price rises above entry with grid-level profit
 *   - State: StateStore tracks filled/unfilled grid levels across candles
 *
 * Usage (strategy profile):
 *   strategy_id: "grid"
 *   strategy.grid.enabled: true
 */

import type { Strategy, StrategyContext, ExitResult, TradeResult } from "./types.js";
import type { SignalType, Kline } from "../types.js";
import { registerStrategy } from "./registry.js";

// ─────────────────────────────────────────────────────
// Grid State (persisted via StateStore)
// ─────────────────────────────────────────────────────

export interface GridState {
  upper: number;
  lower: number;
  levels: number[];          // computed grid price levels (sorted ascending)
  filledLevels: number[];    // levels where we bought
  lastSignalLevel: number | null;
  initializedAt: number;
}

// ─────────────────────────────────────────────────────
// Helper Functions (exported for testing)
// ─────────────────────────────────────────────────────

/**
 * Compute grid price levels between upper and lower bounds.
 * Returns sorted ascending price levels.
 */
export function computeGridLevels(
  upper: number,
  lower: number,
  count: number,
  type: "arithmetic" | "geometric",
): number[] {
  if (count < 2 || upper <= lower || lower <= 0) return [];
  const levels: number[] = [];
  for (let i = 0; i < count; i++) {
    if (type === "arithmetic") {
      levels.push(lower + i * (upper - lower) / (count - 1));
    } else {
      // geometric
      levels.push(lower * Math.pow(upper / lower, i / (count - 1)));
    }
  }
  return levels;
}

/**
 * Auto-detect price range from recent klines high/low with 2% padding.
 */
export function autoDetectRange(
  klines: Kline[],
  lookback: number,
): { upper: number; lower: number } {
  const window = klines.slice(-lookback);
  if (window.length === 0) return { upper: 0, lower: 0 };
  let high = -Infinity;
  let low = Infinity;
  for (const k of window) {
    if (k.high > high) high = k.high;
    if (k.low < low) low = k.low;
  }
  // 2% padding
  const padding = (high - low) * 0.02;
  return {
    upper: high + padding,
    lower: Math.max(low - padding, 0.0001), // prevent non-positive lower
  };
}

const GRID_STATE_KEY = "gridState";

const gridStrategy: Strategy = {
  id: "grid",
  name: "Grid Trading",
  description:
    "Range-bound grid trading: buys at unfilled grid levels, DCA adds at lower levels, " +
    "takes profit at filled levels above entry. Suitable for sideways/ranging markets.",

  populateSignal(ctx: StrategyContext): SignalType {
    const { klines, cfg, indicators, stateStore, currentPosSide } = ctx;
    const gridCfg = cfg.strategy.grid;

    if (!gridCfg?.enabled || !stateStore) return "none";

    // Initialize or load grid state
    let state = stateStore.get<GridState | null>(GRID_STATE_KEY, null);
    if (!state) {
      let upper = gridCfg.upper;
      let lower = gridCfg.lower;
      const count = gridCfg.grid_count || 10;
      const type = gridCfg.grid_type || "arithmetic";

      if (gridCfg.auto_range || upper === 0 || lower === 0) {
        const range = autoDetectRange(klines, gridCfg.auto_range_lookback || 100);
        upper = range.upper;
        lower = range.lower;
      }

      const levels = computeGridLevels(upper, lower, count, type);
      if (levels.length === 0) return "none";

      state = {
        upper,
        lower,
        levels,
        filledLevels: [],
        lastSignalLevel: null,
        initializedAt: Date.now(),
      };
      stateStore.set(GRID_STATE_KEY, state);
    }

    const price = indicators.price;

    // No position: find lowest unfilled level at or below current price → buy
    if (currentPosSide === undefined) {
      // Find the highest unfilled level that price has dropped to or below
      const filledSet = new Set(state.filledLevels);
      const unfilledBelow = state.levels
        .filter((lvl) => !filledSet.has(lvl) && price <= lvl);

      if (unfilledBelow.length > 0) {
        // Buy at the lowest unfilled level we've reached
        const targetLevel = unfilledBelow[0]!; // lowest unfilled level at or below price
        state.filledLevels.push(targetLevel);
        state.lastSignalLevel = targetLevel;
        stateStore.set(GRID_STATE_KEY, state);
        return "buy";
      }
      return "none";
    }

    // Holding long: check if price crossed above a filled level for profit
    if (currentPosSide === "long") {
      // shouldExit handles grid TP — populateSignal returns "none" for held positions
      // Sell signal only if price is above the upper grid boundary (exit the grid entirely)
      if (price > state.upper) {
        return "sell";
      }
    }

    return "none";
  },

  adjustPosition(
    position: {
      symbol: string;
      side: "long" | "short";
      entryPrice: number;
      currentPrice: number;
      quantity: number;
      costBasis: number;
      profitRatio: number;
      holdMs: number;
      dcaCount: number;
    },
    ctx: StrategyContext,
  ): number | null {
    const { cfg, stateStore } = ctx;
    const gridCfg = cfg.strategy.grid;

    if (!gridCfg?.enabled || !stateStore) return null;

    const state = stateStore.get<GridState | null>(GRID_STATE_KEY, null);
    if (!state) return null;

    const price = position.currentPrice;
    const filledSet = new Set(state.filledLevels);

    // Find unfilled levels below the last filled level that price has reached
    const lastFilled = state.filledLevels.length > 0
      ? Math.min(...state.filledLevels)
      : Infinity;

    const unfilledBelow = state.levels
      .filter((lvl) => !filledSet.has(lvl) && lvl < lastFilled && price <= lvl);

    if (unfilledBelow.length > 0) {
      const targetLevel = unfilledBelow[0]!; // lowest unfilled level at or below price
      state.filledLevels.push(targetLevel);
      state.lastSignalLevel = targetLevel;
      stateStore.set(GRID_STATE_KEY, state);

      // Return USDT amount to add
      if (gridCfg.position_per_grid && gridCfg.position_per_grid > 0) {
        return gridCfg.position_per_grid;
      }
      // Fallback: use position_ratio * costBasis
      return cfg.risk.position_ratio * position.costBasis;
    }

    return null;
  },

  shouldExit(
    position: {
      symbol: string;
      side: "long" | "short";
      entryPrice: number;
      currentPrice: number;
      holdMs: number;
    },
    ctx: StrategyContext,
  ): ExitResult | null {
    const { cfg, stateStore } = ctx;
    const gridCfg = cfg.strategy.grid;

    if (!gridCfg?.enabled || !stateStore) return null;

    const state = stateStore.get<GridState | null>(GRID_STATE_KEY, null);
    if (!state || state.filledLevels.length === 0) return null;

    const price = position.currentPrice;
    const entry = position.entryPrice;

    // Check if price rose to a level above entry price (grid take-profit)
    // Find highest filled level that is above entry and price has reached
    const filledAboveEntry = state.filledLevels
      .filter((lvl) => lvl > entry)
      .sort((a, b) => b - a); // descending

    if (filledAboveEntry.length > 0 && price >= filledAboveEntry[0]!) {
      return { exit: true, reason: "grid_tp" };
    }

    // Also TP if price is above entry and reaches next unfilled level above
    const filledSet = new Set(state.filledLevels);
    const unfilledAboveEntry = state.levels
      .filter((lvl) => !filledSet.has(lvl) && lvl > entry);

    if (unfilledAboveEntry.length > 0 && price >= unfilledAboveEntry[0]!) {
      return { exit: true, reason: "grid_tp" };
    }

    return null;
  },

  onTradeClosed(result: TradeResult, ctx: StrategyContext): void {
    const { stateStore } = ctx;
    if (!stateStore) return;

    const state = stateStore.get<GridState | null>(GRID_STATE_KEY, null);
    if (!state) return;

    // On sell: unmark the highest filled level (makes it available for re-buy)
    if (result.side === "long" && state.filledLevels.length > 0) {
      const sorted = [...state.filledLevels].sort((a, b) => b - a);
      const highest = sorted[0]!;
      state.filledLevels = state.filledLevels.filter((lvl) => lvl !== highest);
      stateStore.set(GRID_STATE_KEY, state);
    }
  },
};

// Auto-register
registerStrategy(gridStrategy);

export { gridStrategy };
