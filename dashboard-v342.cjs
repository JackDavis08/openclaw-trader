const http = require('http');
const https = require('https');
const crypto = require('crypto');

const API_KEY = 'rLS9djClUheJUJcqkUFGOylwCuSk1wVkdJMoHXN2TgfswhjBCsOPvh0202vBhAAN';
const SECRET = 'EMu9DnZL7DSodz7dSkkSslVC9AtzUGQgQH4a4b9g19CysZdPO73udtnt1gTZjF7Y';

function apiReq(path, params) {
  params = params || {};
  return new Promise((resolve, reject) => {
    const ts = Date.now();
    const qp = {...params, timestamp: String(ts)};
    const q = Object.entries(qp).map(([k,v]) => k+'='+encodeURIComponent(v)).join('&');
    const sig = crypto.createHmac('sha256', SECRET).update(q).digest('hex');
    const opts = { hostname: 'testnet.binancefuture.com', path: path+'?'+q+'&signature='+sig, headers: { 'X-MBX-APIKEY': API_KEY } };
    const req = https.request(opts, res => { let d=''; res.on('data',c=>d+=c); res.on('end',()=>{try{resolve(JSON.parse(d));}catch{e}}) });
    req.on('error', reject); req.end();
  });
}

async function getStatus() {
  try {
    const [bal, pos] = await Promise.all([apiReq('/fapi/v2/balance'), apiReq('/fapi/v2/positionRisk')]);
    const usdt = bal.find(a=>a.asset==='USDT');
    const bal2 = parseFloat(usdt?.availableBalance||'0');
    const wallet = parseFloat(usdt?.crossWalletBalance||usdt?.balance||'0');
    const active = pos.filter(p=>parseFloat(p.positionAmt)!==0);
    const positions = active.map(p => {
      const amt = parseFloat(p.positionAmt);
      const entry = parseFloat(p.entryPrice);
      const mark = parseFloat(p.markPrice)||entry;
      const lev = parseFloat(p.leverage||'3');
      const pnl = parseFloat(p.unRealizedProfit||'0');
      const notional = Math.abs(amt)*entry;
      const margin = notional/lev;
      return {
        symbol: p.symbol,
        side: amt>0?'LONG':'SHORT',
        qty: Math.abs(amt),
        entry: entry.toFixed(4),
        mark: mark.toFixed(4),
        pnl: pnl.toFixed(2),
        pnlPct: notional>0?(pnl/notional*100).toFixed(2):'0.00',
        roePct: margin>0?(pnl/margin*100).toFixed(2):'0.00',
        leverage: lev,
        margin: margin.toFixed(2),
        isLong: amt>0
      };
    });
    const totalPnl = positions.reduce((s,p)=>s+parseFloat(p.pnl),0);
    const totalAccPnl = wallet - 5000;
    return {
      balance: bal2.toFixed(2),
      walletBalance: wallet.toFixed(2),
      totalPnl: totalPnl.toFixed(2),
      totalPnlPct: positions.length>0?(positions.reduce((s,p)=>s+parseFloat(p.pnlPct),0)/positions.length).toFixed(2):'0.00',
      totalAccountPnl: totalAccPnl.toFixed(2),
      totalAccountPnlPct: (totalAccPnl/5000*100).toFixed(2),
      positions,
      posCount: positions.length,
      timestamp: Date.now()
    };
  } catch(e) { return { error: e.message, positions:[], posCount:0 }; }
}

const HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>OpenClaw Automated Trading</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Segoe UI','Microsoft YaHei',sans-serif;background:linear-gradient(135deg,#0a0e17 0%,#111827 50%,#0f172a 100%);color:#e2e8f0;padding:20px;min-height:100vh;font-size:14px}
.c{max-width:1400px;margin:0 auto}
/* Header */
.h{display:flex;justify-content:space-between;align-items:center;background:linear-gradient(135deg,rgba(30,41,59,0.95),rgba(15,23,42,0.98));border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:20px 28px;margin-bottom:16px;box-shadow:0 8px 32px rgba(0,0,0,0.3)}
.hl{display:flex;align-items:center;gap:16px}
.logo{font-size:36px}
.title{font-size:24px;font-weight:800;color:#f8fafc}
.sub{font-size:12px;color:#64748b;margin-top:4px}
.hr{text-align:right}
.live{display:inline-flex;align-items:center;gap:8px;background:rgba(0,200,83,0.15);border:1px solid #00c853;color:#00c853;padding:6px 16px;border-radius:20px;font-size:12px;font-weight:700;margin-bottom:6px}
.dot{width:8px;height:8px;background:#00c853;border-radius:50%;animation:pulse 2s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}
.clock{font-size:22px;font-weight:700;color:#f1f5f9;font-variant-numeric:tabular-nums}
/* Strategy Bar */
.sb{background:rgba(59,130,246,0.1);border:1px solid rgba(59,130,246,0.2);border-radius:12px;padding:12px 24px;margin-bottom:16px;display:flex;flex-wrap:wrap;gap:16px;align-items:center;font-size:12px}
.sb-item{display:flex;align-items:center;gap:6px}
.sl{color:#94a3b8;font-weight:500}
.sv{color:#60a5fa;font-weight:700}
.sep{color:#334155}
/* Refresh Bar */
.rb{height:4px;background:rgba(255,255,255,0.05);border-radius:2px;margin-bottom:16px;overflow:hidden}
.rf{height:100%;background:linear-gradient(90deg,#3b82f6,#10b981);border-radius:2px;transition:width 1s linear;width:0%}
/* Stats Grid */
.g{display:grid;grid-template-columns:repeat(6,1fr);gap:14px;margin-bottom:16px}
.k{background:linear-gradient(145deg,rgba(30,41,59,0.9),rgba(15,23,42,0.95));border-radius:16px;padding:18px 20px;border:1px solid rgba(255,255,255,0.08);transition:all 0.3s;cursor:pointer}
.k:hover{transform:translateY(-3px);box-shadow:0 10px 30px rgba(0,0,0,0.4);border-color:rgba(255,255,255,0.15)}
.k.gn{border-color:rgba(16,185,129,0.3)}
.k.rd{border-color:rgba(239,68,68,0.3)}
.ic{font-size:24px;margin-bottom:10px}
.lb{font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px}
.v{font-size:26px;font-weight:800;font-variant-numeric:tabular-nums}
.gn{color:#10b981}
.rd{color:#ef4444}
.wt{color:#f1f5f9}
.bl{color:#3b82f6}
.mt{font-size:10px;color:#475569;margin-top:6px}
/* Sections */
.se{background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.05);border-radius:16px;padding:24px;margin-bottom:16px}
.sh{display:flex;justify-content:space-between;align-items:center;margin-bottom:18px}
.st{font-size:16px;font-weight:700;color:#f8fafc}
.sc{background:rgba(245,158,11,0.15);color:#f59e0b;padding:4px 14px;border-radius:20px;font-size:12px;font-weight:700}
/* Position Grid */
.pg{display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:16px}
.pc{background:linear-gradient(145deg,rgba(30,41,59,0.95),rgba(15,23,42,0.98));border-radius:14px;overflow:hidden;border:1px solid rgba(255,255,255,0.08);cursor:pointer;transition:all 0.3s}
.pc:hover{transform:translateY(-4px);box-shadow:0 15px 40px rgba(0,0,0,0.5)}
.pc.ln{border-color:rgba(16,185,129,0.35)}
.pc.sh{border-color:rgba(239,68,68,0.35)}
.ptop{display:flex;justify-content:space-between;align-items:center;padding:16px 18px;border-bottom:1px solid rgba(255,255,255,0.06)}
.psym{font-size:18px;font-weight:800}
.pdir{padding:4px 12px;border-radius:6px;font-size:11px;font-weight:700}
.pdir.ln{background:rgba(16,185,129,0.15);color:#10b981;border:1px solid rgba(16,185,129,0.3)}
.pdir.sh{background:rgba(239,68,68,0.15);color:#ef4444;border:1px solid rgba(239,68,68,0.3)}
.pm{text-align:center;padding:18px}
.pmv{font-size:34px;font-weight:900}
.pmp{font-size:14px;margin-top:6px;opacity:0.85}
.pfg{display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:1px;background:rgba(255,255,255,0.05)}
.pcel{background:rgba(15,23,42,0.9);padding:12px 8px;text-align:center}
.pcl{font-size:9px;color:#475569;text-transform:uppercase;margin-bottom:5px}
.pcv{font-size:14px;font-weight:700}
.pft{display:flex;justify-content:space-between;padding:12px 18px;background:rgba(0,0,0,0.2);border-top:1px solid rgba(255,255,255,0.04);font-size:11px;color:#475569}
.pft span{color:#64748b;font-weight:600}
.pde{display:none;padding:0 18px 18px;background:rgba(0,0,0,0.15);border-top:1px solid rgba(255,255,255,0.05)}
.pde.ov{display:block}
.dr{display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.04)}
.dr:last-child{border:none}
.dl{font-size:13px;color:#64748b}
.dv{font-size:14px;font-weight:700}
.rp{margin-top:14px}
.rl{display:flex;justify-content:space-between;font-size:11px;color:#475569;margin-bottom:8px}
.rt{height:8px;background:rgba(255,255,255,0.08);border-radius:4px;overflow:hidden}
.rff{height:100%;border-radius:4px}
/* Empty State */
.ef{text-align:center;padding:50px 20px;color:#475569}
.ei{font-size:50px;margin-bottom:14px;opacity:0.4}
/* AI Section */
.ai{background:linear-gradient(135deg,rgba(59,130,246,0.1),rgba(139,92,246,0.1));border:1px solid rgba(59,130,246,0.2);border-radius:16px;padding:20px}
.ai-h{display:flex;align-items:center;gap:10px;margin-bottom:14px;font-size:14px;font-weight:700;color:#f8fafc}
.ai-c{font-size:13px;color:#94a3b8;line-height:1.7}
.ai-c .po{color:#10b981;font-weight:600}
.ai-c .ng{color:#ef4444;font-weight:600}
/* Footer */
.f{text-align:center;color:#334155;font-size:11px;margin-top:16px}
/* Modal */
.mo{display:none;position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.75);z-index:1000;align-items:center;justify-content:center;backdrop-filter:blur(6px)}
.mo.ov{display:flex}
.md{background:linear-gradient(145deg,#1e293b,#0f172a);border:1px solid rgba(255,255,255,0.1);border-radius:18px;padding:28px;max-width:460px;width:90%}
.mh{display:flex;justify-content:space-between;align-items:center;margin-bottom:20px}
.mt{font-size:18px;font-weight:800;color:#f1f5f0}
.mc{width:32px;height:32px;border-radius:50%;border:none;background:rgba(255,255,255,0.06);color:#64748b;font-size:16px;cursor:pointer}
.mc:hover{background:rgba(239,68,68,0.2);color:#ef4444}
.mg{display:grid;gap:10px}
.mr{display:flex;justify-content:space-between;padding:14px;background:rgba(255,255,255,0.03);border-radius:10px}
.ml{font-size:13px;color:#64748b}
.mv{font-size:14px;font-weight:700}
.mf{margin-top:18px;text-align:center;font-size:11px;color:#334155}
@media(max-width:1100px){.g{grid-template-columns:repeat(3,1fr)}}
@media(max-width:700px){.h{flex-direction:column;gap:14px;text-align:center}.g{grid-template-columns:repeat(2,1fr)}}
</style>
</head>
<body>
<div class="c">
  <div class="h">
    <div class="hl">
      <div class="logo">馃</div>
      <div>
        <div class="title">OpenClaw Automated Trading</div>
        <div class="sub">Binance Futures Testnet 路 v3.4 路 Intelligent Trading System</div>
      </div>
    </div>
    <div class="hr">
      <div class="live"><div class="dot"></div> RUNNING</div>
      <div class="clock" id="ck">--:--:--</div>
    </div>
  </div>

  <div class="sb">
    <div class="sb-item"><span class="sl">TP:</span><span class="sv">2%</span></div>
    <div class="sep">|</div>
    <div class="sb-item"><span class="sl">SL:</span><span class="sv">0.5%</span></div>
    <div class="sep">|</div>
    <div class="sb-item"><span class="sl">Timeout:</span><span class="sv">30min</span></div>
    <div class="sep">|</div>
    <div class="sb-item"><span class="sl">Position:</span><span class="sv">20%</span></div>
    <div class="sep">|</div>
    <div class="sb-item"><span class="sl">Max:</span><span class="sv">5</span></div>
    <div class="sep">|</div>
    <div class="sb-item"><span class="sl">Min:</span><span class="sv">2</span></div>
    <div class="sep">|</div>
    <div class="sb-item"><span class="sl">Leverage:</span><span class="sv">3x</span></div>
    <div class="sep">|</div>
    <div class="sb-item"><span class="sl">RSI:</span><span class="sv">35/65</span></div>
  </div>

  <div class="rb"><div class="rf" id="rf"></div></div>

  <div class="g">
    <div class="k gn" onclick="sm('bal')">
      <div class="ic">馃挵</div>
      <div class="lb">Account Balance</div>
      <div class="v gn" id="bal">$---</div>
      <div class="mt">Initial $5,000</div>
    </div>
    <div class="k" id="cw">
      <div class="ic">馃憶</div>
      <div class="lb">Wallet Total</div>
      <div class="v wt" id="wal">$---</div>
      <div class="mt" id="walNote">Unrealized PnL</div>
    </div>
    <div class="k" id="cp" onclick="sm('pnl')">
      <div class="ic">馃搳</div>
      <div class="lb">Position PnL</div>
      <div class="v" id="tpn">$---</div>
      <div class="mt" id="apn">--%</div>
    </div>
    <div class="k" id="ca" onclick="sm('acc')">
      <div class="ic">馃弳</div>
      <div class="lb">Account PnL</div>
      <div class="v" id="tpa">$---</div>
      <div class="mt" id="apc">--%</div>
    </div>
    <div class="k">
      <div class="ic">鈴憋笍</div>
      <div class="lb">Running Time</div>
      <div class="v bl" id="rt">00:00:00</div>
      <div class="mt">This Session</div>
    </div>
    <div class="k">
      <div class="ic">馃敘</div>
      <div class="lb">Positions</div>
      <div class="v wt" id="pc">0/5</div>
      <div class="mt">Min: 2</div>
    </div>
  </div>

  <div class="se">
    <div class="sh">
      <div class="st">馃搳 Current Positions <span style="color:#64748b;font-weight:400;font-size:12px">(Click to expand)</span></div>
      <div class="sc" id="scb">0</div>
    </div>
    <div class="pg" id="pos">
      <div class="ef"><div class="ei">馃摥</div>No positions, waiting for signals...</div>
    </div>
  </div>

  <div class="ai">
    <div class="ai-h">馃 AI Monitor & Suggestions</div>
    <div class="ai-c" id="aiContent">Loading AI analysis...</div>
  </div>

  <div class="f">Intelligent Trading System v3.4 路 Auto-refresh every 10s 路 Binance Testnet</div>
</div>

<div class="mo" id="mo" onclick="if(event.target===this)cm()">
  <div class="md">
    <div class="mh"><div class="mt" id="mt">Details</div><button class="mc" onclick="cm()">鉁?/button></div>
    <div class="mg" id="mw"></div>
    <div class="mf" id="mf"></div>
  </div>
</div>

<script>
var D=null,RC=new Set(),ST=Date.now(),CN=10,LV=CN;
var lastAIUpdate=0,AI_INTERVAL=600000; // 10 minutes

function S(v){return parseFloat(v)>=0?"+":""}
function C(v){return parseFloat(v)>=0?"gn":"rd"}
function sign(v){return parseFloat(v)>=0?"+":""}

function formatTime(){
  var d=new Date();
  return d.toLocaleTimeString('zh-CN',{hour12:false})+'.'+String(d.getMilliseconds()).padStart(3,'0');
}

function runningTime(){
  var s=Math.floor((Date.now()-ST)/1000);
  var h=Math.floor(s/3600);
  var m=Math.floor((s%3600)/60);
  var sec=s%60;
  return String(h).padStart(2,'0')+":"+String(m).padStart(2,'0')+":"+String(sec).padStart(2,'0');
}

function updateAI(){
  var now=Date.now();
  if(now-lastAIUpdate<AI_INTERVAL && lastAIUpdate>0) return;
  lastAIUpdate=now;
  
  var ai="No position data available.";
  if(D && D.positions && D.positions.length>0){
    var p=D.positions[0];
    var dir=p.isLong?"LONG":"SHORT";
    var pnl=parseFloat(p.pnl);
    var advice="";
    if(pnl>=5){
      advice="Good profit! Consider taking profit soon.";
    } else if(pnl<=-2){
      advice="Position in drawdown. Monitor closely.";
    } else {
      advice="Position is within normal range. Hold.";
    }
    ai="<span class='po'>"+p.symbol+"</span> "+dir+" position: <span class='"+C(p.pnl)+"'>"+S(p.pnl)+"$"+p.pnl+"</span>. "+advice;
  } else {
    ai="No open positions. System scanning for opportunities.";
  }
  document.getElementById('aiContent').innerHTML=ai;
}

function renderPositions(positions){
  if(!positions||positions.length===0){
    return '<div class="ef"><div class="ei">馃摥</div>No positions, waiting for signals...</div>';
  }
  var html='';
  for(var i=0;i<positions.length;i++){
    var p=positions[i];
    var o=RC.has(p.symbol);
    var pClass=p.isLong?'ln':'sh';
    var pnlClass=C(p.pnl);
    var roeVal=Math.abs(parseFloat(p.roePct||'0'));
    var roeWidth=Math.min(roeVal*5,100);
    
    html+='<div class="pc '+pClass+'" onclick="toggleCard(\''+p.symbol+'\')">';
    html+='<div class="ptop"><div><div class="psym">'+p.symbol+'</div>';
    html+='<div class="pdir '+pClass+'">'+(p.isLong?'鈻?LONG':'鈻?SHORT')+' '+p.leverage+'x</div></div>';
    html+='<div class="pm"><div class="pmv '+pnlClass+'">'+S(p.pnl)+'$'+p.pnl+'</div>';
    html+='<div class="pmp '+pnlClass+'">'+S(p.pnlPct)+p.pnlPct+'%</div></div></div>';
    html+='<div class="pfg">';
    html+='<div class="pcel"><div class="pcl">Entry</div><div class="pcv">$'+p.entry+'</div></div>';
    html+='<div class="pcel"><div class="pcl">Mark</div><div class="pcv">$'+p.mark+'</div></div>';
    html+='<div class="pcel"><div class="pcl">Qty</div><div class="pcv">'+p.qty+'</div></div>';
    html+='<div class="pcel"><div class="pcl">Lev</div><div class="pcv">'+p.leverage+'x</div></div>';
    html+='</div>';
    html+='<div class="pft">Margin: <span>$'+p.margin+'</span> '+(o?'鈻?Hide':'鈻?Details')+'</div>';
    html+='<div class="pde '+(o?'ov':'')+'">';
    html+='<div class="dr"><div class="dl">Direction</div><div class="dv '+pnlClass+'">'+(p.isLong?'鈻?LONG':'鈻?SHORT')+'</div></div>';
    html+='<div class="dr"><div class="dl">Entry Price</div><div class="dv">$'+p.entry+'</div></div>';
    html+='<div class="dr"><div class="dl">Mark Price</div><div class="dv">$'+p.mark+'</div></div>';
    html+='<div class="dr"><div class="dl">Quantity</div><div class="dv">'+p.qty+'</div></div>';
    html+='<div class="dr"><div class="dl">Leverage</div><div class="dv">'+p.leverage+'x</div></div>';
    html+='<div class="dr"><div class="dl">Margin</div><div class="dv">$'+p.margin+'</div></div>';
    html+='<div class="dr"><div class="dl">Unrealized PnL</div><div class="dv '+pnlClass+'">'+S(p.pnl)+'$'+p.pnl+'</div></div>';
    html+='<div class="dr"><div class="dl">PnL %</div><div class="dv '+pnlClass+'">'+S(p.pnlPct)+p.pnlPct+'%</div></div>';
    html+='<div class="dr"><div class="dl">ROE</div><div class="dv '+pnlClass+'">'+S(p.roePct)+p.roePct+'%</div></div>';
    html+='<div class="rp"><div class="rl"><span>ROE Progress</span><span class="'+pnlClass+'">'+S(p.roePct)+p.roePct+'%</span></div>';
    html+='<div class="rt"><div class="rff '+pnlClass+'" style="width:'+roeWidth+'%"></div></div></div>';
    html+='</div></div>';
  }
  return html;
}

function toggleCard(symbol){
  if(RC.has(symbol)){RC.delete(symbol);} else {RC.add(symbol);}
  document.getElementById('pos').innerHTML=renderPositions(D?D.positions:[]);
}

function showModal(type){
  if(!D)return;
  var m='',fo='',title='Details';
  var realized=parseFloat(D.walletBalance)-parseFloat(D.balance)-parseFloat(D.totalPnl);
  
  if(type==='bal'){
    title='馃挵 Account Balance';
    m='<div class="mr"><div class="ml">Available Balance</div><div class="mv gn">$'+D.balance+'</div></div>';
    m+='<div class="mr"><div class="ml">Wallet Total</div><div class="mv">$'+D.walletBalance+'</div></div>';
    m+='<div class="mr"><div class="ml">Initial Capital</div><div class="mv">$5,000.00</div></div>';
    fo='All amounts in USDT';
  } else if(type==='pnl'){
    title='馃搳 Position PnL';
    m='<div class="mr"><div class="ml">Total Position PnL</div><div class="mv '+C(D.totalPnl)+'">'+S(D.totalPnl)+'$'+D.totalPnl+'</div></div>';
    m+='<div class="mr"><div class="ml">Avg PnL %</div><div class="mv '+C(D.totalPnlPct)+'">'+S(D.totalPnlPct)+D.totalPnlPct+'%</div></div>';
    fo='Only showing unrealized PnL of current positions';
  } else if(type==='acc'){
    title='馃弳 Account PnL';
    m='<div class="mr"><div class="ml">Total Account PnL</div><div class="mv '+C(D.totalAccountPnl)+'">'+S(D.totalAccountPnl)+'$'+D.totalAccountPnl+'</div></div>';
    m+='<div class="mr"><div class="ml">Return %</div><div class="mv '+C(D.totalAccountPnlPct)+'">'+S(D.totalAccountPnlPct)+D.totalAccountPnlPct+'%</div></div>';
    m+='<div class="mr"><div class="ml">Realized PnL</div><div class="mv '+C(realized.toFixed(2))+'">$'+realized.toFixed(2)+'</div></div>';
    fo='Total PnL = Realized + Unrealized';
  }
  
  document.getElementById('mt').textContent=title;
  document.getElementById('mw').innerHTML=m;
  document.getElementById('mf').textContent=fo;
  document.getElementById('mo').classList.add('ov');
}

function closeModal(){
  document.getElementById('mo').classList.remove('ov');
}

async function loadData(){
  try {
    var r=await fetch('/api/status');
    var d=await r.json();
    D=d;
    
    if(d.error){
      console.error('API Error:',d.error);
      return;
    }
    
    var tp=parseFloat(d.totalPnl);
    var ta=parseFloat(d.totalAccountPnl);
    var tw=parseFloat(d.walletBalance)-5000;
    
    // Update balance
    document.getElementById('bal').textContent='$'+d.balance;
    
    // Update wallet
    document.getElementById('wal').textContent='$'+d.walletBalance;
    document.getElementById('wal').className='v '+(tw>=0?'gn':'rd');
    document.getElementById('cw').className='k '+(tw>=0?'gn':'rd');
    document.getElementById('walNote').textContent=(tw>=0?'+':' ')+'$'+tw.toFixed(2)+' from initial';
    
    // Update position PnL
    var tpnEl=document.getElementById('tpn');
    tpnEl.textContent=(tp>=0?'+$':'-$')+Math.abs(tp).toFixed(2);
    tpnEl.className='v '+(tp>=0?'gn':'rd');
    document.getElementById('apn').textContent=S(d.totalPnlPct)+d.totalPnlPct+'%';
    document.getElementById('cp').className='k '+(tp>=0?'gn':'rd');
    
    // Update account PnL
    var tpaEl=document.getElementById('tpa');
    tpaEl.textContent=(ta>=0?'+$':'-$')+Math.abs(ta).toFixed(2);
    tpaEl.className='v '+(ta>=0?'gn':'rd');
    document.getElementById('apc').textContent=S(d.totalAccountPnlPct)+d.totalAccountPnlPct+'%';
    document.getElementById('ca').className='k '+(ta>=0?'gn':'rd');
    
    // Update position count
    document.getElementById('pc').textContent=d.posCount+'/5';
    document.getElementById('scb').textContent=d.posCount;
    
    // Update positions grid
    document.getElementById('pos').innerHTML=renderPositions(d.positions);
    
    // Update AI
    updateAI();
    
    CN=LV;
  } catch(e){
    console.error('Load error:',e);
  }
}

function tick(){
  CN--;
  var progress=((LV-CN)/LV)*100;
  document.getElementById('rf').style.width=progress+'%';
  document.getElementById('ck').textContent=formatTime();
  document.getElementById('rt').textContent=runningTime();
  
  if(CN<=0){
    loadData();
    CN=LV;
  }
  
  setTimeout(tick,1000);
}

// Initial load and start
loadData();
tick();
</script>
</body>
</html>`;

const server = http.createServer(async (req, res) => {
  if (req.url === '/api/status') {
    try {
      const data = await getStatus();
      res.writeHead(200, {'Content-Type':'application/json','Access-Control-Allow-Origin':'*'});
      res.end(JSON.stringify(data));
    } catch(e) {
      res.writeHead(500, {'Content-Type':'application/json'});
      res.end(JSON.stringify({error:e.message}));
    }
  } else {
    res.writeHead(200, {'Content-Type':'text/html;charset=utf-8'});
    res.end(HTML);
  }
});

server.listen(9999, '0.0.0.0', () => {
  console.log('OpenClaw Trading Dashboard v3.4 at http://localhost:9999');
});

setInterval(() => {}, 1000);
