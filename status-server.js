"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * OpenClaw Trader - Professional Trading Dashboard v5
 * Features: Interactive cards, real-time data, rich PnL display
 */
var http = require("http");
var https_1 = require("https");
var crypto_1 = require("crypto");
process.on('uncaughtException', function (err) { console.error('UNCAUGHT:', err.message); });
process.on('unhandledRejection', function (reason) { console.error('UNHANDLED:', String(reason)); });
var API_KEY = "rLS9djClUheJUJcqkUFGOylwCuSk1wVkdJMoHXN2TgfswhjBCsOPvh0202vBhAAN";
var SECRET = "EMu9DnZL7DSodz7dSkkSslVC9AtzUGQgQH4a4b9g19CysZdPO73udtnt1gTZjF7Y";
var INITIAL_BALANCE = 5000;
function apiRequest(path, params) {
    if (params === void 0) { params = {}; }
    return new Promise(function (resolve, reject) {
        var ts = Date.now();
        var qp = __assign(__assign({}, params), { timestamp: String(ts) });
        var query = Object.entries(qp).map(function (_a) {
            var k = _a[0], v = _a[1];
            return "".concat(k, "=").concat(encodeURIComponent(v));
        }).join("&");
        var sig = crypto_1.default.createHmac("sha256", SECRET).update(query).digest("hex");
        var opts = { hostname: "testnet.binancefuture.com", path: "".concat(path, "?").concat(query, "&signature=").concat(sig), method: "GET", headers: { "X-MBX-APIKEY": API_KEY } };
        var req = https_1.default.request(opts, function (res) {
            var data = "";
            res.on("data", function (c) { return data += c; });
            res.on("end", function () { try {
                resolve(JSON.parse(data));
            }
            catch (_a) {
                resolve(data);
            } });
        });
        req.on("error", reject);
        req.end();
    });
}
function getData() {
    return __awaiter(this, void 0, void 0, function () {
        var _a, balData, posData, usdt, balance, walletBalance, activePositions, tickerPromises, changeMap_1, _b, _c, positions, totalPosPnl, totalPosPnlPct, totalAccountPnl, totalAccountPnlPct, e_1;
        var _this = this;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    _d.trys.push([0, 3, , 4]);
                    return [4 /*yield*/, Promise.all([
                            apiRequest("/fapi/v2/balance"),
                            apiRequest("/fapi/v2/positionRisk")
                        ])];
                case 1:
                    _a = _d.sent(), balData = _a[0], posData = _a[1];
                    usdt = balData.find(function (a) { return a.asset === "USDT"; });
                    balance = parseFloat((usdt === null || usdt === void 0 ? void 0 : usdt.availableBalance) || "0");
                    walletBalance = parseFloat((usdt === null || usdt === void 0 ? void 0 : usdt.crossWalletBalance) || (usdt === null || usdt === void 0 ? void 0 : usdt.balance) || "0");
                    activePositions = posData.filter(function (p) { return parseFloat(p.positionAmt) !== 0; });
                    tickerPromises = activePositions.map(function (p) { return __awaiter(_this, void 0, void 0, function () {
                        var tick, _a;
                        return __generator(this, function (_b) {
                            switch (_b.label) {
                                case 0:
                                    _b.trys.push([0, 2, , 3]);
                                    return [4 /*yield*/, apiRequest("/fapi/v1/ticker/24hr", { symbol: p.symbol })];
                                case 1:
                                    tick = _b.sent();
                                    return [2 /*return*/, { symbol: p.symbol, change24h: parseFloat(tick.priceChangePercent || "0") }];
                                case 2:
                                    _a = _b.sent();
                                    return [2 /*return*/, { symbol: p.symbol, change24h: 0 }];
                                case 3: return [2 /*return*/];
                            }
                        });
                    }); });
                    _c = (_b = Object).fromEntries;
                    return [4 /*yield*/, Promise.all(tickerPromises)];
                case 2:
                    changeMap_1 = _c.apply(_b, [_d.sent()]);
                    positions = activePositions.map(function (p) {
                        var amt = parseFloat(p.positionAmt);
                        var entry = parseFloat(p.entryPrice);
                        var mark = parseFloat(p.markPrice) || entry;
                        var leverage = parseFloat(p.leverage || "3");
                        var rawPnl = parseFloat(p.unRealizedProfit || "0");
                        var notional = Math.abs(amt) * entry;
                        var margin = notional / leverage;
                        var posPnlPct = notional > 0 ? (rawPnl / notional * 100) : 0;
                        var roePct = margin > 0 ? (rawPnl / margin * 100) : 0;
                        var change24h = changeMap_1[p.symbol] || 0;
                        return {
                            symbol: p.symbol,
                            side: amt > 0 ? "LONG" : "SHORT",
                            qty: Math.abs(amt),
                            entry: entry.toFixed(4),
                            mark: mark.toFixed(4),
                            pnl: rawPnl.toFixed(2),
                            pnlPct: posPnlPct.toFixed(2),
                            roePct: roePct.toFixed(2),
                            leverage: leverage,
                            change24h: change24h.toFixed(2),
                            margin: margin.toFixed(2),
                            notional: notional.toFixed(2),
                            isLong: amt > 0,
                            liquidationPrice: p.liquidationPrice || "0",
                            isolated: p.isolated || false,
                        };
                    });
                    totalPosPnl = positions.reduce(function (sum, p) { return sum + parseFloat(p.pnl); }, 0);
                    totalPosPnlPct = positions.length > 0
                        ? (positions.reduce(function (sum, p) { return sum + parseFloat(p.pnlPct); }, 0) / positions.length) : 0;
                    totalAccountPnl = walletBalance - INITIAL_BALANCE;
                    totalAccountPnlPct = (totalAccountPnl / INITIAL_BALANCE * 100);
                    return [2 /*return*/, {
                            balance: balance.toFixed(2),
                            walletBalance: walletBalance.toFixed(2),
                            totalPnl: totalPosPnl.toFixed(2),
                            totalPnlPct: totalPosPnlPct.toFixed(2),
                            totalAccountPnl: totalAccountPnl.toFixed(2),
                            totalAccountPnlPct: totalAccountPnlPct.toFixed(2),
                            positions: positions,
                            posCount: positions.length,
                            timestamp: Date.now()
                        }];
                case 3:
                    e_1 = _d.sent();
                    return [2 /*return*/, { error: e_1.message, positions: [], posCount: 0 }];
                case 4: return [2 /*return*/];
            }
        });
    });
}
var HTML = "<!DOCTYPE html>\n<html lang=\"zh\">\n<head>\n<meta charset=\"UTF-8\">\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n<title>OpenClaw Trading Dashboard</title>\n<style>\n* { margin: 0; padding: 0; box-sizing: border-box; }\nbody { \n  font-family: 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif; \n  background: linear-gradient(135deg, #0a0e17 0%, #111827 50%, #0f172a 100%);\n  color: #e2e8f0; min-height: 100vh; padding: 20px; font-size: 14px;\n}\n.container { max-width: 1400px; margin: 0 auto; }\n\n/* ============ HEADER ============ */\n.header {\n  display: flex; justify-content: space-between; align-items: center;\n  background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08);\n  border-radius: 16px; padding: 16px 24px; margin-bottom: 20px;\n  cursor: pointer; transition: all 0.3s;\n}\n.header:hover { background: rgba(255,255,255,0.05); border-color: rgba(255,255,255,0.12); }\n.header-left { display: flex; align-items: center; gap: 14px; }\n.logo { font-size: 28px; }\n.title { font-size: 20px; font-weight: 700; color: #f8fafc; }\n.subtitle { font-size: 11px; color: #64748b; margin-top: 2px; }\n.header-right { text-align: right; }\n.live-badge {\n  display: inline-flex; align-items: center; gap: 6px;\n  background: rgba(0,200,83,0.12); border: 1px solid #00c853;\n  color: #00c853; padding: 5px 14px; border-radius: 20px;\n  font-size: 12px; font-weight: 600;\n}\n.live-dot { width: 7px; height: 7px; background: #00c853; border-radius: 50%; animation: pulse 2s infinite; }\n@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }\n.clock { font-size: 12px; color: #94a3b8; margin-top: 4px; font-variant-numeric: tabular-nums; }\n\n/* ============ STATS GRID ============ */\n.stats-grid {\n  display: grid; grid-template-columns: repeat(6, 1fr); gap: 12px; margin-bottom: 20px;\n}\n.stat-card {\n  background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.07);\n  border-radius: 14px; padding: 16px 18px; cursor: pointer;\n  transition: all 0.3s;\n}\n.stat-card:hover { transform: translateY(-2px); box-shadow: 0 8px 25px rgba(0,0,0,0.3); border-color: rgba(255,255,255,0.15); }\n.stat-card.green { border-color: rgba(16,185,129,0.3); background: rgba(16,185,129,0.05); }\n.stat-card.red { border-color: rgba(239,68,68,0.3); background: rgba(239,68,68,0.05); }\n.stat-label { font-size: 10px; color: #64748b; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 8px; }\n.stat-value { font-size: 22px; font-weight: 700; font-variant-numeric: tabular-nums; }\n.stat-value.green { color: #10b981; }\n.stat-value.red { color: #ef4444; }\n.stat-value.blue { color: #3b82f6; }\n.stat-value.white { color: #f1f5f9; }\n.stat-sub { font-size: 10px; color: #475569; margin-top: 4px; }\n\n/* ============ SECTION ============ */\n.section { \n  background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05);\n  border-radius: 16px; padding: 20px; margin-bottom: 16px;\n}\n.section-title { \n  font-size: 15px; font-weight: 700; color: #f8fafc; margin-bottom: 16px;\n  display: flex; align-items: center; gap: 8px;\n}\n.section-title span { color: #64748b; font-weight: 400; font-size: 12px; }\n\n/* ============ POSITION CARDS ============ */\n.pos-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)); gap: 14px; }\n.pos-card {\n  background: linear-gradient(145deg, rgba(30,41,59,0.95), rgba(15,23,42,0.98));\n  border-radius: 14px; padding: 0; overflow: hidden;\n  border: 1px solid rgba(255,255,255,0.08);\n  cursor: pointer; transition: all 0.3s;\n}\n.pos-card:hover { transform: translateY(-3px); box-shadow: 0 12px 35px rgba(0,0,0,0.4); }\n.pos-card.long { border-color: rgba(16,185,129,0.35); }\n.pos-card.short { border-color: rgba(239,68,68,0.35); }\n\n/* Card header bar */\n.pos-header {\n  display: flex; justify-content: space-between; align-items: center;\n  padding: 14px 16px; border-bottom: 1px solid rgba(255,255,255,0.05);\n}\n.pos-symbol { font-size: 17px; font-weight: 800; color: #f1f5f9; }\n.pos-badge {\n  padding: 4px 12px; border-radius: 6px; font-size: 11px; font-weight: 700;\n}\n.pos-badge.long { background: rgba(16,185,129,0.15); color: #10b981; border: 1px solid rgba(16,185,129,0.3); }\n.pos-badge.short { background: rgba(239,68,68,0.15); color: #ef4444; border: 1px solid rgba(239,68,68,0.3); }\n\n/* Main PnL section */\n.pos-pnl-main {\n  padding: 16px; text-align: center;\n}\n.pos-pnl-value { font-size: 32px; font-weight: 800; font-variant-numeric: tabular-nums; line-height: 1.2; }\n.pos-pnl-value.profit { color: #10b981; }\n.pos-pnl-value.loss { color: #ef4444; }\n.pos-pnl-sub { font-size: 12px; color: #64748b; margin-top: 4px; }\n.pos-pnl-sub span { font-weight: 600; }\n\n/* Price row */\n.pos-prices {\n  display: grid; grid-template-columns: 1fr 1fr 1fr 1fr;\n  gap: 1px; background: rgba(255,255,255,0.05); \n}\n.pos-price { padding: 10px 12px; text-align: center; background: rgba(15,23,42,0.8); }\n.pos-price-label { font-size: 9px; color: #475569; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }\n.pos-price-value { font-size: 13px; font-weight: 700; color: #cbd5e1; font-variant-numeric: tabular-nums; }\n.pos-price-value.up { color: #10b981; }\n.pos-price-value.down { color: #ef4444; }\n\n/* Footer */\n.pos-footer {\n  display: flex; justify-content: space-between; align-items: center;\n  padding: 10px 14px; background: rgba(0,0,0,0.2);\n  font-size: 11px; color: #475569;\n}\n.pos-footer span { color: #64748b; }\n.pos-expand { font-size: 12px; color: #64748b; transition: transform 0.3s; }\n.pos-expand.open { transform: rotate(180deg); }\n\n/* ============ EXPANDED DETAILS ============ */\n.pos-details {\n  display: none; padding: 16px;\n  border-top: 1px solid rgba(255,255,255,0.06);\n  background: rgba(0,0,0,0.2);\n}\n.pos-details.open { display: block; }\n.detail-row {\n  display: flex; justify-content: space-between; padding: 8px 0;\n  border-bottom: 1px solid rgba(255,255,255,0.04);\n}\n.detail-row:last-child { border-bottom: none; }\n.detail-label { font-size: 12px; color: #64748b; }\n.detail-value { font-size: 12px; font-weight: 600; color: #94a3b8; }\n.detail-value.highlight { color: #10b981; font-size: 14px; }\n\n/* ROE bar */\n.roe-bar { margin-top: 12px; }\n.roe-bar-label { display: flex; justify-content: space-between; font-size: 10px; color: #475569; margin-bottom: 6px; }\n.roe-track { height: 6px; background: rgba(255,255,255,0.08); border-radius: 3px; overflow: hidden; }\n.roe-fill { height: 100%; border-radius: 3px; transition: width 0.5s; }\n.roe-fill.profit { background: linear-gradient(90deg, #10b981, #34d399); }\n.roe-fill.loss { background: linear-gradient(90deg, #ef4444, #f87171); }\n\n/* ============ EMPTY STATE ============ */\n.no-pos {\n  text-align: center; padding: 50px 20px; color: #475569; font-size: 13px;\n}\n.no-pos-icon { font-size: 40px; margin-bottom: 12px; opacity: 0.5; }\n\n/* ============ MODAL ============ */\n.modal-overlay {\n  display: none; position: fixed; top: 0; left: 0; right: 0; bottom: 0;\n  background: rgba(0,0,0,0.7); z-index: 1000; align-items: center; justify-content: center;\n  backdrop-filter: blur(4px);\n}\n.modal-overlay.show { display: flex; }\n.modal {\n  background: linear-gradient(145deg, #1e293b, #0f172a);\n  border: 1px solid rgba(255,255,255,0.1); border-radius: 16px;\n  padding: 24px; max-width: 480px; width: 90%;\n  animation: modalIn 0.3s ease;\n}\n@keyframes modalIn { from { transform: scale(0.95); opacity: 0; } }\n.modal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }\n.modal-title { font-size: 16px; font-weight: 700; color: #f1f5f9; }\n.modal-close { background: none; border: none; color: #64748b; font-size: 20px; cursor: pointer; transition: color 0.2s; }\n.modal-close:hover { color: #ef4444; }\n.modal-info { display: flex; flex-direction: column; gap: 12px; }\n.modal-row { display: flex; justify-content: space-between; padding: 10px 14px; background: rgba(255,255,255,0.03); border-radius: 10px; }\n.modal-row-label { font-size: 12px; color: #64748b; }\n.modal-row-value { font-size: 13px; font-weight: 600; color: #cbd5e1; }\n.modal-row-value.green { color: #10b981; }\n.modal-row-value.red { color: #ef4444; }\n.modal-footer { margin-top: 20px; text-align: center; font-size: 11px; color: #475569; }\n\n/* ============ REFRESH BAR ============ */\n.refresh-bar {\n  height: 3px; background: rgba(255,255,255,0.05); border-radius: 2px;\n  margin-bottom: 20px; overflow: hidden;\n}\n.refresh-progress {\n  height: 100%; background: linear-gradient(90deg, #3b82f6, #10b981);\n  border-radius: 2px; transition: width 1s linear; width: 0%;\n}\n\n/* ============ FOOTER ============ */\n.footer { text-align: center; color: #334155; font-size: 11px; margin-top: 20px; }\n\n/* ============ RESPONSIVE ============ */\n@media (max-width: 1000px) { .stats-grid { grid-template-columns: repeat(3, 1fr); } }\n@media (max-width: 700px) { .stats-grid { grid-template-columns: repeat(2, 1fr); } .header { flex-direction: column; gap: 12px; } .header-right { text-align: left; } }\n</style>\n</head>\n<body>\n<div class=\"container\">\n  \n  <!-- Header -->\n  <div class=\"header\" onclick=\"showModal('system')\">\n    <div class=\"header-left\">\n      <div class=\"logo\">\uD83E\uDD16</div>\n      <div>\n        <div class=\"title\">OpenClaw Trading</div>\n        <div class=\"subtitle\">Binance Futures Testnet \u00B7 3x Hedge Mode \u00B7 \u70B9\u51FB\u67E5\u770B\u7CFB\u7EDF\u4FE1\u606F</div>\n      </div>\n    </div>\n    <div class=\"header-right\">\n      <div class=\"live-badge\"><div class=\"live-dot\"></div> LIVE</div>\n      <div class=\"clock\" id=\"clock\">--:--:--</div>\n    </div>\n  </div>\n\n  <!-- Refresh Bar -->\n  <div class=\"refresh-bar\"><div class=\"refresh-progress\" id=\"refreshBar\"></div></div>\n\n  <!-- Stats Grid -->\n  <div class=\"stats-grid\">\n    <div class=\"stat-card green\" onclick=\"showModal('balance')\">\n      <div class=\"stat-label\">\uD83D\uDCB0 \u8D26\u6237\u4F59\u989D</div>\n      <div class=\"stat-value green\" id=\"balance\">$--</div>\n      <div class=\"stat-sub\">\u521D\u59CB $5,000</div>\n    </div>\n    <div class=\"stat-card\" id=\"cardPosPnl\" onclick=\"showModal('pnl')\">\n      <div class=\"stat-label\">\uD83D\uDCCA \u6301\u4ED3\u76C8\u4E8F</div>\n      <div class=\"stat-value\" id=\"posPnl\">$--</div>\n      <div class=\"stat-sub\" id=\"posPnlPct\">--%</div>\n    </div>\n    <div class=\"stat-card\" id=\"cardAccPnl\" onclick=\"showModal('account')\">\n      <div class=\"stat-label\">\uD83C\uDFE6 \u8D26\u6237\u603B\u76C8\u4E8F</div>\n      <div class=\"stat-value\" id=\"accPnl\">$--</div>\n      <div class=\"stat-sub\" id=\"accPnlPct\">--%</div>\n    </div>\n    <div class=\"stat-card\">\n      <div class=\"stat-label\">\uD83D\uDD22 \u6301\u4ED3\u6570\u91CF</div>\n      <div class=\"stat-value white\" id=\"posCount\">0/4</div>\n      <div class=\"stat-sub\">\u6700\u591A4\u4E2A\u4ED3\u4F4D</div>\n    </div>\n    <div class=\"stat-card\">\n      <div class=\"stat-label\">\uD83D\uDCC8 24h \u6DA8\u8DCC</div>\n      <div class=\"stat-value\" id=\"marketChange\">--</div>\n      <div class=\"stat-sub\">\u7EFC\u5408\u5E73\u5747</div>\n    </div>\n    <div class=\"stat-card\">\n      <div class=\"stat-label\">\u23F1\uFE0F \u8FD0\u884C\u65F6\u957F</div>\n      <div class=\"stat-value blue\" id=\"runningHours\">--</div>\n      <div class=\"stat-sub\">\u5C0F\u65F6</div>\n    </div>\n  </div>\n\n  <!-- Positions Section -->\n  <div class=\"section\">\n    <div class=\"section-title\">\uD83D\uDCCA \u5F53\u524D\u6301\u4ED3 <span>\uFF08\u70B9\u51FB\u5361\u7247\u5C55\u5F00\u8BE6\u60C5\uFF09</span></div>\n    <div class=\"pos-grid\" id=\"positions\">\n      <div class=\"no-pos\">\n        <div class=\"no-pos-icon\">\uD83D\uDCED</div>\n        \u6682\u65E0\u6301\u4ED3\uFF0C\u7B49\u5F85\u4EA4\u6613\u4FE1\u53F7...\n      </div>\n    </div>\n  </div>\n\n  <div class=\"footer\">OpenClaw Trading Dashboard v5 \u00B7 \u6570\u636E\u6BCF5\u79D2\u81EA\u52A8\u5237\u65B0 \u00B7 Binance Testnet</div>\n</div>\n\n<!-- Modal -->\n<div class=\"modal-overlay\" id=\"modalOverlay\" onclick=\"if(event.target===this)closeModal()\">\n  <div class=\"modal\">\n    <div class=\"modal-header\">\n      <div class=\"modal-title\" id=\"modalTitle\">\u8BE6\u60C5</div>\n      <button class=\"modal-close\" onclick=\"closeModal()\">\u2715</button>\n    </div>\n    <div class=\"modal-info\" id=\"modalInfo\"></div>\n    <div class=\"modal-footer\" id=\"modalFooter\"></div>\n  </div>\n</div>\n\n<script>\nlet countdown = 5;\nconst REFRESH = 5;\nlet startTime = Date.now();\nlet expandedCards = new Set();\n\nfunction formatTime(ts) {\n  const d = new Date(ts);\n  return d.toLocaleTimeString('zh-CN', { hour12: false }) + '.' + String(d.getMilliseconds()).padStart(3,'0');\n}\n\nfunction pnlSign(v) { return parseFloat(v) >= 0 ? '+' : ''; }\nfunction pnlClass(v) { return parseFloat(v) >= 0 ? 'profit' : 'loss'; }\nfunction pnlColor(v) { return parseFloat(v) >= 0 ? '#10b981' : '#ef4444'; }\n\n// Toggle card expansion\nfunction toggleCard(symbol) {\n  if (expandedCards.has(symbol)) {\n    expandedCards.delete(symbol);\n  } else {\n    expandedCards.add(symbol);\n  }\n  renderPositions(window._lastData?.positions || []);\n}\n\n// Render position cards - using traditional string concat to avoid TypeScript template issues\nfunction renderPositions(positions) {\n  if (positions.length === 0) {\n    return '<div class=\"no-pos\"><div class=\"no-pos-icon\">\uD83D\uDCED</div>\u6682\u65E0\u6301\u4ED3\uFF0C\u7B49\u5F85\u4EA4\u6613\u4FE1\u53F7...</div>';\n  }\n  \n  const html = positions.map(p => {\n    const pnlV = parseFloat(p.pnl);\n    const pClass = pnlV >= 0 ? 'profit' : 'loss';\n    const change24h = parseFloat(p.change24h);\n    const changeClass = change24h >= 0 ? 'up' : 'down';\n    const isOpen = expandedCards.has(p.symbol);\n    const roeV = Math.abs(parseFloat(p.roePct));\n    const roeWidth = Math.min(roeV * 10, 100);\n    const sideLabel = p.isLong ? '\u25B2 \u505A\u591A' : '\u25BC \u505A\u7A7A';\n    const posClass = p.isLong ? 'long' : 'short';\n    \n    return '<div class=\"pos-card ' + posClass + '\" data-symbol=\"' + p.symbol + '\">' +\n      '<div class=\"pos-header\">' +\n        '<div class=\"pos-symbol\">' + p.symbol + '</div>' +\n        '<div class=\"pos-badge ' + posClass + '\">' + sideLabel + ' ' + p.leverage + 'x</div>' +\n      '</div>' +\n      '<div class=\"pos-pnl-main\">' +\n        '<div class=\"pos-pnl-value ' + pClass + '\">' + pnlSign(pnlV) + '$' + p.pnl + '</div>' +\n        '<div class=\"pos-pnl-sub\">\u6301\u4ED3\u76C8\u4E8F\u7387: <span>' + pnlSign(p.pnlPct) + p.pnlPct + '%</span> \u00B7 ROE: <span>' + pnlSign(p.roePct) + p.roePct + '%</span></div>' +\n      '</div>' +\n      '<div class=\"pos-prices\">' +\n        '<div class=\"pos-price\"><div class=\"pos-price-label\">\u5F00\u4ED3\u4EF7</div><div class=\"pos-price-value\">$' + p.entry + '</div></div>' +\n        '<div class=\"pos-price\"><div class=\"pos-price-label\">\u5F53\u524D\u4EF7</div><div class=\"pos-price-value\">$' + p.mark + '</div></div>' +\n        '<div class=\"pos-price\"><div class=\"pos-price-label\">\u6570\u91CF</div><div class=\"pos-price-value\">' + p.qty + '</div></div>' +\n        '<div class=\"pos-price\"><div class=\"pos-price-label\">24h\u6DA8\u8DCC</div><div class=\"pos-price-value ' + changeClass + '\">' + pnlSign(p.change24h) + p.change24h + '%</div></div>' +\n      '</div>' +\n      '<div class=\"pos-footer\">' +\n        '<div>\u4FDD\u8BC1\u91D1: <span>$' + p.margin + '</span> \u00B7 \u4EF7\u503C: <span>$' + p.notional + '</span></div>' +\n        '<div class=\"pos-expand ' + (isOpen ? 'open' : '') + '\">' + (isOpen ? '\u25B2 \u6536\u8D77' : '\u25BC \u5C55\u5F00') + '</div>' +\n      '</div>' +\n      '<div class=\"pos-details ' + (isOpen ? 'open' : '') + '\">' +\n        '<div class=\"detail-row\"><div class=\"detail-label\">\u6301\u4ED3\u65B9\u5411</div><div class=\"detail-value\" style=\"color:' + pnlColor(p.pnl) + '\">' + sideLabel + '</div></div>' +\n        '<div class=\"detail-row\"><div class=\"detail-label\">\u5F00\u4ED3\u4EF7\u683C</div><div class=\"detail-value\">$' + p.entry + '</div></div>' +\n        '<div class=\"detail-row\"><div class=\"detail-label\">\u5F53\u524D\u4EF7\u683C</div><div class=\"detail-value\">$' + p.mark + '</div></div>' +\n        '<div class=\"detail-row\"><div class=\"detail-label\">\u6301\u4ED3\u6570\u91CF</div><div class=\"detail-value\">' + p.qty + '</div></div>' +\n        '<div class=\"detail-row\"><div class=\"detail-label\">\u6760\u6746\u500D\u6570</div><div class=\"detail-value\">' + p.leverage + 'x</div></div>' +\n        '<div class=\"detail-row\"><div class=\"detail-label\">\u4FDD\u8BC1\u91D1</div><div class=\"detail-value\">$' + p.margin + '</div></div>' +\n        '<div class=\"detail-row\"><div class=\"detail-label\">\u4ED3\u4F4D\u4EF7\u503C</div><div class=\"detail-value\">$' + p.notional + '</div></div>' +\n        '<div class=\"detail-row\"><div class=\"detail-label\">\u5F3A\u5E73\u4EF7\u683C</div><div class=\"detail-value\">$' + p.liquidationPrice + '</div></div>' +\n        '<div class=\"detail-row\"><div class=\"detail-label\">\u6D6E\u52A8\u76C8\u4E8F</div><div class=\"detail-value highlight\" style=\"color:' + pnlColor(p.pnl) + '\">' + pnlSign(p.pnl) + '$' + p.pnl + '</div></div>' +\n        '<div class=\"detail-row\"><div class=\"detail-label\">\u6301\u4ED3\u76C8\u4E8F\u7387</div><div class=\"detail-value\" style=\"color:' + pnlColor(p.pnlPct) + '\">' + pnlSign(p.pnlPct) + p.pnlPct + '%</div></div>' +\n        '<div class=\"detail-row\"><div class=\"detail-label\">\u6536\u76CA\u7387 ROE</div><div class=\"detail-value\" style=\"color:' + pnlColor(p.roePct) + '\">' + pnlSign(p.roePct) + p.roePct + '%</div></div>' +\n        '<div class=\"detail-row\"><div class=\"detail-label\">24h \u6DA8\u8DCC</div><div class=\"detail-value\" style=\"color:' + pnlColor(p.change24h) + '\">' + pnlSign(p.change24h) + p.change24h + '%</div></div>' +\n        '<div class=\"detail-row\"><div class=\"detail-label\">\u6301\u4ED3\u6A21\u5F0F</div><div class=\"detail-value\">' + (p.isolated ? '\u9010\u4ED3' : '\u5168\u4ED3') + '</div></div>' +\n        '<div class=\"roe-bar\">' +\n          '<div class=\"roe-bar-label\"><span>\u6536\u76CA\u7387\u8FDB\u5EA6</span><span style=\"color:' + pnlColor(p.roePct) + '\">' + pnlSign(p.roePct) + p.roePct + '%</span></div>' +\n          '<div class=\"roe-track\"><div class=\"roe-fill ' + pClass + '\" style=\"width:' + roeWidth + '%\"></div></div>' +\n        '</div>' +\n      '</div>' +\n    '</div>';\n  }).join('');\n  \n  return html;\n}\n\n// Event delegation for card clicks\ndocument.addEventListener('click', function(e) {\n  const card = e.target.closest('.pos-card');\n  if (card) {\n    const symbol = card.dataset.symbol;\n    if (symbol) {\n      toggleCard(symbol);\n    }\n  }\n});\n\n// Modal functions\nfunction showModal(type) {\n  const d = window._lastData;\n  if (!d) return;\n  \n  const rows = [];\n  \n  if (type === 'system') {\n    document.getElementById('modalTitle').textContent = '\uD83E\uDD16 \u7CFB\u7EDF\u4FE1\u606F';\n    rows.push({ label: '\u9762\u677F\u7248\u672C', value: 'v5.0 \u4E13\u4E1A\u7248' });\n    rows.push({ label: '\u6570\u636E\u5237\u65B0', value: '\u6BCF5\u79D2\u81EA\u52A8' });\n    rows.push({ label: '\u4EA4\u6613\u5E73\u53F0', value: 'Binance Futures Testnet' });\n    rows.push({ label: '\u7B56\u7565\u6A21\u5F0F', value: '3x Hedge Mode' });\n    rows.push({ label: '\u6700\u5927\u6301\u4ED3', value: '4\u4E2A\u4ED3\u4F4D' });\n    rows.push({ label: '\u521D\u59CB\u672C\u91D1', value: '$5,000 USDT' });\n    rows.push({ label: '\u8FD0\u884C\u65F6\u957F', value: ((Date.now() - startTime) / 3600000).toFixed(1) + ' \u5C0F\u65F6' });\n    document.getElementById('modalFooter').textContent = 'OpenClaw Trading Dashboard';\n  } \n  else if (type === 'balance') {\n    document.getElementById('modalTitle').textContent = '\uD83D\uDCB0 \u8D26\u6237\u4F59\u989D\u8BE6\u60C5';\n    rows.push({ label: '\u53EF\u7528\u4F59\u989D', value: '$' + d.balance, class: 'green' });\n    rows.push({ label: '\u94B1\u5305\u603B\u989D', value: '$' + d.walletBalance });\n    rows.push({ label: '\u521D\u59CB\u672C\u91D1', value: '$5,000.00' });\n    rows.push({ label: '\u6301\u4ED3\u4FDD\u8BC1\u91D1', value: '$' + (d.positions.reduce((s,p)=>s+parseFloat(p.margin),0)).toFixed(2) });\n    rows.push({ label: '\u6301\u4ED3\u6570\u91CF', value: d.posCount + ' \u4E2A' });\n    document.getElementById('modalFooter').textContent = '\u6240\u6709\u91D1\u989D\u5355\u4F4D\u5747\u4E3A USDT';\n  }\n  else if (type === 'pnl') {\n    const pClass = parseFloat(d.totalPnl) >= 0 ? 'green' : 'red';\n    document.getElementById('modalTitle').textContent = '\uD83D\uDCCA \u6301\u4ED3\u76C8\u4E8F\u8BF4\u660E';\n    rows.push({ label: '\u6301\u4ED3\u603B\u76C8\u4E8F', value: pnlSign(d.totalPnl) + '$' + d.totalPnl, class: pClass });\n    rows.push({ label: '\u5E73\u5747\u76C8\u4E8F\u7387', value: pnlSign(d.totalPnlPct) + d.totalPnlPct + '%', class: pClass });\n    rows.push({ label: '\u8BA1\u7B97\u65B9\u5F0F', value: '\u505A\u591A=(\u5F53\u524D-\u5F00\u4ED3)\u00D7\u6570\u91CF', class: '' });\n    rows.push({ label: '', value: '\u505A\u7A7A=(\u5F00\u4ED3-\u5F53\u524D)\u00D7\u6570\u91CF', class: '' });\n    document.getElementById('modalFooter').textContent = '\u4EC5\u663E\u793A\u5F53\u524D\u6301\u4ED3\u7684\u6D6E\u52A8\u76C8\u4E8F\uFF0C\u4E0D\u542B\u5DF2\u5B9E\u73B0\u76C8\u4E8F';\n  }\n  else if (type === 'account') {\n    const pClass = parseFloat(d.totalAccountPnl) >= 0 ? 'green' : 'red';\n    document.getElementById('modalTitle').textContent = '\uD83C\uDFE6 \u8D26\u6237\u603B\u76C8\u4E8F\u8BF4\u660E';\n    rows.push({ label: '\u8D26\u6237\u603B\u76C8\u4E8F', value: pnlSign(d.totalAccountPnl) + '$' + d.totalAccountPnl, class: pClass });\n    rows.push({ label: '\u76C8\u4E8F\u6BD4\u4F8B', value: pnlSign(d.totalAccountPnlPct) + d.totalAccountPnlPct + '%', class: pClass });\n    rows.push({ label: '\u8BA1\u7B97\u65B9\u5F0F', value: '\u94B1\u5305\u603B\u989D - \u521D\u59CB\u672C\u91D1', class: '' });\n    rows.push({ label: '', value: '$' + d.walletBalance + ' - $5,000', class: '' });\n    rows.push({ label: '\u5DF2\u5B9E\u73B0\u76C8\u4E8F', value: '$' + (parseFloat(d.walletBalance) - parseFloat(d.balance) - parseFloat(d.totalPnl)).toFixed(2) });\n    document.getElementById('modalFooter').textContent = '\u8D26\u6237\u603B\u76C8\u4E8F = \u5DF2\u5B9E\u73B0\u76C8\u4E8F + \u6D6E\u52A8\u76C8\u4E8F';\n  }\n  \n  document.getElementById('modalInfo').innerHTML = rows.map(r => \n    '<div class=\"modal-row\">' +\n      '<div class=\"modal-row-label\">' + r.label + '</div>' +\n      '<div class=\"modal-row-value ' + (r.class || '') + '\">' + r.value + '</div>' +\n    '</div>'\n  ).join('');\n  \n  document.getElementById('modalOverlay').classList.add('show');\n}\n\nfunction closeModal() {\n  document.getElementById('modalOverlay').classList.remove('show');\n}\n\n// Load data\nasync function load() {\n  try {\n    const r = await fetch('/api/status');\n    const d = await r.json();\n    window._lastData = d;\n    \n    if (d.error) {\n      document.getElementById('balance').textContent = '\u9519\u8BEF';\n      return;\n    }\n    \n    const pnl = parseFloat(d.totalPnl);\n    const accPnl = parseFloat(d.totalAccountPnl);\n    \n    // Balance\n    document.getElementById('balance').textContent = '$' + d.balance;\n    \n    // Position PnL\n    const posPnlEl = document.getElementById('posPnl');\n    posPnlEl.textContent = (pnl >= 0 ? '+$' : '-$') + Math.abs(pnl).toFixed(2);\n    posPnlEl.className = 'stat-value ' + (pnl >= 0 ? 'green' : 'red');\n    document.getElementById('posPnlPct').textContent = (pnl >= 0 ? '+' : '') + d.totalPnlPct + '%';\n    document.getElementById('cardPosPnl').className = 'stat-card ' + (pnl >= 0 ? 'green' : 'red');\n    \n    // Account PnL\n    const accPnlEl = document.getElementById('accPnl');\n    accPnlEl.textContent = (accPnl >= 0 ? '+$' : '-$') + Math.abs(accPnl).toFixed(2);\n    accPnlEl.className = 'stat-value ' + (accPnl >= 0 ? 'green' : 'red');\n    document.getElementById('accPnlPct').textContent = (accPnl >= 0 ? '+' : '') + d.totalAccountPnlPct + '%';\n    document.getElementById('cardAccPnl').className = 'stat-card ' + (accPnl >= 0 ? 'green' : 'red');\n    \n    // Position count\n    document.getElementById('posCount').textContent = d.posCount + '/4';\n    \n    // Market change\n    if (d.positions.length > 0) {\n      const avgChange = d.positions.reduce((s,p) => s + parseFloat(p.change24h), 0) / d.positions.length;\n      const changeEl = document.getElementById('marketChange');\n      changeEl.textContent = (avgChange >= 0 ? '+' : '') + avgChange.toFixed(2) + '%';\n      changeEl.className = 'stat-value ' + (avgChange >= 0 ? 'green' : 'red');\n    }\n    \n    // Running time\n    document.getElementById('runningHours').textContent = ((Date.now() - startTime) / 3600000).toFixed(1);\n    \n    // Positions\n    document.getElementById('positions').innerHTML = renderPositions(d.positions);\n    \n    // Clock\n    document.getElementById('clock').textContent = formatTime(Date.now());\n    \n    countdown = REFRESH;\n  } catch(e) {\n    console.error('Load error:', e);\n  }\n}\n\nfunction tick() {\n  countdown--;\n  document.getElementById('clock').textContent = formatTime(Date.now());\n  document.getElementById('refreshBar').style.width = ((REFRESH - countdown) / REFRESH * 100) + '%';\n  if (countdown <= 0) load();\n  setTimeout(tick, 1000);\n}\n\nload();\ntick();\n</script>\n</body>\n</html>";
var server = http.createServer(function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var data, e_2;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                if (!(req.url === '/api/status')) return [3 /*break*/, 5];
                _a.label = 1;
            case 1:
                _a.trys.push([1, 3, , 4]);
                return [4 /*yield*/, getData()];
            case 2:
                data = _a.sent();
                res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
                res.end(JSON.stringify(data));
                return [3 /*break*/, 4];
            case 3:
                e_2 = _a.sent();
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: e_2.message }));
                return [3 /*break*/, 4];
            case 4: return [3 /*break*/, 6];
            case 5:
                res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                res.end(HTML);
                _a.label = 6;
            case 6: return [2 /*return*/];
        }
    });
}); });
server.on('error', function (e) { console.error('Server error:', e.code); });
server.listen(9999, function () { return console.log('✅ Dashboard at http://localhost:9999'); });
setInterval(function () { }, 1000);
