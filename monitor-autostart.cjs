// Auto-monitoring script for ITS v4.0
// Checks every 5 minutes if the trading system is running

const https = require('https');
const crypto = require('crypto');
const { spawn } = require('child_process');

const API_KEY = '5xFjz1Jt04FVKh7pNuQyiRKhYpGvgK0YaPgldYrYgrmBUBcAN9Lg10ypycRJaY4j';
const SECRET = '7vbksMwunENMRYQY6Xr3GEW3JwkEgjww7amOsAtQpk7FY47Ye26btJeHXbQBq1dj';

const DASHBOARD_URL = 'http://localhost:9999/api/status';
const LOG_FILE = 'C:/Users/DELL/.openclaw/workspace/memory/monitor.log';

function log(msg) {
  const time = new Date().toISOString();
  const logMsg = `[${time}] ${msg}`;
  console.log(logMsg);
  const fs = require('fs');
  fs.appendFileSync(LOG_FILE, logMsg + '\n');
}

function checkDashboard() {
  return new Promise((resolve) => {
    const http = require('http');
    const req = http.get(DASHBOARD_URL, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ ok: true, data: json });
        } catch {
          resolve({ ok: false, error: 'Parse error' });
        }
      });
    });
    req.on('error', (e) => resolve({ ok: false, error: e.message }));
    req.setTimeout(5000, () => { req.destroy(); resolve({ ok: false, error: 'Timeout' }); });
  });
}

function startLiveMonitor() {
  return new Promise((resolve) => {
    log('🚀 Starting live-monitor...');
    const child = spawn('npm', ['run', 'live', '--', '--scenario=futures-long-short'], {
      cwd: 'C:/Users/DELL/openclaw-trader/openclaw-trader',
      detached: true,
      stdio: 'ignore',
      shell: true
    });
    child.unref();
    setTimeout(() => resolve(true), 3000);
  });
}

function startDashboard() {
  return new Promise((resolve) => {
    log('🚀 Starting dashboard...');
    const child = spawn('node', ['dashboard-new.cjs'], {
      cwd: 'C:/Users/DELL/openclaw-trader',
      detached: true,
      stdio: 'ignore',
      shell: true
    });
    child.unref();
    setTimeout(() => resolve(true), 3000);
  });
}

async function monitor() {
  log('=== Monitoring Check ===');
  
  // Check dashboard
  const dash = await checkDashboard();
  if (dash.ok) {
    log(`✅ Dashboard OK - Balance: $${dash.data.balance}, Positions: ${dash.data.posCount}`);
  } else {
    log(`❌ Dashboard DOWN (${dash.error}) - Restarting...`);
    await startDashboard();
  }
  
  // Check if trading is active (balance should be ~4000-5000)
  if (dash.ok) {
    if (dash.data.posCount === 0) {
      log('📊 No positions - Scanning for signals...');
    } else {
      log(`📊 ${dash.data.posCount} positions - PnL: $${dash.data.totalPnl}`);
    }
  }
  
  log('=== Check Complete ===\n');
}

async function main() {
  log('\n🤖 ITS v4.0 Auto-Monitor Started');
  await monitor();
  
  // Check every 5 minutes (300000ms)
  setInterval(monitor, 5 * 60 * 1000);
}

main().catch(console.error);
