@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required. Install Node.js 22.12 or newer from https://nodejs.org
  pause
  exit /b 1
)
node scripts\serve.mjs --open
if errorlevel 1 pause
