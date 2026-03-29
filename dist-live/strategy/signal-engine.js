/**
 * Unified Signal Engine (F3)
 *
 * Extracts core signal processing logic from monitor.ts and backtest/runner.ts into a shared module:
 *   calculateIndicators -> regime (P5.3 pre-positioned) -> detectSignal -> R:R -> correlation -> protections
 *
 * Live mode (monitor.ts): passes CVD / funding rate / BTC dominance / heldKlinesMap
 * Backtest mode (runner.ts): only passes heldKlinesMap, no live external data
 *
 * P5.3 Regime-aware signal filtering (pre-positioned before detectSignal):
 *   trend_signals_only     -> filters out RSI reversal conditions, keeps only MA/MACD/CVD trend conditions
 *   reversal_signals_only  -> filters out MA/MACD trend conditions, keeps only RSI/price extreme reversal conditions
 *   breakout_watch         -> rejects all signals directly (waiting for breakout confirmation)
 *   reduced_size           -> allows all signals but halves position size
 */
import { calculateIndicators } from "./indicators.js";
import { detectSignal } from "./signals.js";
import { classifyRegime } from "./regime.js";
import { checkRiskReward } from "./rr-filter.js";
import { checkCorrelation } from "./correlation.js";
import { checkProtections } from "./protection-manager.js";
// ── F4 Strategy Plugin Support ──────────────────────────
// Side-effect import: registers all built-in strategies (default / rsi-reversal / breakout)
import "../strategies/index.js";
import { getStrategy } from "../strategies/registry.js";
import { createStateStore } from "../strategies/state-store.js";
// ─────────────────────────────────────────────────────
// Regime Signal Condition Classification (P5.3)
// ─────────────────────────────────────────────────────
/**
 * Trend-type signal conditions (kept when trend_signals_only)
 *   These conditions rely on price momentum/direction, effective in trending markets, produce many false signals in ranging markets
 */
const TREND_CONDITIONS = new Set([
    "ma_bullish",
    "ma_bearish",
    "macd_bullish",
    "macd_bearish",
    "cvd_bullish",
    "cvd_bearish",
    "volume_spike",
    // RSI guard conditions: prevent opening trend positions in overbought/oversold zones (still useful in trending markets)
    "rsi_not_overbought",
    "rsi_not_oversold",
    // Funding rate conditions: cost management, applicable in trending markets
    "funding_rate_overlong",
    "funding_rate_overshort",
]);
/**
 * Reversal-type signal conditions (kept when reversal_signals_only)
 *   These conditions rely on price extremes/mean reversion, effective in ranging markets, cause counter-trend trades in trending markets
 */
const REVERSAL_CONDITIONS = new Set([
    "rsi_oversold",
    "rsi_overbought",
    "rsi_bullish_zone",
    "rsi_not_overbought",
    "rsi_not_oversold",
    "rsi_overbought_exit",
    "rsi_oversold_exit",
    // Funding rate: also a reversal trigger (extreme funding rate -> crowded trade reversal)
    "funding_rate_overlong",
    "funding_rate_overshort",
    // Long/Short ratio: contrarian reversal (extreme retail positioning -> reversal)
    "ls_ratio_extreme_long",
    "ls_ratio_extreme_short",
    "ls_ratio_long_biased",
    "ls_ratio_short_biased",
    // CVD: also usable for reversal detection (selling/buying pressure extremes)
    "cvd_bullish",
    "cvd_bearish",
]);
/**
 * Filter signal condition set based on signalFilter.
 *
 * - trend_signals_only: keep only conditions in TREND_CONDITIONS
 * - reversal_signals_only: keep only conditions in REVERSAL_CONDITIONS
 * - other: keep as-is (return original object)
 *
 * If cfg has regime_strategies[signalFilter] configured, explicit YAML override takes priority.
 */
function applyRegimeSignalFilter(cfg, signalFilter) {
    // Explicit YAML override takes priority (use directly if regime_strategies is configured)
    const explicit = cfg.regime_strategies?.[signalFilter];
    if (explicit) {
        return explicit.signals;
    }
    // Auto-categorization filter
    const filterFn = (keep) => (conditions) => conditions.filter((c) => keep.has(c));
    if (signalFilter === "trend_signals_only") {
        const f = filterFn(TREND_CONDITIONS);
        return {
            buy: f(cfg.signals.buy),
            sell: f(cfg.signals.sell),
            short: cfg.signals.short ? f(cfg.signals.short) : [],
            cover: cfg.signals.cover ? f(cfg.signals.cover) : [],
        };
    }
    if (signalFilter === "reversal_signals_only") {
        const f = filterFn(REVERSAL_CONDITIONS);
        return {
            buy: f(cfg.signals.buy),
            sell: f(cfg.signals.sell),
            short: cfg.signals.short ? f(cfg.signals.short) : [],
            cover: cfg.signals.cover ? f(cfg.signals.cover) : [],
        };
    }
    // all / reduced_size -> return as-is
    return cfg.signals;
}
// ─────────────────────────────────────────────────────
// Core Function
// ─────────────────────────────────────────────────────
/**
 * Process the full signal pipeline for a single symbol
 *
 * @param symbol        Trading symbol
 * @param klines        Historical klines for this symbol (enough to calculate indicators)
 * @param cfg           Runtime config (merged strategy + scenario)
 * @param external      External live context (optional)
 * @param recentTrades  Recent closed trade records (for ProtectionManager, optional)
 */
export function processSignal(symbol, klines, cfg, external = {}, recentTrades) {
    // ── Empty signal placeholder (returned on failure) ──────────────────────
    const emptyIndicators = {
        maShort: 0, maLong: 0, rsi: 0, price: 0, volume: 0, avgVolume: 0,
    };
    const noneSignal = {
        symbol, type: "none", price: 0, indicators: emptyIndicators, reason: [], timestamp: Date.now(),
    };
    // ── 1. Calculate indicators ───────────────────────────────────────
    const indicators = calculateIndicators(klines, cfg.strategy.ma.short, cfg.strategy.ma.long, cfg.strategy.rsi.period, cfg.strategy.macd);
    if (!indicators) {
        return {
            indicators: null,
            signal: noneSignal,
            effectiveRisk: cfg.risk,
            rejected: true,
            rejectionReason: "Indicator calculation failed (insufficient data)",
        };
    }
    // ── 2. Inject external context into indicators ───────────────────
    if (external.cvd !== undefined)
        indicators.cvd = external.cvd;
    if (external.fundingRate !== undefined)
        indicators.fundingRate = external.fundingRate;
    if (external.btcDominance !== undefined)
        indicators.btcDominance = external.btcDominance;
    if (external.btcDomChange !== undefined)
        indicators.btcDomChange = external.btcDomChange;
    if (external.putCallRatio !== undefined)
        indicators.putCallRatio = external.putCallRatio;
    if (external.longShortRatio !== undefined)
        indicators.longShortRatio = external.longShortRatio;
    if (external.topLongShortRatio !== undefined)
        indicators.topLongShortRatio = external.topLongShortRatio;
    if (external.stablecoinSignal !== undefined)
        indicators.stablecoinSignal = external.stablecoinSignal;
    // ── 2b. Regime pre-classification (P5.3) ─────────────────────────
    //
    // Pre-positioning purpose: allow regime.signalFilter to filter signal condition sets before signal detection (step 3).
    // Previously regime was only detected at step 4, could only affect risk params, couldn't filter signal conditions -- this was a bug.
    //
    // Activation condition (backward compatible):
    //   cfg.regime_strategies has explicit mapping -> activate signal condition filtering
    //   Not configured: regime only affects risk params (old behavior), no signal condition filtering.
    //   (To enable auto-categorization filtering, configure any entry in regime_strategies in YAML)
    const regime = classifyRegime(klines);
    const regimeThreshold = cfg.regime_confidence_threshold ?? 60;
    const regimeSigFilterEnabled = cfg.regime_strategies !== undefined && Object.keys(cfg.regime_strategies).length > 0;
    const effectiveSignals = regimeSigFilterEnabled && regime.confidence >= regimeThreshold
        ? applyRegimeSignalFilter(cfg, regime.signalFilter)
        : cfg.signals;
    // Merge filtered signal conditions into new cfg (only affects signals field, rest unchanged)
    const cfgWithRegimeSignals = effectiveSignals !== cfg.signals
        ? { ...cfg, signals: effectiveSignals }
        : cfg;
    // ── 3. Signal detection ───────────────────────────────────────
    //
    // F4 Strategy Plugin support:
    //   strategy_id === "default" or not configured -> uses existing detectSignal logic (completely unchanged)
    //   strategy_id is other value -> gets plugin from registry, calls populateSignal()
    const strategyId = cfg.strategy_id ?? "default";
    let signal;
    if (strategyId !== "default") {
        // ── Strategy plugin path ─────────────────────────────────
        const plugin = getStrategy(strategyId);
        const stateStore = createStateStore(strategyId, symbol);
        const ctx = {
            klines,
            cfg: cfgWithRegimeSignals, // Pass regime-filtered signal conditions
            indicators,
            stateStore,
            ...(external.currentPosSide !== undefined ? { currentPosSide: external.currentPosSide } : {}),
        };
        const signalType = plugin.populateSignal(ctx);
        signal = {
            symbol,
            type: signalType,
            price: indicators.price,
            indicators,
            reason: [`strategy:${strategyId}`],
            timestamp: Date.now(),
        };
    }
    else {
        // ── Default path (existing logic, completely unchanged) ──────────────
        signal = detectSignal(symbol, indicators, cfgWithRegimeSignals, external.currentPosSide);
    }
    if (signal.type === "none" || signal.type === "sell" || signal.type === "cover") {
        // Close signals and no-signal pass through directly, no additional filtering
        return {
            indicators,
            signal,
            effectiveRisk: cfg.risk,
            rejected: false,
        };
    }
    // ── The following filters apply only to buy / short entry signals ────────────
    // Spot market short signal guard: short signals are invalid for spot markets
    // RuntimeConfig (used by monitor/live-monitor) has exchange; StrategyConfig (tests/backtest) may not
    const market = "exchange" in cfg ? cfg.exchange.market : undefined;
    if (signal.type === "short" && market && market !== "futures" && market !== "margin") {
        return buildResult(indicators, signal, cfg.risk, true, `Short signal ignored: market type "${market}" does not support shorting`, undefined, undefined);
    }
    let effectiveRisk = cfg.risk;
    let effectivePositionRatio;
    let regimeLabel;
    // ── 4a. Regime-aware filtering ─────────────────────────────────
    // Regime was pre-computed in step 2b, reused here (no need to call classifyRegime again)
    if (regime.confidence >= regimeThreshold) {
        regimeLabel = regime.label;
        if (regime.signalFilter === "breakout_watch") {
            return {
                indicators,
                signal,
                effectiveRisk,
                rejected: true,
                rejectionReason: `Regime filter [${regime.label}] ${regime.detail}`,
                regimeLabel,
            };
        }
        if (regime.signalFilter === "reduced_size") {
            effectivePositionRatio = cfg.risk.position_ratio * 0.5;
        }
        // Merge regime_overrides
        const override = cfg.regime_overrides?.[regime.signalFilter];
        if (override) {
            effectiveRisk = { ...cfg.risk, ...override };
        }
    }
    // ── 4b. R:R filter (only when effectiveRisk.min_rr > 0) ─────
    if ((effectiveRisk.min_rr ?? 0) > 0) {
        const minRr = effectiveRisk.min_rr ?? 1.5;
        const rrResult = checkRiskReward(klines, indicators.price, signal.type === "short" ? "short" : "long", minRr);
        if (!rrResult.passed) {
            return buildResult(indicators, signal, effectiveRisk, true, `R:R filter -- ${rrResult.reason}`, regimeLabel, effectivePositionRatio);
        }
    }
    // ── 4c. Correlation filter (executed when heldKlinesMap is available) ────────
    const heldKlinesMap = external.heldKlinesMap;
    if (cfg.risk.correlation_filter?.enabled && heldKlinesMap) {
        const heldKeys = Object.keys(heldKlinesMap).filter((s) => s !== symbol);
        if (heldKeys.length > 0) {
            const corrCfg = cfg.risk.correlation_filter;
            const heldMap = new Map();
            for (const s of heldKeys) {
                const k = heldKlinesMap[s];
                if (k)
                    heldMap.set(s, k);
            }
            const corrResult = checkCorrelation(symbol, klines, heldMap, corrCfg.threshold);
            if (corrResult.correlated) {
                // High correlation: reduce position by 50% (cascading reduction, not outright rejection)
                const baseRatio = effectivePositionRatio ?? effectiveRisk.position_ratio;
                effectivePositionRatio = baseRatio * 0.5;
            }
        }
    }
    // ── 4d. Protection Manager ────────────────────────────
    const protectionCfg = cfg.protections;
    if (protectionCfg && recentTrades && recentTrades.length > 0) {
        const candleIntervalMs = candleMs(cfg.timeframe);
        const protResult = checkProtections(symbol, protectionCfg, recentTrades, candleIntervalMs);
        if (!protResult.allowed) {
            return buildResult(indicators, signal, effectiveRisk, true, `Protection filter -- ${protResult.reason ?? "protection triggered"}`, regimeLabel, effectivePositionRatio);
        }
    }
    return buildResult(indicators, signal, effectiveRisk, false, undefined, regimeLabel, effectivePositionRatio);
}
// ─────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────
/** Build SignalEngineResult, correctly handling exactOptionalPropertyTypes */
function buildResult(indicators, signal, effectiveRisk, rejected, rejectionReason, regimeLabel, effectivePositionRatio) {
    const base = { indicators, signal, effectiveRisk, rejected };
    if (rejectionReason !== undefined)
        base.rejectionReason = rejectionReason;
    if (regimeLabel !== undefined)
        base.regimeLabel = regimeLabel;
    if (effectivePositionRatio !== undefined)
        base.effectivePositionRatio = effectivePositionRatio;
    return base;
}
/** Convert timeframe string to milliseconds */
export function candleMs(timeframe) {
    const map = {
        "1m": 60_000,
        "5m": 5 * 60_000,
        "15m": 15 * 60_000,
        "1h": 60 * 60_000,
        "4h": 4 * 60 * 60_000,
        "1d": 24 * 60 * 60_000,
    };
    return map[timeframe] ?? 60 * 60_000; // Default 1h
}
