@echo off
cd /d C:\Project\viddetect
echo Installing dependencies (first time only)...
call npm install
echo.
echo Building frontend...
cd client
call npm install
call npm run build
cd ..
echo.
echo Starting viddetect...
start "viddetect" cmd /c "node server.js"
timeout /t 3 /nobreak >nul
start "" "http://localhost:3001"
echo.
echo viddetect is running at http://localhost:3001
echo.
pause
