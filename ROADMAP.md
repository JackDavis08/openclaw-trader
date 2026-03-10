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

---

## v0.5 — Containerization & Deployment

### Docker 部署 (`Dockerfile` + `docker-compose.yml`)
- **目标**: 一条命令启动完整交易系统 (`docker compose up -d`)
- **Dockerfile**: 基于 Node.js 22 alpine, 多阶段构建 (build → runtime), 包含 tsx runtime
- **docker-compose.yml**: 三个服务:
  - `bot` — 主监控进程 (`npm run monitor`), 挂载 `config/`, `logs/`, `.secrets/`
  - `dashboard` — Web dashboard (`npm run dashboard` + `npm run web:start`), 暴露端口 3000
  - `telegram` — Telegram bot (`npm run telegram-poll`), 可选服务
- **Volume 映射**: `./config:/app/config`, `./logs:/app/logs`, `./.secrets:/app/.secrets`
- **环境变量**: 通过 `.env` 文件注入 (`OPENCLAW_GATEWAY_TOKEN`, `TELEGRAM_BOT_TOKEN`, `DASHBOARD_AUTH` 等)
- **健康检查**: `curl http://localhost:8080/api/health` 作为 Docker healthcheck
- **.dockerignore**: 排除 `node_modules/`, `.git/`, `logs/`, `.secrets/`

### 云原生 Cron 调度器
- **问题**: Docker 容器内无系统 crontab, 现有 `monitor.ts` 依赖外部 cron 触发
- **方案**: 新增 `src/scheduler.ts` 内建调度器
  - 使用 Node.js `setInterval` 或 `node-cron` 实现定时任务
  - 可配置调度项: monitor scan (1min), walk-forward (7d), weekly report, equity snapshot
  - 调度配置从 `config/schedule.yaml` 读取
  - 替代系统 crontab, 容器内一个进程管理所有定时任务
- **Supervisor 模式**: 单进程启动所有子任务 (monitor + dashboard + telegram), 进程崩溃自动重启

---

## v0.6 — Multi-Exchange & Scaling

### 交易所抽象层 (`IExchange` 接口)
- **现状**: 代码与 Binance API 紧耦合 (`binance.ts`, `binance-client.ts`, `executor.ts`)
- **目标**: 定义统一交易所接口, 支持 OKX, Bybit, Bitget 等
- **实现细节**:
  - 新建 `src/exchange/interface.ts`, 定义 `IExchange` 接口:
    ```
    getPrice(symbol) → number
    getKlines(symbol, interval, limit) → Kline[]
    getBalance(asset) → number
    marketBuy(symbol, quoteQty) → OrderResult
    marketSell(symbol, quantity) → OrderResult
    getOpenOrders() → Order[]
    cancelOrder(symbol, orderId) → void
    getFuturesPositions() → Position[]
    ```
  - 将 `BinanceClient` 重构为 `BinanceExchange implements IExchange`
  - `LiveExecutor` 改为接收 `IExchange` 实例 (依赖注入), 不再直接创建 BinanceClient
  - `ExchangeConfig` 扩展: 新增 `provider: "binance" | "okx" | "bybit"` 字段
  - 工厂函数 `createExchange(config)` 根据 provider 创建对应实例
- **第一步**: 先抽象接口 + 重构 Binance 实现, 不立即添加新交易所
- **涉及文件**: `exchange/binance-client.ts` → `exchange/binance.exchange.ts`, 新建 `exchange/interface.ts`, 修改 `live/executor.ts`

### 多账户支持
- **场景**: 同一策略在多个交易所账户上运行, 或不同策略绑定不同账户
- **实现**:
  - `config/live.yaml` 扩展为支持多账户:
    ```yaml
    accounts:
      - id: binance-main
        provider: binance
        credentials_path: .secrets/binance-main.json
        scenarios: [futures-btc, futures-eth]
      - id: okx-alt
        provider: okx
        credentials_path: .secrets/okx.json
        scenarios: [spot-altcoins]
    ```
  - 每个账户独立的 `LiveExecutor` 实例
  - 账户级别的风控隔离 (各自的 balance, positions, daily loss)
  - Dashboard 按账户分组展示

---

## v0.7 — Advanced Intelligence (可选)

### 高级数据源增强
- **交易所资金流**: CryptoQuant / Glassnode API 集成 (需付费 API key)
  - 交易所 BTC/ETH 净流入流出 (大量流入 = 潜在卖压)
  - 鲸鱼地址追踪 (大额转账到交易所 = 预警信号)
  - SOPR (Spent Output Profit Ratio) 链上获利指标
- **期权深度分析**: 扩展现有 Deribit 集成
  - Max Pain 计算 (期权到期日价格吸引点)
  - OI Skew 分析 (看涨/看跌持仓倾斜度)
  - 隐含波动率期限结构 (contango vs backwardation)
- **多空比**: Binance Futures API `topLongShortAccountRatio`
  - 大户多空比 + 散户多空比
  - 极端值 (>2.0 或 <0.5) 作为逆向信号

### 策略增强
- **Grid / DCA 策略插件** — 利用现有 `Strategy` 接口实现网格交易策略
- **Portfolio 再平衡** — 按目标权重定期调整持仓比例
- **策略集市** — 分享/导入 YAML + 插件包 (社区驱动)

---

## Future Ideas

- WebSocket-only mode (replace REST polling for sub-second latency)
- Multi-timeframe dashboard (切换不同时间周期的信号视图)
- Backtesting Monte Carlo simulation (随机抽样验证策略稳健性)
- AI 自适应参数 (用 RL/Bandits 替代 walk-forward 的固定优化周期)

---

*This roadmap reflects current priorities and may evolve based on community feedback and usage patterns.*
