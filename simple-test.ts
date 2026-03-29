import { getKlines } from "./src/exchange/binance.js";

async function test() {
  console.log("Testing getKlines...");
  const klines = await getKlines("BTCUSDT", "1h", 10);
  console.log("Got", klines.length, "klines");
  if (klines.length > 0) {
    console.log("Last close:", klines[klines.length-1].close);
  }
}

test().catch(e => console.error("Error:", e.message));
