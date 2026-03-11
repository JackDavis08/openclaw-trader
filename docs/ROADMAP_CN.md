# 路线图

> openclaw-trader 开发路线图。各阶段内按优先级排列。

---

## v0.2 — 执行可靠性 ✅

- [x] **统一 MTF 过滤** — `monitor.ts` 在信号检测后使用 `checkMtfFilter()`（与 `live-monitor.ts` 保持一致）
- [x] **激活 Protection Manager** — `recentTrades` 已传入 `processSignal()`，cooldown / stoploss_guard / max_drawdown 全部生效
- [x] **空头分批止盈** — `tpStages` 已为多头和空头持仓初始化（A-007 修复）
- [x] **Spot 市场做空信号拦截** — 在 signal-engine 层面拦截 spot 市场的 short 信号（在通知之前）
- [x] **Regime 置信度配置** — 暴露为 YAML 中的 `regime_confidence_threshold`（默认值：60）

## v0.3 — 可观测性与仪表盘 ✅

- [x] **Web 仪表盘认证** — 通过 `DASHBOARD_AUTH=user:pass` 环境变量进行基本认证
- [x] **Telegram 独立运行** — 长轮询模式，通过 `npm run telegram-poll` 启动（需配置 TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID）
- [x] **过滤信号日志** — 被拒信号持久化到 `logs/filtered-signals.jsonl`，包含过滤器名称和原因
- [x] **实时权益追踪** — `recordEquitySnapshot()` 在两条监控管线中调用（限频 1 次/小时）

## v0.4 — 策略与智能 ✅

- [x] **Kelly 仓位启用** — 启用 `position_sizing: "kelly"`，`kelly_min_samples: 30`（不足 30 笔交易时自动回退到固定仓位）
- [x] **Walk-forward 定时调度** — `npm run auto-wf:schedule`，带 `--interval` 日级防护，可安全用于 cron 调度
- [x] **LLM 情绪增强** — 已实现：`llm-sentiment.ts`（OpenClaw 网关）、`sentiment-cache.ts`（6h TTL）、`sentiment-gate.ts`（LLM → 关键词 → FGI 级联）
- [x] **期权数据集成** — 已实现：`options-data.ts`（Deribit IV + PCR）、仓位乘数（极端→0.5×、偏高→0.7×）
- [x] **链上指标** — 已实现：`onchain-data.ts`（DeFiLlama 稳定币流量、Blockchair BTC 网络）、`order-flow.ts`（CVD 逐笔 WebSocket）

## v0.5 — 容器化与部署 ✅

- [x] **Docker 部署** — `Dockerfile`（Node.js 22 alpine 多阶段构建）+ `docker-compose.yml`（bot / dashboard / telegram）
- [x] **云原生调度器** — `src/scheduler.ts` 内建 setInterval 调度，替代系统 crontab
- [x] **Supervisor 模式** — 单进程管理所有子任务，进程崩溃自动重启

## v0.6 — 多交易所与扩展 ✅

- [x] **交易所抽象层** — `IExchange` 接口 + `BinanceExchange` 实现 + DI 注入到 `LiveExecutor`
- [x] **多账户支持** — `live.yaml` accounts 数组，composite scenarioId，Dashboard 按账户分组

## v0.7 — 高级智能 ✅

- [x] **期权深度分析** — Max Pain、IV Skew (25d)、IV 期限结构（contango/backwardation），已集成至 `derivatives-data.ts`
- [x] **多空比信号集成** — `long-short-signal.ts` 缓存层 + 4 个信号条件（`ls_ratio_extreme_long/short`、`ls_ratio_long_biased/short_biased`）+ monitor 注入
- [x] **链上稳定币流量** — DeFiLlama 稳定币流量 + `stablecoin_accumulation/distribution` 信号条件

## v0.8 — 策略增强 ✅

- [x] **Grid 策略插件** — `src/strategies/grid.ts`，算术/几何网格，auto-range 自动范围检测，通过 `populateSignal`/`adjustPosition`/`shouldExit` 钩子实现网格交易
- [x] **Portfolio 再平衡** — `src/strategy/rebalance.ts`，目标权重偏离检测 + 校正订单生成，集成至 `monitor.ts` 和 `live-monitor.ts`
- [x] **stateStore 注入修复** — `signal-engine.ts` 为所有非 default 策略插件注入 `stateStore`，修复 `rsi-reversal` 等插件的状态持久化

---

## v0.9 — WebSocket Monitor 功能对齐 ✅

- [x] **ws-monitor 全功能对齐** — `ws-monitor.ts` 从 `detectSignal()` 升级为完整 `processSignal()` 管线，与 `monitor.ts`/`live-monitor.ts` 完全对齐
- [x] **信号引擎集成** — regime awareness、R:R filter、correlation filter、protection manager 全部接入
- [x] **入场过滤链** — emergency halt → event calendar → MTF trend filter → sentiment gate（LLM 缓存）→ Kelly sizing → portfolio correlation heat
- [x] **退出增强** — DCA tranches、signal history close、portfolio exposure + equity snapshot、portfolio rebalancing
- [x] **BTC 崩盘检测** — 直接使用 WS 实时价格，零额外 REST 请求
- [x] **Kill Switch** — CvdManager 接入，全局熔断保护
- [x] **动态 pairlist** — `loadPairlistSymbols()` 支持，保留持仓 symbol
- [x] **总亏损保护** — 超限暂停入场，退出仍正常执行
- [x] **Stablecoin 信号** — 链上数据每小时刷新（与 live-monitor 共享缓存文件）

## v0.10 — 回测性能优化 ✅

- [x] **并行 API 拉取** — `fetchAllSymbols()` 带异步信号量（并发=3），不同 symbol 并行拉取同时遵守 Binance 频率限制
- [x] **Worker 线程池** — `BacktestWorkerPool` 用于跨策略/参数组合并行执行 `runBacktest()`，小任务优化（1 个任务→直接调用）
- [x] **内存 K 线缓存** — `KlineCache` 包装 `fetchHistoricalKlines`，使用 `Map` 缓存，`getAll()` 对冷缓存缺失使用并行拉取
- [x] **消费脚本升级** — `backtest.ts`（runOne/runCompare/runSlippageSweep）、`analyze-strategy.ts`、`regime-backtest.ts` 均使用并行拉取
- [x] **Walk-forward/sensitivity 异步化** — `walkForwardSingle()` 和 `runSensitivity()` 现为异步，支持可选 worker pool 参数
- [x] **Auto-wf 并行化** — 优化循环前预拉取所有 symbol，通过 `Promise.all()` 实现跨 symbol 并行

## v1.0 — 生产就绪（计划中）

- [ ] **策略集市** — 社区驱动的 YAML + 插件包分享/导入，`openclaw strategy install <name>` CLI 命令
- [ ] **第二交易所集成** — 在 `IExchange` 抽象层上接入 OKX / Bybit，YAML `exchange.name: "okx"` 切换，统一 REST + WS 接口映射
- [ ] **AI 自适应参数** — RL/Bandits 替代 walk-forward 固定优化周期，在线学习根据最近 N 笔交易实时微调参数
- [ ] **交易所资金流（付费 API）** — CryptoQuant / Glassnode 集成：交易所净流入流出、鲸鱼地址追踪、SOPR 指标
- [ ] **Multi-timeframe 仪表盘** — 切换不同时间周期的信号视图，多策略对比面板

---

*本路线图反映当前优先事项，可能根据社区反馈和使用情况进行调整。*
