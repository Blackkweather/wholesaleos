# WholesaleOS — Cloudflare Tunnel Setup
# Creates a permanent free public URL for Twilio + Vapi webhooks.
# Run once. Paste the URL into .env as PUBLIC_WEBHOOK_URL.
#
# Usage: powershell -ExecutionPolicy Bypass -File scripts\setup-tunnel.ps1

Write-Host ""
Write-Host "WholesaleOS — Cloudflare Tunnel Setup" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

# Repo root (parent of scripts/) — needed for the local cloudflared path
$projectDir = Split-Path -Parent $PSScriptRoot

# Check if cloudflared is installed — prefer local exe first
$localExe = Join-Path $projectDir "cloudflared.exe"
$cf = $null
if (Test-Path $localExe) {
    $cf = $localExe
} else {
    $cfCmd = Get-Command cloudflared -ErrorAction SilentlyContinue
    if ($cfCmd) { $cf = $cfCmd.Source }
}

if (-not $cf) {
    Write-Host "Downloading cloudflared..." -ForegroundColor Yellow
    $dlUrl = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe"
    Invoke-WebRequest -Uri $dlUrl -OutFile $localExe -UseBasicParsing
    $cf = $localExe
}

Write-Host "cloudflared found: $cf" -ForegroundColor Green
Write-Host ""
Write-Host "Starting tunnel to http://localhost:3000 ..." -ForegroundColor Yellow
Write-Host ""
Write-Host "When the URL appears (https://xxxx.trycloudflare.com):" -ForegroundColor White
Write-Host "  1. Copy it"
Write-Host "  2. Paste into .env:  PUBLIC_WEBHOOK_URL=`"https://xxxx.trycloudflare.com`""
Write-Host "  3. In Twilio Console: Phone Numbers → Messaging → Webhook URL:"
Write-Host "       https://xxxx.trycloudflare.com/api/webhooks/sms-inbound"
Write-Host "  4. In Vapi Dashboard: set server URL to:"
Write-Host "       https://xxxx.trycloudflare.com/api/webhooks/vapi"
Write-Host ""
Write-Host "Press Ctrl+C to stop the tunnel." -ForegroundColor Gray
Write-Host ""

# Start the tunnel (this blocks until Ctrl+C)
& $cf tunnel --url http://localhost:3000
