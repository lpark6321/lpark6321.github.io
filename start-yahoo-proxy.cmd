@echo off
cd /d "%~dp0"
echo Starting Yahoo proxy on http://127.0.0.1:8787
echo Keep this window open while testing the dashboard.
echo.
set "FINMIND_TOKEN="
set /p FINMIND_TOKEN=Paste FinMind token, or press Enter to skip: 
echo.
node services\yahooProxyServer.js
pause
