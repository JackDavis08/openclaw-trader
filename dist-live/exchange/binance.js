import crypto from "crypto";
import https from "https";
const BASE_URL = "api.binance.com";
function sign(query, secret) {
    return crypto.createHmac("sha256", secret).update(query).digest("hex");
}
function isBinanceError(obj) {
    return (typeof obj === "object" &&
        obj !== null &&
        "code" in obj &&
        typeof obj["code"] === "number" &&
        obj["code"] < 0);
}
function request(options) {
    return new Promise((resolve, reject) => {
        const req = https.get(options, (res) => {
            let data = "";
            res.on("data", (chunk) => (data += chunk));
            res.on("end", () => {
                try {
                    const parsed = JSON.parse(data);
                    if (isBinanceError(parsed)) {
                        reject(new Error(`Binance API Error ${parsed.code}: ${parsed.msg}`));
                    }
                    else {
                        resolve(parsed);
                    }
                }
                catch (_e) {
                    reject(new Error(`Failed to parse response: ${data}`));
                }
            });
        });
        req.on("error", reject);
        req.setTimeout(10000, () => {
            req.destroy(new Error("Request timeout"));
        });
    });
}
// ─────────────────────────────────────────────────────
// Public API (no signature required)
// ─────────────────────────────────────────────────────
/** @deprecated Use IExchange.getPrice() via createExchange() instead */
export async function getPrice(symbol) {
    const data = (await request({
        hostname: BASE_URL,
        path: `/api/v3/ticker/price?symbol=${symbol}`,
    }));
    return parseFloat(data.price);
}
/** @deprecated Use IExchange.getKlines() via createExchange() instead */
export async function getKlines(symbol, interval, limit = 100) {
    const raw = (await request({
        hostname: BASE_URL,
        path: `/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`,
    }));
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
// ─────────────────────────────────────────────────────
// Private API (signature required)
// ─────────────────────────────────────────────────────
/** @deprecated Use IExchange.getUsdtBalance() via createExchange() instead */
export async function getBalance(cfg, asset = "USDT") {
    const ts = Date.now();
    const query = `timestamp=${ts}`;
    const sig = sign(query, cfg.secretKey);
    const data = (await request({
        hostname: BASE_URL,
        path: `/api/v3/account?${query}&signature=${sig}`,
        headers: { "X-MBX-APIKEY": cfg.apiKey },
    }));
    const balance = data.balances.find((b) => b.asset === asset);
    return balance ? parseFloat(balance.free) : 0;
}
/** @deprecated Use IExchange.marketBuy() via createExchange() instead */
export async function marketBuy(cfg, symbol, quoteQty // USDT amount to spend
) {
    const ts = Date.now();
    const params = `symbol=${symbol}&side=BUY&type=MARKET&quoteOrderQty=${quoteQty.toFixed(2)}&timestamp=${ts}`;
    const sig = sign(params, cfg.secretKey);
    const body = `${params}&signature=${sig}`;
    return new Promise((resolve, reject) => {
        const req = https.request({
            hostname: BASE_URL,
            path: "/api/v3/order",
            method: "POST",
            headers: {
                "X-MBX-APIKEY": cfg.apiKey,
                "Content-Type": "application/x-www-form-urlencoded",
                "Content-Length": Buffer.byteLength(body),
            },
        }, (res) => {
            let data = "";
            res.on("data", (c) => (data += c));
            res.on("end", () => {
                const obj = JSON.parse(data);
                if (obj.code && obj.code < 0) {
                    resolve({
                        symbol,
                        side: "buy",
                        price: 0,
                        quantity: 0,
                        orderId: "",
                        timestamp: ts,
                        status: "failed",
                        error: obj.msg,
                    });
                }
                else {
                    const price = obj.fills?.[0] ? parseFloat(obj.fills[0].price) : 0;
                    resolve({
                        symbol,
                        side: "buy",
                        price,
                        quantity: parseFloat(obj.executedQty),
                        orderId: String(obj.orderId),
                        timestamp: ts,
                        status: "filled",
                    });
                }
            });
        });
        req.on("error", reject);
        req.write(body);
        req.end();
    });
}
/** @deprecated Use IExchange.marketSell() via createExchange() instead */
export async function marketSell(cfg, symbol, quantity) {
    const ts = Date.now();
    const params = `symbol=${symbol}&side=SELL&type=MARKET&quantity=${quantity}&timestamp=${ts}`;
    const sig = sign(params, cfg.secretKey);
    const body = `${params}&signature=${sig}`;
    return new Promise((resolve, reject) => {
        const req = https.request({
            hostname: BASE_URL,
            path: "/api/v3/order",
            method: "POST",
            headers: {
                "X-MBX-APIKEY": cfg.apiKey,
                "Content-Type": "application/x-www-form-urlencoded",
                "Content-Length": Buffer.byteLength(body),
            },
        }, (res) => {
            let data = "";
            res.on("data", (c) => (data += c));
            res.on("end", () => {
                const obj = JSON.parse(data);
                if (obj.code && obj.code < 0) {
                    resolve({
                        symbol,
                        side: "sell",
                        price: 0,
                        quantity: 0,
                        orderId: "",
                        timestamp: ts,
                        status: "failed",
                        error: obj.msg,
                    });
                }
                else {
                    const price = obj.fills?.[0] ? parseFloat(obj.fills[0].price) : 0;
                    resolve({
                        symbol,
                        side: "sell",
                        price,
                        quantity: parseFloat(obj.executedQty),
                        orderId: String(obj.orderId),
                        timestamp: ts,
                        status: "filled",
                    });
                }
            });
        });
        req.on("error", reject);
        req.write(body);
        req.end();
    });
}
