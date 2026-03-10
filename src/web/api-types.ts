/**
 * Shared API types for the web dashboard.
 * Re-exports types from dashboard-server.ts and adds new types for future phases.
 */

export type {
  AccountSummary,
  PositionWithPnl,
  TradeRecord,
  EquityPoint,
  SignalRecord,
  DashboardData,
  SymbolPerf,
  DayPerf,
  PerfData,
} from "./dashboard-server.js";

// ─────────────────────────────────────────────────────
// Health
// ─────────────────────────────────────────────────────

export interface HealthStatus {
  status: "ok" | "degraded" | "down";
  timestamp: number;
  uptime: number;
  memory: { rss: number; heapUsed: number; heapTotal: number };
  version: string;
}

export interface KillSwitchStatus {
  active: boolean;
  reason: string;
  triggeredAt: number;
  autoResumeAt?: number;
}

// ─────────────────────────────────────────────────────
// Mutations (Phase 3+)
// ─────────────────────────────────────────────────────

export interface ManualTradeRequest {
  symbol: string;
  side: "buy" | "short";
  amountUsdt: number;
  scenarioId: string;
  stopLossPercent?: number;
  takeProfitPercent?: number;
}

export interface ConfigUpdateRequest {
  file: string;
  content: string;
}

// ─────────────────────────────────────────────────────
// Backtest (Phase 5)
// ─────────────────────────────────────────────────────

export interface BacktestRequest {
  strategy: string;
  days: number;
  timeframe: string;
  symbols: string[];
  initialUsdt: number;
  spreadBps?: number;
}

export interface BacktestResponse {
  id: string;
  strategy: string;
  startDate: string;
  endDate: string;
  totalReturn: number;
  totalReturnPercent: number;
  sharpeRatio: number;
  maxDrawdown: number;
  winRate: number;
  totalTrades: number;
  equityCurve: { timestamp: number; equity: number }[];
  trades: {
    symbol: string;
    side: string;
    entryPrice: number;
    exitPrice: number;
    pnl: number;
    pnlPercent: number;
    entryTime: number;
    exitTime: number;
  }[];
}

// ─────────────────────────────────────────────────────
// Strategies (Phase 4)
// ─────────────────────────────────────────────────────

export interface StrategyListItem {
  id: string;
  name: string;
  description: string;
  plugin: string;
  scenarios: { id: string; name: string; enabled: boolean }[];
}

// ─────────────────────────────────────────────────────
// Prices
// ─────────────────────────────────────────────────────

export type PriceMap = Record<string, number>;

// ─────────────────────────────────────────────────────
// Scenarios
// ─────────────────────────────────────────────────────

export interface ScenarioInfo {
  id: string;
  name: string;
  strategy: string;
  enabled: boolean;
  initial_usdt: number;
}

// ─────────────────────────────────────────────────────
// Logs
// ─────────────────────────────────────────────────────

export interface LogResponse {
  lines: string[];
  file: string;
  tail: number;
}

// ─────────────────────────────────────────────────────
// Risk Metrics (Phase 2 — extended PerfData)
// ─────────────────────────────────────────────────────

export interface RiskMetrics {
  sharpeRatio: number;
  sortinoRatio: number;
  maxDrawdownPct: number;
  calmarRatio: number;
  profitFactor: number;
  winRate: number;
  avgWinPercent: number;
  avgLossPercent: number;
  winLossRatio: number;
  expectancy: number;
  totalReturn: number;
  totalReturnPercent: number;
  totalTrades: number;
  avgHoldingHours: number;
  bestTradePct: number;
  worstTradePct: number;
}

// ─────────────────────────────────────────────────────
// Health Snapshot (Phase 2)
// ─────────────────────────────────────────────────────

export interface HealthSnapshotTask {
  name: string;
  status: "ok" | "warn" | "error" | "never";
  minutesSince: number;
  message: string;
  enabled: boolean;
}

export interface HealthSnapshot {
  checkedAt: string;
  results: HealthSnapshotTask[];
}

// ─────────────────────────────────────────────────────
// Weekly Report (Phase 2)
// ─────────────────────────────────────────────────────

export interface WeeklyReportScenario {
  scenarioId: string;
  scenarioName: string;
  strategyName: string;
  market: string;
  leverage: string;
  account: {
    initialUsdt: number;
    currentUsdt: number;
    totalPnl: number;
    totalPnlPercent: number;
  };
  stats: {
    totalTrades: number;
    buys: number;
    sells: number;
    wins: number;
    losses: number;
    winRate: number;
    totalPnl: number;
    avgPnl: number;
    maxProfit: number;
    maxLoss: number;
    avgHoldingHours: number;
    bestSymbol: string;
    worstSymbol: string;
    symbolStats: Record<string, { trades: number; pnl: number }>;
  };
  metrics: {
    sharpeRatio: number;
    sortinoRatio: number;
    maxDrawdownPct: number;
    profitFactor: number;
    winLossRatio: number;
    expectancy: number;
  } | null;
}
