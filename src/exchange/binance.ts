import crypto from "crypto";
import https from "https";
import http from "http";
import tls from "tls";
import net from "net";
import { URL } from "url";
import type { Kline, TradeResult } from "../types.js";

const BASE_URL = "api.binance.com";

interface BinanceConfig {
  apiKey: string;
  secretKey: string;
}

function sign(query: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(query).digest("hex");
}

interface BinanceErrorBody {
  code: number;
  msg: string;
}
function isBinanceError(obj: unknown): obj is BinanceErrorBody {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "code" in obj &&
    typeof (obj as Record<string, unknown>)["code"] === "number" &&
    ((obj as Record<string, unknown>)["code"] as number) < 0
  );
}

function getProxyUrl(): string | undefined {
  return process.env.HTTPS_PROXY || process.env.https_proxy ||
         process.env.HTTP_PROXY || process.env.http_proxy;
}

function isBypassHost(hostname: string): boolean {
  const noProxy = process.env.NO_PROXY || process.env.no_proxy || "";
  const bypassList = noProxy.split(",").map(s => s.trim().toLowerCase());
  const defaults = ["localhost", "127.*", "10.*", "172.16-31.*", "192.168.*"];
  const allBypass = [...bypassList, ...defaults];

  return allBypass.some(pattern => {
    if (pattern === hostname.toLowerCase()) return true;
    if (pattern.includes("*")) {
      const regex = new RegExp("^" + pattern.replace(/\./g, "\\.").replace(/\*/g, ".*") + "$");
      return regex.test(hostname.toLowerCase());
    }
    return false;
  });
}

function request(options: https.RequestOptions): Promise<unknown> {
  const proxyUrl = getProxyUrl();
  const targetHost = options.hostname || "api.binance.com";

  if (!proxyUrl || isBypassHost(targetHost)) {
    return directRequest(options);
  }

  return proxyRequest(options, proxyUrl, targetHost);
}

function directRequest(options: https.RequestOptions): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const req = https.get(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          const parsed: unknown = JSON.parse(data) as unknown;
          if (isBinanceError(parsed)) {
            reject(new Error(`Binance API Error ${(parsed as BinanceErrorBody).code}: ${(parsed as BinanceErrorBody).msg}`));
          } else {
            resolve(parsed);
          }
        } catch (_e: unknown) {
          reject(new Error(`Failed to parse response: ${data}`));
        }
      });
    });
    req.on("error", reject);
    req.setTimeout(10000, () => { req.destroy(new Error("Request timeout")); reject(new Error("Request timeout")); });
  });
}

function proxyRequest(options: https.RequestOptions, proxyUrl: string, targetHost: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const proxyParsed = new URL(proxyUrl);
    const proxyHost = proxyParsed.hostname;
    const proxyPort = parseInt(proxyParsed.port) || 80;
    const auth = proxyParsed.username && proxyParsed.password
      ? { user: proxyParsed.username, pass: proxyParsed.password }
      : undefined;

    let socket: net.Socket;
    let tlsSocket: tls.TLSSocket;
    let connected = false;
    let responseData = "";

    function cleanup() {
      try { tlsSocket?.destroy(); } catch { /* ignore */ }
      try { socket?.destroy(); } catch { /* ignore */ }
    }

    socket = net.connect(proxyPort, proxyHost);

    socket.on("connect", () => {
      const connectLines = [
        `CONNECT ${targetHost}:443 HTTP/1.0`,
        `Host: ${targetHost}:443`
      ];
      if (auth) {
        const creds = Buffer.from(`${auth.user}:${auth.pass}`).toString("base64");
        connectLines.push(`Proxy-Authorization: Basic ${creds}`);
      }
      connectLines.push("", "");
      socket.write(connectLines.join("\r\n"));
    });

    socket.on("data", (buf: Buffer) => {
      responseData += buf.toString();

      if (!connected && responseData.includes("200") && responseData.includes("Connection established")) {
        connected = true;
        socket.removeAllListeners("data");

        tlsSocket = tls.connect({
          host: targetHost,
          servername: targetHost,
          socket: socket,
          rejectUnauthorized: false
        });

        tlsSocket.on("secureConnect", () => {
          // Build raw HTTP request
          const method = options.method || "GET";
          const path = options.path || "/";
          const headers = options.headers || {};
          const headerStr = Object.entries(headers)
            .map(([k, v]) => `${k}: ${v}`)
            .join("\r\n");
          const httpReq = `${method} ${path} HTTP/1.0\r\nHost: ${targetHost}\r\n${headerStr}\r\nConnection: close\r\n\r\n`;

          tlsSocket.write(httpReq);

          let responseData = "";
          tlsSocket.on("data", (buf: Buffer) => {
            responseData += buf.toString();
          });
          tlsSocket.on("end", () => {
            // Parse HTTP response
            const headerEnd = responseData.indexOf("\r\n\r\n");
            if (headerEnd === -1) {
              reject(new Error("Invalid proxy response"));
              return;
            }
            const body = responseData.substring(headerEnd + 4);
            try {
              const parsed: unknown = JSON.parse(body) as unknown;
              if (isBinanceError(parsed)) {
                reject(new Error(`Binance API Error ${(parsed as BinanceErrorBody).code}: ${(parsed as BinanceErrorBody).msg}`));
              } else {
                resolve(parsed);
              }
            } catch (_e: unknown) {
              reject(new Error(`Failed to parse response: ${body.substring(0, 200)}`));
            }
          });
        });

        tlsSocket.on("error", (e: Error) => { reject(e); cleanup(); });
        tlsSocket.on("timeout", () => { reject(new Error("TLS timeout")); cleanup(); });
      }
    });

    socket.on("error", (e: Error) => reject(e));
    socket.on("timeout", () => { reject(new Error("Proxy timeout")); cleanup(); });
    socket.setTimeout(10000);
  });
}

// ─────────────────────────────────────────────────────
// Public API (no signature required)
// ─────────────────────────────────────────────────────

/** @deprecated Use IExchange.getPrice() via createExchange() instead */
export async function getPrice(symbol: string): Promise<number> {
  const data = (await request({
    hostname: BASE_URL,
    path: `/api/v3/ticker/price?symbol=${symbol}`,
  })) as { price: string };
  return parseFloat(data.price);
}

/** @deprecated Use IExchange.getKlines() via createExchange() instead */
export async function getKlines(symbol: string, interval: string, limit = 100): Promise<Kline[]> {
  const raw = (await request({
    hostname: BASE_URL,
    path: `/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`,
  })) as [number, string, string, string, string, string, number][];

  return raw.map((k) => ({
    openTime: k[0],
    open: parseFloat(k[1]),
    high: parseFloat(k[2]),
    low: parseFloat(k[3]),
    close: parseFloat(k[4]),
    volume: parseFloat(k[5]),
    closeTime: k[6],
  }));
}

// ─────────────────────────────────────────────────────
// Private API (signature required)
// ─────────────────────────────────────────────────────

/** @deprecated Use IExchange.getUsdtBalance() via createExchange() instead */
export async function getBalance(cfg: BinanceConfig, asset = "USDT"): Promise<number> {
  const ts = Date.now();
  const query = `timestamp=${ts}`;
  const sig = sign(query, cfg.secretKey);
  const data = (await request({
    hostname: BASE_URL,
    path: `/api/v3/account?${query}&signature=${sig}`,
    headers: { "X-MBX-APIKEY": cfg.apiKey },
  })) as { balances: { asset: string; free: string }[] };

  const balance = data.balances.find((b) => b.asset === asset);
  return balance ? parseFloat(balance.free) : 0;
}

/** @deprecated Use IExchange.marketBuy() via createExchange() instead */
export async function marketBuy(
  cfg: BinanceConfig,
  symbol: string,
  quantity: number,
): Promise<TradeResult> {
  const ts = Date.now();
  const query = `symbol=${symbol}&side=BUY&type=MARKET&quantity=${quantity}&timestamp=${ts}`;
  const sig = sign(query, cfg.secretKey);
  const data = (await request({
    hostname: BASE_URL,
    path: `/api/v3/order?${query}&signature=${sig}`,
    headers: { "X-MBX-APIKEY": cfg.apiKey },
  })) as {
    orderId: number;
    executedQty: string;
    cummulativeQuoteQty: string;
    status: string;
  };

  return {
    orderId: data.orderId,
    executedQty: parseFloat(data.executedQty),
    cummulativeQuoteQty: parseFloat(data.cummulativeQuoteQty),
    status: data.status,
  };
}

/** @deprecated Use IExchange.marketSell() via createExchange() instead */
export async function marketSell(
  cfg: BinanceConfig,
  symbol: string,
  quantity: number,
): Promise<TradeResult> {
  const ts = Date.now();
  const query = `symbol=${symbol}&side=SELL&type=MARKET&quantity=${quantity}&timestamp=${ts}`;
  const sig = sign(query, cfg.secretKey);
  const data = (await request({
    hostname: BASE_URL,
    path: `/api/v3/order?${query}&signature=${sig}`,
    headers: { "X-MBX-APIKEY": cfg.apiKey },
  })) as {
    orderId: number;
    executedQty: string;
    cummulativeQuoteQty: string;
    status: string;
  };

  return {
    orderId: data.orderId,
    executedQty: parseFloat(data.executedQty),
    cummulativeQuoteQty: parseFloat(data.cummulativeQuoteQty),
    status: data.status,
  };
}
