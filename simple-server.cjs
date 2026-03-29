/**
 * Intelligent Trading System - Real-time Dashboard Server
 * Port: 9999
 * Access: http://localhost:9999
 * 
 * Updates:
 * - 15分钟涨跌 (replaces 24h)
 * - AI分析每5分钟更新
 * - 总市值精确计算
 * - 账户盈亏实时调取
 */
const http = require('http');
const https = require('https');
const crypto = require('crypto');

// ⚠️ IMPORTANT: Replace with your own API keys from Binance Testnet
// Get your keys at: https://testnet.binancefuture.com
const API_KEY = "rLS9djClUheJUJcqkUFGOylwCuSk1wVkdJMoHXN2TgfswhjBCsOPvh0202vBhAAN";
const SECRET = "EMu9DnZL7DSodz7dSkkSslVC9AtzUGQgQH4a4b9g19CysZdPO73udtnt1gTZjF7Y";
const INITIAL_BALANCE = 5000;
const REFRESH_SEC = 10;        // Dashboard refresh interval
const AI_UPDATE_SEC = 300;     // AI analysis updates every 5 minutes

function apiRequest(path, params) {
  return new Promise((resolve, reject) => {
    const ts = Date.now();
    const qp = { ...params, timestamp: String(ts) };
    const query = Object.entries(qp).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
    const sig = crypto.createHmac('sha256', SECRET).update(query).digest('hex');
    const opts = {
      hostname: 'testnet.binancefuture.com',
      path: `${path}?${query}&signature=${sig}`,
      method: 'GET',
      headers: { 'X-MBX-APIKEY': API_KEY }
    };
    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve(data); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

// Get 15-minute price change
async function get15mChange(symbol) {
  try {
    const klines = await apiRequest('/fapi/v1/klines', {
      symbol,
      interval: '1m',
      limit: '16'  // Last 16 x 1m candles = 15 minutes
    });
    if (!klines || klines.length < 2) return 0;
    const firstClose = parseFloat(klines[0][4]);  // First candle close
    const lastClose = parseFloat(klines[klines.length - 1][4]);  // Last candle close
    if (firstClose === 0) return 0;
    const change = ((lastClose - firstClose) / firstClose) * 100;
    return change;
  } catch (e) {
    return 0;
  }
}

// Generate AI analysis based on current data
function generateAIAnalysis(data) {
  const { positions, balance, walletBalance, totalPnl, totalAccountPnl, realizedPnl } = data;
  
  if (positions.length === 0) {
    return '当前无持仓，等待交易信号。建议关注市场走势，在合适的时机入场。';
  }
  
  const pnl = parseFloat(totalPnl);
  const accPnl = parseFloat(totalAccountPnl);
  const bal = parseFloat(balance);
  const wallet = parseFloat(walletBalance);
  
  // Calculate detailed metrics
  const profitRate = accPnl >= 0 ? '盈利' : '亏损';
  const riskLevel = positions.length >= 3 ? '高仓位' : positions.length >= 2 ? '中等仓位' : '低仓位';
  const avgPnlPerTrade = positions.length > 0 ? (pnl / positions.length).toFixed(2) : '0';
  const realizedFromAI = accPnl - pnl;
  const realizedRate = realizedFromAI >= 0 ? '盈利' : '亏损';
  
  let recommendation = '';
  
  if (accPnl > 100) {
    recommendation = '策略表现优异！累计盈利已超过初始资金的2%，建议适当分批止盈，锁定收益。';
  } else if (accPnl > 50) {
    recommendation = '策略整体盈利，注意保护已有收益。建议设置移动止损，锁定部分利润。';
  } else if (accPnl > 0) {
    recommendation = '策略小幅盈利，建议继续持有，关注仓位变化。';
  } else if (accPnl < -100) {
    recommendation = '亏损较大，当前已亏损超过初始资金的2%，建议关注风险，必要时减仓。';
  } else if (accPnl < -50) {
    recommendation = '策略出现亏损，建议密切关注市场走势，设置严格的止损位。';
  } else if (pnl > 0) {
    recommendation = '持仓目前浮动盈利，但整体账户仍为亏损，需要市场进一步上涨来弥补。';
  } else if (pnl < 0) {
    recommendation = '持仓目前浮动亏损，建议关注持仓风险，适时调整策略。';
  } else {
    recommendation = '策略执行中，持续关注市场变化，等待更好的交易机会。';
  }
  
  // Build comprehensive analysis
  const analysis = `【${profitRate}状态】${recommendation}

【仓位状态】当前持有${positions.length}个仓位（${riskLevel}），建议合理控制仓位。

【浮动盈亏】$${pnl.toFixed(2)} | 【已实现盈亏】${realizedFromAI >= 0 ? '+' : ''}$${realizedFromAI.toFixed(2)} (${realizedRate})

【平均每仓盈亏】约 $${avgPnlPerTrade}

【账户可用余额】$${bal.toFixed(2)} | 【总市值】$${(wallet + pnl).toFixed(2)}

【综合建议】${
    positions.every(p => parseFloat(p.pnl) > 0) 
      ? '所有持仓均盈利，表现良好，可继续持有。'
      : positions.some(p => parseFloat(p.pnl) < 0)
        ? '部分持仓亏损，建议关注亏损仓位，适时止损。'
        : '持仓盈亏参半，建议保持观望。'
  }`;

  return analysis;
}

async function getData() {
  try {
    // Get balance and positions
    const [balData, posData] = await Promise.all([
      apiRequest('/fapi/v2/balance'),
      apiRequest('/fapi/v2/positionRisk')
    ]);

    const usdt = balData.find((a) => a.asset === 'USDT');
    const balance = parseFloat(usdt?.availableBalance || '0');
    const walletBalance = parseFloat(usdt?.crossWalletBalance || usdt?.balance || '0');
    const unrealizedPnl = parseFloat(usdt?.crossUnPnl || '0');

    const activePositions = posData.filter((p) => parseFloat(p.positionAmt) !== 0);

    // Get 15-minute changes for each position
    const changePromises = activePositions.map(async (p) => {
      const change15m = await get15mChange(p.symbol);
      return { symbol: p.symbol, change15m };
    });
    const changeMap = Object.fromEntries(await Promise.all(changePromises));

    // Build positions data
    const positions = activePositions.map((p) => {
      const amt = parseFloat(p.positionAmt);
      const entry = parseFloat(p.entryPrice);
      const mark = parseFloat(p.markPrice) || entry;
      const leverage = parseFloat(p.leverage || '3');
      const rawPnl = parseFloat(p.unRealizedProfit || '0');
      const notional = Math.abs(amt) * entry;
      const margin = notional / leverage;
      const posPnlPct = notional > 0 ? (rawPnl / notional * 100) : 0;
      const roePct = margin > 0 ? (rawPnl / margin * 100) : 0;
      const change15m = changeMap[p.symbol] || 0;

      return {
        symbol: p.symbol,
        qty: Math.abs(amt).toString(),
        entry: entry.toFixed(4),
        mark: mark.toFixed(4),
        pnl: rawPnl.toFixed(2),
        pnlPct: posPnlPct.toFixed(2),
        roePct: roePct.toFixed(2),
        leverage,
        change15m: change15m.toFixed(3),
        margin: margin.toFixed(2),
        notional: notional.toFixed(2),
        isLong: amt > 0,
        liquidationPrice: parseFloat(p.liquidationPrice || '0').toFixed(2),
        isolated: p.isolated || false,
      };
    });

    // Calculate total PnL from positions
    const totalPosPnlNum = positions.reduce((sum, p) => sum + parseFloat(p.pnl), 0);
    const totalPosPnlPctNum = positions.length > 0
      ? (positions.reduce((sum, p) => sum + parseFloat(p.pnlPct), 0) / positions.length) : 0;
    
    // Total Market Value = walletBalance + unrealized PnL (from API)
    const totalMarketValueNum = walletBalance + unrealizedPnl;
    
    // Account PnL = Total Market Value - Initial Balance
    const totalAccountPnlNum = totalMarketValueNum - INITIAL_BALANCE;
    const totalAccountPnlPctNum = (totalAccountPnlNum / INITIAL_BALANCE * 100);
    
    // Realized PnL = Account PnL - Unrealized PnL
    const realizedPnlNum = totalAccountPnlNum - totalPosPnlNum;

    return {
      balance: balance.toFixed(2),
      walletBalance: walletBalance.toFixed(2),
      totalPnl: totalPosPnlNum.toFixed(2),
      totalPnlPct: totalPosPnlPctNum.toFixed(2),
      totalAccountPnl: totalAccountPnlNum.toFixed(2),
      totalAccountPnlPct: totalAccountPnlPctNum.toFixed(2),
      realizedPnl: realizedPnlNum.toFixed(2),
      totalMarketValue: totalMarketValueNum.toFixed(2),
      positions,
      posCount: positions.length,
      tradeCount: positions.length > 0 ? positions.length * 2 : 0,
      aiAnalysis: '',  // Will be set by frontend or timer
      serverTime: Date.now()
    };
  } catch (e) {
    return { error: e.message, positions: [], posCount: 0, tradeCount: 0, aiAnalysis: '数据加载失败', serverTime: Date.now() };
  }
}

// AI analysis cache
let cachedAIAnalysis = '加载中...';
let lastAIUpdate = 0;

async function updateAIAnalysis() {
  try {
    const data = await getData();
    cachedAIAnalysis = generateAIAnalysis(data);
    lastAIUpdate = Date.now();
  } catch (e) {
    cachedAIAnalysis = 'AI分析更新失败，请检查网络连接。';
  }
}

const HTML = `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Intelligent Trading System - Dashboard</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif; background: #0d1117; color: #e6edf3; min-height: 100vh; padding: 20px; }
.container { max-width: 1400px; margin: 0 auto; }

/* Header */
.header { display: flex; justify-content: space-between; align-items: center; background: #161b22; border: 1px solid #30363d; border-radius: 12px; padding: 16px 24px; margin-bottom: 20px; }
.header-left { display: flex; align-items: center; gap: 14px; }
.logo { font-size: 28px; }
.title { font-size: 18px; font-weight: 700; color: #f0f6fc; }
.subtitle { font-size: 11px; color: #7d8590; margin-top: 2px; }
.header-right { display: flex; align-items: center; gap: 20px; }
.live-badge { display: flex; align-items: center; gap: 6px; background: rgba(56,139,253,0.15); border: 1px solid #388bfd; color: #58a6ff; padding: 5px 12px; border-radius: 16px; font-size: 11px; font-weight: 600; }
.live-dot { width: 6px; height: 6px; background: #58a6ff; border-radius: 50%; animation: blink 1.5s infinite; }
@keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.4} }
.timer-box { background: #21262d; border: 1px solid #30363d; border-radius: 8px; padding: 8px 14px; text-align: center; }
.timer-label { font-size: 9px; color: #7d8590; text-transform: uppercase; }
.timer-value { font-size: 16px; font-weight: 700; color: #f0f6fc; font-variant-numeric: tabular-nums; }
.countdown-box { background: #21262d; border: 1px solid #30363d; border-radius: 8px; padding: 8px 14px; text-align: center; }
.countdown-label { font-size: 9px; color: #7d8590; text-transform: uppercase; }
.countdown-value { font-size: 16px; font-weight: 700; color: #58a6ff; }

/* Stats Grid */
.stats-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; margin-bottom: 16px; }
@media (max-width: 1100px) { .stats-grid { grid-template-columns: repeat(3, 1fr); } }
@media (max-width: 700px) { .stats-grid { grid-template-columns: repeat(2, 1fr); } }
.stat-card { background: #161b22; border: 1px solid #30363d; border-radius: 12px; padding: 16px; }
.stat-label { font-size: 10px; color: #7d8590; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; display: flex; align-items: center; gap: 6px; }
.stat-value { font-size: 22px; font-weight: 700; font-variant-numeric: tabular-nums; }
.stat-value.green { color: #3fb950; }
.stat-value.red { color: #f85149; }
.stat-value.blue { color: #58a6ff; }
.stat-value.purple { color: #a371f7; }
.stat-value.white { color: #f0f6fc; }
.stat-sub { font-size: 10px; color: #7d8590; margin-top: 4px; }

/* AI Analysis */
.ai-panel { background: linear-gradient(135deg, #161b22, #1c2128); border: 1px solid #30363d; border-radius: 12px; padding: 14px 20px; margin-bottom: 16px; display: flex; align-items: flex-start; gap: 14px; }
.ai-icon { font-size: 22px; }
.ai-content { flex: 1; }
.ai-label { font-size: 9px; color: #a371f7; text-transform: uppercase; letter-spacing: 0.5px; display: flex; align-items: center; gap: 8px; }
.ai-label span { font-size: 10px; color: #7d8590; font-weight: 400; }
.ai-text { font-size: 12px; color: #e6edf3; margin-top: 4px; line-height: 1.6; white-space: pre-line; }

/* Positions Section */
.section { background: #161b22; border: 1px solid #30363d; border-radius: 12px; padding: 20px; margin-bottom: 16px; }
.section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.section-title { font-size: 15px; font-weight: 700; color: #f0f6fc; }
.section-badge { background: #21262d; border: 1px solid #30363d; color: #7d8590; padding: 4px 10px; border-radius: 12px; font-size: 11px; font-weight: 600; }

/* Position Cards */
.pos-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 14px; }
.pos-card { background: #0d1117; border: 1px solid #30363d; border-radius: 12px; overflow: hidden; cursor: pointer; transition: all 0.2s; }
.pos-card:hover { border-color: #58a6ff; }
.pos-card.long { border-left: 3px solid #3fb950; }
.pos-card.short { border-left: 3px solid #f85149; }
.pos-card-header { display: flex; justify-content: space-between; align-items: center; padding: 14px 16px; background: #161b22; border-bottom: 1px solid #21262d; }
.pos-symbol { font-size: 15px; font-weight: 700; color: #f0f6fc; }
.pos-badge { padding: 3px 10px; border-radius: 6px; font-size: 10px; font-weight: 700; }
.pos-badge.long { background: rgba(63,185,80,0.15); color: #3fb950; }
.pos-badge.short { background: rgba(248,81,73,0.15); color: #f85149; }
.pos-toggle { font-size: 10px; color: #7d8590; }
.pos-pnl { padding: 16px; text-align: center; border-bottom: 1px solid #21262d; }
.pos-pnl-value { font-size: 28px; font-weight: 900; }
.pos-pnl-value.profit { color: #3fb950; }
.pos-pnl-value.loss { color: #f85149; }
.pos-pnl-sub { font-size: 11px; color: #7d8590; margin-top: 6px; }
.pos-pnl-sub .green { color: #3fb950; font-weight: 600; }
.pos-pnl-sub .red { color: #f85149; font-weight: 600; }
.pos-prices { display: grid; grid-template-columns: repeat(4, 1fr); }
.pos-price { padding: 10px 8px; text-align: center; border-right: 1px solid #21262d; }
.pos-price:last-child { border-right: none; }
.pos-price-label { font-size: 9px; color: #7d8590; text-transform: uppercase; margin-bottom: 4px; }
.pos-price-value { font-size: 12px; font-weight: 600; color: #e6edf3; }
.pos-price-value.up { color: #3fb950; }
.pos-price-value.down { color: #f85149; }
.pos-details { display: none; padding: 14px; background: #161b22; border-top: 1px solid #21262d; }
.pos-details.open { display: block; }
.detail-row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #21262d; }
.detail-row:last-child { border-bottom: none; }
.detail-label { font-size: 11px; color: #7d8590; }
.detail-value { font-size: 12px; font-weight: 600; color: #e6edf3; }
.detail-value.green { color: #3fb950; }
.detail-value.red { color: #f85149; }
.roe-bar { margin-top: 10px; }
.roe-header { display: flex; justify-content: space-between; margin-bottom: 5px; font-size: 10px; color: #7d8590; }
.roe-value { font-weight: 700; }
.roe-track { height: 5px; background: #21262d; border-radius: 3px; }
.roe-fill { height: 5px; border-radius: 3px; transition: width 0.3s; }
.roe-fill.profit { background: #3fb950; }
.roe-fill.loss { background: #f85149; }

/* Empty State */
.empty-state { text-align: center; padding: 40px; color: #7d8590; }
.empty-icon { font-size: 36px; margin-bottom: 10px; opacity: 0.5; }
.empty-text { font-size: 13px; }

/* Footer */
.footer { text-align: center; color: #484f58; font-size: 11px; padding-top: 16px; margin-top: 16px; border-top: 1px solid #21262d; }
</style>
</head>
<body>
<div class="container">
  
  <!-- Header -->
  <div class="header">
    <div class="header-left">
      <div class="logo">🤖</div>
      <div>
        <div class="title">Intelligent Trading System</div>
        <div class="subtitle">Binance Futures Testnet · 3x Hedge Mode</div>
      </div>
    </div>
    <div class="header-right">
      <div class="timer-box">
        <div class="timer-label">运行时长</div>
        <div class="timer-value" id="runningTime">00:00:00</div>
      </div>
      <div class="countdown-box">
        <div class="countdown-label">下次刷新</div>
        <div class="countdown-value" id="countdown">10s</div>
      </div>
      <div class="live-badge">
        <div class="live-dot"></div>
        <span>LIVE</span>
      </div>
    </div>
  </div>

  <!-- Stats Grid -->
  <div class="stats-grid">
    <div class="stat-card">
      <div class="stat-label">💰 可用余额</div>
      <div class="stat-value green" id="balance">$--</div>
      <div class="stat-sub" id="walletBalance">钱包: $--</div>
    </div>
    <div class="stat-card" id="cardPosPnl">
      <div class="stat-label">📊 持仓盈亏</div>
      <div class="stat-value" id="posPnl">$--</div>
      <div class="stat-sub" id="posPnlPct">--%</div>
    </div>
    <div class="stat-card" id="cardAccPnl">
      <div class="stat-label">🏦 账户总盈亏</div>
      <div class="stat-value" id="accPnl">$--</div>
      <div class="stat-sub" id="accPnlPct">--%</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">✨ 已实现盈亏</div>
      <div class="stat-value" id="realizedPnl">$--</div>
      <div class="stat-sub" id="realizedPct">--%</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">🔄 交易次数</div>
      <div class="stat-value white" id="tradeCount">0</div>
      <div class="stat-sub">次</div>
    </div>
  </div>

  <div class="stats-grid">
    <div class="stat-card">
      <div class="stat-label">🔢 持仓数量</div>
      <div class="stat-value blue" id="posCount">0/4</div>
      <div class="stat-sub">个仓位</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">📈 15m涨跌</div>
      <div class="stat-value" id="marketChange">--%</div>
      <div class="stat-sub">综合平均</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">💵 总本金</div>
      <div class="stat-value white">$5,000</div>
      <div class="stat-sub">初始资金</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">📊 总市值</div>
      <div class="stat-value white" id="totalValue">$--</div>
      <div class="stat-sub">本金+盈亏</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">📋 刷新次数</div>
      <div class="stat-value white" id="refreshCount">0</div>
      <div class="stat-sub">次</div>
    </div>
  </div>

  <!-- AI Analysis -->
  <div class="ai-panel">
    <div class="ai-icon">🤖</div>
    <div class="ai-content">
      <div class="ai-label">AI 盈亏分析 <span id="aiUpdateTime">(每5分钟更新)</span></div>
      <div class="ai-text" id="aiAnalysis">加载中...</div>
    </div>
  </div>

  <!-- Positions Section -->
  <div class="section">
    <div class="section-header">
      <div class="section-title">📊 当前持仓详情</div>
      <div class="section-badge" id="posCountBadge">0 个仓位</div>
    </div>
    <div class="pos-grid" id="positionsContainer">
      <div class="empty-state">
        <div class="empty-icon">📭</div>
        <div class="empty-text">暂无持仓，等待交易信号...</div>
      </div>
    </div>
  </div>

  <!-- Strategy Info -->
  <div class="ai-panel" style="background: linear-gradient(135deg, #161b22, #1c2128); border: 1px solid #30363d;">
    <div class="ai-icon">📋</div>
    <div class="ai-content">
      <div class="ai-label">当前策略参数 <span style="font-size:9px;color:#7d8590;">(v1.0.2)</span></div>
      <div class="ai-text" style="font-size:11px; line-height: 1.8;">
        RSI: 40/60 · EMA: 21/50 · 止损: ATR×1 · 止盈: ATR×2 (1:2) · 超时: 1h · 仓位: 30% · 币种: 15个
      </div>
    </div>
  </div>

  <!-- Footer -->
  <div class="footer">
    Intelligent Trading System v1.0.2 · 每10秒刷新 · Binance Testnet · AI分析每5分钟更新
  </div>
</div>

<script>
var REFRESH = ${REFRESH_SEC};
var AI_INTERVAL = ${AI_UPDATE_SEC};
var countdown = REFRESH;
var aiCountdown = AI_INTERVAL;
var startTime = Date.now();
var refreshCount = 0;
var lastPositions = [];
var expandedSymbols = {};
var currentAIAnalysis = '加载中...';

function formatTime(ms) {
  var s = Math.floor(ms / 1000);
  var h = Math.floor(s / 3600);
  var m = Math.floor((s % 3600) / 60);
  var sec = s % 60;
  return String(h).padStart(2,'0') + ':' + String(m).padStart(2,'0') + ':' + String(sec).padStart(2,'0');
}

function fmtSign(v) { return parseFloat(v) >= 0 ? '+' : ''; }
function fmtClass(v) { return parseFloat(v) >= 0 ? 'green' : 'red'; }

function togglePos(symbol) {
  expandedSymbols[symbol] = !expandedSymbols[symbol];
  renderPositions(lastPositions);
}

function renderPositions(positions) {
  var container = document.getElementById('positionsContainer');
  lastPositions = positions;
  
  if (!positions || positions.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">📭</div><div class="empty-text">暂无持仓，等待交易信号...</div></div>';
    return;
  }
  
  var html = '';
  for (var i = 0; i < positions.length; i++) {
    var p = positions[i];
    var pnlV = parseFloat(p.pnl);
    var pClass = pnlV >= 0 ? 'profit' : 'loss';
    var posClass = p.isLong ? 'long' : 'short';
    var sideLabel = p.isLong ? '▲ 做多' : '▼ 做空';
    var change15m = parseFloat(p.change15m);
    var changeClass = change15m >= 0 ? 'up' : 'down';
    var isOpen = expandedSymbols[p.symbol] || false;
    var roeW = Math.min(Math.abs(parseFloat(p.roePct)) * 5, 100);
    
    html += '<div class="pos-card ' + posClass + '" onclick="togglePos(\\'' + p.symbol + '\\')">';
    html += '<div class="pos-card-header">';
    html += '<div><span class="pos-symbol">' + p.symbol + '</span> <span class="pos-badge ' + posClass + '">' + sideLabel + ' ' + p.leverage + 'x</span></div>';
    html += '<div class="pos-toggle">' + (isOpen ? '▲' : '▼') + '</div>';
    html += '</div>';
    
    html += '<div class="pos-pnl">';
    html += '<div class="pos-pnl-value ' + pClass + '">' + fmtSign(pnlV) + '$' + p.pnl + '</div>';
    html += '<div class="pos-pnl-sub">持仓: <span class="' + fmtClass(p.pnlPct) + '">' + fmtSign(p.pnlPct) + p.pnlPct + '%</span> · ROE: <span class="' + fmtClass(p.roePct) + '">' + fmtSign(p.roePct) + p.roePct + '%</span></div>';
    html += '</div>';
    
    html += '<div class="pos-prices">';
    html += '<div class="pos-price"><div class="pos-price-label">开仓价</div><div class="pos-price-value">$' + p.entry + '</div></div>';
    html += '<div class="pos-price"><div class="pos-price-label">当前价</div><div class="pos-price-value">$' + p.mark + '</div></div>';
    html += '<div class="pos-price"><div class="pos-price-label">数量</div><div class="pos-price-value">' + p.qty + '</div></div>';
    html += '<div class="pos-price"><div class="pos-price-label">15m涨跌</div><div class="pos-price-value ' + changeClass + '">' + fmtSign(p.change15m) + p.change15m + '%</div></div>';
    html += '</div>';
    
    html += '<div class="pos-footer" style="display:flex;justify-content:space-between;padding:8px 16px;background:#161b22;border-top:1px solid #21262d;font-size:10px;color:#7d8590;">';
    html += '<div>保证金: <span style="color:#e6edf3">$' + p.margin + '</span></div>';
    html += '<div>价值: <span style="color:#e6edf3">$' + p.notional + '</span></div>';
    html += '<div>强平: <span style="color:' + (p.isLong ? '#f85149' : '#3fb950') + '">$' + p.liquidationPrice + '</span></div>';
    html += '</div>';
    
    if (isOpen) {
      html += '<div class="pos-details open">';
      html += '<div class="detail-row"><div class="detail-label">持仓方向</div><div class="detail-value">' + sideLabel + '</div></div>';
      html += '<div class="detail-row"><div class="detail-label">持仓数量</div><div class="detail-value">' + p.qty + '</div></div>';
      html += '<div class="detail-row"><div class="detail-label">杠杆倍数</div><div class="detail-value">' + p.leverage + 'x</div></div>';
      html += '<div class="detail-row"><div class="detail-label">仓位价值</div><div class="detail-value">$' + p.notional + '</div></div>';
      html += '<div class="detail-row"><div class="detail-label">持仓模式</div><div class="detail-value">' + (p.isolated ? '逐仓' : '全仓') + '</div></div>';
      html += '<div class="roe-bar">';
      html += '<div class="roe-header"><span>收益率 ROE</span><span class="' + fmtClass(p.roePct) + '">' + fmtSign(p.roePct) + p.roePct + '%</span></div>';
      html += '<div class="roe-track"><div class="roe-fill ' + pClass + '" style="width:' + roeW + '%"></div></div>';
      html += '</div></div>';
    }
    
    html += '</div>';
  }
  
  container.innerHTML = html;
}

async function loadData() {
  try {
    var resp = await fetch('/api/status');
    var d = await resp.json();
    
    document.getElementById('balance').textContent = '$' + d.balance;
    document.getElementById('walletBalance').textContent = '钱包: $' + d.walletBalance;
    
    var pnl = parseFloat(d.totalPnl);
    var accPnl = parseFloat(d.totalAccountPnl);
    var realized = parseFloat(d.realizedPnl);
    
    var posPnlEl = document.getElementById('posPnl');
    posPnlEl.textContent = (pnl >= 0 ? '+$' : '-$') + Math.abs(pnl).toFixed(2);
    posPnlEl.className = 'stat-value ' + (pnl >= 0 ? 'green' : 'red');
    document.getElementById('posPnlPct').innerHTML = '<span class="' + (pnl >= 0 ? 'green' : 'red') + '">' + fmtSign(d.totalPnlPct) + d.totalPnlPct + '%</span>';
    document.getElementById('cardPosPnl').style.borderColor = pnl >= 0 ? '#3fb950' : '#f85149';
    
    var accPnlEl = document.getElementById('accPnl');
    accPnlEl.textContent = (accPnl >= 0 ? '+$' : '-$') + Math.abs(accPnl).toFixed(2);
    accPnlEl.className = 'stat-value ' + (accPnl >= 0 ? 'green' : 'red');
    document.getElementById('accPnlPct').innerHTML = '<span class="' + (accPnl >= 0 ? 'green' : 'red') + '">' + fmtSign(d.totalAccountPnlPct) + d.totalAccountPnlPct + '%</span>';
    
    var realEl = document.getElementById('realizedPnl');
    realEl.textContent = (realized >= 0 ? '+$' : '-$') + Math.abs(realized).toFixed(2);
    realEl.className = 'stat-value ' + (realized >= 0 ? 'green' : 'red');
    var realPct = d.walletBalance ? ((realized / ${INITIAL_BALANCE}) * 100).toFixed(2) : '0.00';
    document.getElementById('realizedPct').innerHTML = '<span class="' + (realized >= 0 ? 'green' : 'red') + '">' + fmtSign(realPct) + realPct + '%</span>';
    
    document.getElementById('tradeCount').textContent = d.tradeCount || 0;
    document.getElementById('posCount').textContent = d.posCount + '/4';
    document.getElementById('posCountBadge').textContent = d.posCount + ' 个仓位';
    
    // 15m market change (average of all positions)
    if (d.positions && d.positions.length > 0) {
      var avgChange = d.positions.reduce(function(s, p) { return s + parseFloat(p.change15m); }, 0) / d.positions.length;
      var chgEl = document.getElementById('marketChange');
      chgEl.textContent = (avgChange >= 0 ? '+' : '') + avgChange.toFixed(2) + '%';
      chgEl.className = 'stat-value ' + (avgChange >= 0 ? 'green' : 'red');
    } else {
      document.getElementById('marketChange').textContent = '--%';
      document.getElementById('marketChange').className = 'stat-value';
    }
    
    // Total Market Value = Initial Balance + Account PnL
    var totalValue = parseFloat(d.totalMarketValue);
    document.getElementById('totalValue').textContent = '$' + totalValue.toFixed(2);
    
    // Update AI Analysis if needed (every 5 minutes)
    if (d.aiAnalysis && d.aiAnalysis !== '加载中...' && d.aiAnalysis !== '') {
      document.getElementById('aiAnalysis').textContent = d.aiAnalysis;
    }
    
    renderPositions(d.positions);
    
    refreshCount++;
    document.getElementById('refreshCount').textContent = refreshCount;
    
    countdown = REFRESH;
  } catch(e) {
    console.error('Load error:', e);
  }
}

async function updateAI() {
  try {
    var resp = await fetch('/api/ai-analysis');
    var data = await resp.json();
    document.getElementById('aiAnalysis').textContent = data.analysis;
    var updateTime = new Date().toLocaleTimeString('zh-CN', {hour12: false});
    document.getElementById('aiUpdateTime').textContent = '(已更新 ' + updateTime + ')';
  } catch(e) {
    console.error('AI update error:', e);
  }
}

function tick() {
  var elapsed = Date.now() - startTime;
  document.getElementById('runningTime').textContent = formatTime(elapsed);
  document.getElementById('countdown').textContent = countdown + 's';
  
  countdown--;
  aiCountdown--;
  
  if (countdown < 0) {
    loadData();
  }
  
  // Update AI every 5 minutes
  if (aiCountdown <= 0) {
    updateAI();
    aiCountdown = AI_INTERVAL;
  }
  
  setTimeout(tick, 1000);
}

// Initial load
loadData();
// Initial AI load after a short delay
setTimeout(updateAI, 2000);
// Start ticker
setTimeout(tick, 1000);
</script>
</body>
</html>`;

const server = http.createServer(async (req, res) => {
  // API endpoint for AI analysis
  if (req.url === '/api/ai-analysis') {
    await updateAIAnalysis();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ analysis: cachedAIAnalysis, updatedAt: lastAIUpdate }));
    return;
  }
  
  if (req.url === '/api/status') {
    try {
      const data = await getData();
      // Attach cached AI analysis
      data.aiAnalysis = cachedAIAnalysis;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
  } else {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(HTML);
  }
});

// Initial AI update
setTimeout(updateAIAnalysis, 3000);

server.listen(9999, '127.0.0.1', () => console.log('✅ Dashboard at http://localhost:9999'));
