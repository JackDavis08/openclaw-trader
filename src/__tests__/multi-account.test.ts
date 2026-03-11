import { describe, it, expect } from "vitest";
import { buildLiveAccountRuntimes, mergeRisk } from "../config/loader.js";
import type { StrategyConfig, PaperFileConfig, PaperScenario, LiveAccount, RiskConfig } from "../types.js";

// ─────────────────────────────────────────────────────
// Test helpers
// ─────────────────────────────────────────────────────

function baseRisk(): RiskConfig {
  return {
    stop_loss_percent: 5,
    take_profit_percent: 10,
    trailing_stop: { enabled: false, activation_percent: 5, callback_percent: 2 },
    max_total_loss_percent: 20,
    position_ratio: 0.2,
    max_positions: 4,
    max_position_per_symbol: 0.3,
    daily_loss_limit_percent: 8,
  };
}

function makeBase(): StrategyConfig {
  return {
    symbols: ["BTCUSDT", "ETHUSDT"],
    timeframe: "1h",
    strategy: {
      name: "test",
      enabled: true,
      ma: { short: 20, long: 60 },
      rsi: { period: 14, oversold: 35, overbought: 65 },
      macd: { enabled: false, fast: 12, slow: 26, signal: 9 },
    },
    signals: { buy: ["ma_bullish"], sell: ["ma_bearish"] },
    risk: baseRisk(),
    execution: {
      order_type: "market",
      limit_order_offset_percent: 0.1,
      min_order_usdt: 10,
      limit_order_timeout_seconds: 30,
    },
    notify: {
      on_signal: false,
      on_trade: false,
      on_stop_loss: false,
      on_take_profit: false,
      on_error: false,
      on_daily_summary: false,
      min_interval_minutes: 5,
    },
    news: { enabled: false, interval_hours: 6, price_alert_threshold: 5, fear_greed_alert: 25 },
    mode: "paper",
  };
}

function makeScenario(id: string, strategyId = "conservative"): PaperScenario {
  return {
    id,
    name: `Test ${id}`,
    enabled: true,
    strategy_id: strategyId,
    initial_usdt: 10000,
    fee_rate: 0.001,
    slippage_percent: 0.05,
    exchange: { market: "spot" },
  };
}

function makePaperCfg(scenarios: PaperScenario[]): PaperFileConfig {
  return { report_interval_hours: 24, scenarios };
}

function makeAccount(overrides: Partial<LiveAccount> = {}): LiveAccount {
  return {
    id: "binance-main",
    provider: "binance",
    credentials_path: ".secrets/binance-main.json",
    scenarios: ["conservative-spot"],
    ...overrides,
  };
}

// Mock strategy profile loader (avoids reading actual YAML files)
// Note: buildLiveAccountRuntimes calls buildPaperRuntime which internally calls
// loadStrategyProfile. Due to module-internal function calls, vi.mock cannot
// intercept the call. Tests use real strategy profile files from config/strategies/.

// ─────────────────────────────────────────────────────
// buildLiveAccountRuntimes
// ─────────────────────────────────────────────────────

describe("buildLiveAccountRuntimes()", () => {
  const base = makeBase();

  it("produces RuntimeConfig with overridden credentials and testnet flag", () => {
    const account = makeAccount({
      credentials_path: ".secrets/custom.json",
      testnet: true,
    });
    const paperCfg = makePaperCfg([makeScenario("conservative-spot")]);

    const runtimes = buildLiveAccountRuntimes(account, base, paperCfg);
    expect(runtimes).toHaveLength(1);
    const rt = runtimes[0]!;

    expect(rt.exchange.credentials_path).toBe(".secrets/custom.json");
    expect(rt.exchange.testnet).toBe(true);
    expect(rt.exchange.name).toBe("binance");
  });

  it("uses composite scenarioId format: accountId:scenarioId", () => {
    const account = makeAccount({ id: "my-account", scenarios: ["conservative-spot"] });
    const paperCfg = makePaperCfg([makeScenario("conservative-spot")]);

    const runtimes = buildLiveAccountRuntimes(account, base, paperCfg);
    expect(runtimes[0]!.paper.scenarioId).toBe("my-account:conservative-spot");
  });

  it("resolves multiple scenarios per account", () => {
    const account = makeAccount({
      scenarios: ["conservative-spot", "trend-spot"],
    });
    const paperCfg = makePaperCfg([
      makeScenario("conservative-spot"),
      makeScenario("trend-spot", "trend"),
    ]);

    const runtimes = buildLiveAccountRuntimes(account, base, paperCfg);
    expect(runtimes).toHaveLength(2);
    expect(runtimes[0]!.paper.scenarioId).toBe("binance-main:conservative-spot");
    expect(runtimes[1]!.paper.scenarioId).toBe("binance-main:trend-spot");
  });

  it("throws error when referenced scenario is not found in paper.yaml", () => {
    const account = makeAccount({ scenarios: ["nonexistent-scenario"] });
    const paperCfg = makePaperCfg([makeScenario("conservative-spot")]);

    expect(() => buildLiveAccountRuntimes(account, base, paperCfg)).toThrow(
      '[binance-main] Scenario "nonexistent-scenario" not found in paper.yaml'
    );
  });

  it("throws error on duplicate scenario references within an account", () => {
    const account = makeAccount({
      scenarios: ["conservative-spot", "conservative-spot"],
    });
    const paperCfg = makePaperCfg([makeScenario("conservative-spot")]);

    expect(() => buildLiveAccountRuntimes(account, base, paperCfg)).toThrow(
      "[binance-main] Duplicate scenario reference: conservative-spot"
    );
  });

  it("defaults testnet to false when not specified", () => {
    const account = makeAccount(); // no testnet field
    const paperCfg = makePaperCfg([makeScenario("conservative-spot")]);

    const runtimes = buildLiveAccountRuntimes(account, base, paperCfg);
    expect(runtimes[0]!.exchange.testnet).toBe(false);
  });

  it("applies account-level risk override on top of scenario risk", () => {
    const account = makeAccount({
      risk: { position_ratio: 0.05, stop_loss_percent: 2 },
    });
    const paperCfg = makePaperCfg([makeScenario("conservative-spot")]);

    const runtimes = buildLiveAccountRuntimes(account, base, paperCfg);
    const rt = runtimes[0]!;

    expect(rt.risk.position_ratio).toBe(0.05);
    expect(rt.risk.stop_loss_percent).toBe(2);
    // Other fields should be inherited from scenario/profile (not overridden by account)
    expect(rt.risk.max_positions).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────
// mergeRisk — account-level risk override
// ─────────────────────────────────────────────────────

describe("mergeRisk — account-level risk override", () => {
  it("applies account risk on top of scenario risk", () => {
    const scenarioRisk = baseRisk();
    scenarioRisk.stop_loss_percent = 4;  // scenario override

    const accountRisk: Partial<RiskConfig> = { stop_loss_percent: 2 }; // account override
    const merged = mergeRisk(scenarioRisk, accountRisk);

    expect(merged.stop_loss_percent).toBe(2); // account wins
    expect(merged.take_profit_percent).toBe(10); // inherited from scenario
  });

  it("account risk does not affect fields it does not override", () => {
    const base = baseRisk();
    const accountRisk: Partial<RiskConfig> = { position_ratio: 0.08 };
    const merged = mergeRisk(base, accountRisk);

    expect(merged.position_ratio).toBe(0.08);
    expect(merged.max_positions).toBe(4); // unchanged
    expect(merged.trailing_stop.enabled).toBe(false); // unchanged
  });
});
