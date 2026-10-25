<#
  把本仓库同步到 VPS 并重启策略助手服务。

  用法（在仓库根目录或任意目录）：
    powershell -File deploy\deploy.ps1 -Server 1.2.3.4
    powershell -File deploy\deploy.ps1 -Server 1.2.3.4 -User ubuntu -SshPort 22
    powershell -File deploy\deploy.ps1 -Server 1.2.3.4 -FirstTime   # 第一次：同时装服务

  前提：
    - Windows 10/11 自带 OpenSSH 客户端（ssh / scp / tar 都在 PATH 里）
    - 已经能 ssh 免密登录（ssh-copy-id，或在云控制台配好密钥）
    - 服务器上代码目录默认 /opt/simplejiaoyi

  只传「运行需要的东西」：web/ + strategy-miniprogram/{core,cloudfunctions/market-bars} + deploy/
  （cloudfunctions/market-bars 是行情抓取的实现，漏了会一直回退到内置样例）
  web/data（行情缓存、回测记录、state.json）不会被覆盖。
#>
param(
  [Parameter(Mandatory = $true)][string]$Server,
  [string]$User = 'root',
  [int]$SshPort = 22,
  [string]$Remote = '/opt/simplejiaoyi',
  [string]$Service = 'strategy-web',
  [switch]$FirstTime
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$pkg = Join-Path $env:TEMP ('sj-deploy-' + [guid]::NewGuid().ToString('N').Substring(0, 8) + '.tgz')

foreach ($exe in 'tar', 'scp', 'ssh') {
  if (-not (Get-Command $exe -ErrorAction SilentlyContinue)) {
    throw "找不到 $exe。Windows 10/11 应在 PATH 里；可装 OpenSSH 客户端后重试。"
  }
}

Write-Host "[1/4] 打包 $root" -ForegroundColor Cyan
& tar -czf $pkg -C $root `
  --exclude 'web/data' `
  --exclude 'web/config.json' `
  web strategy-miniprogram/core strategy-miniprogram/cloudfunctions/market-bars deploy README.md
if ($LASTEXITCODE -ne 0) { throw 'tar 打包失败' }
$size = [math]::Round((Get-Item $pkg).Length / 1MB, 2)
Write-Host "      $size MB" -ForegroundColor DarkGray

$target = "$User@$Server"
# 非 root 登录时（腾讯云 Ubuntu 默认 ubuntu 用户）远端命令要 sudo
$sudo = if ($User -eq 'root') { '' } else { 'sudo ' }
Write-Host "[2/4] 上传到 $target" -ForegroundColor Cyan
& scp -P $SshPort $pkg "${target}:/tmp/sj-deploy.tgz"
if ($LASTEXITCODE -ne 0) { throw 'scp 上传失败（检查 IP / 端口 / 免密登录）' }

Write-Host "[3/4] 远端解包" -ForegroundColor Cyan
$unpack = "mkdir -p $Remote && tar xzf /tmp/sj-deploy.tgz -C $Remote && rm -f /tmp/sj-deploy.tgz"
& ssh -p $SshPort $target $unpack
if ($LASTEXITCODE -ne 0) { throw '远端解包失败' }

if ($FirstTime) {
  Write-Host "[4/4] 首次安装（依赖 + 建用户 + systemd + 启动）" -ForegroundColor Cyan
  & ssh -p $SshPort $target "${sudo}bash $Remote/deploy/bootstrap.sh"
  if ($LASTEXITCODE -ne 0) { throw 'bootstrap.sh 失败，看上面的输出' }
} else {
  Write-Host "[4/4] 重启服务" -ForegroundColor Cyan
  & ssh -p $SshPort $target "${sudo}systemctl restart $Service && sleep 1 && systemctl is-active $Service && curl -s -o /dev/null -w 'health=%{http_code}\n' http://127.0.0.1:8090/api/health"
  if ($LASTEXITCODE -ne 0) { throw '重启失败，看 journalctl -u strategy-web -n 50' }
}

Remove-Item $pkg -Force -ErrorAction SilentlyContinue
Write-Host ""
Write-Host "完成 → http://${Server}:8090/?token=<服务器 /etc/strategy-web.env 里的 SA_TOKEN>" -ForegroundColor Green
