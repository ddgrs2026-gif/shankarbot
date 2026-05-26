@echo off
echo Starting DDGRS System...

echo.
echo [1/3] Starting WhatsApp Bot on port 3001...
start "DDGRS Bot" cmd /k "cd /d %~dp0 && node bot-twilio.js"

echo [2/3] Starting Admin Panel on port 5173...
start "DDGRS Admin" cmd /k "cd /d %~dp0admin-panel && npm run dev"

echo [3/3] Starting ngrok tunnel...
start "DDGRS ngrok" cmd /k "ngrok http 3001"

echo.
echo All services started!
echo Bot:        http://localhost:3001
echo Admin:      http://localhost:5173
echo ngrok UI:   http://localhost:4040
echo.
pause
