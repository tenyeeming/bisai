@echo off
chcp 65001 > nul
cd /d "%~dp0"

rem 小海量測頁要用本機伺服器開（MediaPipe 不能用 file:// 開）。雙擊這支就好。

where python > nul 2>nul
if errorlevel 1 (
  echo.
  echo   找不到 python。請先安裝 Python，或改用其他本機伺服器。
  echo.
  pause
  exit /b 1
)

echo.
echo   小海量測頁 啟動中...
echo   網址： http://localhost:8000/forearm-measure.html
echo.
echo   ^>^> 關掉這個視窗就會停止伺服器 ^<^<
echo.

rem 等伺服器綁好 port 再開瀏覽器，否則會先看到連線失敗
start "" powershell -NoProfile -Command "Start-Sleep -Seconds 2; Start-Process 'http://localhost:8000/forearm-measure.html'"

python -m http.server 8000
