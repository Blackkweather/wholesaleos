# WholesaleOS — Install Production App Server as Windows Scheduled Task
# Run once after `npm run build` to auto-start the app on every login.
# Usage:  powershell -ExecutionPolicy Bypass -File scripts\install-app-task.ps1

$taskName   = "WholesaleOS App"
$projectDir = Split-Path -Parent $PSScriptRoot
# NB: Windows PowerShell 5.1 has no ?. operator — resolve npm path the long way.
$npmCmd     = Get-Command npm -ErrorAction SilentlyContinue
$npmExe     = if ($npmCmd) { $npmCmd.Source } else { $null }

if (-not $npmExe) {
    Write-Error "npm not found in PATH. Install Node.js first."
    exit 1
}

# Verify the app has been built
if (-not (Test-Path (Join-Path $projectDir ".next"))) {
    Write-Host ""
    Write-Host "⚠️  App not built yet. Running 'npm run build' first..." -ForegroundColor Yellow
    Write-Host ""
    Push-Location $projectDir
    & $npmExe run build
    Pop-Location
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Build failed. Fix errors then re-run this script."
        exit 1
    }
}

Write-Host ""
Write-Host "Installing WholesaleOS App Task..." -ForegroundColor Cyan
Write-Host "  Project : $projectDir"
Write-Host "  npm     : $npmExe"
Write-Host ""

$action = New-ScheduledTaskAction `
    -Execute    $npmExe `
    -Argument   "run start" `
    -WorkingDirectory $projectDir

# Start at logon with 30-second delay (after MAMP/Postgres/network are ready)
$trigger  = New-ScheduledTaskTrigger -AtLogOn
$trigger.Delay = "PT30S"

$settings = New-ScheduledTaskSettingsSet `
    -ExecutionTimeLimit    (New-TimeSpan -Hours 0) `
    -RestartCount          3 `
    -RestartInterval       (New-TimeSpan -Minutes 2) `
    -StartWhenAvailable

try {
    Register-ScheduledTask `
        -TaskName  $taskName `
        -Action    $action `
        -Trigger   $trigger `
        -Settings  $settings `
        -RunLevel  Highest `
        -Force `
        -ErrorAction Stop | Out-Null

    Write-Host "OK  Task '$taskName' registered!" -ForegroundColor Green
    Write-Host ""
    Write-Host "The production app server will now auto-start on every login."
    Write-Host "Access it at: http://localhost:3000"
    Write-Host ""
    Write-Host "Boot order (all automatic after this):"
    Write-Host "  1. Windows login"
    Write-Host "  2. MAMP starts (manual or via its own startup)"
    Write-Host "  3. WholesaleOS App starts  (+30s)"
    Write-Host "  4. WholesaleOS Cron starts (+60s)"
    Write-Host ""
    Write-Host "To uninstall: schtasks /delete /tn `"WholesaleOS App`" /f"
} catch {
    Write-Error "Failed: $_"
    Write-Host "Try running as Administrator."
    exit 1
}
