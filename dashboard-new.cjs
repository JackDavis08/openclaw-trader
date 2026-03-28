const http = require('http');
const https = require('https');
const crypto = require('crypto');
const fs = require('fs');

const API_KEY = 'hmvetrF95qH8N0zChIVYgiDZrrFAv7IWcpSLuuDWAOi0BxFg61xJL9uJBbscBKHX';
const SECRET = 'GZc933rXKWuauD6yTFCKrkN0n6w7wlVXJ8Tk2DuqrCnIMb5Xq4IuFYyPyUt9Wjt4';

function apiReq(path, params) {
  return new Promise((resolve, reject) => {
    const ts = Date.now();
    params = params || {};
    const qp = {...params, timestamp: String(ts)};
    const q = Object.keys(qp).map(k => k + '=' + encodeURIComponent(qp[k])).join('&');
    const sig = crypto.createHmac('sha256', SECRET).update(q).digest('hex');
    const opts = {
      hostname: 'testnet.binancefuture.com',
      path: path + '?' + q + '&signature=' + sig,
      method: 'GET',
      headers: {'X-MBX-APIKEY': API_KEY}
    };
    const req = https.request(opts, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { resolve(d); } });
    });
    req.on('error', reject);
    req.end();
  });
}

async function getStatus() {
  try {
    const [bal, pos, trades] = await Promise.all([
      apiReq('/fapi/v2/balance'),
      apiReq('/fapi/v2/positionRisk'),
      apiReq('/fapi/v2/userTrades', {limit: 50})
    ]);

    const usdt = Array.isArray(bal) ? bal.find(a => a.asset === 'USDT') : {availableBalance: '0', crossWalletBalance: '0'};
    const bal2 = parseFloat(usdt?.availableBalance || '0');
    const wallet = parseFloat(usdt?.crossWalletBalance || usdt?.balance || '0');

    const activePos = Array.isArray(pos) ? pos.filter(p => parseFloat(p.positionAmt || 0) !== 0) : [];

    const positions = activePos.map(p => {
      const amt = parseFloat(p.positionAmt || 0);
      const entry = parseFloat(p.entryPrice || 0);
      const mark = parseFloat(p.markPrice || entry);
      const lev = parseInt(p.leverage || 3);
      const pnl = parseFloat(p.unRealizedProfit || 0);
      const notional = Math.abs(amt) * entry;
      const margin = notional / lev;
      return {
        symbol: p.symbol || 'UNKNOWN',
        side: amt > 0 ? 'LONG' : 'SHORT',
        qty: Math.abs(amt).toFixed(4),
        entry: entry.toFixed(4),
        mark: mark.toFixed(4),
        pnl: pnl.toFixed(2),
        pnlPct: notional > 0 ? (pnl / notional * 100).toFixed(2) : '0.00',
        roePct: margin > 0 ? (pnl / margin * 100).toFixed(2) : '0.00',
        leverage: lev,
        margin: margin.toFixed(2),
        isLong: amt > 0
      };
    });

    const totalPnl = positions.reduce((s, p) => s + parseFloat(p.pnl), 0);
    const initBalance = 5000;
    const totalAccPnl = wallet - initBalance;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tradeList = Array.isArray(trades) ? trades : [];
    const todayTrades = tradeList.filter(t => new Date(t.time || 0) >= today);
    const winTrades = todayTrades.filter(t => parseFloat(t.realizedPnl || 0) > 0);

    return {
      balance: bal2.toFixed(2),
      walletBalance: wallet.toFixed(2),
      totalPnl: totalPnl.toFixed(2),
      totalPnlPct: positions.length > 0 ? (positions.reduce((s, p) => s + parseFloat(p.pnlPct), 0) / positions.length).toFixed(2) : '0.00',
      totalAccountPnl: totalAccPnl.toFixed(2),
      totalAccountPnlPct: (totalAccPnl / initBalance * 100).toFixed(2),
      positions: positions,
      posCount: positions.length,
      tradeCount: todayTrades.length,
      winCount: winTrades.length,
      timestamp: Date.now()
    };
  } catch (e) {
    return {
      error: e.message,
      balance: '0', walletBalance: '0', totalPnl: '0', totalPnlPct: '0',
      totalAccountPnl: '0', totalAccountPnlPct: '0',
      positions: [], posCount: 0, tradeCount: 0, winCount: 0
    };
  }
}

const PAGE = fs.readFileSync(__dirname + '/dashboard.html', 'utf8');

http.createServer((req, res) => {
  if (req.url === '/api/status') {
    getStatus().then(d => {
      res.writeHead(200, {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'});
      res.end(JSON.stringify(d));
    }).catch(e => {
      res.writeHead(500, {'Content-Type': 'application/json'});
      res.end(JSON.stringify({error: e.message}));
    });
  } else if (req.url === '/' || req.url === '/index.html') {
    res.writeHead(200, {'Content-Type': 'text/html;charset=utf-8'});
    res.end(PAGE);
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
}).listen(9999, '0.0.0.0', () => console.log('Dashboard v4.0 at http://localhost:9999'));
