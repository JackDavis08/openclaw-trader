/**
 * Thompson Sampling Multi-Armed Bandit — Pure Math Layer
 *
 * Zero business dependencies. Implements Beta-distributed Thompson Sampling
 * with ε-greedy safety net for online parameter tuning.
 */

import type { ParamSet } from "./param-space.js";

// ─────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────

export interface ArmStats {
  id: string;
  params: ParamSet;
  /** Beta distribution α (success count + prior) */
  alpha: number;
  /** Beta distribution β (failure count + prior) */
  beta: number;
  totalTrades: number;
  totalPnlPercent: number;
  avgPnlPercent: number;
  winCount: number;
  createdAt: number;
  lastUsedAt: number;
}

export interface BanditConfig {
  exploration_rate: number;
  min_trades_per_arm: number;
}

// ─────────────────────────────────────────────────────
// Beta Distribution Sampling (Joehnk method)
// ─────────────────────────────────────────────────────

/**
 * Sample from Beta(alpha, beta) distribution using Joehnk's method.
 * Returns a value in [0, 1].
 *
 * For alpha,beta >= 1 this is efficient. For very small parameters
 * it may need more iterations, but in practice converges quickly.
 */
export function sampleBeta(alpha: number, beta: number, rng: () => number): number {
  if (alpha <= 0 || beta <= 0) {
    throw new Error(`sampleBeta: alpha (${alpha}) and beta (${beta}) must be positive`);
  }

  // Special cases
  if (alpha === 1 && beta === 1) return rng();

  // Joehnk's method: generate Gamma(alpha,1) and Gamma(beta,1), then X/(X+Y)
  const x = sampleGamma(alpha, rng);
  const y = sampleGamma(beta, rng);
  const sum = x + y;
  if (sum === 0) return 0.5; // Degenerate case
  return x / sum;
}

/**
 * Sample from Gamma(shape, 1) using Marsaglia and Tsang's method.
 */
function sampleGamma(shape: number, rng: () => number): number {
  if (shape < 1) {
    // Boost: Gamma(shape) = Gamma(shape+1) * U^(1/shape)
    const u = rng();
    return sampleGamma(shape + 1, rng) * Math.pow(u, 1 / shape);
  }

  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);

  for (let iter = 0; iter < 1000; iter++) {
    let x: number;
    let v: number;

    // Generate standard normal via Box-Muller
    do {
      const u1 = rng();
      const u2 = rng();
      x = Math.sqrt(-2 * Math.log(Math.max(u1, 1e-15))) * Math.cos(2 * Math.PI * u2);
      v = 1 + c * x;
    } while (v <= 0);

    v = v * v * v;
    const u = rng();

    if (u < 1 - 0.0331 * x * x * x * x) return d * v;
    if (Math.log(Math.max(u, 1e-15)) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }

  // Fallback (should never reach here)
  return shape;
}

// ─────────────────────────────────────────────────────
// Arm Selection (Thompson Sampling + ε-greedy)
// ─────────────────────────────────────────────────────

/**
 * Select an arm using Thompson Sampling with ε-greedy safety net.
 *
 * With probability `exploration_rate`, pick a random arm (exploration).
 * Otherwise, sample from each arm's Beta distribution and pick the highest.
 */
export function selectArm(
  arms: ArmStats[],
  config: BanditConfig,
  rng: () => number,
): ArmStats {
  if (arms.length === 0) {
    throw new Error("selectArm: arms array is empty");
  }
  if (arms.length === 1) return arms[0]!;

  // ε-greedy exploration
  if (rng() < config.exploration_rate) {
    return arms[Math.floor(rng() * arms.length)]!;
  }

  // Thompson Sampling: sample from each arm's Beta posterior, pick highest
  let bestArm: ArmStats = arms[0]!;
  let bestSample = -Infinity;

  for (const arm of arms) {
    const sample = sampleBeta(arm.alpha, arm.beta, rng);
    if (sample > bestSample) {
      bestSample = sample;
      bestArm = arm;
    }
  }

  return bestArm!;
}

// ─────────────────────────────────────────────────────
// Arm Update
// ─────────────────────────────────────────────────────

/**
 * Update arm statistics after a trade closes.
 * Positive pnl → increment α (success), negative → increment β (failure).
 * Returns a new ArmStats (immutable update).
 */
export function updateArm(arm: ArmStats, pnlPercent: number): ArmStats {
  const isWin = pnlPercent > 0;
  const newTotalTrades = arm.totalTrades + 1;
  const newTotalPnl = arm.totalPnlPercent + pnlPercent;
  const newWinCount = arm.winCount + (isWin ? 1 : 0);

  return {
    ...arm,
    alpha: arm.alpha + (isWin ? 1 : 0),
    beta: arm.beta + (isWin ? 0 : 1),
    totalTrades: newTotalTrades,
    totalPnlPercent: newTotalPnl,
    avgPnlPercent: newTotalPnl / newTotalTrades,
    winCount: newWinCount,
    lastUsedAt: Date.now(),
  };
}

// ─────────────────────────────────────────────────────
// Arm Creation
// ─────────────────────────────────────────────────────

/**
 * Create a new arm with given parameters and prior.
 * Default prior is Beta(1, 1) = uniform.
 */
export function createArm(
  id: string,
  params: ParamSet,
  priorAlpha = 1,
  priorBeta = 1,
): ArmStats {
  return {
    id,
    params,
    alpha: priorAlpha,
    beta: priorBeta,
    totalTrades: 0,
    totalPnlPercent: 0,
    avgPnlPercent: 0,
    winCount: 0,
    createdAt: Date.now(),
    lastUsedAt: Date.now(),
  };
}
