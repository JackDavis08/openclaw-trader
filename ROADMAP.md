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

## v0.4 — Strategy & Intelligence

- [ ] **Kelly position sizing activation** — Switch from fixed sizing to half-Kelly after accumulating 30+ closed trades
- [ ] **Walk-forward scheduling** — Run `auto-wf.ts` on a regular cron schedule to keep parameters fresh
- [ ] **LLM sentiment enrichment** — Improve OpenClaw Gateway integration for deeper market narrative analysis
- [ ] **Options flow integration** — Incorporate put/call ratio and open interest changes into signal weighting
- [ ] **On-chain metrics** — Whale wallet tracking, exchange inflow/outflow signals

## v0.5 — Multi-Exchange & Scaling

- [ ] **Exchange abstraction layer** — Decouple from Binance-specific APIs to support OKX, Bybit, etc.
- [ ] **Multi-account support** — Run separate strategy instances across multiple exchange accounts
- [ ] **Docker deployment** — Official `Dockerfile` + `docker-compose.yml` for one-command deployment
- [ ] **Cloud-native cron** — Replace system crontab with internal scheduler for containerized environments

## Future Ideas

- WebSocket-only mode (replace REST polling for sub-second latency)
- Grid / DCA strategy plugins
- Portfolio rebalancing strategy
- Strategy marketplace (share/import YAML + plugin bundles)

---

*This roadmap reflects current priorities and may evolve based on community feedback and usage patterns.*
