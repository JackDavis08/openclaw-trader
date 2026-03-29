const http = require('http');
const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const API_KEY = '5xFjz1Jt04FVKh7pNuQyiRKhYpGvgK0YaPgldYrYgrmBUBcAN9Lg10ypycRJaY4j';
const SECRET = '7vbksMwunENMRYQY6Xr3GEW3JwkEgjww7amOsAtQpk7FY47Ye26btJeHXbQBq1dj';

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

    // Read local account file to get total trade count (all historical trades)
    let totalTradeCount = 0;
    let totalWinCount = 0;
    try {
      const accountPaths = [
        path.join(__dirname, 'openclaw-trader', 'logs', 'paper-binance-futures-testnet-futures-long-short.json'),
        path.join(__dirname, 'openclaw-trader', 'logs', 'paper-futures-long-short.json'),
        path.join(__dirname, 'logs', 'paper-binance-futures-testnet-futures-long-short.json'),
        path.join(__dirname, 'logs', 'paper-futures-long-short.json'),
      ];
      for (const accountPath of accountPaths) {
        if (fs.existsSync(accountPath)) {
          const accountData = JSON.parse(fs.readFileSync(accountPath, 'utf8'));
          const allTrades = Array.isArray(accountData.trades) ? accountData.trades : [];
          totalTradeCount = allTrades.length;
          // Count closed trades (sell/cover with pnl defined) that are winners
          const closedTrades = allTrades.filter(t => 
            (t.side === 'sell' || t.side === 'cover') && t.pnl !== undefined && t.pnl !== null
          );
          totalWinCount = closedTrades.filter(t => (t.pnl ?? 0) > 0).length;
          console.log('[DEBUG] Account file:', accountPath, 'trades:', totalTradeCount, 'wins:', totalWinCount);
          break;
        }
      }
    } catch (e) { console.log('[DEBUG] Account file error:', e.message); }

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
    // totalTrades: ALL historical trades from the 50 recent trades API
    const totalTrades = tradeList.length;
    const todayTrades = tradeList.filter(t => new Date(t.time || 0) >= today);
    const winTrades = todayTrades.filter(t => parseFloat(t.realizedPnl || 0) > 0);
    const totalWinTrades = tradeList.filter(t => parseFloat(t.realizedPnl || 0) > 0);

    return {
      balance: bal2.toFixed(2),
      walletBalance: wallet.toFixed(2),
      totalPnl: totalPnl.toFixed(2),
      totalPnlPct: positions.length > 0 ? (positions.reduce((s, p) => s + parseFloat(p.pnlPct), 0) / positions.length).toFixed(2) : '0.00',
      totalAccountPnl: totalAccPnl.toFixed(2),
      totalAccountPnlPct: (totalAccPnl / initBalance * 100).toFixed(2),
      positions: positions,
      posCount: positions.length,
      tradeCount: totalTradeCount,  // total trades from local account file
      winCount: totalWinCount,       // total winning closed trades
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
