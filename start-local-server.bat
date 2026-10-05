@echo off
title Biotex Life - local server
cd /d "%~dp0"
echo Starting Biotex Life at http://localhost:8080 ...
where python >nul 2>nul
if %errorlevel%==0 (
  start "" http://localhost:8080/index.html
  python -m http.server 8080
  goto :eof
)
where node >nul 2>nul
if %errorlevel%==0 (
  start "" http://localhost:8080/index.html
  npx --yes serve -l 8080 .
  goto :eof
)
echo Neither Python nor Node.js was found. Double-click index.html instead.
pause
