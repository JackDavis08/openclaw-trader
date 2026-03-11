/**
 * v0.5 — Cloud-Native Scheduler
 *
 * Replaces system crontab + manual daemon management with a single Node process.
 * Designed for Docker containers which lack system cron.
 *
 * Usage:
 *   npm run scheduler                          # cron tasks + dashboard
 *   npm run scheduler -- --live --web          # + live-monitor + web frontend
 *   npm run scheduler -- --telegram            # + telegram bot
 *   npm run scheduler -- --no-dashboard        # cron tasks only
 */

import fs from "fs";
import path from "path";
import { spawn, type ChildProcess } from "child_process";
import { parse } from "yaml";
import { fileURLToPath } from "url";
import type { StrategyConfig } from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const CONFIG_PATH = path.resolve(PROJECT_ROOT, "config/strategy.yaml");
const TSX_BIN = path.resolve(PROJECT_ROOT, "node_modules/.bin/tsx");
const LOGS_DIR = path.resolve(PROJECT_ROOT, "logs");

// ─── Cron Parser (zero-dep) ───────────────────────────────────────

function matchesField(field: string, value: number, max: number): boolean {
  for (const part of field.split(",")) {
    const stepMatch = /^\*\/(\d+)$/.exec(part);
    if (stepMatch?.[1]) {
      if (value % parseInt(stepMatch[1], 10) === 0) return true;
      continue;
    }
    const rangeMatch = /^(\d+)-(\d+)$/.exec(part);
    if (rangeMatch?.[1] && rangeMatch[2]) {
      const lo = parseInt(rangeMatch[1], 10);
      const hi = parseInt(rangeMatch[2], 10);
      if (value >= lo && value <= hi) return true;
      continue;
    }
    if (part === "*") return true;
    const n = parseInt(part, 10);
    if (!isNaN(n) && n >= 0 && n <= max && n === value) return true;
  }
  return false;
}

export function matchesCron(expr: string, date: Date): boolean {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return false;
  const minute = parts[0]!;
  const hour = parts[1]!;
  const dom = parts[2]!;
  const month = parts[3]!;
  const dow = parts[4]!;
  return (
    matchesField(minute, date.getMinutes(), 59) &&
    matchesField(hour, date.getHours(), 23) &&
    matchesField(dom, date.getDate(), 31) &&
    matchesField(month, date.getMonth() + 1, 12) &&
    matchesField(dow, date.getDay(), 7) // 0=Sun, 7=Sun
  );
}

// ─── Task Runner ──────────────────────────────────────────────────

const TASK_SCRIPTS: Record<string, string> = {
  price_monitor: "src/monitor.ts",
  news_collector: "src/news/monitor.ts",
  weekly_report: "src/report/weekly.ts",
  health_check: "src/health/checker.ts",
  watchdog: "src/health/watchdog.ts",
  log_rotate: "src/health/log-rotate.ts",
  news_emergency: "src/news/emergency-monitor.ts",
  pairlist_refresh: "src/scripts/refresh-pairlist.ts",
};

interface TaskState {
  running: boolean;
  lastStarted: number;
  child: ChildProcess | null;
}

const taskStates = new Map<string, TaskState>();

function ensureLogsDir(): void {
  if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR, { recursive: true });
}

function runTask(
  taskName: string,
  scriptPath: string,
  timeoutMs: number,
): void {
  let state = taskStates.get(taskName);
  if (!state) {
    state = { running: false, lastStarted: 0, child: null };
    taskStates.set(taskName, state);
  }
  if (state.running) return; // skip overlapping

  const absScript = path.resolve(PROJECT_ROOT, scriptPath);
  const logFile = path.join(LOGS_DIR, `${taskName}.log`);
  const logStream = fs.createWriteStream(logFile, { flags: "a" });

  const ts = new Date().toISOString();
  logStream.write(`\n--- ${ts} [scheduler] starting ${taskName} ---\n`);

  const child = spawn(process.execPath, [TSX_BIN, absScript], {
    cwd: PROJECT_ROOT,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"] as const,
  });

  state.running = true;
  state.lastStarted = Date.now();
  state.child = child;

  child.stdout.pipe(logStream, { end: false });
  child.stderr.pipe(logStream, { end: false });

  const timer = setTimeout(() => {
    logStream.write(`\n--- [scheduler] ${taskName} timed out after ${timeoutMs / 60000}m, killing ---\n`);
    child.kill("SIGTERM");
    setTimeout(() => {
      if (!child.killed) child.kill("SIGKILL");
    }, 5000);
  }, timeoutMs);

  child.on("close", (code: number | null) => {
    clearTimeout(timer);
    state.running = false;
    state.child = null;
    logStream.write(`--- [scheduler] ${taskName} exited code=${code} ---\n`);
    logStream.end();
  });
}

function tick(): void {
  const now = new Date();
  const cfg = parse(
    fs.readFileSync(CONFIG_PATH, "utf-8"),
  ) as StrategyConfig;
  const schedule = cfg.schedule ?? {};

  for (const [taskName, taskCfg] of Object.entries(schedule)) {
    if (!taskCfg.enabled) continue;
    if (!matchesCron(taskCfg.cron, now)) continue;

    const scriptFile =
      taskCfg.script ?? TASK_SCRIPTS[taskName];
    if (!scriptFile) {
      console.warn(`[scheduler] unknown task: ${taskName}, no script mapping`);
      continue;
    }

    const timeoutMs = taskCfg.timeout_minutes * 60_000;
    runTask(taskName, scriptFile, timeoutMs);
  }
}

// ─── Daemon Manager ───────────────────────────────────────────────

interface DaemonDef {
  name: string;
  command: string[];
  cwd?: string;
}

interface DaemonState {
  process: ChildProcess | null;
  restarts: number;
  backoffMs: number;
  stopping: boolean;
}

const BACKOFF_CAP_MS = 30_000;
const daemons = new Map<string, DaemonState>();

function startDaemon(def: DaemonDef): void {
  let state = daemons.get(def.name);
  if (!state) {
    state = { process: null, restarts: 0, backoffMs: 1000, stopping: false };
    daemons.set(def.name, state);
  }
  if (state.stopping) return;

  const logFile = path.join(LOGS_DIR, `${def.name}.log`);
  const logStream = fs.createWriteStream(logFile, { flags: "a" });
  const ts = new Date().toISOString();
  logStream.write(`\n--- ${ts} [scheduler] starting daemon ${def.name} ---\n`);

  const cmd = def.command[0]!;
  const args = def.command.slice(1);
  const child = spawn(cmd, args, {
    cwd: def.cwd ?? PROJECT_ROOT,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"] as const,
  });

  state.process = child;
  child.stdout.pipe(logStream, { end: false });
  child.stderr.pipe(logStream, { end: false });

  child.on("close", (code: number | null) => {
    state.process = null;
    logStream.write(`--- [scheduler] daemon ${def.name} exited code=${code} ---\n`);
    logStream.end();

    if (state.stopping) return;

    // Auto-restart with backoff
    state.restarts++;
    console.log(
      `[scheduler] daemon ${def.name} crashed (code=${code}), restarting in ${state.backoffMs}ms (attempt #${state.restarts})`,
    );
    setTimeout(() => { startDaemon(def); }, state.backoffMs);
    state.backoffMs = Math.min(state.backoffMs * 2, BACKOFF_CAP_MS);
  });

  console.log(`[scheduler] daemon ${def.name} started (pid=${child.pid})`);
}

function stopAllDaemons(): void {
  for (const [name, state] of daemons) {
    state.stopping = true;
    if (state.process) {
      console.log(`[scheduler] stopping daemon ${name} (pid=${state.process.pid})`);
      state.process.kill("SIGTERM");
    }
  }
}

function killAllTasks(): void {
  for (const [name, state] of taskStates) {
    if (state.child) {
      console.log(`[scheduler] killing task ${name} (pid=${state.child.pid})`);
      state.child.kill("SIGTERM");
    }
  }
}

// ─── CLI & Main ───────────────────────────────────────────────────

function parseArgs(): {
  dashboard: boolean;
  web: boolean;
  live: boolean;
  telegram: boolean;
} {
  const args = process.argv.slice(2);
  return {
    dashboard: !args.includes("--no-dashboard"),
    web: args.includes("--web"),
    live: args.includes("--live"),
    telegram: args.includes("--telegram"),
  };
}

function main(): void {
  const flags = parseArgs();

  console.log(`\n🚀 OpenClaw Trader — Scheduler v0.5`);
  console.log(`────────────────────────────────────`);
  console.log(`  Cron tasks:  enabled`);
  console.log(`  Dashboard:   ${flags.dashboard ? "on" : "off"}`);
  console.log(`  Web UI:      ${flags.web ? "on" : "off"}`);
  console.log(`  Live monitor:${flags.live ? " on" : " off"}`);
  console.log(`  Telegram:    ${flags.telegram ? "on" : "off"}`);
  console.log();

  ensureLogsDir();

  // Start daemons
  const daemonDefs: DaemonDef[] = [];

  if (flags.dashboard) {
    daemonDefs.push({
      name: "dashboard",
      command: [process.execPath, TSX_BIN, "src/scripts/dashboard.ts"],
    });
  }

  if (flags.web) {
    daemonDefs.push({
      name: "web",
      command: [process.execPath, path.resolve(PROJECT_ROOT, "web/node_modules/.bin/next"), "start"],
      cwd: path.resolve(PROJECT_ROOT, "web"),
    });
  }

  if (flags.live) {
    daemonDefs.push({
      name: "live-monitor",
      command: [process.execPath, TSX_BIN, "src/scripts/live-monitor.ts"],
    });
  }

  if (flags.telegram) {
    daemonDefs.push({
      name: "telegram-bot",
      command: [process.execPath, TSX_BIN, "src/scripts/telegram-bot.ts", "--poll"],
    });
  }

  for (const def of daemonDefs) {
    startDaemon(def);
  }

  // Initial tick + start interval
  tick();
  const interval = setInterval(tick, 60_000);

  console.log(`[scheduler] cron loop started (60s interval)`);

  // Graceful shutdown
  const shutdown = (signal: string) => {
    console.log(`\n[scheduler] received ${signal}, shutting down...`);
    clearInterval(interval);
    stopAllDaemons();
    killAllTasks();

    // Give children time to exit
    setTimeout(() => {
      console.log("[scheduler] exit");
      process.exit(0);
    }, 3000);
  };

  process.on("SIGTERM", () => { shutdown("SIGTERM"); });
  process.on("SIGINT", () => { shutdown("SIGINT"); });
}

main();
