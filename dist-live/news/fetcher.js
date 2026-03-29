/**
 * News and Sentiment Data Fetcher
 * Uses free APIs, no API key required
 */
import https from "https";
function get(url) {
    return new Promise((resolve, reject) => {
        const req = https.get(url, { headers: { "User-Agent": "openclaw-trader/0.1.0" } }, (res) => {
            let data = "";
            res.on("data", (c) => (data += c));
            res.on("end", () => {
                try {
                    resolve(JSON.parse(data));
                }
                catch (_e) {
                    reject(new Error(`Parse failed: ${data.slice(0, 200)}`));
                }
            });
        });
        req.on("error", reject);
        req.setTimeout(10000, () => req.destroy(new Error("Timeout")));
    });
}
export async function getFearGreedIndex() {
    const data = (await get("https://api.alternative.me/fng/?limit=1&format=json"));
    const item = data.data[0];
    if (!item)
        throw new Error("Fear & Greed API returned empty data");
    return {
        value: parseInt(item.value, 10),
        label: item.value_classification,
        timestamp: parseInt(item.timestamp, 10) * 1000,
    };
}
// High-impact keywords (presence marks important=true)
const IMPORTANT_KEYWORDS = [
    "crash",
    "collapse",
    "dump",
    "plunge",
    "hack",
    "exploit",
    "breach",
    "ban",
    "regulation",
    "sec",
    "etf",
    "approved",
    "rejected",
    "liquidation",
    "bankruptcy",
    "shutdown",
    "fraud",
    "scam",
    "all-time high",
    "ath",
    "breakout",
    "capitulation",
    "federal reserve",
    "fed rate",
    "inflation",
    "sanctions",
    "surge",
    "rally",
    "bull",
    "bear",
];
// High-impact categories
const IMPORTANT_CATEGORIES = ["REGULATION", "HACK", "EXCHANGE", "ICO", "MACROECONOMICS"];
// Monitored major coin keyword mapping
const COIN_KEYWORDS = {
    BTC: ["bitcoin", "btc"],
    ETH: ["ethereum", "eth", "ether"],
    BNB: ["bnb", "binance coin", "binance smart chain"],
    SOL: ["solana", "sol"],
    XRP: ["xrp", "ripple"],
    ADA: ["cardano", "ada"],
    DOGE: ["dogecoin", "doge"],
    AVAX: ["avalanche", "avax"],
};
function extractCurrencies(title, categories) {
    const text = (title + " " + categories).toLowerCase();
    return Object.entries(COIN_KEYWORDS)
        .filter(([, keywords]) => keywords.some((kw) => text.includes(kw)))
        .map(([coin]) => coin);
}
function isImportant(title, categories) {
    const text = title.toLowerCase();
    const cats = categories.toUpperCase().split("|");
    return (IMPORTANT_KEYWORDS.some((kw) => text.includes(kw)) ||
        IMPORTANT_CATEGORIES.some((cat) => cats.includes(cat)));
}
export async function getLatestNews(limit = 30) {
    try {
        const data = (await get(`https://min-api.cryptocompare.com/data/v2/news/?lang=EN&limit=${limit}&sortOrder=latest`));
        return data.Data.map((item) => {
            const categories = item.categories || "";
            return {
                title: item.title,
                url: item.url,
                source: item.source_info.name || "CryptoCompare",
                publishedAt: new Date(item.published_on * 1000).toISOString(),
                currencies: extractCurrencies(item.title, categories),
                categories,
                important: isImportant(item.title, categories),
            };
        });
    }
    catch (_e) {
        return [];
    }
}
export async function getGlobalMarket() {
    const data = (await get("https://api.coingecko.com/api/v3/global"));
    return {
        totalMarketCapUsd: data.data.total_market_cap.usd,
        totalVolumeUsd: data.data.total_volume.usd,
        btcDominance: data.data.market_cap_percentage.btc,
        marketCapChangePercent24h: data.data.market_cap_change_percentage_24h_usd,
    };
}
export async function getPriceChanges(symbols) {
    const data = (await get("https://api.binance.com/api/v3/ticker/24hr"));
    return data
        .filter((t) => symbols.includes(t.symbol))
        .map((t) => ({
        symbol: t.symbol,
        priceChangePercent: parseFloat(t.priceChangePercent),
        price: parseFloat(t.lastPrice),
    }));
}
