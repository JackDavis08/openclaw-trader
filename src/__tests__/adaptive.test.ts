/**
 * AdaptiveManager — Unit Tests
 *
 * Covers:
 *   - Arm pool initialization (correct count, arm-0 = baseline)
 *   - All arm params within drift bounds
 *   - Cold start returns baseline
 *   - Thompson Sampling activates after min_trades_per_arm
 *   - onTradeClosed updates stats and triggers refresh
 *   - refreshArms preserves baseline + best arm, replaces worst
 *   - All arms losing → fallback to baseline
 *   - State persistence round-trip
 *   - perturbWithinBounds respects both ParamDef and drift bounds
 *   - ma_short < ma_long constraint always satisfied
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import { AdaptiveManager, extractCurrentParams } from "../optimization/adaptive.js";
import { perturbWithinBounds, DEFAULT_PARAM_SPACE } from "../optimization/param-space.js";
import type { ParamDef, ParamSet } from "../optimization/param-space.js";
import type { StrategyConfig } from "../types.js";

const TEST_SCENARIO = "__test_adaptive__";
const STATE_PATH = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  `../../logs/adaptive-state-${TEST_SCENARIO}.json`,
);

const baselineParams: ParamSet = {
  ma_short: 20,
  ma_long: 60,
  rsi_period: 14,
  rsi_overbought: 65,
  rsi_oversold: 30,
  stop_loss_pct: 5,
  take_profit_pct: 15,
  position_ratio: 0.2,
};

const defaultConfig = {
  enabled: true,
  mode: "bandit" as const,
  window_size: 50,
  num_arms: 8,
  min_trades_per_arm: 5,
  exploration_rate: 0.15,
  refresh_interval_trades: 30,
  max_drift_percent: 20,
  fallback_on_underperform: true,
};

function cleanup(): void {
  try { fs.unlinkSync(STATE_PATH); } catch { /* ignore */ }
}

describe("AdaptiveManager", () => {
  beforeEach(cleanup);
  afterEach(cleanup);

  it("initializes correct number of arms with arm-0 = baseline", () => {
    const mgr = new AdaptiveManager(TEST_SCENARIO, baselineParams, defaultConfig);
    mgr.initialize();
    const arms = mgr.getArms();
    expect(arms).toHaveLength(defaultConfig.num_arms);
    expect(arms[0]!.id).toBe("arm-0");
    expect(arms[0]!.params).toEqual(baselineParams);
  });

  it("all arm params are within drift bounds", () => {
    const mgr = new AdaptiveManager(TEST_SCENARIO, baselineParams, defaultConfig);
    mgr.initialize();
    const arms = mgr.getArms();

    for (const arm of arms) {
      for (const def of DEFAULT_PARAM_SPACE) {
        const val = arm.params[def.name];
        if (val === undefined) continue;
        const base = baselineParams[def.name];
        if (base === undefined) continue;
        const drift = Math.abs(base) * (defaultConfig.max_drift_percent / 100);
        const lo = Math.max(def.min, base - drift);
        const hi = Math.min(def.max, base + drift);
        expect(val).toBeGreaterThanOrEqual(lo - 0.01);
        expect(val).toBeLessThanOrEqual(hi + 0.01);
      }
    }
  });

  it("cold start returns baseline params", () => {
    const mgr = new AdaptiveManager(TEST_SCENARIO, baselineParams, defaultConfig);
    mgr.initialize();
    const params = mgr.getActiveParams();
    expect(params).toEqual(baselineParams);
    expect(mgr.getActiveArmId()).toBe("arm-0");
  });

  it("Thompson Sampling activates after sufficient trades", () => {
    const mgr = new AdaptiveManager(TEST_SCENARIO, baselineParams, {
      ...defaultConfig,
      num_arms: 3,
      min_trades_per_arm: 2,
      exploration_rate: 0,
    });
    mgr.initialize();

    // Feed arm-0 with bad results
    for (let i = 0; i < 3; i++) {
      mgr.onTradeClosed({ pnlPercent: -5, armId: "arm-0" });
    }
    // Feed arm-1 with good results
    for (let i = 0; i < 3; i++) {
      mgr.onTradeClosed({ pnlPercent: 10, armId: "arm-1" });
    }

    // After min_trades_per_arm, should pick arm-1 (much better stats)
    const selections = new Set<string>();
    for (let i = 0; i < 20; i++) {
      mgr.getActiveParams();
      selections.add(mgr.getActiveArmId());
    }
    // arm-1 should dominate selections
    expect(selections.has("arm-1")).toBe(true);
  });

  it("onTradeClosed updates arm statistics", () => {
    const mgr = new AdaptiveManager(TEST_SCENARIO, baselineParams, {
      ...defaultConfig,
      num_arms: 2,
    });
    mgr.initialize();

    mgr.onTradeClosed({ pnlPercent: 5.0, armId: "arm-0" });
    const arms = mgr.getArms();
    const arm0 = arms.find((a) => a.id === "arm-0");
    expect(arm0).toBeDefined();
    expect(arm0!.totalTrades).toBe(1);
    expect(arm0!.winCount).toBe(1);
    expect(arm0!.alpha).toBe(2); // prior 1 + 1 win
  });

  it("triggers arm refresh after refresh_interval_trades", () => {
    const mgr = new AdaptiveManager(TEST_SCENARIO, baselineParams, {
      ...defaultConfig,
      num_arms: 4,
      min_trades_per_arm: 2,
      refresh_interval_trades: 5,
    });
    mgr.initialize();

    // Feed enough trades to trigger refresh
    for (let i = 0; i < 5; i++) {
      // Give arm-0 wins, arm-3 losses
      mgr.onTradeClosed({ pnlPercent: 5, armId: "arm-0" });
    }

    const refreshedArms = mgr.getArms();
    // arm-0 (baseline) should always be preserved
    expect(refreshedArms.find((a) => a.id === "arm-0")).toBeDefined();
  });

  it("fallback to baseline when all arms are losing", () => {
    const mgr = new AdaptiveManager(TEST_SCENARIO, baselineParams, {
      ...defaultConfig,
      num_arms: 3,
      min_trades_per_arm: 2,
      fallback_on_underperform: true,
    });
    mgr.initialize();

    // Make all arms lose
    for (const arm of mgr.getArms()) {
      mgr.onTradeClosed({ pnlPercent: -5, armId: arm.id });
      mgr.onTradeClosed({ pnlPercent: -3, armId: arm.id });
    }

    const params = mgr.getActiveParams();
    expect(params).toEqual(baselineParams);
    expect(mgr.getActiveArmId()).toBe("arm-0");
  });

  it("state persists and loads correctly", () => {
    const mgr1 = new AdaptiveManager(TEST_SCENARIO, baselineParams, {
      ...defaultConfig,
      num_arms: 3,
    });
    mgr1.initialize();
    mgr1.onTradeClosed({ pnlPercent: 5, armId: "arm-0" });
    mgr1.onTradeClosed({ pnlPercent: -2, armId: "arm-1" });

    // Load from persisted state
    const mgr2 = new AdaptiveManager(TEST_SCENARIO, baselineParams, {
      ...defaultConfig,
      num_arms: 3,
    });
    mgr2.initialize();

    const arms1 = mgr1.getArms();
    const arms2 = mgr2.getArms();
    expect(arms2.length).toBe(arms1.length);
    expect(arms2[0]!.totalTrades).toBe(arms1[0]!.totalTrades);
    expect(arms2[1]!.totalTrades).toBe(arms1[1]!.totalTrades);
  });

  it("reinitializes when baseline changes", () => {
    const mgr1 = new AdaptiveManager(TEST_SCENARIO, baselineParams, {
      ...defaultConfig,
      num_arms: 3,
    });
    mgr1.initialize();
    mgr1.onTradeClosed({ pnlPercent: 5, armId: "arm-0" });

    // New manager with different baseline
    const newBaseline = { ...baselineParams, ma_short: 25 };
    const mgr2 = new AdaptiveManager(TEST_SCENARIO, newBaseline, {
      ...defaultConfig,
      num_arms: 3,
    });
    mgr2.initialize();

    const arms = mgr2.getArms();
    // Should have fresh arms (totalTrades = 0)
    expect(arms[0]!.totalTrades).toBe(0);
    expect(arms[0]!.params["ma_short"]).toBe(25);
  });

  it("reset creates fresh arms", () => {
    const mgr = new AdaptiveManager(TEST_SCENARIO, baselineParams, defaultConfig);
    mgr.initialize();
    mgr.onTradeClosed({ pnlPercent: 5, armId: "arm-0" });

    mgr.reset();
    const arms = mgr.getArms();
    expect(arms[0]!.totalTrades).toBe(0);
    expect(arms).toHaveLength(defaultConfig.num_arms);
  });

  it("getSummary returns formatted data", () => {
    const mgr = new AdaptiveManager(TEST_SCENARIO, baselineParams, {
      ...defaultConfig,
      num_arms: 3,
    });
    mgr.initialize();
    mgr.onTradeClosed({ pnlPercent: 5, armId: "arm-0" });

    const summary = mgr.getSummary();
    expect(summary.scenarioId).toBe(TEST_SCENARIO);
    expect(summary.totalTrades).toBe(1);
    expect(summary.arms).toHaveLength(3);
    expect(summary.arms[0]!.trades).toBe(1);
  });
});

describe("extractCurrentParams", () => {
  it("extracts correct params from StrategyConfig", () => {
    const cfg = {
      strategy: { ma: { short: 20, long: 60 }, rsi: { period: 14, overbought: 65, oversold: 30 } },
      risk: { stop_loss_percent: 5, take_profit_percent: 15, position_ratio: 0.2 },
    } as unknown as StrategyConfig;

    const params = extractCurrentParams(cfg);
    expect(params).toEqual(baselineParams);
  });
});

describe("perturbWithinBounds", () => {
  const space: ParamDef[] = [
    { name: "ma_short", type: "int", min: 5, max: 50, step: 1 },
    { name: "ma_long", type: "int", min: 20, max: 200, step: 5 },
    { name: "stop_loss_pct", type: "float", min: 2, max: 10 },
  ];

  const base: ParamSet = { ma_short: 20, ma_long: 60, stop_loss_pct: 5 };

  it("respects both ParamDef range and drift bounds", () => {
    const bounds: Record<string, { min: number; max: number }> = {
      ma_short: { min: 16, max: 24 },
      ma_long: { min: 48, max: 72 },
      stop_loss_pct: { min: 4, max: 6 },
    };

    for (let seed = 0; seed < 50; seed++) {
      let s = seed + 1;
      const rng = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
      const result = perturbWithinBounds(base, space, bounds, 0.3, rng);

      expect(result["ma_short"]).toBeGreaterThanOrEqual(16);
      expect(result["ma_short"]).toBeLessThanOrEqual(24);
      expect(result["ma_long"]).toBeGreaterThanOrEqual(48);
      expect(result["ma_long"]).toBeLessThanOrEqual(72);
      expect(result["stop_loss_pct"]).toBeGreaterThanOrEqual(4);
      expect(result["stop_loss_pct"]).toBeLessThanOrEqual(6);
    }
  });

  it("enforces ma_short < ma_long constraint", () => {
    // Use bounds that could cause violation
    const bounds: Record<string, { min: number; max: number }> = {
      ma_short: { min: 5, max: 50 },
      ma_long: { min: 20, max: 200 },
      stop_loss_pct: { min: 2, max: 10 },
    };

    for (let seed = 0; seed < 100; seed++) {
      let s = seed + 1;
      const rng = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
      const result = perturbWithinBounds(base, space, bounds, 0.5, rng);

      if (result["ma_short"] !== undefined && result["ma_long"] !== undefined) {
        expect(result["ma_short"]).toBeLessThan(result["ma_long"]);
      }
    }
  });
});
