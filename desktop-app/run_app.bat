@echo off
title NOVOTEK Pick-to-Light Prototype
cd /d "%~dp0"
if not exist node_modules (
  echo Installing desktop app dependencies...
  call npm install
  if errorlevel 1 (
    echo.
    echo npm install failed. Make sure Node.js is installed and Internet access is available.
    pause
    exit /b 1
  )
)
call npm start
