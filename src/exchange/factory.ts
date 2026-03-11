/**
 * Exchange factory — instantiate IExchange from config
 */

import type { ExchangeConfig } from "../types.js";
import type { IExchange } from "./types.js";
import { BinanceClient } from "./binance-client.js";

export function createExchange(config: ExchangeConfig): IExchange {
  const name = config.name ?? "binance";

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- future-proof: more exchanges will be added
  switch (name as string) {
    case "binance": {
      const credsPath = config.credentials_path ?? ".secrets/binance.json";
      const testnet = config.testnet ?? false;
      const market = config.market === "futures" ? "futures" : "spot";
      return new BinanceClient(credsPath, testnet, market);
    }
    default:
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions -- intentional fallthrough
      throw new Error(`Unsupported exchange: "${name}". Currently supported: binance`);
  }
}
