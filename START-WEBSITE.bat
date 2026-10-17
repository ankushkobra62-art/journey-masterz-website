@echo off
setlocal
cd /d "%~dp0"
title Journey Masterz Website
echo Starting Journey Masterz...
if not exist ".env" (
  echo .env is missing. Please double-click SETUP-WINDOWS.bat first.
  pause
  exit /b 1
)
if not exist "node_modules" (
  echo Website packages are missing. Running npm install...
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo Installation failed. Read FIXES-AND-INSTALL-GUIDE.md.
    pause
    exit /b 1
  )
)
echo.
echo When the server says it is running, open:
echo http://localhost:3000
echo.
echo Keep this window open while using the website.
echo Press Ctrl+C to stop the server.
echo.
call npm start
echo.
echo The website server has stopped.
pause
