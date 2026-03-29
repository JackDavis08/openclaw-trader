import { getKlines } from "./src/exchange/binance.js";
import { calculateIndicators } from "./src/strategy/indicators.js";
import { detectSignal } from "./src/strategy/signals.js";
import { classifyRegime } from "./src/strategy/regime.js";
import fs from "fs";

async function test() {
  console.log("Fetching klines...");
  const klines = await getKlines("BTCUSDT", "1h", 100);
  console.log("Got", klines.length, "klines");

  const closes = klines.map(k => k.close);
  const highs = klines.map(k => k.high);
  const lows = klines.map(k => k.low);
  const volumes = klines.map(k => k.volume);

  console.log("Last close:", closes[closes.length - 1]);

  // Load config manually
  const configPath = "./config/strategies/long-short.yaml";
  const configContent = fs.readFileSync(configPath, "utf-8");

  // Simple YAML parse for min_rr
  const minRrMatch = configContent.match(/min_rr:\s*(\d+\.?\d*)/);
  const minRr = minRrMatch ? parseFloat(minRrMatch[1]) : 1.5;

  console.log("\nConfig min_rr:", minRr);

  // Calculate indicators
  const indicators = calculateIndicators(closes, highs, lows, volumes, {
    maShort: 20,
    maLong: 60,
    rsiPeriod: 14,
    macd: { fast: 12, slow: 26, signal: 9 }
  });

  console.log("\nIndicators:");
  console.log("  MA Short:", indicators.maShort?.toFixed(2));
  console.log("  MA Long:", indicators.maLong?.toFixed(2));
  console.log("  RSI:", indicators.rsi?.toFixed(2));
  console.log("  MA Gap:", ((indicators.maShort - indicators.maLong) / indicators.maLong * 100).toFixed(3) + "%");

  // Check regime
  const regime = classifyRegime(klines);
  console.log("\nRegime:");
  console.log("  label:", regime.label);
  console.log("  signalFilter:", regime.signalFilter);
  console.log("  confidence:", regime.confidence);

  // Simple signal detection
  const maBullish = indicators.maShort > indicators.maLong;
  const maBearish = indicators.maShort < indicators.maLong;
  const rsiNotOverbought = indicators.rsi < 70;
  const rsiNotOversold = indicators.rsi > 30;

  console.log("\nSignal checks:");
  console.log("  ma_bullish:", maBullish);
  console.log("  ma_bearish:", maBearish);
  console.log("  rsi_not_overbought:", rsiNotOverbought);
  console.log("  rsi_not_oversold:", rsiNotOversold);

  // Short signal
  const shortSignal = maBearish && rsiNotOversold;
  console.log("\n  -> Short signal possible:", shortSignal);
  console.log("     (ma_bearish AND rsi_not_oversold)");
}

test().catch(e => console.error("Error:", e.message));
