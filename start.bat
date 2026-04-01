@echo off

REM Auto-elevate to Administrator
net session >nul 2>&1
if %errorlevel% neq 0 (
  echo Requesting Administrator privileges...
  powershell -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

cd /d "%~dp0"
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3004 ^| findstr LISTENING') do taskkill /f /pid %%a 2>nul
if not exist node_modules (npm install)
title Scout Block Check
node server.js
pause
