/**
 * Backtest CLI Entry
 *
 * Usage:
 *   npm run backtest
 *   npm run backtest -- --strategy conservative --days 90
 *   npm run backtest -- --strategy aggressive --symbols BTCUSDT,ETHUSDT --days 60
 *   npm run backtest -- --days 180 --timeframe 4h --initial-usdt 5000
 *
 * Parameters:
 *   --strategy, -s   Strategy name (default/aggressive/conservative/rsi-pure/trend)
 *                    Uses strategy.yaml default config if not specified
 *   --days, -d       Backtest days (default 90)
 *   --timeframe, -t  Candlestick interval (overrides strategy config)
 *   --symbols, -S    Symbols to monitor, comma-separated (overrides strategy config)
 *   --initial-usdt   Initial capital (default 1000)
 *   --no-save           Do not save JSON report file
 *   --compare           Run all strategies and compare results
 *   --slippage-sweep    Slippage sensitivity analysis (run 0 / 0.05 / 0.1 / 0.2% and compare)
 */

import { fetchAllSymbols } from "../backtest/parallel-fetch.js";
import { KlineCache } from "../backtest/kline-cache.js";
import { runBacktest } from "../backtest/runner.js";
import { BacktestWorkerPool, type BacktestJob } from "../backtest/worker-pool.js";
import { formatReport, saveReport } from "../backtest/report.js";
import { parseBacktestArgs, type BacktestCliArgs } from "../backtest/cli-args.js";
import {
  loadStrategyConfig,
  loadStrategyProfile,
  listStrategyProfiles,
  mergeRisk,
  mergeStrategySection,
} from "../config/loader.js";
import type { StrategyConfig, Kline } from "../types.js";

// ─────────────────────────────────────────────────────
// Build backtest strategy config (strategy.yaml + profile merge)
// ─────────────────────────────────────────────────────

function buildBacktestConfig(
  strategyId: string | undefined,
  overrides: { timeframe?: string | undefined; symbols?: string[] | undefined }
): StrategyConfig {
  const base = loadStrategyConfig();

  let cfg = { ...base };

  if (strategyId) {
    const profile = loadStrategyProfile(strategyId);
    cfg = {
      ...cfg,
      symbols: overrides.symbols ?? profile.symbols ?? cfg.symbols,
      timeframe: (overrides.timeframe ??
        profile.timeframe ??
        cfg.timeframe) as StrategyConfig["timeframe"],
      strategy: {
        ...mergeStrategySection(cfg.strategy, profile.strategy),
        name: profile.name,
      },
      signals: {
        buy: profile.signals?.buy ?? cfg.signals.buy,
        sell: profile.signals?.sell ?? cfg.signals.sell,
        ...(profile.signals?.short !== undefined ? { short: profile.signals.short } : {}),
        ...(profile.signals?.cover !== undefined ? { cover: profile.signals.cover } : {}),
      },
      risk: mergeRisk(cfg.risk, profile.risk),
      // MTF: profile takes priority, then global strategy.yaml
      ...(profile.trend_timeframe !== undefined
        ? { trend_timeframe: profile.trend_timeframe }
        : base.trend_timeframe !== undefined
          ? { trend_timeframe: base.trend_timeframe }
          : {}),
    };
  } else {
    cfg = {
      ...cfg,
      symbols: overrides.symbols ?? cfg.symbols,
      timeframe: (overrides.timeframe ?? cfg.timeframe) as StrategyConfig["timeframe"],
    };
  }

  return cfg;
}

// ─────────────────────────────────────────────────────
// Single Backtest Run
// ─────────────────────────────────────────────────────

async function runOne(strategyId: string | undefined, args: BacktestCliArgs): Promise<void> {
  const cfg = buildBacktestConfig(strategyId, {
    timeframe: args.timeframe,
    symbols: args.symbols,
  });

  const label = strategyId ?? "default strategy";
  console.log(
    `\n⏳ ${label}  |  ${cfg.symbols.length} symbols  |  ${cfg.timeframe}  |  ${args.days} days`
  );
  console.log(`   Signal conditions: buy [${cfg.signals.buy.join(", ")}]`);
  console.log(`                     sell [${cfg.signals.sell.join(", ")}]`);
  if (cfg.signals.short?.length) console.log(`                     short [${cfg.signals.short.join(", ")}]`);
  if (cfg.signals.cover?.length) console.log(`                     cover [${cfg.signals.cover.join(", ")}]`);

  // Calculate time range
  const endMs = Date.now();
  const startMs = endMs - args.days * 86_400_000;

  // Fetch historical candlesticks (parallel)
  console.log(`\n📥 Fetching historical data (parallel)...`);
  const klinesBySymbol = await fetchAllSymbols(cfg.symbols, cfg.timeframe, startMs, endMs, {
    onProgress: (symbol, n) => { console.log(`   ${symbol} ✓ ${n} candlesticks`); },
  });

  // Optional: MTF trend candlesticks (if trend_timeframe is configured)
  let trendKlinesBySymbol: Record<string, Kline[]> | undefined;
  if (cfg.trend_timeframe) {
    console.log(`\n📥 Fetching trend timeframe candlesticks (${cfg.trend_timeframe})...`);
    trendKlinesBySymbol = await fetchAllSymbols(cfg.symbols, cfg.trend_timeframe, startMs, endMs);
    console.log(`   ✓ MTF ${cfg.trend_timeframe} data loaded`);
  }

  // Run backtest
  const spreadInfo = args.spreadBps > 0 ? `  |  spread: ${args.spreadBps} bps` : "";
  const nextOpenInfo = args.signalToNextOpen ? "  |  ⚡ Next bar open execution (no look-ahead bias)" : "";
  console.log(`\n🔄 Running backtest${cfg.trend_timeframe ? ` (with ${cfg.trend_timeframe} MTF filter)` : ""}${spreadInfo}${nextOpenInfo}...`);
  const result = runBacktest(klinesBySymbol, cfg, {
    initialUsdt: args.initialUsdt,
    feeRate: 0.001,
    slippagePercent: 0.05,
    spreadBps: args.spreadBps,
    signalToNextOpen: args.signalToNextOpen,
  }, trendKlinesBySymbol);

  // Output report
  console.log("\n" + formatReport(result));

  // Save report
  if (args.save) {
    const savedPath = saveReport(result, strategyId);
    console.log(`💾 Report saved: ${savedPath}\n`);
  }
}

// ─────────────────────────────────────────────────────
// Multi-Strategy Comparison
// ─────────────────────────────────────────────────────

async function runCompare(args: BacktestCliArgs): Promise<void> {
  const strategies = listStrategyProfiles();
  if (strategies.length === 0) {
    console.log("⚠️  No strategy files found (config/strategies/*.yaml)");
    return;
  }

  console.log(`\n🔬 Strategy comparison mode: ${strategies.join("  |  ")}\n`);

  const endMs = Date.now();
  const startMs = endMs - args.days * 86_400_000;
  const cache = new KlineCache();

  // Pre-fetch all unique symbol/timeframe combos using cache (parallel)
  const allConfigs = strategies.map((id) => ({
    id,
    cfg: buildBacktestConfig(id, { timeframe: args.timeframe, symbols: args.symbols }),
  }));

  // Collect all unique symbol+timeframe combos for pre-fetching
  const fetchSet = new Set<string>();
  for (const { cfg } of allConfigs) {
    for (const sym of cfg.symbols) {
      fetchSet.add(`${sym}|${cfg.timeframe}`);
      if (cfg.trend_timeframe) fetchSet.add(`${sym}|${cfg.trend_timeframe}`);
    }
  }
  console.log(`📥 Pre-fetching ${fetchSet.size} symbol/timeframe combos (parallel)...`);
  const byTf = new Map<string, string[]>();
  for (const key of fetchSet) {
    const [sym, tf] = key.split("|") as [string, string];
    if (!byTf.has(tf)) byTf.set(tf, []);
    byTf.get(tf)!.push(sym);
  }
  for (const [tf, syms] of byTf) {
    await cache.getAll(syms, tf, startMs, endMs);
  }
  console.log(`   ✓ All data cached\n`);

  // Build worker pool and submit all strategies in parallel
  const pool = new BacktestWorkerPool();
  try {
    const jobs: BacktestJob[] = [];
    for (const { cfg } of allConfigs) {
      const klinesBySymbol: Record<string, Kline[]> = {};
      for (const sym of cfg.symbols) {
        klinesBySymbol[sym] = await cache.get(sym, cfg.timeframe, startMs, endMs);
      }
      let trendKlines: Record<string, Kline[]> | undefined;
      if (cfg.trend_timeframe) {
        trendKlines = {};
        for (const sym of cfg.symbols) {
          trendKlines[sym] = await cache.get(sym, cfg.trend_timeframe, startMs, endMs);
        }
      }
      jobs.push({
        klinesBySymbol,
        cfg,
        opts: { initialUsdt: args.initialUsdt },
        trendKlinesBySymbol: trendKlines,
      });
    }

    console.log(`🔄 Running ${jobs.length} backtests in parallel...`);
    const btResults = await pool.submitAll(jobs);

    const results: {
      strategy: string;
      returnPct: number;
      sharpe: number;
      maxDD: number;
      trades: number;
      winRate: number;
    }[] = [];

    for (let i = 0; i < allConfigs.length; i++) {
      const { id } = allConfigs[i]!;
      const result = btResults[i]!;
      const m = result.metrics;
      results.push({
        strategy: id,
        returnPct: m.totalReturnPercent,
        sharpe: m.sharpeRatio,
        maxDD: m.maxDrawdown,
        trades: m.totalTrades,
        winRate: m.winRate * 100,
      });
      if (args.save) saveReport(result, id);
    }

    // Comparison table
    console.log("\n");
    console.log("━".repeat(72));
    console.log("📊 Strategy Comparison Results");
    console.log("━".repeat(72));
    console.log(
      `${"Strategy".padEnd(22)} ${"Return".padStart(9)} ${"Sharpe".padStart(7)} ${"Max DD".padStart(9)} ${"Trades".padStart(6)} ${"WinRate".padStart(7)}`
    );
    console.log("─".repeat(72));

    // Sort by return
    results.sort((a, b) => b.returnPct - a.returnPct);
    for (const r of results) {
      const sign = r.returnPct >= 0 ? "+" : "";
      const emoji = r.returnPct > 5 ? "🟢" : r.returnPct > 0 ? "🟡" : "🔴";
      console.log(
        `${emoji} ${r.strategy.padEnd(20)} ${(sign + r.returnPct.toFixed(2) + "%").padStart(9)} ${r.sharpe.toFixed(2).padStart(7)} ${("-" + r.maxDD.toFixed(2) + "%").padStart(9)} ${String(r.trades).padStart(6)} ${(r.winRate.toFixed(1) + "%").padStart(7)}`
      );
    }
    console.log("━".repeat(72));
  } finally {
    await pool.terminate();
  }
}

// ─────────────────────────────────────────────────────
// Slippage Sensitivity Analysis
// ─────────────────────────────────────────────────────

/**
 * Run backtest with the same strategy and historical data at 0 / 0.05 / 0.1 / 0.2% slippage levels,
 * showing the impact of slippage on final return, max drawdown, and win rate.
 */
async function runSlippageSweep(args: BacktestCliArgs): Promise<void> {
  const SLIPPAGE_LEVELS = [0, 0.05, 0.1, 0.2]; // %

  const cfg = buildBacktestConfig(args.strategy, {
    timeframe: args.timeframe,
    symbols: args.symbols,
  });

  const endMs = Date.now();
  const startMs = endMs - args.days * 86_400_000;

  console.log(`\n📥 Fetching historical candlesticks (${cfg.symbols.join(",")} × ${cfg.timeframe}, parallel)...`);
  const klinesBySymbol = await fetchAllSymbols(cfg.symbols, cfg.timeframe, startMs, endMs);

  let trendKlines: Record<string, Kline[]> | undefined;
  if (cfg.trend_timeframe) {
    trendKlines = await fetchAllSymbols(cfg.symbols, cfg.trend_timeframe, startMs, endMs);
  }

  console.log(`\n🔬 Slippage Sensitivity Analysis — Strategy: ${cfg.strategy.name}  |  ${args.days} days`);
  console.log(`   Standard slippage (market order): 0.05%  |  Fee: 0.1%`);

  const pool = new BacktestWorkerPool();
  const slipJobs: BacktestJob[] = SLIPPAGE_LEVELS.map((slip) => ({
    klinesBySymbol,
    cfg,
    opts: { initialUsdt: args.initialUsdt, feeRate: 0.001, slippagePercent: slip },
    trendKlinesBySymbol: trendKlines,
  }));

  const btResults = await pool.submitAll(slipJobs);
  await pool.terminate();

  const results: {
    slippage: number;
    returnPct: number;
    maxDD: number;
    trades: number;
    winRate: number;
    totalReturn: number;
  }[] = [];

  for (let i = 0; i < SLIPPAGE_LEVELS.length; i++) {
    const result = btResults[i]!;
    results.push({
      slippage: SLIPPAGE_LEVELS[i]!,
      returnPct: result.metrics.totalReturnPercent,
      maxDD: result.metrics.maxDrawdown,
      trades: result.metrics.totalTrades,
      winRate: result.metrics.winRate * 100,
      totalReturn: result.metrics.totalReturn,
    });
  }

  // Output table
  console.log("\n");
  console.log("━".repeat(72));
  console.log("📉 Slippage Sensitivity Analysis Results");
  console.log("━".repeat(72));
  console.log(
    `${"Slip %".padEnd(10)} ${"Total Ret".padStart(10)} ${"Net PnL".padStart(11)} ${"Max DD".padStart(10)} ${"Trades".padStart(6)} ${"WinRate".padStart(7)}`
  );
  console.log("─".repeat(72));

  for (const r of results) {
    const isStd = r.slippage === 0.05;
    const marker = isStd ? "  ← standard" : "";
    const sign = r.returnPct >= 0 ? "+" : "";
    const emoji = r.returnPct > 5 ? "🟢" : r.returnPct > 0 ? "🟡" : "🔴";
    const pnlSign = r.totalReturn >= 0 ? "+" : "";
    console.log(
      `${emoji} ${(r.slippage.toFixed(2) + "%").padEnd(10)} ` +
      `${(sign + r.returnPct.toFixed(2) + "%").padStart(10)} ` +
      `${(pnlSign + r.totalReturn.toFixed(2)).padStart(11)} ` +
      `${("-" + r.maxDD.toFixed(2) + "%").padStart(10)} ` +
      `${String(r.trades).padStart(6)} ` +
      `${(r.winRate.toFixed(1) + "%").padStart(7)}${marker}`
    );
  }
  console.log("━".repeat(72));

  // Additional display: Slippage 0% vs 0.05% impact assessment
  const base = results[0];
  const std = results.find((r) => r.slippage === 0.05);
  if (base && std) {
    const diff = std.returnPct - base.returnPct;
    const trades = std.trades;
    console.log(`\n💡 Slippage 0% → 0.05%: Return change ${diff.toFixed(2)}% (${trades} trades)`);
    console.log(
      `   Slippage impact: ${Math.abs(diff) < 1 ? "Small (<1%), strategy is robust" : Math.abs(diff) < 3 ? "Moderate (1-3%), acceptable" : "Significant (>3%), reduce trading frequency"}`
    );
  }
}

// ─────────────────────────────────────────────────────
// Main Entry
// ─────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseBacktestArgs(process.argv.slice(2));

  console.log("🚀 openclaw-trader Backtest Engine");
  const spreadMsg = args.spreadBps > 0 ? `  |  spread: ${args.spreadBps} bps` : "";
  console.log(`   Initial capital: $${args.initialUsdt}  |  Backtest days: ${args.days}d${spreadMsg}`);

  if (args.slippageSweep) {
    await runSlippageSweep(args);
  } else if (args.compare) {
    await runCompare(args);
  } else {
    await runOne(args.strategy, args);
  }
}

process.on("unhandledRejection", (reason: unknown) => {
  console.error("[FATAL] Unhandled Rejection:", reason);
  process.exit(1);
});

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error("❌ Backtest failed:", msg);
  process.exit(1);
});
