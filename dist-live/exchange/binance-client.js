/**
 * Binance REST API Client
 *
 * Supports:
 * - Spot production / Testnet
 * - USDT-M Futures production / Testnet
 * - HMAC-SHA256 signature authentication
 *
 * Testnet application: https://testnet.binance.vision (login with GitHub)
 */
import https from "https";
import crypto from "crypto";
import fs from "fs";
// ─────────────────────────────────────────────────────
// Token Bucket Rate Limiter
// Binance limits: Spot 1200 weight/min · Futures 2400 weight/min
// Conservative cap: 600 weight/min = 10/s, leaving sufficient headroom
// ─────────────────────────────────────────────────────
class RateLimiter {
    tokens;
    lastRefill;
    maxTokens;
    refillRate; // tokens per ms
    constructor(maxPerMinute = 600) {
        this.maxTokens = maxPerMinute;
        this.tokens = maxPerMinute;
        this.lastRefill = Date.now();
        this.refillRate = maxPerMinute / 60_000;
    }
    async acquire(weight = 1) {
        for (;;) {
            const now = Date.now();
            const elapsed = now - this.lastRefill;
            this.tokens = Math.min(this.maxTokens, this.tokens + elapsed * this.refillRate);
            this.lastRefill = now;
            if (this.tokens >= weight) {
                this.tokens -= weight;
                return;
            }
            // Wait for token replenishment, minimum wait 50ms
            const waitMs = Math.ceil((weight - this.tokens) / this.refillRate);
            await new Promise((r) => setTimeout(r, Math.max(50, waitMs)));
        }
    }
}
// Global rate limiter (one shared instance per process)
const globalRateLimiter = new RateLimiter(600);
// ─────────────────────────────────────────────────────
// API Endpoint Configuration
// ─────────────────────────────────────────────────────
const ENDPOINTS = {
    spot: {
        production: "api.binance.com",
        testnet: "testnet.binance.vision",
    },
    futures: {
        production: "fapi.binance.com",
        testnet: "testnet.binancefuture.com",
    },
};
// ─────────────────────────────────────────────────────
// Core HTTP Request (with signature)
// ─────────────────────────────────────────────────────
function sign(secretKey, queryString) {
    return crypto.createHmac("sha256", secretKey).update(queryString).digest("hex");
}
function buildQueryString(params) {
    return Object.entries(params)
        .filter(([, v]) => v !== "")
        .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
        .join("&");
}
function isBinanceApiError(obj) {
    return typeof obj === "object" && obj !== null && "code" in obj &&
        typeof obj["code"] === "number" &&
        obj["code"] < 0;
}
async function httpsRequest(hostname, method, path, headers, body) {
    await globalRateLimiter.acquire();
    return new Promise((resolve, reject) => {
        const options = {
            hostname,
            path,
            method,
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                ...headers,
                ...(body ? { "Content-Length": String(Buffer.byteLength(body)) } : {}),
            },
        };
        const req = https.request(options, (res) => {
            let data = "";
            res.on("data", (chunk) => (data += chunk));
            res.on("end", () => {
                // 429: Rate limit triggered
                if (res.statusCode === 429 || res.statusCode === 418) {
                    const retryAfter = parseInt(res.headers["retry-after"] ?? "60", 10);
                    reject(new Error(`Binance rate limit hit (HTTP ${res.statusCode}), retry after ${retryAfter}s`));
                    return;
                }
                try {
                    const parsed = JSON.parse(data);
                    if (isBinanceApiError(parsed)) {
                        reject(new Error(`Binance API Error ${parsed.code}: ${parsed.msg}`));
                    }
                    else {
                        resolve(parsed);
                    }
                }
                catch (_e) {
                    reject(new Error(`Failed to parse Binance response: ${data.slice(0, 200)}`));
                }
            });
        });
        req.on("error", reject);
        req.setTimeout(10000, () => {
            req.destroy(new Error("Binance API timeout"));
        });
        if (body)
            req.write(body);
        req.end();
    });
}
// ─────────────────────────────────────────────────────
// Request wrapper with auto-retry (429/5xx/network errors)
// ─────────────────────────────────────────────────────
const MAX_RETRIES = 3;
async function httpsRequestWithRetry(hostname, method, path, headers, body) {
    let lastError;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
            return await httpsRequest(hostname, method, path, headers, body);
        }
        catch (err) {
            lastError = err instanceof Error ? err : new Error(String(err));
            const msg = lastError.message;
            // Retryable conditions: 429/418 rate limit, 5xx server error, network/timeout error
            const isRateLimit = msg.includes("rate limit hit");
            const isTimeout = msg.includes("timeout");
            const isNetwork = msg.includes("ECONNRESET") || msg.includes("ECONNREFUSED") || msg.includes("ETIMEDOUT");
            const is5xx = msg.includes("HTTP 5");
            if (!isRateLimit && !isTimeout && !isNetwork && !is5xx)
                throw lastError; // Not retryable
            if (attempt >= MAX_RETRIES)
                break; // Max retries reached
            // Exponential backoff: 429 uses retry-after, others use 1s/2s/4s
            let waitMs;
            if (isRateLimit) {
                const match = /retry after (\d+)s/.exec(msg);
                waitMs = match?.[1] ? parseInt(match[1], 10) * 1000 : 5000;
            }
            else {
                waitMs = 1000 * Math.pow(2, attempt); // 1s, 2s, 4s
            }
            await new Promise((r) => setTimeout(r, waitMs));
        }
    }
    throw lastError;
}
// ─────────────────────────────────────────────────────
// BinanceClient Class
// ─────────────────────────────────────────────────────
export class BinanceClient {
    hostname;
    apiPrefix; // /api/v3 or /fapi/v1
    accountPrefix; // /api/v3 or /fapi/v2 (Futures account uses v2)
    market;
    creds;
    _symbolInfoCache = new Map();
    static SYMBOL_INFO_TTL_MS = 3_600_000; // 1 hour
    /**
     * @param credentialsPath  JSON file path containing { apiKey, secretKey }
     * @param testnet          true = testnet, false = production
     * @param market           "spot" | "futures"
     */
    constructor(credentialsPath, testnet = false, market = "spot") {
        const raw = fs.readFileSync(credentialsPath, "utf-8");
        const parsed = JSON.parse(raw);
        if (typeof parsed !== "object" || parsed === null ||
            typeof parsed["apiKey"] !== "string" ||
            typeof parsed["secretKey"] !== "string") {
            throw new Error(`Invalid credentials file (missing apiKey/secretKey): ${credentialsPath}`);
        }
        this.creds = parsed;
        const env = testnet ? "testnet" : "production";
        this.hostname = ENDPOINTS[market][env];
        this.market = market;
        this.apiPrefix = market === "futures" ? "/fapi/v1" : "/api/v3";
        // Futures account/balance endpoint is v2 (/fapi/v1/account is deprecated)
        this.accountPrefix = market === "futures" ? "/fapi/v2" : "/api/v3";
    }
    // ── Public endpoints (no signature required) ──────────────────────────────
    /** Get current price */
    async getPrice(symbol) {
        const path = `${this.apiPrefix}/ticker/price?symbol=${symbol}`;
        const res = (await httpsRequestWithRetry(this.hostname, "GET", path, {}));
        return parseFloat(res.price);
    }
    /** Get kline (candlestick) data */
    async getKlines(symbol, interval, limit = 100) {
        const path = `${this.apiPrefix}/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
        const raw = (await httpsRequestWithRetry(this.hostname, "GET", path, {}));
        return raw.map((k) => ({
            openTime: k[0],
            open: parseFloat(k[1]),
            high: parseFloat(k[2]),
            low: parseFloat(k[3]),
            close: parseFloat(k[4]),
            volume: parseFloat(k[5]),
            closeTime: k[6],
        }));
    }
    /** Get symbol info (precision, minimum order size, etc.) — cached for 1 hour */
    async getSymbolInfo(symbol) {
        const cached = this._symbolInfoCache.get(symbol);
        if (cached && Date.now() - cached.cachedAt < BinanceClient.SYMBOL_INFO_TTL_MS) {
            return cached.info;
        }
        const path = `${this.apiPrefix}/exchangeInfo?symbol=${symbol}`;
        const res = (await httpsRequestWithRetry(this.hostname, "GET", path, {}));
        const info = res.symbols.find((s) => s.symbol === symbol);
        if (!info)
            throw new Error(`Symbol ${symbol} not found`);
        const lotFilter = info.filters.find((f) => f.filterType === "LOT_SIZE");
        const notionalFilter = info.filters.find((f) => f.filterType === "MIN_NOTIONAL") ??
            info.filters.find((f) => f.filterType === "NOTIONAL");
        const priceFilter = info.filters.find((f) => f.filterType === "PRICE_FILTER");
        const result = {
            symbol: info.symbol,
            baseAsset: info.baseAsset,
            quoteAsset: info.quoteAsset,
            minQty: parseFloat(lotFilter?.minQty ?? "0.00001"),
            maxQty: parseFloat(lotFilter?.maxQty ?? "9000"),
            stepSize: parseFloat(lotFilter?.stepSize ?? "0.00001"),
            tickSize: parseFloat(priceFilter?.tickSize ?? "0.01"),
            minNotional: parseFloat(notionalFilter?.minNotional ?? "10"),
            pricePrecision: info.quotePrecision,
            quantityPrecision: info.baseAssetPrecision,
        };
        this._symbolInfoCache.set(symbol, { info: result, cachedAt: Date.now() });
        return result;
    }
    /** Round price to tickSize (prevent PRICE_FILTER error) */
    roundToTickSize(price, tickSize) {
        const decimals = Math.round(-Math.log10(tickSize));
        return parseFloat((Math.round(price / tickSize) * tickSize).toFixed(Math.max(0, decimals)));
    }
    signedHeaders() {
        return { "X-MBX-APIKEY": this.creds.apiKey };
    }
    buildSignedQuery(params) {
        const withTimestamp = { ...params, timestamp: Date.now(), recvWindow: 10000 };
        const qs = buildQueryString(withTimestamp);
        const sig = sign(this.creds.secretKey, qs);
        return `${qs}&signature=${sig}`;
    }
    /** Account balance (Spot uses /api/v3/account; Futures uses /fapi/v2/account) */
    async getAccountInfo() {
        const qs = this.buildSignedQuery({});
        const path = `${this.accountPrefix}/account?${qs}`;
        const raw = await httpsRequestWithRetry(this.hostname, "GET", path, this.signedHeaders());
        if (this.market === "futures") {
            // Futures account structure: { assets: [{ asset, walletBalance, availableBalance }] }
            const futuresRaw = raw;
            return {
                canTrade: futuresRaw.canTrade ?? true,
                canWithdraw: true,
                canDeposit: true,
                balances: (futuresRaw.assets ?? []).map((a) => ({
                    asset: a.asset,
                    free: a.availableBalance,
                    locked: "0",
                })),
            };
        }
        return raw;
    }
    /** Get available USDT balance (works for both Spot and Futures) */
    async getUsdtBalance() {
        const info = await this.getAccountInfo();
        const usdt = info.balances.find((b) => b.asset === "USDT");
        return usdt ? parseFloat(usdt.free) : 0;
    }
    /**
     * Place order (market / limit)
     *
     * quantity is in BASE asset units (e.g. BTC amount, not USDT amount)
     * If passing USDT amount, divide by price first to convert
     */
    async createOrder(req) {
        const params = {
            symbol: req.symbol,
            side: req.side,
            type: req.type,
            quantity: req.quantity.toFixed(8), // Precision control handled by caller
        };
        if (req.type === "LIMIT" || req.type === "STOP_LOSS_LIMIT" || req.type === "TAKE_PROFIT_LIMIT") {
            params["timeInForce"] = req.timeInForce ?? "GTC";
            if (req.price)
                params["price"] = req.price.toFixed(8);
        }
        if (req.stopPrice)
            params["stopPrice"] = req.stopPrice.toFixed(8);
        if (req.newClientOrderId)
            params["newClientOrderId"] = req.newClientOrderId;
        if (req.reduceOnly)
            params["reduceOnly"] = "true";
        if (req.workingType)
            params["workingType"] = req.workingType;
        const body = this.buildSignedQuery(params);
        const path = `${this.apiPrefix}/order`;
        return (await httpsRequestWithRetry(this.hostname, "POST", path, this.signedHeaders(), body));
    }
    /**
     * Place stop-loss order (auto-adapts to Spot / Futures)
     *
     * Spot: STOP_LOSS_LIMIT (requires price + stopPrice)
     *   - Trigger condition: price crosses stopPrice
     *   - Order price: limitPrice (usually 0.2% below stopPrice to ensure fill)
     *
     * Futures: STOP_MARKET (only needs stopPrice)
     *   - Market close after trigger, no limit price needed
     *   - reduceOnly=true: reduce-only, prevents accidental new positions
     *
     * @param symbol      Trading pair
     * @param side        Order direction (short stop-loss=BUY, long stop-loss=SELL)
     * @param qty         Quantity
     * @param stopPrice   Trigger price
     * @param limitPrice  Only needed for Spot (defaults to stopPrice * 0.998 if not provided)
     */
    async placeStopLossOrder(symbol, side, qty, stopPrice, limitPrice) {
        const symbolInfo = await this.getSymbolInfo(symbol);
        const roundedStop = this.roundToTickSize(stopPrice, symbolInfo.tickSize);
        try {
            if (this.market === "futures") {
                return await this.createOrder({
                    symbol,
                    side,
                    type: "STOP_MARKET",
                    quantity: qty,
                    stopPrice: roundedStop,
                    reduceOnly: true,
                    workingType: "MARK_PRICE",
                });
            }
            else {
                // Spot: STOP_LOSS_LIMIT, limit price = stopPrice * 0.998 (0.2% slippage allowance)
                const rawLimit = limitPrice ?? stopPrice * 0.998;
                const roundedLimit = this.roundToTickSize(rawLimit, symbolInfo.tickSize);
                return await this.createOrder({
                    symbol,
                    side,
                    type: "STOP_LOSS_LIMIT",
                    quantity: qty,
                    stopPrice: roundedStop,
                    price: roundedLimit,
                    timeInForce: "GTC",
                });
            }
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            // Known testnet limitations:
            //   Spot testnet: -1026 MAX_NUM_ALGO_ORDERS (max 5 stop-loss orders)
            //   Futures testnet: -4114/-4135 conditional orders require Algo Order API
            if (msg.includes("-1026") || msg.includes("MAX_NUM_ALGO_ORDERS") ||
                msg.includes("Algo Order") || msg.includes("-4114") || msg.includes("-4135") ||
                msg.includes("not supported for this endpoint")) {
                console.warn(`[BinanceClient] ⚠️  ${symbol} cannot place stop-loss order on exchange (${msg.split(":")[0]}). ` +
                    `Falling back to local price polling stop-loss (SL @ ${roundedStop}).`);
                // Return placeholder response, let caller continue; local engine price polling will still execute stop-loss
                return { orderId: -1, status: "LOCAL_ONLY", symbol, side, type: "STOP_LOSS_LIMIT" };
            }
            throw e;
        }
    }
    /**
     * Place take-profit order (auto-adapts to Spot / Futures)
     */
    async placeTakeProfitOrder(symbol, side, qty, takeProfitPrice, limitPrice) {
        const symbolInfo = await this.getSymbolInfo(symbol);
        const roundedTP = this.roundToTickSize(takeProfitPrice, symbolInfo.tickSize);
        try {
            if (this.market === "futures") {
                return await this.createOrder({
                    symbol,
                    side,
                    type: "TAKE_PROFIT_MARKET",
                    quantity: qty,
                    stopPrice: roundedTP,
                    reduceOnly: true,
                    workingType: "MARK_PRICE",
                });
            }
            else {
                const rawLimit = limitPrice ?? takeProfitPrice * 0.999;
                const roundedLimit = this.roundToTickSize(rawLimit, symbolInfo.tickSize);
                return await this.createOrder({
                    symbol,
                    side,
                    type: "TAKE_PROFIT_LIMIT",
                    quantity: qty,
                    stopPrice: roundedTP,
                    price: roundedLimit,
                    timeInForce: "GTC",
                });
            }
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            if (msg.includes("-1026") || msg.includes("MAX_NUM_ALGO_ORDERS") ||
                msg.includes("Algo Order") || msg.includes("-4114") || msg.includes("-4135") ||
                msg.includes("not supported for this endpoint")) {
                console.warn(`[BinanceClient] ⚠️  ${symbol} cannot place take-profit order on exchange (${msg.split(":")[0]}). ` +
                    `Falling back to local price polling take-profit (TP @ ${roundedTP}).`);
                return { orderId: -1, status: "LOCAL_ONLY", symbol, side, type: "TAKE_PROFIT_LIMIT" };
            }
            throw e;
        }
    }
    /** Cancel open order */
    async cancelOrder(symbol, orderId) {
        const qs = this.buildSignedQuery({ symbol, orderId });
        const path = `${this.apiPrefix}/order?${qs}`;
        return (await httpsRequestWithRetry(this.hostname, "DELETE", path, this.signedHeaders()));
    }
    /** Query order status */
    async getOrder(symbol, orderId) {
        const qs = this.buildSignedQuery({ symbol, orderId });
        const path = `${this.apiPrefix}/order?${qs}`;
        return (await httpsRequestWithRetry(this.hostname, "GET", path, this.signedHeaders()));
    }
    /** Get all open orders */
    async getOpenOrders(symbol) {
        const params = symbol ? { symbol } : {};
        const qs = this.buildSignedQuery(params);
        const path = `${this.apiPrefix}/openOrders?${qs}`;
        return (await httpsRequestWithRetry(this.hostname, "GET", path, this.signedHeaders()));
    }
    /**
     * Get Futures position risk (/fapi/v2/positionRisk)
     * Only valid for futures market; returns position info for all symbols
     */
    async getFuturesPositions() {
        if (this.market !== "futures")
            return [];
        const qs = this.buildSignedQuery({});
        const path = `/fapi/v2/positionRisk?${qs}`;
        const raw = await httpsRequestWithRetry(this.hostname, "GET", path, this.signedHeaders());
        return raw;
    }
    /**
     * Market buy (USDT amount -> auto-calculate quantity)
     * Returns the actual filled OrderResponse
     */
    async marketBuy(symbol, usdtAmount) {
        const symbolInfo = await this.getSymbolInfo(symbol);
        if (usdtAmount < symbolInfo.minNotional) {
            throw new Error(`Buy amount $${usdtAmount} is below minimum notional value $${symbolInfo.minNotional}`);
        }
        const price = await this.getPrice(symbol);
        const rawQty = usdtAmount / price;
        // Round down to stepSize
        const qty = Math.floor(rawQty / symbolInfo.stepSize) * symbolInfo.stepSize;
        return this.createOrder({
            symbol,
            side: "BUY",
            type: "MARKET",
            quantity: qty,
        });
    }
    /**
     * Market sell (sell full BASE asset amount)
     * Quantity is rounded down to stepSize to avoid LOT_SIZE filter failure
     */
    /**
     * Market sell by BASE asset quantity.
     *
     * @param reduceOnly  When true, the order can only reduce an existing long position
     *                    (i.e. close long). Pass true when calling from handleSell().
     *                    Pass false (default) when opening a new short via handleShort().
     *                    Ignored on spot markets.
     */
    async marketSell(symbol, quantity, reduceOnly = false) {
        const symbolInfo = await this.getSymbolInfo(symbol);
        const qty = Math.floor(quantity / symbolInfo.stepSize) * symbolInfo.stepSize;
        const order = {
            symbol,
            side: "SELL",
            type: "MARKET",
            quantity: qty,
        };
        if (this.market === "futures" && reduceOnly) {
            order.reduceOnly = true;
        }
        return this.createOrder(order);
    }
    /**
     * Market buy by BASE asset quantity.
     * Used for covering shorts: when the exact quantity to buy back is known.
     *
     * @param reduceOnly  When true, the order can only reduce an existing short position
     *                    (i.e. close short). Pass true when calling from handleCover().
     *                    Ignored on spot markets.
     */
    async marketBuyByQty(symbol, quantity, reduceOnly = false) {
        const symbolInfo = await this.getSymbolInfo(symbol);
        const qty = Math.floor(quantity / symbolInfo.stepSize) * symbolInfo.stepSize;
        const order = {
            symbol,
            side: "BUY",
            type: "MARKET",
            quantity: qty,
        };
        if (this.market === "futures" && reduceOnly) {
            order.reduceOnly = true;
        }
        return this.createOrder(order);
    }
    /**
     * Test connection (ping)
     * Returns true if API Key is valid and connectivity works
     */
    async ping() {
        try {
            await httpsRequestWithRetry(this.hostname, "GET", `${this.apiPrefix}/ping`, {});
            return true;
        }
        catch (_e) {
            return false;
        }
    }
}
// ─────────────────────────────────────────────────────
// Factory Function
// ─────────────────────────────────────────────────────
/**
 * Create BinanceClient from config
 * Credentials format: { "apiKey": "xxx", "secretKey": "yyy" }
 */
export function createBinanceClient(credentialsPath, options = {}) {
    return new BinanceClient(credentialsPath, options.testnet ?? false, options.market ?? "spot");
}
