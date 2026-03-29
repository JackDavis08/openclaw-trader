# OpenClaw Trader - 每5分钟自动监控
# 使用方法: .\run-monitor-loop.ps1
# 停止方法: 按 Ctrl+C 或关闭此窗口

$ErrorActionPreference = 'SilentlyContinue'
$logFile = "$env:USERPROFILE\openclaw-trader\logs\auto-monitor.log"

function Write-Log {
    param($msg)
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    "$ts $msg" | Tee-Object -FilePath $logFile -Append
}

Write-Log "🚀 自动监控启动 (每5分钟)"
Write-Log "📊 策略: RSI 超卖买入(RSI<35), 超买卖出(RSI>65)"
Write-Log "💰 止损: -5%, 止盈: +10%"
Write-Log "────────────────────────────────────"

$count = 0
while ($true) {
    $count++
    $ts = Get-Date -Format "HH:mm:ss"
    Write-Log "[$count] ⏰ $ts - 执行监控..."
    
    try {
        $output = cd "$env:USERPROFILE\openclaw-trader"; pnpm run monitor 2>&1
        $exitCode = $LASTEXITCODE
        
        # 检查是否有交易信号
        if ($output -match "Signal=buy|Signal=BUY") {
            Write-Log "🚨 [$count] ✅ 发现买入信号!"
        }
        if ($output -match "Signal=sell|Signal=SELL") {
            Write-Log "🚨 [$count] 🔴 卖出信号!"
        }
        if ($output -match "ERROR|error|Fatal") {
            Write-Log "⚠️ [$count] 运行异常"
        } else {
            Write-Log "✅ [$count] 扫描完成"
        }
    } catch {
        Write-Log "❌ [$count] 执行失败: $_"
    }
    
    Write-Log "⏸️ 等待5分钟... (Ctrl+C 停止)"
    Start-Sleep -Seconds 300
}
