# DineFlow data node — Windows install (0173). Run in PowerShell from the folder that holds dineflow-data-node.mjs and .env:
#   powershell -ExecutionPolicy Bypass -File .\install-windows.ps1
# It checks Node 20+, tests the connection, and registers a scheduled task that starts the node at sign-in and keeps it running.
$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) { Write-Host "Node.js is not installed. Get it from https://nodejs.org (LTS), then run this again." -ForegroundColor Red; exit 1 }
$v = [int]((& $node -v) -replace '^v(\d+).*', '$1')
if ($v -lt 20) { Write-Host "Node.js $v is too old — install the LTS (20 or newer) from https://nodejs.org" -ForegroundColor Red; exit 1 }
if (-not (Test-Path (Join-Path $here ".env"))) { Write-Host "No .env beside this script. Paste the one Master control showed when you added the server." -ForegroundColor Red; exit 1 }
Write-Host "Testing the connection..."
& $node (Join-Path $here "dineflow-data-node.mjs") --check
if ($LASTEXITCODE -ne 0) { exit 1 }
$task = "DineFlow data node"
$action = New-ScheduledTaskAction -Execute $node -Argument "`"$(Join-Path $here 'dineflow-data-node.mjs')`"" -WorkingDirectory $here
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit (New-TimeSpan -Days 3650) -StartWhenAvailable -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName $task -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null
Start-ScheduledTask -TaskName $task
Write-Host "Done. '$task' starts at every sign-in and is running now. Log: $(Join-Path $here 'dineflow-backups\node.log')" -ForegroundColor Green
Write-Host "To stop it: Unregister-ScheduledTask -TaskName '$task' -Confirm:`$false"
