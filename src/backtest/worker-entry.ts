/**
 * Worker Thread Entry Point
 *
 * Runs inside a Node.js Worker thread. Receives backtest job data
 * via parentPort messages, executes runBacktest(), and posts results back.
 */

import { parentPort } from "worker_threads";
import { runBacktest } from "./runner.js";
import type { Kline, StrategyConfig } from "../types.js";
import type { BacktestOptions, BacktestResult } from "./runner.js";

export interface WorkerJobMessage {
  id: number;
  klinesBySymbol: Record<string, Kline[]>;
  cfg: StrategyConfig;
  opts: Omit<BacktestOptions, "strategyOverride">;
  trendKlinesBySymbol?: Record<string, Kline[]> | undefined;
}

export interface WorkerResultMessage {
  id: number;
  result?: BacktestResult;
  error?: string;
}

if (parentPort) {
  parentPort.on("message", (msg: WorkerJobMessage) => {
    try {
      const result = runBacktest(
        msg.klinesBySymbol,
        msg.cfg,
        msg.opts,
        msg.trendKlinesBySymbol
      );
      parentPort!.postMessage({ id: msg.id, result } satisfies WorkerResultMessage);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      parentPort!.postMessage({ id: msg.id, error: errorMsg } satisfies WorkerResultMessage);
    }
  });
}
