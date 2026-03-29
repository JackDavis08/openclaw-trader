/**
 * Exchange-agnostic interface & types
 *
 * All exchange implementations (Binance, OKX, Bybit, …) must conform to IExchange.
 * Types here are structurally compatible with Binance-specific types in binance-client.ts
 * so that BinanceClient satisfies IExchange without adapters.
 */
export {};
