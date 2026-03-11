# Web 仪表盘路线图

> openclaw-trader 全功能交易平台 UI。Next.js 15 + shadcn/ui + TanStack Query。

---

## Phase 1 — 基础（脚手架与核心页面）✅

- [x] 搭建 `web/` Next.js 15 项目（App Router、TypeScript、Tailwind）
- [x] 配置 `@shared/*` 别名 + API 代理重写到后端 :8080
- [x] 深色交易主题（slate-900 背景，emerald/red/sky 强调色）
- [x] shadcn/ui 基础组件（button、card、table、tabs、badge、dialog 等）
- [x] 提取共享 API 类型到 `src/web/api-types.ts`
- [x] `lib/api-client.ts` — fetch 封装，含 base URL + 错误处理
- [x] TanStack Query hooks 对接各端点
- [x] 根布局：侧边栏 + 顶栏框架，QueryClientProvider
- [x] 连接状态：轮询 `/api/health`，绿/红徽章指示
- [x] **Dashboard 页面** — KPI 卡片、权益曲线、持仓卡片、最近交易
- [x] **持仓页面** — 可排序表格（symbol、方向、数量、入场价、浮动盈亏、止损/止盈）
- [x] **交易历史页面** — 分页、可筛选、CSV 导出
- [x] 更新根 `package.json` 脚本 + `.gitignore`

## Phase 2 — 只读高级页面 ✅

- [x] **绩效页面** — Sharpe、Sortino、Calmar、最大回撤、盈利因子、每日盈亏柱状图、按 symbol 细分
- [x] **信号页面** — 信号历史表格，含类型徽章
- [x] **健康页面** — health-snapshot.json 可视化、实时日志查看器
- [x] **报告页面** — 周报视图、信号归因表
- [x] 后端：扩展 `buildPerfData()` 含风险指标，新增 `GET /api/health/snapshot`、`GET /api/reports/weekly`

## Phase 3 — 交互功能（Mutations）✅

- [x] 后端：异步处理器、方法路由（POST/PUT）、`parseBody()` 辅助、`matchRoute()`、OPTIONS/CORS
- [x] `GET /api/kill-switch` + `PUT /api/kill-switch` — 读取与切换 Kill Switch
- [x] `GET /api/price/:symbol` — 单个 symbol 价格查询
- [x] `POST /api/positions/:symbol/close` — 以市价调用 paperSell/paperCoverShort 平仓
- [x] `PUT /api/positions/:symbol/stop-loss` — 调整止损，含验证
- [x] `POST /api/manual-trade` — 开仓，含 Kill Switch / 余额 / 重复检查
- [x] 持仓页面："平仓"按钮 + "调整止损"对话框
- [x] **手动交易页面** — 下单表单、实时价格预览、确认对话框
- [x] 健康页面：Kill Switch 卡片，含激活/停用开关

## Phase 4 — 策略与配置管理 ✅

- [x] `GET /api/strategies` — 列出策略 profile + 关联场景 + 插件信息
- [x] `GET /PUT /api/config/raw/:file` — 读写 YAML，含验证 + `.bak` 备份
- [x] `GET /PUT /api/config/raw/strategies/:file` — 读写策略 profile YAML
- [x] `PUT /api/scenarios/:id/toggle` — 逐行切换，保留 YAML 注释
- [x] **策略页面** — 响应式卡片网格、插件徽章、场景 Switch 开关
- [x] **配置页面** — 3 个标签页（全局策略 / Paper 场景 / 策略 Profile），等宽 YAML 编辑器，保存含确认对话框、还原、验证错误
- [x] 导航：侧边栏和顶栏新增策略 + 配置入口

## Phase 5 — 回测 UI ✅

- [x] `POST /api/backtest/run` — 拉取 K 线 + 执行回测 + 保存 JSON 报告
- [x] `GET /api/backtest/results` — 列出已保存的结果摘要
- [x] `GET /api/backtest/results/:id` — 读取回测结果详情
- [x] **回测页面** — 运行表单（策略、天数、时间周期、symbols、点差、next-open），已保存结果表格，详情视图含指标 + SVG 权益曲线 + 交易表 + 按 symbol 细分 + 退出原因柱状图

## Phase 6 — 打磨与生产化 ✅

- [x] 错误边界（全局 + 回测）+ 404 页面
- [x] 月度盈亏日历热力图（纯 CSS 网格，最近 3 个月）
- [x] 可选基本认证（`DASHBOARD_AUTH=user:pass`）
- [x] `DayPerf` 日期格式 → `YYYY-MM-DD`（柱状图 XAxis 自动格式化为 `MM/DD`）
- [x] 表格移动端滚动渐变提示（Tailwind `after:` 渐变）

## Future — 延后 / 锦上添花

- [ ] 信号管线可视化（15 阶段流程图）
- [ ] 执行偏差分析视图
- [ ] 策略对比：并排两组回测对比
- [ ] WebSocket 升级实现实时更新
- [ ] 生产构建文档（Docker、反向代理）

---

## 技术栈

| 层级 | 选型 |
|------|------|
| 框架 | Next.js 15（App Router），React 19 |
| UI | shadcn/ui + TailwindCSS |
| 图表（金融） | lightweight-charts v4 |
| 图表（统计） | recharts |
| 服务端状态 | TanStack Query v5 |
| 图标 | lucide-react |
| 后端 | 原生 http.createServer（已有） |

## 轮询策略

| 查询 | 间隔 |
|------|------|
| Dashboard 数据 | 10 秒 |
| 价格 | 5 秒 |
| 日志 | 5 秒 |
| 健康检查 | 30 秒 |
| 绩效 | 60 秒 |
| 策略/配置 | 手动 |
