/**
 * One-time script: close all open positions on futures testnet account.
 * Usage: npx tsx src/scripts/close-futures-positions.ts
 */
import { createBinanceClient } from "../exchange/binance-client.js";

const CREDS_PATH = ".secrets/binance-futures-testnet.json";
const client = createBinanceClient(CREDS_PATH, { testnet: true, market: "futures" });

async function main() {
  console.log("🔍 Checking futures testnet account...");

  const balanceBefore = await client.getUsdtBalance();
  console.log(`💰 USDT balance: $${balanceBefore.toFixed(2)}`);

  const allPositions = await client.getFuturesPositions();
  const positions = allPositions.filter((p) => parseFloat(p.positionAmt) !== 0);
  console.log(`📋 Open positions: ${positions.length}`);

  for (const pos of positions) {
    const amt = parseFloat(pos.positionAmt);
    console.log(`  ${pos.symbol}: qty=${amt} (${amt > 0 ? "LONG" : "SHORT"}), entry=$${pos.entryPrice}, unrealizedPnl=$${parseFloat(pos.unrealizedProfit).toFixed(2)}`);
  }

  if (positions.length === 0) {
    console.log("✅ No open positions — nothing to close.");
    return;
  }

  console.log("\n🔄 Closing all positions with reduceOnly=true...");
  for (const pos of positions) {
    const amt = parseFloat(pos.positionAmt);
    const qty = Math.abs(amt);
    const isLong = amt > 0;
    console.log(`  → ${pos.symbol} ${isLong ? "SELL (close long)" : "BUY (close short)"} qty=${qty}`);
    try {
      const result = isLong
        ? await client.marketSell(pos.symbol, qty)
        : await client.marketBuyByQty(pos.symbol, qty);
      console.log(`  ✅ Closed. orderId=${result.orderId}, status=${result.status}`);
    } catch (e) {
      console.log(`  ❌ Failed: ${e instanceof Error ? e.message : e}`);
    }
  }

  const balanceAfter = await client.getUsdtBalance();
  console.log(`\n💰 USDT balance after close: $${balanceAfter.toFixed(2)}`);
  console.log(`📈 PnL from closing: $${(balanceAfter - balanceBefore).toFixed(2)}`);
}

main().catch(console.error);
