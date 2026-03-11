/**
 * AI Adaptive Parameters — AdaptiveManager
 *
 * Online bandit-based parameter tuning using Thompson Sampling.
 * Maintains K parameter-set variants ("arms"), selects the best before each trade,
 * and updates statistics after each trade closes.
 *
 * Key design:
 * - Arm 0 = baseline (safety anchor, never removed)
 * - All parameters constrained within max_drift_percent of baseline
 * - Cold start: returns baseline until min_trades_per_arm reached
 * - Periodic arm refresh: retire worst arms, mutate best
 * - Fallback: revert to baseline if all arms are losing
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import type { ParamSet, ParamDef } from "./param-space.js";
import { DEFAULT_PARAM_SPACE, perturbWithinBounds } from "./param-space.js";
import { createArm, selectArm, updateArm } from "./bandit.js";
import type { ArmStats, BanditConfig } from "./bandit.js";
import type { StrategyConfig } from "../types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOGS_DIR = path.resolve(__dirname, "../../logs");

// ─────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────

export interface AdaptiveState {
  arms: ArmStats[];
  activeArmId: string;
  baselineParams: ParamSet;
  tradesSinceRefresh: number;
  totalTradeCount: number;
  lastUpdatedAt: string;
  scenarioId: string;
}

interface AdaptiveConfig {
  enabled: boolean;
  mode: "bandit" | "off";
  window_size: number;
  num_arms: number;
  min_trades_per_arm: number;
  exploration_rate: number;
  refresh_interval_trades: number;
  max_drift_percent: number;
  fallback_on_underperform: boolean;
}

export interface TradeResult {
  pnlPercent: number;
  armId?: string | undefined;
}

// ─────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────

function getStatePath(scenarioId: string): string {
  return path.join(LOGS_DIR, `adaptive-state-${scenarioId}.json`);
}

/** Extract current strategy parameters as ParamSet */
export function extractCurrentParams(cfg: StrategyConfig): ParamSet {
  return {
    ma_short: cfg.strategy.ma.short,
    ma_long: cfg.strategy.ma.long,
    rsi_period: cfg.strategy.rsi.period,
    rsi_overbought: cfg.strategy.rsi.overbought,
    rsi_oversold: cfg.strategy.rsi.oversold,
    stop_loss_pct: cfg.risk.stop_loss_percent,
    take_profit_pct: cfg.risk.take_profit_percent,
    position_ratio: cfg.risk.position_ratio,
  };
}

/** Compute per-parameter drift bounds from baseline */
function computeDriftBounds(
  baseline: ParamSet,
  space: ParamDef[],
  maxDriftPercent: number,
): Record<string, { min: number; max: number }> {
  const bounds: Record<string, { min: number; max: number }> = {};
  for (const def of space) {
    const base = baseline[def.name];
    if (base === undefined) continue;
    const drift = Math.abs(base) * (maxDriftPercent / 100);
    const lo = Math.max(def.min, base - drift);
    const hi = Math.min(def.max, base + drift);
    bounds[def.name] = { min: lo, max: hi };
  }
  return bounds;
}

/** Simple seeded PRNG (xoshiro128**) for reproducibility within a session */
function makeRng(seed?: number): () => number {
  // Use Math.random as default
  if (seed === undefined) return Math.random;
  let s = seed | 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >> 17;
    s ^= s << 5;
    return ((s >>> 0) / 4294967296);
  };
}

// ─────────────────────────────────────────────────────
// AdaptiveManager
// ─────────────────────────────────────────────────────

export class AdaptiveManager {
  private scenarioId: string;
  private baselineParams: ParamSet;
  private config: AdaptiveConfig;
  private paramSpace: ParamDef[];
  private arms: ArmStats[] = [];
  private activeArmId = "arm-0";
  private tradesSinceRefresh = 0;
  private totalTradeCount = 0;
  private rng: () => number;

  constructor(
    scenarioId: string,
    baselineParams: ParamSet,
    config: AdaptiveConfig,
    paramSpace?: ParamDef[],
  ) {
    this.scenarioId = scenarioId;
    this.baselineParams = { ...baselineParams };
    this.config = config;
    this.paramSpace = paramSpace ?? DEFAULT_PARAM_SPACE;
    this.rng = makeRng();
  }

  /** Load persisted state or create fresh arm pool */
  initialize(): void {
    const statePath = getStatePath(this.scenarioId);
    if (fs.existsSync(statePath)) {
      try {
        const raw = fs.readFileSync(statePath, "utf-8");
        const state = JSON.parse(raw) as AdaptiveState;

        // Check if baseline changed (e.g. WF updated YAML)
        const baselineMatch = Object.keys(this.baselineParams).every(
          (k) => Math.abs((state.baselineParams[k] ?? 0) - (this.baselineParams[k] ?? 0)) < 1e-9,
        );

        if (baselineMatch && state.arms.length > 0) {
          this.arms = state.arms;
          this.activeArmId = state.activeArmId;
          this.tradesSinceRefresh = state.tradesSinceRefresh;
          this.totalTradeCount = state.totalTradeCount;
          return;
        }
        // Baseline changed → reinitialize
      } catch {
        // Corrupted state → reinitialize
      }
    }

    this.createFreshArms();
    this.persist();
  }

  /** Create arm pool: arm-0 = baseline, arm-1..N-1 = perturbed */
  private createFreshArms(): void {
    this.arms = [];
    const bounds = computeDriftBounds(this.baselineParams, this.paramSpace, this.config.max_drift_percent);

    // Arm 0 = baseline (safety anchor)
    this.arms.push(createArm("arm-0", { ...this.baselineParams }));

    // Arms 1..N-1 = perturbed variants
    for (let i = 1; i < this.config.num_arms; i++) {
      const params = perturbWithinBounds(
        this.baselineParams,
        this.paramSpace,
        bounds,
        0.15, // Initial perturbation sigma
        this.rng,
      );
      this.arms.push(createArm(`arm-${i}`, params));
    }

    this.activeArmId = "arm-0";
    this.tradesSinceRefresh = 0;
    this.totalTradeCount = 0;
  }

  /**
   * Select the active arm via Thompson Sampling and return its parameters.
   * During cold start (insufficient observations), returns baseline.
   */
  getActiveParams(): ParamSet {
    // Cold start: if no arm has reached min_trades_per_arm, use baseline
    const hasQualified = this.arms.some(
      (a) => a.totalTrades >= this.config.min_trades_per_arm,
    );
    if (!hasQualified) {
      this.activeArmId = "arm-0";
      return { ...this.baselineParams };
    }

    // Fallback: if all qualified arms are losing, revert to baseline
    if (this.config.fallback_on_underperform) {
      const qualified = this.arms.filter(
        (a) => a.totalTrades >= this.config.min_trades_per_arm,
      );
      const allLosing = qualified.every((a) => a.avgPnlPercent < 0);
      if (allLosing) {
        this.activeArmId = "arm-0";
        return { ...this.baselineParams };
      }
    }

    const banditConfig: BanditConfig = {
      exploration_rate: this.config.exploration_rate,
      min_trades_per_arm: this.config.min_trades_per_arm,
    };

    const selected = selectArm(this.arms, banditConfig, this.rng);
    this.activeArmId = selected.id;
    return { ...selected.params };
  }

  /** Get the currently active arm ID (for position attribution) */
  getActiveArmId(): string {
    return this.activeArmId;
  }

  /** Update arm statistics after a trade closes. Triggers refresh if interval reached. */
  onTradeClosed(trade: TradeResult): void {
    const armId = trade.armId ?? this.activeArmId;
    const armIdx = this.arms.findIndex((a) => a.id === armId);
    if (armIdx < 0) return; // Unknown arm (possibly from before a reset)

    this.arms[armIdx] = updateArm(this.arms[armIdx]!, trade.pnlPercent);
    this.tradesSinceRefresh++;
    this.totalTradeCount++;

    // Check if refresh interval reached
    if (this.tradesSinceRefresh >= this.config.refresh_interval_trades) {
      this.refreshArms();
      this.tradesSinceRefresh = 0;
    }

    this.persist();
  }

  /**
   * Retire bottom 50% arms (never arm-0) and replace with mutations of the best arm.
   */
  private refreshArms(): void {
    if (this.arms.length <= 2) return; // Need at least 3 arms to do meaningful refresh

    // Sort by avgPnlPercent descending (best first), but only arms with sufficient data
    const qualified = this.arms
      .filter((a) => a.totalTrades >= this.config.min_trades_per_arm)
      .sort((a, b) => b.avgPnlPercent - a.avgPnlPercent);

    if (qualified.length < 2) return; // Not enough data to decide

    const bestArm = qualified[0]!;
    const bounds = computeDriftBounds(this.baselineParams, this.paramSpace, this.config.max_drift_percent);

    // Identify arms to retire: bottom 50% of qualified, but never arm-0 or best
    const retireCount = Math.floor(qualified.length / 2);
    const retireCandidates = qualified
      .slice(-retireCount)
      .filter((a) => a.id !== "arm-0" && a.id !== bestArm.id);

    const retireIds = new Set(retireCandidates.map((a) => a.id));

    // Replace retired arms with new mutations of the best arm
    this.arms = this.arms.map((arm) => {
      if (!retireIds.has(arm.id)) return arm;
      const newParams = perturbWithinBounds(
        bestArm.params,
        this.paramSpace,
        bounds,
        0.1,
        this.rng,
      );
      return createArm(arm.id, newParams);
    });
  }

  /** Diagnostic summary for CLI/logging */
  getSummary(): {
    scenarioId: string;
    totalTrades: number;
    tradesSinceRefresh: number;
    activeArmId: string;
    arms: Array<{
      id: string;
      trades: number;
      winRate: string;
      avgPnl: string;
      alpha: number;
      beta: number;
    }>;
  } {
    return {
      scenarioId: this.scenarioId,
      totalTrades: this.totalTradeCount,
      tradesSinceRefresh: this.tradesSinceRefresh,
      activeArmId: this.activeArmId,
      arms: this.arms.map((a) => ({
        id: a.id,
        trades: a.totalTrades,
        winRate: a.totalTrades > 0
          ? `${((a.winCount / a.totalTrades) * 100).toFixed(1)}%`
          : "N/A",
        avgPnl: a.totalTrades > 0 ? `${a.avgPnlPercent.toFixed(2)}%` : "N/A",
        alpha: a.alpha,
        beta: a.beta,
      })),
    };
  }

  /** Force reset all arms */
  reset(): void {
    this.createFreshArms();
    this.persist();
  }

  /** Get all arms (for testing/CLI) */
  getArms(): ArmStats[] {
    return [...this.arms];
  }

  /** Persist state to disk */
  private persist(): void {
    const state: AdaptiveState = {
      arms: this.arms,
      activeArmId: this.activeArmId,
      baselineParams: this.baselineParams,
      tradesSinceRefresh: this.tradesSinceRefresh,
      totalTradeCount: this.totalTradeCount,
      lastUpdatedAt: new Date().toISOString(),
      scenarioId: this.scenarioId,
    };
    try {
      fs.mkdirSync(LOGS_DIR, { recursive: true });
      fs.writeFileSync(getStatePath(this.scenarioId), JSON.stringify(state, null, 2));
    } catch {
      // Persistence failure is non-fatal
    }
  }
}

// ─────────────────────────────────────────────────────
// Module-level manager cache (shared across monitors)
// ─────────────────────────────────────────────────────

const _adaptiveManagers = new Map<string, AdaptiveManager>();

/**
 * Get or create an AdaptiveManager for a given runtime config.
 * Caches managers by scenarioId.
 */
export function getOrCreateAdaptiveManager(
  cfg: { paper: { scenarioId: string } } & StrategyConfig,
): AdaptiveManager {
  const sid = cfg.paper.scenarioId;
  let mgr = _adaptiveManagers.get(sid);
  if (!mgr) {
    const adaptive = cfg.adaptive!;
    const baseline = extractCurrentParams(cfg);
    mgr = new AdaptiveManager(sid, baseline, adaptive);
    mgr.initialize();
    _adaptiveManagers.set(sid, mgr);
  }
  return mgr;
}
