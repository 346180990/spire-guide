# 构建鸿蒙 HAP（无需打开 DevEco Studio）
# 用法:  powershell -ExecutionPolicy Bypass -File scripts\build.ps1
$ErrorActionPreference = 'Continue'

$deveco = 'D:\software\DevEco Studio'
$env:DEVECO_SDK_HOME = Join-Path $deveco 'sdk'
$env:PATH = (Join-Path $deveco 'tools\node') + ';' + (Join-Path $deveco 'tools\ohpm\bin') + ';' + $env:PATH

$root = Split-Path -Parent $PSScriptRoot
Push-Location (Join-Path $root 'harmony')
try {
    & (Join-Path $deveco 'tools\hvigor\bin\hvigorw.bat') assembleHap --mode module -p product=default -p buildMode=debug --no-daemon 2>&1 |
        Out-String -Width 250
    Write-Host ''
    Write-Host '=== HAP 产物 ==='
    Get-ChildItem -Recurse -Filter *.hap -ErrorAction SilentlyContinue |
        Select-Object @{n = 'Path'; e = { $_.FullName } }, @{n = 'MB'; e = { [math]::Round($_.Length / 1MB, 2) } } |
        Format-Table -AutoSize
}
finally {
    Pop-Location
}
