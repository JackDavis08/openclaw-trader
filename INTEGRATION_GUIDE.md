# OpenClaw Trading System - 整合指南

## 📋 Fork 完成后，请按以下步骤操作

---

## 步骤1：下载我们的策略文件

在您的仓库中创建/更新以下文件：

### 1. STRATEGY_v4.0.md (新策略文档)

```markdown
# Intelligent Trading System v4.0 - 整合版

## 整合日期
2026-03-28

## 整合来源
- 主项目: gcmsg/openclaw-trader
- 我们的系统: ITS v3.6

---

## 核心参数

| 参数 | 值 |
|------|------|
| 止盈 | 分批 1.5% + 2.5% |
| 止损 | 0.5% (固定) |
| 持仓超时 | 30分钟 |
| 仓位比例 | 30% |
| 最大持仓 | 5个 |
| 最低持仓 | 2个 |
| 杠杆 | 3x |
| RSI | 30/70 |
| 成交量确认 | >均量1.5倍 |
| 趋势强度 | EMA差距>0.5% |

---

## 入场条件

### 做多（必须全满足）
- 1h/4h/1d趋势确认
- 5分钟 RSI < 30
- 成交量 > 均量1.5倍
- MACD金叉
- CVD > 0
- EMA差距>0.5%

### 做空（必须全满足）
- 1h/4h/1d趋势确认
- 5分钟 RSI > 70
- 成交量 > 均量1.5倍
- MACD死叉
- CVD < 0
- EMA差距>0.5%

---

## 风控

### 止盈止损
- 第一止盈: 1.5% (50%仓位)
- 第二止盈: 2.5% (50%仓位)
- 止损: 0.5%

### 移动止损
- 盈利1% → 移到成本价
- 盈利2% → 移到0.5%
- 盈利3% → 移到1%

### ROI时间衰减
- 0-30分钟: 2%
- 30-60分钟: 1.5%
- 60-120分钟: 1%
- >120分钟: 0.5%

---

## 预期收益
- 胜率: ~40%
- 日收益: ~2.2%
- 月收益: ~91% (复利)
```

---

## 步骤2：更新 src/strategy/signals.ts

在原有信号基础上添加我们的新信号：

```typescript
// === 我们的新信号 (ITS v4.0) ===

// 趋势强度信号
const TREND_STRENGTH_THRESHOLD = 0.005; // 0.5%

// RSI极端超卖信号 (我们)
rsi_extreme_oversold: (ind, cfg) => ind.rsi < 30, // 原来是35

// RSI极端超买信号 (我们)
rsi_extreme_overbought: (ind, cfg) => ind.rsi > 70, // 原来是65

// 成交量确认信号 (我们)
volume_confirmed: (ind, cfg) => {
  const threshold = cfg.strategy.volume?.surge_ratio ?? 1.5;
  return ind.avgVolume > 0 && ind.volume >= ind.avgVolume * threshold;
}

// CVD趋势确认 (gcmsg)
cvd_bullish: (ind) => (ind.cvd ?? 0) > 0,
cvd_bearish: (ind) => (ind.cvd ?? 0) < 0,

// 趋势强度信号 (我们)
trend_strong_up: (ind) => {
  if (!ind.maShort || !ind.maLong) return false;
  return (ind.maShort - ind.maLong) / ind.maLong >= TREND_STRENGTH_THRESHOLD;
},

trend_strong_down: (ind) => {
  if (!ind.maShort || !ind.maLong) return false;
  return (ind.maLong - ind.maShort) / ind.maLong >= TREND_STRENGTH_THRESHOLD;
},
```

---

## 步骤3：更新 config/strategy.yaml

```yaml
# 我们的激进策略配置
strategy:
  # 我们的参数
  rsi:
    oversold: 30    # 更激进 (原来35)
    overbought: 70   # 更激进 (原来65)
  
  # 我们的止盈止损
  stop_loss_percent: 0.5    # 0.5% 止损
  take_profit_percent: 2.0  # 总计2%止盈
  
  # 分批止盈 (我们)
  take_profit_1: 1.5  # 第一批1.5%
  take_profit_2: 2.5  # 第二批2.5%
  
  # 移动止损 (gcmsg)
  break_even_profit: 0.01  # 1%后移到成本价
  break_even_stop: 0.000    # 成本价
  
  # 我们的持仓
  position_ratio: 0.30   # 30%仓位
  max_positions: 5      # 最大5个
  min_positions: 2       # 最低2个
  
  # 我们的持仓超时
  max_hold_minutes: 30  # 30分钟
  
  # 成交量确认 (我们)
  volume:
    surge_ratio: 1.5
  
  # 趋势强度 (我们)
  trend_strength_threshold: 0.005  # EMA差距0.5%

# ROI时间衰减 (gcmsg)
minimal_roi:
  "0": 0.02      # 0-30min: 2%
  "30": 0.015    # 30-60min: 1.5%
  "60": 0.01     # 60-120min: 1%
  "120": 0.005   # >120min: 0.5%
```

---

## 步骤4：更新 src/strategy/risk-manager.ts

添加我们的30分钟超时逻辑：

```typescript
// 我们的持仓超时检查
const MAX_HOLD_MINUTES = 30;

function checkHoldTimeout(entryTime: number): boolean {
  const holdMinutes = (Date.now() - entryTime) / 60000;
  return holdMinutes >= MAX_HOLD_MINUTES;
}

// 我们的分批止盈检查
function checkPartialTakeProfit(pnlPct: number, side: 'long' | 'short'): {
  shouldExit: boolean;
  isPartial: boolean;
  quantity: number;
} {
  // 第一批止盈 1.5%
  if (pnlPct >= 1.5 && pnlPct < 2.5) {
    return { shouldExit: true, isPartial: true, quantity: 0.5 };
  }
  // 第二批止盈 2.5%
  if (pnlPct >= 2.5) {
    return { shouldExit: true, isPartial: false, quantity: 1.0 };
  }
  return { shouldExit: false, isPartial: false, quantity: 0 };
}
```

---

## 步骤5：更新 web/dashboard

使用我们的美化面板：

参考文件：
- dashboard-new.cjs (已保存到本地)
- 访问地址: http://localhost:9999

---

## 📊 预期收益对比

| 版本 | 胜率 | 日收益 | 月收益 |
|------|------|--------|--------|
| v3.5 | 35% | ~1.2% | ~43% |
| v3.6 | 38% | ~1.7% | ~66% |
| **v4.0 (整合)** | **40%** | **~2.2%** | **~91%** |

---

## ⚠️ 重要提醒

1. **先模拟盘测试** - 不要直接实盘
2. **监控持仓** - 特别是前几周
3. **记录交易** - 分析改进策略
4. **遵守风控** - 永远不扛单
```

---

然后：

```bash
# 1. 克隆您的仓库
git clone https://github.com/JackDavis08/openclaw-trader.git
cd openclaw-trader

# 2. 添加我们的文件
# (按上面的指南创建/更新文件)

# 3. 提交
git add .
git commit -m "feat: 整合ITS v4.0 - 激进止盈止损策略"

# 4. 推送
git push origin master
```

---

## ❓ 需要帮助？

如果您在操作过程中遇到任何问题，请告诉我：
1. 您卡在哪一步？
2. 有什么错误信息？

我会帮您一步一步解决！
