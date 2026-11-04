@echo off
setlocal
cd /d "%~dp0"

rem Usage: GIO.cmd [yahoo] [web] [kgi] [taishin]
rem No arguments = yahoo web. The DDE bridges (kgi, taishin) are reserved; start them by name.
set "PARTS=%*"
if not defined PARTS set "PARTS=yahoo web"

rem 32-bit PowerShell first: XQ and Taishin expose 32-bit DDE.
set "PS=%SystemRoot%\SysWOW64\WindowsPowerShell\v1.0\powershell.exe"
if not exist "%PS%" set "PS=powershell"
set "BRIDGE=-NoExit -Sta -NoProfile -ExecutionPolicy Bypass -File bridges\xqDdeBridge.ps1"

echo Close older dashboard/bridge windows first; a second copy fails with "port in use".
for %%P in (%PARTS%) do call :%%P 2>nul || echo Unknown part "%%P". Usage: %~nx0 [yahoo] [web] [kgi] [taishin]
echo.
echo Done. Keep the opened windows running while using the dashboard.
pause
exit /b

:yahoo
rem The proxy uses FINMIND_TOKEN only if it is already set in the environment.
start "Dashboard Yahoo Proxy :8787" cmd /k node bridges\yahooProxyServer.js
exit /b 0

:web
rem "python -c" instead of "where python": the Microsoft Store stub is found by where but cannot run.
python -c "" >nul 2>nul
if errorlevel 1 (
  echo Python not found. Using npx http-server instead.
  start "Dashboard Web :8000" cmd /k npx --yes http-server -p 8000 -a 127.0.0.1 -c-1
) else (
  start "Dashboard Web :8000" cmd /k python -m http.server 8000 --bind 127.0.0.1
)
rem Give the web server a moment before opening the browser.
timeout /t 2 /nobreak >nul
start "" "http://127.0.0.1:8000/index_hide.html"
exit /b 0

:kgi
echo KGI DDE :8788 - keep XQ running.
start "Dashboard KGI DDE Bridge :8788" "%PS%" %BRIDGE%
exit /b 0

:taishin
echo Taishin DDE :8790 - keep Taishin quote software running.
start "Dashboard Taishin DDE Bridge :8790" "%PS%" %BRIDGE% -Port 8790 -Service MMSDDE -Topic FUSA -SpotTopic TWSE -Provider Taishin -DayFuturesRoot "WTX&" -AfterHoursFuturesRoot "WTX&" -SpotRoot "#001"
exit /b 0
