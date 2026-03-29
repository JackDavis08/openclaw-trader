$dashboardCode = @'
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
<html lang="zh">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>OpenClaw Trading Dashboard v6</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;background:#0a0e17;color:#e2e8f0;padding:20px;font-size:14px}
.c{max-width:1400px;margin:0 auto}
.h{display:flex;justify-content:space-between;align-items:center;background:linear-gradient(135deg,rgba(30,41,59,0.9),rgba(15,23,42,0.95));border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:20px 28px;margin-bottom:20px}
.hl{display:flex;align-items:center;gap:16px}
.logo{font-size:32px}
.title{font-size:22px;font-weight:800;color:#f8fafc}
.sub{font-size:11px;color:#64748b;margin-top:3px}
.hr{text-align:right}
.live{display:inline-flex;align-items:center;gap:8px;background:rgba(0,200,83,0.15);border:1px solid #00c853;color:#00c853;padding:6px 16px;border-radius:20px;font-size:13px;font-weight:700}
.dot{width:8px;height:8px;background:#00c853;border-radius:50%;animation:lp 2s infinite}
@keyframes lp{0%,100%{opacity:1}50%{opacity:0.3}}
.clock{font-size:22px;font-weight:700;color:#f1f5f9;margin-top:6px;font-variant-numeric:tabular-nums}
.rb{height:3px;background:rgba(255,255,255,0.05);border-radius:2px;margin-bottom:20px;overflow:hidden}
.rf{height:100%;background:linear-gradient(90deg,#3b82f6,#10b981);border-radius:2px;transition:width 1s;width:0%}
.g{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:20px}
.k{background:linear-gradient(145deg,rgba(30,41,59,0.9),rgba(15,23,42,0.95));border-radius:16px;padding:20px;border:1px solid rgba(255,255,255,0.08);transition:all 0.3s;cursor:pointer;position:relative;overflow:hidden}
.k:hover{transform:translateY(-3px);box-shadow:0 10px 30px rgba(0,0,0,0.4);border-color:rgba(255,255,255,0.15)}
.k::before{content:'';position:absolute;top:0;left:0;right:0;height:3px;border-radius:16px 16px 0 0}
.k.gn{border-color:rgba(16,185,129,0.3)}
.k.gn::before{background:linear-gradient(90deg,#10b981,#34d399)}
.k.rd{border-color:rgba(239,68,68,0.3)}
.k.rd::before{background:linear-gradient(90deg,#ef4444,#f87171)}
.ic{font-size:24px;margin-bottom:10px}
.lb{font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px}
.v{font-size:28px;font-weight:800;font-variant-numeric:tabular-nums}
.gn{color:#10b981}
.rd{color:#ef4444}
.wt{color:#f1f5f9}
.bl{color:#3b82f6}
.mt{font-size:11px;color:#475569;margin-top:6px}
.mt span{color:#64748b;font-weight:600}
.g2{display:grid;grid-template-columns:repeat(2,1fr);gap:14px;margin-bottom:20px}
.se{background:linear-gradient(145deg,rgba(30,41,59,0.8),rgba(15,23,42,0.9));border:1px solid rgba(255,255,255,0.06);border-radius:16px;padding:24px;margin-bottom:16px}
.sh{display:flex;justify-content:space-between;align-items:center;margin-bottom:20px}
.st{font-size:16px;font-weight:700;color:#f8fafc;display:flex;align-items:center;gap:10px}
.st .ic{font-size:20px}
.st .hn{color:#64748b;font-weight:400;font-size:13px}
.sc{background:rgba(245,158,11,0.15);color:#f59e0b;padding:4px 14px;border-radius:20px;font-size:13px;font-weight:700}
.pg{display:grid;grid-template-columns:repeat(auto-fill,minmax(380px,1fr));gap:16px}
.pc{background:linear-gradient(145deg,rgba(30,41,59,0.95),rgba(15,23,42,0.98));border-radius:16px;overflow:hidden;border:1px solid rgba(255,255,255,0.08);cursor:pointer;transition:all 0.3s}
.pc:hover{transform:translateY(-4px);box-shadow:0 15px 40px rgba(0,0,0,0.5)}
.pc.ln{border-color:rgba(16,185,129,0.3)}
.pc.sh{border-color:rgba(239,68,68,0.3)}
.ptop{display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid rgba(255,255,255,0.06)}
.psym{font-size:20px;font-weight:800;color:#f1f5f0}
.pdir{display:inline-flex;padding:4px 12px;border-radius:6px;font-size:12px;font-weight:700}
.pdir.ln{background:rgba(16,185,129,0.15);color:#10b981;border:1px solid rgba(16,185,129,0.3)}
.pdir.sh{background:rgba(239,68,68,0.15);color:#ef4444;border:1px solid rgba(239,68,68,0.3)}
.pm{text-align:center;padding:20px}
.pmv{font-size:36px;font-weight:900;font-variant-numeric:tabular-nums}
.pmp{font-size:15px;margin-top:6px;opacity:0.85}
.pfg{display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:1px;background:rgba(255,255,255,0.05);margin:0 16px 16px;border-radius:10px;overflow:hidden}
.pcel{background:rgba(15,23,42,0.8);padding:12px 8px;text-align:center}
.pcl{font-size:9px;color:#475569;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:5px}
.pcv{font-size:14px;font-weight:700;color:#cbd5e1}
.pft{display:flex;justify-content:space-between;align-items:center;padding:12px 20px;background:rgba(0,0,0,0.2);border-top:1px solid rgba(255,255,255,0.04);font-size:11px;color:#475569}
.pft span{color:#64748b;font-weight:600}
.pck{color:#3b82f6}
.pde{display:none;padding:0 20px 20px}
.pde.ov{display:block}
.ds{margin-top:16px}
.dt{font-size:11px;color:#475569;text-transform:uppercase;letter-spacing:1px;padding-bottom:8px;border-bottom:1px solid rgba(255,255,255,0.05);margin-bottom:12px}
.dr{display:flex;justify-content:space-between;padding:9px 0;border-bottom:1px solid rgba(255,255,255,0.03)}
.dr:last-child{border:none}
.dl{font-size:13px;color:#64748b}
.dv{font-size:14px;font-weight:700;color:#94a3b8;font-variant-numeric:tabular-nums}
.dv.hi{font-size:16px}
.rp{margin-top:16px}
.rl{display:flex;justify-content:space-between;font-size:11px;color:#475569;margin-bottom:8px}
.rt{height:8px;background:rgba(255,255,255,0.08);border-radius:4px;overflow:hidden}
.rff{height:100%;border-radius:4px;transition:width 0.6s ease}
.rff.gn{background:linear-gradient(90deg,#10b981,#34d399)}
.rff.rd{background:linear-gradient(90deg,#ef4444,#f87171)}
.ef{text-align:center;padding:60px 20px;color:#475569}
.ei{font-size:50px;margin-bottom:16px;opacity:0.5}
.f{text-align:center;color:#334155;font-size:11px;margin-top:20px}
.mo{display:none;position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.75);z-index:1000;align-items:center;justify-content:center;backdrop-filter:blur(6px)}
.mo.ov{display:flex}
.md{background:linear-gradient(145deg,#1e293b,#0f172a);border:1px solid rgba(255,255,255,0.1);border-radius:20px;padding:28px;max-width:480px;width:90%;animation:mi 0.3s ease}
@keyframes mi{from{transform:scale(0.92);opacity:0}}
.mh{display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;padding-bottom:16px;border-bottom:1px solid rgba(255,255,255,0.08)}
.mt{font-size:18px;font-weight:800;color:#f1f5f0}
.mc{width:32px;height:32px;border-radius:50%;border:none;background:rgba(255,255,255,0.06);color:#64748b;font-size:16px;cursor:pointer;transition:all 0.2s;display:flex;align-items:center;justify-content:center}
.mc:hover{background:rgba(239,68,68,0.2);color:#ef4444}
.mg{display:grid;gap:10px}
.mr{display:flex;justify-content:space-between;padding:14px 16px;background:rgba(255,255,255,0.03);border-radius:12px}
.ml{font-size:13px;color:#64748b}
.mv{font-size:14px;font-weight:700;color:#cbd5e1}
.mv.gn{color:#10b981}
.mv.rd{color:#ef4444}
.mf{margin-top:20px;text-align:center;font-size:11px;color:#334155}
@media(max-width:1000px){.g{grid-template-columns:repeat(2,1fr)}}
@media(max-width:700px){.h{flex-direction:column;gap:16px;text-align:center}.hr{text-align:center}.pg{grid-template-columns:1fr}}
</style>
</head>
<body>
<div class="c">
  <div class="h">
    <div class="hl"><div class="logo">🤖</div><div><div class="title">OpenClaw Trading</div><div class="sub">Binance Futures Testnet · 3x Hedge Mode</div></div></div>
    <div class="hr"><div class="live"><div class="dot"></div>运行中</div><div class="clock" id="ck">--:--:--</div></div></div>
  </div>
  <div class="rb"><div class="rf" id="rf"></div></div>
  <div class="g">
    <div class="k gn" id="cb" onclick="sm('bal')"><div class="ic">💰</div><div class="lb">账户余额</div><div class="v gn" id="bal">$--</div><div class="mt">初始本金 <span>$5,000</span></div></div>
    <div class="k" id="cw" onclick="sm('wal')"><div class="ic">🏦</div><div class="lb">钱包总额</div><div class="v wt" id="wal">$--</div><div class="mt">含未实现盈亏</div></div>
    <div class="k" id="cp" onclick="sm('pnl')"><div class="ic">📊</div><div class="lb">持仓盈亏</div><div class="v" id="tpn">$--</div><div class="mt">均 <span id="apn">--%</span></div></div>
    <div class="k" id="ca" onclick="sm('acc')"><div class="ic">🏆</div><div class="lb">账户总盈亏</div><div class="v" id="tpa">$--</div><div class="mt">收益 <span id="apc">--%</span></div></div>
  </div>
  <div class="g2">
    <div class="k"><div class="ic">⏱️</div><div class="lb">运行时长</div><div class="v bl" id="rt">00:00:00</div><div class="mt">本轮交易</div></div>
    <div class="k"><div class="ic">📋</div><div class="lb">持仓数量</div><div class="v wt" id="pc">0/4</div><div class="mt">最多4仓位</div></div>
  </div>
  <div class="se">
    <div class="sh"><div class="st"><span class="ic">📈</span>当前持仓 <span class="hn">（点击卡片展开详情）</span></div><div class="sc" id="scb">0</div></div>
    <div class="pg" id="pos"><div class="ef"><div class="ei">📭</div>暂无持仓，等待交易信号...</div></div>
  </div>
  <div class="f">OpenClaw Trading Dashboard v6 · Binance Testnet</div>
</div>
<div class="mo" id="mo"><div class="md"><div class="mh"><div class="mt" id="mt">详情</div><button class="mc" onclick="cm()">✕</button></div><div class="mg" id="mw"></div><div class="mf" id="mf"></div></div></div>
<script>
var D=null,RC=new Set(),ST=Date.now(),CN=10,LV=CN;
function S(v){return parseFloat(v)>=0?"+":""}
function C(v){return parseFloat(v)>=0?"gn":"rd"}
function Rt(){var s=Math.floor((Date.now()-ST)/1000),h=Math.floor(s/3600),m=Math.floor((s%3600)/60),sec=s%60;return String(h).padStart(2,"0")+":"+String(m).padStart(2,"0")+":"+String(sec).padStart(2,"0")}
function Rp(p){var q=Math.abs(parseFloat(p.roePct||"0"));var c=C(p.roePct);return'<div class=rp><div class=rl><span>收益率</span><span class="mv '+c+'">'+S(p.roePct)+p.roePct+'%</span></div><div class=rt><div class="rff '+c+'" style="width:'+Math.min(q*5,100)+'%"></div></div></div>'}
function Rd(p){return'<div class=ds><div class=dt>交易详情</div><div class=dr><div class=dl>方向</div><div class="dv '+C(p.pnl)+'">'+(p.isLong?"▲ 做多":"▼ 做空")+'</div></div><div class=dr><div class=dl>开仓价</div><div class=dv>$'+p.entry+'</div></div><div class=dr><div class=dl>当前价</div><div class=dv>$'+p.mark+'</div></div><div class=dr><div class=dl>数量</div><div class=dv>'+p.qty+'</div></div><div class=dr><div class=dl>杠杆</div><div class=dv>'+p.leverage+'x</div></div></div><div class=ds><div class=dt>盈亏数据</div><div class=dr><div class=dl>浮动盈亏</div><div class="dv hi '+C(p.pnl)+'">'+S(p.pnl)+"$"+p.pnl+'</div></div><div class=dr><div class=dl>盈亏率</div><div class="dv '+C(p.pnlPct)+'">'+S(p.pnlPct)+p.pnlPct+'%</div></div><div class=dr><div class=dl>ROE</div><div class="dv '+C(p.roePct)+'">'+S(p.roePct)+p.roePct+'%</div></div><div class=dr><div class=dl>保证金</div><div class=dv>$'+p.margin+'</div></div></div>'+Rp(p)}
function Rs(ps){if(!ps||!ps.length)return'<div class=ef><div class=ei>📭</div>暂无持仓，等待交易信号...</div>';return ps.map(function(p){var o=RC.has(p.symbol);return'<div class="pc '+(p.isLong?'ln':'sh')+'" onclick="tc(\''+p.symbol+'\')"><div class=ptop><div><div class=psym>'+p.symbol+'</div><div class="pdir '+(p.isLong?'ln':'sh')+'">'+(p.isLong?'▲ 做多':'▼ 做空')+'</div></div><div class=pm><div class="pmv '+C(p.pnl)+'">'+S(p.pnl)+"$"+p.pnl+'</div><div class="pmp '+C(p.pnl)+'">'+S(p.pnlPct)+p.pnlPct+'%</div></div></div><div class=pfg><div class=pcel><div class=pcl>开仓价</div><div class=pcv>$'+p.entry+'</div></div><div class=pcel><div class=pcl>当前价</div><div class=pcv>$'+p.mark+'</div></div><div class=pcel><div class=pcl>数量</div><div class=pcv>'+p.qty+'</div></div><div class=pcel><div class=pcl>杠杆</div><div class=pcv>'+p.leverage+'x</div></div></div><div class=pft>保证金: <span>$'+p.margin+'</span> '+(o?'▲ 收起':'▼ 详情')+'</div><div class="pde '+(o?'ov':'')+'">'+Rd(p)+'</div></div>'}).join("")}
function sm(t){if(!D)return;var m='',fo='';var w=parseFloat(D.walletBalance)-parseFloat(D.balance)-parseFloat(D.totalPnl);if(t==="bal"){m='<div class=mr><div class=ml>可用余额</div><div class="mv gn">$'+D.balance+'</div></div><div class=mr><div class=ml>钱包总额</div><div class=mv>$'+D.walletBalance+'</div></div><div class=mr><div class=ml>初始本金</div><div class=mv>$5,000.00</div></div>';fo='所有金额均为USDT'}else if(t==="wal"){m='<div class=mr><div class=ml>钱包总额</div><div class="mv '+C(D.totalAccountPnl)+'">$'+D.walletBalance+'</div></div><div class=mr><div class=ml>已实现盈亏</div><div class="mv '+C(w.toFixed(2))+'">$'+w.toFixed(2)+'</div></div><div class=mr><div class=ml>浮动盈亏</div><div class="mv '+C(D.totalPnl)+'">'+S(D.totalPnl)+"$"+D.totalPnl+'</div></div>';fo='钱包总额=已实现+浮动盈亏'}else if(t==="pnl"){m='<div class=mr><div class=ml>持仓总盈亏</div><div class="mv '+C(D.totalPnl)+'">'+S(D.totalPnl)+"$"+D.totalPnl+'</div></div><div class=mr><div class=ml>平均盈亏率</div><div class="mv '+C(D.totalPnlPct)+'">'+S(D.totalPnlPct)+D.totalPnlPct+'%</div></div>';fo='仅显示当前持仓浮动盈亏'}else if(t==="acc"){m='<div class=mr><div class=ml>账户总盈亏</div><div class="mv '+C(D.totalAccountPnl)+'">'+S(D.totalAccountPnl)+"$"+D.totalAccountPnl+'</div></div><div class=mr><div class=ml>收益率</div><div class="mv '+C(D.totalAccountPnlPct)+'">'+S(D.totalAccountPnlPct)+D.totalAccountPnlPct+'%</div></div>';fo='账户总盈亏=已实现+浮动盈亏'}document.getElementById("mt").textContent=t==="bal"?"💰 账户余额":t==="wal"?"🏦 钱包总额":t==="pnl"?"📊 持仓盈亏":"🏆 账户总盈亏";document.getElementById("mw").innerHTML=m;document.getElementById("mf").textContent=fo;document.getElementById("mo").classList.add("ov")}
function cm(){document.getElementById("mo").classList.remove("ov")}
function tc(s){if(RC.has(s))RC.delete(s);else RC.add(s);document.getElementById("pos").innerHTML=Rs(D?D.positions:[])}
document.addEventListener("click",function(e){if(e.target.id==="mo")cm()});
async function ld(){try{var r=await fetch("/api/status");var d=await r.json();D=d;if(d.error){console.error(d.error);return}var tp=parseFloat(d.totalPnl),ta=parseFloat(d.totalAccountPnl),tw=parseFloat(d.walletBalance)-5000;document.getElementById("bal").textContent="$"+d.balance;document.getElementById("wal").textContent="$"+d.walletBalance;document.getElementById("wal").className="v "+(tw>=0?"gn":"rd");document.getElementById("cw").className="k "+(tw>=0?"gn":"rd");document.getElementById("tpn").textContent=(tp>=0?"+$":"-$")+Math.abs(tp).toFixed(2);document.getElementById("tpn").className="v "+(tp>=0?"gn":"rd");document.getElementById("apn").textContent=S(d.totalPnlPct)+d.totalPnlPct+"%";document.getElementById("cp").className="k "+(tp>=0?"gn":"rd");document.getElementById("tpa").textContent=(ta>=0?"+$":"-$")+Math.abs(ta).toFixed(2);document.getElementById("tpa").className="v "+(ta>=0?"gn":"rd");document.getElementById("apc").textContent=S(d.totalAccountPnlPct)+d.totalAccountPnlPct+"%";document.getElementById("ca").className="k "+(ta>=0?"gn":"rd");document.getElementById("pc").textContent=d.posCount+"/4";document.getElementById("scb").textContent=d.posCount;document.getElementById("pos").innerHTML=Rs(d.positions);CN=LV}catch(e){console.error(e)}}
function tk(){CN--;document.getElementById("rf").style.width=((LV-CN)/LV*100)+"%";document.getElementById("ck").textContent=(new Date()).toLocaleTimeString("zh-CN",{hour12:false});document.getElementById("rt").textContent=Rt();if(CN<=0){ld();CN=LV}setTimeout(tk,1000)}
ld();tk();
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

server.listen(9998, '0.0.0.0', () => {
  console.log('Dashboard v6 at http://localhost:9998');
});

setInterval(() => {}, 1000);
'@

$jsPath = "C:\Users\DELL\openclaw-trader\dashboard-new.cjs"
[System.IO.File]::WriteAllText($jsPath, $dashboardCode, [System.Text.Encoding]::UTF8)
Write-Host "File written: $jsPath"
