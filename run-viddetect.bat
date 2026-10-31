@echo off
cd /d "%~dp0"
if not exist "node_modules" (
  echo Installing dependencies (first time only)...
  call npm install
)
if not exist "client\dist\index.html" (
  echo Building frontend...
  pushd client
  call npm install
  call npm run build
  popd
)
echo.
echo Starting viddetect on http://localhost:3001
start "viddetect" cmd /c "node server.js"
timeout /t 3 /nobreak >nul
start "" "http://localhost:3001"
