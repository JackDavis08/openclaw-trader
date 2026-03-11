/**
 * Backtest Worker Thread Pool
 *
 * Manages a pool of Worker threads for parallel runBacktest() execution.
 * Small-job optimization: if only 1 job, runs directly in the main thread.
 */

import { Worker } from "worker_threads";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { runBacktest, type BacktestOptions, type BacktestResult } from "./runner.js";
import type { Kline, StrategyConfig } from "../types.js";
import type { WorkerJobMessage, WorkerResultMessage } from "./worker-entry.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface BacktestJob {
  klinesBySymbol: Record<string, Kline[]>;
  cfg: StrategyConfig;
  opts?: Omit<BacktestOptions, "strategyOverride"> | undefined;
  trendKlinesBySymbol?: Record<string, Kline[]> | undefined;
}

interface PendingTask {
  job: BacktestJob;
  resolve: (result: BacktestResult) => void;
  reject: (error: Error) => void;
}

interface WorkerState {
  worker: Worker;
  busy: boolean;
}

export class BacktestWorkerPool {
  private workers: WorkerState[] = [];
  private queue: PendingTask[] = [];
  private pendingByWorker = new Map<Worker, PendingTask>();
  private nextId = 0;
  private terminated = false;
  private readonly workerPath: string;

  constructor(size?: number) {
    const cpuCount = (os as { availableParallelism?: () => number }).availableParallelism?.() ?? os.cpus().length;
    const poolSize = size ?? Math.max(1, cpuCount - 1);

    // Worker entry point — use compiled .js file
    this.workerPath = path.resolve(__dirname, "worker-entry.js");

    for (let i = 0; i < poolSize; i++) {
      this.workers.push(this.createWorker());
    }
  }

  private createWorker(): WorkerState {
    const worker = new Worker(this.workerPath);
    const state: WorkerState = { worker, busy: false };

    worker.on("message", (msg: WorkerResultMessage) => {
      state.busy = false;

      const pending = this.pendingByWorker.get(worker);
      if (pending) {
        this.pendingByWorker.delete(worker);
        if (msg.error !== undefined) {
          pending.reject(new Error(msg.error));
        } else if (msg.result) {
          pending.resolve(msg.result);
        }
      }

      // Process next queued task
      this.processQueue();
    });

    worker.on("error", (err: Error) => {
      state.busy = false;
      const pending = this.pendingByWorker.get(worker);
      if (pending) {
        this.pendingByWorker.delete(worker);
        pending.reject(err);
      }
    });

    return state;
  }

  private processQueue(): void {
    if (this.queue.length === 0) return;

    const idle = this.workers.find((w) => !w.busy);
    if (!idle) return;

    const task = this.queue.shift()!;
    this.dispatchToWorker(idle, task);
  }

  private dispatchToWorker(state: WorkerState, task: PendingTask): void {
    state.busy = true;
    this.pendingByWorker.set(state.worker, task);

    const msg: WorkerJobMessage = {
      id: this.nextId++,
      klinesBySymbol: task.job.klinesBySymbol,
      cfg: task.job.cfg,
      opts: task.job.opts ?? {},
      ...(task.job.trendKlinesBySymbol ? { trendKlinesBySymbol: task.job.trendKlinesBySymbol } : {}),
    };

    state.worker.postMessage(msg);
  }

  /**
   * Submit a single backtest job to the pool.
   */
  submit(job: BacktestJob): Promise<BacktestResult> {
    if (this.terminated) {
      return Promise.reject(new Error("Worker pool has been terminated"));
    }

    return new Promise<BacktestResult>((resolve, reject) => {
      const task: PendingTask = { job, resolve, reject };

      const idle = this.workers.find((w) => !w.busy);
      if (idle) {
        this.dispatchToWorker(idle, task);
      } else {
        this.queue.push(task);
      }
    });
  }

  /**
   * Submit multiple jobs and return all results.
   * Small-job optimization: if 0 or 1 jobs, runs directly without workers.
   */
  async submitAll(jobs: BacktestJob[]): Promise<BacktestResult[]> {
    if (jobs.length === 0) return [];

    // Small-job optimization: skip worker overhead for single job
    if (jobs.length === 1) {
      const job = jobs[0]!;
      const result = runBacktest(
        job.klinesBySymbol,
        job.cfg,
        job.opts ?? {},
        job.trendKlinesBySymbol
      );
      return [result];
    }

    return Promise.all(jobs.map((job) => this.submit(job)));
  }

  /**
   * Terminate all workers and clean up.
   */
  async terminate(): Promise<void> {
    this.terminated = true;
    // Reject any queued tasks
    for (const task of this.queue) {
      task.reject(new Error("Worker pool terminated"));
    }
    this.queue = [];
    await Promise.all(this.workers.map((w) => w.worker.terminate()));
    this.workers = [];
    this.pendingByWorker.clear();
  }
}
