const http = require('http');
const https = require('https');
const crypto = require('crypto');

const API_KEY = "rLS9djClUheJUJcqkUFGOylwCuSk1wVkdJMoHXN2TgfswhjBCsOPvh0202vBhAAN";
const SECRET = "EMu9DnZL7DSodz7dSkkSslVC9AtzUGQgQH4a4b9g19CysZdPO73udtnt1gTZjF7Y";

function apiRequest(path, params = {}) {
  return new Promise((resolve, reject) => {
    const ts = Date.now();
    const qp = { ...params, timestamp: String(ts) };
    const query = Object.entries(qp).map(([k,v]) => `${k}=${encodeURIComponent(v)}`).join("&");
    const sig = crypto.createHmac("sha256", SECRET).update(query).digest("hex");
    const opts = { hostname: "testnet.binancefuture.com", path: `${path}?${query}&signature=${sig}`, method: "GET", headers: { "X-MBX-APIKEY": API_KEY } };
    const req = https.request(opts, (res) => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => { try { resolve(JSON.parse(data)); } catch { resolve(data); } });
    });
    req.on("error", reject);
    req.end();
  });
}

async function getData() {
  const [bal, pos] = await Promise.all([
    apiRequest("/fapi/v2/balance"),
    apiRequest("/fapi/v2/positionRisk")
  ]);
  return { bal, pos, time: Date.now() };
}

const HTML = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Test</title></head>
<body><h1>OpenClaw Dashboard Test</h1>
<div id="data">Loading...</div>
<script>
async function load() {
  const r = await fetch('/api/status');
  const d = await r.json();
  document.getElementById('data').innerHTML = 'Balance: $' + d.balance + '<br>PosCount: ' + d.posCount;
}
load();
setInterval(load, 5000);
<\/script>
</body></html>`;

const server = http.createServer(async (req, res) => {
  if (req.url === '/api/status') {
    try {
      const data = await getData();
      const usdt = data.bal.find(a => a.asset === "USDT");
      const balance = parseFloat(usdt?.availableBalance || "0");
      const active = data.pos.filter(p => parseFloat(p.positionAmt) !== 0);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ balance: balance.toFixed(2), posCount: active.length, positions: active.map(p => ({ symbol: p.symbol, pnl: p.unRealizedProfit })) }));
    } catch (e) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: e.message }));
    }
  } else {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(HTML);
  }
});

server.listen(9999, () => {
  console.log('Test server at http://localhost:9999');
});

process.stdin.resume();
console.log('Server starting...');
