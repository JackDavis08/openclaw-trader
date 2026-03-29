# Intelligent Trading System v4.3 - 整合版

## 版本历史

| 版本 | 日期 | 更新内容 |
|------|------|---------|
| v4.0 | 2026-03-28 | 初始整合版：gcmsg/openclaw-trader + ITS v3.6 |
| v4.1 | 2026-03-29 | 币种池扩展至10个、持仓增至5个、4x杠杆 |
| v4.2 | 2026-03-29 | 整合回测引擎+优化器+分析模块 |
| **v4.3** | **2026-03-29** | **简化信号条件：关闭成交量+MACD确认，保留MA+RSI核心** |

---

## v4.3 升级内容（2026-03-29）

### 问题背景
系统上线后一直没有触发交易，原因是信号条件过于严格：
- 原配置：需要6个条件全部满足（MA + RSI + 成交量1.5x + MACD）
- 成交量要求 >1.5x，但实际市场只有平均的36%-68%
- 导致信号几乎无法触发

### 解决方案
参考 gcmsg 原始设计，简化信号条件：

**旧配置（6个条件）：**
```yaml
buy:
  - ma_bullish
  - rsi_not_overbought
  - volume_confirmed      # ❌ 关闭
  - macd_bullish          # ❌ 关闭
short:
  - ma_bearish
  - rsi_not_oversold
  - volume_confirmed     # ❌ 关闭
  - macd_bearish         # ❌ 关闭
```

**新配置（2个条件）：**
```yaml
buy:
  - ma_bullish           # EMA20 > EMA60
  - rsi_not_overbought  # RSI < 70
short:
  - ma_bearish           # EMA20 < EMA60
  - rsi_not_oversold    # RSI > 30
```

### 参数变更
| 参数 | v4.2 | v4.3 |
|------|------|------|
| 成交量确认 | >1.5x | **关闭** |
| MACD确认 | 启用 | **关闭** |
| 信号数量 | 6个条件 | **2个条件** |

---

## v4.2 升级内容（2026-03-29）

### 新增功能模块
- 回测引擎 (src/backtest): runner, metrics, walk-forward, attribution
- 优化器 (src/optimization): adaptive, bayesian, bandit, auto-wf
- 分析模块 (src/analysis): signal-stats, trade-collector, attribution

### Bug修复
- account.ts: Windows文件名冒号bug
- live-monitor.ts: Windows import.meta.url路径bug
- CVD WebSocket临时禁用

---

## v4.1 升级内容（2026-03-29）

### 参数调整
- 币种池：6个 → 10个
- 最大持仓：3个 → 5个
- 仓位比例：20%（3x杠杆）→ 25%（4x杠杆）

### 新增功能
1. min_rr (盈亏比过滤) - R:R >= 1.5
2. minimal_roi (时间衰减止盈)
3. regime_overrides (市场自适应)
4. protections (保护机制)
5. trailing_stop_positive_offset
6. correlation_filter (相关性过滤)
7. btc_hedge (BTC对冲保护)
8. 分批止盈 (take_profit_1 + take_profit_2)

---

## 核心参数（v4.3）

| 参数 | 值 |
|------|------|
| 止盈 | 分批 1.5% + 2.5% |
| 止损 | 0.5% (固定) |
| 持仓超时 | 30分钟 |
| 仓位比例 | 25%（4x杠杆） |
| 最大持仓 | 5个 |
| 最低持仓 | 2个 |
| 杠杆 | 4x |
| RSI | 30/70 |

---

## 入场条件（v4.3 - 简化版）

### 做多（2个条件）
- EMA20 > EMA60（4h趋势向上）
- RSI < 70（未超买）

### 做空（2个条件）
- EMA20 < EMA60（4h趋势向下）
- RSI > 30（未超卖）

---

## 交易币种（v4.3 - 10个）

```
BTCUSDT | ETHUSDT | BNBUSDT | SOLUSDT | ADAUSDT | AVAXUSDT | MATICUSDT | DOGEUSDT | DOTUSDT | XRPUSDT
```

---

## NPM 命令

```bash
# 交易
npm run live -- --scenario=futures-long-short   # 实盘交易

# 回测
npm run backtest                    # 运行回测
npm run backtest:compare            # 对比回测

# 优化
npm run hyperopt                    # 超参数优化
npm run auto-wf                     # 自动Walk-forward
npm run adaptive:status             # 查看自适应参数状态

# 分析
npm run analysis                    # 市场分析
npm run signal-stats               # 信号统计
npm run attribution                 # 归因分析
npm run drift                       # 漂移监控
```

---

## 预期收益
- 胜率: ~40%
- 日收益: ~2.2%
- 月收益: ~91% (复利)
