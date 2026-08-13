@echo off
cd /d "c:\Users\Ronel Pesalbon\(VS CODE)\backend"
set JWT_SECRET=test-secret-key-for-testing
node --test test/attendance-history-route.test.js test/attendance-management-route.test.js test/attendance-route.test.js test/dashboard-route.test.js test/students-photo-route.test.js 2>&1
