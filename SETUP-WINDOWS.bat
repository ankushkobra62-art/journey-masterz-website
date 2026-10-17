@echo off
setlocal
cd /d "%~dp0"
title Journey Masterz - First Time Setup
echo =====================================================
echo       JOURNEY MASTERZ WEBSITE - FIRST TIME SETUP
echo =====================================================
echo.
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed or Windows cannot find it.
  echo Please install the LTS version from:
  echo https://nodejs.org/en/download
  echo Then close and reopen this window and run this file again.
  echo.
  pause
  exit /b 1
)
where npm >nul 2>nul
if errorlevel 1 (
  echo npm was not found. Reinstall Node.js LTS and try again.
  pause
  exit /b 1
)
echo Node.js version:
node -v
echo.
if not exist ".env" (
  echo Creating your private settings file from .env.example...
  copy ".env.example" ".env" >nul
  echo.
  echo A Notepad window will open. Replace the example admin email,
  echo admin password, and session secret. Save and close Notepad.
  echo IMPORTANT: Keep .env private. Never send it to anyone.
  notepad ".env"
) else (
  echo A .env file already exists. Leaving it unchanged.
)
echo.
echo Installing website packages. This may take a few minutes...
call npm install --no-audit --no-fund
if errorlevel 1 (
  echo.
  echo Installation did not finish. Read FIXES-AND-INSTALL-GUIDE.md
  echo and copy the final error lines if you need help.
  pause
  exit /b 1
)
echo.
echo Setup complete. Next, double-click START-WEBSITE.bat.
pause
