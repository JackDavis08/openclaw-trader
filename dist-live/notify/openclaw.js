import { spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
const OPENCLAW_BIN = process.env["OPENCLAW_BIN"] ?? "openclaw";
const GATEWAY_TOKEN = process.env["OPENCLAW_GATEWAY_TOKEN"] ?? "";
// ── Runtime notify channel config (set via configureNotify on startup) ────────
let _channel = process.env["NOTIFY_CHANNEL"] ?? "telegram";
let _target = process.env["NOTIFY_TARGET"] ?? "";
/**
 * Configure the notification delivery channel at runtime.
 * Call once during monitor startup (after loading RuntimeConfig).
 *
 * @param channel  "telegram" (default) | "qqbot" | "feishu"
 * @param target   Delivery target:
 *                 - telegram: Telegram chat_id (e.g. "6822969897")
 *                 - qqbot:    QQ c2c openid (e.g. "qqbot:c2c:XXXX")
 *                 - feishu:   Feishu open_id (e.g. "ou_XXXX")
 *                 If empty, falls back to openclaw system event routing.
 */
export function configureNotify(channel, target) {
    _channel = channel;
    _target = target;
}
// ── Cross-scenario notification dedup ────────────────────────────────────────
// When multiple scenarios run simultaneously, same symbol signals are sent only once (30-minute window)
const DEDUP_MINUTES = 30;
const DEDUP_PATH = path.resolve(fileURLToPath(import.meta.url), "../../..", "logs/signal-notify-dedup.json");
function readDedup() {
    try {
        return JSON.parse(fs.readFileSync(DEDUP_PATH, "utf-8"));
    }
    catch {
        return {};
    }
}
function shouldSendSignal(symbol, type) {
    const key = `${symbol}:${type}`;
    const last = readDedup()[key] ?? 0;
    return (Date.now() - last) / 60000 >= DEDUP_MINUTES;
}
function markSignalSent(symbol, type) {
    const state = readDedup();
    state[`${symbol}:${type}`] = Date.now();
    try {
        fs.mkdirSync(path.dirname(DEDUP_PATH), { recursive: true });
        fs.writeFileSync(DEDUP_PATH, JSON.stringify(state, null, 2));
    }
    catch { /* ignore write errors */ }
}
// ── notifyError cooldown (same context sent only once per 30 minutes) ────────────
const ERROR_COOLDOWN_MS = 30 * 60_000;
const _errorLastNotified = new Map();
/**
 * Send a message directly to a specific channel target.
 * Used when channel + target are explicitly configured.
 */
function sendDirectToChannel(text) {
    console.log(`[DEBUG] sendDirectToChannel called with channel=${_channel}, target=${_target}`);
    try {
        const args = [
            "message", "send",
            "--channel", _channel,
            "--target", _target,
            "--message", text,
        ];
        const env = { ...process.env };
        if (GATEWAY_TOKEN)
            env["OPENCLAW_GATEWAY_TOKEN"] = GATEWAY_TOKEN;
        const result = spawnSync(OPENCLAW_BIN, args, { encoding: "utf-8", timeout: 15000, env });
        if (result.status !== 0 && result.stderr) {
            console.error(`sendDirectToChannel(${_channel}) failed:`, result.stderr.slice(0, 200));
        }
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`sendDirectToChannel(${_channel}) failed:`, msg);
    }
}
/**
 * Deliver a message via the configured channel.
 * - If channel + target are set: send directly via `openclaw message send`
 * - Otherwise: inject as system event into the AI session (legacy behavior)
 */
function sendToAgent(message) {
    if (_target) {
        sendDirectToChannel(message);
        return;
    }
    // Fallback: inject into AI session (routes to Telegram by default)
    try {
        const args = ["system", "event", "--mode", "now", "--text", message];
        const env = { ...process.env };
        if (GATEWAY_TOKEN)
            env["OPENCLAW_GATEWAY_TOKEN"] = GATEWAY_TOKEN;
        const result = spawnSync(OPENCLAW_BIN, args, { encoding: "utf-8", timeout: 15000, env });
        if (result.status !== 0 && result.stderr) {
            console.error("sendToAgent failed:", result.stderr.slice(0, 200));
        }
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("sendToAgent failed:", msg);
    }
}
function formatPrice(price) {
    return price >= 1000
        ? `$${price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        : `$${price.toFixed(4)}`;
}
function formatPercent(value) {
    return `${(value * 100).toFixed(2)}%`;
}
/** General Telegram text message sender */
export function sendTelegramMessage(text) {
    sendToAgent(text);
}
/** Signal notification */
export function notifySignal(signal) {
    // Cross-scenario dedup: same symbol same direction signal sent only once per 30 minutes
    if (!shouldSendSignal(signal.symbol, signal.type))
        return;
    markSignalSent(signal.symbol, signal.type);
    const emoji = signal.type === "buy" ? "🟢" : signal.type === "short" ? "🔴" : signal.type === "sell" ? "🟡" : "🔵";
    const action = signal.type === "buy" ? "开多 Buy" : signal.type === "short" ? "开空 Short" : signal.type === "sell" ? "平多 Sell" : "平空 Cover";
    const { maShort, maLong, rsi } = signal.indicators;
    const msg = [
        `${emoji} **[信号] ${signal.symbol} ${action}**`,
        ``,
        `💰 Current Price: ${formatPrice(signal.price)}`,
        `📊 Indicators:`,
        `  • MA Short: ${maShort.toFixed(2)}`,
        `  • MA Long: ${maLong.toFixed(2)}`,
        `  • RSI: ${rsi.toFixed(1)}`,
        `📋 Triggered Rules: ${signal.reason.join(", ")}`,
        `🕐 Time: ${new Date(signal.timestamp).toLocaleString("en-US")}`,
        ``,
        `Execute this trade? Reply **Yes** or **No**.`,
    ].join("\n");
    sendToAgent(msg);
}
/** Trade execution notification */
export function notifyTrade(trade) {
    const emoji = trade.status === "filled" ? "✅" : "❌";
    const side = trade.side === "buy" ? "Buy" : "Sell";
    const msg = [
        `${emoji} **[Trade Execution] ${trade.symbol} ${side}**`,
        ``,
        `💰 Fill Price: ${formatPrice(trade.price)}`,
        `📦 Quantity: ${trade.quantity}`,
        `🔖 Order ID: ${trade.orderId}`,
        `📋 Status: ${trade.status === "filled" ? "Filled" : "Failed"}`,
        trade.error ? `❗ Error: ${trade.error}` : "",
        `🕐 Time: ${new Date(trade.timestamp).toLocaleString("en-US")}`,
    ]
        .filter(Boolean)
        .join("\n");
    sendToAgent(msg);
}
/** Stop-loss trigger notification */
export function notifyStopLoss(symbol, entryPrice, currentPrice, loss) {
    const msg = [
        `🚨 **[Stop-Loss Triggered] ${symbol}**`,
        ``,
        `📉 Entry Price: ${formatPrice(entryPrice)}`,
        `📉 Current Price: ${formatPrice(currentPrice)}`,
        `💸 Loss: ${formatPercent(loss)}`,
        `🕐 Time: ${new Date().toLocaleString("en-US")}`,
        ``,
        `Stop-loss sell executed automatically.`,
    ].join("\n");
    sendToAgent(msg);
}
/** Error notification (same context sent only once per 30 minutes, prevents continuous fault bombardment) */
export function notifyError(context, error) {
    const now = Date.now();
    const last = _errorLastNotified.get(context) ?? 0;
    if (now - last < ERROR_COOLDOWN_MS) {
        console.warn(`[notifyError] cooldown: ${context} (${Math.round((now - last) / 60000)}min ago)`);
        return;
    }
    _errorLastNotified.set(context, now);
    const msg = [
        `⚠️ **[Monitor Script Error]**`,
        ``,
        `📍 Location: ${context}`,
        `❗ Error: ${error.message}`,
        `🕐 Time: ${new Date().toLocaleString("en-US")}`,
    ].join("\n");
    sendToAgent(msg);
}
/** Paper trade notification */
export function notifyPaperTrade(trade, account) {
    // Accurately display long/short operation direction
    const side = trade.side === "buy" ? "Buy(OpenLong)" :
        trade.side === "short" ? "OpenShort" :
            trade.side === "cover" ? "CoverShort" :
                "Sell(CloseLong)";
    const emoji = trade.side === "buy" ? "🟢" :
        trade.side === "short" ? "🔵" :
            trade.side === "cover" ? "🟣" :
                "🔴";
    const pnlLine = trade.pnl !== undefined
        ? `💰 PnL: ${trade.pnl >= 0 ? "+" : ""}$${trade.pnl.toFixed(2)} (${trade.pnl >= 0 ? "+" : ""}${((trade.pnlPercent ?? 0) * 100).toFixed(2)}%)`
        : "";
    const msg = [
        `${emoji} **[Paper Trade] ${trade.symbol} ${side}**`,
        ``,
        `💲 Fill Price: $${trade.price.toFixed(4)}`,
        `📦 Quantity: ${trade.quantity.toFixed(6)}`,
        `💵 Amount: $${trade.usdtAmount.toFixed(2)} (incl. fee $${trade.fee.toFixed(3)})`,
        pnlLine,
        `📋 Reason: ${trade.reason}`,
        ``,
        `💼 Current Balance: $${account.usdt.toFixed(2)} USDT`,
        `🔖 Order ID: ${trade.id}`,
    ]
        .filter(Boolean)
        .join("\n");
    sendToAgent(msg);
}
/** News sentiment analysis report */
export function sendNewsReport(data) {
    const sentimentEmoji = data.sentiment === "bullish" ? "🟢 Bullish" : data.sentiment === "bearish" ? "🔴 Bearish" : "⚪ Neutral";
    const fgEmoji = data.fearGreed.value <= 25
        ? "😱"
        : data.fearGreed.value <= 45
            ? "😰"
            : data.fearGreed.value <= 55
                ? "😐"
                : data.fearGreed.value <= 75
                    ? "😏"
                    : "🤑";
    const totalMcap = (data.globalMarket.totalMarketCapUsd / 1e12).toFixed(2);
    const mcapChange = data.globalMarket.marketCapChangePercent24h.toFixed(2);
    const mcapEmoji = parseFloat(mcapChange) >= 0 ? "📈" : "📉";
    const lines = [
        `📰 **[Market Sentiment Report]** ${new Date().toLocaleString("en-US")}`,
        ``,
        `${fgEmoji} **Fear & Greed Index**: ${data.fearGreed.value}/100 (${data.fearGreed.label})`,
        `   ${data.fearGreedInterpret}`,
        data.fgAlert
            ? `   ⚠️ Index Change: ${data.fgDelta > 0 ? "+" : ""}${data.fgDelta} pts (significant change)`
            : "",
        ``,
        `${mcapEmoji} **Global Market Cap**: $${totalMcap}T (24h: ${mcapChange}%)`,
        `🔶 **BTC Dominance**: ${data.globalMarket.btcDominance.toFixed(1)}%`,
        ``,
        `**Overall Sentiment**: ${sentimentEmoji}`,
    ];
    if (data.bigMovers.length > 0) {
        lines.push(``, `🚀 **Price Movers (24h ±5%)**:`);
        for (const m of data.bigMovers) {
            const arrow = m.priceChangePercent >= 0 ? "🟢" : "🔴";
            lines.push(`  ${arrow} ${m.symbol}: ${m.priceChangePercent > 0 ? "+" : ""}${m.priceChangePercent.toFixed(2)}%`);
        }
    }
    if (data.importantNews.length > 0) {
        lines.push(``, `📋 **Important News** (${data.importantNews.length}):`);
        for (const n of data.importantNews.slice(0, 5)) {
            lines.push(`  • ${n.title}`);
            lines.push(`    _${n.source}_`);
        }
    }
    const msg = lines.filter((l) => l !== "").join("\n");
    sendToAgent(msg);
}
/** Periodic status report */
export function notifyStatus(summary) {
    const rows = summary
        .map((s) => `  ${s.symbol.padEnd(10)} ${formatPrice(s.price).padStart(12)}  RSI:${s.rsi.toFixed(0).padStart(3)}  ${s.trend}`)
        .join("\n");
    const msg = [`📊 **[Market Status Report]** ${new Date().toLocaleString("en-US")}`, ``, rows].join("\n");
    sendToAgent(msg);
}
