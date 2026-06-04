# WholesaleOS - Self-healing tunnel + webhook auto-sync
# ------------------------------------------------------------------
# Starts a Cloudflare quick tunnel to the app, writes its public URL into .env,
# and re-points the Twilio inbound-SMS webhook to it automatically.
# If the tunnel ever drops, it restarts and re-syncs the brand-new URL, so
# seller replies keep reaching the app's AI responder with zero manual steps.
#
#   Run manually:        npm run tunnel:auto
#   Auto-start on logon: npm run tunnel:install   (registers a Scheduled Task)
#
# Keeps running in the foreground (Ctrl+C to stop). This is by design - it
# supervises the tunnel for the whole session.

$ErrorActionPreference = "Stop"
$projectDir = Split-Path -Parent $PSScriptRoot
Set-Location $projectDir

$envPath = Join-Path $projectDir ".env"
$logDir  = Join-Path $env:TEMP "wholesaleos-tunnel"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

# Only one tunnel should run at a time. Clear any stray cloudflared from a
# previous/crashed run so it can't hold log files or duplicate the tunnel.
Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

# Locate cloudflared (local exe preferred, then PATH, else download)
function Get-Cloudflared {
    $local = Join-Path $projectDir "cloudflared.exe"
    if (Test-Path $local) { return $local }
    $cmd = Get-Command cloudflared -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    Write-Host "Downloading cloudflared..." -ForegroundColor Yellow
    $dl = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe"
    Invoke-WebRequest -Uri $dl -OutFile $local -UseBasicParsing
    return $local
}

# Replace (or append) PUBLIC_WEBHOOK_URL in .env.
# Read AND write as UTF-8 (no BOM) so non-ASCII comments are preserved byte-for-byte.
function Update-EnvUrl([string]$url) {
    $line = 'PUBLIC_WEBHOOK_URL="' + $url + '"'
    $utf8 = New-Object System.Text.UTF8Encoding($false)
    $lines = @()
    $found = $false
    if (Test-Path $envPath) {
        foreach ($l in [System.IO.File]::ReadAllLines($envPath, $utf8)) {
            if ($l -match '^\s*PUBLIC_WEBHOOK_URL\s*=') { $lines += $line; $found = $true }
            else { $lines += $l }
        }
    }
    if (-not $found) { $lines += $line }
    [System.IO.File]::WriteAllLines($envPath, $lines, $utf8)
}

# Re-point Twilio's inbound SMS webhook (reads the freshly-updated .env)
function Sync-Webhook {
    Write-Host "  Re-pointing Twilio inbound SMS webhook..." -ForegroundColor Cyan
    & npx tsx scripts/set-twilio-webhook.ts
    if ($LASTEXITCODE -ne 0) { Write-Warning "  Webhook setter exited with code $LASTEXITCODE" }
}

$cf = Get-Cloudflared
Write-Host ""
Write-Host "WholesaleOS - self-healing tunnel" -ForegroundColor Green
Write-Host "  cloudflared : $cf"
Write-Host "  project     : $projectDir"
Write-Host "  forwarding  : http://localhost:3000"
Write-Host ""

while ($true) {
    # Unique log files per attempt so a still-closing cloudflared can't lock them
    $stamp  = Get-Date -Format "yyyyMMdd-HHmmss-fff"
    $outLog = Join-Path $logDir "cf-$stamp.out.log"
    $errLog = Join-Path $logDir "cf-$stamp.err.log"

    Write-Host "[$(Get-Date -Format HH:mm:ss)] Starting tunnel..." -ForegroundColor Yellow
    $proc = Start-Process -FilePath $cf `
        -ArgumentList @("tunnel", "--url", "http://localhost:3000") `
        -RedirectStandardOutput $outLog -RedirectStandardError $errLog `
        -NoNewWindow -PassThru

    # Poll the logs for the assigned URL (up to ~40s)
    $url = $null
    for ($i = 0; $i -lt 80 -and -not $url; $i++) {
        Start-Sleep -Milliseconds 500
        $text = ""
        try { if (Test-Path $errLog) { $text += (Get-Content -Raw -Path $errLog -ErrorAction SilentlyContinue) } } catch {}
        try { if (Test-Path $outLog) { $text += (Get-Content -Raw -Path $outLog -ErrorAction SilentlyContinue) } } catch {}
        $m = [regex]::Match($text, 'https://[a-z0-9-]+\.trycloudflare\.com')
        if ($m.Success) { $url = $m.Value }
        if ($proc.HasExited) { break }
    }

    if ($url) {
        Write-Host "[$(Get-Date -Format HH:mm:ss)] Tunnel URL: $url" -ForegroundColor Green
        try {
            Update-EnvUrl $url
            Write-Host "  .env updated (PUBLIC_WEBHOOK_URL)" -ForegroundColor Gray
            Sync-Webhook
            Write-Host "[$(Get-Date -Format HH:mm:ss)] LIVE - seller replies now reach the app." -ForegroundColor Green
        } catch {
            Write-Warning "  Sync failed: $_"
        }
    } else {
        Write-Warning "[$(Get-Date -Format HH:mm:ss)] No tunnel URL detected. See $errLog"
    }

    # Keep the tunnel open; when it dies, loop to restart + re-sync the new URL.
    if (-not $proc.HasExited) { $proc.WaitForExit() }
    Write-Warning "[$(Get-Date -Format HH:mm:ss)] Tunnel exited - restarting in 5s..."
    Start-Sleep -Seconds 5
}
