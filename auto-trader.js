/**
 * OpenClaw Trader Pro v3.4 - 短期套利策略
 */
const crypto = require("crypto");
const https = require("https");
const fs = require("fs");
const path = require("path");

const FUTURES_CREDS = {
  apiKey: "rLS9djClUheJUJcqkUFGOylwCuSk1wVkdJMoHXN2TgfswhjBCsOPvh0202vBhAAN",
  secretKey: "EMu9DnZL7DSodz7dSkkSslVC9AtzUGQgQH4a4b9g19CysZdPO73udtnt1gTZjF7Y",
};

const SYMBOLS = [
  "BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "XRPUSDT",
  "ADAUSDT", "DOGEUSDT", "AVAXUSDT", "DOTUSDT", "MATICUSDT",
  "LINKUSDT", "UNIUSDT", "ATOMUSDT", "FILUSDT", "TRXUSDT"
];
const SMALL_CAP_SYMBOLS = ["LINKUSDT", "UNIUSDT", "ATOMUSDT", "FILUSDT", "TRXUSDT"];

const TREND_TF = "15m";
const ENTRY_TF = "5m";
const RSI_PERIOD = 14;
const RSI_OVERSOLD = 35;
const RSI_OVERBOUGHT = 65;
const EMA_FAST = 9;
const EMA_SLOW = 21;
const BB_PERIOD = 20;
const BB_STD = 2;
const ATR_PERIOD = 14;

const STOP_LOSS_PCT = 0.005;
const TAKE_PROFIT_PCT = 0.02;
const POSITION_RATIO = 0.20;
const MAX_POSITIONS = 5;
const MAX_HOLD_MINUTES = 30;
const MIN_VOLATILITY = 0.005;
const SMALL_CAP_MIN_VOL = 0.008;

const STEP_SIZE = {
  BTCUSDT: 0.001, ETHUSDT: 0.001, BNBUSDT: 0.001, SOLUSDT: 0.01,
  XRPUSDT: 0.1, ADAUSDT: 1, DOGEUSDT: 1, LTCUSDT: 0.001,
  LINKUSDT: 0.01, UNIUSDT: 0.01, AVAXUSDT: 0.01, DOTUSDT: 0.01,
  MATICUSDT: 1, ATOMUSDT: 0.01, FILUSDT: 0.01, XLMUSDT: 1, TRXUSDT: 1
};

function truncateToStep(n, step) {
  return Math.floor(n / step) * step;
}

async function syncStateToDashboard(balance, positions) {
  try {
    const state = { updatedAt: Date.now(), balance, positions: {} };
    for (const p of positions) {
      const amt = parseFloat(p.positionAmt);
      if (amt === 0) continue;
      state.positions[p.symbol] = {
        side: amt > 0 ? "long" : "short",
        qty: Math.abs(amt),
        entryPrice: parseFloat(p.entryPrice),
        entryTime: parseInt(p.updateTime) || Date.now() - 3600000,
        currentPrice: parseFloat(p.markPrice || p.entryPrice),
        unrealizedPnl: parseFloat(p.unRealizedProfit || "0"),
      };
    }
    fs.mkdirSync("./state", { recursive: true });
    fs.writeFileSync(path.join("./state", "aggressive-futures-3x.json"), JSON.stringify(state, null, 2));
  } catch (e) { console.log("State sync error: " + e.message); }
}

function apiRequest(host, apiPath, apiKey, secretKey, params) {
  return new Promise((resolve, reject) => {
    const timestamp = Date.now();
    const qp = Object.assign({}, params, { timestamp: String(timestamp) });
    const query = Object.entries(qp).map(([k, v]) => k + "=" + encodeURIComponent(v)).join("&");
    const sig = crypto.createHmac("sha256", secretKey).update(query).digest("hex");
    const opts = { hostname: host, path: apiPath + "?" + query + "&signature=" + sig, method: "GET", headers: { "X-MBX-APIKEY": apiKey } };
    const req = https.request(opts, (res) => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => { try { resolve(JSON.parse(data)); } catch { resolve(data); } });
    });
    req.on("error", reject);
    req.end();
  });
}

async function getKlines(symbol, interval, limit) {
  return apiRequest("testnet.binancefuture.com", "/fapi/v1/klines", FUTURES_CREDS.apiKey, FUTURES_CREDS.secretKey, { symbol, interval, limit: String(limit) });
}

async function getBalance() {
  const data = await apiRequest("testnet.binancefuture.com", "/fapi/v2/balance", FUTURES_CREDS.apiKey, FUTURES_CREDS.secretKey);
  const usdt = data.find(a => a.asset === "USDT");
  return usdt ? parseFloat(usdt.availableBalance) : 0;
}

async function getPositions() {
  const data = await apiRequest("testnet.binancefuture.com", "/fapi/v2/positionRisk", FUTURES_CREDS.apiKey, FUTURES_CREDS.secretKey);
  return data.filter(p => parseFloat(p.positionAmt) !== 0);
}

async function setLeverage(symbol, leverage) {
  return apiRequest("testnet.binancefuture.com", "/fapi/v1/leverage", FUTURES_CREDS.apiKey, FUTURES_CREDS.secretKey, { symbol, leverage: String(leverage) });
}

async function placeOrder(symbol, side, positionSide, quantity) {
  await setLeverage(symbol, 3);
  return apiRequest("testnet.binancefuture.com", "/fapi/v1/order", FUTURES_CREDS.apiKey, FUTURES_CREDS.secretKey, { symbol, side, positionSide, type: "MARKET", quantity: String(quantity) });
}

async function cancelAllOpenOrders(symbol) {
  return apiRequest("testnet.binancefuture.com", "/fapi/v1/allOpenOrders", FUTURES_CREDS.apiKey, FUTURES_CREDS.secretKey, { symbol });
}

function calcEMA(closes, period) {
  if (closes.length < period) return closes[closes.length - 1];
  const k = 2 / (period + 1);
  let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < closes.length; i++) ema = closes[i] * k + ema * (1 - k);
  return ema;
}

function calcRSI(closes, period) {
  if (closes.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff; else losses += Math.abs(diff);
  }
  const avgGain = gains / period, avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

function calcBollingerBands(closes, period, stdDev) {
  const slice = closes.slice(-period);
  const middle = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((sum, v) => sum + Math.pow(v - middle, 2), 0) / period;
  const std = Math.sqrt(variance);
  return { upper: middle + stdDev * std, middle, lower: middle - stdDev * std };
}

function calcATR(klines, period) {
  const trs = [];
  for (let i = 1; i < klines.length; i++) {
    const high = parseFloat(klines[i][2]);
    const low = parseFloat(klines[i][3]);
    const prevClose = parseFloat(klines[i - 1][4]);
    trs.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
  }
  if (trs.length < period) return trs[trs.length - 1] || 0;
  return trs.slice(-period).reduce((a, b) => a + b, 0) / period;
}

function detectCandlePattern(klines) {
  if (klines.length < 3) return null;
  const getC = (i) => ({ open: parseFloat(klines[i][1]), high: parseFloat(klines[i][2]), low: parseFloat(klines[i][3]), close: parseFloat(klines[i][4]), body: Math.abs(parseFloat(klines[i][4]) - parseFloat(klines[i][1])) });
  const c1 = getC(klines.length - 3);
  const c2 = getC(klines.length - 2);
  const c3 = getC(klines.length - 1);
  
  if (c3.low < c3.open && c3.low < c3.close && (c3.open - c3.low) > 2 * c3.body && (c3.high - Math.max(c3.open, c3.close)) < c3.body * 0.3) {
    return { bullish: true, pattern: "锤子线", strength: 3 };
  }
  if (c2.body > 0 && c1.body > 0 && c1.close < c1.open && c2.close > c2.open && c2.close > c1.open && c2.open < c1.close) {
    return { bullish: true, pattern: "看涨吞没", strength: 4 };
  }
  if (c3.high > c3.open && c3.high > c3.close && (c3.high - Math.max(c3.open, c3.close)) > 2 * c3.body && (Math.min(c3.open, c3.close) - c3.low) < c3.body * 0.3) {
    return { bullish: false, pattern: "射击星", strength: 3 };
  }
  if (c1.close > c1.open && c2.close < c2.open && c2.close < c1.open && c2.open > c1.close) {
    return { bullish: false, pattern: "看跌吞没", strength: 4 };
  }
  return null;
}

function calcVolatility(klines) {
  if (klines.length < 14) return 0;
  const closes = klines.map(k => parseFloat(k[4]));
  const returns = [];
  for (let i = 1; i < closes.length; i++) returns.push((closes[i] - closes[i-1]) / closes[i-1]);
  if (returns.length < 14) return 0;
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
  return Math.sqrt(variance * 100);
}

async function getTrend(symbol) {
  const klines = await getKlines(symbol, TREND_TF, 50);
  const closes = klines.map(k => parseFloat(k[4]));
  const emaFast = calcEMA(closes, EMA_FAST);
  const emaSlow = calcEMA(closes, EMA_SLOW);
  return { trend: emaFast > emaSlow ? "UP" : "DOWN", emaFast, emaSlow };
}

async function getEntrySignal(symbol) {
  const klines = await getKlines(symbol, ENTRY_TF, 100);
  const closes = klines.map(k => parseFloat(k[4]));
  const latestClose = closes[closes.length - 1];
  const rsi = calcRSI(closes, RSI_PERIOD);
  const bb = calcBollingerBands(closes, BB_PERIOD, BB_STD);
  const atr = calcATR(klines, ATR_PERIOD);
  const pattern = detectCandlePattern(klines);
  const volatility = calcVolatility(klines);
  return { price: latestClose, rsi, bb, atr, pattern, volatility };
}

async function analyzeSymbol(symbol, balance, positions) {
  const pos = positions.find(p => p.symbol === symbol);
  const posAmt = pos ? parseFloat(pos.positionAmt) : 0;
  const posSide = posAmt > 0 ? "LONG" : posAmt < 0 ? "SHORT" : null;
  
  const trend = await getTrend(symbol);
  const entry = await getEntrySignal(symbol);
  const { price, rsi, bb, atr, pattern, volatility } = entry;
  const { trend: trendDir } = trend;
  
  const minVol = SMALL_CAP_SYMBOLS.includes(symbol) ? SMALL_CAP_MIN_VOL : MIN_VOLATILITY;
  
  if (posSide === "LONG" && pos) {
    const entryPrice = parseFloat(pos.entryPrice);
    const pnlPct = (price - entryPrice) / entryPrice * 100;
    const entryTime = parseInt(pos.updateTime) || Date.now() - 1800000;
    const holdMinutes = (Date.now() - entryTime) / 60000;
    if (holdMinutes >= MAX_HOLD_MINUTES) return { action: "CLOSE_LONG", qty: posAmt, reason: "超时" + holdMinutes.toFixed(0) + "分钟", price };
    if (pnlPct >= TAKE_PROFIT_PCT * 100) return { action: "CLOSE_LONG", qty: posAmt, reason: "止盈 " + pnlPct.toFixed(2) + "%", price };
    if (pnlPct <= -STOP_LOSS_PCT * 100) return { action: "CLOSE_LONG", qty: posAmt, reason: "止损 " + pnlPct.toFixed(2) + "%", price };
  }
  
  if (posSide === "SHORT" && pos) {
    const entryPrice = parseFloat(pos.entryPrice);
    const pnlPct = (entryPrice - price) / entryPrice * 100;
    const entryTime = parseInt(pos.updateTime) || Date.now() - 1800000;
    const holdMinutes = (Date.now() - entryTime) / 60000;
    if (holdMinutes >= MAX_HOLD_MINUTES) return { action: "CLOSE_SHORT", qty: Math.abs(posAmt), reason: "超时" + holdMinutes.toFixed(0) + "分钟", price };
    if (pnlPct >= TAKE_PROFIT_PCT * 100) return { action: "CLOSE_SHORT", qty: Math.abs(posAmt), reason: "止盈 " + pnlPct.toFixed(2) + "%", price };
    if (pnlPct <= -STOP_LOSS_PCT * 100) return { action: "CLOSE_SHORT", qty: Math.abs(posAmt), reason: "止损 " + pnlPct.toFixed(2) + "%", price };
  }
  
  if (trendDir === "UP" && positions.length < MAX_POSITIONS) {
    if (rsi < RSI_OVERSOLD && price <= bb.lower * 1.01) {
      if (volatility < minVol) return { action: "HOLD", qty: 0, reason: "波动率" + volatility.toFixed(2) + "%<" + (minVol * 100).toFixed(1) + "%", price };
      let signalDesc = "RSI=" + rsi.toFixed(1) + " 触布林下轨";
      if (pattern && pattern.bullish) signalDesc += " " + pattern.pattern;
      return { action: "BUY_LONG", qty: 0, reason: signalDesc, price };
    }
  }
  
  if (trendDir === "DOWN" && positions.length < MAX_POSITIONS) {
    if (rsi > RSI_OVERBOUGHT && price >= bb.upper * 0.99) {
      if (volatility < minVol) return { action: "HOLD", qty: 0, reason: "波动率" + volatility.toFixed(2) + "%<" + (minVol * 100).toFixed(1) + "%", price };
      let signalDesc = "RSI=" + rsi.toFixed(1) + " 触布林上轨";
      if (pattern && !pattern.bullish) signalDesc += " " + pattern.pattern;
      return { action: "SELL_SHORT", qty: 0, reason: signalDesc, price };
    }
  }
  
  return { action: "HOLD", qty: 0, reason: "RSI=" + rsi.toFixed(1) + " EMA=" + trend.emaFast.toFixed(2) + "/" + trend.emaSlow.toFixed(2) + " " + trendDir, price };
}

async function runTradingCycle() {
  console.log("\n" + "=".repeat(60));
  console.log(new Date().toLocaleTimeString("zh-CN", { timeZone: "Asia/Shanghai" }) + " 扫描开始");
  console.log("=".repeat(60));
  
  try {
    const balance = await getBalance();
    const positions = await getPositions();
    console.log("Balance: $" + balance.toFixed(2) + " | Positions: " + positions.length + "/" + MAX_POSITIONS);
    
    for (const sym of SYMBOLS) {
      try {
        const analysis = await analyzeSymbol(sym, balance, positions);
        const { action, qty, reason, price } = analysis;
        
        if (action === "HOLD") {
          console.log("  " + sym + ": " + reason);
        } else {
          const pos = positions.find(p => p.symbol === sym);
          const posAmt = pos ? parseFloat(pos.positionAmt) : 0;
          
          if (action === "CLOSE_LONG") {
            await cancelAllOpenOrders(sym).catch(() => {});
            await placeOrder(sym, "SELL", "LONG", posAmt);
            console.log("  " + sym + ": 平多 @" + (price ? price.toFixed(4) : "?") + " | " + reason);
          } else if (action === "CLOSE_SHORT") {
            await cancelAllOpenOrders(sym).catch(() => {});
            await placeOrder(sym, "BUY", "SHORT", Math.abs(posAmt));
            console.log("  " + sym + ": 平空 @" + (price ? price.toFixed(4) : "?") + " | " + reason);
          } else if ((action === "BUY_LONG" || action === "SELL_SHORT") && positions.length < MAX_POSITIONS) {
            const step = STEP_SIZE[sym] || 0.001;
            const positionValue = balance * POSITION_RATIO;
            const tradeQty = truncateToStep(positionValue / price, step);
            if (tradeQty < step) continue;
            if (action === "BUY_LONG") {
              await placeOrder(sym, "BUY", "LONG", tradeQty);
              console.log("  " + sym + ": 开多 @$" + price.toFixed(4) + " | " + reason);
            } else {
              await placeOrder(sym, "SELL", "SHORT", tradeQty);
              console.log("  " + sym + ": 开空 @$" + price.toFixed(4) + " | " + reason);
            }
          }
        }
      } catch (e) {
        console.log("  " + sym + ": " + e.message);
      }
    }
    
    const newBalance = await getBalance();
    const newPositions = await getPositions();
    await syncStateToDashboard(newBalance, newPositions);
    console.log("扫描完成 | 下次15分钟后");
  } catch (e) {
    console.error("Cycle error: " + e.message);
  }
}

console.log("OpenClaw Trader v3.4 - 短期套利策略");
console.log("币种:" + SYMBOLS.length + " | RSI:" + RSI_OVERSOLD + "/" + RSI_OVERBOUGHT + " | EMA:" + EMA_FAST + "/" + EMA_SLOW);
console.log("止损:" + (STOP_LOSS_PCT * 100) + "% | 止盈:" + (TAKE_PROFIT_PCT * 100) + "% | 超时:" + MAX_HOLD_MINUTES + "分钟");

runTradingCycle();
setInterval(runTradingCycle, 15 * 60 * 1000);
