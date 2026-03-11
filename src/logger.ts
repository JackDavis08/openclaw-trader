/**
 * Centralized logging module
 *
 * Replaces repetitive inline log() functions in each file with unified format, level, and file output.
 *
 * @example
 * // With file output
 * const log = createLogger("monitor", "logs/monitor.log");
 * log.info("Scan started");
 * log.warn("Funding rate fetch failed");
 * log.error("Fatal error");
 * log.debug("Detailed debug info"); // Only output when LOG_LEVEL=debug
 *
 * // Console only (no file output)
 * const log = createLogger("live-monitor");
 * log.info("Started");
 */

import fs from "fs";

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface Logger {
  debug(msg: string): void;
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
}

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function getMinLevel(): number {
  const env = (process.env["LOG_LEVEL"] ?? "info").toLowerCase();
  return LEVEL_PRIORITY[env as LogLevel] ?? LEVEL_PRIORITY.info;
}

// ── Buffered WriteStream pool ──────────────────────────────
const _streams = new Map<string, fs.WriteStream>();

function getStream(filePath: string): fs.WriteStream {
  let stream = _streams.get(filePath);
  if (stream && !stream.destroyed) return stream;
  stream = fs.createWriteStream(filePath, { flags: "a" });
  _streams.set(filePath, stream);
  return stream;
}

/** Flush all open log streams (call during shutdown) */
export function flushAllLogs(): Promise<void> {
  const promises: Promise<void>[] = [];
  for (const [, stream] of _streams) {
    if (!stream.destroyed) {
      promises.push(new Promise<void>((resolve) => {
        stream.end(resolve);
      }));
    }
  }
  _streams.clear();
  return Promise.all(promises).then(() => {});
}

export function createLogger(module: string, logFilePath?: string): Logger {
  const minLevel = getMinLevel();

  function write(level: LogLevel, msg: string): void {
    if (LEVEL_PRIORITY[level] < minLevel) return;

    const line = `[${new Date().toISOString()}] [${level.toUpperCase()}] [${module}] ${msg}`;

    if (level === "error") {
      console.error(line);
    } else if (level === "warn") {
      console.warn(line);
    } else {
      console.log(line);
    }

    if (logFilePath) {
      getStream(logFilePath).write(line + "\n");
    }
  }

  return {
    debug: (msg: string) => { write("debug", msg); },
    info: (msg: string) => { write("info", msg); },
    warn: (msg: string) => { write("warn", msg); },
    error: (msg: string) => { write("error", msg); },
  };
}
