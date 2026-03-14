#!/usr/bin/env node
/**
 * scan-errors.js — L2 自动巡检脚本
 * 扫描 live-monitor.log 最近 N 分钟内的 ERROR 行
 * 输出 JSON 供 heartbeat 读取
 *
 * 用法: node scan-errors.js [minutes=30]
 * 退出码: 0 = 无新错误, 1 = 有新错误
 */
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOG_FILE = join(__dirname, "../logs/live-monitor.log");
const STATE_FILE = join(__dirname, "../../workspace/memory/heartbeat-state.json");
const MINUTES = parseInt(process.argv[2] ?? "30", 10);

const now = Date.now();
const cutoffMs = now - MINUTES * 60 * 1000;

// Load last seen error timestamp
let lastSeenTs = 0;
try {
  const state = JSON.parse(readFileSync(STATE_FILE, "utf8"));
  lastSeenTs = state.lastSeenError?.timestamp ?? 0;
} catch { /* first run */ }

if (!existsSync(LOG_FILE)) {
  console.log(JSON.stringify({ errors: [], newErrors: [] }));
  process.exit(0);
}

const lines = readFileSync(LOG_FILE, "utf8").split("\n");
const errors = [];

for (const line of lines) {
  // Match ISO timestamp at start: [2026-03-14T06:58:42.812Z]
  const tsMatch = line.match(/\[(\d{4}-\d{2}-\d{2}T[\d:.]+Z)\]/);
  if (!tsMatch) continue;
  const lineTs = new Date(tsMatch[1]).getTime();
  if (lineTs < cutoffMs) continue;
  if (!line.includes("[ERROR]") && !line.includes("❌")) continue;

  errors.push({ timestamp: lineTs, message: line.trim() });
}

// New errors = errors newer than last seen
const newErrors = errors.filter(e => e.timestamp > lastSeenTs);
const latestTs = newErrors.length > 0 ? Math.max(...newErrors.map(e => e.timestamp)) : lastSeenTs;

// Group by pattern for dedup
const deduped = [];
const seen = new Set();
for (const e of newErrors) {
  // Normalize: strip timestamp and price numbers for grouping
  const key = e.message.replace(/\[[\d\-T:.Z]+\]/g, "").replace(/\$[\d.,]+/g, "$X").replace(/\d{6,}/g, "N");
  if (!seen.has(key)) {
    seen.add(key);
    deduped.push(e);
  }
}

const result = {
  scannedMinutes: MINUTES,
  totalErrors: errors.length,
  newErrors: deduped,
  latestErrorTs: latestTs,
};

console.log(JSON.stringify(result, null, 2));

// Exit 1 if there are new errors
process.exit(deduped.length > 0 ? 1 : 0);
