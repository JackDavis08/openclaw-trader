/**
 * Protection Manager (Freqtrade-inspired)
 *
 * Checks protection conditions based on recent trade records before opening positions:
 *   - CooldownPeriod:         This pair has stop-loss records within last N candles -> pause this pair
 *   - StoplossGuard:          Stop-loss count in lookback window >= limit -> global/per-pair pause
 *   - MaxDrawdownProtection:  Total pnlRatio in lookback window exceeds max drawdown limit -> global pause
 *   - LowProfitPairs:         This pair's avg pnlRatio in lookback window < required profit -> pause this pair
 *
 * Reference:
 *   freqtrade/plugins/protections/cooldown_period.py
 *   freqtrade/plugins/protections/stoploss_guard.py
 *   freqtrade/plugins/protections/max_drawdown_protection.py
 *   freqtrade/plugins/protections/low_profit_pairs.py
 */
// ─────────────────────────────────────────────────────
// Core Check Function
// ─────────────────────────────────────────────────────
/**
 * Check whether all protection conditions are met (all enabled protections must pass to allow opening)
 *
 * @param symbol            Symbol to open position for
 * @param config            Protection config
 * @param recentTrades      Recent closed trade records (sorted by closedAt ascending)
 * @param candleIntervalMs  Candle time interval (milliseconds), used to convert candle count to time range
 * @param now               Current time (milliseconds, defaults to Date.now(), injectable for testing)
 */
export function checkProtections(symbol, config, recentTrades, candleIntervalMs, now) {
    const currentTime = now ?? Date.now();
    // ── 1. CooldownPeriod ──────────────────────────────────
    const cooldown = config.cooldown;
    if (cooldown?.enabled) {
        const windowMs = cooldown.stop_duration_candles * candleIntervalMs;
        const windowStart = currentTime - windowMs;
        const pairStoplossTrades = recentTrades.filter((t) => t.symbol === symbol && t.wasStopLoss && t.closedAt >= windowStart);
        if (pairStoplossTrades.length > 0) {
            return {
                allowed: false,
                reason: `CooldownPeriod: ${symbol} has stop-loss records within last ${cooldown.stop_duration_candles} candles, cooling down`,
            };
        }
    }
    // ── 2. StoplossGuard ───────────────────────────────────
    const sg = config.stoploss_guard;
    if (sg?.enabled) {
        const windowMs = sg.lookback_period_candles * candleIntervalMs;
        const windowStart = currentTime - windowMs;
        const onlyPerPair = sg.only_per_pair === true;
        const stoplossTrades = recentTrades.filter((t) => {
            if (!t.wasStopLoss)
                return false;
            if (t.closedAt < windowStart)
                return false;
            if (onlyPerPair && t.symbol !== symbol)
                return false;
            return true;
        });
        if (stoplossTrades.length >= sg.trade_limit) {
            const scope = onlyPerPair ? `${symbol} ` : "global ";
            return {
                allowed: false,
                reason: `StoplossGuard: ${scope}had ${stoplossTrades.length} stop-losses within last ${sg.lookback_period_candles} candles (limit ${sg.trade_limit}), pausing`,
            };
        }
    }
    // ── 3. MaxDrawdownProtection ───────────────────────────
    const md = config.max_drawdown;
    if (md?.enabled) {
        const windowMs = md.lookback_period_candles * candleIntervalMs;
        const windowStart = currentTime - windowMs;
        const tradesInWindow = recentTrades.filter((t) => t.closedAt >= windowStart);
        if (tradesInWindow.length >= md.trade_limit) {
            const totalPnl = tradesInWindow.reduce((sum, t) => sum + t.pnlRatio, 0);
            // max_allowed_drawdown is typically negative (e.g. -0.15 = total loss exceeds 15%)
            const threshold = md.max_allowed_drawdown < 0
                ? md.max_allowed_drawdown
                : -md.max_allowed_drawdown; // Auto-convert to negative
            if (totalPnl <= threshold) {
                return {
                    allowed: false,
                    reason: `MaxDrawdown: total loss ${(totalPnl * 100).toFixed(1)}% within last ${md.lookback_period_candles} candles exceeds limit ${(threshold * 100).toFixed(1)}%, global pause`,
                };
            }
        }
    }
    // ── 4. LowProfitPairs ──────────────────────────────────
    const lp = config.low_profit_pairs;
    if (lp?.enabled) {
        const windowMs = lp.lookback_period_candles * candleIntervalMs;
        const windowStart = currentTime - windowMs;
        const pairTradesInWindow = recentTrades.filter((t) => t.symbol === symbol && t.closedAt >= windowStart);
        if (pairTradesInWindow.length >= lp.trade_limit) {
            const avgPnl = pairTradesInWindow.reduce((sum, t) => sum + t.pnlRatio, 0) / pairTradesInWindow.length;
            if (avgPnl < lp.required_profit) {
                return {
                    allowed: false,
                    reason: `LowProfitPairs: ${symbol} avg P&L ${(avgPnl * 100).toFixed(2)}% within last ${lp.lookback_period_candles} candles < required ${(lp.required_profit * 100).toFixed(2)}%, pausing this pair`,
                };
            }
        }
    }
    return { allowed: true };
}
// ─────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────
/**
 * Convert signal history records (signal-history.jsonl) format to TradeRecord[]
 * (for live mode reading recent trades from log files)
 */
export function parseTradeRecords(jsonLines, sinceMs) {
    const records = [];
    for (const line of jsonLines) {
        try {
            const entry = JSON.parse(line);
            if (entry.status === "closed" &&
                entry.symbol &&
                entry.closedAt !== undefined &&
                entry.closedAt >= sinceMs &&
                entry.pnlPercent !== undefined) {
                records.push({
                    symbol: entry.symbol,
                    closedAt: entry.closedAt,
                    pnlRatio: entry.pnlPercent / 100,
                    wasStopLoss: entry.exitReason === "stop_loss" ||
                        entry.exitReason === "trailing_stop",
                });
            }
        }
        catch {
            // Skip malformed lines
        }
    }
    return records;
}
