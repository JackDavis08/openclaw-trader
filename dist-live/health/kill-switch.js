/**
 * Kill Switch — Market-wide Circuit Breaker Module (P6.7)
 *
 * Features:
 * 1. Global switch — blocks all new position entries when activated
 * 2. BTC short-term crash detection — auto-activates when recent 60 price points drop exceeds threshold
 * 3. State persistence — writes to logs/kill-switch-state.json
 * 4. Auto-recovery — can be set to auto-deactivate after N ms
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATE_FILE = path.resolve(__dirname, "../../logs/kill-switch-state.json");
const DEFAULT_STATE = {
    active: false,
    reason: "",
    triggeredAt: 0,
};
// ─────────────────────────────────────────────────────
// State Read/Write
// ─────────────────────────────────────────────────────
export function readKillSwitch() {
    try {
        const data = fs.readFileSync(STATE_FILE, "utf-8");
        return JSON.parse(data);
    }
    catch {
        return { ...DEFAULT_STATE };
    }
}
function writeKillSwitch(state) {
    fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}
// ─────────────────────────────────────────────────────
// Activate / Deactivate
// ─────────────────────────────────────────────────────
/**
 * Activate Kill Switch
 * @param reason       Trigger reason (for logging and notifications)
 * @param autoResumeMs Optional: auto-deactivate after N ms; 0 or omitted = manual recovery
 */
export function activateKillSwitch(reason, autoResumeMs) {
    const now = Date.now();
    const state = {
        active: true,
        reason,
        triggeredAt: now,
        ...(autoResumeMs !== undefined && autoResumeMs > 0
            ? { autoResumeAt: now + autoResumeMs }
            : {}),
    };
    writeKillSwitch(state);
}
/** Manually deactivate Kill Switch */
export function deactivateKillSwitch() {
    writeKillSwitch({ ...DEFAULT_STATE });
}
// ─────────────────────────────────────────────────────
// State Query (with auto-expiry check)
// ─────────────────────────────────────────────────────
/**
 * Check if Kill Switch is currently active.
 * If autoResumeAt has expired, auto-deactivates and returns false.
 */
export function isKillSwitchActive() {
    const state = readKillSwitch();
    if (!state.active)
        return false;
    // Auto-recovery check
    if (state.autoResumeAt !== undefined && Date.now() >= state.autoResumeAt) {
        deactivateKillSwitch();
        return false;
    }
    return true;
}
// ─────────────────────────────────────────────────────
// BTC Crash Detection
// ─────────────────────────────────────────────────────
/**
 * Detect if BTC short-term drop exceeds threshold
 *
 * @param recentBtcPrices  Recent N price points (chronological order, index 0 = oldest)
 * @param thresholdPct     Drop threshold percentage, default 8 (i.e. 8%)
 * @returns crash: whether triggered; dropPct: actual drop percentage (positive = decline)
 */
export function checkBtcCrash(recentBtcPrices, thresholdPct = 8) {
    if (recentBtcPrices.length < 2)
        return { crash: false, dropPct: 0 };
    const first = recentBtcPrices[0];
    const last = recentBtcPrices[recentBtcPrices.length - 1];
    if (first === undefined || last === undefined || first <= 0) {
        return { crash: false, dropPct: 0 };
    }
    // Drop = (start price - current price) / start price * 100; positive = decline
    const dropPct = ((first - last) / first) * 100;
    return { crash: dropPct >= thresholdPct, dropPct };
}
