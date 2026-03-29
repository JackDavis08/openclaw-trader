/**
 * OpenClaw Trader Pro v3.6 - 优化版策略
 * 核心：4:1盈亏比，ATR动态止损，成交量确认，分批止盈
 * 更新：RSI 30/70，ATR止损，成交量确认，趋势强度过滤
 */
import crypto from "crypto";
import https from "https";
import fs from "fs";
import path from "path";

// ============ 配置 ============
const FUTURES_CREDS = {
  apiKey: "rLS9djClUheJUJcqkUFGOylwCuSk1wVkdJMoHXN2TgfswhjBCsOPvh0202vBhAAN",
  secretKey: "EMu9DnZL7DSodz7dSkkSslVC9AtzUGQgQH4a4b9g19CysZdPO73udtnt1gTZjF7Y",
};

// ============ 策略参数 v3.4 ============
const SYMBOLS = [
  "BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "XRPUSDT",
  "ADAUSDT", "DOGEUSDT", "AVAXUSDT", "DOTUSDT", "MATICUSDT",
  "LINKUSDT", "UNIUSDT", "ATOMUSDT", "FILUSDT", "TRXUSDT"
];

// 小币（更严格风控）
const SMALL_CAP_SYMBOLS = ["LINKUSDT", "UNIUSDT", "ATOMUSDT", "FILUSDT", "TRXUSDT"];

const TREND_TF = "15m";
const ENTRY_TF = "5m";
const RSI_PERIOD = 14;
const RSI_OVERSOLD = 30;      // v3.6: 更宽松 35→30
const RSI_OVERBOUGHT = 70;     // v3.6: 更宽松 65→70
const EMA_FAST = 9;
const EMA_SLOW = 21;
const BB_PERIOD = 20;
const BB_STD = 2;
const ATR_PERIOD = 14;

// v3.6: ATR动态止损
const ATR_STOP_MULT = 1.5;      // ATR倍数止损 v3.6
const ATR_TP1 = 1.5;           // ATR倍数第一止盈 v3.6
const ATR_TP2 = 2.5;           // ATR倍数第二止盈 v3.6

// 旧参数（保留兼容）
const STOP_LOSS_PCT = 0.005;   // 止损0.5%
const TAKE_PROFIT_PCT = 0.02;   // 止盈2%

const POSITION_RATIO = 0.30;     // 30% (v3.5更新)
const MAX_POSITIONS = 5;
const MAX_HOLD_MINUTES = 30;    // 30分钟

// 波动率过滤
const MIN_VOLATILITY = 0.005;   // 0.5%
const SMALL_CAP_MIN_VOL = 0.008; // 小币0.8%

// v3.6: 趋势强度和成交量
const TREND_STRENGTH_THRESHOLD = 0.005;  // EMA差距>0.5%才算趋势明确
const VOLUME_CONFIRMATION = 1.5;          // 成交量需>均量1.5倍
const SCENARIO_ID = "aggressive-futures-3x";
const STATE_DIR = "C:/Users/DELL/openclaw-trader/state";
const STOP_COMMAND_FILE = "C:/Users/DELL/openclaw-trader/stop-command.txt";

// ============ v3.5 新增：每日交易计数器 ============
const MAX_DAILY_TRADES = 40; // 每日最大交易次数
let dailyTradeCount = 0;
let lastTradeDate = new Date().toDateString();

function resetDailyCountIfNewDay() {
  const today = new Date().toDateString();
  if (today !== lastTradeDate) {
    dailyTradeCount = 0;
    lastTradeDate = today;
    console.log("📅 新的一天，重置交易计数器");
  }
}

function canTrade(): boolean {
  resetDailyCountIfNewDay();
  return dailyTradeCount < MAX_DAILY_TRADES;
}

function incrementTradeCount() {
  resetDailyCountIfNewDay();
  dailyTradeCount++;
  console.log(`📊 今日交易: ${dailyTradeCount}/${MAX_DAILY_TRADES}`);
}

// 高相关币组（同向持仓只选一个）
const CORRELATION_GROUPS = [
  ["BTCUSDT", "ETHUSDT", "BNBUSDT"],
  ["SOLUSDT", "ADAUSDT", "MATICUSDT"],
  ["LINKUSDT", "UNIUSDT", "AAVEUSDT"],
];

const STEP_SIZE: Record<string, number> = {
  BTCUSDT: 0.001, ETHUSDT: 0.001, BNBUSDT: 0.001, SOLUSDT: 0.01,
  XRPUSDT: 0.1, ADAUSDT: 1, DOGEUSDT: 1, LTCUSDT: 0.001,
  LINKUSDT: 0.01, UNIUSDT: 0.01, AVAXUSDT: 0.01, DOTUSDT: 0.01,
  MATICUSDT: 1, ATOMUSDT: 0.01, FILUSDT: 0.01, XLMUSDT: 1,
  ALGOUSDT: 0.1, VETUSDT: 1, ETCUSDT: 0.01, TRXUSDT: 1
};

function truncateToStep(n: number, step: number): number {
  return Math.floor(n / step) * step;
}

// ============ 停止命令检测 ============
function isStopCommand(): boolean {
  try {
    if (fs.existsSync(STOP_COMMAND_FILE)) {
      const content = fs.readFileSync(STOP_COMMAND_FILE, 'utf8').trim().toLowerCase();
      return content === 'true' || content === '1' || content === 'stop';
    }
  } catch (e) {
    // ignore
  }
  return false;
}

function clearStopCommand(): void {
  try {
    if (fs.existsSync(STOP_COMMAND_FILE)) {
      fs.unlinkSync(STOP_COMMAND_FILE);
    }
  } catch (e) {
    // ignore
  }
}

// ============ 全部平仓 ============
async function closeAllPositions(): Promise<void> {
  console.log("\n" + "=".repeat(60));
  console.log("🛑 收到停止命令！正在平掉所有仓位...");
  console.log("=".repeat(60));
  
  try {
    const positions = await getPositions();
    
    if (positions.length === 0) {
      console.log("✅ 没有持仓，直接停止");
      return;
    }
    
    console.log(`📋 需要平仓: ${positions.length}个`);
    
    for (const pos of positions) {
      const amt = parseFloat(pos.positionAmt);
      if (amt === 0) continue;
      
      const sym = pos.symbol;
      const side = amt > 0 ? "LONG" : "SHORT";
      const closeSide = amt > 0 ? "SELL" : "BUY";
      const closePositionSide = amt > 0 ? "LONG" : "SHORT";
      
      console.log(`  ⏳ ${sym}: ${side} ${Math.abs(amt)} → 平仓中...`);
      
      try {
        // 取消所有挂单
        await cancelAllOpenOrders(sym);
        // 市价平仓
        await placeOrder(sym, closeSide, closePositionSide, Math.abs(amt));
        console.log(`  ✅ ${sym}: 已平仓`);
      } catch (e: any) {
        console.log(`  ❌ ${sym}: 平仓失败 - ${e.message}`);
      }
      
      // 等待一下避免请求过快
      await new Promise(r => setTimeout(r, 500));
    }
    
    // 验证平仓结果
    const remaining = await getPositions();
    if (remaining.length === 0) {
      console.log("✅ 所有仓位已平仓完毕");
    } else {
      console.log(`⚠️ 仍有 ${remaining.length} 个仓位未平仓`);
    }
    
  } catch (e: any) {
    console.error(`❌ 平仓过程出错: ${e.message}`);
  }
}

// ============ 状态同步 ============
interface PositionState {
  side: string;
  qty: number;
  entryPrice: number;
  entryTime: number;  // 新增：入场时间
  currentPrice: number;
  unrealizedPnl: number;
  scenarioId: string;
}

interface StateFile {
  updatedAt: number;
  balance: number;
  positions: Record<string, PositionState>;
}

async function syncStateToDashboard(balance: number, positions: any[]) {
  try {
    const state: StateFile = {
      updatedAt: Date.now(),
      balance,
      positions: {}
    };
    for (const p of positions) {
      const amt = parseFloat(p.positionAmt);
      if (amt === 0) continue;
      const entryPrice = parseFloat(p.entryPrice);
      const markPrice = parseFloat(p.markPrice || p.entryPrice);
      const unrealizedPnl = parseFloat(p.unrealizedProfit || "0");
      const entryTime = parseInt(p.updateTime) || Date.now() - 3600000;
      state.positions[p.symbol] = {
        side: amt > 0 ? "long" : "short",
        qty: Math.abs(amt),
        entryPrice,
        entryTime,
        currentPrice: markPrice,
        unrealizedPnl,
        scenarioId: SCENARIO_ID
      };
    }
    if (!fs.existsSync(STATE_DIR)) fs.mkdirSync(STATE_DIR, { recursive: true });
    fs.writeFileSync(path.join(STATE_DIR, `${SCENARIO_ID}.json`), JSON.stringify(state, null, 2));
  } catch (e: any) { console.log(`  ⚠️ State sync error: ${e.message}`); }
}

// ============ Binance API ============
function apiRequest(host: string, apiPath: string, apiKey: string, secretKey: string, params: Record<string,string>={}): Promise<any> {
  return new Promise((resolve, reject) => {
    const timestamp = Date.now();
    const qp = { ...params, timestamp: String(timestamp) };
    const query = Object.entries(qp).map(([k,v]) => `${k}=${encodeURIComponent(v)}`).join("&");
    const sig = crypto.createHmac("sha256", secretKey).update(query).digest("hex");
    const options = { hostname: host, path: `${apiPath}?${query}&signature=${sig}`, method: "GET", headers: { "X-MBX-APIKEY": apiKey } };
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => { try { resolve(JSON.parse(data)); } catch { resolve(data); } });
    });
    req.on("error", reject);
    req.end();
  });
}

async function getKlines(symbol: string, interval: string, limit: number): Promise<any[]> {
  return apiRequest("testnet.binancefuture.com", "/fapi/v1/klines", FUTURES_CREDS.apiKey, FUTURES_CREDS.secretKey, { symbol, interval, limit: String(limit) });
}

async function getBalance(): Promise<number> {
  const data = await apiRequest("testnet.binancefuture.com", "/fapi/v2/balance", FUTURES_CREDS.apiKey, FUTURES_CREDS.secretKey);
  const usdt = data.find((a: any) => a.asset === "USDT");
  return usdt ? parseFloat(usdt.availableBalance) : 0;
}

async function getPositions(): Promise<any[]> {
  const data = await apiRequest("testnet.binancefuture.com", "/fapi/v2/positionRisk", FUTURES_CREDS.apiKey, FUTURES_CREDS.secretKey);
  return data.filter((p: any) => parseFloat(p.positionAmt) !== 0);
}

async function setLeverage(symbol: string, leverage: number): Promise<any> {
  return apiRequest("testnet.binancefuture.com", "/fapi/v1/leverage", FUTURES_CREDS.apiKey, FUTURES_CREDS.secretKey, { symbol, leverage: String(leverage) });
}

async function placeOrder(symbol: string, side: "BUY" | "SELL", positionSide: "LONG" | "SHORT", quantity: number): Promise<any> {
  await setLeverage(symbol, 3);
  return apiRequest("testnet.binancefuture.com", "/fapi/v1/order", FUTURES_CREDS.apiKey, FUTURES_CREDS.secretKey, { symbol, side, positionSide, type: "MARKET", quantity: String(quantity) });
}

// ============ 修复：设置真实止损止盈单 ============
async function placeStopLoss(symbol: string, side: "BUY" | "SELL", positionSide: "LONG" | "SHORT", quantity: number, stopPrice: number): Promise<any> {
  await setLeverage(symbol, 3);
  // STOP_MARKET - 触发后以市价成交
  const params: Record<string,string> = {
    symbol, side, positionSide, type: "STOP_MARKET",
    stopPrice: String(stopPrice.toFixed(4)),
    workingType: "CONTRACT_PRICE",
    quantity: String(quantity)
  };
  return apiRequest("testnet.binancefuture.com", "/fapi/v1/order", FUTURES_CREDS.apiKey, FUTURES_CREDS.secretKey, params);
}

async function placeTakeProfit(symbol: string, side: "BUY" | "SELL", positionSide: "LONG" | "SHORT", quantity: number, stopPrice: number): Promise<any> {
  await setLeverage(symbol, 3);
  // TAKE_PROFIT_MARKET - 触发后以市价成交
  const params: Record<string,string> = {
    symbol, side, positionSide, type: "TAKE_PROFIT_MARKET",
    stopPrice: String(stopPrice.toFixed(4)),
    workingType: "CONTRACT_PRICE",
    quantity: String(quantity)
  };
  return apiRequest("testnet.binancefuture.com", "/fapi/v1/order", FUTURES_CREDS.apiKey, FUTURES_CREDS.secretKey, params);
}

// ============ 取消所有未成交的挂单 ============
async function cancelAllOpenOrders(symbol: string): Promise<any> {
  return apiRequest("testnet.binancefuture.com", "/fapi/v1/allOpenOrders", FUTURES_CREDS.apiKey, FUTURES_CREDS.secretKey, { symbol });
}

// ============ 技术指标（优化版）============

function calcEMA(closes: number[], period: number): number {
  if (closes.length < period) return closes[closes.length - 1];
  const k = 2 / (period + 1);
  let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < closes.length; i++) ema = closes[i] * k + ema * (1 - k);
  return ema;
}

function calcRSI(closes: number[], period: number): number {
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

// 布林带
interface BollingerBands { upper: number; middle: number; lower: number; bandwidth: number; }
function calcBollingerBands(closes: number[], period: number, stdDev: number): BollingerBands {
  const slice = closes.slice(-period);
  const middle = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((sum, v) => sum + Math.pow(v - middle, 2), 0) / period;
  const std = Math.sqrt(variance);
  const upper = middle + stdDev * std;
  const lower = middle - stdDev * std;
  const bandwidth = (upper - lower) / middle;
  return { upper, middle, lower, bandwidth };
}

function calcATR(klines: any[], period: number): number {
  const trs: number[] = [];
  for (let i = 1; i < klines.length; i++) {
    const high = parseFloat(klines[i][2]);
    const low = parseFloat(klines[i][3]);
    const prevClose = parseFloat(klines[i - 1][4]);
    const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
    trs.push(tr);
  }
  if (trs.length < period) return trs[trs.length - 1] || 0;
  return trs.slice(-period).reduce((a, b) => a + b, 0) / period;
}

// 修复：正确的MACD金叉/死叉检测
interface MACDResult { macd: number; signal: number; histogram: number; crossedUp: boolean; crossedDown: boolean; }
function calcMACD(closes: number[]): MACDResult {
  const ema12 = calcEMA(closes, 12);
  const ema26 = calcEMA(closes, 26);
  const macd = ema12 - ema26;
  
  // 计算历史MACD值用于检测交叉
  const macdValues: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (i < 26) continue;
    const e12 = calcEMA(closes.slice(0, i + 1), 12);
    const e26 = calcEMA(closes.slice(0, i + 1), 26);
    macdValues.push(e12 - e26);
  }
  
  if (macdValues.length < 10) {
    return { macd, signal: macd, histogram: 0, crossedUp: false, crossedDown: false };
  }
  
  // Signal line: 9-period EMA of MACD
  const signal = calcEMA(macdValues, 9);
  const histogram = macd - signal;
  
  // 正确的交叉检测：上一次histogram < 0，这一次histogram >= 0 = 金叉
  const prevHistogram = macdValues[macdValues.length - 2] - calcEMA(macdValues.slice(0, -1), 9);
  const crossedUp = prevHistogram < 0 && histogram >= 0;
  const crossedDown = prevHistogram > 0 && histogram <= 0;
  
  return { macd, signal, histogram, crossedUp, crossedDown };
}

// ============ 相关性检查 ============
function hasCorrelatedPosition(symbol: string, positions: any[], side: string): boolean {
  for (const group of CORRELATION_GROUPS) {
    if (group.includes(symbol)) {
      for (const pos of positions) {
        const posAmt = parseFloat(pos.positionAmt);
        const posSide = posAmt > 0 ? "long" : "short";
        if (group.includes(pos.symbol) && posSide === side) {
          return true; // 已有同组相关持仓
        }
      }
    }
  }
  return false;
}

// ============ 获取趋势（15分钟） ============
interface TrendData { emaFast: number; emaSlow: number; trend: "UP" | "DOWN"; vwapApprox: number; }
async function getTrend(symbol: string): Promise<TrendData> {
  const klines15m = await getKlines(symbol, TREND_TF, 50);
  const closes15m = klines15m.map((k: any) => parseFloat(k[4]));
  const emaFast = calcEMA(closes15m, EMA_FAST);
  const emaSlow = calcEMA(closes15m, EMA_SLOW);
  const trend = emaFast > emaSlow ? "UP" : "DOWN";
  const tp = klines15m.map((k: any) => (parseFloat(k[2]) + parseFloat(k[3]) + parseFloat(k[4])) / 3);
  const vwapApprox = tp.reduce((a, b) => a + b, 0) / tp.length;
  return { emaFast, emaSlow, trend, vwapApprox };
}

// ============ 获取入场信号（5分钟） ============
interface EntrySignal {
  price: number;
  rsi: number;
  bb: BollingerBands;
  macd: MACDResult;
  atr: number;
  atriaStop: number;
  atriaTP1: number;
  atriaTP2: number;
  volumeRatio: number;     // v3.6: 成交量比例
  trendStrength: number;  // v3.6: 趋势强度
}
async function getEntrySignal(symbol: string): Promise<EntrySignal> {
  const klines5m = await getKlines(symbol, ENTRY_TF, 100);
  const closes5m = klines5m.map((k: any) => parseFloat(k[4]));
  const volumes = klines5m.map((k: any) => parseFloat(k[5]));
  const latestClose = closes5m[closes5m.length - 1];
  const latestVolume = volumes[volumes.length - 1];
  
  // v3.6: 计算成交量比例
  const avgVolume = volumes.reduce((a, b) => a + b, 0) / volumes.length;
  const volumeRatio = latestVolume / avgVolume;
  
  const rsi = calcRSI(closes5m, RSI_PERIOD);
  const bb = calcBollingerBands(closes5m, BB_PERIOD, BB_STD);
  const macd = calcMACD(closes5m);
  const atr = calcATR(klines5m, ATR_PERIOD);
  
  // v3.6: ATR动态止损
  const atriaStop = atr * ATR_STOP_MULT;
  const atriaTP1 = atr * ATR_TP1;  // 第一止盈 1.5%
  const atriaTP2 = atr * ATR_TP2;  // 第二止盈 2.5%
  
  return { price: latestClose, rsi, bb, macd, atr, atriaStop, atriaTP1, atriaTP2, volumeRatio, trendStrength: 0 };
}

// ============ 主交易逻辑 ============
async function analyzeSymbol(symbol: string, balance: number, positions: any[]): Promise<{
  action: string;
  qty: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number;
  reason: string;
}> {
  const pos = positions.find((p: any) => p.symbol === symbol);
  const posAmt = pos ? parseFloat(pos.positionAmt) : 0;
  const posSide = posAmt > 0 ? "LONG" : posAmt < 0 ? "SHORT" : null;
  
  const trend = await getTrend(symbol);
  const entry = await getEntrySignal(symbol);
  
  const { price, rsi, bb, macd, atr, atriaStop, atriaTP1, atriaTP2, volumeRatio } = entry;
  const { trend: trendDir, emaFast, emaSlow, vwapApprox } = trend;
  
  // v3.6: 计算趋势强度
  const trendStrength = Math.abs(emaFast - emaSlow) / emaSlow;
  const strongTrend = trendStrength >= TREND_STRENGTH_THRESHOLD;
  
  // v3.6: 成交量确认
  const volumeConfirmed = volumeRatio >= VOLUME_CONFIRMATION;
  
  // 布林带位置（动态阈值：基于ATR调整）
  const bbThreshold = Math.max(0.005, atr / price * 2); // 至少0.5%波动
  const atLowerBand = price <= bb.lower * (1 + bbThreshold);
  const atUpperBand = price >= bb.upper * (1 - bbThreshold);
  
  // ====== 检查现有持仓 ======
  if (posSide === "LONG" && pos) {
    const entryPrice = parseFloat(pos.entryPrice);
    const pnlPct = (price - entryPrice) / entryPrice * 100;
    
    // v3.6: 分批止盈逻辑
    // 第一止盈：盈利>1.5%时，卖出50%
    // 第二止盈：盈利>2.5%时，卖出剩余50%
    const shouldTakeProfit1 = pnlPct >= 1.5;
    const shouldTakeProfit2 = pnlPct >= 2.5;
    
    // 持仓超时检查
    const entryTime = parseInt(pos.updateTime) || Date.now() - 3600000;
    const holdHours = (Date.now() - entryTime) / 3600000;
    const timedOut = holdHours > MAX_HOLD_MINUTES / 60;
    
    // 止损/止盈/趋势反转/超时
    if (pnlPct < -3 || shouldTakeProfit2 || (trendDir === "DOWN" && macd.crossedDown) || timedOut) {
      const reason = pnlPct < -3 ? `止损 ${pnlPct.toFixed(2)}%` :
                     shouldTakeProfit2 ? `止盈2 ${pnlPct.toFixed(2)}%` :
                     timedOut ? `超时 ${holdHours.toFixed(1)}h` : "趋势转空";
      return { action: "CLOSE_LONG", qty: posAmt, stopLoss: 0, takeProfit1: 0, takeProfit2: 0, reason, price };
    }
    // v3.6: 部分止盈
    if (shouldTakeProfit1 && !shouldTakeProfit2) {
      return { action: "PARTIAL_CLOSE_LONG", qty: Math.floor(posAmt / 2), stopLoss: 0, takeProfit1: 0, takeProfit2: 0, reason: `部分止盈1 ${pnlPct.toFixed(2)}%`, price };
    }
  }
  
  if (posSide === "SHORT" && pos) {
    const entryPrice = parseFloat(pos.entryPrice);
    const pnlPct = (entryPrice - price) / entryPrice * 100;
    
    const shouldTakeProfit1 = pnlPct >= 1.5;
    const shouldTakeProfit2 = pnlPct >= 2.5;
    
    const entryTime = parseInt(pos.updateTime) || Date.now() - 3600000;
    const holdHours = (Date.now() - entryTime) / 3600000;
    const timedOut = holdHours > MAX_HOLD_MINUTES / 60;
    
    if (pnlPct < -3 || shouldTakeProfit2 || (trendDir === "UP" && macd.crossedUp) || timedOut) {
      const reason = pnlPct < -3 ? `止损 ${pnlPct.toFixed(2)}%` :
                     shouldTakeProfit2 ? `止盈2 ${pnlPct.toFixed(2)}%` :
                     timedOut ? `超时 ${holdHours.toFixed(1)}h` : "趋势转多";
      return { action: "CLOSE_SHORT", qty: Math.abs(posAmt), stopLoss: 0, takeProfit1: 0, takeProfit2: 0, reason, price };
    }
    if (shouldTakeProfit1 && !shouldTakeProfit2) {
      return { action: "PARTIAL_CLOSE_SHORT", qty: Math.floor(Math.abs(posAmt) / 2), stopLoss: 0, takeProfit1: 0, takeProfit2: 0, reason: `部分止盈1 ${pnlPct.toFixed(2)}%`, price };
    }
  }
  
  // ====== 新开仓信号 ======
  // v3.6: 增加趋势强度和成交量确认
  // 做多：上升趋势 + 趋势强度确认 + (超卖 OR 布林下轨) + MACD金叉 + 成交量确认
  if (trendDir === "UP" && strongTrend && !hasCorrelatedPosition(symbol, positions, "long") && positions.length < MAX_POSITIONS) {
    const buySignal = (rsi < RSI_OVERSOLD || atLowerBand) && macd.crossedUp && volumeConfirmed;
    if (buySignal) {
      const stopLoss = price - atriaStop;
      const takeProfit1 = price + atriaTP1;
      const takeProfit2 = price + atriaTP2;
      return { action: "BUY_LONG", qty: 0, stopLoss, takeProfit1, takeProfit2, 
               reason: `RSI=${rsi.toFixed(1)} ${atLowerBand?"BB触底":"RSI<30"} MACD金叉 量比${volumeRatio.toFixed(1)}x`, price };
    }
  }
  
  // 做空：下降趋势 + 趋势强度确认 + (超买 OR 布林上轨) + MACD死叉 + 成交量确认
  if (trendDir === "DOWN" && strongTrend && !hasCorrelatedPosition(symbol, positions, "short") && positions.length < MAX_POSITIONS) {
    const shortSignal = (rsi > RSI_OVERBOUGHT || atUpperBand) && macd.crossedDown && volumeConfirmed;
    if (shortSignal) {
      const stopLoss = price + atriaStop;
      const takeProfit1 = price - atriaTP1;
      const takeProfit2 = price - atriaTP2;
      return { action: "SELL_SHORT", qty: 0, stopLoss, takeProfit1, takeProfit2,
               reason: `RSI=${rsi.toFixed(1)} ${atUpperBand?"BB触顶":"RSI>70"} MACD死叉 量比${volumeRatio.toFixed(1)}x`, price };
    }
  }
  
  return { action: "HOLD", qty: 0, stopLoss: 0, takeProfit1: 0, takeProfit2: 0, 
           reason: `RSI=${rsi.toFixed(1)} EMA=${emaFast.toFixed(2)}/${emaSlow.toFixed(2)} ${trendDir} 量:${volumeRatio.toFixed(1)}x`, price };
}

async function runTradingCycle() {
  const ts = new Date().toLocaleTimeString("zh-CN", { timeZone: "Asia/Shanghai" });
  console.log(`\n${"=".repeat(60)}`);
  console.log(`⏰ ${ts} - 策略扫描 (${TREND_TF}趋势 + ${ENTRY_TF}信号)`);
  console.log(`=${"=".repeat(60)}`);
  
  try {
    const balance = await getBalance();
    const positions = await getPositions();
    console.log(`💰 Balance: $${balance.toFixed(2)} | Positions: ${positions.length}/${MAX_POSITIONS}`);
    await syncStateToDashboard(balance, positions);
    
    for (const sym of SYMBOLS) {
      try {
        const analysis = await analyzeSymbol(sym, balance, positions);
        const { action, qty, stopLoss, takeProfit1, takeProfit2, reason } = analysis;
        
        if (action === "HOLD") {
          console.log(`  ${sym}: ${reason} → ⏸️`);
        } else {
          const pos = positions.find((p: any) => p.symbol === sym);
          const posAmt = pos ? parseFloat(pos.positionAmt) : 0;
          const posSide = posAmt > 0 ? "LONG" : posAmt < 0 ? "SHORT" : null;
          
          if (action === "CLOSE_LONG" || action === "PARTIAL_CLOSE_LONG") {
            await cancelAllOpenOrders(sym).catch(() => {});
            await placeOrder(sym, "SELL", "LONG", qty || posAmt);
            const isPartial = action === "PARTIAL_CLOSE_LONG";
            console.log(`  ${isPartial?"🟡":"🔴"} ${sym}: ${isPartial?"部分":"全部"}平多 @ ${analysis.price?.toFixed(4) || "?"} | ${reason}`);
          } else if (action === "CLOSE_SHORT" || action === "PARTIAL_CLOSE_SHORT") {
            await cancelAllOpenOrders(sym).catch(() => {});
            await placeOrder(sym, "BUY", "SHORT", qty || Math.abs(posAmt));
            const isPartial = action === "PARTIAL_CLOSE_SHORT";
            console.log(`  ${isPartial?"🟡":"🟢"} ${sym}: ${isPartial?"部分":"全部"}平空 @ ${analysis.price?.toFixed(4) || "?"} | ${reason}`);
          } else if ((action === "BUY_LONG" || action === "SELL_SHORT") && positions.length < MAX_POSITIONS) {
            const step = STEP_SIZE[sym] || 0.001;
            const positionValue = balance * POSITION_RATIO;
            const tradeQty = truncateToStep(positionValue / analysis.price, step);
            
            if (tradeQty < step) { console.log(`  ⚠️ ${sym}: 数量${tradeQty}低于最小${step}`); continue; }
            
            if (action === "BUY_LONG") {
              if (posSide === "SHORT") {
                await cancelAllOpenOrders(sym).catch(() => {});
                await placeOrder(sym, "BUY", "SHORT", Math.abs(posAmt));
                console.log(`  🔄 ${sym}: 平空仓`);
              }
              await placeOrder(sym, "BUY", "LONG", tradeQty);
              await placeStopLoss(sym, "SELL", "LONG", tradeQty, stopLoss);
              // v3.6: 分批止盈 - 先挂第一止盈
              await placeTakeProfit(sym, "SELL", "LONG", tradeQty, takeProfit1);
              incrementTradeCount();
              console.log(`  🟢 ${sym}: 开多 @ $${analysis.price.toFixed(4)} | SL:$${stopLoss.toFixed(4)} TP1:$${takeProfit1.toFixed(4)}`);
            } else {
              if (posSide === "LONG") {
                await cancelAllOpenOrders(sym).catch(() => {});
                await placeOrder(sym, "SELL", "LONG", posAmt);
                console.log(`  🔄 ${sym}: 平多仓`);
              }
              await placeOrder(sym, "SELL", "SHORT", tradeQty);
              await placeStopLoss(sym, "BUY", "SHORT", tradeQty, stopLoss);
              await placeTakeProfit(sym, "BUY", "SHORT", tradeQty, takeProfit1);
              incrementTradeCount();
              console.log(`  🔴 ${sym}: 开空 @ $${analysis.price.toFixed(4)} | SL:$${stopLoss.toFixed(4)} TP1:$${takeProfit1.toFixed(4)}`);
            }
          }
        }
      } catch (e: any) {
        console.log(`  ⚠️ ${sym}: ${e.message}`);
      }
    }
    
    const newBalance = await getBalance();
    const newPositions = await getPositions();
    await syncStateToDashboard(newBalance, newPositions);
    console.log(`✅ 扫描完成 | 下次: ${15}分钟后`);
  } catch (e: any) {
    console.error(`❌ Cycle error: ${e.message}`);
  }
}

async function main() {
  console.log("🚀 OpenClaw Trader Pro v3.6 - 优化版策略");
  console.log(`📊 币种: ${SYMBOLS.length}个 | 周期: ${TREND_TF}+${ENTRY_TF}`);
  console.log(`🎯 RSI: ${RSI_OVERSOLD}/${RSI_OVERBOUGHT} (更宽松)`);
  console.log(`🛡️ 止损: ATR×${ATR_STOP_MULT} | 止盈: 分批 ATR×${ATR_TP1} + ATR×${ATR_TP2} (v3.6)`);
  console.log(`📊 趋势强度: EMA差距>${TREND_STRENGTH_THRESHOLD*100}% | 成交量确认: >${VOLUME_CONFIRMATION}倍 (v3.6)`);
  console.log(`⏱️ 持仓超时: ${MAX_HOLD_MINUTES}分钟 | 仓位: ${POSITION_RATIO*100}% | 最大持仓: ${MAX_POSITIONS}`);
  console.log(`📈 波动率过滤: ${MIN_VOLATILITY*100}% (小币${SMALL_CAP_MIN_VOL*100}%)`);
  console.log(`📊 每日最大交易: ${MAX_DAILY_TRADES}次`);
  resetDailyCountIfNewDay();
  console.log("=".repeat(60));
  
  // 检查是否已有停止命令（重启时）
  if (isStopCommand()) {
    console.log("⚠️ 检测到停止命令文件，正在清仓...");
    await closeAllPositions();
    clearStopCommand();
    console.log("🛑 已停止自动交易");
    return;
  }
  
  // 主循环
  async function tradingLoop() {
    if (isStopCommand()) {
      console.log("\n🛑 检测到停止命令，开始清仓...");
      await closeAllPositions();
      clearStopCommand();
      console.log("🛑 已停止自动交易");
      process.exit(0);
    }
    
    // v3.5: 检查每日交易次数限制
    if (!canTrade()) {
      console.log(`\n⚠️ 今日交易次数已达上限 (${MAX_DAILY_TRADES}次)，等待明天继续...`);
      return;
    }
    
    await runTradingCycle();
  }
  
  await tradingLoop();
  setInterval(tradingLoop, 15 * 60 * 1000);
}

main().catch(console.error);
