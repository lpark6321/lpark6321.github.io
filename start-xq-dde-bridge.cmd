@echo off
cd /d "%~dp0"
echo Starting XQ DDE bridge on http://127.0.0.1:8788
echo Keep XQ running and keep this window open while testing the dashboard.
echo If another old DDE bridge window is already open, close it first.
echo.
set "POWERSHELL32=%SystemRoot%\SysWOW64\WindowsPowerShell\v1.0\powershell.exe"
if exist "%POWERSHELL32%" (
  echo Using 32-bit PowerShell for 32-bit XQ DDE.
  "%POWERSHELL32%" -Sta -NoProfile -ExecutionPolicy Bypass -File services\xqDdeBridge.ps1
) else (
  echo 32-bit PowerShell not found. Falling back to default PowerShell.
  powershell -Sta -NoProfile -ExecutionPolicy Bypass -File services\xqDdeBridge.ps1
)
pause
