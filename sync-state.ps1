# Sync auto-trader state to dashboard
# Updates dashboard state files every 30 seconds
$ErrorActionPreference = 'SilentlyContinue'

function Get-FuturesPositions {
    param($creds)
    $timestamp = [DateTimeOffset]::Now.ToUnixTimeMilliseconds()
    $query = "timestamp=$timestamp"
    $sig = (New-Object System.Security.Cryptography.HMACSHA256).ComputeText([Text.Encoding]::ASCII.GetBytes($creds.secretKey)).Digest
    $sigB64 = [Convert]::ToBase64String($sig)
    
    try {
        $resp = Invoke-RestMethod -Uri "https://testnet.binancefuture.com/fapi/v2/positionRisk?timestamp=$timestamp&signature=$sigB64" -Headers @{"X-MBX-APIKEY"=$creds.apiKey} -Method GET -TimeoutSec 10
        return $resp | Where-Object { [double]$_.positionAmt -ne 0 }
    } catch { return @() }
}

function Get-FuturesBalance {
    param($creds)
    $timestamp = [DateTimeOffset]::Now.ToUnixTimeMilliseconds()
    $query = "timestamp=$timestamp"
    $sig = (New-Object System.Security.Cryptography.HMACSHA256).ComputeText([Text.Encoding]::ASCII.GetBytes($creds.secretKey)).Digest
    $sigB64 = [Convert]::ToBase64String($sig)
    
    try {
        $resp = Invoke-RestMethod -Uri "https://testnet.binancefuture.com/fapi/v2/balance?timestamp=$timestamp&signature=$sigB64" -Headers @{"X-MBX-APIKEY"=$creds.apiKey} -Method GET -TimeoutSec 10
        $usdt = $resp | Where-Object { $_.asset -eq "USDT" }
        return [double]($usdt.availableBalance -replace ',','.')
    } catch { return 0 }
}

$FUTURES_CREDS = @{
    apiKey = "rLS9djClUheJUJcqkUFGOylwCuSk1wVkdJMoHXN2TgfswhjBCsOPvh0202vBhAAN"
    secretKey = "EMu9DnZL7DSodz7dSkkSslVC9AtzUGQgQH4a4b9g19CysZdPO73udtnt1gTZjF7Y"
}

$STATE_FILE = "$env:USERPROFILE\openclaw-trader\state\aggressive-futures-3x.json"
$LOG_FILE = "$env:USERPROFILE\openclaw-trader\logs\sync.log"

Write-Host "State sync started. Writing to: $STATE_FILE"

while ($true) {
    try {
        $balance = Get-FuturesBalance -creds $FUTURES_CREDS
        $positions = Get-FuturesPositions -creds $FUTURES_CREDS
        
        $state = @{
            updatedAt = [DateTimeOffset]::Now.ToUnixTimeMilliseconds()
            balance = $balance
            positions = @{}
        }
        
        foreach ($p in $positions) {
            $sym = $p.symbol
            $amt = [double]$p.positionAmt
            $entry = [double]$p.entryPrice
            $unrPnl = [double]$p.unrealizedProfit
            $side = if ($amt -gt 0) { "long" } else { "short" }
            
            $state.positions.$sym = @{
                side = $side
                qty = [Math]::Abs($amt)
                entryPrice = $entry
                currentPrice = $entry
                unrealizedPnl = $unrPnl
                stopLoss = 0
                scenarioId = "aggressive-futures-3x"
            }
        }
        
        # Write state file
        $dir = Split-Path $STATE_FILE -Parent
        if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
        $state | ConvertTo-Json -Depth 5 | Set-Content $STATE_FILE -Encoding UTF8
        
        $ts = Get-Date -Format "HH:mm:ss"
        $posCount = $positions.Count
        Write-Host "[$ts] Sync OK - Balance: $${balance:F2}, Positions: $posCount"
    } catch {
        $ts = Get-Date -Format "HH:mm:ss"
        Write-Host "[$ts] Sync error: $_"
    }
    
    Start-Sleep -Seconds 30
}
