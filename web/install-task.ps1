# 注册「策略助手 Web 服务」为计划任务：登录时自动启动
# 用法: powershell -ExecutionPolicy Bypass -File web\install-task.ps1
# 卸载: powershell -ExecutionPolicy Bypass -File web\install-task.ps1 -Remove

param([switch]$Remove)

$Name = "StrategyAssistantWeb"
$Here = Split-Path -Parent $MyInvocation.MyCommand.Path
$Cmd  = Join-Path $Here "run-server.cmd"

if ($Remove) {
    Unregister-ScheduledTask -TaskName $Name -Confirm:$false -ErrorAction SilentlyContinue
    Write-Host "已移除计划任务: $Name"
    exit 0
}

if (-not (Test-Path $Cmd)) { Write-Host "找不到 $Cmd"; exit 1 }

$action  = New-ScheduledTaskAction -Execute $Cmd -WorkingDirectory $Here
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit ([TimeSpan]::Zero)

Register-ScheduledTask -TaskName $Name -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null
Write-Host "已注册计划任务: $Name（登录时自动启动）"

Start-ScheduledTask -TaskName $Name
Write-Host "已启动该任务"
