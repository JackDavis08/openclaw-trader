/**
 * Binance Futures Public Market Data
 *
 * Funding Rate and Open Interest
 * Both are free public endpoints, no API Key required.
 *
 * Purpose: Assess market sentiment, identify overheated longs/shorts, predict trend continuation or reversal.
 *
 * Funding Rate interpretation:
 *   > +0.1%  Longs overheated, high liquidation risk (bearish signal)
 *   0 ~ +0.05%  Normal, market leaning long
 *  -0.05% ~ 0  Normal, market leaning short
 *   < -0.05%  Shorts overheated, short squeeze risk (bullish signal)
 *
 * OI interpretation:
 *   OI rising + price rising  -> Longs entering, trend strengthening
 *   OI rising + price falling -> Shorts entering, trend strengthening
 *   OI falling + price rising -> Shorts covering, limited bounce
 *   OI falling + price falling -> Longs exiting, decline decelerating
 */
import https from "https";
const FAPI_HOST = "fapi.binance.com";
/** HTTP GET utility (reuses Binance request pattern) */
function fetchJson(hostname, path, timeoutMs = 10_000) {
    return new Promise((resolve, reject) => {
        const req = https.request({ hostname, path, method: "GET", headers: { "Content-Type": "application/json" } }, (res) => {
            let data = "";
            res.on("data", (chunk) => { data += chunk; });
            res.on("end", () => {
                try {
                    resolve(JSON.parse(data));
                }
                catch {
                    reject(new Error(`JSON parse error: ${data.slice(0, 100)}`));
                }
            });
        });
        req.setTimeout(timeoutMs, () => { req.destroy(); reject(new Error(`futures-data timeout: ${hostname}${path}`)); });
        req.on("error", reject);
        req.end();
    });
}
// ─── Funding Rate ──────────────────────────────────────────
function parseFundingRate(raw, nextTime) {
    const rate = parseFloat(raw.fundingRate);
    const ratePercent = rate * 100;
    let sentiment;
    let sentimentLabel;
    if (rate > 0.001) {
        sentiment = "overlong";
        sentimentLabel = "Longs severely overheated ⚠️ (high reversal risk)";
    }
    else if (rate > 0.0003) {
        sentiment = "overbought";
        sentimentLabel = "Longs overheated (watch for chasing risk)";
    }
    else if (rate >= 0) {
        sentiment = "neutral_long";
        sentimentLabel = "Neutral leaning long (normal)";
    }
    else if (rate >= -0.0005) {
        sentiment = "neutral_short";
        sentimentLabel = "Neutral leaning short (normal)";
    }
    else {
        sentiment = "overshort";
        sentimentLabel = "Shorts overheated ⚠️ (high short squeeze risk)";
    }
    return {
        symbol: raw.symbol,
        fundingRate: rate,
        fundingRateStr: `${ratePercent >= 0 ? "+" : ""}${ratePercent.toFixed(4)}%`,
        nextFundingTime: nextTime,
        sentiment,
        sentimentLabel,
    };
}
/** Get latest funding rate */
export async function getFundingRate(symbol) {
    // /fapi/v1/premiumIndex includes nextFundingTime
    const data = await fetchJson(FAPI_HOST, `/fapi/v1/premiumIndex?symbol=${symbol}`);
    return parseFundingRate({ symbol: data.symbol, fundingRate: data.lastFundingRate, fundingTime: 0 }, data.nextFundingTime);
}
/** Get funding rates for multiple symbols (concurrent) */
export async function getFundingRates(symbols) {
    const results = await Promise.allSettled(symbols.map(getFundingRate));
    const map = new Map();
    for (const [i, r] of results.entries()) {
        if (r.status === "fulfilled")
            map.set(symbols[i] ?? "", r.value);
    }
    return map;
}
// ─── Open Interest ────────────────────────────────────────
/** Get OI history (for calculating change rate) */
async function getOIHistory(symbol, limit = 5) {
    return fetchJson(FAPI_HOST, `/futures/data/openInterestHist?symbol=${symbol}&period=1h&limit=${limit}`);
}
/** Get current open interest + change rate */
export async function getOpenInterest(symbol, currentPrice) {
    const [current, history] = await Promise.all([
        fetchJson(FAPI_HOST, `/fapi/v1/openInterest?symbol=${symbol}`),
        getOIHistory(symbol, 5),
    ]);
    const oiNow = parseFloat(current.openInterest);
    const oiUsdt = oiNow * currentPrice;
    // Calculate change rate
    let change1h = 0;
    let change4h = 0;
    if (history.length >= 2) {
        const oi1hAgo = parseFloat(history[history.length - 2]?.sumOpenInterest ?? "0");
        change1h = oi1hAgo > 0 ? ((oiNow - oi1hAgo) / oi1hAgo) * 100 : 0;
    }
    if (history.length >= 5) {
        const oi4hAgo = parseFloat(history[0]?.sumOpenInterest ?? "0");
        change4h = oi4hAgo > 0 ? ((oiNow - oi4hAgo) / oi4hAgo) * 100 : 0;
    }
    let trend;
    if (change1h > 0.5)
        trend = "rising";
    else if (change1h < -0.5)
        trend = "falling";
    else
        trend = "flat";
    const trendLabel = trend === "rising" ? `Rising +${change1h.toFixed(1)}%` :
        trend === "falling" ? `Falling ${change1h.toFixed(1)}%` :
            `Flat ${change1h.toFixed(1)}%`;
    return {
        symbol,
        openInterest: oiNow,
        openInterestUsdt: oiUsdt,
        changePercent1h: change1h,
        changePercent4h: change4h,
        trend,
        trendLabel,
    };
}
// ─── Combined Analysis ──────────────────────────────────────────
/** Combine funding rate + OI changes to produce a combined signal */
export async function getFuturesMarketData(symbol, currentPrice) {
    const [fundingRate, openInterest] = await Promise.all([
        getFundingRate(symbol),
        getOpenInterest(symbol, currentPrice),
    ]);
    // Combined signal: funding rate x OI trend
    let combinedSignal;
    let combinedLabel;
    const fr = fundingRate.fundingRate;
    const oiTrend = openInterest.trend;
    if (fr > 0.001 && oiTrend === "rising") {
        combinedSignal = "extreme_long";
        combinedLabel = "🔥 Longs extremely overheated (high-risk reversal zone)";
    }
    else if (fr < -0.0005 && oiTrend === "rising") {
        combinedSignal = "extreme_short";
        combinedLabel = "🔥 Shorts extremely overheated (high short squeeze risk)";
    }
    else if (fr > 0.0003 || (fr > 0 && oiTrend === "rising")) {
        combinedSignal = "bullish";
        combinedLabel = "📈 Longs dominant (normal leaning long)";
    }
    else if (fr < -0.0002 || (fr < 0 && oiTrend === "rising")) {
        combinedSignal = "bearish";
        combinedLabel = "📉 Shorts dominant (normal leaning short)";
    }
    else {
        combinedSignal = "neutral";
        combinedLabel = "⚖️ Neutral (no clear direction)";
    }
    return { symbol, fundingRate, openInterest, combinedSignal, combinedLabel };
}
/** Batch fetch Futures market data for multiple symbols */
export async function getBatchFuturesData(symbols, prices) {
    const results = await Promise.allSettled(symbols.map((sym) => getFuturesMarketData(sym, prices[sym] ?? 0)));
    const map = new Map();
    for (const [i, r] of results.entries()) {
        if (r.status === "fulfilled")
            map.set(symbols[i] ?? "", r.value);
    }
    return map;
}
/** Format funding rate report (for Telegram) */
export function formatFundingRateReport(data) {
    const lines = ["📊 **Funding Rate & Open Interest**\n"];
    for (const [symbol, d] of data) {
        const coin = symbol.replace("USDT", "");
        const fr = d.fundingRate;
        const oi = d.openInterest;
        const frEmoji = fr.fundingRate > 0.0005 ? "🔴" : fr.fundingRate < -0.0003 ? "🟢" : "⚪";
        const oiEmoji = oi.trend === "rising" ? "📈" : oi.trend === "falling" ? "📉" : "➡️";
        lines.push(`${frEmoji} **${coin}** Funding Rate: ${fr.fundingRateStr} | ${oiEmoji} OI: ${oi.trendLabel}`);
    }
    lines.push(`\n${[...data.values()].map(d => d.combinedLabel).join("\n")}`);
    return lines.join("\n");
}
