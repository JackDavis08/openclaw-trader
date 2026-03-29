"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// status-server.ts
var import_https = __toESM(require("https"), 1);
var import_crypto = __toESM(require("crypto"), 1);
var http = __toESM(require("http"), 1);
process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT:", err);
});
process.on("unhandledRejection", (reason) => {
  console.error("UNHANDLED:", reason);
});
var FUTURES_CREDS = {
  apiKey: "rLS9djClUheJUJcqkUFGOylwCuSk1wVkdJMoHXN2TgfswhjBCsOPvh0202vBhAAN",
  secretKey: "EMu9DnZL7DSodz7dSkkSslVC9AtzUGQgQH4a4b9g19CysZdPO73udtnt1gTZjF7Y"
};
var INITIAL_BALANCE = 5e3;
function apiRequest(host, path, params = {}) {
  return new Promise((resolve, reject) => {
    const timestamp = Date.now();
    const qp = { ...params, timestamp: String(timestamp) };
    const query = Object.entries(qp).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
    const sig = import_crypto.default.createHmac("sha256", FUTURES_CREDS.secretKey).update(query).digest("hex");
    const options = { hostname: host, path: `${path}?${query}&signature=${sig}`, method: "GET", headers: { "X-MBX-APIKEY": FUTURES_CREDS.apiKey } };
    const req = import_https.default.request(options, (res) => {
      let data = "";
      res.on("data", (c) => data += c);
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve(data);
        }
      });
    });
    req.on("error", reject);
    req.end();
  });
}
async function getData() {
  const [balance, positions] = await Promise.all([
    apiRequest("testnet.binancefuture.com", "/fapi/v2/balance"),
    apiRequest("testnet.binancefuture.com", "/fapi/v2/positionRisk")
  ]);
  const usdt = balance.find((a) => a.asset === "USDT");
  const bal = usdt ? parseFloat(usdt.availableBalance) : 0;
  const totalPnl = bal - INITIAL_BALANCE;
  const totalPnlPct = totalPnl / INITIAL_BALANCE * 100;
  const activePositions = positions.filter((p) => parseFloat(p.positionAmt) !== 0);
  const pricePromises = activePositions.map(async (p) => {
    try {
      const priceData = await apiRequest("testnet.binancefuture.com", "/fapi/v1/ticker/price", { symbol: p.symbol });
      return { symbol: p.symbol, price: parseFloat(priceData.price) };
    } catch {
      return { symbol: p.symbol, price: parseFloat(p.markPrice || p.entryPrice) };
    }
  });
  const priceMap = Object.fromEntries(await Promise.all(pricePromises));
  const tickerPromises = activePositions.map(async (p) => {
    try {
      const tick = await apiRequest("testnet.binancefuture.com", "/fapi/v1/ticker/24hr", { symbol: p.symbol });
      return { symbol: p.symbol, change24h: parseFloat(tick.priceChangePercent || "0") };
    } catch {
      return { symbol: p.symbol, change24h: 0 };
    }
  });
  const changeMap = Object.fromEntries(await Promise.all(tickerPromises));
  const positionsWithPnl = activePositions.map((p) => {
    const amt = parseFloat(p.positionAmt);
    const entry = parseFloat(p.entryPrice);
    const mark = priceMap[p.symbol] || entry;
    const pnl = parseFloat(p.unrealizedProfit || "0");
    const leverage = parseFloat(p.leverage || "3");
    const isolated = p.isolated || false;
    const margin = parseFloat(p.isolatedWallet || "0") / leverage;
    const marginAmt = Math.abs(amt) * entry / leverage;
    const roePct = marginAmt > 0 ? pnl / marginAmt * 100 : 0;
    const posPnlPct = entry > 0 ? amt > 0 ? (mark - entry) / entry * 100 : (entry - mark) / entry * 100 : 0;
    const direction = amt > 0 ? "LONG" : "SHORT";
    return {
      symbol: p.symbol,
      side: direction,
      qty: Math.abs(amt),
      entry: entry.toFixed(4),
      mark: mark.toFixed(4),
      pnl: pnl.toFixed(2),
      pnlPct: posPnlPct.toFixed(2),
      roePct: roePct.toFixed(2),
      leverage,
      isolated,
      change24h: (changeMap[p.symbol] || 0).toFixed(2),
      margin: marginAmt.toFixed(2),
      // Direction raw for CSS
      isLong: amt > 0
    };
  });
  const totalPosPnl = positionsWithPnl.reduce((sum, p) => sum + parseFloat(p.pnl), 0);
  const totalPosPnlPct = positionsWithPnl.length > 0 ? positionsWithPnl.reduce((sum, p) => sum + parseFloat(p.pnlPct), 0) / positionsWithPnl.length : 0;
  return {
    balance: bal.toFixed(2),
    totalPnl: totalPnl.toFixed(2),
    totalPnlPct: totalPnlPct.toFixed(2),
    totalPosPnl: totalPosPnl.toFixed(2),
    totalPosPnlPct: totalPosPnlPct.toFixed(2),
    positions: positionsWithPnl,
    posCount: activePositions.length,
    timestamp: Date.now()
  };
}
var HTML = `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>OpenClaw Trading Panel v3</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { 
  font-family: 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif; 
  background: linear-gradient(135deg, #0a0e17 0%, #111827 50%, #0f172a 100%);
  color: #e2e8f0; 
  min-height: 100vh; 
  padding: 16px;
  font-size: 14px;
}
.container { max-width: 1500px; margin: 0 auto; }

/* ============ HEADER ============ */
.header {
  display: flex; justify-content: space-between; align-items: center;
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 16px; padding: 16px 24px; margin-bottom: 16px;
  backdrop-filter: blur(10px);
}
.header-left { display: flex; align-items: center; gap: 14px; }
.logo { font-size: 26px; }
.title-group {}
.title { font-size: 18px; font-weight: 700; color: #f8fafc; letter-spacing: 0.5px; }
.subtitle { font-size: 11px; color: #64748b; margin-top: 2px; }
.header-right { text-align: right; }
.status-badge {
  display: inline-flex; align-items: center; gap: 6px;
  background: rgba(0,200,83,0.12); border: 1px solid #00c853;
  color: #00c853; padding: 5px 12px; border-radius: 20px;
  font-size: 12px; font-weight: 600; letter-spacing: 0.3px;
}
.status-dot { width: 7px; height: 7px; background: #00c853; border-radius: 50%; animation: pulse 2s infinite; }
@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
.clock-row { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; margin-top: 6px; }
.clock { font-size: 12px; color: #94a3b8; font-variant-numeric: tabular-nums; }
.next-scan { font-size: 11px; color: #64748b; }

/* ============ STATS GRID ============ */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 10px;
  margin-bottom: 16px;
}
.stat-card {
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.07);
  border-radius: 12px; padding: 14px 16px;
  transition: border-color 0.3s;
}
.stat-card:hover { border-color: rgba(255,255,255,0.14); }
.stat-label { font-size: 10px; color: #64748b; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 6px; display: flex; align-items: center; gap: 4px; }
.stat-value { font-size: 20px; font-weight: 700; font-variant-numeric: tabular-nums; line-height: 1.2; }
.stat-value.green { color: #10b981; }
.stat-value.red { color: #ef4444; }
.stat-value.blue { color: #3b82f6; }
.stat-value.yellow { color: #f59e0b; }
.stat-value.white { color: #f1f5f9; }
.stat-sub { font-size: 10px; color: #475569; margin-top: 4px; font-variant-numeric: tabular-nums; }

.card-balance { border-color: rgba(16,185,129,0.3); background: rgba(16,185,129,0.04); }
.card-balance .stat-value { color: #10b981; }
.card-pnl { border-color: rgba(245,158,11,0.3); background: rgba(245,158,11,0.04); }
.card-pos-pnl {}
.card-positions {}
.card-session {}
.card-roe {}

/* ============ POSITIONS SECTION ============ */
.section { 
  background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05);
  border-radius: 16px; padding: 20px; margin-bottom: 16px;
}
.section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.section-title { font-size: 14px; font-weight: 700; color: #f8fafc; display: flex; align-items: center; gap: 8px; }
.section-title .emoji { font-size: 16px; }
.section-count { 
  background: rgba(245,158,11,0.15); color: #f59e0b; 
  padding: 3px 10px; border-radius: 8px; font-size: 12px; font-weight: 700; 
}

/* Enhanced Position Cards */
.pos-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 14px; }
.pos-card {
  background: linear-gradient(145deg, rgba(30,41,59,0.9), rgba(15,23,42,0.95));
  border-radius: 14px; padding: 16px;
  border: 1px solid rgba(255,255,255,0.08);
  transition: transform 0.2s, box-shadow 0.2s;
}
.pos-card:hover { transform: translateY(-1px); box-shadow: 0 8px 25px rgba(0,0,0,0.3); }
.pos-card.long { border-color: rgba(16,185,129,0.35); box-shadow: 0 0 20px rgba(16,185,129,0.08); }
.pos-card.short { border-color: rgba(239,68,68,0.35); box-shadow: 0 0 20px rgba(239,68,68,0.08); }

/* Pos card top row */
.pos-top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; }
.pos-symbol-group { display: flex; flex-direction: column; gap: 2px; }
.pos-symbol { font-size: 17px; font-weight: 800; color: #f1f5f9; letter-spacing: 0.3px; }
.pos-side-badge { 
  display: inline-flex; align-items: center; gap: 4px;
  padding: 3px 10px; border-radius: 6px; font-size: 11px; font-weight: 700;
  width: fit-content;
}
.pos-side-badge.long { background: rgba(16,185,129,0.15); color: #10b981; border: 1px solid rgba(16,185,129,0.3); }
.pos-side-badge.short { background: rgba(239,68,68,0.15); color: #ef4444; border: 1px solid rgba(239,68,68,0.3); }

/* Top right: leverage + 24h change */
.pos-meta { display: flex; flex-direction: column; align-items: flex-end; gap: 3px; }
.pos-leverage { font-size: 11px; color: #94a3b8; background: rgba(255,255,255,0.06); padding: 2px 8px; border-radius: 5px; }
.pos-24h { font-size: 12px; font-weight: 700; font-variant-numeric: tabular-nums; }
.pos-24h.up { color: #10b981; }
.pos-24h.down { color: #ef4444; }

/* Price row */
.pos-prices { 
  display: grid; grid-template-columns: 1fr 1fr 1fr; 
  gap: 6px; margin-bottom: 12px;
  background: rgba(0,0,0,0.2); border-radius: 10px; padding: 10px;
}
.price-item { display: flex; flex-direction: column; gap: 1px; }
.price-label { font-size: 9px; color: #475569; text-transform: uppercase; letter-spacing: 0.5px; }
.price-value { font-size: 13px; font-weight: 700; color: #cbd5e1; font-variant-numeric: tabular-nums; }
.price-value.entry { color: #94a3b8; }
.price-value.mark { color: #e2e8f0; }
.price-value.qty { color: #94a3b8; }

/* PnL row - THE MOST IMPORTANT */
.pos-pnl-row { 
  display: grid; grid-template-columns: 1fr 1fr 1fr;
  gap: 8px; margin-bottom: 10px;
}
.pnl-box {
  background: rgba(0,0,0,0.25); border-radius: 10px; padding: 10px 8px;
  text-align: center; border: 1px solid rgba(255,255,255,0.04);
}
.pnl-box-label { font-size: 9px; color: #475569; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }
.pnl-box-value { font-size: 16px; font-weight: 800; font-variant-numeric: tabular-nums; line-height: 1.2; }
.pnl-box-value.profit { color: #10b981; }
.pnl-box-value.loss { color: #ef4444; }
.pnl-box-value.neutral { color: #64748b; }
.pnl-box-sub { font-size: 9px; color: #475569; margin-top: 2px; font-variant-numeric: tabular-nums; }

/* Bottom: ROE bar + margin */
.pos-bottom { display: flex; justify-content: space-between; align-items: center; }
.pos-margin { font-size: 10px; color: #475569; }
.pos-margin span { color: #64748b; }

/* ============ EMPTY STATE ============ */
.no-pos {
  text-align: center; padding: 50px 20px; color: #475569;
  font-size: 13px; grid-column: 1 / -1;
}
.no-pos-icon { font-size: 36px; margin-bottom: 10px; opacity: 0.5; }

/* ============ COMPACT STATE ============ */
.compact-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 10px; }
.compact-card {
  background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.05);
  border-radius: 10px; padding: 12px 14px;
  display: flex; align-items: center; gap: 10px;
}
.compact-icon { font-size: 20px; }
.compact-info { flex: 1; }
.compact-label { font-size: 10px; color: #475569; text-transform: uppercase; letter-spacing: 0.5px; }
.compact-value { font-size: 14px; font-weight: 700; color: #cbd5e1; margin-top: 1px; font-variant-numeric: tabular-nums; }

/* ============ FOOTER ============ */
.footer { text-align: center; color: #334155; font-size: 10px; margin-top: 14px; letter-spacing: 0.3px; }

/* ============ REFRESH INDICATOR ============ */
.refresh-bar {
  height: 2px; background: rgba(255,255,255,0.05); border-radius: 1px;
  margin-bottom: 14px; overflow: hidden;
}
.refresh-progress {
  height: 100%; background: linear-gradient(90deg, #3b82f6, #10b981);
  border-radius: 1px; transition: width 1s linear;
  width: 0%;
}

/* ============ POSITIVE/NEGATIVE ANIMATIONS ============ */
@keyframes flash-green { 0%,100%{background:rgba(16,185,129,0.05)} 50%{background:rgba(16,185,129,0.15)} }
@keyframes flash-red { 0%,100%{background:rgba(239,68,68,0.05)} 50%{background:rgba(239,68,68,0.15)} }
.pos-card.flash-profit { animation: flash-green 0.6s ease; }
.pos-card.flash-loss { animation: flash-red 0.6s ease; }

/* Scrollbar */
::-webkit-scrollbar { width: 4px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 2px; }

/* Responsive */
@media (max-width: 900px) {
  .stats-grid { grid-template-columns: repeat(3, 1fr); }
  .pos-grid { grid-template-columns: 1fr; }
}
@media (max-width: 600px) {
  .stats-grid { grid-template-columns: repeat(2, 1fr); }
  .header { flex-direction: column; gap: 10px; }
  .header-right { text-align: left; }
}
</style>
</head>
<body>
<div class="container">
  
  <!-- Header -->
  <div class="header">
    <div class="header-left">
      <div class="logo">\u{1F916}</div>
      <div class="title-group">
        <div class="title">OpenClaw Trading</div>
        <div class="subtitle">Binance Futures Testnet \xB7 3x Hedge Mode</div>
      </div>
    </div>
    <div class="header-right">
      <div class="status-badge"><div class="status-dot"></div> \u8FD0\u884C\u4E2D</div>
      <div class="clock-row">
        <div class="clock" id="clock">--:--:--</div>
        <div class="next-scan">\u4E0B\u6B21\u626B\u63CF: <span id="nextScan">--</span></div>
      </div>
    </div>
  </div>

  <!-- Refresh Progress Bar -->
  <div class="refresh-bar"><div class="refresh-progress" id="refreshBar"></div></div>

  <!-- Stats Grid -->
  <div class="stats-grid">
    <div class="stat-card card-balance">
      <div class="stat-label">\u{1F4B0} \u8D26\u6237\u4F59\u989D</div>
      <div class="stat-value green" id="balance">$--</div>
      <div class="stat-sub">\u521D\u59CB $5,000</div>
    </div>
    <div class="stat-card card-pnl">
      <div class="stat-label">\u{1F4CA} \u603B\u76C8\u4E8F</div>
      <div class="stat-value" id="totalPnl">$--</div>
      <div class="stat-sub" id="totalPnlPct">--%</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">\u{1F4B5} \u6301\u4ED3\u6D6E\u52A8\u76C8\u4E8F</div>
      <div class="stat-value" id="totalPosPnl">$--</div>
      <div class="stat-sub">\u5747\u4EF7 <span id="avgPosPnlPct">--</span>%</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">\u{1F522} \u6301\u4ED3\u6570\u91CF</div>
      <div class="stat-value white" id="posCount">0/4</div>
      <div class="stat-sub">\u6700\u591A4\u4E2A\u4ED3\u4F4D</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">\u{1F4C8} 24h \u5E02\u573A\u6DA8\u8DCC</div>
      <div class="stat-value" id="marketChange">--</div>
      <div class="stat-sub">\u7EFC\u5408\u5E73\u5747</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">\u23F1\uFE0F \u8FD0\u884C\u65F6\u957F</div>
      <div class="stat-value blue" id="runningHours">--</div>
      <div class="stat-sub">\u5C0F\u65F6</div>
    </div>
  </div>

  <!-- Positions -->
  <div class="section">
    <div class="section-header">
      <div class="section-title"><span class="emoji">\u{1F4CA}</span> \u5F53\u524D\u6301\u4ED3</div>
      <div class="section-count" id="posCountBadge">0</div>
    </div>
    <div class="pos-grid" id="positions">
      <div class="no-pos">
        <div class="no-pos-icon">\u{1F4ED}</div>
        \u6682\u65E0\u6301\u4ED3\uFF0C\u7B49\u5F85\u4EA4\u6613\u4FE1\u53F7...
      </div>
    </div>
  </div>

  <!-- Quick Stats -->
  <div class="section">
    <div class="section-header">
      <div class="section-title"><span class="emoji">\u26A1</span> \u8D26\u6237\u6982\u89C8</div>
    </div>
    <div class="compact-grid" id="compactStats">
      <div class="compact-card">
        <div class="compact-icon">\u{1F3AF}</div>
        <div class="compact-info">
          <div class="compact-label">\u53EF\u5F00\u4ED3\u4F4D</div>
          <div class="compact-value" id="availSlots">--</div>
        </div>
      </div>
      <div class="compact-card">
        <div class="compact-icon">\u{1F4A7}</div>
        <div class="compact-info">
          <div class="compact-label">\u4FDD\u8BC1\u91D1\u4F59\u989D</div>
          <div class="compact-value" id="marginBalance">$--</div>
        </div>
      </div>
      <div class="compact-card">
        <div class="compact-icon">\u{1F4CC}</div>
        <div class="compact-info">
          <div class="compact-label">\u672A\u5B9E\u73B0\u76C8\u4E8F</div>
          <div class="compact-value" id="unrealizedPnl">$--</div>
        </div>
      </div>
      <div class="compact-card">
        <div class="compact-icon">\u{1F3E6}</div>
        <div class="compact-info">
          <div class="compact-label">\u94B1\u5305\u4F59\u989D</div>
          <div class="compact-value" id="walletBalance">$--</div>
        </div>
      </div>
    </div>
  </div>

  <div class="footer">
    OpenClaw Trading Panel v3 \xB7 \u6570\u636E\u6BCF5\u79D2\u81EA\u52A8\u5237\u65B0 \xB7 Binance Testnet
  </div>
</div>

<script>
let countdown = 5;
const REFRESH = 5;
let lastPnl = {};
let startTime = Date.now();

function formatTime(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString('zh-CN', { hour12: false }) + '.' + String(d.getMilliseconds()).padStart(3,'0');
}

function getNextScan() {
  // Approximate next 15min cycle
  const now = Date.now();
  const elapsed = (now - startTime) % (15 * 60 * 1000);
  const remaining = Math.ceil((15 * 60 * 1000 - elapsed) / 60000);
  return remaining + '\u5206\u949F\u540E';
}

function pnlColor(val) {
  const v = parseFloat(val);
  if (v > 0) return '#10b981';
  if (v < 0) return '#ef4444';
  return '#64748b';
}

function pnlSign(val) {
  const v = parseFloat(val);
  if (v > 0) return '+';
  return '';
}

function renderPositions(positions) {
  if (positions.length === 0) {
    return '<div class="no-pos"><div class="no-pos-icon">\u{1F4ED}</div>\u6682\u65E0\u6301\u4ED3\uFF0C\u7B49\u5F85\u4EA4\u6613\u4FE1\u53F7...</div>';
  }
  
  return positions.map(p => {
    const pnlVal = parseFloat(p.pnl);
    const pnlPct = parseFloat(p.pnlPct);
    const roeVal = parseFloat(p.roePct);
    const change24h = parseFloat(p.change24h);
    const pnlClass = pnlVal > 0 ? 'profit' : pnlVal < 0 ? 'loss' : 'neutral';
    const sideClass = p.isLong ? 'long' : 'short';
    const changeClass = change24h >= 0 ? 'up' : 'down';
    const changeSign = change24h >= 0 ? '+' : '';
    
    // Flash effect on change
    const flashClass = '';
    
    return '<div class="pos-card ' + sideClass + ' ' + flashClass + '" data-symbol="' + p.symbol + '">' +
      // Top row: symbol + side badge / leverage + 24h
      '<div class="pos-top">' +
        '<div class="pos-symbol-group">' +
          '<span class="pos-symbol">' + p.symbol + '</span>' +
          '<span class="pos-side-badge ' + sideClass + '">' + (p.isLong ? '\u25B2 \u591A' : '\u25BC \u7A7A') + '</span>' +
        '</div>' +
        '<div class="pos-meta">' +
          '<span class="pos-leverage">' + p.leverage + 'x \u6760\u6746</span>' +
          '<span class="pos-24h ' + changeClass + '">' + changeSign + p.change24h + '%</span>' +
        '</div>' +
      '</div>' +
      // Price row
      '<div class="pos-prices">' +
        '<div class="price-item"><span class="price-label">\u5F00\u4ED3\u4EF7</span><span class="price-value entry">$' + p.entry + '</span></div>' +
        '<div class="price-item"><span class="price-label">\u5F53\u524D\u4EF7</span><span class="price-value mark">$' + p.mark + '</span></div>' +
        '<div class="price-item"><span class="price-label">\u6570\u91CF</span><span class="price-value qty">' + p.qty + '</span></div>' +
      '</div>' +
      // PnL row - THE CORE
      '<div class="pos-pnl-row">' +
        '<div class="pnl-box">' +
          '<div class="pnl-box-label">\u6D6E\u52A8\u76C8\u4E8F $</div>' +
          '<div class="pnl-box-value ' + pnlClass + '">' + pnlSign(pnlVal) + '$' + p.pnl + '</div>' +
          '<div class="pnl-box-sub">\u7EA6 $' + (Math.abs(pnlVal) / parseFloat(p.margin || 1) * 100).toFixed(2) + '\u4FDD\u8BC1\u91D1</div>' +
        '</div>' +
        '<div class="pnl-box">' +
          '<div class="pnl-box-label">\u6301\u4ED3\u76C8\u4E8F\u7387</div>' +
          '<div class="pnl-box-value ' + pnlClass + '">' + pnlSign(pnlPct) + p.pnlPct + '%</div>' +
          '<div class="pnl-box-sub">\u76F8\u5BF9\u5F00\u4ED3\u4EF7</div>' +
        '</div>' +
        '<div class="pnl-box">' +
          '<div class="pnl-box-label">\u6536\u76CA\u7387 ROE%</div>' +
          '<div class="pnl-box-value ' + pnlClass + '">' + pnlSign(roeVal) + p.roePct + '%</div>' +
          '<div class="pnl-box-sub">\u4FDD\u8BC1\u91D1\u57FA\u51C6</div>' +
        '</div>' +
      '</div>' +
      // Bottom: margin info
      '<div class="pos-bottom">' +
        '<div class="pos-margin">\u4FDD\u8BC1\u91D1: <span>$' + p.margin + '</span></div>' +
        '<div class="pos-margin" style="color:#64748b;font-size:10px;">' + (p.isolated ? '\u9010\u4ED3' : '\u5168\u4ED3') + '</div>' +
      '</div>' +
    '</div>';
  }).join('');
}

async function load() {
  try {
    const r = await fetch('/api/status');
    const d = await r.json();
    
    // === Balance & Global PnL ===
    document.getElementById('balance').textContent = '$' + d.balance;
    
    const totalPnl = parseFloat(d.totalPnl);
    const totalPnlEl = document.getElementById('totalPnl');
    totalPnlEl.textContent = (totalPnl >= 0 ? '+$' : '-$') + Math.abs(totalPnl).toFixed(2);
    totalPnlEl.className = 'stat-value ' + (totalPnl >= 0 ? 'green' : 'red');
    document.getElementById('totalPnlPct').textContent = (totalPnl >= 0 ? '+' : '') + d.totalPnlPct + '%';
    
    // === Position PnL ===
    const posPnl = parseFloat(d.totalPosPnl);
    const posPnlEl = document.getElementById('totalPosPnl');
    posPnlEl.textContent = (posPnl >= 0 ? '+$' : '-$') + Math.abs(posPnl).toFixed(2);
    posPnlEl.className = 'stat-value ' + (posPnl >= 0 ? 'green' : 'red');
    document.getElementById('avgPosPnlPct').textContent = d.totalPosPnlPct;
    
    // === Position count ===
    document.getElementById('posCount').textContent = d.posCount + '/4';
    document.getElementById('posCountBadge').textContent = d.posCount;
    document.getElementById('availSlots').textContent = (4 - d.posCount) + ' \u4E2A\u53EF\u7528';
    
    // === 24h market change (average across positions) ===
    const positions = d.positions || [];
    if (positions.length > 0) {
      const avgChange = positions.reduce((sum, p) => sum + parseFloat(p.change24h), 0) / positions.length;
      const changeEl = document.getElementById('marketChange');
      changeEl.textContent = (avgChange >= 0 ? '+' : '') + avgChange.toFixed(2) + '%';
      changeEl.className = 'stat-value ' + (avgChange >= 0 ? 'green' : 'red');
    } else {
      document.getElementById('marketChange').textContent = '--';
    }
    
    // === Running time ===
    const hours = ((Date.now() - startTime) / 3600000).toFixed(1);
    document.getElementById('runningHours').textContent = hours;
    
    // === Positions ===
    document.getElementById('positions').innerHTML = renderPositions(positions);
    
    // === Clock ===
    document.getElementById('clock').textContent = formatTime(Date.now());
    document.getElementById('nextScan').textContent = getNextScan();
    
    // Reset countdown
    countdown = REFRESH;
  } catch(e) {
    console.error('Load error:', e);
  }
}

function tick() {
  countdown--;
  
  // Update clock every second
  document.getElementById('clock').textContent = formatTime(Date.now());
  
  // Update refresh bar
  const pct = ((REFRESH - countdown) / REFRESH) * 100;
  document.getElementById('refreshBar').style.width = pct + '%';
  
  if (countdown <= 0) {
    load();
  }
  
  setTimeout(tick, 1000);
}

// Initial load then start tick
load();
tick();
</script>
</body>
</html>`;
var server = http.createServer(async (req, res) => {
  if (req.url === "/api/status") {
    try {
      const data = await getData();
      res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
      res.end(JSON.stringify(data));
    } catch (e) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: e.message }));
    }
  } else {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(HTML);
  }
});
var PORT = 9999;
server.on("error", (e) => {
  console.error("Server error:", e.code, e.message);
  if (e.code === "EADDRINUSE") {
    console.log("Port in use, trying alternative...");
    server.listen(9998, () => console.log(`\u{1F4CA} Alternative Dashboard at http://localhost:9998`));
  }
});
server.listen(PORT, () => {
  console.log(`\u{1F4CA} Enhanced Dashboard at http://localhost:${PORT}`);
  console.log("Server started, keeping alive...");
});
setInterval(() => {
  console.log("tick");
}, 1e3);
