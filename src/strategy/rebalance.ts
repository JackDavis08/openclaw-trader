/**
 * Portfolio Rebalancing Module (v0.8)
 *
 * Cross-symbol target-weight deviation detection + corrective orders.
 * Runs as a separate check after the main signal loop in monitors.
 * Does NOT use the strategy plugin system — directly computes orders.
 */

// ─────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────

export interface RebalanceOrder {
  symbol: string;
  action: "buy" | "sell";
  amountUsdt: number;
  currentWeight: number;
  targetWeight: number;
  deviation: number;
}

export interface RebalanceResult {
  orders: RebalanceOrder[];
  rebalanceNeeded: boolean;
  reason: string;
}

export interface RebalanceConfig {
  enabled: boolean;
  target_weights: Record<string, number>;  // symbol → weight (sum ≈ 1.0)
  deviation_threshold: number;             // default 0.05 (5%)
  max_rebalance_ratio: number;            // max single rebalance as % of equity (default 0.10)
  interval_hours?: number;                // min hours between rebalances (default 24)
}

// ─────────────────────────────────────────────────────
// Core Logic
// ─────────────────────────────────────────────────────

/**
 * Compute rebalance orders based on target weights vs current portfolio.
 *
 * @param config         Rebalance configuration
 * @param positions      Current positions: symbol → notional value in USDT
 * @param prices         Current prices: symbol → price (used for reference, positions already in USDT)
 * @param totalEquity    Total portfolio equity in USDT (cash + all positions)
 */
export function computeRebalanceOrders(
  config: RebalanceConfig,
  positions: Record<string, number>,  // symbol → notional USDT
  _prices: Record<string, number>,
  totalEquity: number,
): RebalanceResult {
  if (!config.enabled) {
    return { orders: [], rebalanceNeeded: false, reason: "rebalance disabled" };
  }

  if (totalEquity <= 0) {
    return { orders: [], rebalanceNeeded: false, reason: "total equity is zero" };
  }

  const threshold = config.deviation_threshold;
  const maxRebalanceUsdt = config.max_rebalance_ratio * totalEquity;
  const orders: RebalanceOrder[] = [];

  for (const [symbol, targetWeight] of Object.entries(config.target_weights)) {
    const notional = positions[symbol] ?? 0;
    const currentWeight = notional / totalEquity;
    const deviation = currentWeight - targetWeight;

    if (Math.abs(deviation) <= threshold) continue;

    if (deviation > 0) {
      // Overweight → sell
      const rawAmount = deviation * totalEquity;
      const cappedAmount = Math.min(rawAmount, maxRebalanceUsdt);
      orders.push({
        symbol,
        action: "sell",
        amountUsdt: cappedAmount,
        currentWeight,
        targetWeight,
        deviation,
      });
    } else {
      // Underweight → buy
      const rawAmount = Math.abs(deviation) * totalEquity;
      const cappedAmount = Math.min(rawAmount, maxRebalanceUsdt);
      orders.push({
        symbol,
        action: "buy",
        amountUsdt: cappedAmount,
        currentWeight,
        targetWeight,
        deviation,
      });
    }
  }

  if (orders.length === 0) {
    return { orders: [], rebalanceNeeded: false, reason: "all weights within threshold" };
  }

  // Sort: sells first (free capital), then buys
  orders.sort((a, b) => {
    if (a.action === "sell" && b.action === "buy") return -1;
    if (a.action === "buy" && b.action === "sell") return 1;
    return 0;
  });

  return {
    orders,
    rebalanceNeeded: true,
    reason: `${orders.length} symbol(s) deviated beyond ${(threshold * 100).toFixed(1)}% threshold`,
  };
}

/**
 * Check whether enough time has passed since last rebalance.
 *
 * @param config          Rebalance configuration
 * @param lastRebalanceAt Timestamp of last rebalance (0 = never)
 */
export function shouldRebalance(
  config: RebalanceConfig,
  lastRebalanceAt: number,
): boolean {
  if (!config.enabled) return false;
  const intervalMs = (config.interval_hours ?? 24) * 3600_000;
  if (lastRebalanceAt === 0) return true;
  return Date.now() - lastRebalanceAt >= intervalMs;
}
