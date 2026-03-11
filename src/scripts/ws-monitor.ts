/**
 * WebSocket Real-time Kline Monitor (Long-running Process) — v0.9
 *
 * Feature-parity with monitor.ts / live-monitor.ts:
 *   processSignal() → regime awareness → correlation filter → R:R → protection
 *   → MTF trend filter → emergency halt → event calendar → sentiment gate → Kelly sizing
 *   → portfolio correlation heat → DCA → rebalancing → equity tracking → kill switch
 *
 * Compared to monitor.ts (cron polling):
 * - Latency: 60s → <1s (kline close events via WebSocket)
 * - Only runs strategy on kline close (avoids decisions based on incomplete candles)
 * - Stop-loss/take-profit: polls price every 60s (independent of kline close)
 * - BTC crash detection uses WS feed price — zero extra REST calls
 *
 * Start: npm run ws-monitor
 * Stop: Ctrl+C or SIGTERM
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getKlines } from "../exchange/binance.js";
import { BinanceWsManager } from "../exchange/ws.js";
import { processSignal } from "../strategy/signal-engine.js";
import { checkMtfFilter } from "../strategy/mtf-filter.js";
import { loadRecentTrades } from "../strategy/recent-trades.js";
import { readSentimentCache } from "../news/sentiment-cache.js";
import { notifySignal, notifyError, notifyPaperTrade, notifyStopLoss } from "../notify/openclaw.js";
import {
  handleSignal,
  checkExitConditions,
  checkMaxDrawdown,
  checkDailyLossLimit,
  checkDcaTranches,
  formatSummaryMessage,
} from "../paper/engine.js";
import { loadNewsReport, evaluateSentimentGate } from "../news/sentiment-gate.js";
import { loadAccount, saveAccount } from "../paper/account.js";
import type { PaperAccount } from "../paper/account.js";
import {
  calcCorrelationAdjustedSize,
  calcPortfolioExposure,
  formatPortfolioExposure,
} from "../strategy/portfolio-risk.js";
import type { PositionWeight } from "../strategy/portfolio-risk.js";
import { logSignal, closeSignal, logFilteredSignal } from "../strategy/signal-history.js";
import { recordEquitySnapshot } from "../report/equity-tracker.js";
import { readEmergencyHalt } from "../news/emergency-monitor.js";
import { checkEventRisk, loadCalendar } from "../strategy/events-calendar.js";
import { CvdManager, readCvdCache } from "../exchange/order-flow.js";
import { fetchFundingRatePct } from "../strategy/funding-rate-signal.js";
import { fetchLongShortRatios } from "../strategy/long-short-signal.js";
import { getBtcDominanceTrend } from "../strategy/btc-dominance.js";
import { calcKellyRatio } from "../strategy/kelly.js";
import { getOnChainContext } from "../exchange/onchain-data.js";
import { DataProvider } from "../exchange/data-provider.js";
import {
  isKillSwitchActive,
  activateKillSwitch,
  checkBtcCrash,
} from "../health/kill-switch.js";
import { computeRebalanceOrders, shouldRebalance } from "../strategy/rebalance.js";
import { ping } from "../health/heartbeat.js";
import { loadRuntimeConfigs } from "../config/loader.js";
import { createLogger } from "../logger.js";
import { applyParams } from "../optimization/objective.js";
import { getOrCreateAdaptiveManager } from "../optimization/adaptive.js";
import type { AdaptiveManager } from "../optimization/adaptive.js";
import { getStrategy } from "../strategies/registry.js";
import { createStateStore } from "../strategies/state-store.js";
import type { Strategy, StrategyContext } from "../strategies/types.js";
import type { RuntimeConfig, Signal, Indicators, Kline } from "../types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const log = createLogger("ws-monitor", path.resolve(__dirname, "../../logs/ws-monitor.log"));

// ─────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────

const BTC_CRASH_THRESHOLD_PCT = 8;
const MAX_BTC_PRICE_BUFFER = 60;
const PAIRLIST_MAX_AGE_MS = 25 * 60 * 60 * 1000;
const PAIRLIST_PATH = path.resolve(__dirname, "../../logs/current-pairlist.json");
const ONCHAIN_CACHE_PATH = path.resolve(__dirname, "../../logs/onchain-cache.json");
const STABLECOIN_REFRESH_MS = 60 * 60 * 1000;
const FILTERED_LOG_COOLDOWN_MS = 5 * 60 * 1000;
const SIGNAL_NOTIFY_COOLDOWN_MS = 30 * 60_000;
const TOTAL_LOSS_NOTIFY_COOLDOWN_MS = 30 * 60_000;

// ── Timeframe → DataProvider cache TTL ──────────────────────────
const TF_STALE_MAP: Record<string, number> = {
  "1m":  30,
  "5m":  210,
  "15m": 810,
  "1h":  3510,
  "4h":  14310,
  "1d":  86310,
};
function tfStaleSec(tf: string): number {
  return TF_STALE_MAP[tf] ?? 3510;
}

// ─────────────────────────────────────────────────────
// Module-level State
// ─────────────────────────────────────────────────────

const btcPriceBuffer: number[] = [];
const _totalLossNotifyAt = new Map<string, number>();
const _filteredCooldown = new Map<string, number>();
const _signalNotifyCooldown = new Map<string, number>();

let _stablecoinSignal: "accumulation" | "distribution" | "neutral" | undefined;
let _stablecoinSignalFetchedAt = 0;

const STALE_MAP_MAX_AGE_MS = 2 * 60 * 60 * 1000; // 2 hours

/** Periodically clean up stale entries in module-level Maps */
function cleanupStaleMaps(): void {
  const cutoff = Date.now() - STALE_MAP_MAX_AGE_MS;
  for (const [key, ts] of _totalLossNotifyAt) {
    if (ts < cutoff) _totalLossNotifyAt.delete(key);
  }
  for (const [key, ts] of _filteredCooldown) {
    if (ts < cutoff) _filteredCooldown.delete(key);
  }
  for (const [key, ts] of _signalNotifyCooldown) {
    if (ts < cutoff) _signalNotifyCooldown.delete(key);
  }
}

// ─────────────────────────────────────────────────────
// State Persistence
// ─────────────────────────────────────────────────────

function getStatePath(scenarioId: string): string {
  return path.resolve(__dirname, `../logs/state-${scenarioId}.json`);
}

interface MonitorState {
  lastSignals: Record<string, { type: string; timestamp: number }>;
  lastReportAt: number;
  paused: boolean;
}

function loadState(scenarioId: string): MonitorState {
  try {
    return JSON.parse(
      fs.readFileSync(getStatePath(scenarioId), "utf-8")
    ) as MonitorState;
  } catch {
    return { lastSignals: {}, lastReportAt: Date.now(), paused: false };
  }
}

function saveState(scenarioId: string, state: MonitorState): void {
  fs.mkdirSync(path.dirname(getStatePath(scenarioId)), { recursive: true });
  fs.writeFileSync(getStatePath(scenarioId), JSON.stringify(state, null, 2));
}

// ─────────────────────────────────────────────────────
// Helper Functions
// ─────────────────────────────────────────────────────

function loadPairlistSymbols(heldSymbols: string[]): string[] | null {
  try {
    const raw = fs.readFileSync(PAIRLIST_PATH, "utf-8");
    const data = JSON.parse(raw) as { symbols: string[]; updatedAt: number };
    if (Date.now() - data.updatedAt > PAIRLIST_MAX_AGE_MS) return null;
    return [...new Set([...data.symbols, ...heldSymbols])];
  } catch {
    return null;
  }
}

function buildPositionWeights(
  account: PaperAccount,
  priceMap: Record<string, number>,
): PositionWeight[] {
  const entries = Object.entries(account.positions);
  if (entries.length === 0) return [];
  const notionals = entries.map(([sym, pos]) => pos.quantity * (priceMap[sym] ?? pos.entryPrice));
  const totalEquity = account.usdt + notionals.reduce((s, v) => s + v, 0);
  if (totalEquity <= 0) return [];
  return entries.map(([sym, pos], i) => ({
    symbol: sym,
    side: pos.side ?? "long",
    notionalUsdt: notionals[i] ?? 0,
    weight: (notionals[i] ?? 0) / totalEquity,
  }));
}

/** Returns true = should log (first time or cooldown expired), updates timestamp */
function shouldLogFiltered(symbol: string, signalType: string): boolean {
  const key = `${symbol}:${signalType}`;
  const last = _filteredCooldown.get(key) ?? 0;
  if (Date.now() - last < FILTERED_LOG_COOLDOWN_MS) return false;
  _filteredCooldown.set(key, Date.now());
  return true;
}

function shouldNotifySignal(scenarioId: string, symbol: string, signalType: string): boolean {
  const key = `${scenarioId}:${symbol}:${signalType}`;
  const last = _signalNotifyCooldown.get(key) ?? 0;
  if (Date.now() - last < SIGNAL_NOTIFY_COOLDOWN_MS) return false;
  _signalNotifyCooldown.set(key, Date.now());
  return true;
}

function clearFilteredCooldown(symbol: string): void {
  for (const key of _filteredCooldown.keys()) {
    if (key.startsWith(`${symbol}:`)) _filteredCooldown.delete(key);
  }
}

function readOnchainCache(): "accumulation" | "distribution" | "neutral" | undefined {
  try {
    const raw = fs.readFileSync(ONCHAIN_CACHE_PATH, "utf-8");
    const d = JSON.parse(raw) as { stablecoinSignal: string; fetchedAt: number };
    if (Date.now() - d.fetchedAt > STABLECOIN_REFRESH_MS * 2) return undefined;
    return d.stablecoinSignal as "accumulation" | "distribution" | "neutral";
  } catch { return undefined; }
}

async function refreshStablecoinSignal(): Promise<void> {
  if (Date.now() - _stablecoinSignalFetchedAt < STABLECOIN_REFRESH_MS) return;
  try {
    const ctx = await getOnChainContext();
    _stablecoinSignal = ctx.stablecoinSignal;
    _stablecoinSignalFetchedAt = Date.now();
    fs.writeFileSync(ONCHAIN_CACHE_PATH, JSON.stringify({
      stablecoinSignal: _stablecoinSignal,
      fetchedAt: _stablecoinSignalFetchedAt,
    }));
    log.info(`🔗 On-chain stablecoin signal refreshed: ${_stablecoinSignal}`);
  } catch (e: unknown) {
    log.warn(`On-chain refresh failed: ${e instanceof Error ? e.message : String(e)}`);
    if (!_stablecoinSignal) _stablecoinSignal = readOnchainCache();
  }
}

/** Record signal history and write back to paper account */
function recordSignalHistory(
  symbol: string,
  type: "buy" | "short",
  entryPrice: number,
  indicators: Indicators,
  signal: { reason: string[] },
  cfg: RuntimeConfig,
): void {
  try {
    const sigId = logSignal({
      symbol,
      type,
      entryPrice,
      conditions: {
        maShort: indicators.maShort,
        maLong: indicators.maLong,
        rsi: indicators.rsi,
        ...(indicators.atr !== undefined && { atr: indicators.atr }),
        triggeredRules: signal.reason,
      },
      scenarioId: cfg.paper.scenarioId,
      source: "paper",
    });
    const acc = loadAccount(cfg.paper.initial_usdt, cfg.paper.scenarioId);
    if (acc.positions[symbol]) {
      acc.positions[symbol].signalHistoryId = sigId;
      saveAccount(acc, cfg.paper.scenarioId);
    }
  } catch { /* does not affect main flow */ }
}

// ─────────────────────────────────────────────────────
// Kline Rolling Buffer
// ─────────────────────────────────────────────────────

/** Each symbol maintains a rolling kline window for real-time indicator calculation */
type KlineBuffer = Map<string, Kline[]>;

/** Preload historical klines (REST) to prepare for subsequent WebSocket updates */
async function preloadKlines(
  symbols: string[],
  interval: string,
  limit: number
): Promise<KlineBuffer> {
  const buffer: KlineBuffer = new Map();
  const BATCH = 3;
  for (let i = 0; i < symbols.length; i += BATCH) {
    const batch = symbols.slice(i, i + BATCH);
    await Promise.all(
      batch.map(async (symbol) => {
        try {
          const klines = await getKlines(symbol, interval, limit);
          buffer.set(symbol, klines);
          log.info(`Preloaded ${symbol} klines: ${klines.length} bars`);
        } catch (err: unknown) {
          log.error(`Failed to preload ${symbol}: ${String(err)}`);
        }
      })
    );
  }
  return buffer;
}

/** Append a new closed kline to the buffer, maintaining a fixed length */
function appendKline(buffer: KlineBuffer, symbol: string, kline: Kline, maxLen: number): void {
  const existing = buffer.get(symbol) ?? [];
  if (existing.length > 0 && existing[existing.length - 1]?.openTime === kline.openTime) {
    existing[existing.length - 1] = kline;
  } else {
    existing.push(kline);
    if (existing.length > maxLen) existing.shift();
  }
  buffer.set(symbol, existing);
}

// ─────────────────────────────────────────────────────
// Strategy Scan (single symbol + single scenario)
// ─────────────────────────────────────────────────────

async function runStrategy(
  symbol: string,
  klines: Kline[],
  cfg: RuntimeConfig,
  state: MonitorState,
  currentPrices: Record<string, number>,
  buffer: KlineBuffer,
  provider: DataProvider,
): Promise<void> {
  const sid = cfg.paper.scenarioId;

  // ── Build external context ─────────────────────────────────
  let externalCvd: number | undefined;
  let externalFundingRate: number | undefined;
  let externalBtcDom: number | undefined;
  let externalBtcDomChange: number | undefined;
  let externalLSRatio: number | undefined;
  let externalTopLSRatio: number | undefined;

  // Funding rate
  try {
    const frPct = await fetchFundingRatePct(symbol);
    if (frPct !== undefined) externalFundingRate = frPct;
  } catch { /* silently skip */ }

  // BTC dominance
  try {
    const domTrend = getBtcDominanceTrend();
    if (!isNaN(domTrend.latest)) {
      externalBtcDom = domTrend.latest;
      externalBtcDomChange = domTrend.change;
    }
  } catch { /* silently skip */ }

  // Long/Short ratio
  try {
    const lsData = await fetchLongShortRatios(symbol);
    if (lsData) { externalLSRatio = lsData.globalLSRatio; externalTopLSRatio = lsData.topAccountLSRatio; }
  } catch { /* silently skip */ }

  // CVD (from CvdManager cache — no REST)
  try {
    const realCvd = readCvdCache(symbol) as { cvd?: number; updatedAt?: number } | undefined;
    const maxAgeMs = 5 * 60_000;
    if (realCvd?.cvd !== undefined && realCvd.updatedAt !== undefined &&
        Date.now() - realCvd.updatedAt < maxAgeMs) {
      externalCvd = realCvd.cvd;
    }
  } catch { /* silently skip */ }

  // Current position direction + correlation klines
  const currentAccount = loadAccount(cfg.paper.initial_usdt, cfg.paper.scenarioId);
  const _pos = currentAccount.positions[symbol];
  const currentPosSide: "long" | "short" | undefined = _pos ? (_pos.side ?? "long") : undefined;
  const heldKlinesMap: Record<string, Kline[]> = {};
  if (cfg.risk.correlation_filter?.enabled) {
    const heldSymbols = Object.keys(currentAccount.positions).filter((s) => s !== symbol);
    const corrLookback = cfg.risk.correlation_filter.lookback;
    await Promise.all(
      heldSymbols.map(async (sym) => {
        try {
          // Prefer WS buffer over REST
          const cached = buffer.get(sym);
          if (cached && cached.length >= corrLookback) {
            heldKlinesMap[sym] = cached.slice(-corrLookback - 1);
          } else {
            const providerKlines = provider.get(sym, cfg.timeframe);
            heldKlinesMap[sym] = providerKlines ?? await getKlines(sym, cfg.timeframe, corrLookback + 1);
          }
        } catch { /* skip on fetch failure */ }
      })
    );
  }

  // ── Adaptive parameters overlay (bandit-based tuning) ──────────
  let effectiveCfg: RuntimeConfig = cfg;
  let adaptiveMgr: AdaptiveManager | undefined;
  if (cfg.adaptive?.enabled && cfg.adaptive.mode === "bandit") {
    adaptiveMgr = getOrCreateAdaptiveManager(cfg);
    effectiveCfg = applyParams(adaptiveMgr.getActiveParams(), cfg) as RuntimeConfig;
    effectiveCfg = { ...cfg, ...effectiveCfg, paper: cfg.paper, exchange: cfg.exchange };
  }

  // ── Unified signal engine (identical to live-monitor.ts) ──────────
  const externalCtx = {
    ...(externalCvd !== undefined ? { cvd: externalCvd } : {}),
    ...(externalFundingRate !== undefined ? { fundingRate: externalFundingRate } : {}),
    ...(externalBtcDom !== undefined ? { btcDominance: externalBtcDom } : {}),
    ...(externalBtcDomChange !== undefined ? { btcDomChange: externalBtcDomChange } : {}),
    ...(externalLSRatio !== undefined ? { longShortRatio: externalLSRatio } : {}),
    ...(externalTopLSRatio !== undefined ? { topLongShortRatio: externalTopLSRatio } : {}),
    ...(currentPosSide !== undefined ? { currentPosSide } : {}),
    ...(Object.keys(heldKlinesMap).length > 0 ? { heldKlinesMap } : {}),
    ...(_stablecoinSignal !== undefined ? { stablecoinSignal: _stablecoinSignal } : {}),
  };
  const recentTrades = loadRecentTrades();
  const engineResult = processSignal(symbol, klines, effectiveCfg, externalCtx, recentTrades);

  if (!engineResult.indicators) {
    log.info(`[${sid}] ${symbol}: Indicator calculation failed, skipping`);
    return;
  }

  const { indicators, signal, effectiveRisk, effectivePositionRatio, rejected, rejectionReason, regimeLabel } = engineResult;

  // ── Deduplicate rejected signals ──
  if (rejected && !shouldLogFiltered(symbol, signal.type)) return;

  log.info(
    `[${sid}] ${symbol}: RSI=${indicators.rsi.toFixed(1)} ` +
    `EMA${cfg.strategy.ma.short}=$${indicators.maShort.toFixed(2)} ` +
    `EMA${cfg.strategy.ma.long}=$${indicators.maLong.toFixed(2)} ` +
    `ATR=${indicators.atr?.toFixed(2) ?? "N/A"} ` +
    `→ ${signal.type.toUpperCase()}` +
    (regimeLabel ? ` [${regimeLabel}]` : "")
  );

  if (rejected) {
    log.info(`[${sid}] ${symbol}: 🚫 ${rejectionReason ?? "filtered"}`);
    if (signal.type !== "none") {
      logFilteredSignal({ symbol, type: signal.type, price: indicators.price, filter: "engine", reason: rejectionReason ?? "filtered", scenarioId: sid, source: "paper" });
    }
    return;
  }

  if (signal.type === "none") {
    clearFilteredCooldown(symbol);
    return;
  }

  currentPrices[symbol] = indicators.price;

  // ── Entry signals (buy/short): full filter pipeline ─────────────
  if (signal.type === "buy" || signal.type === "short") {
    // Emergency halt
    const emergency = readEmergencyHalt();
    if (emergency.halt) {
      log.warn(`[${sid}] ${symbol}: ⛔ Emergency halt — ${emergency.reason ?? "breaking high-risk news"}`);
      logFilteredSignal({ symbol, type: signal.type, price: indicators.price, filter: "emergency", reason: emergency.reason ?? "breaking high-risk news", scenarioId: sid, source: "paper" });
      return;
    }

    // Event calendar risk
    try {
      const eventRisk = checkEventRisk(loadCalendar());
      if (eventRisk.phase === "during") {
        log.info(`[${sid}] ${symbol}: ⏸ Event window (${eventRisk.eventName}), pausing new entries`);
        logFilteredSignal({ symbol, type: signal.type, price: indicators.price, filter: "event", reason: `Event window: ${eventRisk.eventName}`, scenarioId: sid, source: "paper" });
        return;
      }
      if ((eventRisk.phase === "pre" || eventRisk.phase === "post") && eventRisk.positionRatioMultiplier < 1.0) {
        log.warn(`[${sid}] ${symbol}: ⚠️ Event risk period (${eventRisk.eventName}), position ×${eventRisk.positionRatioMultiplier}`);
      }
    } catch { /* silently skip on calendar load failure */ }

    // MTF trend filter
    const mtfCheck = await checkMtfFilter(symbol, signal.type, cfg, provider);
    if (mtfCheck.trendBull !== null) {
      log.info(`[${sid}] ${symbol}: MTF(${cfg.trend_timeframe}) → ${mtfCheck.trendBull ? "Bullish✅" : "Bearish🚫"}`);
    }
    if (mtfCheck.filtered) {
      log.info(`[${sid}] ${symbol}: 🚫 ${mtfCheck.reason}`);
      logFilteredSignal({ symbol, type: signal.type, price: indicators.price, filter: "mtf", reason: mtfCheck.reason ?? "MTF trend filter", scenarioId: sid, source: "paper" });
      return;
    }

    // Sentiment gate (with LLM cache)
    const newsReport = loadNewsReport();
    const baseForGate = effectivePositionRatio ?? effectiveRisk.position_ratio;
    const sentimentCache = readSentimentCache();
    const gate = evaluateSentimentGate(signal, newsReport, baseForGate, sentimentCache);
    log.info(`[${sid}] ${symbol}: Sentiment gate → ${gate.action} (${gate.reason})`);
    if (gate.action === "skip") {
      logFilteredSignal({ symbol, type: signal.type, price: indicators.price, filter: "sentiment", reason: gate.reason, scenarioId: sid, source: "paper" });
      return;
    }

    // Kelly dynamic position sizing
    let effectiveRatio = "positionRatio" in gate ? gate.positionRatio : baseForGate;
    if (cfg.risk.position_sizing === "kelly") {
      try {
        const histPath = path.resolve(__dirname, "../../logs/signal-history.jsonl");
        if (fs.existsSync(histPath)) {
          const lines = fs.readFileSync(histPath, "utf-8").split("\n").filter(Boolean);
          const closed = lines
            .map((l) => { try { return JSON.parse(l) as { status: string; pnlPercent?: number }; } catch { return null; } })
            .filter((r): r is { status: string; pnlPercent: number } => r?.status === "closed" && r.pnlPercent !== undefined);
          const kellyResult = calcKellyRatio(closed, {
            ...(cfg.risk.kelly_lookback !== undefined ? { lookback: cfg.risk.kelly_lookback } : {}),
            ...(cfg.risk.kelly_half !== undefined ? { half: cfg.risk.kelly_half } : {}),
            ...(cfg.risk.kelly_min_ratio !== undefined ? { minRatio: cfg.risk.kelly_min_ratio } : {}),
            ...(cfg.risk.kelly_max_ratio !== undefined ? { maxRatio: cfg.risk.kelly_max_ratio } : {}),
            minSamples: cfg.risk.kelly_min_samples ?? 30,
            fallback: cfg.risk.position_ratio,
          });
          log.info(`[${sid}] ${symbol}: 🎯 Kelly → ${kellyResult.reason}`);
          effectiveRatio = kellyResult.ratio;
        }
      } catch { /* Kelly failure does not affect main flow */ }
    }

    // Portfolio correlation heat
    try {
      const priceMap: Record<string, number> = { [symbol]: indicators.price };
      for (const [sym, klns] of Object.entries(heldKlinesMap)) {
        const last = klns.at(-1);
        if (last) priceMap[sym] = last.close;
      }
      const posWeights = buildPositionWeights(currentAccount, priceMap)
        .filter((pw) => pw.symbol !== symbol);
      if (posWeights.length > 0) {
        const klinesBySymbol: Record<string, Kline[]> = { [symbol]: klines, ...heldKlinesMap };
        const portfolioHeat = calcCorrelationAdjustedSize(
          symbol,
          signal.type === "buy" ? "long" : "short",
          effectiveRatio,
          posWeights,
          klinesBySymbol,
        );
        log.info(
          `[${sid}] ${symbol}: 📊 Portfolio heat ${(portfolioHeat.heat * 100).toFixed(0)}% → ${portfolioHeat.decision} (${portfolioHeat.reason})`
        );
        if (portfolioHeat.decision === "blocked") {
          log.info(`[${sid}] ${symbol}: 🚫 Portfolio heat too high, entry rejected`);
          return;
        }
        effectiveRatio = portfolioHeat.adjustedPositionRatio;
      }
    } catch { /* portfolio heat failure does not block main flow */ }

    // ── Execute paper trade ──────────────────────────────────
    const adjustedCfg = { ...cfg, risk: { ...effectiveRisk, position_ratio: effectiveRatio } };

    // Notify (with 30-min dedup cooldown per scenario+symbol)
    if (cfg.notify.on_signal && (signal.type === "buy" || signal.type === "short")) {
      if (shouldNotifySignal(sid, symbol, signal.type)) {
        notifySignal(signal);
      }
    }

    const result = handleSignal(signal, adjustedCfg);
    if (result.skipped) {
      log.info(`[${sid}] ${symbol}: ⏭️ Skipped — ${result.skipped}`);
    }
    if (result.trade) {
      const action = result.trade.side === "buy" ? "Buy (open long)" : "Open short";
      log.info(`[${sid}] ${symbol}: 📝 Paper ${action} @${result.trade.price.toFixed(4)} (position ${(effectiveRatio * 100).toFixed(0)}%)`);
      notifyPaperTrade(result.trade, result.account);
      recordSignalHistory(symbol, signal.type as "buy" | "short", result.trade.price, indicators, signal, cfg);
      // Adaptive: attribute arm to opened position
      if (adaptiveMgr) {
        try {
          const acc = loadAccount(cfg.paper.initial_usdt, cfg.paper.scenarioId);
          if (acc.positions[symbol]) {
            acc.positions[symbol].adaptiveArmId = adaptiveMgr.getActiveArmId();
            saveAccount(acc, cfg.paper.scenarioId);
          }
        } catch { /* non-fatal */ }
      }
    }
    if (gate.action === "warn") {
      notifyError(symbol, new Error(`⚠️ Sentiment warning: ${gate.reason}`));
    }
    state.lastSignals[signal.symbol] = { type: signal.type, timestamp: Date.now() };
  } else if (signal.type === "sell" || signal.type === "cover") {
    // Close position — only notify if position actually exists
    const account = loadAccount(cfg.paper.initial_usdt, cfg.paper.scenarioId);
    const sigHistId = account.positions[symbol]?.signalHistoryId;
    const exitArmId = account.positions[symbol]?.adaptiveArmId;
    if (account.positions[symbol]) {
      if (cfg.notify.on_signal) notifySignal(signal);
      const result = handleSignal(signal, cfg);
      if (result.trade) {
        const action = signal.type === "sell" ? "Sell (close long)" : "Cover short";
        log.info(`[${sid}] ${symbol}: 📝 Paper ${action} @${result.trade.price.toFixed(4)}`);
        notifyPaperTrade(result.trade, result.account);
        if (sigHistId) {
          try { closeSignal(sigHistId, result.trade.price, "signal", result.trade.pnl); } catch { /* skip */ }
        }
        // Adaptive: reward attribution
        if (adaptiveMgr && result.trade.pnlPercent !== undefined) {
          try { adaptiveMgr.onTradeClosed({ pnlPercent: result.trade.pnlPercent, armId: exitArmId }); } catch { /* non-fatal */ }
        }
      }
      state.lastSignals[signal.symbol] = { type: signal.type, timestamp: Date.now() };
    } else {
      log.info(`[${sid}] ${symbol}: ${signal.type === "sell" ? "Sell" : "Cover"} signal skipped — no open position`);
    }
  }
}

// ─────────────────────────────────────────────────────
// Stop-loss/Take-profit Polling (every minute, independent of kline close)
// ─────────────────────────────────────────────────────

async function checkExits(
  cfg: RuntimeConfig,
  currentPrices: Record<string, number>
): Promise<void> {
  if (Object.keys(currentPrices).length === 0) return;
  const sid = cfg.paper.scenarioId;
  const state = loadState(sid);

  // Resolve strategy plugin (for shouldExit/customStoploss/adjustPosition hooks)
  let strategy: Strategy | undefined;
  let strategyCtx: StrategyContext | undefined;
  const strategyId = cfg.strategy_id ?? "default";
  if (strategyId !== "default") {
    try {
      strategy = getStrategy(strategyId);
      strategyCtx = {
        klines: [],
        cfg,
        indicators: { maShort: 0, maLong: 0, rsi: 0, price: 0, volume: 0, avgVolume: 0 },
        stateStore: createStateStore(strategyId, "global"),
      };
    } catch { /* strategy not found: continue without plugin */ }
  }

  // Snapshot account before exit processing (to read signalHistoryId)
  const accountSnapshot = loadAccount(cfg.paper.initial_usdt, cfg.paper.scenarioId);

  const exits = checkExitConditions(currentPrices, cfg, strategy, strategyCtx);
  for (const { symbol, trade, reason, pnlPercent } of exits) {
    const emoji = reason === "take_profit" ? "🎯" : "🚨";
    const label =
      reason === "take_profit" ? "Take profit" :
      reason === "trailing_stop" ? "Trailing stop" :
      reason === "time_stop" ? "Time stop" : "Stop loss";
    log.info(`[${sid}] ${symbol}: ${emoji} ${label} triggered (${pnlPercent.toFixed(2)}%)`);

    // Adaptive: reward attribution on exit
    if (cfg.adaptive?.enabled && cfg.adaptive.mode === "bandit") {
      try {
        const mgr = getOrCreateAdaptiveManager(cfg);
        mgr.onTradeClosed({ pnlPercent, armId: accountSnapshot.positions[symbol]?.adaptiveArmId });
      } catch { /* non-fatal */ }
    }

    // Close signal history record
    const sigHistId = accountSnapshot.positions[symbol]?.signalHistoryId;
    if (sigHistId) {
      try {
        const exitReason = reason.includes("stop_loss") ? "stop_loss"
          : reason.includes("take_profit") ? "take_profit"
          : reason.includes("trailing") ? "trailing_stop"
          : reason.includes("time") ? "time_stop"
          : "signal";
        closeSignal(sigHistId, trade.price, exitReason, trade.pnl);
      } catch { /* skip */ }
    }

    if (reason !== "take_profit") {
      notifyStopLoss(symbol, trade.price / (1 + pnlPercent / 100), trade.price, pnlPercent / 100);
    } else if (cfg.notify.on_take_profit) {
      const placeholderIndicators: Indicators = {
        maShort: trade.price,
        maLong: trade.price,
        rsi: 50,
        price: trade.price,
        volume: 0,
        avgVolume: 0,
      };
      notifySignal({
        symbol,
        type: "sell",
        price: trade.price,
        indicators: placeholderIndicators,
        reason: [`Take profit: +${pnlPercent.toFixed(2)}%`],
        timestamp: Date.now(),
      });
    }
  }

  // ── DCA tranche check ─────────────────────────────────────
  if (cfg.risk.dca?.enabled) {
    const dcaResults = checkDcaTranches(currentPrices, cfg, strategy, strategyCtx);
    for (const { symbol, trade, tranche, totalTranches } of dcaResults) {
      log.info(`[${sid}] ${symbol}: 💰 DCA tranche ${tranche}/${totalTranches} @${trade.price.toFixed(4)} (${trade.usdtAmount.toFixed(2)} USDT)`);
      notifyPaperTrade(trade, loadAccount(cfg.paper.initial_usdt, cfg.paper.scenarioId));
    }
  }

  if (checkDailyLossLimit(currentPrices, cfg)) {
    log.warn(`[${sid}] ⚠️ Daily loss reached ${cfg.risk.daily_loss_limit_percent}%, pausing new entries for today`);
  }

  if (checkMaxDrawdown(currentPrices, cfg)) {
    log.error(`[${sid}] 🚨 Total loss exceeded limit, scenario paused!`);
    state.paused = true;
    saveState(sid, state);
    notifyError(
      `[${sid}]`,
      new Error(`Total loss exceeded ${cfg.risk.max_total_loss_percent}%, paper trading paused`)
    );
  }

  // ── Portfolio exposure + equity snapshot ─────────────────────
  const accForExp = loadAccount(cfg.paper.initial_usdt, cfg.paper.scenarioId);
  const posWeights = buildPositionWeights(accForExp, currentPrices);
  const totalEquity = accForExp.usdt + posWeights.reduce((s, pw) => s + pw.notionalUsdt, 0);

  try {
    if (Object.keys(accForExp.positions).length > 0) {
      const klinesBySymbol: Record<string, Kline[]> = {};
      const exposure = calcPortfolioExposure(posWeights, totalEquity, klinesBySymbol);
      log.info(`[${sid}] ${formatPortfolioExposure(exposure).replace(/\*\*/g, "")}`);
    }
  } catch (e: unknown) { log.warn(`[${sid}] Portfolio exposure failed: ${e instanceof Error ? e.message : String(e)}`); }

  try {
    recordEquitySnapshot(sid, totalEquity, Object.keys(accForExp.positions).length);
  } catch (e: unknown) { log.warn(`[${sid}] Equity snapshot failed: ${e instanceof Error ? e.message : String(e)}`); }

    // ── v0.8 Portfolio rebalancing ─────────────────────────────
    if (cfg.rebalance?.enabled) {
      try {
        const rebalanceStatePath = path.resolve(__dirname, `../../logs/rebalance-state-${sid}.json`);
        let lastRebalanceAt = 0;
        try {
          const rs = JSON.parse(fs.readFileSync(rebalanceStatePath, "utf-8")) as { lastRebalanceAt: number };
          lastRebalanceAt = rs.lastRebalanceAt ?? 0;
        } catch { /* first run */ }

        if (shouldRebalance(cfg.rebalance, lastRebalanceAt)) {
          const posNotionals: Record<string, number> = {};
          for (const [sym, pos] of Object.entries(accForExp.positions)) {
            posNotionals[sym] = pos.quantity * (currentPrices[sym] ?? pos.entryPrice);
          }
          const result = computeRebalanceOrders(cfg.rebalance, posNotionals, currentPrices, totalEquity);
          if (result.rebalanceNeeded) {
            log.info(`[${sid}] Rebalance: ${result.reason}`);
            for (const order of result.orders) {
              log.info(`[${sid}] Rebalance ${order.action.toUpperCase()} ${order.symbol}: $${order.amountUsdt.toFixed(2)} (${(order.currentWeight * 100).toFixed(1)}% → ${(order.targetWeight * 100).toFixed(1)}%)`);
              try {
                const price = currentPrices[order.symbol] ?? 0;
                const placeholderIndicators: Indicators = {
                  maShort: 0, maLong: 0, rsi: 50, price, volume: 0, avgVolume: 0,
                };
                if (order.action === "buy") {
                  const signal: Signal = {
                    symbol: order.symbol, type: "buy", price,
                    indicators: placeholderIndicators,
                    reason: [`rebalance: underweight by ${(Math.abs(order.deviation) * 100).toFixed(1)}%`],
                    timestamp: Date.now(),
                  };
                  handleSignal(signal, cfg);
                } else {
                  const signal: Signal = {
                    symbol: order.symbol, type: "sell", price,
                    indicators: placeholderIndicators,
                    reason: [`rebalance: overweight by ${(order.deviation * 100).toFixed(1)}%`],
                    timestamp: Date.now(),
                  };
                  handleSignal(signal, cfg);
                }
              } catch (e: unknown) { log.warn(`[${sid}] Rebalance order failed: ${e instanceof Error ? e.message : String(e)}`); }
            }
            fs.mkdirSync(path.dirname(rebalanceStatePath), { recursive: true });
            fs.writeFileSync(rebalanceStatePath, JSON.stringify({ lastRebalanceAt: Date.now() }));
          }
        }
      } catch (e: unknown) { log.warn(`[${sid}] Rebalance check failed: ${e instanceof Error ? e.message : String(e)}`); }
    }

  // Periodic account report
  const intervalMs = cfg.paper.report_interval_hours * 3600000;
  if (intervalMs > 0 && Date.now() - state.lastReportAt >= intervalMs) {
    log.info(`[${sid}] 📊 Sending periodic account report`);
    const msg = formatSummaryMessage(currentPrices, cfg);
    const { spawnSync } = await import("child_process");
    const OPENCLAW_BIN = process.env["OPENCLAW_BIN"] ?? "openclaw";
    const GATEWAY_TOKEN = process.env["OPENCLAW_GATEWAY_TOKEN"] ?? "";
    const args = ["system", "event", "--mode", "now"];
    if (GATEWAY_TOKEN) args.push("--token", GATEWAY_TOKEN);
    args.push("--text", msg);
    spawnSync(OPENCLAW_BIN, args, { encoding: "utf-8", timeout: 15000 });
    state.lastReportAt = Date.now();
    saveState(sid, state);
  }
}

// ─────────────────────────────────────────────────────
// Main Entry
// ─────────────────────────────────────────────────────

async function main(): Promise<void> {
  log.info("─── WebSocket Monitor Started (v0.9 — Feature Parity) ───");

  const runtimes = loadRuntimeConfigs();
  const firstRuntime = runtimes[0];
  if (!firstRuntime) { log.error("No available strategy config"); return; }
  if (!firstRuntime.strategy.enabled) {
    log.info("Strategy is disabled, exiting");
    return;
  }

  // Union (deduplicated) of all scenario symbols + same timeframe
  const allSymbols = [...new Set(runtimes.flatMap((r) => r.symbols))];
  const timeframe = firstRuntime.timeframe;

  // Calculate the maximum number of klines needed
  const maxLimit = Math.max(
    ...runtimes.map((r) => {
      const macdMin = r.strategy.macd.enabled ? r.strategy.macd.slow + r.strategy.macd.signal + 1 : 0;
      return Math.max(r.strategy.ma.long, r.strategy.rsi.period, macdMin) + 20;
    })
  );

  log.info(`Scenarios: ${runtimes.map((r) => r.paper.scenarioId).join(", ")}`);
  log.info(`Watching symbols: ${allSymbols.join(", ")} | Timeframe: ${timeframe} | Buffer: ${maxLimit} bars`);
  log.info(`📋 Signal pipeline: processSignal() + MTF + sentiment + Kelly + event calendar + portfolio heat + DCA + rebalance`);

  // Preload historical klines (REST)
  const buffer = await preloadKlines(allSymbols, timeframe, maxLimit);

  // Current price summary (for stop-loss/take-profit polling)
  const currentPrices: Record<string, number> = {};
  for (const [symbol, klines] of buffer) {
    if (klines.length > 0) {
      currentPrices[symbol] = klines[klines.length - 1]?.close ?? 0;
    }
  }

  // ── CvdManager: Start aggTrade WS for all symbols ──────────
  const cvdManager = allSymbols.length > 0 ? new CvdManager(allSymbols, { windowMs: 3_600_000 }) : null;
  if (cvdManager) {
    cvdManager.start();
    log.info(`📊 Real CVD started, monitoring ${allSymbols.length} symbols`);
  }

  // ── DataProvider: Per scenario for MTF kline caching ──────────
  const dataProviders = new Map<string, DataProvider>();
  for (const cfg of runtimes) {
    const stale = tfStaleSec(cfg.timeframe);
    dataProviders.set(cfg.paper.scenarioId, new DataProvider(stale));
    log.info(`📦 ${cfg.paper.scenarioId}: DataProvider cache TTL ${stale}s (timeframe=${cfg.timeframe})`);
  }

  // Pre-fetch MTF klines so first signal check has data
  for (const cfg of runtimes) {
    if (cfg.trend_timeframe && cfg.trend_timeframe !== cfg.timeframe) {
      const provider = dataProviders.get(cfg.paper.scenarioId);
      if (provider) {
        const trendLimit = cfg.strategy.ma.long + 10;
        await provider.refresh(cfg.symbols, cfg.trend_timeframe, trendLimit).catch(() => {});
      }
    }
  }

  // ── WebSocket Connection ──────────────────────────────────
  const wsManager = new BinanceWsManager(allSymbols, timeframe, (msg: string) => log.info(msg));

  wsManager.subscribe(async ({ symbol, kline, isClosed }) => {
    // Update price regardless of close (faster stop-loss response)
    currentPrices[symbol] = kline.close;

    // BTC price for crash detection (from WS, no REST)
    if (symbol === "BTCUSDT") {
      btcPriceBuffer.push(kline.close);
      if (btcPriceBuffer.length > MAX_BTC_PRICE_BUFFER) btcPriceBuffer.shift();
    }

    if (!isClosed) return;

    log.info(`Kline closed: ${symbol} close=${kline.close.toFixed(4)}`);
    appendKline(buffer, symbol, kline, maxLimit);

    const klines = buffer.get(symbol);
    if (!klines || klines.length < maxLimit / 2) return;

    // Run strategy for all scenarios
    for (const cfg of runtimes) {
      if (!cfg.symbols.includes(symbol)) continue;

      // Kill switch check
      if (isKillSwitchActive()) {
        log.warn(`[${cfg.paper.scenarioId}] ⛔ Kill Switch active, skipping signal processing`);
        continue;
      }

      // Pairlist override
      const account = loadAccount(cfg.paper.initial_usdt, cfg.paper.scenarioId);
      const heldSymbols = Object.keys(account.positions);
      const pairlistSymbols = loadPairlistSymbols(heldSymbols);
      if (pairlistSymbols && !pairlistSymbols.includes(symbol)) continue;

      // Total loss protection (skip entries, exits still run via checkExits poll)
      let totalLossBreached = false;
      if ((cfg.risk.max_total_loss_percent ?? 0) > 0) {
        const posWeightsForLoss = buildPositionWeights(account, currentPrices);
        const currentEquity = account.usdt + posWeightsForLoss.reduce((s, pw) => s + pw.notionalUsdt, 0);
        const lossPct = ((account.initialUsdt - currentEquity) / account.initialUsdt) * 100;
        if (lossPct >= cfg.risk.max_total_loss_percent) {
          totalLossBreached = true;
          log.warn(
            `⛔ [${cfg.paper.scenarioId}] Total loss ${lossPct.toFixed(2)}% exceeds limit ${cfg.risk.max_total_loss_percent}%, skipping entries`
          );
          const lastNotify = _totalLossNotifyAt.get(cfg.paper.scenarioId) ?? 0;
          if (Date.now() - lastNotify >= TOTAL_LOSS_NOTIFY_COOLDOWN_MS) {
            notifyError(cfg.paper.scenarioId, new Error(
              `⛔ Total loss ${lossPct.toFixed(2)}% exceeds ${cfg.risk.max_total_loss_percent}% limit, new entries auto-paused`
            ));
            _totalLossNotifyAt.set(cfg.paper.scenarioId, Date.now());
          }
        }
      }
      if (totalLossBreached) continue;

      const state = loadState(cfg.paper.scenarioId);
      if (state.paused) continue;

      const provider = dataProviders.get(cfg.paper.scenarioId) ?? new DataProvider(tfStaleSec(cfg.timeframe));

      // Refresh MTF klines (only on kline close, naturally low rate)
      if (cfg.trend_timeframe && cfg.trend_timeframe !== cfg.timeframe) {
        const trendLimit = cfg.strategy.ma.long + 10;
        await provider.refresh([symbol], cfg.trend_timeframe, trendLimit).catch(() => {});
      }

      try {
        await runStrategy(symbol, klines, cfg, state, currentPrices, buffer, provider);
        saveState(cfg.paper.scenarioId, state);
      } catch (err: unknown) {
        const error = err instanceof Error ? err : new Error(String(err));
        log.error(`[${cfg.paper.scenarioId}] ${symbol}: Strategy error - ${error.message}`);
        if (cfg.notify.on_error) notifyError(symbol, error);
      }
    }
  });

  wsManager.start();

  // ── Stop-loss/Take-profit Polling (every 60s) ────────────────────────────
  const EXIT_POLL_MS = 60 * 1000;
  const exitPollId = setInterval(() => {
    void ping("ws_monitor");

    // BTC crash detection (from WS price buffer — no REST)
    if (!isKillSwitchActive() && btcPriceBuffer.length >= 10) {
      const { crash, dropPct } = checkBtcCrash(btcPriceBuffer, BTC_CRASH_THRESHOLD_PCT);
      if (crash) {
        const reason = `BTC recent drop ${dropPct.toFixed(2)}% exceeds threshold ${BTC_CRASH_THRESHOLD_PCT}%`;
        log.warn(`⛔ Auto-triggered Kill Switch: ${reason}`);
        activateKillSwitch(reason);
        notifyError("KILL_SWITCH", new Error(`⛔ Kill Switch auto-activated: ${reason}`));
      }
    }

    // Stablecoin signal refresh (hourly)
    void refreshStablecoinSignal().catch(() => {});

    for (const cfg of runtimes) {
      void checkExits(cfg, { ...currentPrices });
    }
  }, EXIT_POLL_MS);

  // ── Hourly stale Map cleanup ─────────────────────────────────
  const cleanupId = setInterval(cleanupStaleMaps, 60 * 60 * 1000);

  // ── Graceful Shutdown ─────────────────────────────────────────
  function shutdown(signal: string): void {
    log.info(`Received ${signal}, shutting down...`);
    clearInterval(exitPollId);
    clearInterval(cleanupId);
    wsManager.stop();
    cvdManager?.stop();
    process.exit(0);
  }

  process.on("SIGTERM", () => { shutdown("SIGTERM"); });
  process.on("SIGINT", () => { shutdown("SIGINT"); });

  log.info(`✅ WebSocket monitor running, waiting for kline close events...`);
}

process.on("unhandledRejection", (reason: unknown) => {
  console.error("[FATAL] Unhandled Rejection:", reason);
  process.exit(1);
});

main().catch((err: unknown) => {
  console.error("Fatal:", String(err));
  process.exit(1);
});
