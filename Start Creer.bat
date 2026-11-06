@echo off
title Creer
cd /d "%~dp0"
if not exist node_modules (
  echo Installing Creer's local dependencies...
  call npm install
)
echo Starting Creer...
call npm run dev -- --open
pause
