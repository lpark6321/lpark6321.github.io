@echo off
cd /d "%~dp0"

echo Starting dashboard market data bridges
echo.
echo Yahoo proxy:  http://127.0.0.1:8787
echo KGI DDE:      http://127.0.0.1:8788
echo KGI RTD:      http://127.0.0.1:8789 ^(starts when services\xqRtdBridge.ps1 exists^)
echo Taishin DDE:  http://127.0.0.1:8790 ^(start with start-taishin-dde-bridge.cmd when needed^)
echo.
echo Close any older bridge windows before continuing, especially old KGI DDE windows on port 8788.
echo.

set "FINMIND_TOKEN="
set /p FINMIND_TOKEN=Paste FinMind token, or press Enter to skip: 
echo.

set "POWERSHELL32=%SystemRoot%\SysWOW64\WindowsPowerShell\v1.0\powershell.exe"

start "Dashboard Yahoo Proxy :8787" /D "%~dp0" cmd /k node services\yahooProxyServer.js
if exist "%POWERSHELL32%" (
  start "Dashboard KGI DDE Bridge :8788" /D "%~dp0" cmd /k ""%POWERSHELL32%" -Sta -NoProfile -ExecutionPolicy Bypass -File services\xqDdeBridge.ps1"
) else (
  start "Dashboard KGI DDE Bridge :8788" /D "%~dp0" cmd /k powershell -Sta -NoProfile -ExecutionPolicy Bypass -File services\xqDdeBridge.ps1
)

if exist "services\xqRtdBridge.ps1" (
  start "Dashboard KGI RTD Bridge :8789" /D "%~dp0" cmd /k powershell -NoProfile -ExecutionPolicy Bypass -File services\xqRtdBridge.ps1
) else (
  echo KGI RTD bridge is not implemented yet. The KGI RTD option is already reserved in the dashboard.
)

if exist "%POWERSHELL32%" (
  start "Dashboard Taishin DDE Bridge :8790" /D "%~dp0" cmd /k ""%POWERSHELL32%" -Sta -NoProfile -ExecutionPolicy Bypass -File services\xqDdeBridge.ps1 -Port 8790 -Service MMSDDE -Topic FUSA -SpotTopic TWSE -Provider Taishin -DayFuturesRoot "WTX^&" -AfterHoursFuturesRoot "WTX^&" -SpotRoot "#001""
) else (
  start "Dashboard Taishin DDE Bridge :8790" /D "%~dp0" cmd /k powershell -Sta -NoProfile -ExecutionPolicy Bypass -File services\xqDdeBridge.ps1 -Port 8790 -Service MMSDDE -Topic FUSA -SpotTopic TWSE -Provider Taishin -DayFuturesRoot "WTX^&" -AfterHoursFuturesRoot "WTX^&" -SpotRoot "#001"
)

echo.
echo Bridges started. Keep the opened windows running while using the dashboard.
pause
