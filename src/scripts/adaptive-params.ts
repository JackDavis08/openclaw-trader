/**
 * AI Adaptive Parameters — CLI Tool
 *
 * Commands:
 *   npx tsx src/scripts/adaptive-params.ts status [--scenario <id>]
 *   npx tsx src/scripts/adaptive-params.ts arms [--scenario <id>]
 *   npx tsx src/scripts/adaptive-params.ts reset [--scenario <id>]
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOGS_DIR = path.resolve(__dirname, "../../logs");

interface AdaptiveState {
  arms: Array<{
    id: string;
    params: Record<string, number>;
    alpha: number;
    beta: number;
    totalTrades: number;
    totalPnlPercent: number;
    avgPnlPercent: number;
    winCount: number;
    createdAt: number;
    lastUsedAt: number;
  }>;
  activeArmId: string;
  baselineParams: Record<string, number>;
  tradesSinceRefresh: number;
  totalTradeCount: number;
  lastUpdatedAt: string;
  scenarioId: string;
}

function getStatePath(scenarioId: string): string {
  return path.join(LOGS_DIR, `adaptive-state-${scenarioId}.json`);
}

function findScenarioIds(): string[] {
  try {
    const files = fs.readdirSync(LOGS_DIR);
    return files
      .filter((f) => f.startsWith("adaptive-state-") && f.endsWith(".json"))
      .map((f) => f.replace("adaptive-state-", "").replace(".json", ""));
  } catch {
    return [];
  }
}

function loadState(scenarioId: string): AdaptiveState | null {
  const p = getStatePath(scenarioId);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8")) as AdaptiveState;
  } catch {
    return null;
  }
}

function showStatus(scenarioId?: string): void {
  const ids = scenarioId ? [scenarioId] : findScenarioIds();
  if (ids.length === 0) {
    console.log("No adaptive state files found.");
    console.log("Enable adaptive parameters in strategy.yaml to start.");
    return;
  }

  for (const id of ids) {
    const state = loadState(id);
    if (!state) {
      console.log(`[${id}] No state file found.`);
      continue;
    }

    const qualifiedArms = state.arms.filter((a) => a.totalTrades > 0);
    const bestArm = qualifiedArms.length > 0
      ? qualifiedArms.reduce((a, b) => (a.avgPnlPercent > b.avgPnlPercent ? a : b))
      : null;

    console.log(`\n═══ Adaptive Parameters: ${id} ═══`);
    console.log(`  Total trades:          ${state.totalTradeCount}`);
    console.log(`  Trades since refresh:  ${state.tradesSinceRefresh}`);
    console.log(`  Active arm:            ${state.activeArmId}`);
    console.log(`  Number of arms:        ${state.arms.length}`);
    console.log(`  Last updated:          ${state.lastUpdatedAt}`);
    if (bestArm) {
      console.log(`  Best arm:              ${bestArm.id} (avg PnL: ${bestArm.avgPnlPercent.toFixed(2)}%, trades: ${bestArm.totalTrades})`);
    }
    console.log(`  Baseline params:       ${JSON.stringify(state.baselineParams)}`);
  }
}

function showArms(scenarioId?: string): void {
  const ids = scenarioId ? [scenarioId] : findScenarioIds();
  if (ids.length === 0) {
    console.log("No adaptive state files found.");
    return;
  }

  for (const id of ids) {
    const state = loadState(id);
    if (!state) {
      console.log(`[${id}] No state file found.`);
      continue;
    }

    console.log(`\n═══ Arms for ${id} ═══`);
    console.log("─".repeat(100));
    console.log(
      `${"ID".padEnd(10)} ` +
      `${"Trades".padStart(7)} ` +
      `${"Wins".padStart(5)} ` +
      `${"WinRate".padStart(8)} ` +
      `${"AvgPnL%".padStart(9)} ` +
      `${"Alpha".padStart(6)} ` +
      `${"Beta".padStart(6)} ` +
      `Params`
    );
    console.log("─".repeat(100));

    const sorted = [...state.arms].sort((a, b) => b.avgPnlPercent - a.avgPnlPercent);
    for (const arm of sorted) {
      const winRate = arm.totalTrades > 0
        ? `${((arm.winCount / arm.totalTrades) * 100).toFixed(1)}%`
        : "N/A";
      const avgPnl = arm.totalTrades > 0
        ? `${arm.avgPnlPercent.toFixed(2)}%`
        : "N/A";

      // Show param diffs from baseline
      const diffs: string[] = [];
      for (const [k, v] of Object.entries(arm.params)) {
        const base = state.baselineParams[k];
        if (base !== undefined && Math.abs(v - base) > 0.01) {
          const pct = base !== 0 ? ((v - base) / Math.abs(base) * 100).toFixed(1) : "∞";
          diffs.push(`${k}:${typeof v === "number" && v % 1 === 0 ? v : v.toFixed(2)}(${Number(pct) >= 0 ? "+" : ""}${pct}%)`);
        }
      }
      const active = arm.id === state.activeArmId ? " ←" : "";

      console.log(
        `${(arm.id + active).padEnd(10)} ` +
        `${String(arm.totalTrades).padStart(7)} ` +
        `${String(arm.winCount).padStart(5)} ` +
        `${winRate.padStart(8)} ` +
        `${avgPnl.padStart(9)} ` +
        `${String(arm.alpha).padStart(6)} ` +
        `${String(arm.beta).padStart(6)} ` +
        `${diffs.length > 0 ? diffs.join(", ") : "(baseline)"}`
      );
    }
  }
}

function resetState(scenarioId?: string): void {
  const ids = scenarioId ? [scenarioId] : findScenarioIds();
  if (ids.length === 0) {
    console.log("No adaptive state files found.");
    return;
  }

  for (const id of ids) {
    const p = getStatePath(id);
    if (fs.existsSync(p)) {
      fs.unlinkSync(p);
      console.log(`[${id}] Adaptive state reset. Arms will be re-initialized on next run.`);
    } else {
      console.log(`[${id}] No state file found.`);
    }
  }
}

// ── Main ──────────────────────────────────────────────

const args = process.argv.slice(2);
const command = args[0] ?? "status";
const scenarioIdx = args.indexOf("--scenario");
const scenarioId = scenarioIdx >= 0 ? args[scenarioIdx + 1] : undefined;

switch (command) {
  case "status":
    showStatus(scenarioId);
    break;
  case "arms":
    showArms(scenarioId);
    break;
  case "reset":
    resetState(scenarioId);
    break;
  default:
    console.log("Usage: npx tsx src/scripts/adaptive-params.ts <command> [--scenario <id>]");
    console.log("Commands: status, arms, reset");
    process.exit(1);
}
