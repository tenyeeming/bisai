@echo off
chcp 65001 > nul
cd /d "%~dp0"

rem 這支是「備案」，平常不需要 —— 直接雙擊 acunavi-ideal.html 就能開。
rem 只有在 file:// 下相機出問題時才用它（起一個本機伺服器再開）。

where python > nul 2>nul
if errorlevel 1 (
  echo.
  echo   找不到 python。請先安裝 Python，或改用其他本機伺服器。
  echo.
  pause
  exit /b 1
)

echo.
echo   AcuNavi demo 啟動中...
echo   網址： http://localhost:8000/acunavi-ideal.html
echo.
echo   ^>^> 關掉這個視窗就會停止伺服器 ^<^<
echo.

rem 等伺服器綁好 port 再開瀏覽器，否則會先看到連線失敗
start "" powershell -NoProfile -Command "Start-Sleep -Seconds 2; Start-Process 'http://localhost:8000/acunavi-ideal.html'"

python -m http.server 8000
