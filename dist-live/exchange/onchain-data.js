/**
 * On-Chain Data Module — Phase 3
 *
 * Core logic:
 *   Stablecoin supply = on-chain "ammunition" reserves
 *   USDT/USDC sustained minting -> new capital inflow -> potential buy pressure
 *   USDT/USDC sustained burning -> capital outflow -> sell pressure
 *
 * More reliable than exchange flows because:
 *   - On-chain data is immutable
 *   - Covers all chains (ETH/Tron/BSC...), not just one exchange
 *   - Reflects real capital movements, not internal exchange transfers
 *
 * Data sources (free, no Key required):
 *   DeFiLlama Stablecoins API — Real-time stablecoin supply
 *   Blockchair API            — BTC on-chain network metrics
 *   Blockchain.info API       — BTC mining & network statistics
 */
import https from "https";
// ─── HTTP Utility ─────────────────────────────────────────
function fetchJson(url) {
    return new Promise((resolve, reject) => {
        const parsed = new URL(url);
        const opts = {
            hostname: parsed.hostname,
            path: parsed.pathname + parsed.search,
            method: "GET",
            headers: { "User-Agent": "openclaw-trader/1.0", "Accept": "application/json" },
        };
        const req = https.request(opts, (res) => {
            let data = "";
            res.on("data", (c) => { data += c; });
            res.on("end", () => {
                try {
                    resolve(JSON.parse(data));
                }
                catch {
                    reject(new Error(`JSON error from ${parsed.hostname}: ${data.slice(0, 80)}`));
                }
            });
        });
        req.on("error", reject);
        req.setTimeout(10000, () => { req.destroy(); reject(new Error(`timeout: ${url}`)); });
        req.end();
    });
}
const TRACKED_STABLECOINS = ["USDT", "USDC"]; // Track the two largest
export async function getStablecoinFlows() {
    const data = await fetchJson("https://stablecoins.llama.fi/stablecoins?includePrices=true");
    const results = [];
    for (const symbol of TRACKED_STABLECOINS) {
        const asset = data.peggedAssets.find((a) => a.symbol === symbol);
        if (!asset)
            continue;
        const now = asset.circulating.peggedUSD;
        const prevDay = asset.circulatingPrevDay?.peggedUSD ?? now;
        const prevWeek = asset.circulatingPrevWeek?.peggedUSD ?? now;
        const prevMonth = asset.circulatingPrevMonth?.peggedUSD ?? now;
        const change1d = now - prevDay; // Absolute value, in $
        const change7d = now - prevWeek;
        const change30d = now - prevMonth;
        // Trend determination: 7-day change > 1B with consistent direction
        let trend;
        if (change7d > 1e9)
            trend = "expanding";
        else if (change7d < -1e9)
            trend = "contracting";
        else
            trend = "stable";
        const sign = (n) => n >= 0 ? "+" : "";
        const trendEmoji = trend === "expanding" ? "📈" : trend === "contracting" ? "📉" : "➡️";
        const trendLabel = `${trendEmoji} 7d: ${sign(change7d / 1e9)}${(change7d / 1e9).toFixed(2)}B | 1d: ${sign(change1d / 1e6)}${(change1d / 1e6).toFixed(0)}M`;
        results.push({
            symbol,
            name: asset.name,
            circulatingB: now / 1e9,
            change1dM: change1d / 1e6,
            change7dB: change7d / 1e9,
            change30dB: change30d / 1e9,
            trend,
            trendLabel,
        });
    }
    return results;
}
export async function getBtcNetworkMetrics() {
    try {
        const [blockchair, bcInfo] = await Promise.allSettled([
            fetchJson("https://api.blockchair.com/bitcoin/stats"),
            fetchJson("https://api.blockchain.info/stats"),
        ]);
        const stats = blockchair.status === "fulfilled" ? blockchair.value.data : null;
        const bcStats = bcInfo.status === "fulfilled" ? bcInfo.value : null;
        if (!stats)
            return null;
        // On-chain volume (USD estimate)
        const volumeUSD = bcStats?.estimated_transaction_volume_usd
            ?? (stats.volume_24h / 1e8 * (bcStats?.market_price_usd ?? 63000));
        const transactions24h = stats.transactions_24h;
        const mempoolTxs = stats.mempool_transactions;
        const mempoolSizeMB = stats.mempool_size / 1e6;
        const volumeB = volumeUSD / 1e9;
        // Network activity assessment (based on mempool size)
        let networkActivity;
        let networkLabel;
        if (mempoolTxs > 100000 || mempoolSizeMB > 200) {
            networkActivity = "high";
            networkLabel = `🔥 Network congested (mempool ${mempoolTxs.toLocaleString()} txs, ${mempoolSizeMB.toFixed(0)}MB)`;
        }
        else if (mempoolTxs < 5000) {
            networkActivity = "low";
            networkLabel = `❄️ Network quiet (mempool ${mempoolTxs.toLocaleString()} txs)`;
        }
        else {
            networkActivity = "normal";
            networkLabel = `✅ Network normal (mempool ${mempoolTxs.toLocaleString()} txs)`;
        }
        return {
            transactions24h,
            volumeB,
            mempoolTxs,
            mempoolSizeMB,
            difficulty: stats.difficulty,
            networkActivity,
            networkLabel,
        };
    }
    catch {
        return null;
    }
}
// ─── Combined Analysis ─────────────────────────────────────────
export async function getOnChainContext() {
    const [stablecoins, btcNetwork] = await Promise.allSettled([
        getStablecoinFlows(),
        getBtcNetworkMetrics(),
    ]);
    const sc = stablecoins.status === "fulfilled" ? stablecoins.value : [];
    const btc = btcNetwork.status === "fulfilled" ? btcNetwork.value : null;
    // Total stablecoin changes
    const total1dM = sc.reduce((s, c) => s + c.change1dM, 0);
    const total7dB = sc.reduce((s, c) => s + c.change7dB, 0);
    const total30dB = sc.reduce((s, c) => s + c.change30dB, 0);
    // Capital flow signal (stablecoins = sidelined capital)
    let stablecoinSignal;
    let signalDesc;
    if (total7dB > 2) {
        stablecoinSignal = "accumulation";
        signalDesc = `Stablecoin 7d minting +${total7dB.toFixed(1)}B, sustained capital inflow, mid-long term bullish`;
    }
    else if (total7dB > 0.5) {
        stablecoinSignal = "accumulation";
        signalDesc = `Stablecoin 7d slight minting +${total7dB.toFixed(1)}B, moderate accumulation`;
    }
    else if (total7dB < -2) {
        stablecoinSignal = "distribution";
        signalDesc = `Stablecoin 7d net burn ${total7dB.toFixed(1)}B, capital leaving crypto market, mid-long term bearish`;
    }
    else if (total7dB < -0.5) {
        stablecoinSignal = "distribution";
        signalDesc = `Stablecoin 7d slight decrease ${total7dB.toFixed(1)}B, minor capital outflow`;
    }
    else {
        stablecoinSignal = "neutral";
        signalDesc = `Stablecoin supply 7d change ${total7dB >= 0 ? "+" : ""}${total7dB.toFixed(2)}B, roughly flat`;
    }
    // BTC network supplement
    const btcDesc = btc ? `BTC on-chain 24h transfer volume $${btc.volumeB.toFixed(1)}B, ${btc.networkLabel}` : "";
    const summary = `${signalDesc}${btcDesc ? ". " + btcDesc : ""}`;
    return {
        stablecoins: sc,
        totalStablecoin1dChangeM: total1dM,
        totalStablecoin7dChangeB: total7dB,
        totalStablecoin30dChangeB: total30dB,
        stablecoinSignal,
        btcNetwork: btc,
        summary,
        fetchedAt: Date.now(),
    };
}
// ─── Format Report ───────────────────────────────────────
export function formatOnChainReport(ctx) {
    const lines = ["🔗 **On-Chain Data**\n"];
    const sign = (n) => n >= 0 ? "+" : "";
    // Stablecoins
    const signalEmoji = ctx.stablecoinSignal === "accumulation" ? "🟢"
        : ctx.stablecoinSignal === "distribution" ? "🔴" : "⚪";
    lines.push("**Stablecoin Supply** (Ammunition Reserves)");
    for (const sc of ctx.stablecoins) {
        lines.push(`  ${sc.symbol} $${sc.circulatingB.toFixed(1)}B  ${sc.trendLabel}`);
    }
    // Total
    const total7 = ctx.totalStablecoin7dChangeB;
    const total30 = ctx.totalStablecoin30dChangeB;
    lines.push(`Total: 7d ${sign(total7)}${total7.toFixed(2)}B | 30d ${sign(total30)}${total30.toFixed(1)}B`);
    lines.push(`${signalEmoji} ${ctx.summary.split(".")[0]}`);
    // BTC Network
    if (ctx.btcNetwork) {
        const n = ctx.btcNetwork;
        lines.push(`\n**BTC Network Activity**`);
        lines.push(`  24h Txs: ${n.transactions24h.toLocaleString()} | On-chain Volume $${n.volumeB.toFixed(1)}B`);
        lines.push(`  ${n.networkLabel}`);
    }
    return lines.join("\n");
}
