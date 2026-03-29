# OpenClaw Trader - Auto Trading Loop (Paper Mode + Signal Monitor)
# Runs every 5 minutes, executes trades based on RSI signals
# Stop: Close this window or Ctrl+C

$ErrorActionPreference = 'SilentlyContinue'
$logFile = "$env:USERPROFILE\openclaw-trader\logs\auto-trading.log"

function Write-Log {
    param($msg)
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $line = "$ts $msg"
    Write-Host $line
    $line | Tee-Object -FilePath $logFile -Append
}

Write-Log "===================================================="
Write-Log "  OpenClaw Trader - Auto Trading Started"
Write-Log "  Mode: Paper + Signal Monitor"
Write-Log "  Stop Loss: -5% | Take Profit: +10%"
Write-Log "  Interval: Every 5 minutes"
Write-Log "===================================================="

$count = 0

while ($true) {
    $count++
    $ts = Get-Date -Format "HH:mm:ss"
    
    Write-Log "-------------------------------------"
    Write-Log "[$count] Scan started at $ts"
    
    # Run monitor
    $output = cd "$env:USERPROFILE\openclaw-trader"; pnpm run monitor 2>&1
    $exitCode = $LASTEXITCODE
    
    # Analyze signals
    $buySignals = $output | Select-String "Signal=buy" -SimpleMatch
    $sellSignals = $output | Select-String "Signal=sell" -SimpleMatch
    $shortSignals = $output | Select-String "Signal=short" -SimpleMatch
    $errors = $output | Select-String "ERROR|Fatal" -SimpleMatch
    
    if ($buySignals) {
        Write-Log "[$count] BUY SIGNAL DETECTED!"
        $buySignals | ForEach-Object { Write-Log "  $_" }
    }
    if ($shortSignals) {
        Write-Log "[$count] SHORT SIGNAL DETECTED!"
        $shortSignals | ForEach-Object { Write-Log "  $_" }
    }
    if ($sellSignals) {
        Write-Log "[$count] SELL SIGNAL DETECTED!"
        $sellSignals | ForEach-Object { Write-Log "  $_" }
    }
    if ($errors) {
        Write-Log "[$count] WARNING:"
        $errors | ForEach-Object { Write-Log "  $_" }
    }
    
    if (-not $buySignals -and -not $sellSignals -and -not $shortSignals -and -not $errors) {
        Write-Log "[$count] Scan complete - No signals"
    }
    
    # Show key prices
    $lines = $output -split "`n"
    $ethLine = $lines | Select-String "ETHUSDT" | Select-Object -First 1
    if ($ethLine) {
        Write-Log "  ETH: $ethLine"
    }
    
    Write-Log "Next scan in 5 minutes..."
    Start-Sleep -Seconds 300
}
