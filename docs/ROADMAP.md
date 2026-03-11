# Roadmap

> openclaw-trader development roadmap. Items are ordered by priority within each phase.

---

## v0.2 — Execution Reliability ✅

- [x] **Unified MTF filter** — `monitor.ts` now uses `checkMtfFilter()` after signal detection (same pattern as `live-monitor.ts`)
- [x] **Activate Protection Manager** — `recentTrades` already passed into `processSignal()`, cooldown / stoploss_guard / max_drawdown all active
- [x] **Short staged take-profit** — `tpStages` initialized for both long and short positions (A-007 fix)
- [x] **Spot market short signal guard** — Short signals rejected at signal-engine level for spot markets (before notifications)
- [x] **Regime confidence config** — Exposed as `regime_confidence_threshold` in YAML (default: 60)

## v0.3 — Observability & Dashboard ✅

- [x] **Web dashboard auth** — Basic auth via `DASHBOARD_AUTH=user:pass` env var
- [x] **Telegram bot as standalone** — Long-polling mode via `npm run telegram-poll` (TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID)
- [x] **Filtered signal logging** — Rejected signals persisted to `logs/filtered-signals.jsonl` with filter name + reason
- [x] **Real-time equity tracking** — `recordEquitySnapshot()` called from both monitors (rate-limited 1/hour)

## v0.4 — Strategy & Intelligence ✅

- [x] **Kelly position sizing activation** — Enabled `position_sizing: "kelly"` with `kelly_min_samples: 30` (auto-fallback to fixed when < 30 trades)
- [x] **Walk-forward scheduling** — `npm run auto-wf:schedule` with `--interval` day guard for safe cron scheduling
- [x] **LLM sentiment enrichment** — Already implemented: `llm-sentiment.ts` (OpenClaw Gateway), `sentiment-cache.ts` (6h TTL), `sentiment-gate.ts` (LLM → keyword → FGI cascade)
- [x] **Options flow integration** — Already implemented: `options-data.ts` (Deribit IV + PCR), position size multiplier (extreme→0.5×, elevated→0.7×)
- [x] **On-chain metrics** — Already implemented: `onchain-data.ts` (DeFiLlama stablecoin flow, Blockchair BTC network), `order-flow.ts` (CVD tick-level via WebSocket)

## v0.5 — Containerization & Deployment ✅

- [x] **Docker deployment** — `Dockerfile` (Node.js 22 alpine multi-stage) + `docker-compose.yml` (bot / dashboard / telegram)
- [x] **Cloud-native scheduler** — `src/scheduler.ts` built-in setInterval scheduler, replaces system crontab
- [x] **Supervisor mode** — Single process manages all sub-tasks, auto-restart on crash

## v0.6 — Multi-Exchange & Scaling ✅

- [x] **Exchange abstraction layer** — `IExchange` interface + `BinanceExchange` implementation + DI injection into `LiveExecutor`
- [x] **Multi-account support** — `live.yaml` accounts array, composite scenarioId, Dashboard grouped by account

## v0.7 — Advanced Intelligence ✅

- [x] **Options deep analysis** — Max Pain, IV Skew (25d), IV term structure (contango/backwardation), integrated into `derivatives-data.ts`
- [x] **Long/Short ratio signals** — `long-short-signal.ts` cache layer + 4 signal conditions (`ls_ratio_extreme_long/short`, `ls_ratio_long_biased/short_biased`) + monitor injection
- [x] **On-chain stablecoin flow** — DeFiLlama stablecoin flow + `stablecoin_accumulation/distribution` signal conditions

## v0.8 — Strategy Enhancement ✅

- [x] **Grid strategy plugin** — `src/strategies/grid.ts`, arithmetic/geometric grid, auto-range detection, grid trading via `populateSignal`/`adjustPosition`/`shouldExit` hooks
- [x] **Portfolio rebalancing** — `src/strategy/rebalance.ts`, target weight deviation detection + correction order generation, integrated into `monitor.ts` and `live-monitor.ts`
- [x] **stateStore injection fix** — `signal-engine.ts` injects `stateStore` for all non-default strategy plugins, fixes state persistence for `rsi-reversal` etc.

---

## v0.9 — WebSocket Monitor Feature Parity ✅

- [x] **ws-monitor full feature parity** — `ws-monitor.ts` upgraded from `detectSignal()` to full `processSignal()` pipeline, fully aligned with `monitor.ts`/`live-monitor.ts`
- [x] **Signal engine integration** — Regime awareness, R:R filter, correlation filter, protection manager all connected
- [x] **Entry filter chain** — emergency halt → event calendar → MTF trend filter → sentiment gate (LLM cache) → Kelly sizing → portfolio correlation heat
- [x] **Exit enhancements** — DCA tranches, signal history close, portfolio exposure + equity snapshot, portfolio rebalancing
- [x] **BTC crash detection** — Uses WS real-time price directly, zero extra REST requests
- [x] **Kill Switch** — CvdManager connected, global circuit breaker protection
- [x] **Dynamic pairlist** — `loadPairlistSymbols()` support, preserves held position symbols
- [x] **Total loss protection** — Suspends entry on limit breach, exits still execute normally
- [x] **Stablecoin signals** — On-chain data hourly refresh (shares cache file with live-monitor)

## v0.10 — Backtest Performance Optimization ✅

- [x] **Parallel API fetch** — `fetchAllSymbols()` with async semaphore (concurrency=3), different symbols fetched concurrently while respecting Binance rate limits
- [x] **Worker Thread pool** — `BacktestWorkerPool` for parallel `runBacktest()` execution across strategies/parameter combos, small-job optimization (1 job → direct call)
- [x] **In-memory kline cache** — `KlineCache` wraps `fetchHistoricalKlines` with `Map` cache, `getAll()` uses parallel fetch for cold-cache misses
- [x] **Consumer script upgrades** — `backtest.ts` (runOne/runCompare/runSlippageSweep), `analyze-strategy.ts`, `regime-backtest.ts` all use parallel fetch
- [x] **Walk-forward/sensitivity async** — `walkForwardSingle()` and `runSensitivity()` now async with optional worker pool parameter
- [x] **Auto-wf parallelism** — Pre-fetches all symbols before optimization loop, cross-symbol parallelism via `Promise.all()`

## v1.0 — Production Readiness (planned)

- [ ] **Strategy marketplace** — Community-driven YAML + plugin package sharing/importing, `openclaw strategy install <name>` CLI command
- [ ] **Second exchange integration** — Connect OKX / Bybit on `IExchange` abstraction, YAML `exchange.name: "okx"` switch, unified REST + WS interface mapping
- [ ] **AI adaptive parameters** — RL/Bandits replacing walk-forward fixed optimization cycles, online learning fine-tunes parameters based on recent N trades
- [ ] **Exchange fund flow (paid API)** — CryptoQuant / Glassnode integration: exchange net inflow/outflow, whale address tracking, SOPR indicator
- [ ] **Multi-timeframe Dashboard** — Switch between signal views of different timeframes, multi-strategy comparison panel

---

*This roadmap reflects current priorities and may evolve based on community feedback and usage patterns.*
