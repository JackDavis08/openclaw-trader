/**
 * Portfolio Rebalancing Tests (v0.8)
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { computeRebalanceOrders, shouldRebalance } from "../strategy/rebalance.js";
import type { RebalanceConfig } from "../strategy/rebalance.js";

// ─────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────

function makeConfig(overrides: Partial<RebalanceConfig> = {}): RebalanceConfig {
  return {
    enabled: true,
    target_weights: { BTCUSDT: 0.5, ETHUSDT: 0.3, SOLUSDT: 0.2 },
    deviation_threshold: 0.05,
    max_rebalance_ratio: 0.10,
    interval_hours: 24,
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────
// computeRebalanceOrders Tests
// ─────────────────────────────────────────────────────

describe("computeRebalanceOrders", () => {
  it("portfolio at target → no orders", () => {
    const config = makeConfig();
    const positions = { BTCUSDT: 5000, ETHUSDT: 3000, SOLUSDT: 2000 };
    const prices = { BTCUSDT: 50000, ETHUSDT: 3000, SOLUSDT: 100 };
    const result = computeRebalanceOrders(config, positions, prices, 10000);

    expect(result.rebalanceNeeded).toBe(false);
    expect(result.orders).toHaveLength(0);
  });

  it("underweight symbol → buy order", () => {
    const config = makeConfig({ target_weights: { BTCUSDT: 0.5 } });
    // BTC is only 30% of portfolio (3000/10000), target is 50%
    const positions = { BTCUSDT: 3000 };
    const prices = { BTCUSDT: 50000 };
    const result = computeRebalanceOrders(config, positions, prices, 10000);

    expect(result.rebalanceNeeded).toBe(true);
    expect(result.orders).toHaveLength(1);
    expect(result.orders[0]!.action).toBe("buy");
    expect(result.orders[0]!.symbol).toBe("BTCUSDT");
    // deviation = 0.3 - 0.5 = -0.2, amount = 0.2 * 10000 = 2000, capped at max_rebalance_ratio * 10000 = 1000
    expect(result.orders[0]!.amountUsdt).toBe(1000);
  });

  it("overweight symbol → sell order", () => {
    const config = makeConfig({ target_weights: { BTCUSDT: 0.3 } });
    // BTC is 60% of portfolio (6000/10000), target is 30%
    const positions = { BTCUSDT: 6000 };
    const prices = { BTCUSDT: 50000 };
    const result = computeRebalanceOrders(config, positions, prices, 10000);

    expect(result.rebalanceNeeded).toBe(true);
    expect(result.orders).toHaveLength(1);
    expect(result.orders[0]!.action).toBe("sell");
    expect(result.orders[0]!.symbol).toBe("BTCUSDT");
  });

  it("deviation below threshold → no orders", () => {
    const config = makeConfig({
      target_weights: { BTCUSDT: 0.50 },
      deviation_threshold: 0.05,
    });
    // BTC at 48% (4800/10000), deviation = -0.02 < 0.05 threshold
    const positions = { BTCUSDT: 4800 };
    const prices = { BTCUSDT: 50000 };
    const result = computeRebalanceOrders(config, positions, prices, 10000);

    expect(result.rebalanceNeeded).toBe(false);
    expect(result.orders).toHaveLength(0);
  });

  it("caps order at max_rebalance_ratio", () => {
    const config = makeConfig({
      target_weights: { BTCUSDT: 0.8 },
      max_rebalance_ratio: 0.10,
    });
    // BTC at 10% (1000/10000), target 80%, deviation = -0.70
    // Raw amount = 7000, but capped at 0.10 * 10000 = 1000
    const positions = { BTCUSDT: 1000 };
    const prices = { BTCUSDT: 50000 };
    const result = computeRebalanceOrders(config, positions, prices, 10000);

    expect(result.rebalanceNeeded).toBe(true);
    expect(result.orders[0]!.amountUsdt).toBe(1000);
  });

  it("sells sorted before buys", () => {
    const config = makeConfig({
      target_weights: { BTCUSDT: 0.3, ETHUSDT: 0.5 },
    });
    // BTC at 60% (overweight → sell), ETH at 10% (underweight → buy)
    const positions = { BTCUSDT: 6000, ETHUSDT: 1000 };
    const prices = { BTCUSDT: 50000, ETHUSDT: 3000 };
    const result = computeRebalanceOrders(config, positions, prices, 10000);

    expect(result.rebalanceNeeded).toBe(true);
    expect(result.orders.length).toBeGreaterThanOrEqual(2);
    // First order should be sell
    expect(result.orders[0]!.action).toBe("sell");
    // Last order should be buy
    expect(result.orders[result.orders.length - 1]!.action).toBe("buy");
  });

  it("disabled config → no orders", () => {
    const config = makeConfig({ enabled: false });
    const positions = { BTCUSDT: 1000 };
    const prices = { BTCUSDT: 50000 };
    const result = computeRebalanceOrders(config, positions, prices, 10000);

    expect(result.rebalanceNeeded).toBe(false);
    expect(result.reason).toBe("rebalance disabled");
  });

  it("empty portfolio (no positions) → generates buy orders for targets", () => {
    const config = makeConfig({ target_weights: { BTCUSDT: 0.5 } });
    const positions: Record<string, number> = {};
    const prices = { BTCUSDT: 50000 };
    const result = computeRebalanceOrders(config, positions, prices, 10000);

    expect(result.rebalanceNeeded).toBe(true);
    expect(result.orders).toHaveLength(1);
    expect(result.orders[0]!.action).toBe("buy");
    expect(result.orders[0]!.currentWeight).toBe(0);
  });

  it("single symbol portfolio at target → no orders", () => {
    const config = makeConfig({ target_weights: { BTCUSDT: 0.5 } });
    const positions = { BTCUSDT: 5000 };
    const prices = { BTCUSDT: 50000 };
    const result = computeRebalanceOrders(config, positions, prices, 10000);

    expect(result.rebalanceNeeded).toBe(false);
  });

  it("total equity = 0 → no orders", () => {
    const config = makeConfig();
    const positions: Record<string, number> = {};
    const prices: Record<string, number> = {};
    const result = computeRebalanceOrders(config, positions, prices, 0);

    expect(result.rebalanceNeeded).toBe(false);
    expect(result.reason).toBe("total equity is zero");
  });
});

// ─────────────────────────────────────────────────────
// shouldRebalance Tests
// ─────────────────────────────────────────────────────

describe("shouldRebalance", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("first time (lastRebalanceAt = 0) → true", () => {
    const config = makeConfig();
    expect(shouldRebalance(config, 0)).toBe(true);
  });

  it("within interval → false", () => {
    const config = makeConfig({ interval_hours: 24 });
    // Last rebalance 1 hour ago
    const lastRebalanceAt = Date.now() - 1 * 3600_000;
    expect(shouldRebalance(config, lastRebalanceAt)).toBe(false);
  });

  it("past interval → true", () => {
    const config = makeConfig({ interval_hours: 24 });
    // Last rebalance 25 hours ago
    const lastRebalanceAt = Date.now() - 25 * 3600_000;
    expect(shouldRebalance(config, lastRebalanceAt)).toBe(true);
  });

  it("disabled → false", () => {
    const config = makeConfig({ enabled: false });
    expect(shouldRebalance(config, 0)).toBe(false);
  });
});
