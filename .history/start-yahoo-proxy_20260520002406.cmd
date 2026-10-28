@echo off
cd /d "%~dp0"
echo Starting Yahoo proxy on http://127.0.0.1:8787
echo Keep this window open while testing the dashboard.
node services\yahooProxyServer.js
pause
