@echo off
title DineFlow
where node >nul 2>nul || (echo Node.js 20+ is required. Opening download page... & start https://nodejs.org & pause & exit /b)
cd /d "%~dp0"
node launcher.mjs %*
pause
