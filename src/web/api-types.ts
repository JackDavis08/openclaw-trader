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
