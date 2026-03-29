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

// dashboard.ts
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
    return { error: e.message, positions: [], posCount: 0, balance: "0", walletBalance: "0", totalPnl: "0", totalPnlPct: "0", totalAccountPnl: "0", totalAccountPnlPct: "0" };
  }
}
var HTML = `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>OpenClaw Trading Dashboard v6</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;background:#0a0e17;color:#e2e8f0;min-height:100vh;padding:20px;font-size:14px}
.container{max-width:1400px;margin:0 auto}
.header{display:flex;justify-content:space-between;align-items:center;background:linear-gradient(135deg,rgba(30,41,59,0.9),rgba(15,23,42,0.95));border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:20px 28px;margin-bottom:20px}
.header-left{display:flex;align-items:center;gap:16px}
.logo{font-size:32px}
.header-title{font-size:22px;font-weight:800;color:#f8fafc;letter-spacing:0.5px}
.header-sub{font-size:11px;color:#64748b;margin-top:3px}
.header-right{text-align:right}
.live-badge{display:inline-flex;align-items:center;gap:8px;background:rgba(0,200,83,0.15);border:1px solid #00c853;color:#00c853;padding:6px 16px;border-radius:20px;font-size:13px;font-weight:700}
.live-dot{width:8px;height:8px;background:#00c853;border-radius:50%;animation:livePulse 2s infinite}
@keyframes livePulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:0.5;transform:scale(0.8)}}
.clock-box{margin-top:8px;text-align:right}
.clock{font-size:24px;font-weight:700;color:#f1f5f9;font-variant-numeric:tabular-nums;letter-spacing:1px}
.date{font-size:11px;color:#64748b;margin-top:2px}
.refresh-info{font-size:10px;color:#475569;margin-top:4px}
.stats-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:20px}
.stat-card{background:linear-gradient(145deg,rgba(30,41,59,0.9),rgba(15,23,42,0.95));border-radius:16px;padding:20px;border:1px solid rgba(255,255,255,0.08);transition:all 0.3s;cursor:pointer;position:relative;overflow:hidden}
.stat-card:hover{transform:translateY(-3px);box-shadow:0 10px 30px rgba(0,0,0,0.4);border-color:rgba(255,255,255,0.15)}
.stat-card.green-accent{border-color:rgba(16,185,129,0.3)}
.stat-card.red-accent{border-color:rgba(239,68,68,0.3)}
.stat-card::before{content:'';position:absolute;top:0;left:0;right:0;height:3px;border-radius:16px 16px 0 0}
.stat-card.green-accent::before{background:linear-gradient(90deg,#10b981,#34d399)}
.stat-card.red-accent::before{background:linear-gradient(90deg,#ef4444,#f87171)}
.stat-icon{font-size:24px;margin-bottom:10px}
.stat-label{font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px}
.stat-value{font-size:28px;font-weight:800;font-variant-numeric:tabular-nums;line-height:1.1}
.stat-value.green{color:#10b981}
.stat-value.red{color:#ef4444}
.stat-value.white{color:#f1f5f9}
.stat-value.blue{color:#3b82f6}
.stat-meta{font-size:11px;color:#475569;margin-top:6px}
.stat-meta span{color:#64748b;font-weight:600}
.section{background:linear-gradient(145deg,rgba(30,41,59,0.8),rgba(15,23,42,0.9));border:1px solid rgba(255,255,255,0.06);border-radius:16px;padding:24px;margin-bottom:16px}
.section-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:20px}
.section-title{font-size:16px;font-weight:700;color:#f8fafc;display:flex;align-items:center;gap:10px}
.section-title .icon{font-size:20px}
.section-title .hint{color:#64748b;font-weight:400;font-size:13px}
.section-count{background:rgba(245,158,11,0.15);color:#f59e0b;padding:4px 14px;border-radius:20px;font-size:13px;font-weight:700}
.pos-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(380px,1fr));gap:16px}
.pos-card{background:linear-gradient(145deg,rgba(30,41,59,0.95),rgba(15,23,42,0.98));border-radius:16px;overflow:hidden;border:1px solid rgba(255,255,255,0.08);cursor:pointer;transition:all 0.3s}
.pos-card:hover{transform:translateY(-4px);box-shadow:0 15px 40px rgba(0,0,0,0.5)}
.pos-card.long{border-color:rgba(16,185,129,0.3)}
.pos-card.short{border-color:rgba(239,68,68,0.3)}
.pos-topbar{display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid rgba(255,255,255,0.06)}
.pos-symbol-box{display:flex;flex-direction:column;gap:4px}
.pos-symbol{font-size:20px;font-weight:800;color:#f1f5f9;letter-spacing:0.5px}
.pos-direction{display:inline-flex;align-items:center;gap:6px;padding:4px 12px;border-radius:6px;font-size:12px;font-weight:700;width:fit-content}
.pos-direction.long{background:rgba(16,185,129,0.15);color:#10b981;border:1px solid rgba(16,185,129,0.3)}
.pos-direction.short{background:rgba(239,68,68,0.15);color:#ef4444;border:1px solid rgba(239,68,68,0.3)}
.pos-meta{text-align:right}
.pos-leverage{font-size:12px;color:#94a3b8;background:rgba(255,255,255,0.06);padding:3px 10px;border-radius:6px;display:inline-block;margin-bottom:4px}
.pos-24h{font-size:13px;font-weight:700;font-variant-numeric:tabular-nums}
.pos-pnl-section{padding:20px;text-align:center}
.pos-pnl-money{font-size:36px;font-weight:900;font-variant-numeric:tabular-nums;line-height:1}
.pos-pnl-money.profit{color:#10b981}
.pos-pnl-money.loss{color:#ef4444}
.pos-pnl-percent{font-size:16px;font-weight:700;margin-top:6px;opacity:0.8}
.pos-pnl-percent.profit{color:#34d399}
.pos-pnl-percent.loss{color:#f87171}
.pos-price-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:rgba(255,255,255,0.05);margin:0 16px 16px;border-radius:10px;overflow:hidden}
.pos-price-cell{background:rgba(15,23,42,0.8);padding:12px 8px;text-align:center}
.pos-price-cell-label{font-size:9px;color:#475569;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:5px}
.pos-price-cell-value{font-size:14px;font-weight:700;color:#cbd5e1;font-variant-numeric:tabular-nums}
.pos-footer{display:flex;justify-content:space-between;align-items:center;padding:12px 20px;background:rgba(0,0,0,0.2);border-top:1px solid rgba(255,255,255,0.04)}
.pos-margin-info{font-size:11px;color:#475569}
.pos-margin-info span{color:#64748b;font-weight:600}
.pos-click-hint{font-size:11px;color:#3b82f6;display:flex;align-items:center;gap:4px;transition:all 0.3s}
.pos-click-hint .arrow{transition:transform 0.3s}
.pos-click-hint.open .arrow{transform:rotate(180deg)}
.pos-details{display:none;padding:0 20px 20px}
.pos-details.open{display:block}
.detail-section{margin-top:16px}
.detail-section-title{font-size:11px;color:#475569;text-transform:uppercase;letter-spacing:1px;margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid rgba(255,255,255,0.05)}
.detail-row{display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.03)}
.detail-row:last-child{border-bottom:none}
.detail-row-label{font-size:13px;color:#64748b}
.detail-row-value{font-size:14px;font-weight:700;color:#94a3b8;font-variant-numeric:tabular-nums}
.detail-row-value.highlight{font-size:18px}
.roe-progress{margin-top:16px}
.roe-progress-label{display:flex;justify-content:space-between;font-size:11px;color:#475569;margin-bottom:8px}
.roe-progress-track{height:8px;background:rgba(255,255,255,0.08);border-radius:4px;overflow:hidden}
.roe-progress-fill{height:100%;border-radius:4px;transition:width 0.6s ease}
.roe-progress-fill.profit{background:linear-gradient(90deg,#10b981,#34d399)}
.roe-progress-fill.loss{background:linear-gradient(90deg,#ef4444,#f87171)}
.empty-state{text-align:center;padding:60px 20px;color:#475569}
.empty-icon{font-size:50px;margin-bottom:16px;opacity:0.5}
.empty-text{font-size:14px}
.modal-overlay{display:none;position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.75);z-index:1000;align-items:center;justify-content:center;backdrop-filter:blur(6px)}
.modal-overlay.show{display:flex}
.modal{background:linear-gradient(145deg,#1e293b,#0f172a);border:1px solid rgba(255,255,255,0.1);border-radius:20px;padding:28px;max-width:480px;width:90%;animation:modalIn 0.3s ease}
@keyframes modalIn{from{transform:scale(0.92);opacity:0}}
.modal-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;padding-bottom:16px;border-bottom:1px solid rgba(255,255,255,0.08)}
.modal-title{font-size:18px;font-weight:800;color:#f1f5f9}
.modal-close{width:32px;height:32px;border-radius:50%;border:none;background:rgba(255,255,255,0.06);color:#64748b;font-size:16px;cursor:pointer;transition:all 0.2s;display:flex;align-items:center;justify-content:center}
.modal-close:hover{background:rgba(239,68,68,0.2);color:#ef4444}
.modal-grid{display:grid;gap:10px}
.modal-row{display:flex;justify-content:space-between;padding:14px 16px;background:rgba(255,255,255,0.03);border-radius:12px}
.modal-row-label{font-size:13px;color:#64748b}
.modal-row-value{font-size:14px;font-weight:700;color:#cbd5e1}
.modal-row-value.green{color:#10b981}
.modal-row-value.red{color:#ef4444}
.modal-footer{margin-top:20px;text-align:center;font-size:11px;color:#334155}
.refresh-bar{height:3px;background:rgba(255,255,255,0.05);border-radius:2px;margin-bottom:20px;overflow:hidden}
.refresh-progress{height:100%;background:linear-gradient(90deg,#3b82f6 0%,#10b981 100%);border-radius:2px;transition:width 1s linear;width:0%}
.footer{text-align:center;color:#334155;font-size:11px;margin-top:20px;letter-spacing:0.5px}
@media(max-width:1000px){.stats-grid{grid-template-columns:repeat(2,1fr)}}
@media(max-width:700px){.header{flex-direction:column;gap:16px;text-align:center}.header-right{text-align:center}.clock-box{text-align:center}.pos-grid{grid-template-columns:1fr}}
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <div class="header-left">
      <div class="logo">\u{1F916}</div>
      <div>
        <div class="header-title">OpenClaw Trading</div>
        <div class="header-sub">Binance Futures Testnet \xB7 3x Hedge Mode</div>
      </div>
    </div>
    <div class="header-right">
      <div class="live-badge"><div class="live-dot"></div> \u8FD0\u884C\u4E2D</div>
      <div class="clock-box">
        <div class="clock" id="clock">--:--:--</div>
        <div class="date" id="date">----/--/--</div>
        <div class="refresh-info">\u6BCF<span id="refreshSec">10</span>\u79D2\u5237\u65B0</div>
      </div>
    </div>
  </div>
  <div class="refresh-bar"><div class="refresh-progress" id="refreshBar"></div></div>
  <div class="stats-grid">
    <div class="stat-card green-accent" id="cardBalance">
      <div class="stat-icon">\u{1F4B0}</div>
      <div class="stat-label">\u8D26\u6237\u4F59\u989D</div>
      <div class="stat-value green" id="balance">$--</div>
      <div class="stat-meta">\u521D\u59CB\u672C\u91D1 <span>$5,000</span></div>
    </div>
    <div class="stat-card" id="cardWallet">
      <div class="stat-icon">\u{1F3E6}</div>
      <div class="stat-label">\u94B1\u5305\u603B\u989D</div>
      <div class="stat-value white" id="walletBalance">$--</div>
      <div class="stat-meta">\u542B\u672A\u5B9E\u73B0\u76C8\u4E8F</div>
    </div>
    <div class="stat-card" id="cardPosPnl">
      <div class="stat-icon">\u{1F4CA}</div>
      <div class="stat-label">\u6301\u4ED3\u76C8\u4E8F</div>
      <div class="stat-value" id="totalPnl">$--</div>
      <div class="stat-meta">\u5E73\u5747 <span id="avgPnlPct">--%</span></div>
    </div>
    <div class="stat-card" id="cardAccPnl">
      <div class="stat-icon">\u{1F3C6}</div>
      <div class="stat-label">\u8D26\u6237\u603B\u76C8\u4E8F</div>
      <div class="stat-value" id="totalAccountPnl">$--</div>
      <div class="stat-meta">\u6536\u76CA\u7387 <span id="accPnlPct">--%</span></div>
    </div>
  </div>
  <div class="stats-grid" style="grid-template-columns:repeat(2,1fr)">
    <div class="stat-card">
      <div class="stat-icon">\u23F1\uFE0F</div>
      <div class="stat-label">\u8FD0\u884C\u65F6\u957F</div>
      <div class="stat-value blue" id="runningTime">--:--:--</div>
      <div class="stat-meta">\u672C\u8F6E\u4EA4\u6613\u65F6\u957F</div>
    </div>
    <div class="stat-card">
      <div class="stat-icon">\u{1F4CB}</div>
      <div class="stat-label">\u6301\u4ED3\u6570\u91CF</div>
      <div class="stat-value white" id="posCount">0/4</div>
      <div class="stat-meta">\u6700\u591A4\u4E2A\u4ED3\u4F4D</div>
    </div>
  </div>
  <div class="section">
    <div class="section-header">
      <div class="section-title"><span class="icon">\u{1F4C8}</span> \u5F53\u524D\u6301\u4ED3 <span class="hint">\uFF08\u70B9\u51FB\u5361\u7247\u5C55\u5F00\u8BE6\u60C5\uFF09</span></div>
      <div class="section-count" id="posCountBadge">0</div>
    </div>
    <div class="pos-grid" id="positions">
      <div class="empty-state">
        <div class="empty-icon">\u{1F4ED}</div>
        <div class="empty-text">\u6682\u65E0\u6301\u4ED3\uFF0C\u7B49\u5F85\u4EA4\u6613\u4FE1\u53F7...</div>
      </div>
    </div>
  </div>
  <div class="footer">OpenClaw Trading Dashboard v6 \xB7 Binance Futures Testnet</div>
</div>
<div class="modal-overlay" id="modalOverlay">
  <div class="modal">
    <div class="modal-header">
      <div class="modal-title" id="modalTitle">\u8BE6\u60C5</div>
      <button class="modal-close" id="modalClose">\u2715</button>
    </div>
    <div class="modal-grid" id="modalGrid"></div>
    <div class="modal-footer" id="modalFooter"></div>
  </div>
</div>
<script>
(function(){
const REFRESH=10;
let countdown=REFRESH;
let startTime=Date.now();
let expandedCards=new Set();
let lastData=null;

function fmtTime(ts){const d=new Date(ts);return d.toLocaleTimeString('zh-CN',{hour12:false})}
function fmtDate(ts){const d=new Date(ts);return d.getFullYear()+'/'+String(d.getMonth()+1).padStart(2,'0')+'/'+String(d.getDate()).padStart(2,'0')}
function sign(v){return parseFloat(v)>=0?'+':''}
function pClass(v){return parseFloat(v)>=0?'profit':'loss'}
function pColor(v){return parseFloat(v)>=0?'#10b981':'#ef4444'}

function renderPositions(positions){
  if(!positions||positions.length===0){
    return '<div class="empty-state"><div class="empty-icon">\u{1F4ED}</div><div class="empty-text">\u6682\u65E0\u6301\u4ED3\uFF0C\u7B49\u5F85\u4EA4\u6613\u4FE1\u53F7...</div></div>';
  }
  return positions.map(function(p){
    var pV=parseFloat(p.pnl);
    var pPctV=parseFloat(p.pnlPct);
    var roeV=Math.abs(parseFloat(p.roePct));
    var chg24=parseFloat(p.change24h);
    var isOpen=expandedCards.has(p.symbol);
    var pClassV=pClass(p.pnl);
    var chgSign=chg24>=0?'+':'';
    var html='<div class="pos-card '+(p.isLong?'long':'short')+'" data-symbol="'+p.symbol+'">';
    html+='<div class="pos-topbar"><div class="pos-symbol-box"><div class="pos-symbol">'+p.symbol+'</div>';
    html+='<div class="pos-direction '+(p.isLong?'long':'short')+'">'+(p.isLong?'\u25B2 \u505A\u591A':'\u25BC \u505A\u7A7A')+'</div></div>';
    html+='<div class="pos-meta"><div class="pos-leverage">'+p.leverage+'x \u6760\u6746</div>';
    html+='<div class="pos-24h" style="color:'+(chg24>=0?'#10b981':'#ef4444')+'">'+chgSign+chg24.toFixed(2)+'%</div></div></div>';
    html+='<div class="pos-pnl-section"><div class="pos-pnl-money '+pClassV+'">'+sign(pV)+'$'+p.pnl+'</div>';
    html+='<div class="pos-pnl-percent '+pClassV+'">'+sign(pPctV)+' '+p.pnlPct+'%</div></div>';
    html+='<div class="pos-price-grid">';
    html+='<div class="pos-price-cell"><div class="pos-price-cell-label">\u5F00\u4ED3\u4EF7</div><div class="pos-price-cell-value">$'+p.entry+'</div></div>';
    html+='<div class="pos-price-cell"><div class="pos-price-cell-label">\u5F53\u524D\u4EF7</div><div class="pos-price-cell-value">$'+p.mark+'</div></div>';
    html+='<div class="pos-price-cell"><div class="pos-price-cell-label">\u6570\u91CF</div><div class="pos-price-cell-value">'+p.qty+'</div></div>';
    html+='<div class="pos-price-cell"><div class="pos-price-cell-label">\u6536\u76CA\u7387</div><div class="pos-price-cell-value" style="color:'+pColor(p.roePct)+'">'+sign(p.roePct)+p.roePct+'%</div></div>';
    html+='</div>';
    html+='<div class="pos-footer"><div class="pos-margin-info">\u4FDD\u8BC1\u91D1: <span>$'+p.margin+'</span> \xB7 \u4EF7\u503C: <span>$'+p.notional+'</span></div>';
    html+='<div class="pos-click-hint '+(isOpen?'open':'')+'">'+(isOpen?'\u25B2 \u6536\u8D77':'\u25BC \u8BE6\u60C5')+' <span class="arrow">\u25BC</span></div></div>';
    html+='<div class="pos-details '+(isOpen?'open':'')+'">';
    html+='<div class="detail-section"><div class="detail-section-title">\u4EA4\u6613\u8BE6\u60C5</div>';
    html+='<div class="detail-row"><div class="detail-row-label">\u6301\u4ED3\u65B9\u5411</div><div class="detail-row-value" style="color:'+pColor(p.pnl)+'">'+(p.isLong?'\u25B2 \u505A\u591A':'\u25BC \u505A\u7A7A')+'</div></div>';
    html+='<div class="detail-row"><div class="detail-row-label">\u5F00\u4ED3\u4EF7\u683C</div><div class="detail-row-value">$'+p.entry+'</div></div>';
    html+='<div class="detail-row"><div class="detail-row-label">\u5F53\u524D\u4EF7\u683C</div><div class="detail-row-value">$'+p.mark+'</div></div>';
    html+='<div class="detail-row"><div class="detail-row-label">\u6301\u4ED3\u6570\u91CF</div><div class="detail-row-value">'+p.qty+'</div></div>';
    html+='<div class="detail-row"><div class="detail-row-label">\u6760\u6746\u500D\u6570</div><div class="detail-row-value">'+p.leverage+'x</div></div></div>';
    html+='<div class="detail-section"><div class="detail-section-title">\u76C8\u4E8F\u6570\u636E</div>';
    html+='<div class="detail-row"><div class="detail-row-label">\u6D6E\u52A8\u76C8\u4E8F</div><div class="detail-row-value highlight" style="color:'+pColor(p.pnl)+'">'+sign(p.pnl)+'$'+p.pnl+'</div></div>';
    html+='<div class="detail-row"><div class="detail-row-label">\u6301\u4ED3\u76C8\u4E8F\u7387</div><div class="detail-row-value" style="color:'+pColor(p.pnlPct)+'">'+sign(p.pnlPct)+p.pnlPct+'%</div></div>';
    html+='<div class="detail-row"><div class="detail-row-label">\u6536\u76CA\u7387 ROE</div><div class="detail-row-value" style="color:'+pColor(p.roePct)+'">'+sign(p.roePct)+p.roePct+'%</div></div>';
    html+='<div class="detail-row"><div class="detail-row-label">24h \u6DA8\u8DCC</div><div class="detail-row-value" style="color:'+pColor(p.change24h)+'">'+sign(p.change24h)+p.change24h+'%</div></div></div>';
    html+='<div class="detail-section"><div class="detail-section-title">\u4FDD\u8BC1\u91D1\u4FE1\u606F</div>';
    html+='<div class="detail-row"><div class="detail-row-label">\u4FDD\u8BC1\u91D1</div><div class="detail-row-value">$'+p.margin+'</div></div>';
    html+='<div class="detail-row"><div class="detail-row-label">\u4ED3\u4F4D\u4EF7\u503C</div><div class="detail-row-value">$'+p.notional+'</div></div>';
    html+='<div class="detail-row"><div class="detail-row-label">\u5F3A\u5E73\u4EF7\u683C</div><div class="detail-row-value">$'+p.liquidationPrice+'</div></div>';
    html+='<div class="detail-row"><div class="detail-row-label">\u6301\u4ED3\u6A21\u5F0F</div><div class="detail-row-value">'+(p.isolated?'\u9010\u4ED3':'\u5168\u4ED3')+'</div></div></div>';
    html+='<div class="roe-progress"><div class="roe-progress-label"><span>\u6536\u76CA\u7387\u8FDB\u5EA6</span><span style="color:'+pColor(p.roePct)+'">'+sign(p.roePct)+p.roePct+'%</span></div>';
    html+='<div class="roe-progress-track"><div class="roe-progress-fill '+pClass(p.roePct)+'" style="width:'+Math.min(roeV*5,100)+'%"></div></div></div>';
    html+='</div></div>';
    return html;
  }).join('');
}

function showModal(type){
  if(!lastData)return;
  var d=lastData;
  var title='';
  var rows=[];
  var footer='';
  var realized=(parseFloat(d.walletBalance)-parseFloat(d.balance)-parseFloat(d.totalPnl)).toFixed(2);
  if(type==='balance'){
    title='\u{1F4B0} \u8D26\u6237\u4F59\u989D\u8BE6\u60C5';
    rows=[{label:'\u53EF\u7528\u4F59\u989D',value:'$'+d.balance,cls:'green'},{label:'\u94B1\u5305\u603B\u989D',value:'$'+d.walletBalance},{label:'\u521D\u59CB\u672C\u91D1',value:'$5,000.00'},{label:'\u6301\u4ED3\u6570\u91CF',value:d.posCount+' \u4E2A'}];
    footer='\u6240\u6709\u91D1\u989D\u5355\u4F4D\u5747\u4E3A USDT';
  } else if(type==='wallet'){
    title='\u{1F3E6} \u94B1\u5305\u603B\u989D\u8BE6\u60C5';
    rows=[{label:'\u94B1\u5305\u603B\u989D',value:'$'+d.walletBalance,cls:parseFloat(d.walletBalance)>=5000?'green':'red'},{label:'\u5DF2\u5B9E\u73B0\u76C8\u4E8F',value:'$'+realized,cls:parseFloat(realized)>=0?'green':'red'},{label:'\u6D6E\u52A8\u76C8\u4E8F',value:sign(d.totalPnl)+'$'+d.totalPnl,cls:parseFloat(d.totalPnl)>=0?'green':'red'},{label:'\u521D\u59CB\u672C\u91D1',value:'$5,000.00'}];
    footer='\u94B1\u5305\u603B\u989D = \u5DF2\u5B9E\u73B0\u76C8\u4E8F + \u6D6E\u52A8\u76C8\u4E8F';
  } else if(type==='pospnl'){
    title='\u{1F4CA} \u6301\u4ED3\u76C8\u4E8F\u8BE6\u60C5';
    rows=[{label:'\u6301\u4ED3\u603B\u76C8\u4E8F',value:sign(d.totalPnl)+'$'+d.totalPnl,cls:parseFloat(d.totalPnl)>=0?'green':'red'},{label:'\u5E73\u5747\u76C8\u4E8F\u7387',value:sign(d.totalPnlPct)+d.totalPnlPct+'%',cls:parseFloat(d.totalPnlPct)>=0?'green':'red'},{label:'\u8BA1\u7B97\u65B9\u5F0F',value:'\u505A\u591A=(\u5F53\u524D-\u5F00\u4ED3)\xD7\u6570\u91CF'},{label:'',value:'\u505A\u7A7A=(\u5F00\u4ED3-\u5F53\u524D)\xD7\u6570\u91CF'}];
    footer='\u4EC5\u663E\u793A\u5F53\u524D\u6301\u4ED3\u7684\u6D6E\u52A8\u76C8\u4E8F\uFF0C\u4E0D\u542B\u5DF2\u5B9E\u73B0\u76C8\u4E8F';
  } else if(type==='accpnl'){
    title='\u{1F3C6} \u8D26\u6237\u603B\u76C8\u4E8F\u8BE6\u60C5';
    rows=[{label:'\u8D26\u6237\u603B\u76C8\u4E8F',value:sign(d.totalAccountPnl)+'$'+d.totalAccountPnl,cls:parseFloat(d.totalAccountPnl)>=0?'green':'red'},{label:'\u6536\u76CA\u7387',value:sign(d.totalAccountPnlPct)+d.totalAccountPnlPct+'%',cls:parseFloat(d.totalAccountPnlPct)>=0?'green':'red'},{label:'\u94B1\u5305\u603B\u989D',value:'$'+d.walletBalance},{label:'\u5DF2\u5B9E\u73B0\u76C8\u4E8F',value:'$'+realized,cls:parseFloat(realized)>=0?'green':'red'}];
    footer='\u8D26\u6237\u603B\u76C8\u4E8F = \u5DF2\u5B9E\u73B0\u76C8\u4E8F + \u6D6E\u52A8\u76C8\u4E8F';
  }
  document.getElementById('modalTitle').textContent=title;
  document.getElementById('modalGrid').innerHTML=rows.map(function(r){return'<div class="modal-row"><div class="modal-row-label">'+r.label+'</div><div class="modal-row-value '+(r.cls||'')+'">'+r.value+'</div></div>'}).join('');
  document.getElementById('modalFooter').textContent=footer;
  document.getElementById('modalOverlay').classList.add('show');
}

function closeModal(){document.getElementById('modalOverlay').classList.remove('show')}

function formatRunningTime(ms){var s=Math.floor(ms/1000);var h=Math.floor(s/3600);var m=Math.floor((s%3600)/60);var sec=s%60;return String(h).padStart(2,'0')+':'+String(m).padStart(2,'0')+':'+String(sec).padStart(2,'0')}

function load(){
  fetch('/api/status').then(function(r){return r.json()}).then(function(d){
    lastData=d;
    if(d.error){console.error(d.error);return;}
    var pnl=parseFloat(d.totalPnl);
    var accPnl=parseFloat(d.totalAccountPnl);
    var walletChange=parseFloat(d.walletBalance)-5000;
    
    document.getElementById('balance').textContent='$'+d.balance;
    
    var walletEl=document.getElementById('walletBalance');
    walletEl.textContent='$'+d.walletBalance;
    walletEl.className='stat-value '+(walletChange>=0?'green':'red');
    document.getElementById('cardWallet').className='stat-card '+(walletChange>=0?'green-accent':'red-accent');
    
    var posPnlEl=document.getElementById('totalPnl');
    posPnlEl.textContent=(pnl>=0?'+$':'-$')+Math.abs(pnl).toFixed(2);
    posPnlEl.className='stat-value '+(pnl>=0?'green':'red');
    document.getElementById('avgPnlPct').textContent=sign(d.totalPnlPct)+d.totalPnlPct+'%';
    document.getElementById('cardPosPnl').className='stat-card '+(pnl>=0?'green-accent':'red-accent');
    
    var accPnlEl=document.getElementById('totalAccountPnl');
    accPnlEl.textContent=(accPnl>=0?'+$':'-$')+Math.abs(accPnl).toFixed(2);
    accPnlEl.className='stat-value '+(accPnl>=0?'green':'red');
    document.getElementById('accPnlPct').textContent=sign(d.totalAccountPnlPct)+d.totalAccountPnlPct+'%';
    document.getElementById('cardAccPnl').className='stat-card '+(accPnl>=0?'green-accent':'red-accent');
    
    document.getElementById('posCount').textContent=d.posCount+'/4';
    document.getElementById('posCountBadge').textContent=d.posCount;
    document.getElementById('positions').innerHTML=renderPositions(d.positions);
    var now=Date.now();
    document.getElementById('clock').textContent=fmtTime(now);
    document.getElementById('date').textContent=fmtDate(now);
    countdown=REFRESH;
  }).catch(function(e){console.error('Load error:',e)});
}

function tick(){
  countdown--;
  document.getElementById('refreshBar').style.width=((REFRESH-countdown)/REFRESH*100)+'%';
  document.getElementById('refreshSec').textContent=countdown;
  document.getElementById('runningTime').textContent=formatRunningTime(Date.now()-startTime);
  if(countdown<=0)load();
  setTimeout(tick,1000);
}

// Event delegation
document.addEventListener('click',function(e){
  var target=e.target;
  while(target&&target!==document){
    if(target.classList){
      if(target.classList.contains('stat-card')){
        var id=target.id;
        if(id==='cardBalance'){showModal('balance');return;}
        if(id==='cardWallet'){showModal('wallet');return;}
        if(id==='cardPosPnl'){showModal('pospnl');return;}
        if(id==='cardAccPnl'){showModal('accpnl');return;}
      }
      if(target.classList.contains('pos-card')){
        var symbol=target.getAttribute('data-symbol');
        if(symbol){
          if(expandedCards.has(symbol)){expandedCards.delete(symbol);}else{expandedCards.add(symbol);}
          document.getElementById('positions').innerHTML=renderPositions(lastData?lastData.positions:[]);
        }
        return;
      }
    }
    target=target.parentElement;
  }
  if(target.id==='modalOverlay'||target.id==='modalClose'){closeModal();}
});

load();
tick();
})();
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
server.listen(9999, () => console.log("Dashboard v6 at http://localhost:9999"));
setInterval(() => {
}, 1e3);
