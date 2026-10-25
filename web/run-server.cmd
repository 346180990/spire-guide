@echo off
rem 由 Windows 计划任务调用：后台启动策略助手 Web 服务
cd /d "%~dp0"
if not exist "data" mkdir "data"
node "%~dp0server.mjs" >> "%~dp0data\server.out.log" 2>> "%~dp0data\server.err.log"
