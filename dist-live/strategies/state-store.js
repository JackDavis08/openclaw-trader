/**
 * Strategy Plugin State Store (P7.4)
 *
 * Provides cross-kline state persistence interface for each Strategy plugin.
 * File path: logs/strategy-state/{strategyId}/{symbol}.json
 */
import * as fs from "fs";
import * as path from "path";
// ─────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────
/**
 * Load existing state (internal use)
 * Returns empty object if file doesn't exist or content is corrupted (no throw)
 */
function loadState(filePath) {
    try {
        const raw = fs.readFileSync(filePath, "utf8");
        const parsed = JSON.parse(raw);
        if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
            return parsed;
        }
        return {};
    }
    catch {
        // File not found (ENOENT) or corrupted JSON -> fall back to empty state
        return {};
    }
}
/**
 * Save state (internal use, synchronous file write)
 * Auto-creates directory if it doesn't exist
 */
function saveState(filePath, state) {
    const dir = path.dirname(filePath);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(state, null, 2), "utf8");
}
// ─────────────────────────────────────────────────────
// Factory
// ─────────────────────────────────────────────────────
/**
 * Create a state store instance bound to a specific strategy + symbol
 * File path: {logsDir}/strategy-state/{strategyId}/{symbol}.json
 *
 * @param strategyId  Strategy ID (e.g. "rsi-reversal")
 * @param symbol      Trading pair (e.g. "BTCUSDT")
 * @param logsDir     Logs directory (default "logs", injectable for testing)
 */
export function createStateStore(strategyId, symbol, logsDir = "logs") {
    const filePath = path.join(logsDir, "strategy-state", strategyId, `${symbol}.json`);
    // In-memory cache, lazy-loaded
    let cache = null;
    function ensureLoaded() {
        cache ??= loadState(filePath);
        return cache;
    }
    return {
        get(key, defaultValue) {
            const state = ensureLoaded();
            if (Object.prototype.hasOwnProperty.call(state, key)) {
                return state[key];
            }
            return defaultValue;
        },
        set(key, value) {
            const state = ensureLoaded();
            state[key] = value;
            saveState(filePath, state);
        },
        delete(key) {
            const state = ensureLoaded();
            // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
            delete state[key];
            saveState(filePath, state);
        },
        snapshot() {
            const state = ensureLoaded();
            return { ...state };
        },
    };
}
