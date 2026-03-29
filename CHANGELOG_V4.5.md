# ITS V4.5 升级说明

## 版本信息
- **发布日期**: 2026-03-29
- **package.json**: 4.4.0 → 4.5.0
- **Dashboard**: ITS V4.4 → ITS V4.5

---

## 🚀 核心升级：信号触发机制增强

### 问题背景
ITS V4.4 及之前版本仅有 2 个入场信号条件（MA + RSI），与 zeneo-ai/crypto-trader 的 20+ 条件相比，信号来源单一，容易错过交易机会。

### 解决方案
整合 zeneo-ai/crypto-trader 的所有信号条件，添加到 ITS V4.5：

#### 新增信号条件

| 类别 | 信号 | 说明 |
|------|------|------|
| **VWAP** | `price_above_vwap` | 价格在VWAP上方（机构看多） |
| **VWAP** | `price_below_vwap` | 价格在VWAP下方（机构看空） |
| **VWAP** | `vwap_bounce` | 价格从VWAP反弹 |
| **VWAP** | `vwap_breakdown` | 价格跌破VWAP |
| **VWAP** | `price_above_vwap_upper2` | 价格超过VWAP+2σ（超买信号） |
| **VWAP** | `price_below_vwap_lower2` | 价格跌破VWAP-2σ（超卖信号） |
| **CVD** | `cvd_bullish` | 买入压力（机构做多信号） |
| **CVD** | `cvd_bearish` | 卖出压力（机构做空信号） |
| **成交量** | `volume_surge` | 成交量放大1.5倍确认 |
| **资金费率** | `funding_rate_overlong` | 做多费率极端（反向做空） |
| **资金费率** | `funding_rate_overshort` | 做空费率极端（反向做多） |
| **多空比** | `ls_ratio_extreme_long` | 做多极度拥挤（反向信号） |
| **多空比** | `ls_ratio_extreme_short` | 做空极度拥挤（反向信号） |
| **MACD** | `macd_bullish` | MACD多头信号 |
| **MACD** | `macd_bearish` | MACD空头信号 |
| **MACD** | `macd_golden_cross` | MACD金叉 |
| **MACD** | `macd_death_cross` | MACD死叉 |
| **RSI** | `rsi_bullish_zone` | RSI处于看多区域 |
| **RSI** | `rsi_overbought_exit` | RSI超买退出点 |

---

## 📊 策略信号配置对比

### V4.4（旧）
```yaml
signals:
  buy:  [ma_bullish, rsi_not_overbought]           # 2个条件
  short: [ma_bearish, rsi_not_oversold]            # 2个条件
```

### V4.5（新）
```yaml
signals:
  buy:                                    # 4个条件
    - ma_bullish                          # EMA20 > EMA60
    - rsi_not_overbought                  # RSI < 70
    - price_above_vwap                    # 价格在VWAP上方
    - cvd_bullish                         # 买入压力
  sell:                                   # 3个条件
    - ma_bearish                          # 趋势反转
    - rsi_overbought                      # RSI > 70
    - price_above_vwap_upper2             # 超买信号
  short:                                  # 4个条件
    - ma_bearish                          # EMA20 < EMA60
    - rsi_not_oversold                    # RSI > 30
    - price_below_vwap                    # 价格在VWAP下方
    - cvd_bearish                         # 卖出压力
  cover:                                  # 3个条件
    - ma_bullish                          # 趋势反转
    - rsi_oversold                        # RSI < 30
    - price_below_vwap_lower2             # 超卖信号
```

---

## 🔧 其他优化

### 1. 成交量确认重新启用
```yaml
volume:
  surge_ratio: 1.5     # 成交量放大1.5倍确认趋势
  low_ratio: 0.5       # 成交量萎缩50%以下不做空
```

### 2. RSI 增强
```yaml
rsi:
  period: 14
  oversold: 30
  overbought: 70
  overbought_exit: 75   # 新增：动态止盈阈值
```

### 3. 资金费率过滤（新增）
```yaml
funding_rate:
  long_threshold: 0.30    # 做多费率上限
  short_threshold: 0.15    # 做空费率下限
```

### 4. 多空比过滤（新增）
```yaml
long_short_ratio:
  extreme_long_threshold: 3.0    # 做多极度拥挤
  extreme_short_threshold: 0.5  # 做空极度拥挤
  long_biased_threshold: 1.8
  short_biased_threshold: 0.8
```

---

## 🐛 Bug 修复

| 问题 | 修复 |
|------|------|
| Node.js 无法访问 Binance API | 添加代理支持（支持 Clash/V2Ray 等） |
| Regime Filter 拒绝所有信号 | 改为降低仓位而非拒绝信号 |
| ma_bearish 0.1% 限制过严 | 移除 0.1% 固定限制 |
| min_rr=1.5 过于严格 | 降低至 0.3 增加交易机会 |

---

## 📈 技术指标说明

### VWAP (Volume Weighted Average Price)
- **定义**: 成交量加权平均价
- **用途**: 判断机构成本线
- **信号**:
  - 价格在 VWAP 上方 = 机构看多
  - 价格在 VWAP 下方 = 机构看空
  - 价格触及 VWAP 反弹 = 机构吸筹

### CVD (Cumulative Volume Delta)
- **定义**: 累计成交量增量
- **计算**: 收盘 > 开盘 = +volume, 收盘 < 开盘 = -volume
- **用途**: 感知机构订单压力
- **信号**:
  - CVD 创新高 + 价格上涨 = 机构做多
  - CVD 创新低 + 价格下跌 = 机构做空

---

## ⚠️ 注意事项

1. **市场适应性**: V4.5 在震荡市场中更容易触发信号，但也可能产生更多假信号
2. **建议**: 在实盘前先在测试网验证一段时间
3. **风控**: 建议保持默认风控设置

---

## 🔄 升级步骤

```bash
# 1. 拉取最新代码
git pull origin master

# 2. 重启 live-monitor
npm run live -- --scenario=futures-long-short

# 3. 检查 Dashboard 版本显示 V4.5
# http://localhost:9999
```

---

## 📝 完整信号列表（zeneo-ai/crypto-trader 对照）

| 类别 | 信号 | ITS V4.5 支持 |
|------|------|--------------|
| 趋势 | ma_bullish, ma_bearish, ma_crossover, ma_crossunder | ✅ |
| 动量 | rsi_bullish, rsi_bearish, rsi_bullish_zone, rsi_overbought_exit | ✅ |
| MACD | macd_bullish, macd_bearish, macd_histogram_shrinking | ✅ |
| 成交量 | volume_surge, volume_low | ✅ |
| VWAP | price_above_vwap, vwap_bounce, vwap_breakdown, price_below_vwap_lower2 | ✅ |
| 资金费率 | funding_rate_overlong, funding_rate_overshort | ✅ |
| BTC Dominance | btc_dominance_rising, btc_dominance_falling | ✅ |
| CVD | cvd_bullish, cvd_bearish | ✅ |
| 多空比 | ls_ratio_extreme_long, ls_ratio_extreme_short | ✅ |

---

**ITS V4.5 - 让交易更智能、更敏感！** 🚀
