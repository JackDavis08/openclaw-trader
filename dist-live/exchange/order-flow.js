/**
 * Order Flow — Real CVD (Cumulative Volume Delta)
 *
 * Tracks buy/sell taker volume delta for each symbol in real-time via Binance aggTrade WebSocket stream.
 *
 * ## How it works
 * Each aggTrade has an `m` (maker) field:
 *   - m = true: seller is maker, buyer is taker -> buyer-initiated -> +volume
 *   - m = false: buyer is maker, seller is taker -> seller-initiated -> -volume
 *
 * CVD = sum( m=false(buyer-initiated) ? +volume : -volume ), positive = net buy pressure, negative = net sell pressure
 *
 * ## Usage
 * - Real CVD rising but price sideways -> buy pressure accumulating, possible upward breakout
 * - Price rising but CVD falling -> fake breakout (passive fills lifting price, no active buying)
 *
 * ## Persistence
 * CVD state is written to logs/cvd-state.json for monitor.ts cron to read.
 *
 * ## Upgrade Notes
 * Currently monitor.ts defaults to K-line approximated CVD from calculateIndicators().
 * If ws-monitor.ts is running and writing cvd-state.json, readCvdCache() provides
 * more accurate tick-level CVD that can override indicators.cvd in monitor.ts.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createLogger } from "../logger.js";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CVD_CACHE_PATH = path.resolve(__dirname, "../../logs/cvd-state.json");
const log = createLogger("cvd");
// ─── File Cache ──────────────────────────────────────────
/** Read CVD cache (returns specified symbol entry or undefined) */
export function readCvdCache(symbol) {
    try {
        if (!fs.existsSync(CVD_CACHE_PATH))
            return undefined;
        const raw = fs.readFileSync(CVD_CACHE_PATH, "utf-8");
        const cache = JSON.parse(raw);
        if (symbol)
            return cache[symbol];
        return cache;
    }
    catch {
        return undefined;
    }
}
/** Write CVD state for a single symbol */
export function writeCvdEntry(entry) {
    let cache = {};
    try {
        if (fs.existsSync(CVD_CACHE_PATH)) {
            cache = JSON.parse(fs.readFileSync(CVD_CACHE_PATH, "utf-8"));
        }
    }
    catch { /* Create new cache on read failure */ }
    cache[entry.symbol] = entry;
    fs.mkdirSync(path.dirname(CVD_CACHE_PATH), { recursive: true });
    fs.writeFileSync(CVD_CACHE_PATH, JSON.stringify(cache, null, 2));
}
/**
 * CVD Aggregation Stream Manager
 *
 * Subscribes to aggTrade streams for multiple symbols, accumulates CVD in real-time, and periodically flushes to cache.
 *
 * @example
 * const mgr = new CvdManager(["BTCUSDT", "ETHUSDT"], { windowMs: 3_600_000 });
 * mgr.start();
 * // later: mgr.stop();
 */
export class CvdManager {
    symbols;
    windowMs; // CVD rolling window (default 1h)
    ws = null;
    state = {};
    flushIntervalId = null;
    reconnectTimer = null;
    reconnectDelayMs = 1_000;
    static MAX_RECONNECT_DELAY_MS = 30_000;
    constructor(symbols, opts = {}) {
        this.symbols = symbols.map((s) => s.toLowerCase());
        this.windowMs = opts.windowMs ?? 3_600_000; // 1h window
    }
    start() {
        this._initState();
        this._connect();
        // Flush to disk every 30 seconds
        this.flushIntervalId = setInterval(() => { this._flush(); }, 30_000);
        log.info(`Subscribed to aggTrade: ${this.symbols.join(", ")} (window ${this.windowMs / 60_000}min)`);
    }
    stop() {
        if (this.reconnectTimer)
            clearTimeout(this.reconnectTimer);
        if (this.flushIntervalId)
            clearInterval(this.flushIntervalId);
        if (this.ws)
            this.ws.close();
        this._flush();
        log.info("Stopped");
    }
    /** Get current CVD for a symbol (raw value) */
    getCvd(symbol) {
        return this.state[symbol.toLowerCase()]?.cvd;
    }
    // ── Private Methods ──────────────────────────────────────
    _initState() {
        const nowMs = Date.now();
        for (const sym of this.symbols) {
            this.state[sym] = {
                symbol: sym.toUpperCase(),
                cvd: 0,
                buyVolume: 0,
                sellVolume: 0,
                tradeCount: 0,
                windowStartMs: nowMs,
                updatedAt: nowMs,
            };
        }
    }
    _connect() {
        // Binance combined stream format: symbol@aggTrade/symbol@aggTrade/...
        const streams = this.symbols.map((s) => `${s}@aggTrade`).join("/");
        const url = `wss://stream.binance.com:9443/stream?streams=${streams}`;
        this.ws = new WebSocket(url);
        this.ws.addEventListener("message", (event) => {
            try {
                const msg = JSON.parse(event.data);
                this._onTrade(msg.data);
            }
            catch { /* Ignore parse errors */ }
        });
        this.ws.addEventListener("open", () => {
            this.reconnectDelayMs = 1_000; // reset on successful connection
        });
        this.ws.addEventListener("error", () => {
            log.error("WebSocket error");
        });
        this.ws.addEventListener("close", () => {
            const delay = this.reconnectDelayMs;
            log.warn(`Connection closed, reconnecting in ${(delay / 1000).toFixed(0)}s...`);
            this.reconnectTimer = setTimeout(() => { this.reconnectTimer = null; this._connect(); }, delay);
            this.reconnectDelayMs = Math.min(delay * 2, CvdManager.MAX_RECONNECT_DELAY_MS);
        });
    }
    _onTrade(trade) {
        const sym = trade.s.toLowerCase();
        const entry = this.state[sym];
        if (!entry)
            return;
        const nowMs = trade.E;
        const qty = parseFloat(trade.q);
        // Rolling window: reset if exceeded windowMs
        if (nowMs - entry.windowStartMs > this.windowMs) {
            entry.cvd = 0;
            entry.buyVolume = 0;
            entry.sellVolume = 0;
            entry.tradeCount = 0;
            entry.windowStartMs = nowMs;
        }
        // Binance aggTrade: m = isBuyerMaker
        //   m = false -> buyer is taker (active buy, hit ask) -> buy pressure -> CVD +
        //   m = true  -> buyer is maker (seller is taker, hit bid) -> sell pressure -> CVD -
        if (!trade.m) {
            entry.cvd += qty;
            entry.buyVolume += qty;
        }
        else {
            entry.cvd -= qty;
            entry.sellVolume += qty;
        }
        entry.tradeCount += 1;
        entry.updatedAt = nowMs;
    }
    _flush() {
        // Batch write: single JSON.stringify + writeFileSync instead of per-symbol read-modify-write
        try {
            const cache = {};
            for (const entry of Object.values(this.state)) {
                cache[entry.symbol] = entry;
            }
            fs.mkdirSync(path.dirname(CVD_CACHE_PATH), { recursive: true });
            fs.writeFileSync(CVD_CACHE_PATH, JSON.stringify(cache, null, 2));
        }
        catch { /* ignore flush errors */ }
    }
}
