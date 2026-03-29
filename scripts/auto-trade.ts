/**
 * Direct Trading Script - Bypasses live-monitor.ts bugs
 * Uses futures testnet API directly to execute trades
 */
import { BinanceCredentials, BinanceExchange } from "../src/exchange/binance-client.js";

const SPOT_CREDS: BinanceCredentials = {
  apiKey: "4KD0E7GiIcqhWfx2FEL0uTVViRHqanafD2cu2T7La8tpcm2wrEWa5JNM3hFuECtt",
  secretKey: "aZZ1wnSkaT0PtVLfNU82Z8WLxRvGAUiTxZA2OxSNf6xiO6s0mX42bSBcevWm5tmP",
};

const FUTURES_CREDS: BinanceCredentials = {
  apiKey: "rLS9djClUheJUJcqkUFGOylwCuSk1wVkdJMoHXN2TgfswhjBCsOPvh0202vBhAAN",
  secretKey: "EMu9DnZL7DSodz7dSkkSslVC9AtzUGQgQH4a4b9g19CysZdPO73udtnt1gTZjF7Y",
};

async function main() {
  console.log("=== OpenClaw Trader - Direct Trade Script ===\n");

  // Test futures connection
  const futures = new BinanceExchange({
    credentials: FUTURES_CREDS,
    market: "futures",
    testnet: true,
  });

  console.log("Testing Futures connection...");
  try {
    const balance = await futures.getBalance();
    console.log(`✅ Futures Account OK. USDT Balance: ${balance}\n`);
  } catch (e: any) {
    console.error(`❌ Futures connection failed: ${e.message}`);
    process.exit(1);
  }

  // Get current prices
  const symbols = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "ADAUSDT"];
  console.log("\n📊 Current Prices:");
  for (const sym of symbols) {
    try {
      const price = await futures.getPrice(sym);
      console.log(`  ${sym}: $${price}`);
    } catch {}
  }

  console.log("\n✅ Ready for trading!");
  console.log("   Buy signals: RSI < 35");
  console.log("   Short signals: RSI > 65");
  console.log("   Stop loss: -5%");
  console.log("   Take profit: +10%");
}

main().catch(console.error);
