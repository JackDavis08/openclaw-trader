/**
 * Thompson Sampling Bandit — Unit Tests
 *
 * Covers:
 *   - sampleBeta returns [0,1] range
 *   - High α → sample near 1; high β → near 0
 *   - createArm initializes priors correctly
 *   - updateArm: win → α++, loss → β++; avgPnl updates
 *   - selectArm: basic functionality, exploration_rate=1 → random, dominant arm selected
 */

import { describe, it, expect } from "vitest";
import { sampleBeta, selectArm, updateArm, createArm } from "../optimization/bandit.js";
import type { BanditConfig } from "../optimization/bandit.js";

// Deterministic RNG for reproducible tests
function makeSeededRng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

describe("sampleBeta", () => {
  it("returns values in [0, 1]", () => {
    const rng = makeSeededRng(42);
    for (let i = 0; i < 100; i++) {
      const val = sampleBeta(2, 3, rng);
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThanOrEqual(1);
    }
  });

  it("high alpha → samples near 1", () => {
    const rng = makeSeededRng(123);
    const samples: number[] = [];
    for (let i = 0; i < 200; i++) {
      samples.push(sampleBeta(100, 1, rng));
    }
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    expect(mean).toBeGreaterThan(0.9);
  });

  it("high beta → samples near 0", () => {
    const rng = makeSeededRng(456);
    const samples: number[] = [];
    for (let i = 0; i < 200; i++) {
      samples.push(sampleBeta(1, 100, rng));
    }
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    expect(mean).toBeLessThan(0.1);
  });

  it("Beta(1,1) → roughly uniform", () => {
    const rng = makeSeededRng(789);
    const samples: number[] = [];
    for (let i = 0; i < 500; i++) {
      samples.push(sampleBeta(1, 1, rng));
    }
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    expect(mean).toBeGreaterThan(0.35);
    expect(mean).toBeLessThan(0.65);
  });

  it("throws on non-positive parameters", () => {
    const rng = () => 0.5;
    expect(() => sampleBeta(0, 1, rng)).toThrow();
    expect(() => sampleBeta(1, -1, rng)).toThrow();
  });
});

describe("createArm", () => {
  it("initializes with default priors", () => {
    const arm = createArm("test-arm", { ma_short: 20, ma_long: 60 });
    expect(arm.id).toBe("test-arm");
    expect(arm.alpha).toBe(1);
    expect(arm.beta).toBe(1);
    expect(arm.totalTrades).toBe(0);
    expect(arm.avgPnlPercent).toBe(0);
    expect(arm.winCount).toBe(0);
    expect(arm.params["ma_short"]).toBe(20);
  });

  it("initializes with custom priors", () => {
    const arm = createArm("custom", { x: 1 }, 5, 3);
    expect(arm.alpha).toBe(5);
    expect(arm.beta).toBe(3);
  });
});

describe("updateArm", () => {
  it("win → alpha++", () => {
    const arm = createArm("a", { x: 1 });
    const updated = updateArm(arm, 2.5);
    expect(updated.alpha).toBe(2);
    expect(updated.beta).toBe(1);
    expect(updated.totalTrades).toBe(1);
    expect(updated.winCount).toBe(1);
    expect(updated.avgPnlPercent).toBe(2.5);
  });

  it("loss → beta++", () => {
    const arm = createArm("b", { x: 1 });
    const updated = updateArm(arm, -3.0);
    expect(updated.alpha).toBe(1);
    expect(updated.beta).toBe(2);
    expect(updated.totalTrades).toBe(1);
    expect(updated.winCount).toBe(0);
    expect(updated.avgPnlPercent).toBe(-3.0);
  });

  it("accumulates stats over multiple trades", () => {
    let arm = createArm("c", { x: 1 });
    arm = updateArm(arm, 5.0);  // win
    arm = updateArm(arm, -2.0); // loss
    arm = updateArm(arm, 3.0);  // win

    expect(arm.alpha).toBe(3);    // 1 (prior) + 2 wins
    expect(arm.beta).toBe(2);     // 1 (prior) + 1 loss
    expect(arm.totalTrades).toBe(3);
    expect(arm.winCount).toBe(2);
    expect(arm.totalPnlPercent).toBe(6.0);
    expect(arm.avgPnlPercent).toBe(2.0);
  });

  it("zero pnl counts as loss", () => {
    const arm = createArm("d", { x: 1 });
    const updated = updateArm(arm, 0);
    expect(updated.alpha).toBe(1); // unchanged
    expect(updated.beta).toBe(2);  // incremented
  });
});

describe("selectArm", () => {
  const config: BanditConfig = {
    exploration_rate: 0.0,
    min_trades_per_arm: 1,
  };

  it("returns the only arm when array has one element", () => {
    const arm = createArm("solo", { x: 1 });
    const selected = selectArm([arm], config, Math.random);
    expect(selected.id).toBe("solo");
  });

  it("exploration_rate=1 → random selection", () => {
    const arms = [
      createArm("a", { x: 1 }, 100, 1),  // Very strong
      createArm("b", { x: 2 }, 1, 100),   // Very weak
    ];
    const exploringConfig: BanditConfig = {
      exploration_rate: 1.0,
      min_trades_per_arm: 1,
    };
    const rng = makeSeededRng(42);
    const counts: Record<string, number> = { a: 0, b: 0 };
    for (let i = 0; i < 200; i++) {
      const s = selectArm(arms, exploringConfig, rng);
      counts[s.id] = (counts[s.id] ?? 0) + 1;
    }
    // With pure exploration, both should get selected sometimes
    expect(counts["a"]!).toBeGreaterThan(30);
    expect(counts["b"]!).toBeGreaterThan(30);
  });

  it("dominant arm (high alpha) is selected most often with exploration_rate=0", () => {
    const arms = [
      createArm("weak", { x: 1 }, 1, 50),   // Terrible
      createArm("strong", { x: 2 }, 50, 1),  // Excellent
    ];
    const rng = makeSeededRng(99);
    const counts: Record<string, number> = { weak: 0, strong: 0 };
    for (let i = 0; i < 100; i++) {
      const s = selectArm(arms, config, rng);
      counts[s.id] = (counts[s.id] ?? 0) + 1;
    }
    expect(counts["strong"]!).toBeGreaterThan(85);
  });

  it("throws on empty arms array", () => {
    expect(() => selectArm([], config, Math.random)).toThrow();
  });
});
