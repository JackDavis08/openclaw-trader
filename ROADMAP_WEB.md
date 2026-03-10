# Web Dashboard Roadmap

> Full trading platform UI for openclaw-trader. Next.js 15 + shadcn/ui + TanStack Query.

---

## Phase 1 — Foundation (Scaffold & Core Pages) ✅

- [x] Scaffold `web/` Next.js 15 project (App Router, TypeScript, Tailwind)
- [x] Configure `@shared/*` alias + API proxy rewrites to backend :8080
- [x] Dark trading theme (slate-900 bg, emerald/red/sky accents)
- [x] shadcn/ui primitives (button, card, table, tabs, badge, dialog, etc.)
- [x] Extract shared API types to `src/web/api-types.ts`
- [x] `lib/api-client.ts` — fetch wrapper with base URL + error handling
- [x] TanStack Query hooks for each endpoint
- [x] Root layout: sidebar + topbar shell, QueryClientProvider
- [x] Connection status: polls `/api/health`, green/red badge
- [x] **Dashboard page** — KPI cards, equity chart, position cards, recent trades
- [x] **Positions page** — sortable table (symbol, side, qty, entry, UPnL, SL/TP)
- [x] **Trade History page** — paginated, filterable, CSV export
- [x] Update root `package.json` scripts + `.gitignore`

## Phase 2 — Read-Only Advanced Pages ✅

- [x] **Performance page** — Sharpe, Sortino, Calmar, Max DD, Profit Factor, daily P&L bar chart, per-symbol breakdown
- [x] **Signals page** — signal history table with type badges
- [x] **Health page** — health-snapshot.json visualization, live log viewer
- [x] **Reports page** — weekly report view, signal attribution table
- [x] Backend: extend `buildPerfData()` with risk metrics, add `GET /api/health/snapshot`, `GET /api/reports/weekly`

## Phase 3 — Mutations (Interactive Features) ✅

- [x] Backend: async handler, method routing (POST/PUT), `parseBody()` helper, `matchRoute()`, OPTIONS/CORS
- [x] `GET /api/kill-switch` + `PUT /api/kill-switch` — read & toggle kill switch
- [x] `GET /api/price/:symbol` — single symbol price lookup
- [x] `POST /api/positions/:symbol/close` — invoke paperSell/paperCoverShort at market price
- [x] `PUT /api/positions/:symbol/stop-loss` — adjust SL with validation
- [x] `POST /api/manual-trade` — open trade with kill switch / balance / duplicate checks
- [x] Positions page: "Close" button + "Adjust SL" dialog
- [x] **Manual Trade page** — order form, live price preview, confirmation dialog
- [x] Health page: kill switch card with activate/deactivate toggle

## Phase 4 — Strategy & Config Management ← Next

- [ ] `GET /api/strategies` — list strategy profiles + plugin registry
- [ ] `GET /PUT /api/config/raw/:file` — read/write YAML with validation + backup
- [ ] `PUT /api/scenarios/:id/toggle` — enable/disable paper scenario
- [ ] **Strategies page** — strategy cards, scenario toggles
- [ ] **Configuration page** — tab-based YAML editor, form view, diff preview

## Phase 5 — Backtest UI

- [ ] `POST /api/backtest/run` — invoke runBacktest() synchronously
- [ ] `GET /api/backtest/results` — list saved results
- [ ] **Backtest page** — form (strategy, days, timeframe, symbols), results table, equity chart
- [ ] Strategy comparison: side-by-side two-backtest comparison

## Phase 6 — Polish & Production

- [ ] Signal pipeline visualization (15-stage flow diagram)
- [ ] Execution drift analysis view
- [ ] Monthly P&L calendar heatmap
- [ ] Responsive mobile/tablet design
- [ ] Loading skeletons + error boundaries
- [ ] Optional basic auth (`DASHBOARD_AUTH=user:pass`)
- [ ] Production build docs (Docker, reverse proxy)
- [ ] WebSocket upgrade for real-time updates (optional)

---

## Tech Stack

| Layer | Choice |
|-------|--------|
| Framework | Next.js 15 (App Router), React 19 |
| UI | shadcn/ui + TailwindCSS |
| Charts (Financial) | lightweight-charts v4 |
| Charts (Statistical) | recharts |
| Server State | TanStack Query v5 |
| Icons | lucide-react |
| Backend | Raw http.createServer (existing) |

## Polling Strategy

| Query | Interval |
|-------|----------|
| Dashboard data | 10s |
| Prices | 5s |
| Logs | 5s |
| Health | 30s |
| Performance | 60s |
| Strategies/Config | Manual |
