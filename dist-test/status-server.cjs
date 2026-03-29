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
var http = __toESM(require("http"), 1);
var import_https = __toESM(require("https"), 1);
var import_crypto = __toESM(require("crypto"), 1);
process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT:", err.message);
});
process.on("unhandledRejection", (reason) => {
  console.error("UNHANDLED:", String(reason));
});
var API_KEY = "rLS9djClUheJUJcqkUFGOylwCuSk1wVkdJMoHXN2TgfswhjBCsOPvh0202vBhAAN";
var SECRET = "EMu9DnZL7DSodz7dSkkSslVC9AtzUGQgQH4a4b9g19CysZdPO73udtnt1gTZjF7Y";
var INITIAL_BALANCE = 5e3;
function apiRequest(path, params = {}) {
  return new Promise((resolve, reject) => {
    const ts = Date.now();
    const qp = { ...params, timestamp: String(ts) };
    const query = Object.entries(qp).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
    const sig = import_crypto.default.createHmac("sha256", SECRET).update(query).digest("hex");
    const opts = { hostname: "testnet.binancefuture.com", path: `${path}?${query}&signature=${sig}`, method: "GET", headers: { "X-MBX-APIKEY": API_KEY } };
    const req = import_https.default.request(opts, (res) => {
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
  try {
    const [balData, posData] = await Promise.all([
      apiRequest("/fapi/v2/balance"),
      apiRequest("/fapi/v2/positionRisk")
    ]);
    const usdt = balData.find((a) => a.asset === "USDT");
    const balance = parseFloat(usdt?.availableBalance || "0");
    const walletBalance = parseFloat(usdt?.crossWalletBalance || usdt?.balance || "0");
    const activePositions = posData.filter((p) => parseFloat(p.positionAmt) !== 0);
    const tickerPromises = activePositions.map(async (p) => {
      try {
        const tick = await apiRequest("/fapi/v1/ticker/24hr", { symbol: p.symbol });
        return { symbol: p.symbol, change24h: parseFloat(tick.priceChangePercent || "0") };
      } catch {
        return { symbol: p.symbol, change24h: 0 };
      }
    });
    const changeMap = Object.fromEntries(await Promise.all(tickerPromises));
    const positions = activePositions.map((p) => {
      const amt = parseFloat(p.positionAmt);
      const entry = parseFloat(p.entryPrice);
      const mark = parseFloat(p.markPrice) || entry;
      const leverage = parseFloat(p.leverage || "3");
      const rawPnl = parseFloat(p.unRealizedProfit || "0");
      const notional = Math.abs(amt) * entry;
      const margin = notional / leverage;
      const posPnlPct = notional > 0 ? rawPnl / notional * 100 : 0;
      const roePct = margin > 0 ? rawPnl / margin * 100 : 0;
      const change24h = changeMap[p.symbol] || 0;
      return {
        symbol: p.symbol,
        side: amt > 0 ? "LONG" : "SHORT",
        qty: Math.abs(amt),
        entry: entry.toFixed(4),
        mark: mark.toFixed(4),
        pnl: rawPnl.toFixed(2),
        pnlPct: posPnlPct.toFixed(2),
        roePct: roePct.toFixed(2),
        leverage,
        change24h: change24h.toFixed(2),
        margin: margin.toFixed(2),
        notional: notional.toFixed(2),
        isLong: amt > 0,
        liquidationPrice: p.liquidationPrice || "0",
        isolated: p.isolated || false
      };
    });
    const totalPosPnl = positions.reduce((sum, p) => sum + parseFloat(p.pnl), 0);
    const totalPosPnlPct = positions.length > 0 ? positions.reduce((sum, p) => sum + parseFloat(p.pnlPct), 0) / positions.length : 0;
    const totalAccountPnl = walletBalance - INITIAL_BALANCE;
    const totalAccountPnlPct = totalAccountPnl / INITIAL_BALANCE * 100;
    return {
      balance: balance.toFixed(2),
      walletBalance: walletBalance.toFixed(2),
      totalPnl: totalPosPnl.toFixed(2),
      totalPnlPct: totalPosPnlPct.toFixed(2),
      totalAccountPnl: totalAccountPnl.toFixed(2),
      totalAccountPnlPct: totalAccountPnlPct.toFixed(2),
      positions,
      posCount: positions.length,
      timestamp: Date.now()
    };
  } catch (e) {
    return { error: e.message, positions: [], posCount: 0 };
  }
}
var HTML = `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>OpenClaw Trading Dashboard</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { 
  font-family: 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif; 
  background: linear-gradient(135deg, #0a0e17 0%, #111827 50%, #0f172a 100%);
  color: #e2e8f0; min-height: 100vh; padding: 20px; font-size: 14px;
}
.container { max-width: 1400px; margin: 0 auto; }

/* ============ HEADER ============ */
.header {
  display: flex; justify-content: space-between; align-items: center;
  background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08);
  border-radius: 16px; padding: 16px 24px; margin-bottom: 20px;
  cursor: pointer; transition: all 0.3s;
}
.header:hover { background: rgba(255,255,255,0.05); border-color: rgba(255,255,255,0.12); }
.header-left { display: flex; align-items: center; gap: 14px; }
.logo { font-size: 28px; }
.title { font-size: 20px; font-weight: 700; color: #f8fafc; }
.subtitle { font-size: 11px; color: #64748b; margin-top: 2px; }
.header-right { text-align: right; }
.live-badge {
  display: inline-flex; align-items: center; gap: 6px;
  background: rgba(0,200,83,0.12); border: 1px solid #00c853;
  color: #00c853; padding: 5px 14px; border-radius: 20px;
  font-size: 12px; font-weight: 600;
}
.live-dot { width: 7px; height: 7px; background: #00c853; border-radius: 50%; animation: pulse 2s infinite; }
@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
.clock { font-size: 12px; color: #94a3b8; margin-top: 4px; font-variant-numeric: tabular-nums; }

/* ============ STATS GRID ============ */
.stats-grid {
  display: grid; grid-template-columns: repeat(6, 1fr); gap: 12px; margin-bottom: 20px;
}
.stat-card {
  background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.07);
  border-radius: 14px; padding: 16px 18px; cursor: pointer;
  transition: all 0.3s;
}
.stat-card:hover { transform: translateY(-2px); box-shadow: 0 8px 25px rgba(0,0,0,0.3); border-color: rgba(255,255,255,0.15); }
.stat-card.green { border-color: rgba(16,185,129,0.3); background: rgba(16,185,129,0.05); }
.stat-card.red { border-color: rgba(239,68,68,0.3); background: rgba(239,68,68,0.05); }
.stat-label { font-size: 10px; color: #64748b; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 8px; }
.stat-value { font-size: 22px; font-weight: 700; font-variant-numeric: tabular-nums; }
.stat-value.green { color: #10b981; }
.stat-value.red { color: #ef4444; }
.stat-value.blue { color: #3b82f6; }
.stat-value.white { color: #f1f5f9; }
.stat-sub { font-size: 10px; color: #475569; margin-top: 4px; }

/* ============ SECTION ============ */
.section { 
  background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05);
  border-radius: 16px; padding: 20px; margin-bottom: 16px;
}
.section-title { 
  font-size: 15px; font-weight: 700; color: #f8fafc; margin-bottom: 16px;
  display: flex; align-items: center; gap: 8px;
}
.section-title span { color: #64748b; font-weight: 400; font-size: 12px; }

/* ============ POSITION CARDS ============ */
.pos-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)); gap: 14px; }
.pos-card {
  background: linear-gradient(145deg, rgba(30,41,59,0.95), rgba(15,23,42,0.98));
  border-radius: 14px; padding: 0; overflow: hidden;
  border: 1px solid rgba(255,255,255,0.08);
  cursor: pointer; transition: all 0.3s;
}
.pos-card:hover { transform: translateY(-3px); box-shadow: 0 12px 35px rgba(0,0,0,0.4); }
.pos-card.long { border-color: rgba(16,185,129,0.35); }
.pos-card.short { border-color: rgba(239,68,68,0.35); }

/* Card header bar */
.pos-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 14px 16px; border-bottom: 1px solid rgba(255,255,255,0.05);
}
.pos-symbol { font-size: 17px; font-weight: 800; color: #f1f5f9; }
.pos-badge {
  padding: 4px 12px; border-radius: 6px; font-size: 11px; font-weight: 700;
}
.pos-badge.long { background: rgba(16,185,129,0.15); color: #10b981; border: 1px solid rgba(16,185,129,0.3); }
.pos-badge.short { background: rgba(239,68,68,0.15); color: #ef4444; border: 1px solid rgba(239,68,68,0.3); }

/* Main PnL section */
.pos-pnl-main {
  padding: 16px; text-align: center;
}
.pos-pnl-value { font-size: 32px; font-weight: 800; font-variant-numeric: tabular-nums; line-height: 1.2; }
.pos-pnl-value.profit { color: #10b981; }
.pos-pnl-value.loss { color: #ef4444; }
.pos-pnl-sub { font-size: 12px; color: #64748b; margin-top: 4px; }
.pos-pnl-sub span { font-weight: 600; }

/* Price row */
.pos-prices {
  display: grid; grid-template-columns: 1fr 1fr 1fr 1fr;
  gap: 1px; background: rgba(255,255,255,0.05); 
}
.pos-price { padding: 10px 12px; text-align: center; background: rgba(15,23,42,0.8); }
.pos-price-label { font-size: 9px; color: #475569; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }
.pos-price-value { font-size: 13px; font-weight: 700; color: #cbd5e1; font-variant-numeric: tabular-nums; }
.pos-price-value.up { color: #10b981; }
.pos-price-value.down { color: #ef4444; }

/* Footer */
.pos-footer {
  display: flex; justify-content: space-between; align-items: center;
  padding: 10px 14px; background: rgba(0,0,0,0.2);
  font-size: 11px; color: #475569;
}
.pos-footer span { color: #64748b; }
.pos-expand { font-size: 12px; color: #64748b; transition: transform 0.3s; }
.pos-expand.open { transform: rotate(180deg); }

/* ============ EXPANDED DETAILS ============ */
.pos-details {
  display: none; padding: 16px;
  border-top: 1px solid rgba(255,255,255,0.06);
  background: rgba(0,0,0,0.2);
}
.pos-details.open { display: block; }
.detail-row {
  display: flex; justify-content: space-between; padding: 8px 0;
  border-bottom: 1px solid rgba(255,255,255,0.04);
}
.detail-row:last-child { border-bottom: none; }
.detail-label { font-size: 12px; color: #64748b; }
.detail-value { font-size: 12px; font-weight: 600; color: #94a3b8; }
.detail-value.highlight { color: #10b981; font-size: 14px; }

/* ROE bar */
.roe-bar { margin-top: 12px; }
.roe-bar-label { display: flex; justify-content: space-between; font-size: 10px; color: #475569; margin-bottom: 6px; }
.roe-track { height: 6px; background: rgba(255,255,255,0.08); border-radius: 3px; overflow: hidden; }
.roe-fill { height: 100%; border-radius: 3px; transition: width 0.5s; }
.roe-fill.profit { background: linear-gradient(90deg, #10b981, #34d399); }
.roe-fill.loss { background: linear-gradient(90deg, #ef4444, #f87171); }

/* ============ EMPTY STATE ============ */
.no-pos {
  text-align: center; padding: 50px 20px; color: #475569; font-size: 13px;
}
.no-pos-icon { font-size: 40px; margin-bottom: 12px; opacity: 0.5; }

/* ============ MODAL ============ */
.modal-overlay {
  display: none; position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.7); z-index: 1000; align-items: center; justify-content: center;
  backdrop-filter: blur(4px);
}
.modal-overlay.show { display: flex; }
.modal {
  background: linear-gradient(145deg, #1e293b, #0f172a);
  border: 1px solid rgba(255,255,255,0.1); border-radius: 16px;
  padding: 24px; max-width: 480px; width: 90%;
  animation: modalIn 0.3s ease;
}
@keyframes modalIn { from { transform: scale(0.95); opacity: 0; } }
.modal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.modal-title { font-size: 16px; font-weight: 700; color: #f1f5f9; }
.modal-close { background: none; border: none; color: #64748b; font-size: 20px; cursor: pointer; transition: color 0.2s; }
.modal-close:hover { color: #ef4444; }
.modal-info { display: flex; flex-direction: column; gap: 12px; }
.modal-row { display: flex; justify-content: space-between; padding: 10px 14px; background: rgba(255,255,255,0.03); border-radius: 10px; }
.modal-row-label { font-size: 12px; color: #64748b; }
.modal-row-value { font-size: 13px; font-weight: 600; color: #cbd5e1; }
.modal-row-value.green { color: #10b981; }
.modal-row-value.red { color: #ef4444; }
.modal-footer { margin-top: 20px; text-align: center; font-size: 11px; color: #475569; }

/* ============ REFRESH BAR ============ */
.refresh-bar {
  height: 3px; background: rgba(255,255,255,0.05); border-radius: 2px;
  margin-bottom: 20px; overflow: hidden;
}
.refresh-progress {
  height: 100%; background: linear-gradient(90deg, #3b82f6, #10b981);
  border-radius: 2px; transition: width 1s linear; width: 0%;
}

/* ============ FOOTER ============ */
.footer { text-align: center; color: #334155; font-size: 11px; margin-top: 20px; }

/* ============ RESPONSIVE ============ */
@media (max-width: 1000px) { .stats-grid { grid-template-columns: repeat(3, 1fr); } }
@media (max-width: 700px) { .stats-grid { grid-template-columns: repeat(2, 1fr); } .header { flex-direction: column; gap: 12px; } .header-right { text-align: left; } }
</style>
</head>
<body>
<div class="container">
  
  <!-- Header -->
  <div class="header" onclick="showModal('system')">
    <div class="header-left">
      <div class="logo">\u{1F916}</div>
      <div>
        <div class="title">OpenClaw Trading</div>
        <div class="subtitle">Binance Futures Testnet \xB7 3x Hedge Mode \xB7 \u70B9\u51FB\u67E5\u770B\u7CFB\u7EDF\u4FE1\u606F</div>
      </div>
    </div>
    <div class="header-right">
      <div class="live-badge"><div class="live-dot"></div> LIVE</div>
      <div class="clock" id="clock">--:--:--</div>
    </div>
  </div>

  <!-- Refresh Bar -->
  <div class="refresh-bar"><div class="refresh-progress" id="refreshBar"></div></div>

  <!-- Stats Grid -->
  <div class="stats-grid">
    <div class="stat-card green" onclick="showModal('balance')">
      <div class="stat-label">\u{1F4B0} \u8D26\u6237\u4F59\u989D</div>
      <div class="stat-value green" id="balance">$--</div>
      <div class="stat-sub">\u521D\u59CB $5,000</div>
    </div>
    <div class="stat-card" id="cardPosPnl" onclick="showModal('pnl')">
      <div class="stat-label">\u{1F4CA} \u6301\u4ED3\u76C8\u4E8F</div>
      <div class="stat-value" id="posPnl">$--</div>
      <div class="stat-sub" id="posPnlPct">--%</div>
    </div>
    <div class="stat-card" id="cardAccPnl" onclick="showModal('account')">
      <div class="stat-label">\u{1F3E6} \u8D26\u6237\u603B\u76C8\u4E8F</div>
      <div class="stat-value" id="accPnl">$--</div>
      <div class="stat-sub" id="accPnlPct">--%</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">\u{1F522} \u6301\u4ED3\u6570\u91CF</div>
      <div class="stat-value white" id="posCount">0/4</div>
      <div class="stat-sub">\u6700\u591A4\u4E2A\u4ED3\u4F4D</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">\u{1F4C8} 24h \u6DA8\u8DCC</div>
      <div class="stat-value" id="marketChange">--</div>
      <div class="stat-sub">\u7EFC\u5408\u5E73\u5747</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">\u23F1\uFE0F \u8FD0\u884C\u65F6\u957F</div>
      <div class="stat-value blue" id="runningHours">--</div>
      <div class="stat-sub">\u5C0F\u65F6</div>
    </div>
  </div>

  <!-- Positions Section -->
  <div class="section">
    <div class="section-title">\u{1F4CA} \u5F53\u524D\u6301\u4ED3 <span>\uFF08\u70B9\u51FB\u5361\u7247\u5C55\u5F00\u8BE6\u60C5\uFF09</span></div>
    <div class="pos-grid" id="positions">
      <div class="no-pos">
        <div class="no-pos-icon">\u{1F4ED}</div>
        \u6682\u65E0\u6301\u4ED3\uFF0C\u7B49\u5F85\u4EA4\u6613\u4FE1\u53F7...
      </div>
    </div>
  </div>

  <div class="footer">OpenClaw Trading Dashboard v5 \xB7 \u6570\u636E\u6BCF5\u79D2\u81EA\u52A8\u5237\u65B0 \xB7 Binance Testnet</div>
</div>

<!-- Modal -->
<div class="modal-overlay" id="modalOverlay" onclick="if(event.target===this)closeModal()">
  <div class="modal">
    <div class="modal-header">
      <div class="modal-title" id="modalTitle">\u8BE6\u60C5</div>
      <button class="modal-close" onclick="closeModal()">\u2715</button>
    </div>
    <div class="modal-info" id="modalInfo"></div>
    <div class="modal-footer" id="modalFooter"></div>
  </div>
</div>

<script>
let countdown = 5;
const REFRESH = 5;
let startTime = Date.now();
let expandedCards = new Set();

function formatTime(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString('zh-CN', { hour12: false }) + '.' + String(d.getMilliseconds()).padStart(3,'0');
}

function pnlSign(v) { return parseFloat(v) >= 0 ? '+' : ''; }
function pnlClass(v) { return parseFloat(v) >= 0 ? 'profit' : 'loss'; }
function pnlColor(v) { return parseFloat(v) >= 0 ? '#10b981' : '#ef4444'; }

// Toggle card expansion
function toggleCard(symbol) {
  if (expandedCards.has(symbol)) {
    expandedCards.delete(symbol);
  } else {
    expandedCards.add(symbol);
  }
  renderPositions(window._lastData?.positions || []);
}

// Render position cards
function renderPositions(positions) {
  if (positions.length === 0) {
    return '<div class="no-pos"><div class="no-pos-icon">\u{1F4ED}</div>\u6682\u65E0\u6301\u4ED3\uFF0C\u7B49\u5F85\u4EA4\u6613\u4FE1\u53F7...</div>';
  }
  
  return positions.map(p => {
    const pnlV = parseFloat(p.pnl);
    const pClass = pnlV >= 0 ? 'profit' : 'loss';
    const change24h = parseFloat(p.change24h);
    const changeClass = change24h >= 0 ? 'up' : 'down';
    const isOpen = expandedCards.has(p.symbol);
    
    // ROE percentage for bar
    const roeV = Math.abs(parseFloat(p.roePct));
    const roeWidth = Math.min(roeV * 10, 100); // scale for visual
    
    return '<div class="pos-card ' + (p.isLong ? 'long' : 'short') + '" onclick="toggleCard('' + p.symbol + '')">' +
      // Header
      '<div class="pos-header">' +
        '<div class="pos-symbol">' + p.symbol + '</div>' +
        '<div class="pos-badge ' + (p.isLong ? 'long' : 'short') + '">' + (p.isLong ? '\u25B2 \u505A\u591A' : '\u25BC \u505A\u7A7A') + ' ' + p.leverage + 'x</div>' +
      '</div>' +
      
      // Main PnL
      '<div class="pos-pnl-main">' +
        '<div class="pos-pnl-value ' + pClass + '">' + pnlSign(pnlV) + '$' + p.pnl + '</div>' +
        '<div class="pos-pnl-sub">\u6301\u4ED3\u76C8\u4E8F\u7387: <span>' + pnlSign(p.pnlPct) + p.pnlPct + '%</span> \xB7 ROE: <span>' + pnlSign(p.roePct) + p.roePct + '%</span></div>' +
      '</div>' +
      
      // Price row
      '<div class="pos-prices">' +
        '<div class="pos-price"><div class="pos-price-label">\u5F00\u4ED3\u4EF7</div><div class="pos-price-value">$' + p.entry + '</div></div>' +
        '<div class="pos-price"><div class="pos-price-label">\u5F53\u524D\u4EF7</div><div class="pos-price-value">$' + p.mark + '</div></div>' +
        '<div class="pos-price"><div class="pos-price-label">\u6570\u91CF</div><div class="pos-price-value">' + p.qty + '</div></div>' +
        '<div class="pos-price"><div class="pos-price-label">24h\u6DA8\u8DCC</div><div class="pos-price-value ' + changeClass + '">' + pnlSign(p.change24h) + p.change24h + '%</div></div>' +
      '</div>' +
      
      // Footer
      '<div class="pos-footer">' +
        '<div>\u4FDD\u8BC1\u91D1: <span>$' + p.margin + '</span> \xB7 \u4EF7\u503C: <span>$' + p.notional + '</span></div>' +
        '<div class="pos-expand ' + (isOpen ? 'open' : '') + '">' + (isOpen ? '\u25B2 \u6536\u8D77' : '\u25BC \u5C55\u5F00') + '</div>' +
      '</div>' +
      
      // Expanded details
      '<div class="pos-details ' + (isOpen ? 'open' : '') + '">' +
        '<div class="detail-row"><div class="detail-label">\u6301\u4ED3\u65B9\u5411</div><div class="detail-value" style="color:' + pnlColor(p.pnl) + '">' + (p.isLong ? '\u25B2 \u505A\u591A' : '\u25BC \u505A\u7A7A') + '</div></div>' +
        '<div class="detail-row"><div class="detail-label">\u5F00\u4ED3\u4EF7\u683C</div><div class="detail-value">$' + p.entry + '</div></div>' +
        '<div class="detail-row"><div class="detail-label">\u5F53\u524D\u4EF7\u683C</div><div class="detail-value">$' + p.mark + '</div></div>' +
        '<div class="detail-row"><div class="detail-label">\u6301\u4ED3\u6570\u91CF</div><div class="detail-value">' + p.qty + '</div></div>' +
        '<div class="detail-row"><div class="detail-label">\u6760\u6746\u500D\u6570</div><div class="detail-value">' + p.leverage + 'x</div></div>' +
        '<div class="detail-row"><div class="detail-label">\u4FDD\u8BC1\u91D1</div><div class="detail-value">$' + p.margin + '</div></div>' +
        '<div class="detail-row"><div class="detail-label">\u4ED3\u4F4D\u4EF7\u503C</div><div class="detail-value">$' + p.notional + '</div></div>' +
        '<div class="detail-row"><div class="detail-label">\u5F3A\u5E73\u4EF7\u683C</div><div class="detail-value">$' + p.liquidationPrice + '</div></div>' +
        '<div class="detail-row"><div class="detail-label">\u6D6E\u52A8\u76C8\u4E8F</div><div class="detail-value highlight" style="color:' + pnlColor(p.pnl) + '">' + pnlSign(p.pnl) + '$' + p.pnl + '</div></div>' +
        '<div class="detail-row"><div class="detail-label">\u6301\u4ED3\u76C8\u4E8F\u7387</div><div class="detail-value" style="color:' + pnlColor(p.pnlPct) + '">' + pnlSign(p.pnlPct) + p.pnlPct + '%</div></div>' +
        '<div class="detail-row"><div class="detail-label">\u6536\u76CA\u7387 ROE</div><div class="detail-value" style="color:' + pnlColor(p.roePct) + '">' + pnlSign(p.roePct) + p.roePct + '%</div></div>' +
        '<div class="detail-row"><div class="detail-label">24h \u6DA8\u8DCC</div><div class="detail-value" style="color:' + pnlColor(p.change24h) + '">' + pnlSign(p.change24h) + p.change24h + '%</div></div>' +
        '<div class="detail-row"><div class="detail-label">\u6301\u4ED3\u6A21\u5F0F</div><div class="detail-value">' + (p.isolated ? '\u9010\u4ED3' : '\u5168\u4ED3') + '</div></div>' +
        
        // ROE bar
        '<div class="roe-bar">' +
          '<div class="roe-bar-label"><span>\u6536\u76CA\u7387\u8FDB\u5EA6</span><span style="color:' + pnlColor(p.roePct) + '">' + pnlSign(p.roePct) + p.roePct + '%</span></div>' +
          '<div class="roe-track"><div class="roe-fill ' + pClass + '" style="width:' + roeWidth + '%"></div></div>' +
        '</div>' +
      '</div>' +
    '</div>';
  }).join('');
}

// Modal functions
function showModal(type) {
  const d = window._lastData;
  if (!d) return;
  
  const rows = [];
  
  if (type === 'system') {
    document.getElementById('modalTitle').textContent = '\u{1F916} \u7CFB\u7EDF\u4FE1\u606F';
    rows.push({ label: '\u9762\u677F\u7248\u672C', value: 'v5.0 \u4E13\u4E1A\u7248' });
    rows.push({ label: '\u6570\u636E\u5237\u65B0', value: '\u6BCF5\u79D2\u81EA\u52A8' });
    rows.push({ label: '\u4EA4\u6613\u5E73\u53F0', value: 'Binance Futures Testnet' });
    rows.push({ label: '\u7B56\u7565\u6A21\u5F0F', value: '3x Hedge Mode' });
    rows.push({ label: '\u6700\u5927\u6301\u4ED3', value: '4\u4E2A\u4ED3\u4F4D' });
    rows.push({ label: '\u521D\u59CB\u672C\u91D1', value: '$5,000 USDT' });
    rows.push({ label: '\u8FD0\u884C\u65F6\u957F', value: ((Date.now() - startTime) / 3600000).toFixed(1) + ' \u5C0F\u65F6' });
    document.getElementById('modalFooter').textContent = 'OpenClaw Trading Dashboard';
  } 
  else if (type === 'balance') {
    document.getElementById('modalTitle').textContent = '\u{1F4B0} \u8D26\u6237\u4F59\u989D\u8BE6\u60C5';
    rows.push({ label: '\u53EF\u7528\u4F59\u989D', value: '$' + d.balance, class: 'green' });
    rows.push({ label: '\u94B1\u5305\u603B\u989D', value: '$' + d.walletBalance });
    rows.push({ label: '\u521D\u59CB\u672C\u91D1', value: '$5,000.00' });
    rows.push({ label: '\u6301\u4ED3\u4FDD\u8BC1\u91D1', value: '$' + (d.positions.reduce((s,p)=>s+parseFloat(p.margin),0)).toFixed(2) });
    rows.push({ label: '\u6301\u4ED3\u6570\u91CF', value: d.posCount + ' \u4E2A' });
    document.getElementById('modalFooter').textContent = '\u6240\u6709\u91D1\u989D\u5355\u4F4D\u5747\u4E3A USDT';
  }
  else if (type === 'pnl') {
    const pClass = parseFloat(d.totalPnl) >= 0 ? 'green' : 'red';
    document.getElementById('modalTitle').textContent = '\u{1F4CA} \u6301\u4ED3\u76C8\u4E8F\u8BF4\u660E';
    rows.push({ label: '\u6301\u4ED3\u603B\u76C8\u4E8F', value: pnlSign(d.totalPnl) + '$' + d.totalPnl, class: pClass });
    rows.push({ label: '\u5E73\u5747\u76C8\u4E8F\u7387', value: pnlSign(d.totalPnlPct) + d.totalPnlPct + '%', class: pClass });
    rows.push({ label: '\u8BA1\u7B97\u65B9\u5F0F', value: '\u505A\u591A=(\u5F53\u524D-\u5F00\u4ED3)\xD7\u6570\u91CF', class: '' });
    rows.push({ label: '', value: '\u505A\u7A7A=(\u5F00\u4ED3-\u5F53\u524D)\xD7\u6570\u91CF', class: '' });
    document.getElementById('modalFooter').textContent = '\u4EC5\u663E\u793A\u5F53\u524D\u6301\u4ED3\u7684\u6D6E\u52A8\u76C8\u4E8F\uFF0C\u4E0D\u542B\u5DF2\u5B9E\u73B0\u76C8\u4E8F';
  }
  else if (type === 'account') {
    const pClass = parseFloat(d.totalAccountPnl) >= 0 ? 'green' : 'red';
    document.getElementById('modalTitle').textContent = '\u{1F3E6} \u8D26\u6237\u603B\u76C8\u4E8F\u8BF4\u660E';
    rows.push({ label: '\u8D26\u6237\u603B\u76C8\u4E8F', value: pnlSign(d.totalAccountPnl) + '$' + d.totalAccountPnl, class: pClass });
    rows.push({ label: '\u76C8\u4E8F\u6BD4\u4F8B', value: pnlSign(d.totalAccountPnlPct) + d.totalAccountPnlPct + '%', class: pClass });
    rows.push({ label: '\u8BA1\u7B97\u65B9\u5F0F', value: '\u94B1\u5305\u603B\u989D - \u521D\u59CB\u672C\u91D1', class: '' });
    rows.push({ label: '', value: '$' + d.walletBalance + ' - $5,000', class: '' });
    rows.push({ label: '\u5DF2\u5B9E\u73B0\u76C8\u4E8F', value: '$' + (parseFloat(d.walletBalance) - parseFloat(d.balance) - parseFloat(d.totalPnl)).toFixed(2) });
    document.getElementById('modalFooter').textContent = '\u8D26\u6237\u603B\u76C8\u4E8F = \u5DF2\u5B9E\u73B0\u76C8\u4E8F + \u6D6E\u52A8\u76C8\u4E8F';
  }
  
  document.getElementById('modalInfo').innerHTML = rows.map(r => 
    '<div class="modal-row">' +
      '<div class="modal-row-label">' + r.label + '</div>' +
      '<div class="modal-row-value ' + (r.class || '') + '">' + r.value + '</div>' +
    '</div>'
  ).join('');
  
  document.getElementById('modalOverlay').classList.add('show');
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('show');
}

// Load data
async function load() {
  try {
    const r = await fetch('/api/status');
    const d = await r.json();
    window._lastData = d;
    
    if (d.error) {
      document.getElementById('balance').textContent = '\u9519\u8BEF';
      return;
    }
    
    const pnl = parseFloat(d.totalPnl);
    const accPnl = parseFloat(d.totalAccountPnl);
    
    // Balance
    document.getElementById('balance').textContent = '$' + d.balance;
    
    // Position PnL
    const posPnlEl = document.getElementById('posPnl');
    posPnlEl.textContent = (pnl >= 0 ? '+$' : '-$') + Math.abs(pnl).toFixed(2);
    posPnlEl.className = 'stat-value ' + (pnl >= 0 ? 'green' : 'red');
    document.getElementById('posPnlPct').textContent = (pnl >= 0 ? '+' : '') + d.totalPnlPct + '%';
    document.getElementById('cardPosPnl').className = 'stat-card ' + (pnl >= 0 ? 'green' : 'red');
    
    // Account PnL
    const accPnlEl = document.getElementById('accPnl');
    accPnlEl.textContent = (accPnl >= 0 ? '+$' : '-$') + Math.abs(accPnl).toFixed(2);
    accPnlEl.className = 'stat-value ' + (accPnl >= 0 ? 'green' : 'red');
    document.getElementById('accPnlPct').textContent = (accPnl >= 0 ? '+' : '') + d.totalAccountPnlPct + '%';
    document.getElementById('cardAccPnl').className = 'stat-card ' + (accPnl >= 0 ? 'green' : 'red');
    
    // Position count
    document.getElementById('posCount').textContent = d.posCount + '/4';
    
    // Market change
    if (d.positions.length > 0) {
      const avgChange = d.positions.reduce((s,p) => s + parseFloat(p.change24h), 0) / d.positions.length;
      const changeEl = document.getElementById('marketChange');
      changeEl.textContent = (avgChange >= 0 ? '+' : '') + avgChange.toFixed(2) + '%';
      changeEl.className = 'stat-value ' + (avgChange >= 0 ? 'green' : 'red');
    }
    
    // Running time
    document.getElementById('runningHours').textContent = ((Date.now() - startTime) / 3600000).toFixed(1);
    
    // Positions
    document.getElementById('positions').innerHTML = renderPositions(d.positions);
    
    // Clock
    document.getElementById('clock').textContent = formatTime(Date.now());
    
    countdown = REFRESH;
  } catch(e) {
    console.error('Load error:', e);
  }
}

function tick() {
  countdown--;
  document.getElementById('clock').textContent = formatTime(Date.now());
  document.getElementById('refreshBar').style.width = ((REFRESH - countdown) / REFRESH * 100) + '%';
  if (countdown <= 0) load();
  setTimeout(tick, 1000);
}

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
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(HTML);
  }
});
server.on("error", (e) => {
  console.error("Server error:", e.code);
});
server.listen(9999, () => console.log("\u2705 Dashboard at http://localhost:9999"));
setInterval(() => {
}, 1e3);
