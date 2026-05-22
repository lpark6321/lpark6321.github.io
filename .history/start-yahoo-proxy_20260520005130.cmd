@echo off
cd /d "%~dp0"
echo Starting Yahoo proxy on http://127.0.0.1:8787
echo Keep this window open while testing the dashboard.
$env:FINMIND_TOKEN="eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJ1c2VyX2lkIjoibHBhcms2MzIxIiwiZW1haWwiOiJscGFyazYzMjFAZ21haWwuY29tIiwidG9rZW5fdmVyc2lvbiI6MH0._7CEAPI_a_rEESj9ADhWfVXLChcp6Z4XKhsIgYvdagY"
node services\yahooProxyServer.js
pause
