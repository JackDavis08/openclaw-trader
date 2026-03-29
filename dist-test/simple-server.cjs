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

// simple-server.ts
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
    const crossUnPnl = parseFloat(usdt?.crossUnPnl || "0");
    const activePositions = posData.filter((p) => parseFloat(p.positionAmt) !== 0);
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
        margin: margin.toFixed(2),
        isLong: amt > 0
      };
    });
    const totalPosPnl = positions.reduce((sum, p) => sum + parseFloat(p.pnl), 0);
    const totalPnlPct = positions.length > 0 ? positions.reduce((sum, p) => sum + parseFloat(p.pnlPct), 0) / positions.length : 0;
    const totalAccountPnl = walletBalance - 5e3;
    const totalAccountPnlPct = totalAccountPnl / 5e3 * 100;
    return {
      balance: balance.toFixed(2),
      walletBalance: walletBalance.toFixed(2),
      totalPnl: totalPosPnl.toFixed(2),
      totalPnlPct: totalPnlPct.toFixed(2),
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
<title>OpenClaw Trading - Simple View</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: 'Segoe UI', sans-serif; background: #0f172a; color: #e2e8f0; padding: 20px; }
h1 { color: #f8fafc; margin-bottom: 20px; font-size: 24px; }
.info { background: #1e293b; border-radius: 12px; padding: 16px; margin-bottom: 16px; border: 1px solid #334155; }
.info h2 { color: #94a3b8; font-size: 12px; text-transform: uppercase; margin-bottom: 8px; }
.info .value { font-size: 28px; font-weight: 700; }
.info .value.green { color: #10b981; }
.info .value.red { color: #ef4444; }
.sub { font-size: 12px; color: #64748b; margin-top: 4px; }
.pos { background: #1e293b; border-radius: 12px; padding: 16px; border: 1px solid #334155; }
.pos h3 { color: #f8fafc; margin-bottom: 12px; }
.pos-item { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #334155; }
.pos-item:last-child { border-bottom: none; }
.pos-item .symbol { font-weight: 700; font-size: 16px; }
.pos-item .detail { text-align: right; font-size: 13px; color: #94a3b8; }
.pos-item .pnl { font-size: 18px; font-weight: 700; margin-top: 4px; }
.pos-item .pnl.pos { color: #10b981; }
.pos-item .pnl.neg { color: #ef4444; }
.badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 700; margin-left: 8px; }
.badge.long { background: rgba(16,185,129,0.2); color: #10b981; }
.badge.short { background: rgba(239,68,68,0.2); color: #ef4444; }
.error { background: rgba(239,68,68,0.1); border: 1px solid #ef4444; border-radius: 12px; padding: 16px; color: #ef4444; }
#raw { margin-top: 20px; font-size: 11px; color: #475569; word-break: break-all; }
</style>
</head>
<body>
<h1>\u{1F916} OpenClaw Trading Panel</h1>

<div class="info">
  <h2>\u{1F4B0} \u8D26\u6237\u4F59\u989D</h2>
  <div class="value green" id="balance">\u52A0\u8F7D\u4E2D...</div>
  <div class="sub">\u94B1\u5305\u603B\u989D: <span id="wallet">-</span> | \u521D\u59CB: $5,000</div>
</div>

<div class="info">
  <h2>\u{1F4CA} \u6301\u4ED3\u603B\u76C8\u4E8F</h2>
  <div class="value" id="posPnl">-</div>
  <div class="sub">\u8D26\u6237\u603B\u76C8\u4E8F: <span id="accPnl">-</span></div>
</div>

<div class="pos">
  <h3>\u{1F4CB} \u5F53\u524D\u6301\u4ED3</h3>
  <div id="positions">\u52A0\u8F7D\u4E2D...</div>
</div>

<div id="raw"></div>

<script>
async function load() {
  try {
    const r = await fetch('/api/status');
    const d = await r.json();
    
    if (d.error) {
      document.getElementById('balance').textContent = '\u9519\u8BEF: ' + d.error;
      return;
    }
    
    const pnl = parseFloat(d.totalPnl);
    const accPnl = parseFloat(d.totalAccountPnl);
    
    document.getElementById('balance').textContent = '$' + d.balance;
    document.getElementById('balance').className = 'value ' + (pnl >= 0 ? 'green' : 'red');
    document.getElementById('wallet').textContent = '$' + d.walletBalance;
    
    document.getElementById('posPnl').textContent = (pnl >= 0 ? '+' : '') + '$' + d.totalPnl + ' (' + d.totalPnlPct + '%)';
    document.getElementById('posPnl').className = 'value ' + (pnl >= 0 ? 'green' : 'red');
    
    document.getElementById('accPnl').textContent = (accPnl >= 0 ? '+' : '') + '$' + d.totalAccountPnl + ' (' + d.totalAccountPnlPct + '%)';
    
    if (d.positions.length === 0) {
      document.getElementById('positions').innerHTML = '<div style="color:#64748b;text-align:center;padding:20px">\u6682\u65E0\u6301\u4ED3</div>';
    } else {
      document.getElementById('positions').innerHTML = d.positions.map(p => {
        const pnlV = parseFloat(p.pnl);
        const pClass = pnlV >= 0 ? 'pos' : 'neg';
        return '<div class="pos-item">' +
          '<div><span class="symbol">' + p.symbol + '</span><span class="badge ' + (p.isLong ? 'long' : 'short') + '">' + (p.isLong ? '\u591A' : '\u7A7A') + '</span><div style="font-size:12px;color:#64748b;margin-top:4px">\u5F00\u4ED3$' + p.entry + ' \u2192 \u5F53\u524D$' + p.mark + ' | ' + p.qty + '\u4E2A | ' + p.leverage + 'x\u6760\u6746</div></div>' +
          '<div><div class="pnl ' + pClass + '">' + (pnlV >= 0 ? '+' : '') + '$' + p.pnl + '</div><div style="font-size:11px;color:#64748b">ROE: ' + p.roePct + '%</div></div>' +
        '</div>';
      }).join('');
    }
    
    document.getElementById('raw').textContent = '\u6700\u540E\u66F4\u65B0: ' + new Date().toLocaleTimeString('zh-CN') + ' | ' + JSON.stringify(d, null, 2).substring(0, 200) + '...';
  } catch(e) {
    document.getElementById('balance').textContent = '\u52A0\u8F7D\u5931\u8D25: ' + e.message;
  }
}

load();
setInterval(load, 5000);
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
server.listen(9999, () => console.log("\u2705 Simple server at http://localhost:9999"));
setInterval(() => {
}, 1e3);
