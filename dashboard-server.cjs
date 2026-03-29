/**
 * OpenClaw Trading Dashboard - Pure JavaScript Version
 */
const http = require('http');
const https = require('https');
const crypto = require('crypto');

const API_KEY = "rLS9djClUheJUJcqkUFGOylwCuSk1wVkdJMoHXN2TgfswhjBCsOPvh0202vBhAAN";
const SECRET = "EMu9DnZL7DSodz7dSkkSslVC9AtzUGQgQH4a4b9g19CysZdPO73udtnt1gTZjF7Y";
const INITIAL_BALANCE = 5000;

function apiRequest(path, params = {}) {
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

async function getData() {
  try {
    const [balData, posData] = await Promise.all([
      apiRequest('/fapi/v2/balance'),
      apiRequest('/fapi/v2/positionRisk')
    ]);

    const usdt = balData.find((a) => a.asset === 'USDT');
    const balance = parseFloat(usdt?.availableBalance || '0');
    const walletBalance = parseFloat(usdt?.crossWalletBalance || usdt?.balance || '0');

    const activePositions = posData.filter((p) => parseFloat(p.positionAmt) !== 0);

    const changePromises = activePositions.map(async (p) => {
      try {
        const tick = await apiRequest('/fapi/v1/ticker/24hr', { symbol: p.symbol });
        return { symbol: p.symbol, change24h: parseFloat(tick.priceChangePercent || '0') };
      } catch { return { symbol: p.symbol, change24h: 0 }; }
    });
    const changeMap = Object.fromEntries(await Promise.all(changePromises));

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
      const change24h = changeMap[p.symbol] || 0;

      return {
        symbol: p.symbol,
        side: amt > 0 ? 'LONG' : 'SHORT',
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
        liquidationPrice: p.liquidationPrice || '0',
        isolated: p.isolated || false,
      };
    });

    const totalPosPnl = positions.reduce((sum, p) => sum + parseFloat(p.pnl), 0);
    const totalPosPnlPct = positions.length > 0
      ? (positions.reduce((sum, p) => sum + parseFloat(p.pnlPct), 0) / positions.length) : 0;
    const totalAccountPnl = walletBalance - INITIAL_BALANCE;
    const totalAccountPnlPct = (totalAccountPnl / INITIAL_BALANCE * 100);

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

const HTML = `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>OpenClaw Trading Dashboard</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif; background: linear-gradient(135deg, #0a0e17 0%, #111827 50%, #0f172a 100%); color: #e2e8f0; min-height: 100vh; padding: 20px; font-size: 14px; }
.container { max-width: 1400px; margin: 0 auto; }
.header { display: flex; justify-content: space-between; align-items: center; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; padding: 16px 24px; margin-bottom: 20px; cursor: pointer; transition: all 0.3s; }
.header:hover { background: rgba(255,255,255,0.05); border-color: rgba(255,255,255,0.12); }
.header-left { display: flex; align-items: center; gap: 14px; }
.logo { font-size: 28px; }
.title { font-size: 20px; font-weight: 700; color: #f8fafc; }
.subtitle { font-size: 11px; color: #64748b; margin-top: 2px; }
.header-right { text-align: right; }
.live-badge { display: inline-flex; align-items: center; gap: 6px; background: rgba(0,200,83,0.12); border: 1px solid #00c853; color: #00c853; padding: 5px 14px; border-radius: 20px; font-size: 12px; font-weight: 600; }
.live-dot { width: 7px; height: 7px; background: #00c853; border-radius: 50%; animation: pulse 2s infinite; }
@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
.clock { font-size: 12px; color: #94a3b8; margin-top: 4px; font-variant-numeric: tabular-nums; }
.stats-grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 12px; margin-bottom: 20px; }
.stat-card { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.07); border-radius: 14px; padding: 16px 18px; cursor: pointer; transition: all 0.3s; }
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
.section { background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); border-radius: 16px; padding: 20px; margin-bottom: 16px; }
.section-title { font-size: 15px; font-weight: 700; color: #f8fafc; margin-bottom: 16px; display: flex; align-items: center; gap: 8px; }
.section-title span { color: #64748b; font-weight: 400; font-size: 12px; }
.pos-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)); gap: 14px; }
.pos-card { background: linear-gradient(145deg, rgba(30,41,59,0.95), rgba(15,23,42,0.98)); border-radius: 14px; overflow: hidden; border: 1px solid rgba(255,255,255,0.08); cursor: pointer; transition: all 0.3s; }
.pos-card:hover { transform: translateY(-3px); box-shadow: 0 12px 35px rgba(0,0,0,0.4); }
.pos-card.long { border-color: rgba(16,185,129,0.35); }
.pos-card.short { border-color: rgba(239,68,68,0.35); }
.pos-header { display: flex; justify-content: space-between; align-items: center; padding: 14px 16px; border-bottom: 1px solid rgba(255,255,255,0.05); }
.pos-symbol { font-size: 17px; font-weight: 800; color: #f1f5f9; }
.pos-badge { padding: 4px 12px; border-radius: 6px; font-size: 11px; font-weight: 700; }
.pos-badge.long { background: rgba(16,185,129,0.15); color: #10b981; border: 1px solid rgba(16,185,129,0.3); }
.pos-badge.short { background: rgba(239,68,68,0.15); color: #ef4444; border: 1px solid rgba(239,68,68,0.3); }
.pos-pnl-main { padding: 16px; text-align: center; }
.pos-pnl-value { font-size: 32px; font-weight: 800; font-variant-numeric: tabular-nums; line-height: 1.2; }
.pos-pnl-value.profit { color: #10b981; }
.pos-pnl-value.loss { color: #ef4444; }
.pos-pnl-sub { font-size: 12px; color: #64748b; margin-top: 4px; }
.pos-pnl-sub span { font-weight: 600; }
.pos-prices { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 1px; background: rgba(255,255,255,0.05); }
.pos-price { padding: 10px 12px; text-align: center; background: rgba(15,23,42,0.8); }
.pos-price-label { font-size: 9px; color: #475569; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }
.pos-price-value { font-size: 13px; font-weight: 700; color: #cbd5e1; font-variant-numeric: tabular-nums; }
.pos-price-value.up { color: #10b981; }
.pos-price-value.down { color: #ef4444; }
.pos-footer { display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; background: rgba(0,0,0,0.2); font-size: 11px; color: #475569; }
.pos-footer span { color: #64748b; }
.pos-expand { font-size: 12px; color: #64748b; transition: transform 0.3s; }
.pos-expand.open { transform: rotate(180deg); }
.pos-details { display: none; padding: 16px; border-top: 1px solid rgba(255,255,255,0.06); background: rgba(0,0,0,0.2); }
.pos-details.open { display: block; }
.detail-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.04); }
.detail-row:last-child { border-bottom: none; }
.detail-label { font-size: 12px; color: #64748b; }
.detail-value { font-size: 12px; font-weight: 600; color: #94a3b8; }
.detail-value.highlight { color: #10b981; font-size: 14px; }
.roe-bar { margin-top: 12px; }
.roe-bar-label { display: flex; justify-content: space-between; font-size: 10px; color: #475569; margin-bottom: 6px; }
.roe-track { height: 6px; background: rgba(255,255,255,0.08); border-radius: 3px; overflow: hidden; }
.roe-fill { height: 100%; border-radius: 3px; transition: width 0.5s; }
.roe-fill.profit { background: linear-gradient(90deg, #10b981, #34d399); }
.roe-fill.loss { background: linear-gradient(90deg, #ef4444, #f87171); }
.no-pos { text-align: center; padding: 50px 20px; color: #475569; font-size: 13px; }
.no-pos-icon { font-size: 40px; margin-bottom: 12px; opacity: 0.5; }
.modal-overlay { display: none; position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.7); z-index: 1000; align-items: center; justify-content: center; backdrop-filter: blur(4px); }
.modal-overlay.show { display: flex; }
.modal { background: linear-gradient(145deg, #1e293b, #0f172a); border: 1px solid rgba(255,255,255,0.1); border-radius: 16px; padding: 24px; max-width: 480px; width: 90%; animation: modalIn 0.3s ease; }
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
.refresh-bar { height: 3px; background: rgba(255,255,255,0.05); border-radius: 2px; margin-bottom: 20px; overflow: hidden; }
.refresh-progress { height: 100%; background: linear-gradient(90deg, #3b82f6, #10b981); border-radius: 2px; transition: width 1s linear; width: 0%; }
.footer { text-align: center; color: #334155; font-size: 11px; margin-top: 20px; }
@media (max-width: 1000px) { .stats-grid { grid-template-columns: repeat(3, 1fr); } }
@media (max-width: 700px) { .stats-grid { grid-template-columns: repeat(2, 1fr); } .header { flex-direction: column; gap: 12px; } .header-right { text-align: left; } }
</style>
</head>
<body>
<div class="container">
  <div class="header" onclick="showModal('system')">
    <div class="header-left">
      <div class="logo">🤖</div>
      <div>
        <div class="title">OpenClaw Trading</div>
        <div class="subtitle">Binance Futures Testnet · 3x Hedge Mode · 点击查看系统信息</div>
      </div>
    </div>
    <div class="header-right">
      <div class="live-badge"><div class="live-dot"></div> LIVE</div>
      <div class="clock" id="clock">--:--:--</div>
    </div>
  </div>
  <div class="refresh-bar"><div class="refresh-progress" id="refreshBar"></div></div>
  <div class="stats-grid">
    <div class="stat-card green" onclick="showModal('balance')">
      <div class="stat-label">💰 账户余额</div>
      <div class="stat-value green" id="balance">$--</div>
      <div class="stat-sub">初始 $5,000</div>
    </div>
    <div class="stat-card" id="cardPosPnl" onclick="showModal('pnl')">
      <div class="stat-label">📊 持仓盈亏</div>
      <div class="stat-value" id="posPnl">$--</div>
      <div class="stat-sub" id="posPnlPct">--%</div>
    </div>
    <div class="stat-card" id="cardAccPnl" onclick="showModal('account')">
      <div class="stat-label">🏦 账户总盈亏</div>
      <div class="stat-value" id="accPnl">$--</div>
      <div class="stat-sub" id="accPnlPct">--%</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">🔢 持仓数量</div>
      <div class="stat-value white" id="posCount">0/4</div>
      <div class="stat-sub">最多4个仓位</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">📈 24h 涨跌</div>
      <div class="stat-value" id="marketChange">--</div>
      <div class="stat-sub">综合平均</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">⏱️ 运行时长</div>
      <div class="stat-value blue" id="runningHours">--</div>
      <div class="stat-sub">小时</div>
    </div>
  </div>
  <div class="section">
    <div class="section-title">📊 当前持仓 <span>（点击卡片展开详情）</span></div>
    <div class="pos-grid" id="positions">
      <div class="no-pos">
        <div class="no-pos-icon">📭</div>
        暂无持仓，等待交易信号...
      </div>
    </div>
  </div>
  <div class="footer">OpenClaw Trading Dashboard v5 · 数据每5秒自动刷新 · Binance Testnet</div>
</div>
<div class="modal-overlay" id="modalOverlay" onclick="if(event.target===this)closeModal()">
  <div class="modal">
    <div class="modal-header">
      <div class="modal-title" id="modalTitle">详情</div>
      <button class="modal-close" onclick="closeModal()">✕</button>
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

function toggleCard(symbol) {
  if (expandedCards.has(symbol)) {
    expandedCards.delete(symbol);
  } else {
    expandedCards.add(symbol);
  }
  renderPositions(window._lastData ? window._lastData.positions : []);
}

function renderPositions(positions) {
  if (positions.length === 0) {
    return '<div class="no-pos"><div class="no-pos-icon">📭</div>暂无持仓，等待交易信号...</div>';
  }
  return positions.map(function(p) {
    var pnlV = parseFloat(p.pnl);
    var pClass = pnlV >= 0 ? 'profit' : 'loss';
    var change24h = parseFloat(p.change24h);
    var changeClass = change24h >= 0 ? 'up' : 'down';
    var isOpen = expandedCards.has(p.symbol);
    var roeV = Math.abs(parseFloat(p.roePct));
    var roeWidth = Math.min(roeV * 10, 100);
    var sideLabel = p.isLong ? '▲ 做多' : '▼ 做空';
    var posClass = p.isLong ? 'long' : 'short';
    return '<div class="pos-card ' + posClass + '" data-symbol="' + p.symbol + '">' +
      '<div class="pos-header">' +
        '<div class="pos-symbol">' + p.symbol + '</div>' +
        '<div class="pos-badge ' + posClass + '">' + sideLabel + ' ' + p.leverage + 'x</div>' +
      '</div>' +
      '<div class="pos-pnl-main">' +
        '<div class="pos-pnl-value ' + pClass + '">' + pnlSign(pnlV) + '$' + p.pnl + '</div>' +
        '<div class="pos-pnl-sub">持仓盈亏率: <span>' + pnlSign(p.pnlPct) + p.pnlPct + '%</span> · ROE: <span>' + pnlSign(p.roePct) + p.roePct + '%</span></div>' +
      '</div>' +
      '<div class="pos-prices">' +
        '<div class="pos-price"><div class="pos-price-label">开仓价</div><div class="pos-price-value">$' + p.entry + '</div></div>' +
        '<div class="pos-price"><div class="pos-price-label">当前价</div><div class="pos-price-value">$' + p.mark + '</div></div>' +
        '<div class="pos-price"><div class="pos-price-label">数量</div><div class="pos-price-value">' + p.qty + '</div></div>' +
        '<div class="pos-price"><div class="pos-price-label">24h涨跌</div><div class="pos-price-value ' + changeClass + '">' + pnlSign(p.change24h) + p.change24h + '%</div></div>' +
      '</div>' +
      '<div class="pos-footer">' +
        '<div>保证金: <span>$' + p.margin + '</span> · 价值: <span>$' + p.notional + '</span></div>' +
        '<div class="pos-expand ' + (isOpen ? 'open' : '') + '">' + (isOpen ? '▲ 收起' : '▼ 展开') + '</div>' +
      '</div>' +
      '<div class="pos-details ' + (isOpen ? 'open' : '') + '">' +
        '<div class="detail-row"><div class="detail-label">持仓方向</div><div class="detail-value" style="color:' + pnlColor(p.pnl) + '">' + sideLabel + '</div></div>' +
        '<div class="detail-row"><div class="detail-label">开仓价格</div><div class="detail-value">$' + p.entry + '</div></div>' +
        '<div class="detail-row"><div class="detail-label">当前价格</div><div class="detail-value">$' + p.mark + '</div></div>' +
        '<div class="detail-row"><div class="detail-label">持仓数量</div><div class="detail-value">' + p.qty + '</div></div>' +
        '<div class="detail-row"><div class="detail-label">杠杆倍数</div><div class="detail-value">' + p.leverage + 'x</div></div>' +
        '<div class="detail-row"><div class="detail-label">保证金</div><div class="detail-value">$' + p.margin + '</div></div>' +
        '<div class="detail-row"><div class="detail-label">仓位价值</div><div class="detail-value">$' + p.notional + '</div></div>' +
        '<div class="detail-row"><div class="detail-label">强平价格</div><div class="detail-value">$' + p.liquidationPrice + '</div></div>' +
        '<div class="detail-row"><div class="detail-label">浮动盈亏</div><div class="detail-value highlight" style="color:' + pnlColor(p.pnl) + '">' + pnlSign(p.pnl) + '$' + p.pnl + '</div></div>' +
        '<div class="detail-row"><div class="detail-label">持仓盈亏率</div><div class="detail-value" style="color:' + pnlColor(p.pnlPct) + '">' + pnlSign(p.pnlPct) + p.pnlPct + '%</div></div>' +
        '<div class="detail-row"><div class="detail-label">收益率 ROE</div><div class="detail-value" style="color:' + pnlColor(p.roePct) + '">' + pnlSign(p.roePct) + p.roePct + '%</div></div>' +
        '<div class="detail-row"><div class="detail-label">24h 涨跌</div><div class="detail-value" style="color:' + pnlColor(p.change24h) + '">' + pnlSign(p.change24h) + p.change24h + '%</div></div>' +
        '<div class="detail-row"><div class="detail-label">持仓模式</div><div class="detail-value">' + (p.isolated ? '逐仓' : '全仓') + '</div></div>' +
        '<div class="roe-bar">' +
          '<div class="roe-bar-label"><span>收益率进度</span><span style="color:' + pnlColor(p.roePct) + '">' + pnlSign(p.roePct) + p.roePct + '%</span></div>' +
          '<div class="roe-track"><div class="roe-fill ' + pClass + '" style="width:' + roeWidth + '%"></div></div>' +
        '</div>' +
      '</div>' +
    '</div>';
  }).join('');
}

document.addEventListener('click', function(e) {
  var card = e.target.closest('.pos-card');
  if (card && card.dataset.symbol) {
    toggleCard(card.dataset.symbol);
  }
});

function showModal(type) {
  var d = window._lastData;
  if (!d) return;
  var rows = [];
  if (type === 'system') {
    document.getElementById('modalTitle').textContent = '🤖 系统信息';
    rows.push({ label: '面板版本', value: 'v5.0 专业版' });
    rows.push({ label: '数据刷新', value: '每5秒自动' });
    rows.push({ label: '交易平台', value: 'Binance Futures Testnet' });
    rows.push({ label: '策略模式', value: '3x Hedge Mode' });
    rows.push({ label: '最大持仓', value: '4个仓位' });
    rows.push({ label: '初始本金', value: '$5,000 USDT' });
    rows.push({ label: '运行时长', value: ((Date.now() - startTime) / 3600000).toFixed(1) + ' 小时' });
    document.getElementById('modalFooter').textContent = 'OpenClaw Trading Dashboard';
  } else if (type === 'balance') {
    document.getElementById('modalTitle').textContent = '💰 账户余额详情';
    rows.push({ label: '可用余额', value: '$' + d.balance, class: 'green' });
    rows.push({ label: '钱包总额', value: '$' + d.walletBalance });
    rows.push({ label: '初始本金', value: '$5,000.00' });
    rows.push({ label: '持仓保证金', value: '$' + (d.positions.reduce(function(s,p){return s+parseFloat(p.margin);},0)).toFixed(2) });
    rows.push({ label: '持仓数量', value: d.posCount + ' 个' });
    document.getElementById('modalFooter').textContent = '所有金额单位均为 USDT';
  } else if (type === 'pnl') {
    var pClass = parseFloat(d.totalPnl) >= 0 ? 'green' : 'red';
    document.getElementById('modalTitle').textContent = '📊 持仓盈亏说明';
    rows.push({ label: '持仓总盈亏', value: pnlSign(d.totalPnl) + '$' + d.totalPnl, class: pClass });
    rows.push({ label: '平均盈亏率', value: pnlSign(d.totalPnlPct) + d.totalPnlPct + '%', class: pClass });
    rows.push({ label: '计算方式', value: '做多=(当前-开仓)×数量', class: '' });
    rows.push({ label: '', value: '做空=(开仓-当前)×数量', class: '' });
    document.getElementById('modalFooter').textContent = '仅显示当前持仓的浮动盈亏，不含已实现盈亏';
  } else if (type === 'account') {
    var accClass = parseFloat(d.totalAccountPnl) >= 0 ? 'green' : 'red';
    document.getElementById('modalTitle').textContent = '🏦 账户总盈亏说明';
    rows.push({ label: '账户总盈亏', value: pnlSign(d.totalAccountPnl) + '$' + d.totalAccountPnl, class: accClass });
    rows.push({ label: '盈亏比例', value: pnlSign(d.totalAccountPnlPct) + d.totalAccountPnlPct + '%', class: accClass });
    rows.push({ label: '计算方式', value: '钱包总额 - 初始本金', class: '' });
    rows.push({ label: '', value: '$' + d.walletBalance + ' - $5,000', class: '' });
    rows.push({ label: '已实现盈亏', value: '$' + (parseFloat(d.walletBalance) - parseFloat(d.balance) - parseFloat(d.totalPnl)).toFixed(2) });
    document.getElementById('modalFooter').textContent = '账户总盈亏 = 已实现盈亏 + 浮动盈亏';
  }
  document.getElementById('modalInfo').innerHTML = rows.map(function(r) {
    return '<div class="modal-row">' +
      '<div class="modal-row-label">' + r.label + '</div>' +
      '<div class="modal-row-value ' + (r.class || '') + '">' + r.value + '</div>' +
    '</div>';
  }).join('');
  document.getElementById('modalOverlay').classList.add('show');
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('show');
}

async function load() {
  try {
    var r = await fetch('/api/status');
    var d = await r.json();
    window._lastData = d;
    if (d.error) {
      document.getElementById('balance').textContent = '错误';
      return;
    }
    var pnl = parseFloat(d.totalPnl);
    var accPnl = parseFloat(d.totalAccountPnl);
    document.getElementById('balance').textContent = '$' + d.balance;
    var posPnlEl = document.getElementById('posPnl');
    posPnlEl.textContent = (pnl >= 0 ? '+$' : '-$') + Math.abs(pnl).toFixed(2);
    posPnlEl.className = 'stat-value ' + (pnl >= 0 ? 'green' : 'red');
    document.getElementById('posPnlPct').textContent = (pnl >= 0 ? '+' : '') + d.totalPnlPct + '%';
    document.getElementById('cardPosPnl').className = 'stat-card ' + (pnl >= 0 ? 'green' : 'red');
    var accPnlEl = document.getElementById('accPnl');
    accPnlEl.textContent = (accPnl >= 0 ? '+$' : '-$') + Math.abs(accPnl).toFixed(2);
    accPnlEl.className = 'stat-value ' + (accPnl >= 0 ? 'green' : 'red');
    document.getElementById('accPnlPct').textContent = (accPnl >= 0 ? '+' : '') + d.totalAccountPnlPct + '%';
    document.getElementById('cardAccPnl').className = 'stat-card ' + (accPnl >= 0 ? 'green' : 'red');
    document.getElementById('posCount').textContent = d.posCount + '/4';
    if (d.positions.length > 0) {
      var avgChange = d.positions.reduce(function(s,p){return s+parseFloat(p.change24h);},0) / d.positions.length;
      var changeEl = document.getElementById('marketChange');
      changeEl.textContent = (avgChange >= 0 ? '+' : '') + avgChange.toFixed(2) + '%';
      changeEl.className = 'stat-value ' + (avgChange >= 0 ? 'green' : 'red');
    }
    document.getElementById('runningHours').textContent = ((Date.now() - startTime) / 3600000).toFixed(1);
    document.getElementById('positions').innerHTML = renderPositions(d.positions);
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

const server = http.createServer(async (req, res) => {
  if (req.url === '/api/status') {
    try {
      const data = await getData();
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
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

server.listen(9999, () => console.log('✅ Dashboard at http://localhost:9999'));
