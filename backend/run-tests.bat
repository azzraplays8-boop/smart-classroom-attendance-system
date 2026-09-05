@echo off
cd /d "c:\Users\Ronel Pesalbon\(VS CODE)\smart-classroom-attendance-system\backend"
set PORT=5050
set JWT_SECRET=test-secret-key-for-testing
set DB_HOST=localhost
set DB_PORT=3306
set DB_USER=root
set DB_PASSWORD=21RONfoewbo@38124
set DB_NAME=smart_attendance
set CORS_ORIGIN=http://localhost:5173,http://127.0.0.1:5173
echo Starting server...
node src/server.js 2>&1



