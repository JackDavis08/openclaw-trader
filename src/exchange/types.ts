/**
 * Exchange-agnostic interface & types
 *
 * All exchange implementations (Binance, OKX, Bybit, …) must conform to IExchange.
 * Types here are structurally compatible with Binance-specific types in binance-client.ts
 * so that BinanceClient satisfies IExchange without adapters.
 */

import type { Kline } from "../types.js";

// ─────────────────────────────────────────────────────
// Order / Account types (exchange-agnostic)
// ─────────────────────────────────────────────────────

export type OrderSide = "BUY" | "SELL";

export type ExchangeOrderType =
  | "MARKET"
  | "LIMIT"
  | "STOP_LOSS_LIMIT"
  | "TAKE_PROFIT_LIMIT"
  | "STOP_MARKET"
  | "TAKE_PROFIT_MARKET";

export type ExchangeOrderStatus =
  | "NEW"
  | "PARTIALLY_FILLED"
  | "FILLED"
  | "CANCELED"
  | "REJECTED"
  | "EXPIRED";

export interface ExchangeOrderRequest {
  symbol: string;
  side: OrderSide;
  type: ExchangeOrderType;
  quantity: number;
  price?: number;
  stopPrice?: number;
  timeInForce?: "GTC" | "IOC" | "FOK";
  newClientOrderId?: string;
  reduceOnly?: boolean;
  workingType?: "MARK_PRICE" | "CONTRACT_PRICE";
}

export interface ExchangeOrderResponse {
  symbol: string;
  orderId: number;
  clientOrderId: string;
  transactTime: number;
  price: string;
  origQty: string;
  executedQty: string;
  status: string; // ExchangeOrderStatus or any other string returned by the exchange
  type: string;
  side: string;
  fills?: { price: string; qty: string; commission: string; commissionAsset: string }[];
}

export interface ExchangeAccountBalance {
  asset: string;
  free: string;
  locked: string;
}

export interface ExchangeAccountInfo {
  balances: ExchangeAccountBalance[];
  canTrade: boolean;
  canWithdraw: boolean;
  canDeposit: boolean;
}

export interface ExchangeSymbolInfo {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  minQty: number;
  maxQty: number;
  stepSize: number;
  tickSize: number;
  minNotional: number;
  pricePrecision: number;
  quantityPrecision: number;
}

export interface ExchangeFuturesPosition {
  symbol: string;
  positionAmt: string;
  entryPrice: string;
  unrealizedProfit: string;
}

// ─────────────────────────────────────────────────────
// IExchange — unified exchange interface
// ─────────────────────────────────────────────────────

export interface IExchange {
  // ── Connectivity ──
  ping(): Promise<boolean>;

  // ── Market data ──
  getPrice(symbol: string): Promise<number>;
  getKlines(symbol: string, interval: string, limit?: number): Promise<Kline[]>;
  getSymbolInfo(symbol: string): Promise<ExchangeSymbolInfo>;

  // ── Account ──
  getAccountInfo(): Promise<ExchangeAccountInfo>;
  getUsdtBalance(): Promise<number>;
  getFuturesPositions(): Promise<ExchangeFuturesPosition[]>;

  // ── Orders ──
  createOrder(req: ExchangeOrderRequest): Promise<ExchangeOrderResponse>;
  marketBuy(symbol: string, usdtAmount: number): Promise<ExchangeOrderResponse>;
  marketSell(symbol: string, quantity: number, reduceOnly?: boolean): Promise<ExchangeOrderResponse>;
  marketBuyByQty(symbol: string, quantity: number, reduceOnly?: boolean): Promise<ExchangeOrderResponse>;
  placeStopLossOrder(
    symbol: string,
    side: OrderSide,
    qty: number,
    stopPrice: number,
    limitPrice?: number,
  ): Promise<ExchangeOrderResponse>;
  placeTakeProfitOrder(
    symbol: string,
    side: OrderSide,
    qty: number,
    takeProfitPrice: number,
    limitPrice?: number,
  ): Promise<ExchangeOrderResponse>;
  cancelOrder(symbol: string, orderId: number): Promise<ExchangeOrderResponse>;
  getOrder(symbol: string, orderId: number): Promise<ExchangeOrderResponse>;
  getOpenOrders(symbol?: string): Promise<ExchangeOrderResponse[]>;
}
