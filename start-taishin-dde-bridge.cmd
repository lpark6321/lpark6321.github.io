@echo off
cd /d "%~dp0"
echo Starting Taishin DDE bridge on http://127.0.0.1:8790
echo Keep Taishin quote software running and keep this window open while testing the dashboard.
echo.
echo Service=MMSDDE, futures Topic=FUSA, futures root=WTX^&
echo Spot Topic=TWSE, spot root=#001, spot price=#001.2020
echo Current field map uses items such as WTX^&.125 for traded price.
echo.
set "POWERSHELL32=%SystemRoot%\SysWOW64\WindowsPowerShell\v1.0\powershell.exe"
if exist "%POWERSHELL32%" (
  echo Using 32-bit PowerShell for 32-bit DDE.
  "%POWERSHELL32%" -Sta -NoProfile -ExecutionPolicy Bypass -File services\xqDdeBridge.ps1 -Port 8790 -Service MMSDDE -Topic FUSA -SpotTopic TWSE -Provider Taishin -DayFuturesRoot "WTX&" -AfterHoursFuturesRoot "WTX&" -SpotRoot "#001"
) else (
  echo 32-bit PowerShell not found. Falling back to default PowerShell.
  powershell -Sta -NoProfile -ExecutionPolicy Bypass -File services\xqDdeBridge.ps1 -Port 8790 -Service MMSDDE -Topic FUSA -SpotTopic TWSE -Provider Taishin -DayFuturesRoot "WTX&" -AfterHoursFuturesRoot "WTX&" -SpotRoot "#001"
)
pause
