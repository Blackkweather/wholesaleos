# WholesaleOS — Install the self-healing tunnel as a Windows Scheduled Task.
# Run once. After this, every time you log in the tunnel comes up and re-points
# the Twilio webhook to its new URL automatically.
# Usage: powershell -ExecutionPolicy Bypass -File scripts\install-tunnel-task.ps1

$taskName   = "WholesaleOS Tunnel"
$projectDir = Split-Path -Parent $PSScriptRoot
$scriptPath = Join-Path $projectDir "scripts\start-tunnel-autosync.ps1"
$psExe      = (Get-Command powershell.exe -ErrorAction SilentlyContinue).Source
if (-not $psExe) { $psExe = "powershell.exe" }

Write-Host ""
Write-Host "Installing WholesaleOS Tunnel Task..." -ForegroundColor Cyan
Write-Host "  Project : $projectDir"
Write-Host "  Script  : $scriptPath"
Write-Host ""

$action = New-ScheduledTaskAction `
    -Execute   $psExe `
    -Argument  "-ExecutionPolicy Bypass -NoProfile -WindowStyle Hidden -File `"$scriptPath`"" `
    -WorkingDirectory $projectDir

# At logon, after a 90s delay so the app server (and cron) are up first
$trigger = New-ScheduledTaskTrigger -AtLogOn
$trigger.Delay = "PT90S"

$settings = New-ScheduledTaskSettingsSet `
    -ExecutionTimeLimit (New-TimeSpan -Hours 0) `
    -RestartCount       3 `
    -RestartInterval    (New-TimeSpan -Minutes 2) `
    -StartWhenAvailable

try {
    Register-ScheduledTask `
        -TaskName $taskName `
        -Action   $action `
        -Trigger  $trigger `
        -Settings $settings `
        -RunLevel Highest `
        -Force `
        -ErrorAction Stop | Out-Null

    Write-Host "OK  Task '$taskName' registered." -ForegroundColor Green
    Write-Host ""
    Write-Host "On every login the tunnel starts, writes its URL into .env, and"
    Write-Host "re-points the Twilio inbound-SMS webhook automatically."
    Write-Host ""
    Write-Host "  View   : taskschd.msc"
    Write-Host "  Remove : schtasks /delete /tn `"$taskName`" /f"
    Write-Host ""
} catch {
    Write-Error "Failed to register task: $_"
    Write-Host "Try running as Administrator." -ForegroundColor Yellow
    exit 1
}
