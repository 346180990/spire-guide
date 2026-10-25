# 停止「策略助手」Web 服务
$conn = Get-NetTCPConnection -LocalPort 8090 -State Listen -ErrorAction SilentlyContinue
if ($conn) {
    $conn.OwningProcess | Select-Object -Unique | ForEach-Object { Stop-Process -Id $_ -Force }
    Write-Host "已停止 (端口 8090)"
} else {
    Write-Host "服务未在运行"
}
