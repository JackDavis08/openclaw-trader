import { getKlines } from "./src/exchange/binance.js";

async function test() {
  console.log("Testing getKlines with proxy...");
  
  // Set proxy
  process.env.HTTPS_PROXY = "http://127.0.0.1:7890";
  
  const klines = await getKlines("BTCUSDT", "1h", 10);
  console.log("Success! Got", klines.length, "klines");
  if (klines.length > 0) {
    console.log("Last close:", klines[klines.length-1].close);
  }
}

test().catch(e => {
  console.error("Error:", e.message);
  console.error("Stack:", e.stack);
});
