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

- [x] **Docker 部署** — `Dockerfile` (Node.js 22 alpine multi-stage) + `docker-compose.yml` (bot / dashboard / telegram)
- [x] **云原生调度器** — `src/scheduler.ts` 内建 setInterval 调度, 替代系统 crontab
- [x] **Supervisor 模式** — 单进程管理所有子任务, 进程崩溃自动重启

## v0.6 — Multi-Exchange & Scaling ✅

- [x] **交易所抽象层** — `IExchange` 接口 + `BinanceExchange` 实现 + DI 注入到 `LiveExecutor`
- [x] **多账户支持** — `live.yaml` accounts 数组, composite scenarioId, Dashboard 按账户分组

## v0.7 — Advanced Intelligence ✅

- [x] **期权深度分析** — Max Pain, IV Skew (25d), IV 期限结构 (contango/backwardation), 已集成至 `derivatives-data.ts`
- [x] **多空比信号集成** — `long-short-signal.ts` 缓存层 + 4 个信号条件 (`ls_ratio_extreme_long/short`, `ls_ratio_long_biased/short_biased`) + monitor 注入
- [x] **On-chain stablecoin flow** — DeFiLlama 稳定币流量 + `stablecoin_accumulation/distribution` 信号条件

## v0.8 — Strategy Enhancement ✅

- [x] **Grid 策略插件** — `src/strategies/grid.ts`, 算术/几何网格, auto-range 自动范围检测, 通过 `populateSignal`/`adjustPosition`/`shouldExit` 钩子实现网格交易
- [x] **Portfolio 再平衡** — `src/strategy/rebalance.ts`, 目标权重偏离检测 + 校正订单生成, 集成至 `monitor.ts` 和 `live-monitor.ts`
- [x] **stateStore 注入修复** — `signal-engine.ts` 为所有非 default 策略插件注入 `stateStore`, 修复 `rsi-reversal` 等插件的状态持久化

---

## v0.9 — WebSocket Monitor Feature Parity ✅

- [x] **ws-monitor 全功能对齐** — `ws-monitor.ts` 从 `detectSignal()` 升级为完整 `processSignal()` 管线, 与 `monitor.ts`/`live-monitor.ts` 完全对齐
- [x] **信号引擎集成** — regime awareness, R:R filter, correlation filter, protection manager 全部接入
- [x] **入场过滤链** — emergency halt → event calendar → MTF trend filter → sentiment gate (LLM cache) → Kelly sizing → portfolio correlation heat
- [x] **退出增强** — DCA tranches, signal history close, portfolio exposure + equity snapshot, portfolio rebalancing
- [x] **BTC 崩盘检测** — 直接使用 WS 实时价格, 零额外 REST 请求
- [x] **Kill Switch** — CvdManager 接入, 全局熔断保护
- [x] **动态 pairlist** — `loadPairlistSymbols()` 支持, 保留持仓 symbol
- [x] **总亏损保护** — 超限暂停入场, 退出仍正常执行
- [x] **Stablecoin 信号** — 链上数据每小时刷新 (与 live-monitor 共享缓存文件)

### 待规划

#### 第二交易所集成
- **目标**: 在 `IExchange` 抽象层上接入 OKX / Bybit
- **实现**:
  - 新增 `src/exchange/okx.ts` implements `IExchange`
  - YAML 中 `exchange.name: "okx"` 即可切换
  - 统一 REST + WS 接口映射

#### 回测性能优化
- **目标**: 大规模回测 (1000+ 组合) 提速
- **实现**:
  - Worker Threads 并行回测
  - 内存缓存 kline 数据 (避免重复文件 I/O)
  - 增量式 walk-forward (仅重跑变动窗口)

---

## v1.0 — Production Readiness (planned)

### 策略集市
- 社区驱动的 YAML + 插件包分享/导入
- `openclaw strategy install <name>` CLI 命令

### Backtesting Monte Carlo
- 随机抽样验证策略稳健性 (confidence interval, max drawdown distribution)

### AI 自适应参数
- RL/Bandits 替代 walk-forward 的固定优化周期
- 在线学习: 根据最近 N 笔交易实时微调参数

### 交易所资金流 (付费 API)
- CryptoQuant / Glassnode 集成: 交易所净流入流出, 鲸鱼地址追踪, SOPR 指标

### Multi-timeframe Dashboard
- 切换不同时间周期的信号视图
- 多策略对比面板

---

*This roadmap reflects current priorities and may evolve based on community feedback and usage patterns.*
