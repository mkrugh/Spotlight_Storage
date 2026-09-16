@echo off
setlocal

:: Ensure execution from the repository directory
cd /d "%~dp0"

:: Determine Docker Compose command (support Compose V2 and V1)
docker compose version >nul 2>&1
if %ERRORLEVEL% equ 0 (
    set "COMPOSE_CMD=docker compose"
) else (
    set "COMPOSE_CMD=docker-compose"
)

:: Stop and remove the Docker container
echo [INFO] Stopping and removing Spotlight Storage container...
%COMPOSE_CMD% down

echo [SUCCESS] Spotlight Storage container has been stopped and removed.
echo (Your inventory data in data/, images/, and logs/ has been preserved.)
timeout /t 3 >nul
exit /b 0


