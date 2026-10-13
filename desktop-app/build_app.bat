@echo off
title Build NOVOTEK Pick-to-Light App
cd /d "%~dp0"
if not exist node_modules (
  echo Installing dependencies...
  call npm install
  if errorlevel 1 (
    pause
    exit /b 1
  )
)
call npm run build
echo.
echo The portable Windows app will be in the dist folder.
pause
