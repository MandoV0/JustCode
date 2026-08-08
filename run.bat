@echo off

start "Frontend" cmd /k "cd /d src && npm run dev"
start "Desktop" cmd /k "cd /d JustCode.Desktop && dotnet run"