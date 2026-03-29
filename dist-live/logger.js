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
const LEVEL_PRIORITY = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
};
function getMinLevel() {
    const env = (process.env["LOG_LEVEL"] ?? "info").toLowerCase();
    // env may not be a valid LogLevel at runtime; fallback to info
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    return LEVEL_PRIORITY[env] ?? LEVEL_PRIORITY.info;
}
// ── Buffered WriteStream pool ──────────────────────────────
const _streams = new Map();
function getStream(filePath) {
    let stream = _streams.get(filePath);
    if (stream && !stream.destroyed)
        return stream;
    stream = fs.createWriteStream(filePath, { flags: "a" });
    _streams.set(filePath, stream);
    return stream;
}
/** Flush all open log streams (call during shutdown) */
export function flushAllLogs() {
    const promises = [];
    for (const [, stream] of _streams) {
        if (!stream.destroyed) {
            promises.push(new Promise((resolve) => {
                stream.end(resolve);
            }));
        }
    }
    _streams.clear();
    return Promise.all(promises).then(() => { });
}
export function createLogger(module, logFilePath) {
    const minLevel = getMinLevel();
    function write(level, msg) {
        if (LEVEL_PRIORITY[level] < minLevel)
            return;
        const line = `[${new Date().toISOString()}] [${level.toUpperCase()}] [${module}] ${msg}`;
        if (level === "error") {
            console.error(line);
        }
        else if (level === "warn") {
            console.warn(line);
        }
        else {
            console.log(line);
        }
        if (logFilePath) {
            getStream(logFilePath).write(line + "\n");
        }
    }
    return {
        debug: (msg) => { write("debug", msg); },
        info: (msg) => { write("info", msg); },
        warn: (msg) => { write("warn", msg); },
        error: (msg) => { write("error", msg); },
    };
}
