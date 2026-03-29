/**
 * OpenClaw Trader - Professional Trading Dashboard v6
 */
import * as http from "http";
import https from "https";
import crypto from "crypto";

process.on('uncaughtException', (err) => { console.error('UNCAUGHT:', err.message); });
process.on('unhandledRejection', (reason) => { console.error('UNHANDLED:', String(reason)); });

const API_KEY = "rLS9djClUheJUJcqkUFGOylwCuSk1wVkdJMoHXN2TgfswhjBCsOPvh0202vBhAAN";
const SECRET = "EMu9DnZL7DSodz7dSkkSslVC9AtzUGQgQH4a4b9g19CysZdPO73udtnt1gTZjF7Y";
const INITIAL_BALANCE = 5000;

function apiRequest(path: string, params: Record<string,string>={}): Promise<any> {
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
  try {
    const [balData, posData] = await Promise.all([
      apiRequest("/fapi/v2/balance"),
      apiRequest("/fapi/v2/positionRisk")
    ]);
    
    const usdt = balData.find((a: any) => a.asset === "USDT");
    const balance = parseFloat(usdt?.availableBalance || "0");
    const walletBalance = parseFloat(usdt?.crossWalletBalance || usdt?.balance || "0");
    
    const activePositions = posData.filter((p: any) => parseFloat(p.positionAmt) !== 0);
    
    const tickerPromises = activePositions.map(async (p: any) => {
      try {
        const tick = await apiRequest("/fapi/v1/ticker/24hr", { symbol: p.symbol });
        return { symbol: p.symbol, change24h: parseFloat(tick.priceChangePercent || "0") };
      } catch { return { symbol: p.symbol, change24h: 0 }; }
    });
    const changeMap = Object.fromEntries(await Promise.all(tickerPromises));

    const positions = activePositions.map((p: any) => {
      const amt = parseFloat(p.positionAmt);
      const entry = parseFloat(p.entryPrice);
      const mark = parseFloat(p.markPrice) || entry;
      const leverage = parseFloat(p.leverage || "3");
      const rawPnl = parseFloat(p.unRealizedProfit || "0");
      const notional = Math.abs(amt) * entry;
      const margin = notional / leverage;
      const posPnlPct = notional > 0 ? (rawPnl / notional * 100) : 0;
      const roePct = margin > 0 ? (rawPnl / margin * 100) : 0;
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
  } catch (e: any) {
    return { error: e.message, positions: [], posCount: 0, balance: "0", walletBalance: "0", totalPnl: "0", totalPnlPct: "0", totalAccountPnl: "0", totalAccountPnlPct: "0" };
  }
}

const HTML = `<!DOCTYPE html>
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
      <div class="logo">🤖</div>
      <div>
        <div class="header-title">OpenClaw Trading</div>
        <div class="header-sub">Binance Futures Testnet · 3x Hedge Mode</div>
      </div>
    </div>
    <div class="header-right">
      <div class="live-badge"><div class="live-dot"></div> 运行中</div>
      <div class="clock-box">
        <div class="clock" id="clock">--:--:--</div>
        <div class="date" id="date">----/--/--</div>
        <div class="refresh-info">每<span id="refreshSec">10</span>秒刷新</div>
      </div>
    </div>
  </div>
  <div class="refresh-bar"><div class="refresh-progress" id="refreshBar"></div></div>
  <div class="stats-grid">
    <div class="stat-card green-accent" id="cardBalance">
      <div class="stat-icon">💰</div>
      <div class="stat-label">账户余额</div>
      <div class="stat-value green" id="balance">$--</div>
      <div class="stat-meta">初始本金 <span>$5,000</span></div>
    </div>
    <div class="stat-card" id="cardWallet">
      <div class="stat-icon">🏦</div>
      <div class="stat-label">钱包总额</div>
      <div class="stat-value white" id="walletBalance">$--</div>
      <div class="stat-meta">含未实现盈亏</div>
    </div>
    <div class="stat-card" id="cardPosPnl">
      <div class="stat-icon">📊</div>
      <div class="stat-label">持仓盈亏</div>
      <div class="stat-value" id="totalPnl">$--</div>
      <div class="stat-meta">平均 <span id="avgPnlPct">--%</span></div>
    </div>
    <div class="stat-card" id="cardAccPnl">
      <div class="stat-icon">🏆</div>
      <div class="stat-label">账户总盈亏</div>
      <div class="stat-value" id="totalAccountPnl">$--</div>
      <div class="stat-meta">收益率 <span id="accPnlPct">--%</span></div>
    </div>
  </div>
  <div class="stats-grid" style="grid-template-columns:repeat(2,1fr)">
    <div class="stat-card">
      <div class="stat-icon">⏱️</div>
      <div class="stat-label">运行时长</div>
      <div class="stat-value blue" id="runningTime">--:--:--</div>
      <div class="stat-meta">本轮交易时长</div>
    </div>
    <div class="stat-card">
      <div class="stat-icon">📋</div>
      <div class="stat-label">持仓数量</div>
      <div class="stat-value white" id="posCount">0/4</div>
      <div class="stat-meta">最多4个仓位</div>
    </div>
  </div>
  <div class="section">
    <div class="section-header">
      <div class="section-title"><span class="icon">📈</span> 当前持仓 <span class="hint">（点击卡片展开详情）</span></div>
      <div class="section-count" id="posCountBadge">0</div>
    </div>
    <div class="pos-grid" id="positions">
      <div class="empty-state">
        <div class="empty-icon">📭</div>
        <div class="empty-text">暂无持仓，等待交易信号...</div>
      </div>
    </div>
  </div>
  <div class="footer">OpenClaw Trading Dashboard v6 · Binance Futures Testnet</div>
</div>
<div class="modal-overlay" id="modalOverlay">
  <div class="modal">
    <div class="modal-header">
      <div class="modal-title" id="modalTitle">详情</div>
      <button class="modal-close" id="modalClose">✕</button>
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
    return '<div class="empty-state"><div class="empty-icon">📭</div><div class="empty-text">暂无持仓，等待交易信号...</div></div>';
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
    html+='<div class="pos-direction '+(p.isLong?'long':'short')+'">'+(p.isLong?'▲ 做多':'▼ 做空')+'</div></div>';
    html+='<div class="pos-meta"><div class="pos-leverage">'+p.leverage+'x 杠杆</div>';
    html+='<div class="pos-24h" style="color:'+(chg24>=0?'#10b981':'#ef4444')+'">'+chgSign+chg24.toFixed(2)+'%</div></div></div>';
    html+='<div class="pos-pnl-section"><div class="pos-pnl-money '+pClassV+'">'+sign(pV)+'$'+p.pnl+'</div>';
    html+='<div class="pos-pnl-percent '+pClassV+'">'+sign(pPctV)+' '+p.pnlPct+'%</div></div>';
    html+='<div class="pos-price-grid">';
    html+='<div class="pos-price-cell"><div class="pos-price-cell-label">开仓价</div><div class="pos-price-cell-value">$'+p.entry+'</div></div>';
    html+='<div class="pos-price-cell"><div class="pos-price-cell-label">当前价</div><div class="pos-price-cell-value">$'+p.mark+'</div></div>';
    html+='<div class="pos-price-cell"><div class="pos-price-cell-label">数量</div><div class="pos-price-cell-value">'+p.qty+'</div></div>';
    html+='<div class="pos-price-cell"><div class="pos-price-cell-label">收益率</div><div class="pos-price-cell-value" style="color:'+pColor(p.roePct)+'">'+sign(p.roePct)+p.roePct+'%</div></div>';
    html+='</div>';
    html+='<div class="pos-footer"><div class="pos-margin-info">保证金: <span>$'+p.margin+'</span> · 价值: <span>$'+p.notional+'</span></div>';
    html+='<div class="pos-click-hint '+(isOpen?'open':'')+'">'+(isOpen?'▲ 收起':'▼ 详情')+' <span class="arrow">▼</span></div></div>';
    html+='<div class="pos-details '+(isOpen?'open':'')+'">';
    html+='<div class="detail-section"><div class="detail-section-title">交易详情</div>';
    html+='<div class="detail-row"><div class="detail-row-label">持仓方向</div><div class="detail-row-value" style="color:'+pColor(p.pnl)+'">'+(p.isLong?'▲ 做多':'▼ 做空')+'</div></div>';
    html+='<div class="detail-row"><div class="detail-row-label">开仓价格</div><div class="detail-row-value">$'+p.entry+'</div></div>';
    html+='<div class="detail-row"><div class="detail-row-label">当前价格</div><div class="detail-row-value">$'+p.mark+'</div></div>';
    html+='<div class="detail-row"><div class="detail-row-label">持仓数量</div><div class="detail-row-value">'+p.qty+'</div></div>';
    html+='<div class="detail-row"><div class="detail-row-label">杠杆倍数</div><div class="detail-row-value">'+p.leverage+'x</div></div></div>';
    html+='<div class="detail-section"><div class="detail-section-title">盈亏数据</div>';
    html+='<div class="detail-row"><div class="detail-row-label">浮动盈亏</div><div class="detail-row-value highlight" style="color:'+pColor(p.pnl)+'">'+sign(p.pnl)+'$'+p.pnl+'</div></div>';
    html+='<div class="detail-row"><div class="detail-row-label">持仓盈亏率</div><div class="detail-row-value" style="color:'+pColor(p.pnlPct)+'">'+sign(p.pnlPct)+p.pnlPct+'%</div></div>';
    html+='<div class="detail-row"><div class="detail-row-label">收益率 ROE</div><div class="detail-row-value" style="color:'+pColor(p.roePct)+'">'+sign(p.roePct)+p.roePct+'%</div></div>';
    html+='<div class="detail-row"><div class="detail-row-label">24h 涨跌</div><div class="detail-row-value" style="color:'+pColor(p.change24h)+'">'+sign(p.change24h)+p.change24h+'%</div></div></div>';
    html+='<div class="detail-section"><div class="detail-section-title">保证金信息</div>';
    html+='<div class="detail-row"><div class="detail-row-label">保证金</div><div class="detail-row-value">$'+p.margin+'</div></div>';
    html+='<div class="detail-row"><div class="detail-row-label">仓位价值</div><div class="detail-row-value">$'+p.notional+'</div></div>';
    html+='<div class="detail-row"><div class="detail-row-label">强平价格</div><div class="detail-row-value">$'+p.liquidationPrice+'</div></div>';
    html+='<div class="detail-row"><div class="detail-row-label">持仓模式</div><div class="detail-row-value">'+(p.isolated?'逐仓':'全仓')+'</div></div></div>';
    html+='<div class="roe-progress"><div class="roe-progress-label"><span>收益率进度</span><span style="color:'+pColor(p.roePct)+'">'+sign(p.roePct)+p.roePct+'%</span></div>';
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
    title='💰 账户余额详情';
    rows=[{label:'可用余额',value:'$'+d.balance,cls:'green'},{label:'钱包总额',value:'$'+d.walletBalance},{label:'初始本金',value:'$5,000.00'},{label:'持仓数量',value:d.posCount+' 个'}];
    footer='所有金额单位均为 USDT';
  } else if(type==='wallet'){
    title='🏦 钱包总额详情';
    rows=[{label:'钱包总额',value:'$'+d.walletBalance,cls:parseFloat(d.walletBalance)>=5000?'green':'red'},{label:'已实现盈亏',value:'$'+realized,cls:parseFloat(realized)>=0?'green':'red'},{label:'浮动盈亏',value:sign(d.totalPnl)+'$'+d.totalPnl,cls:parseFloat(d.totalPnl)>=0?'green':'red'},{label:'初始本金',value:'$5,000.00'}];
    footer='钱包总额 = 已实现盈亏 + 浮动盈亏';
  } else if(type==='pospnl'){
    title='📊 持仓盈亏详情';
    rows=[{label:'持仓总盈亏',value:sign(d.totalPnl)+'$'+d.totalPnl,cls:parseFloat(d.totalPnl)>=0?'green':'red'},{label:'平均盈亏率',value:sign(d.totalPnlPct)+d.totalPnlPct+'%',cls:parseFloat(d.totalPnlPct)>=0?'green':'red'},{label:'计算方式',value:'做多=(当前-开仓)×数量'},{label:'',value:'做空=(开仓-当前)×数量'}];
    footer='仅显示当前持仓的浮动盈亏，不含已实现盈亏';
  } else if(type==='accpnl'){
    title='🏆 账户总盈亏详情';
    rows=[{label:'账户总盈亏',value:sign(d.totalAccountPnl)+'$'+d.totalAccountPnl,cls:parseFloat(d.totalAccountPnl)>=0?'green':'red'},{label:'收益率',value:sign(d.totalAccountPnlPct)+d.totalAccountPnlPct+'%',cls:parseFloat(d.totalAccountPnlPct)>=0?'green':'red'},{label:'钱包总额',value:'$'+d.walletBalance},{label:'已实现盈亏',value:'$'+realized,cls:parseFloat(realized)>=0?'green':'red'}];
    footer='账户总盈亏 = 已实现盈亏 + 浮动盈亏';
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

const server = http.createServer(async (req, res) => {
  if (req.url === '/api/status') {
    try {
      const data = await getData();
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify(data));
    } catch (e: any) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
  } else {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(HTML);
  }
});

server.on('error', (e: any) => { console.error('Server error:', e.code); });
server.listen(9999, () => console.log('Dashboard v6 at http://localhost:9999'));
setInterval(() => {}, 1000);
