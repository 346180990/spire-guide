# 启动「策略助手」Web 服务（后台常驻，关掉终端也不停）
# 用法: 右键「使用 PowerShell 运行」，或 powershell -File web\start.ps1

$ErrorActionPreference = "Continue"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$logDir = Join-Path $here "data"
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir | Out-Null }
$outLog = Join-Path $logDir "server.out.log"
$errLog = Join-Path $logDir "server.err.log"

# 已在运行就不重复启动
try {
    $r = Invoke-WebRequest -Uri "http://127.0.0.1:8090/api/health" -TimeoutSec 2 -UseBasicParsing
    if ($r.StatusCode -eq 200) {
        Write-Host "服务已在运行: http://127.0.0.1:8090"
        exit 0
    }
} catch { }

$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) { Write-Host "找不到 node，请先安装 Node.js"; exit 1 }

Start-Process -FilePath $node -ArgumentList "server.mjs" -WorkingDirectory $here `
    -WindowStyle Hidden -RedirectStandardOutput $outLog -RedirectStandardError $errLog

Start-Sleep -Seconds 3
try {
    $r = Invoke-WebRequest -Uri "http://127.0.0.1:8090/api/health" -TimeoutSec 5 -UseBasicParsing
    Write-Host "已启动: http://127.0.0.1:8090"
    Write-Host "日志:   $outLog"
} catch {
    Write-Host "启动失败，请查看: $errLog"
    if (Test-Path $errLog) { Get-Content $errLog -Tail 20 }
}
