@echo off
title Morse Code Workbench - Local Server
cd /d "%~dp0"
setlocal

set "NODE_BIN="
for /f "delims=" %%i in ('where node 2^>nul') do if not defined NODE_BIN set "NODE_BIN=%%i"
if not defined NODE_BIN if exist "C:\Program Files\nodejs\node.exe" set "NODE_BIN=C:\Program Files\nodejs\node.exe"
if not defined NODE_BIN if exist "C:\Users\38339\.workbuddy\binaries\node\versions\22.22.2-6\node.exe" set "NODE_BIN=C:\Users\38339\.workbuddy\binaries\node\versions\22.22.2-6\node.exe"

if not defined NODE_BIN (
  echo.
  echo  [ERROR] Node.js not found. Install Node.js, or edit NODE_BIN in this file.
  echo.
  pause
  exit /b 1
)

echo.
echo   ============================================================
echo    Morse Code Workbench  /  Chinese - English - Morse
echo   ============================================================
echo    App URL      : http://127.0.0.1:18760/
echo    Wallpaper URL: http://127.0.0.1:18760/?wallpaper=1
echo    Project file : %~dp0wallpaper-project\project.json
echo.
echo    Keep this window open while using the app or the wallpaper.
echo   ============================================================
echo.

start "" "http://127.0.0.1:18760/"
"%NODE_BIN%" server.js

echo.
echo  Server stopped.
pause
