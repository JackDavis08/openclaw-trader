/**
 * Paper Trading virtual account management
 * Uses real market prices, simulates buy/sell locally
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOGS_DIR = path.resolve(__dirname, "../../logs");
/** Returns account state file path based on scenario ID */
export function getAccountPath(scenarioId = "default") {
    // Replace colons with dashes for Windows compatibility (composite IDs like "account:scenario")
    const safeId = scenarioId.replace(/:/g, "-");
    return path.join(LOGS_DIR, `paper-${safeId}.json`);
}
function generateId() {
    return `P${Date.now().toString(36).toUpperCase()}`;
}
function todayStr() {
    return new Date().toISOString().slice(0, 10);
}
export function loadAccount(initialUsdt = 1000, scenarioId = "default") {
    const statePath = getAccountPath(scenarioId);
    try {
        const account = JSON.parse(fs.readFileSync(statePath, "utf-8"));
        // Guard: basic field validation, prevent corrupted file from causing NaN downstream
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard for corrupted JSON
        if (typeof account.usdt !== "number" || typeof account.positions !== "object" || account.positions === null) {
            throw new Error(`Invalid account state: ${statePath}`);
        }
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (!account.dailyLoss) {
            // Backward compatibility for old account files (missing dailyLoss field)
            account.dailyLoss = { date: todayStr(), loss: 0 };
        }
        if (!account.initialUsdt || account.initialUsdt <= 0) {
            // Backward compatibility for old account files (missing initialUsdt field), prevent NaN in PnL calculation
            account.initialUsdt = initialUsdt;
        }
        return account;
    }
    catch (_e) {
        const account = {
            initialUsdt,
            usdt: initialUsdt,
            positions: {},
            trades: [],
            createdAt: Date.now(),
            updatedAt: Date.now(),
            dailyLoss: { date: todayStr(), loss: 0 },
        };
        saveAccount(account, scenarioId);
        return account;
    }
}
export function saveAccount(account, scenarioId = "default") {
    const statePath = getAccountPath(scenarioId);
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    account.updatedAt = Date.now();
    // Atomic write: write to .tmp first then rename, prevent corruption from concurrent writes
    const tmpPath = statePath + ".tmp";
    fs.writeFileSync(tmpPath, JSON.stringify(account, null, 2));
    fs.renameSync(tmpPath, statePath);
}
/** Reset daily loss counter (auto-triggered on first call each day) */
export function resetDailyLossIfNeeded(account) {
    const today = todayStr();
    if (account.dailyLoss.date !== today) {
        account.dailyLoss = { date: today, loss: 0 };
    }
}
/**
 * Simulated buy
 */
export function paperBuy(account, symbol, price, reason, opts = {}) {
    const { positionRatio = 0.2, overridePositionUsdt, feeRate = 0.001, slippagePercent = 0.05, minOrderUsdt = 10, stopLossPercent = 5, takeProfitPercent = 15, } = opts;
    if (account.positions[symbol])
        return null;
    const totalEquity = calcTotalEquity(account, { [symbol]: price });
    const usdtToSpend = overridePositionUsdt ?? totalEquity * positionRatio;
    if (usdtToSpend < minOrderUsdt || usdtToSpend > account.usdt)
        return null;
    // Slippage: buy execution price is slightly higher than current price (adverse slippage)
    // Only simulated by raising execPrice, slippageUsdt is not deducted separately (avoid double counting)
    const slippageAmount = (price * slippagePercent) / 100;
    const execPrice = price + slippageAmount;
    const slippageUsdt = usdtToSpend * (slippagePercent / 100); // For trade record only, not deducted separately
    const fee = usdtToSpend * feeRate;
    const actualUsdt = usdtToSpend - fee; // execPrice already includes slippage, no extra deduction needed
    const quantity = actualUsdt / execPrice;
    // Calculate stop loss / take profit prices
    const stopLossPrice = execPrice * (1 - stopLossPercent / 100);
    const takeProfitPrice = execPrice * (1 + takeProfitPercent / 100);
    account.usdt -= usdtToSpend;
    account.positions[symbol] = {
        symbol,
        side: "long",
        quantity,
        entryPrice: execPrice,
        entryTime: Date.now(),
        stopLoss: stopLossPrice,
        takeProfit: takeProfitPrice,
    };
    const trade = {
        id: generateId(),
        symbol,
        side: "buy",
        quantity,
        price: execPrice,
        usdtAmount: usdtToSpend,
        fee,
        slippage: slippageUsdt,
        timestamp: Date.now(),
        reason,
    };
    account.trades.push(trade);
    return trade;
}
/**
 * DCA add buy: add to an existing long position
 *
 * Differs from paperBuy():
 * - Allows an existing position (designed for DCA additions)
 * - New quantity added to position, entryPrice recalculated as weighted average
 * - Stop loss stays at original level (does not move down with additions, avoids deepening losses)
 */
export function paperDcaAdd(account, symbol, price, reason, opts = { addUsdt: 0 }) {
    const pos = account.positions[symbol];
    if (!pos || pos.side === "short")
        return null; // Only add to long positions
    const { addUsdt, feeRate = 0.001, slippagePercent = 0.05 } = opts;
    if (addUsdt < 1 || addUsdt > account.usdt)
        return null;
    const slippageAmount = (price * slippagePercent) / 100;
    const execPrice = price + slippageAmount;
    if (!isFinite(execPrice) || execPrice <= 0)
        return null; // Guard: invalid price
    const slippageUsdt = addUsdt * (slippagePercent / 100);
    const fee = addUsdt * feeRate;
    const netUsdt = addUsdt - fee;
    const addQty = netUsdt / execPrice;
    // Weighted average price: (old position value + new position value) / total quantity
    const totalQty = pos.quantity + addQty;
    if (totalQty <= 0)
        return null; // Guard: zero total quantity
    const weightedAvgPrice = (pos.quantity * pos.entryPrice + addQty * execPrice) / totalQty;
    account.usdt -= addUsdt;
    // Calculate updated DCA state (computed before spread, written together into new object)
    const updatedDcaState = pos.dcaState
        ? {
            ...pos.dcaState,
            completedTranches: pos.dcaState.completedTranches + 1,
            lastTranchePrice: execPrice,
        }
        : undefined;
    // Update position: quantity increased, avg price recalculated, stop loss unchanged, DCA state synced
    account.positions[symbol] = {
        ...pos,
        quantity: totalQty,
        entryPrice: weightedAvgPrice,
        ...(updatedDcaState !== undefined && { dcaState: updatedDcaState }),
    };
    const trade = {
        id: generateId(),
        symbol,
        side: "buy",
        quantity: addQty,
        price: execPrice,
        usdtAmount: addUsdt,
        fee,
        slippage: slippageUsdt,
        timestamp: Date.now(),
        reason,
    };
    account.trades.push(trade);
    return trade;
}
/**
 * Simulated sell (supports full or partial close)
 * @param opts.overrideQty If set, only close this quantity (used for staged take profit); otherwise close entire position
 */
export function paperSell(account, symbol, price, reason, opts = {}) {
    const { feeRate = 0.001, slippagePercent = 0.05, overrideQty } = opts;
    const position = account.positions[symbol];
    if (!position)
        return null;
    // Partial close quantity (capped at actual position size)
    const sellQty = overrideQty && overrideQty > 0
        ? Math.min(overrideQty, position.quantity)
        : position.quantity;
    if (sellQty <= 0)
        return null; // Prevent division by zero when overrideQty=0
    const isPartial = sellQty < position.quantity;
    // Slippage: sell execution price is slightly lower than current price
    const slippageAmount = (price * slippagePercent) / 100;
    const execPrice = price - slippageAmount;
    const grossUsdt = sellQty * execPrice;
    const fee = grossUsdt * feeRate;
    const slippageUsdt = sellQty * slippageAmount;
    const netUsdt = grossUsdt - fee;
    const costBasis = sellQty * position.entryPrice;
    const pnl = netUsdt - costBasis;
    const pnlPercent = costBasis > 0 ? pnl / costBasis : 0;
    // Update daily loss
    if (pnl < 0) {
        account.dailyLoss.loss += Math.abs(pnl);
    }
    account.usdt += netUsdt;
    if (isPartial) {
        // Partial close: update remaining position quantity
        position.quantity -= sellQty;
    }
    else {
        // Full exit: delete position
        Reflect.deleteProperty(account.positions, symbol);
    }
    const trade = {
        id: generateId(),
        symbol,
        side: "sell",
        quantity: sellQty,
        price: execPrice,
        usdtAmount: netUsdt,
        fee,
        slippage: slippageUsdt,
        timestamp: Date.now(),
        reason,
        pnl,
        pnlPercent,
    };
    account.trades.push(trade);
    return trade;
}
/**
 * Simulated open short
 * Lock margin = positionRatio x equity (or overridePositionUsdt)
 * Virtual "borrow and sell", buy back on close, difference is PnL
 * Only valid on futures / margin markets
 */
export function paperOpenShort(account, symbol, price, reason, opts = {}) {
    const { positionRatio = 0.2, overridePositionUsdt, feeRate = 0.001, slippagePercent = 0.05, minOrderUsdt = 10, stopLossPercent = 5, takeProfitPercent = 15, } = opts;
    if (account.positions[symbol])
        return null; // Already has a position for this symbol (regardless of direction)
    const equity = calcTotalEquity(account, { [symbol]: price });
    const marginToLock = overridePositionUsdt ?? equity * positionRatio;
    if (marginToLock < minOrderUsdt || marginToLock > account.usdt)
        return null;
    // Short entry: sell slippage causes execution price to be slightly lower (adverse for short side)
    const slippageAmount = (price * slippagePercent) / 100;
    const execPrice = price - slippageAmount;
    const fee = marginToLock * feeRate;
    const actualMargin = marginToLock - fee; // Net margin (after fees)
    const quantity = actualMargin / execPrice; // Quantity of borrowed coins to sell
    // Short stop loss / take profit directions are reversed from long
    const stopLossPrice = execPrice * (1 + stopLossPercent / 100); // Price rise = loss
    const takeProfitPrice = execPrice * (1 - takeProfitPercent / 100); // Price drop = profit
    account.usdt -= marginToLock; // Lock margin
    account.positions[symbol] = {
        symbol,
        side: "short",
        quantity,
        entryPrice: execPrice,
        entryTime: Date.now(),
        stopLoss: stopLossPrice,
        takeProfit: takeProfitPrice,
        marginUsdt: actualMargin,
    };
    const trade = {
        id: generateId(),
        symbol,
        side: "short",
        quantity,
        price: execPrice,
        usdtAmount: marginToLock,
        fee,
        slippage: quantity * slippageAmount,
        timestamp: Date.now(),
        reason,
    };
    account.trades.push(trade);
    return trade;
}
/**
 * Simulated cover short (buy back borrowed coins)
 * pnl = (entryPrice - coverPrice) x quantity - coverFee
 * Returns margin + pnl to account.usdt
 */
export function paperCoverShort(account, symbol, price, reason, opts = {}) {
    const { feeRate = 0.001, slippagePercent = 0.05, overrideQty } = opts;
    const position = account.positions[symbol];
    if (position?.side !== "short")
        return null;
    // Cover short buy: slippage causes execution price to be slightly higher (adverse for buyer)
    const slippageAmount = (price * slippagePercent) / 100;
    const execPrice = price + slippageAmount;
    const { entryPrice } = position;
    // Partial cover support
    const coverQty = overrideQty && overrideQty > 0
        ? Math.min(overrideQty, position.quantity)
        : position.quantity;
    const isPartial = coverQty < position.quantity;
    const marginUsdt = position.marginUsdt ?? position.quantity * entryPrice;
    const coverMargin = isPartial ? marginUsdt * (coverQty / position.quantity) : marginUsdt;
    const grossUsdt = coverQty * execPrice; // Cost to buy back
    const fee = grossUsdt * feeRate;
    const pnl = (entryPrice - execPrice) * coverQty - fee; // Positive=profit, negative=loss
    const pnlPercent = coverMargin > 0 ? pnl / coverMargin : 0;
    // Protection: lose at most the margin (no negative balance)
    const returnAmount = Math.max(0, coverMargin + pnl);
    if (pnl < 0) {
        account.dailyLoss.loss += Math.abs(pnl);
    }
    account.usdt += returnAmount;
    if (isPartial) {
        position.quantity -= coverQty;
        if (position.marginUsdt !== undefined) {
            position.marginUsdt -= coverMargin;
        }
    }
    else {
        Reflect.deleteProperty(account.positions, symbol);
    }
    const trade = {
        id: generateId(),
        symbol,
        side: "cover",
        quantity: coverQty,
        price: execPrice,
        usdtAmount: returnAmount,
        fee,
        slippage: coverQty * slippageAmount,
        timestamp: Date.now(),
        reason,
        pnl,
        pnlPercent,
    };
    account.trades.push(trade);
    return trade;
}
/**
 * Update trailing stop price (called on each price update)
 * - Long: tracks highest price, triggers on callbackPercent retracement from peak
 * - Short: tracks lowest price, triggers on callbackPercent bounce from trough
 * @returns Whether stop loss exit should be triggered
 */
export function updateTrailingStop(position, currentPrice, opts) {
    const { activationPercent, callbackPercent } = opts;
    const isShort = position.side === "short";
    const ts = (position.trailingStop ??= isShort
        ? { active: false, highestPrice: position.entryPrice, lowestPrice: position.entryPrice, stopPrice: 0 }
        : { active: false, highestPrice: position.entryPrice, stopPrice: 0 });
    if (isShort) {
        // ── Short trailing stop: track lowest price, close on bounce from low ──
        ts.lowestPrice ??= position.entryPrice;
        if (currentPrice < ts.lowestPrice)
            ts.lowestPrice = currentPrice;
        // Profit percentage = magnitude of price drop from entry
        const lowestPrice = ts.lowestPrice; // narrow to number for TS
        const gainPercent = ((position.entryPrice - lowestPrice) / position.entryPrice) * 100;
        if (!ts.active && gainPercent >= activationPercent)
            ts.active = true;
        if (ts.active) {
            ts.stopPrice = lowestPrice * (1 + callbackPercent / 100);
            // Price bounced from low beyond callback threshold, trigger close
            if (currentPrice >= ts.stopPrice)
                return true;
        }
    }
    else {
        // ── Long trailing stop: track highest price, close on drop from high ──
        if (currentPrice > ts.highestPrice)
            ts.highestPrice = currentPrice;
        const gainPercent = ((ts.highestPrice - position.entryPrice) / position.entryPrice) * 100;
        if (!ts.active && gainPercent >= activationPercent)
            ts.active = true;
        if (ts.active) {
            ts.stopPrice = ts.highestPrice * (1 - callbackPercent / 100);
            if (currentPrice <= ts.stopPrice)
                return true;
        }
    }
    return false;
}
/**
 * Calculate total equity (USDT + position market value)
 * - Long: equity += quantity x currentPrice
 * - Short: equity += marginUsdt + (entryPrice - currentPrice) x quantity
 */
export function calcTotalEquity(account, prices) {
    let equity = account.usdt;
    for (const [symbol, pos] of Object.entries(account.positions)) {
        const price = prices[symbol];
        if (!price)
            continue;
        if (pos.side === "short") {
            // Short: locked margin + unrealized PnL
            const margin = pos.marginUsdt ?? pos.quantity * pos.entryPrice;
            const unrealizedPnl = (pos.entryPrice - price) * pos.quantity;
            equity += margin + unrealizedPnl;
        }
        else {
            // Long: position market value
            equity += pos.quantity * price;
        }
    }
    return equity;
}
/**
 * Account summary (supports both long and short positions)
 */
export function getAccountSummary(account, prices) {
    const totalEquity = calcTotalEquity(account, prices);
    const totalPnl = totalEquity - account.initialUsdt;
    const totalPnlPercent = totalPnl / account.initialUsdt;
    const positions = Object.values(account.positions).map((pos) => {
        const currentPrice = prices[pos.symbol] ?? pos.entryPrice;
        const side = pos.side ?? "long";
        let unrealizedPnl;
        let costBasis;
        if (side === "short") {
            const margin = pos.marginUsdt ?? pos.quantity * pos.entryPrice;
            unrealizedPnl = (pos.entryPrice - currentPrice) * pos.quantity;
            costBasis = margin;
        }
        else {
            const currentValue = pos.quantity * currentPrice;
            costBasis = pos.quantity * pos.entryPrice;
            unrealizedPnl = currentValue - costBasis;
        }
        return {
            symbol: pos.symbol,
            side,
            quantity: pos.quantity,
            entryPrice: pos.entryPrice,
            currentPrice,
            unrealizedPnl,
            unrealizedPnlPercent: costBasis > 0 ? unrealizedPnl / costBasis : 0,
            stopLoss: pos.stopLoss,
            takeProfit: pos.takeProfit,
        };
    });
    // Closed trades: sell (close long) + cover (close short)
    const closedTrades = account.trades.filter((t) => (t.side === "sell" || t.side === "cover") && t.pnl !== undefined);
    const winners = closedTrades.filter((t) => (t.pnl ?? 0) > 0).length;
    const winRate = closedTrades.length > 0 ? winners / closedTrades.length : 0;
    return {
        usdt: account.usdt,
        totalEquity,
        totalPnl,
        totalPnlPercent,
        positions,
        tradeCount: account.trades.length,
        winRate,
        dailyLoss: account.dailyLoss.loss,
    };
}
// ─────────────────────────────────────────────────────
// F5: Order state machine helper functions
// ─────────────────────────────────────────────────────
/**
 * Register a new pending order to the account state table
 */
export function registerOrder(account, order) {
    account.openOrders ??= {};
    account.openOrders[order.orderId] = { ...order, status: "pending" };
}
/**
 * Confirm order fill (full or partial), and remove or update in openOrders
 */
export function confirmOrder(account, orderId, filledQty, requestedQty) {
    if (!account.openOrders?.[orderId])
        return "not_found";
    const status = filledQty >= requestedQty * 0.999 ? "filled" : "partial";
    account.openOrders[orderId] = { ...account.openOrders[orderId], filledQty, status };
    // Completed orders are retained for audit, eventually cleaned up by scanOpenOrders
    return status;
}
/**
 * Mark order as cancelled and remove from openOrders
 */
export function cancelOrder(account, orderId) {
    if (!account.openOrders)
        return;
    Reflect.deleteProperty(account.openOrders, orderId);
}
/**
 * Return all timed-out unconfirmed pending orders (orphan orders)
 */
export function getTimedOutOrders(account) {
    if (!account.openOrders)
        return [];
    const now = Date.now();
    return Object.values(account.openOrders).filter((o) => o.status === "pending" && now - o.placedAt > o.timeoutMs);
}
/**
 * Clean up completed/cancelled orders (keep pending and partial)
 */
export function cleanupOrders(account) {
    if (!account.openOrders)
        return;
    for (const [id, order] of Object.entries(account.openOrders)) {
        if (order.status === "filled" || order.status === "cancelled") {
            Reflect.deleteProperty(account.openOrders, id);
        }
    }
}
