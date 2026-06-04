# WholesaleOS — Install Windows Scheduled Task
# Run once as Administrator to auto-start the cron on every login.
# Usage:  powershell -ExecutionPolicy Bypass -File scripts\install-cron-task.ps1

$taskName   = "WholesaleOS Cron"
$projectDir = Split-Path -Parent $PSScriptRoot   # repo root (parent of scripts/)
# NB: Windows PowerShell 5.1 has no ?. operator — resolve node path the long way.
$nodeCmd    = Get-Command node -ErrorAction SilentlyContinue
$nodeExe    = if ($nodeCmd) { $nodeCmd.Source } else { $null }

if (-not $nodeExe) {
    Write-Error "node.exe not found in PATH. Install Node.js first."
    exit 1
}

Write-Host ""
Write-Host "Installing WholesaleOS Cron Task..." -ForegroundColor Cyan
Write-Host "  Project : $projectDir"
Write-Host "  Node    : $nodeExe"
Write-Host ""

$action = New-ScheduledTaskAction `
    -Execute    $nodeExe `
    -Argument   "scripts\run-cron.mjs" `
    -WorkingDirectory $projectDir

# Trigger: at logon, 1-minute delay so MAMP / Postgres can start first
$trigger  = New-ScheduledTaskTrigger -AtLogOn
$trigger.Delay = "PT1M"   # ISO 8601: 1 minute

# Settings: no timeout, restart up to 3 times on failure, run whether or not user is logged on
$settings = New-ScheduledTaskSettingsSet `
    -ExecutionTimeLimit    (New-TimeSpan -Hours 0) `
    -RestartCount          3 `
    -RestartInterval       (New-TimeSpan -Minutes 5) `
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

    Write-Host "✅  Task '$taskName' registered!" -ForegroundColor Green
    Write-Host ""
    Write-Host "The cron will now start automatically 1 minute after you log in."
    Write-Host "It runs the daily 8am scan + hourly SMS drip forever in the background."
    Write-Host ""
    Write-Host "To manage the task:"
    Write-Host "  View   : taskschd.msc  (Task Scheduler)"
    Write-Host "  Remove : schtasks /delete /tn `"WholesaleOS Cron`" /f"
    Write-Host ""
} catch {
    Write-Error "Failed to register task: $_"
    Write-Host ""
    Write-Host "Try running this script as Administrator (right-click > Run as administrator)."
    exit 1
}
